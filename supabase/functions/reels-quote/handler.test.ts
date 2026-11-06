// reels-quote 시험: 서버가 금액을 계산해 돌려주기만 한다(기록 없음). DB 가짜.
// 실행: deno test --no-lock supabase/functions/reels-quote/
import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import type { PayAppSecrets } from "../_shared/payapp.ts";
import type { HistoryRow } from "../_shared/reels.ts";
import { createHandler } from "./handler.ts";

const SECRETS: PayAppSecrets = {
  userid: "seller1",
  linkkey: "LK-abc",
  linkval: "LV-xyz",
  requestkey: "RK-secret",
};
const NOW = new Date("2026-11-06T03:00:00Z");
const URL_ = "https://x.supabase.co/functions/v1/reels-quote";

function setup(
  o: {
    secrets?: PayAppSecrets | null;
    enabled?: boolean;
    history?: HistoryRow[];
    historyThrows?: boolean;
  } = {},
) {
  const calls = { history: [] as [string, string][], create: 0 };
  const deps = {
    secrets: () => (o.secrets === undefined ? SECRETS : o.secrets),
    enabled: () => Promise.resolve(o.enabled ?? true),
    history: (insta: string, phone: string) => {
      calls.history.push([insta, phone]);
      if (o.historyThrows) return Promise.reject(new Error("db"));
      return Promise.resolve(o.history ?? []);
    },
    now: () => NOW,
    // 견적은 기록을 남기지 않는다: 주문 만들기를 넘겨 줘도 부르면 안 된다
    createOrder: () => {
      calls.create++;
      return Promise.resolve({ ok: true });
    },
  };
  return { handler: createHandler(deps), calls };
}

const post = (body: unknown) =>
  new Request(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const paidTrial = (over: Partial<HistoryRow> = {}): HistoryRow => ({
  id: "00000000-0000-4000-8000-000000000009",
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
  ...over,
});

Deno.test(
  "첫 주문 1편: 99,000원 체험, ready true, 입력은 정리해서 history 조회, 기록 안 남김",
  async () => {
    const s = setup();
    const res = await s.handler(post({ plan: 1, insta: "@Cafe_Moon", phone: "010-1234-5678" }));
    assertEquals(res.status, 200);
    const b = await res.json();
    assertEquals(b, {
      ok: true,
      quote: {
        plan: 1,
        list_price: 200000,
        discount: 101000,
        amount: 99000,
        is_trial: true,
        reasons: ["첫 주문 할인"],
      },
      ready: true,
    });
    assertEquals(s.calls.history, [["cafe_moon", "01012345678"]]);
    assertEquals(s.calls.create, 0);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  },
);

Deno.test("체험 뒤 5편: 차감, 내부 필드(credit id)는 응답에 없음", async () => {
  const s = setup({ history: [paidTrial()] });
  const b = await (
    await s.handler(post({ plan: 5, insta: "cafe_moon", phone: "01099998888" }))
  ).json();
  assertEquals(b.quote.amount, 651000);
  assertEquals(b.quote.reasons, ["체험 차감 99,000원"]);
  assertFalse("credit_trial_order_id" in b.quote);
  assertFalse(JSON.stringify(b).includes(paidTrial().id));
});

Deno.test(
  "ready: 비밀값 하나라도 없거나 enabled=false 면 false(금액은 그대로 보여 줌)",
  async () => {
    const a = await (
      await setup({ secrets: null }).handler(post({ plan: 1, insta: "a", phone: "01012345678" }))
    ).json();
    assertEquals(a.ok, true);
    assertEquals(a.ready, false);
    assertEquals(a.quote.amount, 99000);
    const b = await (
      await setup({ enabled: false }).handler(post({ plan: 10, insta: "a", phone: "01012345678" }))
    ).json();
    assertEquals(b.ready, false);
    assertEquals(b.quote.amount, 1400000);
  },
);

Deno.test("잘못된 plan·아이디·번호 → 400 invalid, history 안 부름", async () => {
  for (const body of [
    { plan: 3, insta: "a", phone: "01012345678" },
    { plan: "1", insta: "a", phone: "01012345678" },
    { plan: 1, insta: "카페", phone: "01012345678" },
    { plan: 1, insta: "", phone: "01012345678" },
    { plan: 1, insta: "a", phone: "02-123-4567" },
    { plan: 1, insta: "a" },
  ]) {
    const s = setup();
    const res = await s.handler(post(body));
    assertEquals(res.status, 400, JSON.stringify(body));
    const b = await res.json();
    assertEquals(b.ok, false);
    assertEquals(b.reason, "invalid");
    assert(typeof b.error === "string" && b.error.length > 0);
    assertEquals(s.calls.history.length, 0);
  }
});

Deno.test("OPTIONS·GET·깨진 JSON", async () => {
  const s = setup();
  const o = await s.handler(new Request(URL_, { method: "OPTIONS" }));
  assertEquals(o.status, 200);
  assertEquals(
    o.headers.get("Access-Control-Allow-Headers"),
    "authorization, x-client-info, apikey, content-type",
  );
  assertEquals((await s.handler(new Request(URL_, { method: "GET" }))).status, 405);
  const bad = await s.handler(new Request(URL_, { method: "POST", body: "{x" }));
  assertEquals(bad.status, 400);
});

Deno.test("DB 오류는 500 JSON", async () => {
  const res = await setup({ historyThrows: true }).handler(
    post({ plan: 1, insta: "a", phone: "01012345678" }),
  );
  assertEquals(res.status, 500);
  assertEquals((await res.json()).ok, false);
});
