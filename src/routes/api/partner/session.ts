// GET /api/partner/session — 로그인한 사람이 파트너(계정 연결된 승인·일시정지 파트너)·관리자인가.
// 쓰는 곳: 로그인 뒤 갈 곳(src/routes/login.tsx), 사이트 머리 메뉴의 「파트너 대시보드」 링크(src/hooks/useIsPartner.ts).
// 인증: Authorization: Bearer <Supabase access token>. 서버가 토큰 → user → partners.user_id 를 service role 로 확인한다.
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/notify/admin-auth";
import { bearerToken } from "@/lib/partner/account";
import { isAdminUser, partnerDb, userFromToken } from "@/lib/partner/server";

export const Route = createFileRoute("/api/partner/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = bearerToken(request.headers.get("authorization"));
        if (!token) return json({ ok: false, partner: false, admin: false }, 401);
        const db = partnerDb();
        if (!db) return json({ ok: false, partner: false, admin: false }, 503);
        const user = await userFromToken(db, token).catch(() => null);
        if (!user) return json({ ok: false, partner: false, admin: false }, 401);
        const [admin, s] = await Promise.all([
          isAdminUser(db, user.id).catch(() => false),
          db.rpc("partner_session", { _user_id: user.id }).then(
            (r) => (r.error ? null : (r.data as { partner?: boolean; name?: string } | null)),
            () => null,
          ),
        ]);
        return json({ ok: true, admin, partner: s?.partner === true, name: s?.partner ? (s.name ?? null) : null });
      },
    },
  },
});
