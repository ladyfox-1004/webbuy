// 문의 댓글 릴스 판매 — 상수·금액 규칙·주문번호·주문 화면 열쇠(작업 계약서 「상수」, 설계서 3절).
// 금액은 서버에서만 정한다. 화면은 이 결과를 표시만 한다. DB(reels_create_order)가 같은 규칙으로 한 번 더 확인한다.
// 순수 함수만(네트워크·환경 변수 없음).
import { kstParts, normalizePhone, sha256Hex } from "./payapp.ts";

export { normalizePhone };

// ───────── 상수 ─────────
export const PLANS = [1, 5, 10] as const;
export type Plan = (typeof PLANS)[number];
/** 정가(부가세 포함) */
export const LIST_PRICES: Record<Plan, number> = { 1: 200000, 5: 750000, 10: 1400000 };
export const TRIAL_AMOUNT = 99000;
export const TRIAL_DISCOUNT = LIST_PRICES[1] - TRIAL_AMOUNT; // 101000
export const TRIAL_CREDIT = 99000;
export const TRIAL_CREDIT_WINDOW_MS = 7 * 24 * 3600_000;
export const REASON_TRIAL = "첫 주문 할인";
export const REASON_CREDIT = "체험 차감 99,000원";
export const METHODS = ["send_materials", "ai_only"] as const;
export type Method = (typeof METHODS)[number];
export const CONSENT_VERSION = "reels-2026-11-06";
/** 페이앱 var2(어느 상품 줄인지) */
export const PAYAPP_VAR2 = "reels";
export const MAX_UPLOAD_BYTES = 524_288_000; // 500MB
export const SITE_URL_DEFAULT = "https://ai-solution.co.kr";
/** 관리자 화면에 「있음/없음」만 보여 줄 비밀값 이름 */
export const ADMIN_SECRET_NAMES = [
  "PAYAPP_USERID",
  "PAYAPP_LINKKEY",
  "PAYAPP_LINKVAL",
  "PAYAPP_REQUESTKEY",
  "RESEND_API_KEY",
] as const;

export function isPlan(v: unknown): v is Plan {
  return typeof v === "number" && (PLANS as readonly number[]).includes(v);
}
export function isMethod(v: unknown): v is Method {
  return typeof v === "string" && (METHODS as readonly string[]).includes(v);
}
export function goodname(plan: Plan): string {
  return `문의 댓글 릴스 ${plan}편`;
}

// ───────── 같은 가게 ─────────
const INSTA_RE = /^[a-z0-9._]{1,30}$/;
const INSTA_URL_RE = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/@*([^/?#\s]*)/i;

/** 인스타 아이디 정리: 공백 제거 → instagram.com 주소면 아이디만 → 앞 @ 제거 → 소문자. 무효면 null */
export function normalizeInsta(v: string | null | undefined): string | null {
  let s = (v ?? "").trim();
  const m = INSTA_URL_RE.exec(s);
  if (m) s = m[1];
  s = s.replace(/^@+/, "").toLowerCase();
  return INSTA_RE.test(s) ? s : null;
}

export interface HistoryRow {
  id: string;
  order_no: string;
  plan: number;
  is_trial: boolean;
  status: "pending" | "paid" | "cancelled" | "expired" | string;
  amount: number;
  paid_at: string | null;
  created_at: string;
  credit_trial_order_id: string | null;
  insta_id: string | null;
  phone: string | null;
}

/** 정리한 아이디가 같거나 정리한 번호가 같으면 같은 가게(insta·phone 은 이미 정리한 값) */
export function sameShop(
  r: Pick<HistoryRow, "insta_id" | "phone">,
  insta: string,
  phone: string,
): boolean {
  const ri = normalizeInsta(r.insta_id);
  const rp = normalizePhone(r.phone);
  return (ri !== null && ri === insta) || (rp !== null && rp === phone);
}

// ───────── 금액 ─────────
export interface Quote {
  plan: Plan;
  list_price: number;
  discount: number;
  amount: number;
  is_trial: boolean;
  reasons: string[];
  /** 차감에 쓸 체험 주문 id(없으면 null) */
  credit_trial_order_id: string | null;
  /** 새 체험 주문을 만들면 만료될 같은 가게의 결제 대기 체험 주문들(표시·기록용, 실제 만료는 DB 가 한다) */
  supersede_ids: string[];
}

export type PublicQuote = Pick<
  Quote,
  "plan" | "list_price" | "discount" | "amount" | "is_trial" | "reasons"
>;

export function publicQuote(q: Quote): PublicQuote {
  return {
    plan: q.plan,
    list_price: q.list_price,
    discount: q.discount,
    amount: q.amount,
    is_trial: q.is_trial,
    reasons: [...q.reasons],
  };
}

const ms = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};

/**
 * 금액 계산(설계서 3절). insta·phone 은 정리한 값, history 는 reels_shop_history 결과(다른 가게 행이 섞여도 걸러 낸다).
 * - 1편: 같은 가게 paid 주문이 없으면 체험 99,000원, 있으면 정가
 * - 5·10편: 같은 가게 paid 체험이 7일 안(now < paid_at + 7일)이고 그 체험을 쓴 paid 주문이 없으면 99,000원 차감
 */
export function computeQuote(
  input: { plan: Plan; insta: string; phone: string },
  history: HistoryRow[],
  now: Date,
): Quote {
  const { plan, insta, phone } = input;
  if (!isPlan(plan)) throw new Error("상품 값이 올바르지 않습니다");
  const list = LIST_PRICES[plan];
  const mine = history.filter((r) => sameShop(r, insta, phone));
  const base: Quote = {
    plan,
    list_price: list,
    discount: 0,
    amount: list,
    is_trial: false,
    reasons: [],
    credit_trial_order_id: null,
    supersede_ids: [],
  };

  if (plan === 1) {
    // 체험 자격: 같은 가게에 한 번이라도 결제된 주문(지금 paid + 결제 뒤 취소 = paid_at 있음)이 없을 때만(11/6 대표님 결정).
    // 결제 안 하고 만료·취소된 대기 주문은 세지 않는다. 묶음 차감은 아래처럼 paid 로 남은 체험에만 준다.
    if (mine.some((r) => r.status === "paid" || r.paid_at != null)) return base;
    return {
      ...base,
      discount: TRIAL_DISCOUNT,
      amount: list - TRIAL_DISCOUNT,
      is_trial: true,
      reasons: [REASON_TRIAL],
      supersede_ids: mine.filter((r) => r.is_trial && r.status === "pending").map((r) => r.id),
    };
  }

  const usedCredits = new Set(
    history
      .filter((r) => r.status === "paid" && r.credit_trial_order_id)
      .map((r) => r.credit_trial_order_id as string),
  );
  const nowMs = now.getTime();
  const candidates = mine
    .filter((r) => r.is_trial && r.status === "paid")
    .map((r) => ({ r, paid: ms(r.paid_at) }))
    .filter(
      (x): x is { r: HistoryRow; paid: number } =>
        x.paid !== null && nowMs < x.paid + TRIAL_CREDIT_WINDOW_MS,
    )
    .filter((x) => !usedCredits.has(x.r.id))
    .sort((a, b) => b.paid - a.paid);
  if (!candidates.length) return base;
  return {
    ...base,
    discount: TRIAL_CREDIT,
    amount: list - TRIAL_CREDIT,
    reasons: [REASON_CREDIT],
    credit_trial_order_id: candidates[0].r.id,
  };
}

// ───────── 주문번호 ─────────
const ORDER_NO_RE = /^R[0-9]{6}-[0-9]{4,}$/;
const p2 = (n: number) => String(n).padStart(2, "0");

/** `R` + 한국 날짜 YYMMDD + `-` + 순번 4자리 이상. DB(reels_create_order)가 같은 형식으로 만든다 */
export function formatOrderNo(at: Date, seqNo: number): string {
  const k = kstParts(at);
  return `R${p2(k.y % 100)}${p2(k.m)}${p2(k.d)}-${String(seqNo).padStart(4, "0")}`;
}

export function isOrderNo(v: unknown): v is string {
  return typeof v === "string" && ORDER_NO_RE.test(v);
}

// ───────── 주문 화면 열쇠 ─────────
const VIEW_KEY_RE = /^[A-Za-z0-9_-]{43}$/;

/** 32바이트 랜덤 → base64url(패딩 없음, 43자). 원문은 링크에만, DB 에는 hashViewKey 결과만 */
export function newViewKey(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isViewKey(v: unknown): v is string {
  return typeof v === "string" && VIEW_KEY_RE.test(v);
}

/** sha256 hex(64자 소문자) */
export function hashViewKey(key: string): Promise<string> {
  return sha256Hex(key);
}

/** 주문 화면 주소(결제 뒤 돌아올 곳·메일 링크) */
export function orderPageUrl(siteUrl: string, orderNo: string, key: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/reels/order/${encodeURIComponent(orderNo)}?k=${key}`;
}

// ───────── 입력 검사 ─────────
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[A-Za-z]{2,}$/;
export function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length <= 254 && EMAIL_RE.test(s) ? s : null;
}

/** 상호: 앞뒤 공백 제거, 1~100자, 제어문자 없음 */
export function normalizeShopName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  const hasControl = [...s].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f);
  return s.length >= 1 && s.length <= 100 && !hasControl ? s : null;
}

/** 견적·주문 공통 입력 {plan, insta, phone} 검사·정리. 틀리면 null */
export function parseShopInput(
  b: Record<string, unknown>,
): { plan: Plan; insta: string; phone: string } | null {
  if (!isPlan(b.plan)) return null;
  const insta = typeof b.insta === "string" ? normalizeInsta(b.insta) : null;
  const phone = typeof b.phone === "string" ? normalizePhone(b.phone) : null;
  if (!insta || !phone) return null;
  return { plan: b.plan, insta, phone };
}

export const INVALID_SHOP_ERROR = "상품, 인스타 아이디, 휴대폰 번호를 다시 확인해 주세요.";
