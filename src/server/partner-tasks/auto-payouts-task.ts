// 예약 실행(30분마다, 크론 "*/30 * * * *" — 영업 메일 자동 발송과 같은 크론에 함께 붙였다. 크론 트리거를 늘리지 않으려고):
// 매월 1일 한국 시간 09:00 이후 첫 실행에 지난달 파트너 정산을 만들고 대표님 카톡.
// 판단(1일 09시·멱등·카톡 차례)은 src/lib/partner/auto-payout.ts runAutoPayouts 와 public.partner_auto_payouts 가 한다.
// 🚨 같은 실행 안에서 outreach:auto-send 와 동시에 돈다(nitro runCronTasks = Promise.all) → 외부 호출 50개 한도를 나눠 쓴다.
//    이 작업은 1일이 아니면 0개, 1일에도 최대 6개. 영업 메일은 하루 10곳이라 한 실행 최대 32개 → 합쳐도 38개.
// 🚨 예약 실행에는 관리자 토큰이 없다 — service_role 클라이언트로 바로 DB·카톡. 비밀값은 cfEnv 우선, 로그에 넣지 않는다.
import { defineTask } from "nitro/task";
import { readNotifyEnv } from "../../lib/notify/env";
import { buildKakaoTextTemplate, sendKakaoTemplate } from "../../lib/notify/kakao";
import { createNotifyServiceClient, supabaseTokenStore } from "../../lib/notify/token-store";
import { ADMIN_PARTNERS_URL } from "../../lib/partner/apply";
import { autoPayoutDue, runAutoPayouts, type AutoPayoutResult, type AutoPayoutRpc } from "../../lib/partner/auto-payout";

export default defineTask({
  meta: { name: "partner:auto-payouts", description: "파트너: 매월 1일 09시 지난달 정산 자동 생성 + 카톡" },
  async run({ context }): Promise<{ result: AutoPayoutResult | { reason: "no_db" } }> {
    const now = new Date();
    // 1일 09시가 아니면 DB 클라이언트도 만들지 않는다(외부 호출 0개)
    if (!autoPayoutDue(now)) return { result: { ran: false, reason: "not_due" } };
    const cfEnv = (context as { cloudflare?: { env?: unknown } } | undefined)?.cloudflare?.env;
    const env = readNotifyEnv(cfEnv);
    const db = createNotifyServiceClient(env);
    if (!db) {
      console.error("[partner:auto-payouts] 서버 설정 누락(SUPABASE_SERVICE_ROLE_KEY) — 정산 안 만듦");
      return { result: { reason: "no_db" } };
    }
    const result = await runAutoPayouts({
      now,
      run: async (nowIso) => {
        const { data, error } = await db.rpc("partner_auto_payouts", { _now: nowIso });
        if (error) throw new Error(`rpc_${error.code ?? "?"}`);
        return data as unknown as AutoPayoutRpc;
      },
      notify: (text) =>
        sendKakaoTemplate(
          buildKakaoTextTemplate(text, ADMIN_PARTNERS_URL, "정산 보기"),
          {
            restApiKey: env.KAKAO_REST_API_KEY,
            clientSecret: env.KAKAO_CLIENT_SECRET,
            seedRefreshToken: env.KAKAO_REFRESH_TOKEN,
          },
          supabaseTokenStore(db),
        ),
      recordNotify: async (runMonth, status) => {
        const { error } = await db.rpc("partner_auto_payouts_notified", { _run_month: runMonth, _status: status });
        if (error) throw new Error(`rpc_${error.code ?? "?"}`);
      },
    });
    return { result };
  },
});
