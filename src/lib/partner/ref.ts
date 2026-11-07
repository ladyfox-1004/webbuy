// 추천인(파트너) 코드 규칙과 브라우저 기억(localStorage aisol_ref).
// DB 쪽 같은 규칙: supabase/migrations/20261107160000_partners.sql 의 _partner_code_ok.
// 🚨 브라우저·서버 둘 다 import 한다. 여기에 서버 전용 코드(비밀값·DB)를 넣지 마라.
//
// 기억 규칙
//   - ?ref=코드 로 들어오면 형식 검사 뒤 {code, at} 저장. 30일 기억, 새 코드가 오면 덮어쓴다(마지막 클릭 기준).
//   - 관리자 브라우저(aisol_no_track=1)는 저장하지 않는다(client-track.ts 가 먼저 거른다).

export const REF_STORAGE_KEY = "aisol_ref";
export const REF_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REF_RE = /^[a-z0-9]{4,16}$/;

export const RESERVED_CODES: readonly string[] = [
  "admin", "administrator", "api", "www", "root", "system", "staff", "manager", "owner", "ceo",
  "partner", "partners", "reels", "shorts", "blog", "login", "logout", "signup", "dashboard",
  "sell", "test", "null", "none", "undefined", "aisol", "aisolution", "official", "support",
  "help", "contact", "kakao", "naver", "google", "payapp", "refund", "privacy", "terms",
];

/** 들어온 값을 소문자·앞뒤 공백 없이. 형식이 틀리면 null(예약어는 여기서 보지 않는다 — 기록·귀속엔 형식만) */
export function normalizeRef(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  return REF_RE.test(s) ? s : null;
}

/** 신청할 때 원하는 코드: 형식 + 예약어 */
export function checkWantedCode(raw: string): { ok: true; code: string } | { ok: false; reason: "invalid" | "reserved" } {
  const code = normalizeRef(raw);
  if (!code) return { ok: false, reason: "invalid" };
  if (RESERVED_CODES.includes(code)) return { ok: false, reason: "reserved" };
  return { ok: true, code };
}

type KV = Pick<Storage, "getItem" | "setItem">;

function storage(): KV | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** 저장된 추천 코드(30일 안). 없거나 지났거나 깨졌으면 null */
export function readStoredRef(now = Date.now(), store: KV | null = storage()): { code: string; at: number } | null {
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(REF_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { code?: unknown; at?: unknown };
    const code = normalizeRef(o?.code);
    const at = typeof o?.at === "number" ? o.at : NaN;
    if (!code || !Number.isFinite(at) || at > now + 60_000 || now - at > REF_TTL_MS) return null;
    return { code, at };
  } catch {
    return null;
  }
}

/** 지금 주소의 ?ref= 를 읽어 저장한다. 저장(또는 갱신)한 코드를 돌려준다. 없거나 틀리면 null */
export function captureRef(search: string, now = Date.now(), store: KV | null = storage()): string | null {
  let code: string | null = null;
  try {
    code = normalizeRef(new URLSearchParams(search).get("ref"));
  } catch {
    return null;
  }
  if (!code) return null;
  if (store) {
    try {
      store.setItem(REF_STORAGE_KEY, JSON.stringify({ code, at: now }));
    } catch {
      // 저장 막힘 — 이번 방문 기록에는 그래도 붙인다
    }
  }
  return code;
}

/** 원 단위 내림 10% (DB partner_commission_amount 와 같다 — 화면 미리보기용) */
export function commissionOf(amount: number): number {
  return Math.floor((Math.max(0, Math.trunc(amount)) * 10) / 100);
}

/** 3.3% 원천징수(소득세 3% + 지방소득세 0.3%, 각각 원 단위 내림 — DB partner_withholding 과 같다) */
export function withholdingOf(gross: number) {
  const g = Math.max(0, Math.trunc(gross));
  const incomeTax = Math.floor((g * 3) / 100);
  const localTax = Math.floor((g * 3) / 1000);
  return { incomeTax, localTax, withholding: incomeTax + localTax, net: g - incomeTax - localTax };
}

/** 계좌번호 끝 4자리만 */
export function last4(account: string): string {
  return account.replace(/\D/g, "").slice(-4);
}
