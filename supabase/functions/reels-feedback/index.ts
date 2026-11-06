// reels-feedback 엣지 함수(verify_jwt = false). 페이앱 결제 결과 통보를 받는다.
// 통보 주소: <SUPABASE_URL>/functions/v1/reels-feedback (reels-checkout 이 payrequest 의 feedbackurl 로 넣는다)
// 환경 변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PAYAPP_* 4개, RESEND_API_KEY(없으면 메일만 건너뛰고 mail_status 'skipped:메일 미설정'),
//   선택 REELS_SITE_URL(메일 속 주문 화면 링크)
import { readSecrets } from "../_shared/payapp.ts";
import type { ReelsMailData } from "../_shared/reelsMail.ts";
import { rpc, siteUrl } from "../_shared/supabaseAdmin.ts";
import { createHandler, type ApplyOutcome } from "./handler.ts";

const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
  .EdgeRuntime;
const edgeWaitUntil = edgeRuntime?.waitUntil
  ? (p: Promise<unknown>) => edgeRuntime.waitUntil!(p)
  : null;

const handler = createHandler({
  secrets: () => readSecrets((n) => Deno.env.get(n)),
  async record(payload, source, verified, verifyError) {
    const id = await rpc<number | string>("reels_record_event", {
      _payload: payload,
      _source: source,
      _verified: verified,
      _verify_error: verifyError,
    });
    return Number(id);
  },
  async apply(eventId) {
    const d =
      (await rpc<Partial<ApplyOutcome> | null>("reels_apply_event", { _event_id: eventId })) ?? {};
    return {
      result: d.result ?? "error",
      detail: d.detail ?? null,
      order_id: d.order_id ?? null,
      send_mail: d.send_mail === true,
    };
  },
  mailClaim: (orderId, keyHash) =>
    rpc<ReelsMailData | null>("reels_mail_claim", { _order_id: orderId, _new_key_hash: keyHash }),
  async mailDone(orderId, status) {
    await rpc("reels_mail_done", { _order_id: orderId, _status: status });
  },
  resendKey: () => Deno.env.get("RESEND_API_KEY") ?? "",
  fetch: (input, init) => fetch(input, init),
  siteUrl,
  // Supabase 엣지 런타임이면 응답을 먼저 보내고 메일은 뒤에서(EdgeRuntime.waitUntil). 없으면 기다렸다가 응답한다.
  defer: edgeWaitUntil ? (task) => edgeWaitUntil(task) : undefined,
  now: () => new Date(),
  log: (...a) => console.warn(...a),
});

// 페이앱은 본문 SUCCESS/FAIL 만 읽으므로 응답 형식을 이 함수가 끝까지 정한다.
Deno.serve(async (req) => {
  try {
    return await handler(req);
  } catch (e) {
    console.error(
      "[reels-feedback] 처리 중 예외",
      e instanceof Error ? e.message.slice(0, 200) : "unknown",
    );
    return new Response("FAIL", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
});
