// reels-admin 시험: 관리자 토큰 확인(홈페이지 admin-auth.ts 와 같은 문구) + 목록·자료·확인 처리·개시 스위치. DB 가짜.
// 실행: deno test --no-lock supabase/functions/reels-admin/
import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  createHandler,
  type AdminDeps,
  type AdminOrderRow,
  type AdminUploadRow,
} from "./handler.ts";

const URL_ = "https://x.supabase.co/functions/v1/reels-admin";
const ADMIN = "77777777-7777-4777-8777-777777777777";
const ORDER = "44444444-4444-4444-8444-444444444444";
const ENV: Record<string, string> = {
  PAYAPP_USERID: "seller-real-id",
  PAYAPP_LINKKEY: "LK-real-secret",
  PAYAPP_LINKVAL: "",
  PAYAPP_REQUESTKEY: "RK-real-secret",
  RESEND_API_KEY: "re_real_secret",
};

const ORDER_ROW: AdminOrderRow = {
  id: ORDER,
  order_no: "R261106-0007",
  created_at: "2026-11-06T02:59:00Z",
  plan: 1,
  amount: 99000,
  list_price: 200000,
  discount: 101000,
  is_trial: true,
  status: "paid",
  needs_check: false,
  check_reason: null,
  shop_name: "카페 문",
  insta_id: "cafe_moon",
  phone: "01012345678",
  email: "owner@example.com",
  method: "send_materials",
  mail_status: "sent",
  paid_at: "2026-11-06T03:00:30Z",
  mul_no: "5551",
  upload_count: 2,
};

const UPLOADS: AdminUploadRow[] = [
  {
    id: "u1",
    kind: "file",
    storage_path: `${ORDER}/x-a.jpg`,
    file_name: "a.jpg",
    mime: "image/jpeg",
    size_bytes: 10,
    url: null,
    note: null,
    created_at: "2026-11-06T04:00:00Z",
  },
  {
    id: "u2",
    kind: "homepage",
    storage_path: null,
    file_name: null,
    mime: null,
    size_bytes: null,
    url: "https://cafe.kr",
    note: null,
    created_at: "2026-11-06T04:01:00Z",
  },
];

function setup(o: { user?: { id: string } | null; admin?: boolean; roleThrows?: boolean } = {}) {
  const calls = {
    tokens: [] as string[],
    resolved: [] as [string, string | null, string][],
    enabled: [] as [boolean, string][],
    signed: [] as string[],
  };
  const deps: AdminDeps = {
    getUser: (token) => {
      calls.tokens.push(token);
      return Promise.resolve(o.user === undefined ? { id: ADMIN } : o.user);
    },
    isAdmin: () =>
      o.roleThrows ? Promise.reject(new Error("db")) : Promise.resolve(o.admin ?? true),
    listOrders: () => Promise.resolve([ORDER_ROW]),
    getSettings: () => Promise.resolve({ enabled: false }),
    reviewEventCount: () => Promise.resolve(3),
    env: (n) => ENV[n],
    listUploads: () => Promise.resolve(UPLOADS),
    signDownload: (path) => {
      calls.signed.push(path);
      return Promise.resolve(`https://signed/${path}`);
    },
    resolve: (orderId, note, by) => {
      calls.resolved.push([orderId, note, by]);
      return Promise.resolve(true);
    },
    setEnabled: (enabled, by) => {
      calls.enabled.push([enabled, by]);
      return Promise.resolve();
    },
  };
  return { handler: createHandler(deps), calls };
}

const post = (body: unknown, token: string | null = "tok-admin") =>
  new Request(URL_, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

Deno.test("토큰 없음 → 401 로그인이 필요합니다.", async () => {
  const s = setup();
  const res = await s.handler(post({ action: "list" }, null));
  assertEquals(res.status, 401);
  const b = await res.json();
  assertEquals(b.ok, false);
  assertEquals(b.error, "로그인이 필요합니다.");
  assertEquals(s.calls.tokens.length, 0);
});

Deno.test("토큰 만료(사용자 없음) → 401 로그인이 만료됐습니다.", async () => {
  const res = await setup({ user: null }).handler(post({ action: "list" }));
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, "로그인이 만료됐습니다.");
});

Deno.test("관리자 아님 → 403 / 권한 확인 실패 → 500", async () => {
  const r1 = await setup({ admin: false }).handler(post({ action: "list" }));
  assertEquals(r1.status, 403);
  assertEquals((await r1.json()).error, "관리자만 쓸 수 있습니다.");
  const r2 = await setup({ roleThrows: true }).handler(post({ action: "list" }));
  assertEquals(r2.status, 500);
  assertEquals((await r2.json()).error, "권한 확인 실패");
});

Deno.test(
  "list: 주문·설정·검토 건수, secrets 는 있음/없음(boolean)만 — 값 문자열 없음",
  async () => {
    const s = setup();
    const res = await s.handler(post({ action: "list" }));
    assertEquals(res.status, 200);
    assertEquals(s.calls.tokens, ["tok-admin"]);
    const raw = await res.text();
    const b = JSON.parse(raw);
    assertEquals(b.ok, true);
    assertEquals(b.orders, [ORDER_ROW]);
    assertEquals(b.settings, { enabled: false });
    assertEquals(b.review_events, 3);
    assertEquals(b.secrets, {
      PAYAPP_USERID: true,
      PAYAPP_LINKKEY: true,
      PAYAPP_LINKVAL: false,
      PAYAPP_REQUESTKEY: true,
      RESEND_API_KEY: true,
    });
    for (const v of Object.values(b.secrets)) assertEquals(typeof v, "boolean");
    for (const secret of Object.values(ENV).filter(Boolean))
      assertFalse(raw.includes(secret), secret);
  },
);

Deno.test("uploads: 파일만 1시간 서명 주소", async () => {
  const s = setup();
  const b = await (await s.handler(post({ action: "uploads", order_id: ORDER }))).json();
  assertEquals(b.ok, true);
  assertEquals(b.uploads.length, 2);
  assertEquals(b.uploads[0].download_url, `https://signed/${ORDER}/x-a.jpg`);
  assertEquals(b.uploads[1].download_url, null);
  assertEquals(s.calls.signed, [`${ORDER}/x-a.jpg`]);
  assertEquals((await setup().handler(post({ action: "uploads", order_id: "x" }))).status, 400);
});

Deno.test("resolve: 확인 처리(메모·처리한 관리자)", async () => {
  const s = setup();
  const res = await s.handler(post({ action: "resolve", order_id: ORDER, note: " 차액 환불함 " }));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).ok, true);
  assertEquals(s.calls.resolved, [[ORDER, "차액 환불함", ADMIN]]);
  assertEquals((await setup().handler(post({ action: "resolve", order_id: "nope" }))).status, 400);
  assertEquals(
    (await setup().handler(post({ action: "resolve", order_id: ORDER, note: "가".repeat(2001) })))
      .status,
    400,
  );
});

Deno.test("set_enabled: boolean 만", async () => {
  const s = setup();
  const res = await s.handler(post({ action: "set_enabled", enabled: true }));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, settings: { enabled: true } });
  assertEquals(s.calls.enabled, [[true, ADMIN]]);
  const bad = await s.handler(post({ action: "set_enabled", enabled: "true" }));
  assertEquals(bad.status, 400);
  assertEquals(s.calls.enabled.length, 1);
});

Deno.test("모르는 action → 400, OPTIONS → 200", async () => {
  const s = setup();
  assertEquals((await s.handler(post({ action: "drop" }))).status, 400);
  const o = await s.handler(new Request(URL_, { method: "OPTIONS" }));
  assertEquals(o.status, 200);
  assert(o.headers.get("Access-Control-Allow-Headers")?.includes("authorization"));
});
