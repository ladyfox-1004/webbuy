// /api/admin/partners — 관리자 파트너 화면(/admin/partners)용.
// 인증: Bearer <관리자 access token> (api/admin/outreach.ts 와 같은 checkAdmin)
//   GET  → public.partner_admin_overview: 파트너(통계)·추천 붙은 상담·수수료 원장·정산 (조회 때 7일 지난 쇼츠 수수료를 payable 로)
//   POST { action: 'set_status', id, status: 'approved'|'rejected'|'paused' } → 승인 때 view_key 생성
//   POST { action: 'inquiry_paid', inquiry_id, amount }  → 상담 계약 결제됨, 10% payable
//   POST { action: 'cancel_commission', id, note? }      → 수수료 취소(지급 완료는 안 됨)
//   POST { action: 'make_payouts', month? }              → 그 달(기본: 한국 시간 이번 달) 정산 만들기
//   POST { action: 'payout_paid', id }                   → 지급 완료
// 🚨 로그에 계좌·전화 전체를 넣지 마라(이유 코드만).
import { createFileRoute } from "@tanstack/react-router";
import { checkAdmin, json } from "@/lib/notify/admin-auth";
import { ADMIN_REASON_TEXT, parseAdminAction } from "@/lib/partner/admin";
import { PARTNER_MIGRATION_HINT, partnerDb } from "@/lib/partner/server";

type RpcResult = { ok?: boolean; reason?: string } & Record<string, unknown>;

export const Route = createFileRoute("/api/admin/partners")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const db = partnerDb();
        if (!db) return json({ error: "서버 설정 누락(SUPABASE_SERVICE_ROLE_KEY)" }, 500);
        const denied = await checkAdmin(request, db);
        if (denied) return denied;
        const { data, error } = await db.rpc("partner_admin_overview", {});
        if (error) {
          console.error(`[admin/partners] 목록 실패 [${error.code ?? "?"}]`);
          return json({ error: `파트너 목록을 읽지 못했습니다 [${error.code ?? "?"}] — ${PARTNER_MIGRATION_HINT}` }, 500);
        }
        return json(data);
      },

      POST: async ({ request }) => {
        const db = partnerDb();
        if (!db) return json({ error: "서버 설정 누락(SUPABASE_SERVICE_ROLE_KEY)" }, 500);
        const denied = await checkAdmin(request, db);
        if (denied) return denied;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "요청 형식이 틀렸습니다." }, 400);
        }
        const a = parseAdminAction(body);
        if ("error" in a) return json({ error: a.error }, 400);

        const call = async () => {
          switch (a.action) {
            case "set_status":
              return db.rpc("partner_set_status", { _id: a.id, _status: a.status });
            case "inquiry_paid":
              return db.rpc("partner_inquiry_paid", { _inquiry_id: a.inquiryId, _amount: a.amount });
            case "cancel_commission":
              return db.rpc("partner_commission_cancel", { _id: a.id, _note: a.note || "대표님 취소" });
            case "make_payouts":
              return db.rpc("partner_make_payouts", { _month: a.month });
            case "payout_paid":
              return db.rpc("partner_payout_mark_paid", { _id: a.id });
          }
        };
        const { data, error } = await call();
        if (error) {
          console.error(`[admin/partners] ${a.action} 실패 [${error.code ?? "?"}]`);
          return json({ error: `처리하지 못했습니다 [${error.code ?? "?"}] — ${PARTNER_MIGRATION_HINT}` }, 500);
        }
        const r = (data ?? {}) as RpcResult;
        if (r.ok === false) {
          return json({ error: ADMIN_REASON_TEXT[r.reason ?? ""] ?? `처리하지 못했습니다(${r.reason ?? "?"})` }, 409);
        }
        return json({ ok: true, ...r });
      },
    },
  },
});
