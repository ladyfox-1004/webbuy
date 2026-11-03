// 상담 접수 알림(구글 시트·카카오톡)이 쓰는 설정값.
// 🚨 서버 전용. 브라우저 코드에서 import 하지 마라.
// 🚨 값은 모두 Worker 비밀값(wrangler secret put)으로만 넣는다. 공개 저장소이므로
//    코드·.env·wrangler.jsonc 에 적지 마라.
//
// 값이 들어오는 길(src/lib/blog-automation/env.ts 와 같다):
//  process.env(nodejs_compat) 와 nitro 가 매 요청 넣는 globalThis.__env__. 뒤가 앞을 덮는다.

export type NotifyEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** Apps Script 웹 앱 주소(…/exec). 없으면 시트 알림을 건너뛴다. */
  INQUIRY_SHEET_WEBHOOK_URL?: string;
  /** Apps Script 스크립트 속성 TOKEN 과 같은 값 */
  INQUIRY_SHEET_TOKEN?: string;
  /** 카카오 디벨로퍼스 앱의 REST API 키 */
  KAKAO_REST_API_KEY?: string;
  /** 카카오 앱에서 Client Secret 을 "사용함"으로 켰을 때만 */
  KAKAO_CLIENT_SECRET?: string;
  /** 처음 한 번 손으로 넣는 리프레시 토큰(선택). DB(kakao_oauth_tokens)에 값이 있으면 그쪽이 우선이다. */
  KAKAO_REFRESH_TOKEN?: string;
  /** 리다이렉트 주소를 고정하고 싶을 때(선택). 없으면 요청 주소 + /api/kakao/callback */
  KAKAO_REDIRECT_URI?: string;
};

const KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "INQUIRY_SHEET_WEBHOOK_URL",
  "INQUIRY_SHEET_TOKEN",
  "KAKAO_REST_API_KEY",
  "KAKAO_CLIENT_SECRET",
  "KAKAO_REFRESH_TOKEN",
  "KAKAO_REDIRECT_URI",
] as const;

type Bag = Record<string, unknown>;

function pick(src: Bag | undefined): NotifyEnv {
  const out: NotifyEnv = {};
  if (!src) return out;
  for (const k of KEYS) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

export function readNotifyEnv(): NotifyEnv {
  const proc = typeof process !== "undefined" ? (process.env as Bag) : undefined;
  const nitroEnv = (globalThis as { __env__?: Bag }).__env__;
  return { ...pick(proc), ...pick(nitroEnv) };
}

/** 카톡 알림의 "문의 보기" 단추가 여는 관리자 화면. 카카오 앱의 Web 플랫폼 도메인에 이 도메인을 등록해야 링크가 열린다. */
export const SITE_URL = "https://ai-solution.co.kr";
export const ADMIN_INQUIRIES_URL = `${SITE_URL}/admin/inquiries`;
