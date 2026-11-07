// /api/admin/partners — 관리자 파트너 화면(/admin/partners)용.
// 인증: Bearer <관리자 access token> (api/admin/outreach.ts 와 같은 checkAdmin)
//   GET  → public.partner_admin_overview: 파트너(통계)·추천 붙은 상담·수수료 원장·정산 (조회 때 7일 지난 쇼츠 수수료를 payable 로)
//   POST { action: 'set_status', id, status: 'approved'|'rejected'|'paused' } → 승인 때 view_key 생성
//        승인이면 바로 파트너에게 안내 메일(지메일 API) → 응답에 mail: 'sent'|'failed'|'skipped', mail_error.
//        메일이 실패해도 승인은 그대로(결과는 partners.approval_mail_sent_at·approval_mail_error 에 기록).
//   POST { action: 'resend_approval_mail', id }          → 승인 안내 메일 다시 보내기
//   POST { action: 'send_account_mail', id }             → 「파트너 계정 만들기」 안내 메일(승인·일시정지, 계정 연결 전만)
//   POST { action: 'inquiry_paid', inquiry_id, amount }  → 상담 계약 결제됨, 10% payable
//   POST { action: 'cancel_commission', id, note? }      → 지급 전이면 취소, 지급 뒤면 음수 차감 줄(다음 정산에서 빠짐)
//   POST { action: 'make_payouts', month? }              → 그 달(기본: 한국 시간 이번 달) 정산 만들기
//   POST { action: 'payout_paid', id }                   → 지급 완료
// 🚨 로그에 계좌·전화 전체를 넣지 마라(이유 코드만).
import { createFileRoute } from "@tanstack/react-router";
import { checkAdmin, json } from "@/lib/notify/admin-auth";
import { ADMIN_REASON_TEXT, parseAdminAction } from "@/lib/partner/admin";
import { deliverAccountMail, deliverApprovalMail, type ApprovalMailTarget } from "@/lib/partner/approval-mail";
import { PARTNER_MIGRATION_HINT, partnerDb } from "@/lib/partner/server";
import { readOutreachEnv } from "@/lib/outreach/env";
import type { ServiceDb } from "@/lib/notify/token-store";

type RpcResult = { ok?: boolean; reason?: string } & Record<string, unknown>;

/** 승인 안내 메일 보내고 결과 기록. 던지지 않는다. 🚨 로그에 메일 주소·view_key 를 넣지 마라. */
function sendApprovalMail(db: ServiceDb, id: string) {
  return deliverApprovalMail(id, {
    env: readOutreachEnv(),
    getTarget: async (pid) => {
      const { data, error } = await db.rpc("partner_approval_mail_target", { _id: pid });
      if (error) throw new Error(`rpc ${error.code ?? "?"}`);
      const r = (data ?? {}) as RpcResult;
      if (r.ok !== true) return { ok: false, reason: String(r.reason ?? "not_found") };
      return { ok: true, target: r as unknown as ApprovalMailTarget };
    },
    record: async (pid, err) => {
      const { error } = await db.rpc("partner_approval_mail_result", { _id: pid, _error: err ?? undefined });
      if (error) console.error(`[admin/partners] 메일 결과 기록 실패 [${error.code ?? "?"}]`);
    },
  });
}

/** 계정 만들기 안내 메일 보내고 결과 기록. 던지지 않는다. */
function sendAccountMail(db: ServiceDb, id: string) {
  return deliverAccountMail(id, {
    env: readOutreachEnv(),
    getTarget: async (pid) => {
      const { data, error } = await db.rpc("partner_account_mail_target", { _id: pid });
      if (error) throw new Error(`rpc ${error.code ?? "?"}`);
      const r = (data ?? {}) as RpcResult;
      if (r.ok !== true) return { ok: false, reason: String(r.reason ?? "not_found") };
      return { ok: true, target: r as unknown as ApprovalMailTarget };
    },
    record: async (pid, err) => {
      const { error } = await db.rpc("partner_account_mail_result", { _id: pid, _error: err ?? undefined });
      if (error) console.error(`[admin/partners] 계정 메일 결과 기록 실패 [${error.code ?? "?"}]`);
    },
  });
}

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

        if (a.action === "resend_approval_mail") {
          const m = await sendApprovalMail(db, a.id);
          if (m.mail === "skipped") return json({ error: m.mail_error }, 409);
          if (m.mail === "failed") console.error("[admin/partners] 승인 메일 다시 보내기 실패");
          return json({ ok: true, ...m });
        }

        if (a.action === "send_account_mail") {
          const m = await sendAccountMail(db, a.id);
          if (m.mail === "skipped") return json({ error: m.mail_error }, 409);
          if (m.mail === "failed") console.error("[admin/partners] 계정 만들기 메일 실패");
          return json({ ok: true, ...m });
        }

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
          throw new Error("unreachable");
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
        if (a.action === "set_status" && a.status === "approved") {
          const m = await sendApprovalMail(db, a.id);
          if (m.mail === "failed") console.error("[admin/partners] 승인 메일 실패(승인은 됨)");
          return json({ ok: true, ...r, ...m });
        }
        return json({ ok: true, ...r });
      },
    },
  },
});
