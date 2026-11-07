// 예약 실행(매시 15분·45분, 크론 "15,45 * * * *"): 영업 메일 후보 매일 고르기(노트북 outreach/daily/pick.py 를 옮김).
// 등록: vite.config.ts 의 nitro.tasks / scheduledTasks. 발송 크론(*/30)과 다른 시각이라 실행이 따로 잡히고,
// 무료 요금제의 「실행당 외부 호출 50개」 한도도 따로 쓴다.
// 시간 창(한국 시간 05:00~19:30)·스위치(outreach_settings.auto_pick)·하루 10곳·쿼터 판단은 src/lib/outreach/pick.ts runPick 이 한다.
// 여기서는 실제 연결만 만든다. 🚨 비밀값(SUPABASE_SERVICE_ROLE_KEY·YOUTUBE_API_KEY)은 cfEnv 우선, 로그에 넣지 않는다.
import { defineTask } from "nitro/task";
import { createNotifyServiceClient } from "../../lib/notify/token-store";
import { readOutreachEnv } from "../../lib/outreach/env";
import { runPick, type PickResult } from "../../lib/outreach/pick";
import { supabasePickStore } from "../../lib/outreach/pick-store";

export default defineTask({
  meta: { name: "outreach:pick", description: "영업 메일: 후보 풀에서 오늘 10곳 골라 outreach_drafts 에 넣기(조금씩)" },
  async run({ context }): Promise<{ result: PickResult | { reason: "no_db" } }> {
    const cfEnv = (context as { cloudflare?: { env?: unknown } } | undefined)?.cloudflare?.env;
    const env = readOutreachEnv(cfEnv);
    const db = createNotifyServiceClient(env);
    if (!db) {
      console.error("[outreach:pick] 서버 설정 누락(SUPABASE_SERVICE_ROLE_KEY) — 안 고름");
      return { result: { reason: "no_db" } };
    }
    const result = await runPick({
      store: supabasePickStore(db),
      youtubeKey: env.YOUTUBE_API_KEY,
      fetchFn: (url) => fetch(url),
    });
    return { result };
  },
});
