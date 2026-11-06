// reels-checkout 엣지 함수(verify_jwt = false). 주문을 만들고 페이앱 결제창 주소를 돌려준다.
// 환경 변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PAYAPP_USERID·PAYAPP_LINKKEY·PAYAPP_LINKVAL·PAYAPP_REQUESTKEY,
//   선택 REELS_SITE_URL(결제 뒤 돌아올 사이트, 기본 https://ai-solution.co.kr)
import { readSecrets } from "../_shared/payapp.ts";
import { json, SERVER_ERROR } from "../_shared/http.ts";
import type { HistoryRow } from "../_shared/reels.ts";
import { reelsEnabled, rpc, siteUrl, supabaseUrl } from "../_shared/supabaseAdmin.ts";
import { createHandler, type CreateOrderResult } from "./handler.ts";

const handler = createHandler({
  secrets: () => readSecrets((n) => Deno.env.get(n)),
  enabled: reelsEnabled,
  history: async (insta, phone) =>
    (await rpc<HistoryRow[] | null>("reels_shop_history", { _insta: insta, _phone: phone })) ?? [],
  createOrder: (o) => rpc<CreateOrderResult>("reels_create_order", { _o: o }),
  async markRequested(orderId, mulNo, payurl, error) {
    await rpc("reels_mark_requested", {
      _order_id: orderId,
      _mul_no: mulNo,
      _payurl: payurl,
      _error: error,
    });
  },
  fetch: (input, init) => fetch(input, init),
  now: () => new Date(),
  feedbackUrl: `${supabaseUrl}/functions/v1/reels-feedback`,
  siteUrl,
  log: (...a) => console.warn(...a),
});

Deno.serve(async (req) => {
  try {
    return await handler(req);
  } catch (e) {
    console.error(
      "[reels-checkout] 예외",
      e instanceof Error ? e.message.slice(0, 200) : "unknown",
    );
    return json(SERVER_ERROR, 500);
  }
});
