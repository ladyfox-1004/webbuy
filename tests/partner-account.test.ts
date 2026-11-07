// 파트너 로그인 대시보드 — 계정 만들기(view_key 확인·이미 계정 있음·연결 실패 되돌리기), 로그인 뒤 갈 곳·safeNext(/partner 허용),
// 대시보드(전체 계좌 없음), 계좌 변경(비밀번호 확인·카톡·이력 값), 계정 만들기 메일 시험.
// 실행: bun test ./tests  (네트워크·DB 에 나가지 않는다. DB 쪽 시험은 supabase/tests/partners_dashboard.test.sql)
import { describe, expect, test } from "bun:test";
import {
  accountChangeKakaoText,
  bearerToken,
  kstMinute,
  parsePeriod,
  processDashboardGet,
  processDashboardPost,
  processSignup,
  processSignupInfo,
  sanitizeDashboard,
  uaSummary,
  type AccountTarget,
  type DashboardDeps,
  type SignupDeps,
} from "../src/lib/partner/account";
import { postLoginTarget, safeNextPath } from "../src/lib/auth/next";
import {
  ACCOUNT_MAIL_SUBJECT,
  deliverAccountMail,
  partnerLinks,
  renderAccountMail,
  renderApprovalMail,
} from "../src/lib/partner/approval-mail";
import { parseAdminAction } from "../src/lib/partner/admin";

const K = "ab".repeat(32);
const TARGET: AccountTarget = { ok: true, id: "p1", name: "김파트", email: "kim@example.com", status: "approved", has_account: false };

function signupDeps(over: Partial<SignupDeps> = {}) {
  const log: string[] = [];
  const d: SignupDeps = {
    target: async (k) => {
      log.push(`target:${k === K}`);
      return TARGET;
    },
    createUser: async (email, pw) => {
      log.push(`create:${email}:${pw.length}`);
      return { ok: true, id: "u-new" };
    },
    deleteUser: async (id) => void log.push(`delete:${id}`),
    link: async (_k, id, email) => {
      log.push(`link:${id}:${email}`);
      return { ok: true };
    },
    getUser: async (t) => (t === "tok" ? { id: "u-old", email: "Kim@Example.com" } : null),
    ...over,
  };
  return { d, log };
}

// ───────── 계정 만들기 ─────────
describe("계정 만들기", () => {
  test("화면 정보: 열쇠 형식이 틀리면 DB 도 안 부르고 404", async () => {
    const { d, log } = signupDeps();
    expect((await processSignupInfo("short", d)).status).toBe(404);
    expect((await processSignupInfo("AB".repeat(32), d)).status).toBe(404);
    expect(log).toEqual([]);
    const r = await processSignupInfo(K, d);
    expect(r).toEqual({ status: 200, body: { ok: true, name: "김파트", email: "kim@example.com", has_account: false, status: "approved" } });
  });

  test("화면 정보: DB 가 모르는 열쇠(신청 중·거절·없음)는 404", async () => {
    const { d } = signupDeps({ target: async () => ({ ok: false, reason: "not_found" }) });
    const r = await processSignupInfo(K, d);
    expect(r.status).toBe(404);
    expect(r.body.reason).toBe("bad_link");
  });

  test("새 계정: view_key 확인 → 신청 이메일로 만들기(인증 메일 없이) → 연결", async () => {
    const { d, log } = signupDeps();
    const r = await processSignup({ k: K, password: "pass1234" }, "", d);
    expect(r).toEqual({ status: 200, body: { ok: true, email: "kim@example.com" } });
    expect(log).toEqual(["target:true", "create:kim@example.com:8", "link:u-new:kim@example.com"]);
  });

  test("비밀번호 8~72자, 열쇠 틀리면 아무것도 안 만든다", async () => {
    const { d, log } = signupDeps();
    expect((await processSignup({ k: K, password: "short" }, "", d)).body.reason).toBe("bad_password");
    expect((await processSignup({ k: K, password: "x".repeat(73) }, "", d)).body.reason).toBe("bad_password");
    expect((await processSignup({ k: "nope", password: "pass1234" }, "", d)).body.reason).toBe("bad_link");
    expect((await processSignup(null, "", d)).status).toBe(400);
    expect(log).toEqual([]);
  });

  test("이미 계정 있음: 만들지 않고 409 has_account(로그인 안내)", async () => {
    const { d, log } = signupDeps({ target: async () => ({ ...TARGET, has_account: true }) });
    const r = await processSignup({ k: K, password: "pass1234" }, "", d);
    expect(r.status).toBe(409);
    expect(r.body.reason).toBe("has_account");
    expect(String(r.body.error)).toContain("로그인");
    expect(log.some((l) => l.startsWith("create"))).toBe(false);
  });

  test("같은 이메일의 사이트 계정이 이미 있음: email_exists(로그인 뒤 연결 안내)", async () => {
    const { d } = signupDeps({ createUser: async () => ({ ok: false, reason: "email_exists" }) });
    const r = await processSignup({ k: K, password: "pass1234" }, "", d);
    expect(r.status).toBe(409);
    expect(r.body.reason).toBe("email_exists");
  });

  test("연결이 실패하면 방금 만든 계정을 지운다", async () => {
    const { d, log } = signupDeps({ link: async () => ({ ok: false, reason: "already_linked" }) });
    const r = await processSignup({ k: K, password: "pass1234" }, "", d);
    expect(r.body.reason).toBe("has_account");
    expect(log).toContain("delete:u-new");
    const b = signupDeps({
      link: async () => {
        throw new Error("db");
      },
    });
    expect((await processSignup({ k: K, password: "pass1234" }, "", b.d)).status).toBe(500);
    expect(b.log).toContain("delete:u-new");
  });

  test("연결 모드: 로그인 토큰 필요, 그 계정 이메일로 연결(이메일 다르면 DB 가 거절)", async () => {
    const { d, log } = signupDeps();
    expect((await processSignup({ k: K, mode: "link" }, "", d)).body.reason).toBe("login_required");
    expect((await processSignup({ k: K, mode: "link" }, "bad", d)).status).toBe(401);
    const r = await processSignup({ k: K, mode: "link" }, "tok", d);
    expect(r).toEqual({ status: 200, body: { ok: true, email: "kim@example.com", linked: true } });
    expect(log).toEqual(["link:u-old:Kim@Example.com"]);
    const m = signupDeps({ link: async () => ({ ok: false, reason: "email_mismatch" }) });
    const r2 = await processSignup({ k: K, mode: "link" }, "tok", m.d);
    expect(r2.status).toBe(409);
    expect(r2.body.reason).toBe("email_mismatch");
  });

  test("응답에 비밀번호·열쇠가 들어가지 않는다", async () => {
    const { d } = signupDeps({ createUser: async () => ({ ok: false, reason: "failed" }) });
    const r = await processSignup({ k: K, password: "secretpass9" }, "", d);
    expect(JSON.stringify(r)).not.toContain("secretpass9");
    expect(JSON.stringify(r)).not.toContain(K);
  });
});

// ───────── 로그인 뒤 갈 곳 ─────────
describe("로그인 뒤 갈 곳·safeNext", () => {
  test("/admin·/partner 만 허용, 외부·// 차단", () => {
    for (const ok of ["/admin", "/admin/partners", "/admin/inquiries?x=1", "/partner/dashboard", "/partner/signup?k=" + K, "/partner"]) {
      expect(safeNextPath(ok)).toBe(ok);
    }
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "https://evil.com/admin",
      "evil.com",
      "/admin@evil.com",
      "/partner:x",
      "/partners-evil",
      "/administrator",
      "/",
      "/me",
      "/admin\n/x",
      " /admin",
      "",
      null,
      undefined,
    ]) {
      expect(safeNextPath(bad as string)).toBeNull();
    }
  });

  test("next 가 있으면 그곳, 없으면 관리자는 기존대로 홈, 파트너는 /partner/dashboard", () => {
    expect(postLoginTarget({ next: "/admin/partners", admin: false, partner: true })).toBe("/admin/partners");
    expect(postLoginTarget({ next: null, admin: true, partner: false })).toBe("/");
    expect(postLoginTarget({ next: null, admin: true, partner: true })).toBe("/");
    expect(postLoginTarget({ next: null, admin: false, partner: true })).toBe("/partner/dashboard");
    expect(postLoginTarget({ next: null, admin: false, partner: false })).toBe("/");
  });
});

// ───────── 대시보드 ─────────
const FULL_ACCOUNT = "123456-01-987654";
function dashDeps(over: Partial<DashboardDeps> = {}) {
  const log: string[] = [];
  const notified: string[] = [];
  const changes: unknown[][] = [];
  const d: DashboardDeps = {
    getUser: async (t) => (t === "tok" ? { id: "u1", email: "kim@example.com" } : null),
    dashboard: async (id, period) => {
      log.push(`dash:${id}:${period}`);
      return { name: "김파트", code: "kimpart", bank_name: "KB국민은행", bank_last4: "7654", bank_account: FULL_ACCOUNT, view_key: K };
    },
    updateProfile: async (id, phone, channels) => {
      log.push(`profile:${id}:${phone}:${channels}`);
      return { ok: true };
    },
    changeAccount: async (...a) => {
      changes.push(a);
      return { ok: true, name: "김파트", bank_name: String(a[1]), old_last4: "7654", new_last4: "5566", changed_at: "2026-11-07T05:03:00Z" };
    },
    verifyPassword: async (email, pw) => {
      log.push(`verify:${email}`);
      return pw === "right-pass";
    },
    notify: async (t) => void notified.push(t),
    ...over,
  };
  return { d, log, notified, changes };
}

describe("대시보드 GET", () => {
  test("토큰 없음·만료 401, 파트너 아니면 403", async () => {
    const { d } = dashDeps({ dashboard: async () => null });
    expect((await processDashboardGet("", "30d", d)).status).toBe(401);
    expect((await processDashboardGet("bad", "30d", d)).status).toBe(401);
    const r = await processDashboardGet("tok", "30d", d);
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe("not_partner");
  });

  test("🚨 응답에 전체 계좌 번호·view_key 가 없다(끝 4자리만)", async () => {
    const { d, log } = dashDeps();
    const r = await processDashboardGet("tok", "month", d);
    expect(r.status).toBe(200);
    const s = JSON.stringify(r.body);
    expect(s).not.toContain(FULL_ACCOUNT);
    expect(s).not.toContain("12345601987654");
    expect(s).not.toContain(K);
    expect((r.body.me as Record<string, unknown>).bank_last4).toBe("7654");
    expect(log).toEqual(["dash:u1:month"]);
  });

  test("기간·토큰 읽기", () => {
    expect(parsePeriod("7d")).toBe("7d");
    expect(parsePeriod("month")).toBe("month");
    expect(parsePeriod("1y")).toBe("30d");
    expect(parsePeriod(null)).toBe("30d");
    expect(bearerToken("Bearer abc ")).toBe("abc");
    expect(bearerToken(null)).toBe("");
    expect(sanitizeDashboard({ bank_last4: "12-3456", pay_bank_account: "x", user_id: "u" })).toEqual({ bank_last4: "3456" });
  });
});

describe("내 정보 수정", () => {
  test("휴대폰(숫자만)·채널, 형식 틀리면 400", async () => {
    const { d, log } = dashDeps();
    const r = await processDashboardPost({ action: "profile", phone: "010-1234-5678", channels: " 블로그 " }, "tok", null, d);
    expect(r.status).toBe(200);
    expect(log).toEqual(["profile:u1:01012345678:블로그"]);
    expect((await processDashboardPost({ action: "profile", phone: "02-123", channels: "x" }, "tok", null, d)).status).toBe(400);
    const t = dashDeps({ updateProfile: async () => ({ ok: false, reason: "phone_taken" }) });
    const r2 = await processDashboardPost({ action: "profile", phone: "01012345678", channels: "x" }, "tok", null, t.d);
    expect(r2.status).toBe(409);
  });
});

describe("계좌 변경", () => {
  const body = { action: "account", bank_name: "신한", bank_account: "110 222 335566", bank_holder: "김파트", password: "right-pass" };
  const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

  test("비밀번호 확인 → 표준 은행 이름으로 저장 → 카톡 「이름 / 은행 / 끝 4자리 / 시각」 → 끝 4자리만 응답", async () => {
    const { d, log, notified, changes } = dashDeps();
    const r = await processDashboardPost(body, "tok", UA, d);
    expect(r).toEqual({ status: 200, body: { ok: true, bank_name: "신한은행", bank_last4: "5566", bank_holder: "김파트" } });
    expect(log).toEqual(["verify:kim@example.com"]);
    expect(changes).toEqual([["u1", "신한은행", "110222335566", "김파트", "iPhone · Safari"]]);
    expect(notified).toEqual(["파트너 계좌 변경: 김파트 / 신한은행 / 5566 / 2026-11-07 14:03"]);
    expect(JSON.stringify(r.body)).not.toContain("110222335566");
  });

  test("비밀번호가 틀리면 바꾸지도 알리지도 않는다", async () => {
    const { d, notified, changes } = dashDeps();
    const r = await processDashboardPost({ ...body, password: "wrong" }, "tok", UA, d);
    expect(r.status).toBe(401);
    expect(r.body.reason).toBe("bad_password");
    expect(changes.length + notified.length).toBe(0);
  });

  test("형식 틀림·같은 계좌·로그인 안 함", async () => {
    const { d, changes } = dashDeps();
    expect((await processDashboardPost({ ...body, bank_account: "12ab" }, "tok", UA, d)).status).toBe(400);
    expect((await processDashboardPost({ ...body, bank_account: "12-3" }, "tok", UA, d)).status).toBe(400);
    expect((await processDashboardPost({ ...body, bank_holder: " " }, "tok", UA, d)).status).toBe(400);
    expect((await processDashboardPost(body, "", UA, d)).status).toBe(401);
    expect(changes.length).toBe(0);
    const same = dashDeps({ changeAccount: async () => ({ ok: false, reason: "same" }) });
    expect((await processDashboardPost(body, "tok", UA, same.d)).status).toBe(409);
    expect(same.notified.length).toBe(0);
  });

  test("카톡이 실패해도 변경은 성공", async () => {
    const { d } = dashDeps({
      notify: async () => {
        throw new Error("kakao");
      },
    });
    expect((await processDashboardPost(body, "tok", UA, d)).status).toBe(200);
  });

  test("모르는 은행은 적은 그대로", async () => {
    const { d, changes } = dashDeps();
    await processDashboardPost({ ...body, bank_name: "어느신협" }, "tok", UA, d);
    expect(changes[0][1]).toBe("어느신협");
  });

  test("user agent 요약·한국 시각", () => {
    expect(uaSummary(UA)).toBe("iPhone · Safari");
    expect(uaSummary("Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0 Mobile Safari/537.36")).toBe("Android · 삼성 인터넷");
    expect(uaSummary("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0")).toBe("Windows · Edge");
    expect(uaSummary("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.5")).toBe("iPhone · 카카오톡");
    expect(uaSummary(null)).toBe("알 수 없음");
    expect(uaSummary("x".repeat(500)).length).toBeLessThanOrEqual(60);
    expect(kstMinute(new Date("2026-11-30T15:00:00Z"))).toBe("2026-12-01 00:00");
    expect(accountChangeKakaoText(" 김  파트 ", "KB국민은행", "1234", new Date("2026-11-07T00:00:00Z"))).toBe(
      "파트너 계좌 변경: 김 파트 / KB국민은행 / 1234 / 2026-11-07 09:00",
    );
  });
});

// ───────── 메일 ─────────
describe("계정 만들기 링크·메일", () => {
  const T = { name: "김파트", email: "Kim@Example.com", code: "kimpart", view_key: K };
  test("승인 메일에 「파트너 계정 만들기」 링크", () => {
    const L = partnerLinks("kimpart", K);
    expect(L.signup).toBe(`https://ai-solution.co.kr/partner/signup?k=${K}`);
    const m = renderApprovalMail(T);
    expect(m.text).toContain("파트너 계정 만들기");
    expect(m.text).toContain(L.signup);
    expect(m.html).toContain(L.signup);
  });

  test("계정 안내 메일: 제목·링크·로그인 주소·고정 이메일, 이모지·볼드·(광고) 없음", () => {
    const m = renderAccountMail(T);
    expect(m.subject).toBe(ACCOUNT_MAIL_SUBJECT);
    expect(m.to).toBe("kim@example.com");
    for (const body of [m.text, m.html]) {
      expect(body).toContain(`https://ai-solution.co.kr/partner/signup?k=${K}`);
      expect(body).toContain("https://ai-solution.co.kr/login?next=/partner/dashboard");
      expect(body).toContain("kim@example.com");
      expect(body).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(body).not.toContain("**");
      expect(body).not.toContain("(광고)");
    }
    expect(m.html).not.toMatch(/<(b|strong)>/);
    expect(() => renderAccountMail({ ...T, view_key: "x" })).toThrow();
  });

  test("이미 계정 있는 파트너는 보내지 않음(skipped, 기록 없음)", async () => {
    const records: unknown[] = [];
    const r = await deliverAccountMail("p1", {
      env: {},
      getTarget: async () => ({ ok: false, reason: "has_account" }),
      record: async (...a) => void records.push(a),
    });
    expect(r).toEqual({ mail: "skipped", mail_error: "이미 계정을 만든 파트너입니다." });
    expect(records.length).toBe(0);
  });

  test("관리자 동작 send_account_mail", () => {
    const id = "3f2b8c1e-1234-4abc-9def-0123456789ab";
    expect(parseAdminAction({ action: "send_account_mail", id })).toEqual({ action: "send_account_mail", id });
    expect(parseAdminAction({ action: "send_account_mail" })).toEqual({ error: "대상이 없습니다." });
  });
});
