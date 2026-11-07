// 영업 메일(/admin/outreach, /api/admin/outreach, /api/unsubscribe)이 쓰는 설정값.
// src/lib/analytics/env.ts 와 같은 방식으로 읽는다.
// 🚨 서버 전용. 브라우저 코드에서 import 하지 마라.
// 🚨 GMAIL_*·YOUTUBE_API_KEY 는 Worker 비밀값(wrangler secret put)으로만 넣는다. 공개 저장소이므로
//    코드·.env·wrangler.jsonc 에 적지 마라. 응답·로그에도 절대 넣지 마라.
//
// 값이 들어오는 길: process.env(nodejs_compat) 와 nitro 가 매 요청 넣는 globalThis.__env__. 뒤가 앞을 덮는다.

export type OutreachEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** 구글 클라우드 OAuth 클라이언트(데스크톱 앱) — nancoco0705@gmail.com 의 gmail.send 권한 */
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  /** 위 클라이언트로 nancoco0705@gmail.com 이 한 번 동의해 받은 리프레시 토큰 */
  GMAIL_REFRESH_TOKEN?: string;
  /** YouTube Data API v3 키 — 후보 매일 고르기(src/server/outreach-tasks/pick-task.ts). 🚨 비밀값, 로그·응답에 넣지 마라 */
  YOUTUBE_API_KEY?: string;
};

const KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "GMAIL_REFRESH_TOKEN",
  "YOUTUBE_API_KEY",
] as const;

type Bag = Record<string, unknown>;

function pick(src: Bag | undefined): OutreachEnv {
  const out: OutreachEnv = {};
  if (!src) return out;
  for (const k of KEYS) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

/** cfEnv: 예약 실행(nitro task)의 context.cloudflare.env. 있으면 가장 우선한다(blog-automation/env.ts 와 같은 방식). */
export function readOutreachEnv(cfEnv?: unknown): OutreachEnv {
  const proc = typeof process !== "undefined" ? (process.env as Bag) : undefined;
  const nitroEnv = (globalThis as { __env__?: Bag }).__env__;
  return { ...pick(proc), ...pick(nitroEnv), ...pick(cfEnv as Bag | undefined) };
}
