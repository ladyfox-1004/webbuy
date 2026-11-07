// 관리자 파트너 목록(표) — 검색·상태 필터·정렬·기간 읽기·엑셀 열·계좌 가림·「전체 보기」 관리자만 시험.
// 실행: bun test ./tests  (네트워크·DB 에 나가지 않는다. 집계 값은 supabase/tests/partners_admin_list.test.sql)
import { describe, expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import {
  DEFAULT_SORT,
  LIST_COLUMNS,
  filterPartners,
  maskedAccount,
  matchesSearch,
  nextSort,
  parseListQuery,
  partnerSummaryText,
  recentlyChanged,
  sortPartners,
  type ListPartner,
} from "../src/lib/partner/admin-list";
import { buildPartnerListXlsx, partnerListHeader, partnerListRows } from "../src/lib/partner/admin-list-xlsx";
import { handleAccountReveal, handleAdminPartnersGet } from "../src/lib/partner/admin-list-api";
import { parseAdminAction } from "../src/lib/partner/admin";
import type { ServiceDb } from "../src/lib/notify/token-store";

const NOW = new Date("2026-11-20T03:00:00Z");

function P(over: Partial<ListPartner>): ListPartner {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    code: "kimpart",
    status: "approved",
    name: "김파트",
    phone: "01012345678",
    email: "kim@example.com",
    channels: "",
    memo: null,
    created_at: "2026-10-01T00:00:00Z",
    approved_at: "2026-10-02T00:00:00Z",
    view_key: null,
    approval_mail_sent_at: null,
    approval_mail_error: null,
    user_linked: false,
    account_mail_sent_at: null,
    account_mail_error: null,
    bank_name: "KB국민은행",
    bank_last4: "7654",
    bank_holder: "김파트",
    account_changed_at: null,
    visits: 0,
    inquiries: 0,
    paid_count: 0,
    paid_amount: 0,
    month_commission: 0,
    sum_pending: 0,
    sum_payable: 0,
    sum_paid: 0,
    sum_reversed: 0,
    last_activity_at: null,
    ...over,
  };
}

const ROWS: ListPartner[] = [
  P({ id: "a", name: "가나다", code: "lista", phone: "01077770001", email: "Lista@Example.com", sum_payable: 5000, visits: 2, last_activity_at: "2026-11-19T00:00:00Z" }),
  P({ id: "b", name: "라마바", code: "listb", phone: "01077770002", status: "paused", sum_payable: 20000, visits: 9 }),
  P({ id: "c", name: "사아자", code: "listc", phone: "01088880003", status: "applied", sum_payable: 0, approved_at: null }),
  P({ id: "d", name: "차카타", code: "listd", phone: "01099990004", status: "rejected", sum_payable: 0, last_activity_at: "2026-11-01T00:00:00Z" }),
];

describe("검색·필터", () => {
  test("이름·코드·이메일(대소문자 무시)·휴대폰(하이픈 무시)", () => {
    expect(matchesSearch(ROWS[0], "가나")).toBe(true);
    expect(matchesSearch(ROWS[0], "LISTA")).toBe(true);
    expect(matchesSearch(ROWS[0], "lista@example")).toBe(true);
    expect(matchesSearch(ROWS[0], "010-7777-0001")).toBe(true);
    expect(matchesSearch(ROWS[0], "7770001")).toBe(true);
    expect(matchesSearch(ROWS[0], "라마")).toBe(false);
    expect(matchesSearch(ROWS[0], "  ")).toBe(true);
    // 숫자 두 자리는 휴대폰 검색으로 보지 않는다(너무 많이 걸림)
    expect(matchesSearch(ROWS[2], "03")).toBe(false);
  });
  test("상태 필터 + 검색 함께", () => {
    expect(filterPartners(ROWS, { status: "all" }).length).toBe(4);
    expect(filterPartners(ROWS, { status: "paused" }).map((p) => p.id)).toEqual(["b"]);
    expect(filterPartners(ROWS, { status: "approved", q: "라마" })).toEqual([]);
    expect(filterPartners(ROWS, { q: "0107777" }).map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("정렬", () => {
  test("기본: 지급 가능 큰 순, 같으면 이름 순", () => {
    expect(DEFAULT_SORT).toEqual({ key: "sum_payable", dir: "desc" });
    expect(sortPartners(ROWS, "sum_payable", "desc").map((p) => p.id)).toEqual(["b", "a", "c", "d"]);
  });
  test("숫자 오름차순·이름 가나다·상태 순서", () => {
    expect(sortPartners(ROWS, "visits", "asc").map((p) => p.id)).toEqual(["c", "d", "a", "b"]);
    expect(sortPartners(ROWS, "name", "desc").map((p) => p.id)).toEqual(["d", "c", "b", "a"]);
    expect(sortPartners(ROWS, "status", "asc").map((p) => p.status)).toEqual(["applied", "approved", "paused", "rejected"]);
  });
  test("날짜 없음은 방향과 상관없이 맨 뒤", () => {
    expect(sortPartners(ROWS, "last_activity_at", "desc").map((p) => p.id)).toEqual(["a", "d", "b", "c"]);
    expect(sortPartners(ROWS, "last_activity_at", "asc").map((p) => p.id)).toEqual(["d", "a", "b", "c"]);
    expect(sortPartners(ROWS, "approved_at", "asc").at(-1)?.id).toBe("c");
  });
  test("원본 배열을 바꾸지 않는다", () => {
    const before = ROWS.map((p) => p.id);
    sortPartners(ROWS, "name", "desc");
    expect(ROWS.map((p) => p.id)).toEqual(before);
  });
  test("머리글 다시 누르면 방향 바꿈, 새 열은 숫자 큰 순·글자 가나다 순", () => {
    expect(nextSort({ key: "sum_payable", dir: "desc" }, "sum_payable")).toEqual({ key: "sum_payable", dir: "asc" });
    expect(nextSort({ key: "sum_payable", dir: "desc" }, "name")).toEqual({ key: "name", dir: "asc" });
    expect(nextSort({ key: "name", dir: "asc" }, "visits")).toEqual({ key: "visits", dir: "desc" });
  });
});

describe("기간·조건 읽기", () => {
  test("틀린 값은 기본값", () => {
    expect(parseListQuery(new URLSearchParams("period=zzz&status=x&sort=drop&dir=up"))).toEqual({
      period: "30d", q: "", status: "all", sort: "sum_payable", dir: "desc",
    });
    expect(parseListQuery(new URLSearchParams("period=month&status=paused&sort=name&dir=asc&q=kim"))).toEqual({
      period: "month", q: "kim", status: "paused", sort: "name", dir: "asc",
    });
    expect(parseListQuery(new URLSearchParams(`q=${"x".repeat(300)}`)).q.length).toBe(100);
  });
});

describe("계좌 가림·바뀜", () => {
  test("끝 4자리만", () => {
    expect(maskedAccount(ROWS[0])).toBe("KB국민은행 ·7654");
    expect(maskedAccount(P({ bank_last4: "" }))).toBe("KB국민은행 ·????");
  });
  test("14일 안에 바뀌면 「바뀜」", () => {
    expect(recentlyChanged("2026-11-10T00:00:00Z", NOW)).toBe(true);
    expect(recentlyChanged("2026-11-01T00:00:00Z", NOW)).toBe(false);
    expect(recentlyChanged(null, NOW)).toBe(false);
    expect(recentlyChanged("엉터리", NOW)).toBe(false);
  });
});

// ───────── 엑셀 ─────────
function readSheet(bytes: Uint8Array): (string | number)[][] {
  const files = unzipSync(bytes);
  const xml = strFromU8(files["xl/worksheets/sheet1.xml"]);
  return [...xml.matchAll(/<row r="\d+">(.*?)<\/row>/g)].map((m) =>
    [...m[1].matchAll(/<c r="([A-Z]+)\d+"[^>]*>(?:<v>([^<]*)<\/v>|<is><t[^>]*>([^<]*)<\/t><\/is>)<\/c>/g)].map((c) =>
      c[2] !== undefined ? Number(c[2]) : c[3].replace(/&amp;/g, "&"),
    ),
  );
}

describe("엑셀 열", () => {
  const header = partnerListHeader("30d");
  test("머리: 화면 열 전부, 기간 붙은 열", () => {
    expect(header).toEqual([
      "이름", "코드", "상태", "휴대폰", "이메일", "로그인 계정", "은행", "계좌 끝 4자리", "계좌 바뀐 날", "계좌 최근 바뀜", "승인일",
      "방문(30일)", "상담 접수(30일)", "결제 건수(30일)", "결제 금액 합계(30일)", "이번 달 수수료", "수수료 대기", "지급 가능",
      "지급 완료(누적)", "차감(누적)", "마지막 활동일",
    ]);
    expect(partnerListHeader("all")[11]).toBe("방문(전체)");
    expect(header.length).toBe(LIST_COLUMNS.length);
  });
  test("값: 상태 한글·휴대폰 하이픈·한국 날짜·숫자 칸·계좌 끝 4자리만", () => {
    const row = P({
      user_linked: true, account_changed_at: "2026-11-15T16:00:00Z", visits: 3, inquiries: 2, paid_count: 1, paid_amount: 120000,
      month_commission: 7000, sum_pending: 2000, sum_payable: 5000, sum_paid: 5000, sum_reversed: -5000, last_activity_at: "2026-11-19T15:30:00Z",
    });
    const [cells] = partnerListRows([row], NOW);
    expect(cells).toEqual([
      "김파트", "kimpart", "승인", "010-1234-5678", "kim@example.com", "연결됨", "KB국민은행", "7654", "2026-11-16", "바뀜",
      "2026-10-02", 3, 2, 1, 120000, 7000, 2000, 5000, 5000, -5000, "2026-11-20",
    ]);
  });
  test(".xlsx 를 다시 풀면 같은 칸, 계좌 앞자리는 어디에도 없다", () => {
    const withFull = { ...P({}), bank_account: "123456-01-987654" } as ListPartner;
    const bytes = buildPartnerListXlsx([withFull, P({ id: "z", name: "나중", code: "zzzz" })], "7d", NOW);
    const rows = readSheet(bytes);
    expect(rows.length).toBe(3);
    expect(rows[0][11]).toBe("방문(7일)");
    expect(rows[1][0]).toBe("김파트");
    const all = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
    expect(all.includes("123456")).toBe(false);
    expect(all.includes("987654")).toBe(false);
  });
});

describe("메모 동작 검사", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  test("다듬기·2000자·형식", () => {
    expect(parseAdminAction({ action: "set_memo", id, memo: "  좋음 " })).toEqual({ action: "set_memo", id, memo: "좋음" });
    expect(parseAdminAction({ action: "set_memo", id, memo: null })).toEqual({ action: "set_memo", id, memo: "" });
    expect(parseAdminAction({ action: "set_memo", id, memo: "x".repeat(2001) })).toEqual({ error: "메모는 2000자까지입니다." });
    expect(parseAdminAction({ action: "set_memo", id, memo: 3 })).toEqual({ error: "메모 형식이 틀렸습니다." });
    expect(parseAdminAction({ action: "set_memo", memo: "x" })).toEqual({ error: "대상이 없습니다." });
  });
});

// ───────── API: 관리자 확인·no-store·로그 ─────────
type Call = { fn: string; args: unknown };
function fakeDb(opt: { user?: string | null; admin?: boolean; rpc?: Record<string, unknown> }) {
  const calls: Call[] = [];
  const db = {
    auth: {
      getUser: async (token: string) =>
        token === "good" && opt.user ? { data: { user: { id: opt.user } }, error: null } : { data: { user: null }, error: { message: "bad" } },
    },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: opt.admin ? { role: "admin" } : null, error: null }),
      };
      return q;
    },
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return { data: opt.rpc?.[fn] ?? null, error: null };
    },
  };
  return { db: db as unknown as ServiceDb, calls };
}

const ID = "11111111-2222-4333-8444-555555555555";
const BANK = { ok: true, bank_name: "KB국민은행", bank_account: "123456-01-987654", bank_holder: "김파트" };
function revealReq(token: string | null, body: unknown = { id: ID }) {
  return new Request("https://ai-solution.co.kr/api/admin/partner-account", {
    method: "POST",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("계좌 전체 보기 — 관리자만", () => {
  test("로그인 없음 401·관리자 아님 403, DB 를 부르지 않는다", async () => {
    const a = fakeDb({ user: null, rpc: { partner_admin_bank: BANK } });
    expect((await handleAccountReveal(revealReq(null), a.db)).status).toBe(401);
    expect((await handleAccountReveal(revealReq("bad"), a.db)).status).toBe(401);
    const b = fakeDb({ user: "u1", admin: false, rpc: { partner_admin_bank: BANK } });
    const r = await handleAccountReveal(revealReq("good"), b.db);
    expect(r.status).toBe(403);
    expect(JSON.stringify(await r.json())).not.toContain("987654");
    expect(a.calls.length + b.calls.length).toBe(0);
  });
  test("관리자: 전체 번호, no-store, 로그에 번호 없음", async () => {
    const { db, calls } = fakeDb({ user: "u1", admin: true, rpc: { partner_admin_bank: BANK } });
    const logs: string[] = [];
    const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
    const cap = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
    console.log = console.error = console.warn = console.info = cap;
    let r: Response;
    try {
      r = await handleAccountReveal(revealReq("good"), db);
    } finally {
      Object.assign(console, orig);
    }
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(await r.json()).toEqual({ bank_name: "KB국민은행", bank_account: "123456-01-987654", bank_holder: "김파트" });
    expect(calls).toEqual([{ fn: "partner_admin_bank", args: { _id: ID } }]);
    expect(logs.join("\n")).not.toContain("987654");
  });
  test("틀린 id 400·없는 파트너 404", async () => {
    const { db } = fakeDb({ user: "u1", admin: true, rpc: { partner_admin_bank: { ok: false, reason: "not_found" } } });
    expect((await handleAccountReveal(revealReq("good", { id: "x" }), db)).status).toBe(400);
    expect((await handleAccountReveal(revealReq("good"), db)).status).toBe(404);
  });
});

describe("목록 API", () => {
  const get = (qs: string, token: string | null = "good") =>
    new Request(`https://ai-solution.co.kr/api/admin/partners${qs}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  test("관리자 아니면 막힘", async () => {
    const { db, calls } = fakeDb({ user: "u1", admin: false });
    expect((await handleAdminPartnersGet(get("?view=list"), db)).status).toBe(403);
    expect((await handleAdminPartnersGet(get("?view=list", null), db)).status).toBe(401);
    expect(calls.length).toBe(0);
  });
  test("기간 넘김(틀리면 30d)·no-store·보기별 함수", async () => {
    const { db, calls } = fakeDb({
      user: "u1", admin: true,
      rpc: { partner_admin_list: { partners: [] }, partner_admin_detail: { ok: true, changes: [] }, partner_admin_summary: { approved: 1 }, partner_admin_overview: { partners: [] } },
    });
    const r = await handleAdminPartnersGet(get("?view=list&period=month"), db);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    await handleAdminPartnersGet(get("?view=list&period=1y"), db);
    await handleAdminPartnersGet(get(`?view=detail&id=${ID}`), db);
    await handleAdminPartnersGet(get("?view=summary"), db);
    await handleAdminPartnersGet(get(""), db);
    expect(calls).toEqual([
      { fn: "partner_admin_list", args: { _period: "month" } },
      { fn: "partner_admin_list", args: { _period: "30d" } },
      { fn: "partner_admin_detail", args: { _id: ID } },
      { fn: "partner_admin_summary", args: {} },
      { fn: "partner_admin_overview", args: {} },
    ]);
    expect((await handleAdminPartnersGet(get("?view=detail&id=x"), db)).status).toBe(400);
    expect((await handleAdminPartnersGet(get("?view=zzz"), db)).status).toBe(400);
  });
});

describe("관리자 첫 화면 카드 요약", () => {
  test("승인 수·지급 가능·새 신청, 이상하면 null(원래 설명)", () => {
    expect(partnerSummaryText({ approved: 12, applied: 0, payable_total: 340000 })).toBe("승인 12명 · 지급 가능 340,000원");
    expect(partnerSummaryText({ approved: 3, applied: 2, payable_total: 0 })).toBe("승인 3명 · 지급 가능 0원 · 새 신청 2");
    expect(partnerSummaryText({ error: "x" } as never)).toBeNull();
    expect(partnerSummaryText({ approved: "3", payable_total: 1 })).toBeNull();
  });
});
