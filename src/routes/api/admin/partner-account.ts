// POST /api/admin/partner-account { id } — 관리자 파트너 목록 상세 칸의 「계좌 전체 보기」.
// 인증: Bearer <관리자 access token> (checkAdmin). 처리: src/lib/partner/admin-list-api.ts handleAccountReveal
// 🚨 응답에 계좌 전체 번호가 있다. cache-control: no-store, 로그에 내용을 찍지 마라. GET 으로 열지 마라(주소·기록에 남는다).
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/notify/admin-auth";
import { handleAccountReveal } from "@/lib/partner/admin-list-api";
import { partnerDb, sameOrigin } from "@/lib/partner/server";

export const Route = createFileRoute("/api/admin/partner-account")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!sameOrigin(request)) return json({ error: "허용되지 않은 요청입니다." }, 403);
        const db = partnerDb();
        if (!db) return json({ error: "서버 설정 누락(SUPABASE_SERVICE_ROLE_KEY)" }, 500);
        return handleAccountReveal(request, db);
      },
    },
  },
});
