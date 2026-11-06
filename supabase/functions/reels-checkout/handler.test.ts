// reels-checkout 시험: 금액 재계산 → 주문 → 페이앱 payrequest. 페이앱·DB 모두 가짜(실제 호출 없음).
// 실행: deno test --no-lock supabase/functions/reels-checkout/
import { assert, assertEquals, assertFalse, assertMatch } from "jsr:@std/assert@1";
import { parseForm, sha256Hex, splitVat, type PayAppSecrets } from "../_shared/payapp.ts";
import type { HistoryRow } from "../_shared/reels.ts";
import {
  createHandler,
  type CheckoutDeps,
  type CreateOrderInput,
  type CreateOrderResult,
} from "./handler.ts";

const SECRETS: PayAppSecrets = {
  userid: "seller1",
  linkkey: "LK-abc",
  linkval: "LV-xyz",
  requestkey: "RK-secret",
};
const NOW = new Date("2026-11-06T03:00:00Z");
const URL_ = "https://x.supabase.co/functions/v1/reels-checkout";
const FEEDBACK = "https://x.supabase.co/functions/v1/reels-feedback";
const ORDER = "33333333-3333-4333-8333-333333333333";
const KEY = "Ab-_" + "c".repeat(39);
const TRIAL_ID = "00000000-0000-4000-8000-000000000009";

const paidTrial = (): HistoryRow => ({
  id: TRIAL_ID,
  order_no: "R261104-0001",
  plan: 1,
  is_trial: true,
  status: "paid",
  amount: 99000,
  paid_at: "2026-11-04T03:00:00Z",
  created_at: "2026-11-04T02:59:00Z",
  credit_trial_order_id: null,
  insta_id: "cafe_moon",
  phone: "01012345678",
});

interface Opts {
  secrets?: PayAppSecrets | null;
  enabled?: boolean;
  histories?: HistoryRow[][];
  creates?: CreateOrderResult[];
  payapp?: string;
  payappStatus?: number;
}

function setup(o: Opts = {}) {
  const calls = {
    history: 0,
    created: [] as CreateOrderInput[],
    marked: [] as {
      orderId: string;
      mulNo: string | null;
      payurl: string | null;
      error: string | null;
    }[],
    fetched: [] as { url: string; body: string }[],
    logs: [] as unknown[][],
  };
  const histories = [...(o.histories ?? [[]])];
  const creates = [...(o.creates ?? [])];
  const deps: CheckoutDeps = {
    secrets: () => (o.secrets === undefined ? SECRETS : o.secrets),
    enabled: () => Promise.resolve(o.enabled ?? true),
    history: () => {
      calls.history++;
      return Promise.resolve(histories.length > 1 ? histories.shift()! : (histories[0] ?? []));
    },
    createOrder: (input) => {
      calls.created.push(input);
      return Promise.resolve(
        creates.shift() ?? {
          ok: true,
          order_id: ORDER,
          order_no: "R261106-0007",
          amount: input.amount,
          expired_ids: [],
        },
      );
    },
    markRequested: (orderId, mulNo, payurl, error) => {
      calls.marked.push({ orderId, mulNo, payurl, error });
      return Promise.resolve();
    },
    fetch: (url, init) => {
      calls.fetched.push({ url, body: String(init?.body) });
      return Promise.resolve(
        new Response(o.payapp ?? "state=1&mul_no=5551&payurl=https%3A%2F%2Fpayapp.kr%2Fp%2F5551", {
          status: o.payappStatus ?? 200,
        }),
      );
    },
    now: () => NOW,
    feedbackUrl: FEEDBACK,
    siteUrl: "https://ai-solution.co.kr",
    newViewKey: () => KEY,
    log: (...a) => calls.logs.push(a),
  };
  return { handler: createHandler(deps), calls };
}

const GOOD = {
  plan: 1,
  shop_name: " 카페 문 ",
  insta: "@Cafe_Moon",
  phone: "010-1234-5678",
  email: "owner@example.com",
  method: "send_materials",
  agree: { terms: true, privacy: true, payment: true },
  quoted_amount: 99000,
};

const post = (body: unknown) =>
  new Request(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

Deno.test(
  "정상: 주문(서버 금액) → payrequest 본문 → mark_requested → 200 {order_no, payurl}",
  async () => {
    const s = setup();
    const res = await s.handler(post(GOOD));
    assertEquals(res.status, 200);
    assertEquals(await res.json(), {
      ok: true,
      order_no: "R261106-0007",
      payurl: "https://payapp.kr/p/5551",
    });

    assertEquals(s.calls.created.length, 1);
    assertEquals(s.calls.created[0], {
      plan: 1,
      list_price: 200000,
      discount: 101000,
      amount: 99000,
      is_trial: true,
      credit_trial_order_id: null,
      shop_name: "카페 문",
      insta_id: "cafe_moon",
      phone: "01012345678",
      email: "owner@example.com",
      method: "send_materials",
      view_key_hash: await sha256Hex(KEY),
      consent_version: "reels-2026-11-06",
    });

    assertEquals(s.calls.fetched.length, 1);
    assertEquals(s.calls.fetched[0].url, "https://api.payapp.kr/oapi/v2");
    const raw = s.calls.fetched[0].body;
    const f = parseForm(raw);
    assertEquals(f.cmd, "payrequest");
    assertEquals(f.goodname, "문의 댓글 릴스 1편");
    assertEquals(f.price, "99000");
    assertEquals(f.recvphone, "01012345678");
    assertEquals(f.var1, ORDER);
    assertEquals(f.var2, "reels");
    assertEquals(f.smsuse, "n");
    assertEquals(f.feedbackurl, FEEDBACK);
    assertEquals(f.returnurl, `https://ai-solution.co.kr/reels/order/R261106-0007?k=${KEY}`);
    assertMatch(new URL(f.returnurl).searchParams.get("k")!, /^[A-Za-z0-9_-]{43}$/);
    assertEquals(Number(f.amount_taxable) + Number(f.amount_vat), 99000);
    assertEquals(Number(f.amount_taxable), splitVat(99000).taxable);
    assertEquals(f.userid, "seller1");
    assertMatch(f.hash, /^[0-9a-f]{64}$/);
    assertFalse(raw.includes("RK-secret"));
    assertFalse(raw.includes("LK-abc"));
    assertFalse(raw.includes("LV-xyz"));

    assertEquals(s.calls.marked, [
      { orderId: ORDER, mulNo: "5551", payurl: "https://payapp.kr/p/5551", error: null },
    ]);
    // 로그에 열쇠·전화번호 원문이 없다
    const logs = JSON.stringify(s.calls.logs);
    assertFalse(logs.includes(KEY));
    assertFalse(logs.includes("01012345678"));
  },
);

Deno.test("체험 뒤 5편: 차감 금액·credit id 로 주문, goodname 5편", async () => {
  const s = setup({ histories: [[paidTrial()]] });
  const res = await s.handler(post({ ...GOOD, plan: 5, quoted_amount: 651000 }));
  assertEquals(res.status, 200);
  const c = s.calls.created[0];
  assertEquals(
    [c.list_price, c.discount, c.amount, c.is_trial, c.credit_trial_order_id],
    [750000, 99000, 651000, false, TRIAL_ID],
  );
  const f = parseForm(s.calls.fetched[0].body);
  assertEquals(f.goodname, "문의 댓글 릴스 5편");
  assertEquals(f.price, "651000");
});

Deno.test("화면이 보낸 금액·할인 필드는 무시(서버 계산)", async () => {
  const s = setup();
  const res = await s.handler(
    post({
      ...GOOD,
      plan: 10,
      quoted_amount: 1400000,
      amount: 1000,
      price: 1000,
      discount: 1399000,
      is_trial: true,
      list_price: 1000,
      credit_trial_order_id: TRIAL_ID,
    }),
  );
  assertEquals(res.status, 200);
  const c = s.calls.created[0];
  assertEquals(
    [c.list_price, c.discount, c.amount, c.is_trial, c.credit_trial_order_id],
    [1400000, 0, 1400000, false, null],
  );
  assertEquals(parseForm(s.calls.fetched[0].body).price, "1400000");
});

Deno.test("비밀값 하나라도 없음 → 409 not_ready, fetch 0회, 주문 안 만듦", async () => {
  const s = setup({ secrets: null });
  const res = await s.handler(post(GOOD));
  assertEquals(res.status, 409);
  const b = await res.json();
  assertEquals(b.ok, false);
  assertEquals(b.reason, "not_ready");
  assertEquals(
    b.error,
    "결제는 준비 중입니다. 잠시 뒤 다시 시도하시거나 contact@ai-solution.co.kr 로 문의해 주세요.",
  );
  assertEquals(s.calls.fetched.length, 0);
  assertEquals(s.calls.created.length, 0);
});

Deno.test(
  "enabled=false → 409 not_ready, 주문·fetch 없음 / create_order 가 disabled 를 줘도 not_ready",
  async () => {
    const s = setup({ enabled: false });
    const res = await s.handler(post(GOOD));
    assertEquals(res.status, 409);
    assertEquals((await res.json()).reason, "not_ready");
    assertEquals(s.calls.created.length, 0);
    assertEquals(s.calls.fetched.length, 0);

    const d = setup({ creates: [{ ok: false, reason: "disabled" }] });
    const r2 = await d.handler(post(GOOD));
    assertEquals(r2.status, 409);
    assertEquals((await r2.json()).reason, "not_ready");
    assertEquals(d.calls.fetched.length, 0);
  },
);

Deno.test("동의 하나라도 빠짐 → 400 consent_required, 주문 없음", async () => {
  for (const agree of [
    { terms: true, privacy: true },
    { terms: true, privacy: false, payment: true },
    { terms: "yes", privacy: true, payment: true },
    undefined,
  ]) {
    const s = setup();
    const res = await s.handler(post({ ...GOOD, agree }));
    assertEquals(res.status, 400, JSON.stringify(agree));
    assertEquals((await res.json()).reason, "consent_required");
    assertEquals(s.calls.created.length, 0);
  }
});

Deno.test("잘못된 이메일·아이디·번호·plan=3·상호·방식·quoted_amount → 400 invalid", async () => {
  const bads = [
    { email: "not-an-email" },
    { email: "" },
    { insta: "카페 문" },
    { phone: "02-123-4567" },
    { plan: 3 },
    { shop_name: "   " },
    { shop_name: "가".repeat(101) },
    { method: "other" },
    { quoted_amount: "99000" },
    { quoted_amount: undefined },
  ];
  for (const over of bads) {
    const s = setup();
    const res = await s.handler(post({ ...GOOD, ...over }));
    assertEquals(res.status, 400, JSON.stringify(over));
    const b = await res.json();
    assertEquals(b.reason, "invalid", JSON.stringify(over));
    assert(b.error);
    assertEquals(s.calls.created.length, 0);
    assertEquals(s.calls.fetched.length, 0);
  }
});

Deno.test(
  "quoted_amount 가 서버 금액과 다름 → 409 amount_changed + 새 견적, 주문 안 만듦",
  async () => {
    const s = setup({ histories: [[{ ...paidTrial(), plan: 5, is_trial: false }]] }); // 이미 결제한 가게 → 1편 정가
    const res = await s.handler(post(GOOD)); // 화면은 99,000원으로 봤음
    assertEquals(res.status, 409);
    const b = await res.json();
    assertEquals(b.reason, "amount_changed");
    assertEquals(b.quote, {
      plan: 1,
      list_price: 200000,
      discount: 0,
      amount: 200000,
      is_trial: false,
      reasons: [],
    });
    assert(b.error);
    assertEquals(s.calls.created.length, 0);
    assertEquals(s.calls.fetched.length, 0);
  },
);

Deno.test("stale_quote 한 번 → 기록 다시 읽고 재계산해서 성공", async () => {
  const s = setup({ creates: [{ ok: false, reason: "stale_quote" }] });
  const res = await s.handler(post(GOOD));
  assertEquals(res.status, 200);
  assertEquals(s.calls.history, 2);
  assertEquals(s.calls.created.length, 2);
  assertEquals(s.calls.fetched.length, 1);
});

Deno.test(
  "stale_quote 뒤 재계산 금액이 달라지면 409 amount_changed(두 번째 주문 안 만듦)",
  async () => {
    const s = setup({
      creates: [{ ok: false, reason: "stale_quote" }],
      histories: [[], [paidTrial()]],
    });
    const res = await s.handler(post(GOOD));
    assertEquals(res.status, 409);
    const b = await res.json();
    assertEquals(b.reason, "amount_changed");
    assertEquals(b.quote.amount, 200000);
    assertEquals(s.calls.created.length, 1);
    assertEquals(s.calls.fetched.length, 0);
  },
);

Deno.test("stale_quote 두 번 → 409 retry, 페이앱 안 부름", async () => {
  const s = setup({
    creates: [
      { ok: false, reason: "stale_quote" },
      { ok: false, reason: "stale_quote" },
    ],
  });
  const res = await s.handler(post(GOOD));
  assertEquals(res.status, 409);
  assertEquals((await res.json()).reason, "retry");
  assertEquals(s.calls.fetched.length, 0);
});

Deno.test("페이앱 state=0 → 502 payapp_error + mark_requested 에 error", async () => {
  const s = setup({
    payapp: "state=0&errorMessage=%EC%9D%B8%EC%A6%9D+%EC%8B%A4%ED%8C%A8&errorCode=70010",
  });
  const res = await s.handler(post(GOOD));
  assertEquals(res.status, 502);
  const b = await res.json();
  assertEquals(b.ok, false);
  assertEquals(b.reason, "payapp_error");
  assert(b.error);
  assertEquals(s.calls.marked.length, 1);
  assertEquals(s.calls.marked[0].orderId, ORDER);
  assertEquals(s.calls.marked[0].mulNo, null);
  assertEquals(s.calls.marked[0].payurl, null);
  assert(s.calls.marked[0].error?.includes("인증 실패"));
});

Deno.test("페이앱 응답에 결제창 주소 없음·서버 500 → 502 + mark_requested error", async () => {
  for (const o of [{ payapp: "state=1&mul_no=1" }, { payapp: "x", payappStatus: 500 }]) {
    const s = setup(o);
    const res = await s.handler(post(GOOD));
    assertEquals(res.status, 502);
    assert(s.calls.marked[0].error);
  }
});

Deno.test("OPTIONS·GET", async () => {
  const s = setup();
  assertEquals((await s.handler(new Request(URL_, { method: "OPTIONS" }))).status, 200);
  assertEquals((await s.handler(new Request(URL_, { method: "GET" }))).status, 405);
});
