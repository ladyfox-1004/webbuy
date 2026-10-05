// 예약 실행(화·금 09:00 KST = UTC 00:00 TUE,FRI): 발행 예정 글 1편 발행.
// 등록: vite.config.ts 의 nitro.tasks / scheduledTasks.
import { defineTask } from "nitro/task";
import { readAutomationEnv } from "../../lib/blog-automation/env";
import { runPublishJob, type PublishResult } from "../../lib/blog-automation/jobs";

export default defineTask({
  meta: { name: "blog:publish", description: "블로그: 발행 예정 글 1편 발행" },
  async run({ context }): Promise<{ result: PublishResult }> {
    const cfEnv = (context as { cloudflare?: { env?: unknown } } | undefined)?.cloudflare?.env;
    return { result: await runPublishJob(readAutomationEnv(cfEnv)) };
  },
});
