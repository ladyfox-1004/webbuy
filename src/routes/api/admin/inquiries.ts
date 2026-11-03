// GET /api/admin/inquiries — 관리자 문의 화면(/admin/inquiries)용 최근 문의 100건.
// 카톡 알림의 "문의 보기" 단추가 이 화면을 연다. 인증: Bearer <관리자 access token>
// 🚨 anon 에는 inquiries 읽기 정책이 없다(개인정보). 그래서 service_role 로 서버에서만 읽는다.
import { createFileRoute } from "@tanstack/react-router";
import { readNotifyEnv } from "@/lib/notify/env";
import { checkAdmin, json } from "@/lib/notify/admin-auth";
import { createNotifyServiceClient } from "@/lib/notify/token-store";

const BASE_COLS =
  "id, created_at, name, contact, services, notes, reference_links, file_name, source";

export const Route = createFileRoute("/api/admin/inquiries")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const env = readNotifyEnv();
        const db = createNotifyServiceClient(env);
        if (!db) return json({ error: "서버 설정 누락(SUPABASE_SERVICE_ROLE_KEY)" }, 500);
        const denied = await checkAdmin(request, db);
        if (denied) return denied;

        const withNotify = await db
          .from("inquiries")
          .select(`${BASE_COLS}, sheet_notify_status, kakao_notify_status`)
          .order("created_at", { ascending: false })
          .limit(100);
        if (!withNotify.error) return json({ rows: withNotify.data, notifyColumns: true });

        // 마이그레이션(알림 결과 칸) 전이면 기본 칸만
        const basic = await db
          .from("inquiries")
          .select(BASE_COLS)
          .order("created_at", { ascending: false })
          .limit(100);
        if (basic.error)
          return json({ error: `문의를 읽지 못했습니다 [${basic.error.code ?? "?"}]` }, 500);
        return json({ rows: basic.data, notifyColumns: false });
      },
    },
  },
});
