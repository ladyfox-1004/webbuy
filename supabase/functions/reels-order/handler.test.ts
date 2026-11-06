// reels-order 시험: 주문번호+열쇠로 보기·자료 올리기. DB·저장소 가짜.
// 실행: deno test --no-lock supabase/functions/reels-order/
import { assert, assertEquals, assertFalse, assertMatch } from "jsr:@std/assert@1";
import { sha256Hex } from "../_shared/payapp.ts";
import { createHandler, type AddUploadResult, type OrderDeps, type OrderView } from "./handler.ts";

const URL_ = "https://x.supabase.co/functions/v1/reels-order";
const ORDER_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_ID = "55555555-5555-4555-8555-555555555555";
const ORDER_NO = "R261106-0007";
const KEY = "Zz9_-" + "q".repeat(38);
const UUID = "66666666-6666-4666-8666-666666666666";
const NOT_FOUND = {
  ok: false,
  reason: "not_found",
  error: "주문을 찾을 수 없습니다. 링크를 다시 확인해 주세요.",
};

function view(over: Partial<OrderView> = {}): OrderView {
  return {
    id: ORDER_ID,
    order_no: ORDER_NO,
    plan: 1,
    list_price: 200000,
    discount: 101000,
    amount: 99000,
    is_trial: true,
    status: "paid",
    paid_at: "2026-11-06T03:00:30Z",
    created_at: "2026-11-06T02:59:00Z",
    shop_name: "카페 문",
    method: "send_materials",
    uploads: [],
    ...over,
  };
}

interface Added {
  orderId: string;
  kind: string;
  path: string | null;
  fileName: string | null;
  mime: string | null;
  size: number | null;
  url: string | null;
  note: string | null;
}

function setup(o: { order?: OrderView | null; addResults?: AddUploadResult[] } = {}) {
  const calls = { views: [] as [string, string][], signed: [] as string[], added: [] as Added[] };
  const results = [...(o.addResults ?? [])];
  const deps: OrderDeps = {
    view: (orderNo, keyHash) => {
      calls.views.push([orderNo, keyHash]);
      return Promise.resolve(o.order === undefined ? view() : o.order);
    },
    signUpload: (path) => {
      calls.signed.push(path);
      return Promise.resolve({
        token: "tok-1",
        signed_url: `https://x.supabase.co/storage/v1/object/upload/sign/reels-uploads/${path}?token=tok-1`,
      });
    },
    addUpload: (orderId, kind, path, fileName, mime, size, url, note) => {
      calls.added.push({ orderId, kind, path, fileName, mime, size, url, note });
      return Promise.resolve(results.shift() ?? { ok: true, id: `u-${calls.added.length}` });
    },
    newId: () => UUID,
  };
  return { handler: createHandler(deps), calls };
}

const post = (body: unknown) =>
  new Request(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const base = { order_no: ORDER_NO, k: KEY };

Deno.test("view: 열쇠 해시로 조회, 주문 정보(id 없음)", async () => {
  const s = setup();
  const res = await s.handler(post({ ...base, action: "view" }));
  assertEquals(res.status, 200);
  const b = await res.json();
  assertEquals(b.ok, true);
  assertEquals(s.calls.views, [[ORDER_NO, await sha256Hex(KEY)]]);
  assertEquals(b.order.order_no, ORDER_NO);
  assertEquals(b.order.amount, 99000);
  assertEquals(b.order.uploads, []);
  assertFalse("id" in b.order);
  assertFalse(JSON.stringify(b).includes(ORDER_ID));
});

Deno.test("열쇠 형식 틀림·주문번호 형식 틀림·주문 없음 → 모두 404 같은 문구", async () => {
  const cases = [
    { order_no: ORDER_NO, k: "short", action: "view" },
    { order_no: ORDER_NO, k: KEY + "x", action: "view" },
    { order_no: "R26-1", k: KEY, action: "view" },
    { k: KEY, action: "view" },
  ];
  for (const c of cases) {
    const s = setup();
    const res = await s.handler(post(c));
    assertEquals(res.status, 404, JSON.stringify(c));
    assertEquals(await res.json(), NOT_FOUND);
    assertEquals(s.calls.views.length, 0, "형식이 틀리면 DB 안 봄");
  }
  const s = setup({ order: null });
  const res = await s.handler(post({ ...base, action: "view" }));
  assertEquals(res.status, 404);
  assertEquals(await res.json(), NOT_FOUND);
});

Deno.test("모르는 action → 400", async () => {
  const res = await setup().handler(post({ ...base, action: "delete" }));
  assertEquals(res.status, 400);
});

// ───────── upload_url ─────────
Deno.test("upload_url: 경로는 주문 id/랜덤-안전한이름, 서명 주소 돌려줌", async () => {
  const s = setup();
  const res = await s.handler(
    post({
      ...base,
      action: "upload_url",
      file_name: "../가게 사진 (1).JPG",
      mime: "image/jpeg",
      size: 1234,
    }),
  );
  assertEquals(res.status, 200);
  const b = await res.json();
  assertEquals(b.ok, true);
  assertEquals(b.token, "tok-1");
  assert(b.signed_url.includes("token=tok-1"));
  assert(b.path.startsWith(`${ORDER_ID}/${UUID}-`));
  assertMatch(b.path, new RegExp(`^${ORDER_ID}/${UUID}-[A-Za-z0-9._-]+$`));
  assertFalse(b.path.includes(".."));
  assert(b.path.endsWith(".JPG"));
  assertEquals(s.calls.signed, [b.path]);
});

Deno.test("upload_url: 사진·영상만, 크기 1~500MB", async () => {
  const bads = [
    { mime: "application/pdf", size: 10 },
    { mime: "text/html", size: 10 },
    { mime: "image", size: 10 },
    { mime: "image/png", size: 0 },
    { mime: "video/mp4", size: 524288001 },
    { mime: "video/mp4", size: 1.5 },
    { mime: "video/mp4", size: "100" },
  ];
  for (const bad of bads) {
    const s = setup();
    const res = await s.handler(
      post({ ...base, action: "upload_url", file_name: "a.mp4", ...bad }),
    );
    assertEquals(res.status, 400, JSON.stringify(bad));
    assertEquals(s.calls.signed.length, 0);
  }
  const ok = await setup().handler(
    post({ ...base, action: "upload_url", file_name: "a.mp4", mime: "video/mp4", size: 524288000 }),
  );
  assertEquals(ok.status, 200);
});

Deno.test("upload_url·save_upload·save_links: 결제 전이면 409 not_paid", async () => {
  for (const st of ["pending", "expired", "cancelled"]) {
    const s = setup({ order: view({ status: st, paid_at: null }) });
    const r1 = await s.handler(
      post({ ...base, action: "upload_url", file_name: "a.jpg", mime: "image/jpeg", size: 10 }),
    );
    assertEquals(r1.status, 409, st);
    assertEquals((await r1.json()).reason, "not_paid");
    const r2 = await s.handler(
      post({
        ...base,
        action: "save_upload",
        path: `${ORDER_ID}/${UUID}-a.jpg`,
        file_name: "a.jpg",
        mime: "image/jpeg",
        size: 10,
      }),
    );
    assertEquals(r2.status, 409);
    const r3 = await s.handler(post({ ...base, action: "save_links", note: "안녕하세요" }));
    assertEquals(r3.status, 409);
    assertEquals(s.calls.signed.length, 0);
    assertEquals(s.calls.added.length, 0);
  }
});

// ───────── save_upload ─────────
Deno.test("save_upload: 내 주문 경로만 저장(kind file, 원래 파일 이름)", async () => {
  const s = setup();
  const path = `${ORDER_ID}/${UUID}-a.jpg`;
  const res = await s.handler(
    post({
      ...base,
      action: "save_upload",
      path,
      file_name: "가게 사진.jpg",
      mime: "image/jpeg",
      size: 2048,
    }),
  );
  assertEquals(res.status, 200);
  assertEquals((await res.json()).ok, true);
  assertEquals(s.calls.added, [
    {
      orderId: ORDER_ID,
      kind: "file",
      path,
      fileName: "가게 사진.jpg",
      mime: "image/jpeg",
      size: 2048,
      url: null,
      note: null,
    },
  ]);
});

Deno.test("save_upload: 다른 주문 경로·이상한 경로 거부", async () => {
  for (const path of [
    `${OTHER_ID}/${UUID}-a.jpg`,
    `${ORDER_ID}/../${OTHER_ID}/${UUID}-a.jpg`,
    `${ORDER_ID}/${UUID}-a.jpg/../../x`,
    `${ORDER_ID}/a.jpg`,
    `x${ORDER_ID}/${UUID}-a.jpg`,
    "",
  ]) {
    const s = setup();
    const res = await s.handler(
      post({
        ...base,
        action: "save_upload",
        path,
        file_name: "a.jpg",
        mime: "image/jpeg",
        size: 10,
      }),
    );
    assertEquals(res.status, 400, path);
    assertEquals(s.calls.added.length, 0, path);
  }
});

Deno.test("save_upload: DB 가 not_paid·too_many 를 주면 409", async () => {
  for (const reason of ["not_paid", "too_many"]) {
    const s = setup({ addResults: [{ ok: false, reason }] });
    const res = await s.handler(
      post({
        ...base,
        action: "save_upload",
        path: `${ORDER_ID}/${UUID}-a.jpg`,
        file_name: "a.jpg",
        mime: "image/jpeg",
        size: 10,
      }),
    );
    assertEquals(res.status, 409);
    assertEquals((await res.json()).reason, reason);
  }
});

// ───────── save_links ─────────
Deno.test("save_links: 홈페이지·참고 릴스·요청사항을 kind 별로 저장", async () => {
  const s = setup();
  const res = await s.handler(
    post({
      ...base,
      action: "save_links",
      homepage_url: " https://cafe-moon.kr ",
      reference_urls: ["https://www.instagram.com/reel/abc/", "http://example.com/x"],
      note: "따뜻한 느낌으로 부탁드립니다.",
    }),
  );
  assertEquals(res.status, 200);
  assertEquals((await res.json()).saved, 4);
  assertEquals(
    s.calls.added.map((a) => [a.kind, a.url, a.note, a.path]),
    [
      ["homepage", "https://cafe-moon.kr", null, null],
      ["reference", "https://www.instagram.com/reel/abc/", null, null],
      ["reference", "http://example.com/x", null, null],
      ["note", null, "따뜻한 느낌으로 부탁드립니다.", null],
    ],
  );
});

Deno.test(
  "save_links: http(s) 만, 참고 주소 10개까지, 요청사항 4000자까지, 빈 요청 거부",
  async () => {
    const bads = [
      { homepage_url: "javascript:alert(1)" },
      { homepage_url: "ftp://x.kr" },
      { homepage_url: "cafe-moon.kr" },
      { reference_urls: ["https://a.kr", "data:text/html,x"] },
      { reference_urls: Array.from({ length: 11 }, (_, i) => `https://a.kr/${i}`) },
      { reference_urls: "https://a.kr" },
      { note: "가".repeat(4001) },
      {},
      { note: "   " },
    ];
    for (const bad of bads) {
      const s = setup();
      const res = await s.handler(post({ ...base, action: "save_links", ...bad }));
      assertEquals(res.status, 400, JSON.stringify(bad).slice(0, 80));
      assertEquals(s.calls.added.length, 0);
    }
    const ok = setup();
    const r = await ok.handler(
      post({
        ...base,
        action: "save_links",
        reference_urls: Array.from({ length: 10 }, (_, i) => `https://a.kr/${i}`),
        note: "가".repeat(4000),
      }),
    );
    assertEquals(r.status, 200);
    assertEquals(ok.calls.added.length, 11);
  },
);

Deno.test("OPTIONS·GET", async () => {
  const s = setup();
  assertEquals((await s.handler(new Request(URL_, { method: "OPTIONS" }))).status, 200);
  assertEquals((await s.handler(new Request(URL_, { method: "GET" }))).status, 405);
});
