// 파트너 승인 안내 메일 — 본문·MIME·보내고 기록하기 시험. 실행: bun test ./tests (네트워크에 나가지 않는다)
import { describe, expect, test } from "bun:test";
import {
  APPROVAL_MAIL_SUBJECT,
  buildApprovalRaw,
  deliverApprovalMail,
  partnerLinks,
  renderApprovalMail,
  type ApprovalMailTarget,
} from "../src/lib/partner/approval-mail";
import { parseAdminAction } from "../src/lib/partner/admin";
import { GMAIL_NOT_CONNECTED } from "../src/lib/outreach/gmail";

const KEY = "a".repeat(32) + "0123456789abcdef0123456789abcdef";
const T: ApprovalMailTarget = { name: "김파트", email: "Kim@Example.com", code: "kimpart", view_key: KEY };
const ENV = { GMAIL_CLIENT_ID: "cid", GMAIL_CLIENT_SECRET: "csecret", GMAIL_REFRESH_TOKEN: "rt" };

function fromB64Url(s: string): string {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
function decodeHeader(v: string): string {
  return v
    .replace(/\r\n /g, "")
    .replace(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g, (_, b) => Buffer.from(b, "base64").toString("utf8"));
}
function partBodies(mime: string): string[] {
  return mime
    .split(/--aisol_test(?:--)?\r\n/)
    .slice(1)
    .map((p) => p.split("\r\n\r\n")[1] ?? "")
    .filter(Boolean)
    .map((b) => Buffer.from(b.replace(/\s+/g, ""), "base64").toString("utf8"));
}

describe("승인 안내 메일 본문", () => {
  const m = renderApprovalMail(T);

  test("받는 사람·제목", () => {
    expect(m.to).toBe("kim@example.com");
    expect(m.subject).toBe("[에이아이솔루션] 파트너 승인 안내");
    expect(m.subject).toBe(APPROVAL_MAIL_SUBJECT);
  });

  test("코드·전용 링크 2개·내 화면 주소·비밀 안내", () => {
    const L = partnerLinks("kimpart", KEY);
    expect(L.reels).toBe("https://ai-solution.co.kr/reels?ref=kimpart");
    expect(L.home).toBe("https://ai-solution.co.kr/?ref=kimpart");
    expect(L.me).toBe(`https://ai-solution.co.kr/partner/me?k=${KEY}`);
    for (const body of [m.text, m.html]) {
      expect(body).toContain("kimpart");
      expect(body).toContain(L.reels);
      expect(body).toContain(L.home);
      expect(body).toContain(L.me);
      expect(body).toContain("이 주소는 비밀번호처럼 다른 사람과 나누지 마세요");
    }
    expect(m.text).toContain("김파트님");
    expect(m.text).toContain("승인되었습니다");
  });

  test("수수료 규칙(10%·체험 제외·30일·월 1회 3.3%)·대가 표시·문의 주소", () => {
    for (const s of ["10%", "체험", "99,000원", "30일", "한 달에 한 번", "3.3%", "contact@ai-solution.co.kr"]) {
      expect(m.text).toContain(s);
    }
    expect(m.text).toContain(
      "홍보할 때는 대가를 받고 소개한다는 사실을 꼭 표시해 주세요(공정거래위원회 추천·보증 심사지침)",
    );
  });

  test("이모지·마크다운 볼드·굵은 글씨·(광고) 없음", () => {
    for (const body of [m.text, m.html]) {
      expect(body).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(body).not.toContain("**");
      expect(body).not.toContain("(광고)");
    }
    expect(m.html).not.toMatch(/font-weight:\s*(bold|[6-9]00)/);
    expect(m.html).not.toMatch(/<(b|strong)>/);
  });

  test("이름은 HTML 에서 escape", () => {
    const x = renderApprovalMail({ ...T, name: "<script>홍</script>" });
    expect(x.html).not.toContain("<script>");
    expect(x.html).toContain("&lt;script&gt;");
  });

  test("주소·코드·열쇠가 틀리면 만들지 않는다", () => {
    expect(() => renderApprovalMail({ ...T, email: "not-an-email" })).toThrow();
    expect(() => renderApprovalMail({ ...T, code: "Bad Code" })).toThrow();
    expect(() => renderApprovalMail({ ...T, view_key: "short" })).toThrow();
  });
});

describe("승인 안내 메일 MIME", () => {
  const mime = fromB64Url(buildApprovalRaw(renderApprovalMail(T), { boundary: "aisol_test" }));
  const head = mime.split("\r\n\r\n")[0];

  test("보낸 사람·받는 사람·제목·답장 주소, 수신거부 머리는 없음", () => {
    expect(decodeHeader(head)).toContain("From: 에이아이솔루션 <nancoco0705@gmail.com>");
    expect(head).toContain("To: <kim@example.com>");
    expect(decodeHeader(head)).toContain("Subject: [에이아이솔루션] 파트너 승인 안내");
    expect(head).toContain("Reply-To: <contact@ai-solution.co.kr>");
    expect(head).not.toContain("List-Unsubscribe");
    expect(head).toContain('Content-Type: multipart/alternative; boundary="aisol_test"');
  });

  test("글 판·HTML 판 두 조각, 내용이 그대로 풀린다", () => {
    const [text, html] = partBodies(mime);
    expect(text).toContain("내 코드: kimpart");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("https://ai-solution.co.kr/reels?ref=kimpart");
  });
});

function fakeGoogle(opts: { tokenStatus?: number; sendStatus?: number } = {}) {
  const calls: string[] = [];
  const sent: string[] = [];
  const fetchFn = async (url: string, init?: RequestInit) => {
    calls.push(url);
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      if (opts.tokenStatus && opts.tokenStatus !== 200)
        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: opts.tokenStatus });
      return new Response(JSON.stringify({ access_token: "AT-SECRET" }), { status: 200 });
    }
    if (url.includes("/messages/send")) {
      if (opts.sendStatus && opts.sendStatus !== 200)
        return new Response(JSON.stringify({ error: { message: "Backend Error" } }), { status: opts.sendStatus });
      sent.push(JSON.parse(String(init?.body)).raw as string);
      return new Response(JSON.stringify({ id: "m1" }), { status: 200 });
    }
    return new Response("nf", { status: 404 });
  };
  return { fetchFn, calls, sent };
}

function deps(g: ReturnType<typeof fakeGoogle>, extra: { env?: object; target?: ApprovalMailTarget | "not_approved" } = {}) {
  const records: { id: string; error: string | null }[] = [];
  return {
    records,
    d: {
      env: (extra.env ?? ENV) as typeof ENV,
      fetchFn: g.fetchFn,
      getTarget: async () =>
        extra.target === "not_approved"
          ? ({ ok: false, reason: "not_approved" } as const)
          : ({ ok: true, target: extra.target ?? T } as const),
      record: async (id: string, error: string | null) => void records.push({ id, error }),
    },
  };
}

describe("보내고 기록하기", () => {
  test("성공: 한 통 보내고 오류 없이 기록", async () => {
    const g = fakeGoogle();
    const { d, records } = deps(g);
    const r = await deliverApprovalMail("p1", d);
    expect(r).toEqual({ mail: "sent", mail_error: null });
    expect(g.sent.length).toBe(1);
    expect(decodeHeader(fromB64Url(g.sent[0]))).toContain("Subject: [에이아이솔루션] 파트너 승인 안내");
    expect(records).toEqual([{ id: "p1", error: null }]);
  });

  test("지메일 연결 안 됨: 보내지 않고 실패 기록(토큰 요청도 안 함)", async () => {
    const g = fakeGoogle();
    const { d, records } = deps(g, { env: { GMAIL_CLIENT_ID: "x" } });
    const r = await deliverApprovalMail("p1", d);
    expect(r.mail).toBe("failed");
    expect(r.mail_error).toBe(GMAIL_NOT_CONNECTED);
    expect(g.calls.length).toBe(0);
    expect(records).toEqual([{ id: "p1", error: GMAIL_NOT_CONNECTED }]);
  });

  test("토큰 실패·보내기 실패: 실패 기록, 비밀값은 사유에 없음", async () => {
    for (const g of [fakeGoogle({ tokenStatus: 400 }), fakeGoogle({ sendStatus: 500 })]) {
      const { d, records } = deps(g);
      const r = await deliverApprovalMail("p1", d);
      expect(r.mail).toBe("failed");
      expect(records.length).toBe(1);
      expect(records[0].error).toBeTruthy();
      for (const secret of ["AT-SECRET", "csecret", KEY]) expect(records[0].error).not.toContain(secret);
    }
  });

  test("승인 안 된 사람: 보내지도 기록하지도 않음", async () => {
    const g = fakeGoogle();
    const { d, records } = deps(g, { target: "not_approved" });
    const r = await deliverApprovalMail("p1", d);
    expect(r.mail).toBe("skipped");
    expect(g.calls.length).toBe(0);
    expect(records.length).toBe(0);
  });

  test("기록이 실패해도 던지지 않는다", async () => {
    const g = fakeGoogle();
    const { d } = deps(g);
    const r = await deliverApprovalMail("p1", { ...d, record: async () => Promise.reject(new Error("db")) });
    expect(r.mail).toBe("sent");
  });
});

describe("관리자 동작: 메일 다시 보내기", () => {
  const id = "3f2b8c1e-1234-4abc-9def-0123456789ab";
  test("id 가 있으면 받는다", () => {
    expect(parseAdminAction({ action: "resend_approval_mail", id })).toEqual({ action: "resend_approval_mail", id });
    expect(parseAdminAction({ action: "resend_approval_mail" })).toEqual({ error: "대상이 없습니다." });
  });
});
