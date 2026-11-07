// 예약 실행(30분마다, 크론 "*/30 * * * *"): 영업 메일 자동 발송.
// 등록: vite.config.ts 의 nitro.tasks / scheduledTasks. 크론은 빌드 때 .output/server/wrangler.json triggers 로 들어간다.
// 시간 창(한국 시간 매일 07:00~20:00)·스위치(outreach_settings.auto_send)·오늘 날짜만 보내기 판단은
// src/lib/outreach/auto.ts runAutoSend 가 한다. 여기서는 실제 연결만 만든다.
// 🚨 예약 실행에는 관리자 토큰이 없다 — service_role 클라이언트로 바로 DB·지메일. 비밀값은 cfEnv 우선.
import { defineTask } from "nitro/task";
import { readNotifyEnv } from "../../lib/notify/env";
import { buildKakaoTextTemplate, sendKakaoTemplate } from "../../lib/notify/kakao";
import { createNotifyServiceClient, supabaseTokenStore } from "../../lib/notify/token-store";
import { ADMIN_OUTREACH_URL, runAutoSend, type AutoSendResult } from "../../lib/outreach/auto";
import { readOutreachEnv } from "../../lib/outreach/env";
import { supabaseAutoSendStore, supabaseOutreachStore } from "../../lib/outreach/store";

export default defineTask({
  meta: { name: "outreach:auto-send", description: "영업 메일: 오늘 묶음 ready 자동 발송 + 카톡 알림" },
  async run({ context }): Promise<{ result: AutoSendResult | { reason: "no_db" } }> {
    const cfEnv = (context as { cloudflare?: { env?: unknown } } | undefined)?.cloudflare?.env;
    const env = readOutreachEnv(cfEnv);
    const db = createNotifyServiceClient(env);
    if (!db) {
      console.error("[outreach:auto] 서버 설정 누락(SUPABASE_SERVICE_ROLE_KEY) — 안 보냄");
      return { result: { reason: "no_db" } };
    }
    const kakaoEnv = readNotifyEnv(cfEnv);
    const result = await runAutoSend({
      store: supabaseOutreachStore(db),
      auto: supabaseAutoSendStore(db),
      env,
      notify: (text) =>
        sendKakaoTemplate(
          buildKakaoTextTemplate(text, ADMIN_OUTREACH_URL, "영업 메일 보기"),
          {
            restApiKey: kakaoEnv.KAKAO_REST_API_KEY,
            clientSecret: kakaoEnv.KAKAO_CLIENT_SECRET,
            seedRefreshToken: kakaoEnv.KAKAO_REFRESH_TOKEN,
          },
          supabaseTokenStore(db),
        ),
    });
    return { result };
  },
});
