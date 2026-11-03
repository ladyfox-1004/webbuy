// GET /api/kakao/callback — 카카오 로그인 뒤 돌아오는 주소(카카오 앱에 Redirect URI 로 등록).
// state 가 /api/admin/kakao(start) 에서 저장한 값과 같고 10분 안이어야 토큰을 저장한다
// → 관리자가 시작한 연결만 받아들인다(로그인 세션은 브라우저에만 있어서 여기서는 state 로 확인).
// 결과는 /admin/kakao-connect?result=... 로 돌려보낸다. 🚨 토큰·코드를 로그나 주소에 남기지 마라.

import { createFileRoute } from "@tanstack/react-router";
import { readNotifyEnv } from "@/lib/notify/env";
import { kakaoRedirectUri } from "@/lib/notify/admin-auth";
import { exchangeAuthCode } from "@/lib/notify/kakao";
import {
  consumePendingState,
  createNotifyServiceClient,
  markConnected,
} from "@/lib/notify/token-store";

function back(request: Request, result: string): Response {
  const u = new URL(request.url);
  return new Response(null, {
    status: 302,
    headers: {
      location: `${u.origin}/admin/kakao-connect?result=${encodeURIComponent(result)}`,
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/kakao/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const code = u.searchParams.get("code");
        const state = u.searchParams.get("state") ?? "";
        const kakaoError = u.searchParams.get("error");
        if (kakaoError)
          return back(request, `denied_${kakaoError.replace(/[^a-z_]/gi, "").slice(0, 40)}`);
        if (!code || !state) return back(request, "missing_code");

        const env = readNotifyEnv();
        const db = createNotifyServiceClient(env);
        if (!db) return back(request, "no_service_key");
        if (!env.KAKAO_REST_API_KEY) return back(request, "no_rest_api_key");

        let stateOk = false;
        try {
          stateOk = await consumePendingState(db, state);
        } catch {
          return back(request, "no_table");
        }
        if (!stateOk) return back(request, "bad_state");

        try {
          const t = await exchangeAuthCode({
            restApiKey: env.KAKAO_REST_API_KEY,
            clientSecret: env.KAKAO_CLIENT_SECRET,
            redirectUri: kakaoRedirectUri(request, env.KAKAO_REDIRECT_URI),
            code,
          });
          await markConnected(db, t.refreshToken, t.refreshTokenExpiresIn);
        } catch (err) {
          const reason =
            err instanceof Error
              ? err.message.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 60)
              : "unknown";
          console.error(`kakao connect failed: ${reason}`);
          return back(request, `failed_${reason}`);
        }
        return back(request, "ok");
      },
    },
  },
});
