// reels-quote: {plan, insta, phone} → 서버가 정한 금액·사유. 기록은 남기지 않는다(설계서 5절).
// ready = 페이앱 비밀값 4개가 다 있고 reels_settings.enabled 가 켜져 있음(화면은 false 면 결제 단추를 「준비 중」으로).
import type { PayAppSecrets } from "../_shared/payapp.ts";
import { errMsg, json, readJsonBody, SERVER_ERROR } from "../_shared/http.ts";
import {
  computeQuote,
  INVALID_SHOP_ERROR,
  parseShopInput,
  publicQuote,
  type HistoryRow,
} from "../_shared/reels.ts";

export interface QuoteDeps {
  secrets: () => PayAppSecrets | null;
  /** reels_settings.enabled */
  enabled: () => Promise<boolean>;
  /** reels_shop_history(_insta, _phone) */
  history: (insta: string, phone: string) => Promise<HistoryRow[]>;
  now: () => Date;
  log?: (...a: unknown[]) => void;
}

export function createHandler(deps: QuoteDeps) {
  return async (req: Request): Promise<Response> => {
    const body = await readJsonBody(req);
    if (body instanceof Response) return body;
    const input = parseShopInput(body);
    if (!input) return json({ ok: false, reason: "invalid", error: INVALID_SHOP_ERROR }, 400);
    try {
      const [history, enabled] = await Promise.all([
        deps.history(input.insta, input.phone),
        deps.enabled(),
      ]);
      const quote = computeQuote(input, history, deps.now());
      return json({
        ok: true,
        quote: publicQuote(quote),
        ready: Boolean(deps.secrets()) && enabled,
      });
    } catch (e) {
      deps.log?.("[reels-quote] 실패", errMsg(e).slice(0, 200));
      return json(SERVER_ERROR, 500);
    }
  };
}
