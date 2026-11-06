// reels-quote 엣지 함수(verify_jwt = false). 금액만 계산해 돌려준다(기록 없음).
// 환경 변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PAYAPP_* 4개(있음/없음만 → ready)
import { readSecrets } from "../_shared/payapp.ts";
import { json, SERVER_ERROR } from "../_shared/http.ts";
import type { HistoryRow } from "../_shared/reels.ts";
import { reelsEnabled, rpc } from "../_shared/supabaseAdmin.ts";
import { createHandler } from "./handler.ts";

const handler = createHandler({
  secrets: () => readSecrets((n) => Deno.env.get(n)),
  enabled: reelsEnabled,
  history: async (insta, phone) =>
    (await rpc<HistoryRow[] | null>("reels_shop_history", { _insta: insta, _phone: phone })) ?? [],
  now: () => new Date(),
  log: (...a) => console.warn(...a),
});

Deno.serve(async (req) => {
  try {
    return await handler(req);
  } catch (e) {
    console.error("[reels-quote] 예외", e instanceof Error ? e.message.slice(0, 200) : "unknown");
    return json(SERVER_ERROR, 500);
  }
});
