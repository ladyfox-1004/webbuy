// POST /api/admin/blog/run  { job: "collect" | "publish" }
// 관리자 화면의 "지금 수집 실행" / "지금 예약 발행 실행" 버튼. 예약 실행과 같은 작업 함수를 부른다.
// 인증: Authorization: Bearer <로그인한 사용자 access token>
//   → service 클라이언트로 auth.getUser(token) → user_roles 에 role='admin' 이 있어야 한다. 아니면 401/403.

import { createFileRoute } from "@tanstack/react-router";
import { createServiceClient, readAutomationEnv } from "@/lib/blog-automation/env";
import { runCollectJob, runPublishJob } from "@/lib/blog-automation/jobs";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/admin/blog/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = readAutomationEnv();
        const db = createServiceClient(env);
        if (!db) {
          console.error(
            "[blog-automation] run API: 키 없음(SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY)",
          );
          return json({ error: "서버 설정 누락(SUPABASE_SERVICE_ROLE_KEY)" }, 500);
        }

        const token = (request.headers.get("authorization") ?? "")
          .replace(/^Bearer\s+/i, "")
          .trim();
        if (!token) return json({ error: "로그인이 필요합니다." }, 401);
        const { data: u, error: authErr } = await db.auth.getUser(token);
        if (authErr || !u.user) return json({ error: "로그인이 만료됐습니다." }, 401);
        const { data: role, error: roleErr } = await db
          .from("user_roles")
          .select("role")
          .eq("user_id", u.user.id)
          .eq("role", "admin")
          .maybeSingle();
        if (roleErr) return json({ error: `권한 확인 실패: ${roleErr.message}` }, 500);
        if (!role) return json({ error: "관리자만 실행할 수 있습니다." }, 403);

        let job: unknown;
        try {
          job = ((await request.json()) as { job?: unknown })?.job;
        } catch {
          return json({ error: "요청 본문이 JSON 이 아닙니다." }, 400);
        }
        if (job === "collect") return json(await runCollectJob(env));
        if (job === "publish") return json(await runPublishJob(env));
        return json({ error: 'job 은 "collect" 또는 "publish" 여야 합니다.' }, 400);
      },
    },
  },
});
