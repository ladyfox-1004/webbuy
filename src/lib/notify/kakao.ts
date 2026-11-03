// 카카오톡 "나에게 보내기"로 대표님 카톡에 접수 요약을 보낸다.
//
// 토큰 흐름
//  1) 처음 한 번: /admin/kakao-connect 에서 카카오 로그인(동의 항목 talk_message) →
//     /api/kakao/callback 이 인가 코드를 토큰으로 바꿔 리프레시 토큰을 저장한다.
//  2) 접수마다: 저장된 리프레시 토큰으로 액세스 토큰을 새로 받아 메시지를 보낸다.
//     카카오는 리프레시 토큰 만료가 1개월 안쪽으로 남았을 때 새 리프레시 토큰을 같이 준다 →
//     그때 저장소에 덮어쓴다(안 하면 2개월 뒤 알림이 끊긴다).
//
// 🚨 토큰·키·연락처를 로그에 남기지 마라. 상태 문자열에도 오류 종류만 남긴다.
import type { FetchLike, InquiryNotice, NotifyStatus } from "./types";
import { errorReason } from "./types";

export const KAKAO_AUTH_BASE = "https://kauth.kakao.com";
export const KAKAO_API_BASE = "https://kapi.kakao.com";
export const KAKAO_MEMO_URL = `${KAKAO_API_BASE}/v2/api/talk/memo/default/send`;
export const KAKAO_TOKEN_URL = `${KAKAO_AUTH_BASE}/oauth/token`;
export const KAKAO_SCOPE = "talk_message";

/** 텍스트 템플릿 text 는 최대 200자 */
export const KAKAO_TEXT_MAX = 200;

/** 리프레시 토큰 저장소. 구현은 token-store.ts(Supabase kakao_oauth_tokens). */
export interface KakaoTokenStore {
  load(): Promise<string | null>;
  /** expiresInSec: 카카오가 준 refresh_token_expires_in(초). 모르면 undefined */
  save(refreshToken: string, expiresInSec?: number): Promise<void>;
}

export type KakaoConfig = {
  restApiKey?: string;
  clientSecret?: string;
  /** 저장소가 비어 있을 때 쓰는 처음 값(시크릿 KAKAO_REFRESH_TOKEN) */
  seedRefreshToken?: string;
};

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function clip(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, Math.max(0, max - 1)).join("") + "…" : s;
}

/** 카톡에 보일 접수 요약(200자 이내). 내용은 남은 자리만큼만 넣는다. */
export function buildKakaoText(n: InquiryNotice): string {
  const head = [
    n.source === "test" ? "[홈페이지 상담 접수 · 시험]" : "[홈페이지 상담 접수]",
    `이름: ${clip(oneLine(n.name), 30)}`,
    `연락처: ${clip(oneLine(n.contact), 40)}`,
  ];
  if (n.services.length) head.push(`관심: ${clip(oneLine(n.services.join(", ")), 50)}`);
  if (n.topic.trim()) head.push(`주제: ${clip(oneLine(n.topic), 40)}`);
  if (n.attachmentFailed) head.push("첨부: 업로드 실패");
  else if (n.hasAttachment) head.push("첨부: 있음");
  let text = clip(head.join("\n"), KAKAO_TEXT_MAX);
  const notes = oneLine(n.notes);
  const room = KAKAO_TEXT_MAX - Array.from(text).length - "\n내용: ".length;
  if (notes && room >= 10) text += `\n내용: ${clip(notes, room)}`;
  return text;
}

export function buildKakaoTemplate(n: InquiryNotice, adminUrl: string) {
  return {
    object_type: "text" as const,
    text: buildKakaoText(n),
    link: { web_url: adminUrl, mobile_web_url: adminUrl },
    button_title: "문의 보기",
  };
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_code?: string;
};

async function postForm(
  fetchFn: FetchLike,
  url: string,
  form: Record<string, string>,
  bearer?: string,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
  };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  return fetchFn(url, {
    method: "POST",
    headers,
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(6000),
  });
}

/** 카카오 토큰 응답의 오류를 짧은 이름으로(예: "token_401_invalid_grant") */
async function tokenError(res: Response, prefix: string): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  const code = (body.error ?? body.error_code ?? "")
    .toString()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 40);
  return new Error(`${prefix}_${res.status}${code ? `_${code}` : ""}`);
}

/** 리프레시 토큰 → 액세스 토큰. 새 리프레시 토큰이 오면 같이 돌려준다. */
export async function refreshAccessToken(
  cfg: { restApiKey: string; clientSecret?: string; refreshToken: string },
  fetchFn: FetchLike = fetch,
): Promise<{ accessToken: string; newRefreshToken?: string; refreshTokenExpiresIn?: number }> {
  const form: Record<string, string> = {
    grant_type: "refresh_token",
    client_id: cfg.restApiKey,
    refresh_token: cfg.refreshToken,
  };
  if (cfg.clientSecret) form.client_secret = cfg.clientSecret;
  const res = await postForm(fetchFn, KAKAO_TOKEN_URL, form);
  if (!res.ok) throw await tokenError(res, "token");
  const body = (await res.json()) as TokenResponse;
  if (!body.access_token) throw new Error("token_no_access_token");
  return {
    accessToken: body.access_token,
    newRefreshToken: body.refresh_token || undefined,
    refreshTokenExpiresIn: body.refresh_token_expires_in,
  };
}

/** 인가 코드 → 토큰(처음 연결 때 한 번) */
export async function exchangeAuthCode(
  cfg: { restApiKey: string; clientSecret?: string; redirectUri: string; code: string },
  fetchFn: FetchLike = fetch,
): Promise<{ refreshToken: string; refreshTokenExpiresIn?: number; accessToken: string }> {
  const form: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: cfg.restApiKey,
    redirect_uri: cfg.redirectUri,
    code: cfg.code,
  };
  if (cfg.clientSecret) form.client_secret = cfg.clientSecret;
  const res = await postForm(fetchFn, KAKAO_TOKEN_URL, form);
  if (!res.ok) throw await tokenError(res, "code");
  const body = (await res.json()) as TokenResponse;
  if (!body.access_token || !body.refresh_token) throw new Error("code_no_token");
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    refreshTokenExpiresIn: body.refresh_token_expires_in,
  };
}

export function buildAuthorizeUrl(cfg: { restApiKey: string; redirectUri: string; state: string }) {
  const q = new URLSearchParams({
    client_id: cfg.restApiKey,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: KAKAO_SCOPE,
    state: cfg.state,
  });
  return `${KAKAO_AUTH_BASE}/oauth/authorize?${q.toString()}`;
}

export async function sendMemo(
  accessToken: string,
  template: ReturnType<typeof buildKakaoTemplate>,
  fetchFn: FetchLike = fetch,
): Promise<void> {
  const res = await postForm(
    fetchFn,
    KAKAO_MEMO_URL,
    { template_object: JSON.stringify(template) },
    accessToken,
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: number };
    throw new Error(`memo_${res.status}${typeof body.code === "number" ? `_${body.code}` : ""}`);
  }
}

/**
 * 접수 한 건을 카톡으로 보낸다. 예외를 던지지 않고 상태를 돌려준다.
 * 새 리프레시 토큰을 받았는데 저장이 실패하면 메시지는 보내되 상태에 그 사실을 남긴다
 * ("ok" 대신 "failed:store_save" — 다음 갱신 때까지는 옛 토큰도 쓸 수 있지만 꼭 봐야 한다).
 */
export async function sendKakaoNotice(
  n: InquiryNotice,
  cfg: KakaoConfig,
  store: KakaoTokenStore | null,
  adminUrl: string,
  fetchFn: FetchLike = fetch,
): Promise<NotifyStatus> {
  if (!cfg.restApiKey) return "skipped:no_rest_api_key";
  let refreshToken: string | null = null;
  if (store) {
    try {
      refreshToken = await store.load();
    } catch {
      refreshToken = null; // 표가 아직 없을 수 있다 → 시크릿 값으로
    }
  }
  refreshToken = refreshToken || cfg.seedRefreshToken || null;
  if (!refreshToken) return "skipped:not_connected";

  let accessToken: string;
  let saveFailed = false;
  try {
    const t = await refreshAccessToken(
      { restApiKey: cfg.restApiKey, clientSecret: cfg.clientSecret, refreshToken },
      fetchFn,
    );
    accessToken = t.accessToken;
    if (t.newRefreshToken && t.newRefreshToken !== refreshToken) {
      if (!store) saveFailed = true;
      else {
        try {
          await store.save(t.newRefreshToken, t.refreshTokenExpiresIn);
        } catch {
          saveFailed = true;
        }
      }
    }
  } catch (err) {
    return `failed:${errorReason(err)}`;
  }

  try {
    await sendMemo(accessToken, buildKakaoTemplate(n, adminUrl), fetchFn);
  } catch (err) {
    return `failed:${errorReason(err)}`;
  }
  return saveFailed ? "failed:sent_but_store_save" : "ok";
}
