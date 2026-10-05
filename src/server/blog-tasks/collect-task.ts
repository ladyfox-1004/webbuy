// 예약 실행(매일 06:00 KST = UTC 21:00): 재생목록 수집 + Gemini 초안.
// 등록: vite.config.ts 의 nitro.tasks / scheduledTasks. 크론은 빌드 때 .output/server/wrangler.json triggers 로 들어간다.
// nitro(cloudflare-module)의 scheduled 핸들러가 ctx.waitUntil(runCronTasks(...)) 로 이 작업을 부른다.
import { defineTask } from "nitro/task";
import { readAutomationEnv } from "../../lib/blog-automation/env";
import { runCollectJob, type CollectResult } from "../../lib/blog-automation/jobs";

export default defineTask({
  meta: { name: "blog:collect", description: "블로그: 유튜브 재생목록 수집 + AI 초안" },
  async run({ context }): Promise<{ result: CollectResult }> {
    const cfEnv = (context as { cloudflare?: { env?: unknown } } | undefined)?.cloudflare?.env;
    return { result: await runCollectJob(readAutomationEnv(cfEnv)) };
  },
});
