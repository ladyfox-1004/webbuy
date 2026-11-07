// 카카오 채널 챗봇(POST /api/kakao/skill)이 쓰는 설정값. src/lib/notify/env.ts 와 같은 방식으로 읽는다.
// 🚨 서버 전용. 브라우저 코드에서 import 하지 마라.
// 🚨 KAKAO_SKILL_TOKEN 은 Worker 비밀값(wrangler secret put)으로만 넣는다. 공개 저장소이므로 코드·.env·wrangler.jsonc 에
//    적지 마라. 오픈빌더 스킬 설정의 사용자 헤더 X-Skill-Token 값과 같아야 한다.
// Supabase·카톡 알림 값은 readNotifyEnv, Gemini 값은 readAutomationEnv(블로그 자동화)를 그대로 쓴다.

export type KakaoChatEnv = {
  KAKAO_SKILL_TOKEN?: string;
  /** 챗봇만 다른 Gemini 모델을 쓰고 싶을 때(선택, 공개 값). 없으면 GEMINI_MODEL. */
  KAKAO_CHAT_GEMINI_MODEL?: string;
};

const KEYS = ["KAKAO_SKILL_TOKEN", "KAKAO_CHAT_GEMINI_MODEL"] as const;
type Bag = Record<string, unknown>;

function pick(src: Bag | undefined): KakaoChatEnv {
  const out: KakaoChatEnv = {};
  if (!src) return out;
  for (const k of KEYS) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

export function readKakaoChatEnv(): KakaoChatEnv {
  const proc = typeof process !== "undefined" ? (process.env as Bag) : undefined;
  const nitroEnv = (globalThis as { __env__?: Bag }).__env__;
  return { ...pick(proc), ...pick(nitroEnv) };
}
