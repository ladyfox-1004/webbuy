// reels-checkout: 손님이 결제를 시작한다. verify_jwt = false(손님은 로그인 없음).
// 흐름(작업 계약서): 검증 → 비밀값·개시 스위치 → reels_shop_history → computeQuote → quoted_amount 대조 → 새 열쇠 →
//   reels_create_order(stale_quote 면 한 번 다시 계산) → 페이앱 payrequest → reels_mark_requested → 결제창 주소.
// 금액은 화면이 보낸 값을 쓰지 않는다(quoted_amount 는 「화면이 본 금액과 같은지」 대조에만).
// 비밀값이 없거나 개시 전이면 409 not_ready(5xx 로 주지 않는다). 응답·로그에 비밀값·전화번호·열쇠 원문을 남기지 않는다.
import {
  callPayApp,
  payRequestParams,
  type FetchLike,
  type PayAppSecrets,
} from "../_shared/payapp.ts";
import { errMsg, json, readJsonBody, SERVER_ERROR } from "../_shared/http.ts";
import {
  computeQuote,
  CONSENT_VERSION,
  goodname,
  hashViewKey,
  INVALID_SHOP_ERROR,
  isMethod,
  newViewKey,
  normalizeEmail,
  normalizeShopName,
  orderPageUrl,
  parseShopInput,
  PAYAPP_VAR2,
  publicQuote,
  type HistoryRow,
  type Method,
  type Plan,
  type Quote,
} from "../_shared/reels.ts";

export interface CreateOrderInput {
  plan: Plan;
  list_price: number;
  discount: number;
  amount: number;
  is_trial: boolean;
  credit_trial_order_id: string | null;
  shop_name: string;
  insta_id: string;
  phone: string;
  email: string;
  method: Method;
  view_key_hash: string;
  consent_version: string;
}

export type CreateOrderResult =
  | { ok: true; order_id: string; order_no: string; amount: number; expired_ids?: string[] }
  | { ok: false; reason: string };

export interface CheckoutDeps {
  secrets: () => PayAppSecrets | null;
  /** reels_settings.enabled */
  enabled: () => Promise<boolean>;
  /** reels_shop_history(_insta, _phone) */
  history: (insta: string, phone: string) => Promise<HistoryRow[]>;
  /** reels_create_order(_o) */
  createOrder: (o: CreateOrderInput) => Promise<CreateOrderResult>;
  /** reels_mark_requested(_order_id, _mul_no, _payurl, _error) */
  markRequested: (
    orderId: string,
    mulNo: string | null,
    payurl: string | null,
    error: string | null,
  ) => Promise<void>;
  fetch: FetchLike;
  now: () => Date;
  feedbackUrl: string;
  /** 결제 뒤 돌아올 사이트(기본 https://ai-solution.co.kr) */
  siteUrl: string;
  newViewKey?: () => string;
  log?: (...a: unknown[]) => void;
}

export const NOT_READY = {
  ok: false,
  reason: "not_ready",
  error:
    "결제는 준비 중입니다. 잠시 뒤 다시 시도하시거나 contact@ai-solution.co.kr 로 문의해 주세요.",
};
const AMOUNT_CHANGED_ERROR =
  "주문 기록을 다시 확인해 보니 금액이 바뀌었습니다. 바뀐 금액을 확인하신 뒤 다시 결제해 주세요.";
const RETRY_ERROR = "주문이 동시에 들어와 금액을 확정하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
const PAYAPP_ERROR =
  "결제창을 열지 못했습니다. 잠시 뒤 다시 시도하시거나 contact@ai-solution.co.kr 로 문의해 주세요.";

interface CheckoutInput {
  plan: Plan;
  insta: string;
  phone: string;
  shopName: string;
  email: string;
  method: Method;
  quotedAmount: number;
}

function parseCheckout(b: Record<string, unknown>): CheckoutInput | null {
  const shop = parseShopInput(b);
  const shopName = normalizeShopName(b.shop_name);
  const email = normalizeEmail(b.email);
  const q = b.quoted_amount;
  if (!shop || !shopName || !email || !isMethod(b.method)) return null;
  if (typeof q !== "number" || !Number.isInteger(q) || q < 0) return null;
  return { ...shop, shopName, email, method: b.method, quotedAmount: q };
}

function agreedAll(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  return a.terms === true && a.privacy === true && a.payment === true;
}

export function createHandler(deps: CheckoutDeps) {
  const makeKey = deps.newViewKey ?? newViewKey;

  const amountChanged = (q: Quote) =>
    json(
      { ok: false, reason: "amount_changed", quote: publicQuote(q), error: AMOUNT_CHANGED_ERROR },
      409,
    );

  return async (req: Request): Promise<Response> => {
    const body = await readJsonBody(req);
    if (body instanceof Response) return body;
    const input = parseCheckout(body);
    if (!input) {
      return json(
        {
          ok: false,
          reason: "invalid",
          error: `${INVALID_SHOP_ERROR} 상호·이메일·제작 방식도 확인해 주세요.`,
        },
        400,
      );
    }
    if (!agreedAll(body.agree)) {
      return json(
        { ok: false, reason: "consent_required", error: "필수 동의 3개에 모두 체크해 주세요." },
        400,
      );
    }

    const secrets = deps.secrets();
    if (!secrets) return json(NOT_READY, 409);

    try {
      if (!(await deps.enabled())) return json(NOT_READY, 409);

      const key = makeKey();
      const keyHash = await hashViewKey(key);
      let order: Extract<CreateOrderResult, { ok: true }> | null = null;
      let quote: Quote | null = null;

      for (let attempt = 0; attempt < 2 && !order; attempt++) {
        const now = deps.now();
        quote = computeQuote(input, await deps.history(input.insta, input.phone), now);
        if (quote.amount !== input.quotedAmount) return amountChanged(quote);
        const r = await deps.createOrder({
          plan: quote.plan,
          list_price: quote.list_price,
          discount: quote.discount,
          amount: quote.amount,
          is_trial: quote.is_trial,
          credit_trial_order_id: quote.credit_trial_order_id,
          shop_name: input.shopName,
          insta_id: input.insta,
          phone: input.phone,
          email: input.email,
          method: input.method,
          view_key_hash: keyHash,
          consent_version: CONSENT_VERSION,
        });
        if (r.ok) {
          order = r;
          break;
        }
        if (r.reason === "disabled") return json(NOT_READY, 409);
        if (r.reason !== "stale_quote") {
          deps.log?.("[reels-checkout] 주문 거절", { reason: r.reason });
          return json(
            {
              ok: false,
              reason: "invalid",
              error: "주문을 만들지 못했습니다. 입력값을 확인해 주세요.",
            },
            400,
          );
        }
        deps.log?.("[reels-checkout] stale_quote — 다시 계산", { attempt });
      }
      if (!order || !quote) return json({ ok: false, reason: "retry", error: RETRY_ERROR }, 409);

      const res = await callPayApp(
        payRequestParams({
          orderId: order.order_id,
          goodname: goodname(quote.plan),
          price: quote.amount,
          recvphone: input.phone,
          feedbackUrl: deps.feedbackUrl,
          returnUrl: orderPageUrl(deps.siteUrl, order.order_no, key),
          var2: PAYAPP_VAR2,
        }),
        secrets,
        { fetch: deps.fetch, now: deps.now() },
      );
      const mulNo = res.fields.mul_no ?? "";
      const payurl = res.fields.payurl ?? "";
      if (!res.ok || !mulNo || !payurl) {
        const why = (res.error ?? "결제요청번호·결제창 주소 없음").slice(0, 300);
        await deps.markRequested(order.order_id, null, null, why);
        deps.log?.("[reels-checkout] 페이앱 결제창 실패", {
          order: order.order_no,
          code: res.errorCode,
        });
        return json({ ok: false, reason: "payapp_error", error: PAYAPP_ERROR }, 502);
      }
      await deps.markRequested(order.order_id, mulNo, payurl, null);
      return json({ ok: true, order_no: order.order_no, payurl });
    } catch (e) {
      deps.log?.("[reels-checkout] 실패", errMsg(e).slice(0, 200));
      return json(SERVER_ERROR, 500);
    }
  };
}
