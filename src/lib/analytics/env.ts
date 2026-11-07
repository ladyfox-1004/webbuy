// 방문 기록·관리자 방문 화면이 쓰는 설정값. src/lib/notify/env.ts 와 같은 방식으로 읽는다.
// 🚨 서버 전용. 브라우저 코드에서 import 하지 마라.
// 🚨 CF_ANALYTICS_TOKEN(Cloudflare 읽기 전용 API 토큰)은 Worker 비밀값(wrangler secret put)으로만 넣는다.
//    공개 저장소이므로 코드·.env·wrangler.jsonc 에 적지 마라. 응답에도 절대 넣지 마라.
//
// 값이 들어오는 길: process.env(nodejs_compat) 와 nitro 가 매 요청 넣는 globalThis.__env__. 뒤가 앞을 덮는다.

export type AnalyticsEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** Cloudflare API 토큰(권한: Zone · Analytics · Read, 대상 ai-solution.co.kr). 없으면 Cloudflare 칸은 안내만. */
  CF_ANALYTICS_TOKEN?: string;
};

const KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CF_ANALYTICS_TOKEN"] as const;

type Bag = Record<string, unknown>;

function pick(src: Bag | undefined): AnalyticsEnv {
  const out: AnalyticsEnv = {};
  if (!src) return out;
  for (const k of KEYS) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

export function readAnalyticsEnv(): AnalyticsEnv {
  const proc = typeof process !== "undefined" ? (process.env as Bag) : undefined;
  const nitroEnv = (globalThis as { __env__?: Bag }).__env__;
  return { ...pick(proc), ...pick(nitroEnv) };
}

/** ai-solution.co.kr 의 Cloudflare zone tag(공개 식별자, 비밀 아님) */
export const CF_ZONE_TAG = "6f84749cf40269bd78a999d53c7fc3e4";
