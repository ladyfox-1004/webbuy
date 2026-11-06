// 페이앱(PayApp) 연동 공통 — 문의 댓글 릴스 판매(설계서 2026-11-06-reference-reel-ad-landing-design.md 5절).
// 출처: 빌드넷 supabase/functions/_shared/payapp.ts (10/28 실결제 통과본) 에서 단건 결제 부분만 복사.
//   정기결제(rebillRegist·결제일·기간 끝) 부분은 뺐고, payRequestParams 의 var2 를 인자로 바꿨다. 나머지는 원본 그대로.
// - 호출: https://api.payapp.kr/oapi/v2, POST, application/x-www-form-urlencoded, UTF-8, 응답은 KEY=VALUE(state=1 성공)
// - 요청 hash  = sha256(userid + requestdate + requestkey), requestdate 는 한국 시간 14자리
// - 통보 hash  = sha256(userid + responsedate + requestkey), linkkey·linkval·userid 도 비교
// - 비밀값(linkkey·linkval·requestkey)은 로그·DB 에 남기지 않는다. 요청에는 requestkey 대신 계산한 hash 만 보낸다.
// 순수 함수 + 주입 가능한 fetch 만 쓴다(시험은 가짜 fetch 로, 실제 페이앱 호출 없음).

export const PAYAPP_API_URL = "https://api.payapp.kr/oapi/v2";
export const PAYAPP_TIMEOUT_MS = 30_000;
export const SECRET_NAMES = [
  "PAYAPP_USERID",
  "PAYAPP_LINKKEY",
  "PAYAPP_LINKVAL",
  "PAYAPP_REQUESTKEY",
] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

export interface PayAppSecrets {
  userid: string;
  linkkey: string;
  linkval: string;
  requestkey: string;
}

/** 시크릿 4개를 읽는다. 하나라도 비면 null("준비 중"). */
export function readSecrets(get: (name: string) => string | undefined): PayAppSecrets | null {
  const v = SECRET_NAMES.map((n) => (get(n) ?? "").trim());
  if (v.some((x) => !x)) return null;
  return { userid: v[0], linkkey: v[1], linkval: v[2], requestkey: v[3] };
}

/** 관리자 화면용: 시크릿이 있는지 여부만(값은 절대 돌려주지 않는다). */
export function secretPresence(
  get: (name: string) => string | undefined,
): Record<SecretName, boolean> {
  const out = {} as Record<SecretName, boolean>;
  for (const n of SECRET_NAMES) out[n] = Boolean((get(n) ?? "").trim());
  return out;
}

// ───────── 해시·비교 ─────────
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function requestHash(userid: string, date14: string, requestkey: string): Promise<string> {
  return sha256Hex(userid + date14 + requestkey);
}

/** 길이와 무관하게 시간이 일정한 문자열 비교(두 값의 sha256 을 바이트 단위로 XOR). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(a)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(b)),
  ]);
  const xa = new Uint8Array(x);
  const ya = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < xa.length; i++) diff |= xa[i] ^ ya[i];
  return diff === 0 && a.length === b.length;
}

// ───────── 한국 시간 ─────────
const KST_OFFSET_MS = 9 * 3600_000;

interface KstParts {
  y: number;
  m: number; // 1~12
  d: number;
  hh: number;
  mi: number;
  ss: number;
}

export function kstParts(at: Date): KstParts {
  const k = new Date(at.getTime() + KST_OFFSET_MS);
  return {
    y: k.getUTCFullYear(),
    m: k.getUTCMonth() + 1,
    d: k.getUTCDate(),
    hh: k.getUTCHours(),
    mi: k.getUTCMinutes(),
    ss: k.getUTCSeconds(),
  };
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** 페이앱 requestdate: 한국 시간 YYYYMMDDHHmmss */
export function kstDate14(at: Date): string {
  const k = kstParts(at);
  return `${k.y}${p2(k.m)}${p2(k.d)}${p2(k.hh)}${p2(k.mi)}${p2(k.ss)}`;
}

/** 14자리 한국 시각 → Date. 형식이 틀리면 null */
export function parseDate14(s: string | null | undefined): Date | null {
  if (!s || !/^\d{14}$/.test(s)) return null;
  const y = +s.slice(0, 4),
    m = +s.slice(4, 6),
    d = +s.slice(6, 8);
  const hh = +s.slice(8, 10),
    mi = +s.slice(10, 12),
    ss = +s.slice(12, 14);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m) || hh > 23 || mi > 59 || ss > 59)
    return null;
  return new Date(Date.UTC(y, m - 1, d, hh, mi, ss) - KST_OFFSET_MS);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// ───────── 금액 ─────────
/** 통보 금액 문자열 → 정수. "29000", "29000.0" 허용, 소수·음수·문자는 null */
export function parseAmount(v: string | null | undefined): number | null {
  if (v == null) return null;
  const t = v.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n > 2_147_483_647) return null;
  return n;
}

/** 부가세 포함 가격 → 과세 공급가액·부가세(10%). 공급가액 = round(가격 / 1.1) */
export function splitVat(priceIncl: number): { taxable: number; vat: number; taxfree: number } {
  const taxable = Math.round(priceIncl / 1.1);
  return { taxable, vat: priceIncl - taxable, taxfree: 0 };
}

// ───────── form·응답 파싱 ─────────
/** form 인코딩 본문 → 평범한 객체(같은 키가 여러 번이면 처음 값). 모르는 필드도 그대로 둔다. */
export function parseForm(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(body)) {
    if (!(k in out)) out[k] = v;
  }
  return out;
}

export function isFormContentType(ct: string | null): boolean {
  return /^application\/x-www-form-urlencoded\b/i.test((ct ?? "").trim());
}

export interface PayAppResponse {
  ok: boolean;
  fields: Record<string, string>;
  error: string | null;
  errorCode: string | null;
}

/** 페이앱 응답(KEY=VALUE&...) 파싱. state=1 이면 성공 */
export function parsePayAppResponse(text: string): PayAppResponse {
  const fields = parseForm(text.trim());
  const ok = fields.state === "1";
  return {
    ok,
    fields,
    error: ok
      ? null
      : fields.errorMessage || fields.errormessage || "페이앱 응답을 읽을 수 없습니다",
    errorCode: ok ? null : fields.errorCode || fields.errorcode || null,
  };
}

// ───────── 통보 검증 ─────────
export type VerifyError =
  | "secrets_missing"
  | "userid_mismatch"
  | "linkkey_mismatch"
  | "linkval_mismatch"
  | "hash_mismatch"
  | "responsedate_invalid";

export interface VerifyResult {
  ok: boolean;
  error: VerifyError | null;
  /** 서버 시각 - responsedate(초). 1단계에서는 기록만 한다(설계 5.2). */
  skewSeconds: number | null;
}

export async function verifyNotification(
  f: Record<string, string>,
  secrets: PayAppSecrets | null,
  now: Date,
): Promise<VerifyResult> {
  if (!secrets) return { ok: false, error: "secrets_missing", skewSeconds: null };
  // 모든 비교를 끝까지 한다(어느 값이 틀렸는지에 따라 걸리는 시간이 달라지지 않게)
  const [u, k, v] = await Promise.all([
    safeEqual(f.userid ?? "", secrets.userid),
    safeEqual(f.linkkey ?? "", secrets.linkkey),
    safeEqual(f.linkval ?? "", secrets.linkval),
  ]);
  const expectedHash = await sha256Hex(
    (f.userid ?? "") + (f.responsedate ?? "") + secrets.requestkey,
  );
  const h = await safeEqual((f.hash ?? "").trim().toLowerCase(), expectedHash);
  const rd = parseDate14(f.responsedate);
  const skew = rd ? Math.round((now.getTime() - rd.getTime()) / 1000) : null;
  const error: VerifyError | null = !u
    ? "userid_mismatch"
    : !k
      ? "linkkey_mismatch"
      : !v
        ? "linkval_mismatch"
        : !h
          ? "hash_mismatch"
          : !rd
            ? "responsedate_invalid"
            : null;
  return { ok: error === null, error, skewSeconds: skew };
}

/** DB 에 남길 원본: 비밀값 지우고 휴대폰 번호는 끝 4자리. (DB 도 한 번 더 지운다) */
export function sanitizePayload(f: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(f)) {
    if (key === "linkkey" || key === "linkval" || key === "hash") continue;
    out[key] = key === "recvphone" ? val.replace(/\D/g, "").slice(-4) : val;
  }
  return out;
}

// ───────── 통보 응답 결정 ─────────
export type ApplyResult = "applied" | "duplicate" | "needs_review" | "ignored" | "error";

/** 페이앱은 HTTP 200 + 본문 SUCCESS 만 성공으로 본다. error(일시 오류·돈 막기)만 FAIL → 재시도 유도. */
export function feedbackReply(result: ApplyResult | null): "SUCCESS" | "FAIL" {
  return result === "applied" ||
    result === "duplicate" ||
    result === "needs_review" ||
    result === "ignored"
    ? "SUCCESS"
    : "FAIL";
}

// ───────── 휴대폰 번호 ─────────
/** 숫자만 남긴 휴대폰 번호(01X + 7~8자리). 아니면 null */
export function normalizePhone(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "");
  return /^01[016789]\d{7,8}$/.test(d) ? d : null;
}

// ───────── 호출 ─────────
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * 페이앱 API 호출. 인증(requestdate·hash)을 붙여 보낸다. 네트워크 오류·시간 초과도 PayAppResponse(ok=false)로 돌려준다.
 * 인자·응답을 로그에 남기지 않는다(hash·linkkey 포함).
 */
export async function callPayApp(
  params: Record<string, string>,
  secrets: PayAppSecrets,
  opts: { fetch: FetchLike; now: Date; timeoutMs?: number; withLinkkey?: boolean },
): Promise<PayAppResponse> {
  const requestdate = kstDate14(opts.now);
  const body = new URLSearchParams({
    ...params,
    userid: secrets.userid,
    requestdate,
    hash: await requestHash(secrets.userid, requestdate, secrets.requestkey),
    ...(opts.withLinkkey ? { linkkey: secrets.linkkey } : {}),
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? PAYAPP_TIMEOUT_MS);
  try {
    const res = await opts.fetch(PAYAPP_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: body.toString(),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok)
      return { ok: false, fields: {}, error: `페이앱 서버 응답 ${res.status}`, errorCode: null };
    return parsePayAppResponse(text);
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return {
      ok: false,
      fields: {},
      error: aborted ? "페이앱 응답 시간 초과" : "페이앱에 연결하지 못했습니다",
      errorCode: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ───────── 요청 인자 만들기 ─────────
export interface PayRequestInput {
  orderId: string;
  goodname: string;
  price: number;
  recvphone: string;
  feedbackUrl: string;
  returnUrl: string;
  /** 페이앱 var2(어느 상품 줄인지). 릴스는 "reels" */
  var2: string;
}

export function payRequestParams(i: PayRequestInput): Record<string, string> {
  const vat = splitVat(i.price);
  return {
    cmd: "payrequest",
    goodname: i.goodname,
    price: String(i.price),
    recvphone: i.recvphone,
    feedbackurl: i.feedbackUrl,
    var1: i.orderId,
    var2: i.var2,
    checkretry: "y",
    smsuse: "n",
    returnurl: i.returnUrl,
    amount_taxable: String(vat.taxable),
    amount_vat: String(vat.vat),
    amount_taxfree: String(vat.taxfree),
  };
}
