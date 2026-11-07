// 지메일 API 로 한 통 보내기 — 리프레시 토큰 → access token → users.messages.send.
// 🚨 토큰·비밀값은 오류 문구·로그·응답에 절대 넣지 마라. 오류에는 HTTP 번호와 구글이 준 짧은 사유만.
// fetch 를 밖에서 받는다(시험에서 가짜로 바꾼다: tests/outreach-service.test.ts).

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export type GmailCreds = {
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
};

export const GMAIL_NOT_CONNECTED = "지메일 연결 안 됨 — 워커 비밀값 GMAIL_CLIENT_ID·GMAIL_CLIENT_SECRET·GMAIL_REFRESH_TOKEN 을 넣어 주세요.";

export function gmailConnected(env: GmailCreds): boolean {
  return !!(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN);
}

/** 구글 응답에서 짧은 사유만 꺼낸다(값이 길거나 이상하면 버린다). */
function shortReason(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as { error?: unknown; error_description?: unknown };
  const parts: string[] = [];
  if (typeof b.error === "string") parts.push(b.error);
  else if (b.error && typeof b.error === "object") {
    const m = (b.error as { message?: unknown }).message;
    if (typeof m === "string") parts.push(m);
  }
  if (typeof b.error_description === "string") parts.push(b.error_description);
  return parts.join(" — ").replace(/\s+/g, " ").slice(0, 200);
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function gmailAccessToken(env: GmailCreds, fetchFn: FetchFn = fetch): Promise<string> {
  if (!gmailConnected(env)) throw new Error(GMAIL_NOT_CONNECTED);
  const res = await fetchFn("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID!,
      client_secret: env.GMAIL_CLIENT_SECRET!,
      refresh_token: env.GMAIL_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }).toString(),
  });
  const body = await readJson(res);
  const token = (body as { access_token?: unknown } | null)?.access_token;
  if (!res.ok || typeof token !== "string" || !token) {
    const why = shortReason(body);
    throw new Error(`지메일 로그인 실패(HTTP ${res.status}${why ? `: ${why}` : ""}) — 리프레시 토큰을 다시 받아야 할 수 있습니다.`);
  }
  return token;
}

/** 보낸 메일의 지메일 id 를 돌려준다. 실패하면 짧은 사유로 throw. */
export async function gmailSendRaw(raw: string, accessToken: string, fetchFn: FetchFn = fetch): Promise<string> {
  const res = await fetchFn("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  const body = await readJson(res);
  const id = (body as { id?: unknown } | null)?.id;
  if (!res.ok || typeof id !== "string" || !id) {
    const why = shortReason(body);
    throw new Error(`지메일 보내기 실패(HTTP ${res.status}${why ? `: ${why}` : ""})`);
  }
  return id;
}
