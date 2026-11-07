// 로그인 뒤 갈 곳 고르기(순수 함수, 브라우저·시험 공용). 화면: src/routes/login.tsx. 시험: tests/partner-account.test.ts
// 🚨 같은 사이트 안 /admin·/partner 경로만 허용한다(외부 주소로 튕기는 열린 리다이렉트 방지).
//    「//evil.com」「/\evil.com」(브라우저가 // 로 읽는다)·제어 문자·「/admin@evil」 같은 것은 막는다.

const ALLOWED = ["/admin", "/partner"];

export function safeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 500) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(raw)) return null;
  const path = raw.split(/[?#]/)[0];
  if (path.includes("@") || path.includes(":")) return null;
  const ok = ALLOWED.some((p) => path === p || path.startsWith(`${p}/`));
  return ok ? raw : null;
}

/** next 가 있으면 그곳, 없으면 관리자는 기존대로 홈(/), 파트너(계정 연결된 승인 파트너)는 /partner/dashboard, 그 밖은 홈 */
export function postLoginTarget(o: { next: string | null; admin: boolean; partner: boolean }): string {
  if (o.next) return o.next;
  if (o.admin) return "/";
  if (o.partner) return "/partner/dashboard";
  return "/";
}
