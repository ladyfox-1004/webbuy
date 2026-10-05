// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath } from "node:url";
import type { NitroConfig } from "nitro/types";

// 블로그 예약 실행(Cloudflare Cron Triggers, 시각은 UTC).
// 빌드 때 nitro 가 이 크론들을 .output/server/wrangler.json 의 triggers.crons 로 넣고,
// 워커의 scheduled 핸들러가 controller.cron 문자열로 아래 작업을 골라 ctx.waitUntil 로 실행한다.
// 🚨 Cloudflare 크론의 요일 숫자는 1=일요일 ~ 7=토요일이다(유닉스 cron 과 다름).
//    "2,5" 라고 쓰면 월·목이 되므로 반드시 영문 약자(TUE,FRI)로 쓴다.
// 🚨 src/server.ts 에 scheduled 를 export 해도 쓰이지 않는다. 배포되는 워커 진입점은 nitro 가 만든
//    .output/server/index.mjs 이고, src/server.ts 는 그 안의 fetch 처리기일 뿐이다.
const nitro = {
  experimental: { tasks: true },
  tasks: {
    // nitro 는 상대 경로를 모듈 이름으로 해석하므로 절대 경로로 넘긴다
    "blog:collect": {
      handler: fileURLToPath(new URL("./src/server/blog-tasks/collect-task.ts", import.meta.url)),
    },
    "blog:publish": {
      handler: fileURLToPath(new URL("./src/server/blog-tasks/publish-task.ts", import.meta.url)),
    },
  },
  scheduledTasks: {
    "0 21 * * *": ["blog:collect"], // 매일 06:00 KST
    "0 0 * * TUE,FRI": ["blog:publish"], // 화·금 09:00 KST
  },
} satisfies NitroConfig;

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // lovable 설정의 nitro 타입은 일부 칸만 적어 두었지만, 실제로는 나머지 nitro 옵션도 그대로 넘긴다
  nitro: nitro as unknown as { preset?: string },
});
