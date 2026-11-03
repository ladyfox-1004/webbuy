// 관리자 API 공통 확인 — /api/admin/blog/run 과 같은 방식.
// 로그인 세션은 브라우저(localStorage)에만 있으므로 화면이 Authorization: Bearer <access token> 을 붙여 부른다.
// service 클라이언트로 auth.getUser(token) → user_roles.role='admin' 이 있어야 통과.
import type { ServiceDb } from "./token-store";

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** 통과하면 null, 아니면 돌려줄 응답 */
export async function checkAdmin(request: Request, db: ServiceDb): Promise<Response | null> {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "로그인이 필요합니다." }, 401);
  const { data: u, error: authErr } = await db.auth.getUser(token);
  if (authErr || !u.user) return json({ error: "로그인이 만료됐습니다." }, 401);
  const { data: role, error: roleErr } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", u.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (roleErr) return json({ error: "권한 확인 실패" }, 500);
  if (!role) return json({ error: "관리자만 쓸 수 있습니다." }, 403);
  return null;
}

/** 카카오에 등록할 리다이렉트 주소. 시크릿 KAKAO_REDIRECT_URI 가 있으면 그것, 없으면 요청 주소 기준. */
export function kakaoRedirectUri(request: Request, fixed?: string): string {
  if (fixed) return fixed;
  const u = new URL(request.url);
  return `${u.origin}/api/kakao/callback`;
}
