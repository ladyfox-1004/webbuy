// 파트너 계정·로그인 대시보드 서버 처리(의존성 주입 — DB·Auth·카톡은 밖에서 받는다). 시험: tests/partner-account.test.ts
// 라우트: /api/partner/signup(계정 만들기·연결), /api/partner/session(로그인한 사람이 파트너·관리자인가), /api/partner/dashboard
// 본인 확인
//   - 계정 만들기: 승인 때 만든 view_key(비밀 링크) + 신청 이메일. 계정은 서버가 service role admin.createUser(email_confirm:true)
//     로 만든다 → 인증 메일 없이 바로 로그인. 연결이 실패하면 방금 만든 계정은 지운다.
//   - 대시보드: Supabase 세션 토큰(Bearer) → auth.getUser → partners.user_id. 브라우저에 RLS 정책은 열지 않는다.
// 🚨 응답·로그에 계좌 전체 번호·비밀번호·view_key 를 넣지 마라(계좌는 끝 4자리만).
// bun test 에서도 읽으므로 "@/..." 를 쓰지 마라(상대 경로만).
import { z } from "zod";
import { normalizeBank } from "./bank";

export const MAX_ACCOUNT_BODY_BYTES = 4096;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
const KEY_RE = /^[0-9a-f]{64}$/;

export type Reply = { status: number; body: Record<string, unknown> };
const reply = (status: number, body: Record<string, unknown>): Reply => ({ status, body });
const fail = (status: number, reason: string, error: string): Reply => reply(status, { ok: false, reason, error });

export type AuthUser = { id: string; email: string | null };

export function bearerToken(header: string | null | undefined): string {
  return (header ?? "").replace(/^Bearer\s+/i, "").trim();
}

// ───────── 계정 만들기 ─────────

export type AccountTarget =
  | { ok: true; id: string; name: string; email: string; status: string; has_account: boolean }
  | { ok: false; reason: string };

export type SignupDeps = {
  /** public.partner_account_target(_view_key) */
  target(k: string): Promise<AccountTarget>;
  /** auth.admin.createUser({email, password, email_confirm:true}) */
  createUser(email: string, password: string): Promise<{ ok: true; id: string } | { ok: false; reason: "email_exists" | "weak_password" | "failed" }>;
  /** auth.admin.deleteUser(id) — 연결 실패 때 되돌리기 */
  deleteUser(id: string): Promise<void>;
  /** public.partner_link_user(_view_key, _user_id, _email) */
  link(k: string, userId: string, email: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** 세션 토큰 → 사용자(연결 모드) */
  getUser(token: string): Promise<AuthUser | null>;
};

const SIGNUP_ERRORS: Record<string, string> = {
  bad_link: "링크가 올바르지 않거나 아직 승인 전입니다. 받으신 메일의 링크 전체를 다시 열어 주세요.",
  has_account: "이미 파트너 계정이 있습니다. 로그인해 주세요.",
  already_linked: "이미 파트너 계정이 있습니다. 로그인해 주세요.",
  bad_password: `비밀번호는 ${PASSWORD_MIN}~${PASSWORD_MAX}자로 정해 주세요.`,
  email_exists:
    "이 이메일로 이미 가입된 사이트 계정이 있습니다. 그 계정으로 로그인한 뒤 이 화면에서 「지금 로그인한 계정과 연결」을 눌러 주세요.",
  email_mismatch: "지금 로그인한 계정의 이메일이 파트너 신청 이메일과 다릅니다. 신청한 이메일 계정으로 로그인해 주세요.",
  user_taken: "지금 로그인한 계정은 이미 다른 파트너와 연결되어 있습니다.",
  login_required: "먼저 로그인해 주세요.",
  server: "잠시 뒤 다시 시도해 주세요.",
};
const sfail = (status: number, reason: string) => fail(status, reason, SIGNUP_ERRORS[reason] ?? SIGNUP_ERRORS.server);

/** GET /api/partner/signup?k= — 화면에 이름·이메일(고정)·이미 계정 있음 */
export async function processSignupInfo(k: string, deps: Pick<SignupDeps, "target">): Promise<Reply> {
  if (!KEY_RE.test(k)) return sfail(404, "bad_link");
  let t: AccountTarget;
  try {
    t = await deps.target(k);
  } catch {
    return sfail(500, "server");
  }
  if (!t.ok) return sfail(404, "bad_link");
  return reply(200, { ok: true, name: t.name, email: t.email, has_account: t.has_account, status: t.status });
}

const SignupBody = z.union([
  z.object({ k: z.string(), mode: z.literal("link") }),
  z.object({ k: z.string(), mode: z.literal("create").optional(), password: z.string() }),
]);

/** POST /api/partner/signup — {k, password} 새 계정 / {k, mode:'link'} + Bearer 지금 로그인한 계정과 연결 */
export async function processSignup(raw: unknown, token: string, deps: SignupDeps): Promise<Reply> {
  const parsed = SignupBody.safeParse(raw);
  if (!parsed.success || !KEY_RE.test(parsed.data.k)) return sfail(400, "bad_link");
  const k = parsed.data.k;

  if (parsed.data.mode === "link") {
    if (!token) return sfail(401, "login_required");
    let user: AuthUser | null;
    try {
      user = await deps.getUser(token);
    } catch {
      return sfail(500, "server");
    }
    if (!user?.email) return sfail(401, "login_required");
    try {
      const r = await deps.link(k, user.id, user.email);
      if (!r.ok) return sfail(r.reason === "not_found" ? 404 : 409, r.reason === "not_found" ? "bad_link" : r.reason);
    } catch {
      return sfail(500, "server");
    }
    return reply(200, { ok: true, email: user.email.toLowerCase(), linked: true });
  }

  const password = parsed.data.password;
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return sfail(400, "bad_password");

  let t: AccountTarget;
  try {
    t = await deps.target(k);
  } catch {
    return sfail(500, "server");
  }
  if (!t.ok) return sfail(404, "bad_link");
  if (t.has_account) return sfail(409, "has_account");

  let created: Awaited<ReturnType<SignupDeps["createUser"]>>;
  try {
    created = await deps.createUser(t.email, password);
  } catch {
    return sfail(500, "server");
  }
  if (!created.ok) {
    if (created.reason === "email_exists") return sfail(409, "email_exists");
    if (created.reason === "weak_password") return sfail(400, "bad_password");
    return sfail(500, "server");
  }

  let linked: { ok: true } | { ok: false; reason: string };
  try {
    linked = await deps.link(k, created.id, t.email);
  } catch {
    linked = { ok: false, reason: "server" };
  }
  if (!linked.ok) {
    // 방금 만든 계정을 지워 「계정은 있는데 파트너와 안 이어진」 상태를 남기지 않는다
    try {
      await deps.deleteUser(created.id);
    } catch {
      console.error("[partner/signup] 연결 실패 뒤 계정 지우기 실패");
    }
    return sfail(linked.reason === "already_linked" ? 409 : 500, linked.reason === "already_linked" ? "has_account" : "server");
  }
  return reply(200, { ok: true, email: t.email });
}

// ───────── 대시보드 ─────────

export type Period = "7d" | "30d" | "month";
export function parsePeriod(v: string | null | undefined): Period {
  return v === "7d" || v === "month" ? v : "30d";
}

export type DashboardDeps = {
  getUser(token: string): Promise<AuthUser | null>;
  /** public.partner_dashboard(_user_id, _period) — 파트너가 아니면 null */
  dashboard(userId: string, period: Period): Promise<Record<string, unknown> | null>;
  /** public.partner_update_profile */
  updateProfile(userId: string, phone: string, channels: string): Promise<{ ok: boolean; reason?: string } & Record<string, unknown>>;
  /** public.partner_change_account */
  changeAccount(
    userId: string,
    bankName: string,
    bankAccount: string,
    bankHolder: string,
    userAgent: string,
  ): Promise<{ ok: boolean; reason?: string; name?: string; bank_name?: string; new_last4?: string; changed_at?: string }>;
  /** 비밀번호 다시 확인(새 일회용 클라이언트로 signInWithPassword) */
  verifyPassword(email: string, password: string): Promise<boolean>;
  /** 대표님 카톡(나에게 보내기). 실패해도 변경은 그대로다. */
  notify(text: string): Promise<unknown>;
  now?: () => Date;
};

/** 응답에 계좌 전체 번호가 섞이지 않게 한 번 더 걸러 낸다(DB 함수도 끝 4자리만 준다) */
export function sanitizeDashboard(d: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (k === "bank_account" || k === "pay_bank_account" || k === "view_key" || k === "user_id") continue;
    out[k] = v;
  }
  if (typeof out.bank_last4 === "string") out.bank_last4 = out.bank_last4.replace(/\D/g, "").slice(-4);
  return out;
}

async function authed(token: string, deps: Pick<DashboardDeps, "getUser">): Promise<AuthUser | Reply> {
  if (!token) return fail(401, "login_required", "로그인이 필요합니다.");
  try {
    const u = await deps.getUser(token);
    if (!u) return fail(401, "login_required", "로그인이 만료됐습니다. 다시 로그인해 주세요.");
    return u;
  } catch {
    return fail(500, "server", "잠시 뒤 다시 시도해 주세요.");
  }
}

const NOT_PARTNER = "파트너 계정이 연결되어 있지 않습니다. 승인 메일의 「파트너 계정 만들기」 링크로 계정을 만들어 주세요.";

export async function processDashboardGet(token: string, period: Period, deps: DashboardDeps): Promise<Reply> {
  const u = await authed(token, deps);
  if ("status" in u) return u;
  let d: Record<string, unknown> | null;
  try {
    d = await deps.dashboard(u.id, period);
  } catch {
    return fail(500, "server", "잠시 뒤 다시 열어 주세요.");
  }
  if (!d) return fail(403, "not_partner", NOT_PARTNER);
  return reply(200, { ok: true, me: sanitizeDashboard(d) });
}

const ProfileBody = z.object({
  action: z.literal("profile"),
  phone: z
    .string()
    .max(20)
    .transform((s) => s.replace(/\D/g, ""))
    .refine((s) => /^01[016789]\d{7,8}$/.test(s)),
  channels: z.string().trim().min(1).max(1000),
});

const AccountBody = z.object({
  action: z.literal("account"),
  bank_name: z.string().trim().min(1).max(30),
  bank_account: z
    .string()
    .max(40)
    .transform((s) => s.replace(/\s/g, ""))
    .refine((s) => /^[0-9-]{6,30}$/.test(s) && s.replace(/\D/g, "").length >= 6),
  bank_holder: z.string().trim().min(1).max(30),
  password: z.string().min(1).max(PASSWORD_MAX),
});

/** user agent → 「iPhone · Safari」 같은 짧은 요약(최대 60자). 전체 문자열은 남기지 않는다. */
export function uaSummary(ua: string | null | undefined): string {
  const s = ua ?? "";
  if (!s) return "알 수 없음";
  const os = /iPhone/.test(s)
    ? "iPhone"
    : /iPad/.test(s)
      ? "iPad"
      : /Android/.test(s)
        ? "Android"
        : /Windows/.test(s)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(s)
            ? "Mac"
            : /Linux/.test(s)
              ? "Linux"
              : "기타";
  const br = /KAKAOTALK/i.test(s)
    ? "카카오톡"
    : /NAVER\(inapp/i.test(s)
      ? "네이버 앱"
      : /SamsungBrowser/.test(s)
        ? "삼성 인터넷"
        : /Edg\//.test(s)
          ? "Edge"
          : /Whale\//.test(s)
            ? "웨일"
            : /Firefox\//.test(s)
              ? "Firefox"
              : /Chrome\/|CriOS\//.test(s)
                ? "Chrome"
                : /Safari\//.test(s)
                  ? "Safari"
                  : "기타";
  return `${os} · ${br}`.slice(0, 60);
}

/** 한국 시간 「2026-11-07 14:03」 */
export function kstMinute(d: Date): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
}

/** 「파트너 계좌 변경: 이름 / 은행 / 끝 4자리 / 시각」 */
export function accountChangeKakaoText(name: string, bank: string, last4: string, at: Date): string {
  const n = name.replace(/\s+/g, " ").trim().slice(0, 30);
  return `파트너 계좌 변경: ${n} / ${bank} / ${last4} / ${kstMinute(at)}`;
}

const PROFILE_ERRORS: Record<string, string> = {
  invalid: "휴대폰 번호(010…)와 활동 채널을 확인해 주세요.",
  phone_taken: "다른 파트너가 이미 쓰고 있는 휴대폰 번호입니다.",
  not_found: NOT_PARTNER,
};
const ACCOUNT_ERRORS: Record<string, string> = {
  invalid: "은행·계좌번호(숫자 6자리 이상)·예금주를 확인해 주세요.",
  same: "지금 등록된 계좌와 같습니다.",
  bad_password: "비밀번호가 맞지 않습니다.",
  not_found: NOT_PARTNER,
};

export async function processDashboardPost(raw: unknown, token: string, userAgent: string | null, deps: DashboardDeps): Promise<Reply> {
  const u = await authed(token, deps);
  if ("status" in u) return u;
  const action = raw && typeof raw === "object" ? (raw as { action?: unknown }).action : undefined;

  if (action === "profile") {
    const p = ProfileBody.safeParse(raw);
    if (!p.success) return fail(400, "invalid", PROFILE_ERRORS.invalid);
    try {
      const r = await deps.updateProfile(u.id, p.data.phone, p.data.channels);
      if (!r.ok) {
        const reason = r.reason ?? "invalid";
        return fail(reason === "not_found" ? 403 : reason === "phone_taken" ? 409 : 400, reason, PROFILE_ERRORS[reason] ?? PROFILE_ERRORS.invalid);
      }
    } catch {
      return fail(500, "server", "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    }
    return reply(200, { ok: true, phone: p.data.phone, channels: p.data.channels });
  }

  if (action === "account") {
    const p = AccountBody.safeParse(raw);
    if (!p.success) return fail(400, "invalid", ACCOUNT_ERRORS.invalid);
    if (!u.email) return fail(401, "login_required", "다시 로그인해 주세요.");
    let ok: boolean;
    try {
      ok = await deps.verifyPassword(u.email, p.data.password);
    } catch {
      ok = false;
    }
    if (!ok) return fail(401, "bad_password", ACCOUNT_ERRORS.bad_password);

    // 아는 은행이면 표준 이름으로 저장(대량이체 파일의 은행 코드가 바로 맞게)
    const bankName = normalizeBank(p.data.bank_name)?.name ?? p.data.bank_name;
    let r: Awaited<ReturnType<DashboardDeps["changeAccount"]>>;
    try {
      r = await deps.changeAccount(u.id, bankName, p.data.bank_account, p.data.bank_holder, uaSummary(userAgent));
    } catch {
      return fail(500, "server", "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    }
    if (!r.ok) {
      const reason = r.reason ?? "invalid";
      return fail(reason === "not_found" ? 403 : reason === "same" ? 409 : 400, reason, ACCOUNT_ERRORS[reason] ?? ACCOUNT_ERRORS.invalid);
    }
    const last4 = String(r.new_last4 ?? "").replace(/\D/g, "").slice(-4);
    const at = r.changed_at ? new Date(r.changed_at) : (deps.now?.() ?? new Date());
    try {
      await deps.notify(accountChangeKakaoText(r.name ?? "", r.bank_name ?? bankName, last4, at));
    } catch {
      console.error("[partner/dashboard] 계좌 변경 카톡 실패(변경은 저장됨)");
    }
    return reply(200, { ok: true, bank_name: r.bank_name ?? bankName, bank_last4: last4, bank_holder: p.data.bank_holder });
  }

  return fail(400, "invalid", "요청 형식이 틀렸습니다.");
}
