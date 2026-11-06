// 릴스 금액 규칙·주문번호·열쇠 단위 시험(설계서 3·8절). 네트워크 없음.
// 실행: deno test --no-lock supabase/functions/_shared/reels.test.ts
import { assert, assertEquals, assertFalse, assertMatch } from "jsr:@std/assert@1";
import {
  computeQuote,
  CONSENT_VERSION,
  formatOrderNo,
  goodname,
  hashViewKey,
  isOrderNo,
  isViewKey,
  LIST_PRICES,
  newViewKey,
  normalizeInsta,
  normalizePhone,
  publicQuote,
  sameShop,
  type HistoryRow,
} from "./reels.ts";

const NOW = new Date("2026-11-06T03:00:00Z"); // 한국 12:00
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const SHOP = { insta: "cafe_moon", phone: "01012345678" };

let seq = 0;
function row(over: Partial<HistoryRow> = {}): HistoryRow {
  seq++;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    order_no: `R261101-${String(seq).padStart(4, "0")}`,
    plan: 1,
    is_trial: true,
    status: "paid",
    amount: 99000,
    paid_at: new Date(NOW.getTime() - 2 * DAY).toISOString(),
    created_at: new Date(NOW.getTime() - 2 * DAY - HOUR).toISOString(),
    credit_trial_order_id: null,
    insta_id: SHOP.insta,
    phone: SHOP.phone,
    ...over,
  };
}
const trialPaidAgo = (ms: number, over: Partial<HistoryRow> = {}) =>
  row({
    paid_at: new Date(NOW.getTime() - ms).toISOString(),
    created_at: new Date(NOW.getTime() - ms - 60_000).toISOString(),
    ...over,
  });

// ───────── 상수 ─────────
Deno.test("상수: 정가표·동의 버전·상품명", () => {
  assertEquals(LIST_PRICES, { 1: 200000, 5: 750000, 10: 1400000 });
  assertEquals(CONSENT_VERSION, "reels-2026-11-06");
  assertEquals(goodname(1), "문의 댓글 릴스 1편");
  assertEquals(goodname(10), "문의 댓글 릴스 10편");
});

// ───────── 정리 ─────────
Deno.test("인스타 아이디 정리: 공백·@·대소문자·instagram.com 주소", () => {
  assertEquals(normalizeInsta(" @Cafe_Moon "), "cafe_moon");
  assertEquals(normalizeInsta("@@cafe.moon"), "cafe.moon");
  assertEquals(normalizeInsta("https://www.instagram.com/Cafe_Moon/?hl=ko"), "cafe_moon");
  assertEquals(normalizeInsta("https://instagram.com/cafe_moon"), "cafe_moon");
  assertEquals(normalizeInsta("http://www.instagram.com/cafe_moon/reels/"), "cafe_moon");
  assertEquals(normalizeInsta("instagram.com/cafe_moon"), "cafe_moon");
  assertEquals(normalizeInsta("www.instagram.com/@Cafe_Moon"), "cafe_moon");
});

Deno.test("인스타 아이디 정리: 무효값은 null", () => {
  for (const bad of [
    "",
    "   ",
    "@",
    "cafe moon",
    "카페문",
    "a".repeat(31),
    "https://instagram.com/",
    "https://example.com/cafe",
    "cafe-moon",
    "cafe/moon",
  ]) {
    assertEquals(normalizeInsta(bad), null, bad);
  }
  assertEquals(normalizeInsta(null), null);
  assertEquals(normalizeInsta(undefined), null);
  assertEquals(normalizeInsta("a".repeat(30)), "a".repeat(30));
});

Deno.test("전화번호 정리: 하이픈·공백 제거, 휴대폰만", () => {
  assertEquals(normalizePhone("010-1234-5678"), "01012345678");
  assertEquals(normalizePhone(" 010 1234 5678 "), "01012345678");
  assertEquals(normalizePhone("02-123-4567"), null);
  assertEquals(normalizePhone("010-123"), null);
});

Deno.test("같은 가게: 아이디 또는 번호 하나라도 겹치면(기록 쪽 표기 차이도 정리)", () => {
  assert(sameShop(row({ phone: "01099998888" }), SHOP.insta, SHOP.phone));
  assert(sameShop(row({ insta_id: "other" }), SHOP.insta, SHOP.phone));
  assert(sameShop(row({ insta_id: "@Cafe_Moon", phone: "010-0000-0000" }), SHOP.insta, SHOP.phone));
  assert(sameShop(row({ insta_id: "other", phone: "010-1234-5678" }), SHOP.insta, SHOP.phone));
  assertFalse(sameShop(row({ insta_id: "other", phone: "01099998888" }), SHOP.insta, SHOP.phone));
  assertFalse(sameShop(row({ insta_id: null, phone: null }), SHOP.insta, SHOP.phone));
});

// ───────── 1편 ─────────
Deno.test("1편 첫 주문 = 99,000원 체험(첫 주문 할인)", () => {
  const q = computeQuote({ plan: 1, ...SHOP }, [], NOW);
  assertEquals(publicQuote(q), {
    plan: 1,
    list_price: 200000,
    discount: 101000,
    amount: 99000,
    is_trial: true,
    reasons: ["첫 주문 할인"],
  });
  assertEquals(q.credit_trial_order_id, null);
  assertEquals(q.supersede_ids, []);
});

Deno.test("1편: 같은 가게 paid 주문이 있으면 정가 200,000원", () => {
  const q = computeQuote({ plan: 1, ...SHOP }, [row()], NOW);
  assertEquals(publicQuote(q), {
    plan: 1,
    list_price: 200000,
    discount: 0,
    amount: 200000,
    is_trial: false,
    reasons: [],
  });
  // 체험이 아닌 5편 paid 주문도 「결제 완료 주문」이다
  assertEquals(
    computeQuote({ plan: 1, ...SHOP }, [row({ plan: 5, is_trial: false, amount: 750000 })], NOW)
      .amount,
    200000,
  );
});

Deno.test("1편: 아이디만 겹침 / 번호만 겹침 → 같은 가게(정가)", () => {
  assertEquals(
    computeQuote({ plan: 1, ...SHOP }, [row({ phone: "01099998888" })], NOW).amount,
    200000,
  );
  assertEquals(
    computeQuote({ plan: 1, ...SHOP }, [row({ insta_id: "other_shop" })], NOW).amount,
    200000,
  );
});

Deno.test("1편: 대소문자·@·주소·하이픈 차이가 있어도 같은 가게", () => {
  const ig = normalizeInsta("https://www.instagram.com/@CAFE_MOON/")!;
  const ph = normalizePhone("010 1234-5678")!;
  assertEquals(
    computeQuote({ plan: 1, insta: ig, phone: ph }, [row({ phone: "01099998888" })], NOW).amount,
    200000,
  );
  assertEquals(
    computeQuote({ plan: 1, insta: "new_one", phone: ph }, [row({ insta_id: "x" })], NOW).amount,
    200000,
  );
});

Deno.test("다른 가게 기록은 무시", () => {
  const other = row({ insta_id: "other_shop", phone: "01099998888" });
  const q = computeQuote({ plan: 1, ...SHOP }, [other], NOW);
  assertEquals(q.amount, 99000);
  assert(q.is_trial);
  const q5 = computeQuote({ plan: 5, ...SHOP }, [other], NOW);
  assertEquals(q5.amount, 750000);
});

Deno.test("1편: paid 없이 cancelled·expired 만 있으면 다시 체험", () => {
  const q = computeQuote(
    { plan: 1, ...SHOP },
    [row({ status: "cancelled" }), row({ status: "expired", paid_at: null })],
    NOW,
  );
  assertEquals(q.amount, 99000);
  assertEquals(q.supersede_ids, []);
});

Deno.test("체험 대기(pending) 중 1편 재주문 → 다시 체험 + 대기 체험은 supersede 목록", () => {
  const p1 = row({ status: "pending", paid_at: null });
  const p2 = row({ status: "pending", paid_at: null, phone: "01099998888" });
  const notTrial = row({ status: "pending", paid_at: null, is_trial: false, plan: 5 });
  const otherShop = row({ status: "pending", paid_at: null, insta_id: "zz", phone: "01000000000" });
  const q = computeQuote({ plan: 1, ...SHOP }, [p1, p2, notTrial, otherShop], NOW);
  assert(q.is_trial);
  assertEquals(q.amount, 99000);
  assertEquals(q.supersede_ids, [p1.id, p2.id]);
});

// ───────── 5·10편 ─────────
Deno.test("묶음 첫 주문 = 정가(할인 없음)", () => {
  assertEquals(publicQuote(computeQuote({ plan: 5, ...SHOP }, [], NOW)), {
    plan: 5,
    list_price: 750000,
    discount: 0,
    amount: 750000,
    is_trial: false,
    reasons: [],
  });
  assertEquals(computeQuote({ plan: 10, ...SHOP }, [], NOW).amount, 1400000);
});

Deno.test("체험 결제 6일 23시간 뒤: 5편 651,000원 / 10편 1,301,000원(체험 차감)", () => {
  const t = trialPaidAgo(6 * DAY + 23 * HOUR);
  const q5 = computeQuote({ plan: 5, ...SHOP }, [t], NOW);
  assertEquals(publicQuote(q5), {
    plan: 5,
    list_price: 750000,
    discount: 99000,
    amount: 651000,
    is_trial: false,
    reasons: ["체험 차감 99,000원"],
  });
  assertEquals(q5.credit_trial_order_id, t.id);
  const q10 = computeQuote({ plan: 10, ...SHOP }, [t], NOW);
  assertEquals(q10.amount, 1301000);
  assertEquals(q10.credit_trial_order_id, t.id);
});

Deno.test("체험 결제 7일 1분 뒤·8일째·딱 7일 → 정가", () => {
  for (const ago of [7 * DAY + 60_000, 8 * DAY, 7 * DAY]) {
    const q = computeQuote({ plan: 5, ...SHOP }, [trialPaidAgo(ago)], NOW);
    assertEquals(q.amount, 750000, String(ago));
    assertEquals(q.credit_trial_order_id, null);
  }
});

Deno.test("차감 1번만: 그 체험을 쓴 paid 주문이 있으면 정가", () => {
  const t = trialPaidAgo(2 * DAY);
  const used = row({ plan: 5, is_trial: false, amount: 651000, credit_trial_order_id: t.id });
  assertEquals(computeQuote({ plan: 10, ...SHOP }, [t, used], NOW).amount, 1400000);
});

Deno.test("차감 쓴 주문이 pending·expired·cancelled 면 아직 차감 가능", () => {
  const t = trialPaidAgo(2 * DAY);
  for (const st of ["pending", "expired", "cancelled"] as const) {
    const used = row({
      plan: 5,
      is_trial: false,
      status: st,
      paid_at: null,
      credit_trial_order_id: t.id,
    });
    const q = computeQuote({ plan: 5, ...SHOP }, [t, used], NOW);
    assertEquals(q.amount, 651000, st);
    assertEquals(q.credit_trial_order_id, t.id);
  }
});

Deno.test("체험이 cancelled(환불) 면 차감 없음", () => {
  assertEquals(
    computeQuote({ plan: 5, ...SHOP }, [row({ status: "cancelled" })], NOW).amount,
    750000,
  );
});

Deno.test("체험 pending 만 있는 가게 5편 = 정가", () => {
  assertEquals(
    computeQuote({ plan: 5, ...SHOP }, [row({ status: "pending", paid_at: null })], NOW).amount,
    750000,
  );
});

Deno.test("차감 후보가 여럿이면 가장 최근 paid_at", () => {
  const older = trialPaidAgo(5 * DAY);
  const newer = trialPaidAgo(1 * DAY, { phone: "01099998888" });
  assertEquals(
    computeQuote({ plan: 5, ...SHOP }, [older, newer], NOW).credit_trial_order_id,
    newer.id,
  );
  // 최근 것을 이미 썼으면 남은 것
  const usedNewer = row({ plan: 5, is_trial: false, credit_trial_order_id: newer.id });
  assertEquals(
    computeQuote({ plan: 5, ...SHOP }, [older, newer, usedNewer], NOW).credit_trial_order_id,
    older.id,
  );
});

Deno.test("다른 가게의 체험은 차감에 안 씀", () => {
  const t = trialPaidAgo(DAY, { insta_id: "other_shop", phone: "01099998888" });
  assertEquals(computeQuote({ plan: 5, ...SHOP }, [t], NOW).amount, 750000);
});

Deno.test("잘못된 plan 은 오류", () => {
  let threw = false;
  try {
    computeQuote({ plan: 3 as 1, ...SHOP }, [], NOW);
  } catch {
    threw = true;
  }
  assert(threw);
});

// ───────── 주문번호 ─────────
Deno.test("주문번호: 한국 날짜 + 4자리 순번, UTC 15:00 직후는 다음 날", () => {
  assertEquals(formatOrderNo(new Date("2026-11-06T03:00:00Z"), 1), "R261106-0001");
  assertEquals(formatOrderNo(new Date("2026-11-05T14:59:59Z"), 12), "R261105-0012");
  assertEquals(formatOrderNo(new Date("2026-11-05T15:00:01Z"), 1), "R261106-0001");
  assertEquals(formatOrderNo(new Date("2026-12-31T15:00:00Z"), 9999), "R270101-9999");
  assertEquals(formatOrderNo(new Date("2026-11-06T03:00:00Z"), 12345), "R261106-12345");
});

Deno.test("주문번호 형식 검사", () => {
  assert(isOrderNo("R261106-0001"));
  assert(isOrderNo("R261106-12345"));
  for (const bad of [
    "",
    "R261106-001",
    "r261106-0001",
    "R2611060001",
    "R261106-0001 ",
    "X261106-0001",
    "R26110-0001",
  ]) {
    assertFalse(isOrderNo(bad), bad);
  }
  assertFalse(isOrderNo(null));
  assertFalse(isOrderNo(42));
});

// ───────── 열쇠 ─────────
Deno.test("열쇠: 43자 base64url, 매번 다름, 해시는 64자 hex", async () => {
  const a = newViewKey();
  const b = newViewKey();
  assertMatch(a, /^[A-Za-z0-9_-]{43}$/);
  assert(isViewKey(a));
  assert(a !== b);
  const h = await hashViewKey(a);
  assertMatch(h, /^[0-9a-f]{64}$/);
  assertEquals(h, await hashViewKey(a));
  assert(h !== (await hashViewKey(b)));
  assertEquals(
    await hashViewKey("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

Deno.test("열쇠 형식 검사", () => {
  assertFalse(isViewKey("a".repeat(42)));
  assertFalse(isViewKey("a".repeat(44)));
  assertFalse(isViewKey("a".repeat(42) + "="));
  assertFalse(isViewKey("a".repeat(42) + "+"));
  assertFalse(isViewKey(undefined));
  assert(isViewKey("A-_" + "z".repeat(40)));
});
