// 관리자 파트너 목록 API 처리(서버 전용) — 라우트는 얇게 두고 여기서 관리자 확인·DB 호출·응답을 만든다(시험: tests/partner-admin-list.test.ts).
//   GET  /api/admin/partners?view=list&period=7d|30d|month|all → partner_admin_list (표·합계)
//   GET  /api/admin/partners?view=detail&id=<uuid>            → partner_admin_detail (계좌 변경 이력·최근 수수료·정산)
//   GET  /api/admin/partners?view=summary                     → partner_admin_summary (관리자 첫 화면 카드)
//   GET  /api/admin/partners                                  → partner_admin_overview (예전 그대로: 신청·추천 상담·원장·정산 탭)
//   POST /api/admin/partner-account { id }                    → partner_admin_bank (계좌 전체 보기)
// 🚨 계좌 전체 번호는 handleAccountReveal 응답에만. cache-control: no-store, 로그에는 이유 코드만(번호·이름 금지).
// bun test 에서도 읽으므로 "@/..." 를 쓰지 마라(상대 경로만).
import { checkAdmin, json } from "../notify/admin-auth";
import type { ServiceDb } from "../notify/token-store";
import { isPeriod } from "./admin-list";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HINT = "마이그레이션 20261107190000_partners_admin_list.sql 적용 여부를 확인하세요.";
const OVERVIEW_HINT = "마이그레이션 20261107160000_partners.sql 적용 여부를 확인하세요.";

type Rpc = { ok?: boolean; reason?: string } & Record<string, unknown>;

/** 응답 머리: 개인정보가 있으니 저장하지 않게 */
function privateJson(body: unknown, status = 200): Response {
  const r = json(body, status);
  r.headers.set("cache-control", "no-store, private");
  r.headers.set("x-content-type-options", "nosniff");
  return r;
}

export async function handleAdminPartnersGet(request: Request, db: ServiceDb): Promise<Response> {
  const denied = await checkAdmin(request, db);
  if (denied) return denied;
  const q = new URL(request.url).searchParams;
  const view = q.get("view");

  if (view === "list") {
    const p = q.get("period");
    const period = isPeriod(p) ? p : "30d";
    const { data, error } = await db.rpc("partner_admin_list", { _period: period });
    if (error) {
      console.error(`[admin/partners] 목록(표) 실패 [${error.code ?? "?"}]`);
      return json({ error: `파트너 목록을 읽지 못했습니다 [${error.code ?? "?"}] — ${HINT}` }, 500);
    }
    return privateJson(data);
  }

  if (view === "detail") {
    const id = q.get("id") ?? "";
    if (!UUID_RE.test(id)) return json({ error: "대상이 없습니다." }, 400);
    const { data, error } = await db.rpc("partner_admin_detail", { _id: id });
    if (error) {
      console.error(`[admin/partners] 상세 실패 [${error.code ?? "?"}]`);
      return json({ error: `상세를 읽지 못했습니다 [${error.code ?? "?"}] — ${HINT}` }, 500);
    }
    const r = (data ?? {}) as Rpc;
    if (r.ok !== true) return json({ error: "파트너를 찾지 못했습니다." }, 404);
    return privateJson(r);
  }

  if (view === "summary") {
    const { data, error } = await db.rpc("partner_admin_summary", {});
    if (error) {
      console.error(`[admin/partners] 요약 실패 [${error.code ?? "?"}]`);
      return json({ error: `요약을 읽지 못했습니다 [${error.code ?? "?"}]` }, 500);
    }
    return json(data);
  }

  if (view !== null && view !== "") return json({ error: "모르는 보기입니다." }, 400);

  const { data, error } = await db.rpc("partner_admin_overview", {});
  if (error) {
    console.error(`[admin/partners] 목록 실패 [${error.code ?? "?"}]`);
    return json({ error: `파트너 목록을 읽지 못했습니다 [${error.code ?? "?"}] — ${OVERVIEW_HINT}` }, 500);
  }
  return json(data);
}

/** 계좌 전체 보기. 관리자만. 🚨 응답 본문을 로그에 찍지 마라. */
export async function handleAccountReveal(request: Request, db: ServiceDb): Promise<Response> {
  const denied = await checkAdmin(request, db);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "요청 형식이 틀렸습니다." }, 400);
  }
  const id = body && typeof body === "object" ? (body as Record<string, unknown>).id : null;
  if (typeof id !== "string" || !UUID_RE.test(id)) return json({ error: "대상이 없습니다." }, 400);
  const { data, error } = await db.rpc("partner_admin_bank", { _id: id });
  if (error) {
    console.error(`[admin/partner-account] 계좌 읽기 실패 [${error.code ?? "?"}]`);
    return json({ error: `계좌를 읽지 못했습니다 [${error.code ?? "?"}] — ${HINT}` }, 500);
  }
  const r = (data ?? {}) as Rpc;
  if (r.ok !== true) return json({ error: "파트너를 찾지 못했습니다." }, 404);
  return privateJson({ bank_name: r.bank_name, bank_account: r.bank_account, bank_holder: r.bank_holder });
}
