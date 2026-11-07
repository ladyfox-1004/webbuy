// GET /api/admin/visits — 관리자 방문 기록 화면(/admin/visits)용 집계.
// 인증: Bearer <관리자 access token> (api/admin/inquiries.ts 와 같은 checkAdmin)
// 우리 기록 = public.site_visit_stats(30) RPC(service_role 전용). Cloudflare 숫자 = CF_ANALYTICS_TOKEN 이 있을 때만.
// 🚨 토큰은 응답에 절대 넣지 않는다(connected 여부만).
import { createFileRoute } from "@tanstack/react-router";
import { fetchCfDaily } from "@/lib/analytics/cloudflare";
import { CF_ZONE_TAG, readAnalyticsEnv } from "@/lib/analytics/env";
import { checkAdmin, json } from "@/lib/notify/admin-auth";
import { createNotifyServiceClient } from "@/lib/notify/token-store";

export const Route = createFileRoute("/api/admin/visits")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const env = readAnalyticsEnv();
        const db = createNotifyServiceClient(env);
        if (!db) return json({ error: "서버 설정 누락(SUPABASE_SERVICE_ROLE_KEY)" }, 500);
        const denied = await checkAdmin(request, db);
        if (denied) return denied;

        const [stats, cloudflare] = await Promise.all([
          db.rpc("site_visit_stats", { _days: 30 }),
          fetchCfDaily({ token: env.CF_ANALYTICS_TOKEN, zoneTag: CF_ZONE_TAG, days: 30 }),
        ]);
        if (stats.error) {
          return json(
            {
              error: `방문 기록을 읽지 못했습니다 [${stats.error.code ?? "?"}] — 마이그레이션 20261107100000_site_visits.sql 적용 여부를 확인하세요.`,
              cloudflare,
            },
            500,
          );
        }
        return json({ stats: stats.data, cloudflare });
      },
    },
  },
});
