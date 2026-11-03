// /api/admin/kakao — 카카오톡 "나에게 보내기" 연결 관리(관리자 전용)
//   GET                      연결 상태(리프레시 토큰 있음/만료일, 키 설정 여부, 등록할 리다이렉트 주소)
//   POST { action:"start" }  카카오 로그인 주소를 만든다(state 10분 저장) → 화면이 그 주소로 이동
//   POST { action:"test" }   시험 메시지 한 통을 대표님 카톡으로 보낸다(고객 정보 없음)
// 인증: Authorization: Bearer <로그인한 관리자 access token>
// 🚨 토큰·키를 응답이나 로그에 내보내지 마라.

import { createFileRoute } from "@tanstack/react-router";
import { ADMIN_INQUIRIES_URL, readNotifyEnv } from "@/lib/notify/env";
import { checkAdmin, json, kakaoRedirectUri } from "@/lib/notify/admin-auth";
import { buildAuthorizeUrl, sendKakaoNotice } from "@/lib/notify/kakao";
import {
  createNotifyServiceClient,
  readConnection,
  savePendingState,
  supabaseTokenStore,
} from "@/lib/notify/token-store";

export const Route = createFileRoute("/api/admin/kakao")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const env = readNotifyEnv();
        const db = createNotifyServiceClient(env);
        if (!db) return json({ error: "서버 설정 누락(SUPABASE_SERVICE_ROLE_KEY)" }, 500);
        const denied = await checkAdmin(request, db);
        if (denied) return denied;
        let conn: Awaited<ReturnType<typeof readConnection>> | null = null;
        let tableMissing = false;
        try {
          conn = await readConnection(db);
        } catch {
          tableMissing = true; // 마이그레이션 전
        }
        return json({
          connected: conn?.connected ?? false,
          refreshTokenExpiresAt: conn?.refreshTokenExpiresAt ?? null,
          connectedAt: conn?.connectedAt ?? null,
          updatedAt: conn?.updatedAt ?? null,
          tableMissing,
          hasRestApiKey: !!env.KAKAO_REST_API_KEY,
          hasClientSecret: !!env.KAKAO_CLIENT_SECRET,
          hasSeedRefreshToken: !!env.KAKAO_REFRESH_TOKEN,
          redirectUri: kakaoRedirectUri(request, env.KAKAO_REDIRECT_URI),
        });
      },
      POST: async ({ request }) => {
        const env = readNotifyEnv();
        const db = createNotifyServiceClient(env);
        if (!db) return json({ error: "서버 설정 누락(SUPABASE_SERVICE_ROLE_KEY)" }, 500);
        const denied = await checkAdmin(request, db);
        if (denied) return denied;

        let action: unknown;
        try {
          action = ((await request.json()) as { action?: unknown })?.action;
        } catch {
          return json({ error: "요청 본문이 JSON 이 아닙니다." }, 400);
        }

        if (action === "start") {
          if (!env.KAKAO_REST_API_KEY)
            return json({ error: "KAKAO_REST_API_KEY 시크릿이 없습니다." }, 400);
          const state =
            crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
          try {
            await savePendingState(db, state);
          } catch {
            return json(
              { error: "kakao_oauth_tokens 표가 없습니다. 마이그레이션을 먼저 적용하세요." },
              500,
            );
          }
          const redirectUri = kakaoRedirectUri(request, env.KAKAO_REDIRECT_URI);
          return json({
            url: buildAuthorizeUrl({ restApiKey: env.KAKAO_REST_API_KEY, redirectUri, state }),
            redirectUri,
          });
        }

        if (action === "test") {
          const status = await sendKakaoNotice(
            {
              id: "test",
              receivedAt: new Date().toISOString(),
              name: "연결 시험",
              contact: "(시험 메시지 — 고객 정보 아님)",
              services: ["홈페이지·랜딩페이지 제작"],
              topic: "",
              notes: "관리자 화면에서 보낸 시험 메시지입니다.",
              referenceLinks: "",
              hasAttachment: false,
              fileName: "",
              attachmentFailed: false,
              source: "test",
            },
            {
              restApiKey: env.KAKAO_REST_API_KEY,
              clientSecret: env.KAKAO_CLIENT_SECRET,
              seedRefreshToken: env.KAKAO_REFRESH_TOKEN,
            },
            supabaseTokenStore(db),
            ADMIN_INQUIRIES_URL,
          );
          return json({ status });
        }

        return json({ error: 'action 은 "start" 또는 "test" 여야 합니다.' }, 400);
      },
    },
  },
});
