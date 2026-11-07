// 영업 메일 DB 연결(Supabase service_role). 판단은 ./service.ts, 여기서는 읽고 쓰기만.
// 표: public.outreach_drafts, public.outreach_suppression — 마이그레이션 20261107120000_outreach.sql
// 🚨 service_role 전용 표(RLS 켬·정책 없음). 브라우저에서 import 하지 마라.
// 🚨 Cloudflare Worker 는 요청 하나에 외부 호출(subrequest) 수 상한이 있다(무료 50). 20통 보내기 =
//    인증 2 + 준비 6 + (보내기 1 + 기록 1) × 20 = 48. 호출을 늘리지 마라.
import type { ServiceDb } from "../notify/token-store";
import type { DraftRow, OutreachStatus, OutreachStore } from "./service";

export const DRAFT_COLS =
  "id, batch_date, channel_id, channel_name, channel_url, subscribers, niche, top_title, top_url, email, status, gmail_message_id, error, created_at, approved_at, sent_at";

function fail(what: string, error: { code?: string | null } | null): never {
  throw new Error(`${what} 실패 [${error?.code ?? "?"}]`);
}

/** uuid 만 들어온다(service.cleanIds 로 거른 값). PostgREST in(...) 목록 글. */
function inList(ids: string[]): string {
  return `(${ids.join(",")})`;
}

export function supabaseOutreachStore(db: ServiceDb): OutreachStore {
  return {
    async getByIds(ids) {
      if (!ids.length) return [];
      const { data, error } = await db.from("outreach_drafts").select(DRAFT_COLS).in("id", ids);
      if (error) fail("후보 읽기", error);
      return (data ?? []) as DraftRow[];
    },
    async getById(id) {
      const { data, error } = await db.from("outreach_drafts").select(DRAFT_COLS).eq("id", id).maybeSingle();
      if (error) fail("후보 읽기", error);
      return (data as DraftRow | null) ?? null;
    },
    async suppressedAmong(emails) {
      if (!emails.length) return new Set();
      const { data, error } = await db.from("outreach_suppression").select("email").in("email", emails);
      if (error) fail("수신거부 확인", error);
      return new Set((data ?? []).map((r) => r.email));
    },
    async addSuppression(email, reason) {
      const { error } = await db
        .from("outreach_suppression")
        .upsert({ email, reason }, { onConflict: "email", ignoreDuplicates: true });
      if (error) fail("수신거부 저장", error);
    },
    async transition(ids, from, patch) {
      if (!ids.length) return [];
      const { data, error } = await db
        .from("outreach_drafts")
        .update(patch)
        .in("id", ids)
        .in("status", from as OutreachStatus[])
        .select(DRAFT_COLS);
      if (error) fail("상태 바꾸기", error);
      return (data ?? []) as DraftRow[];
    },
    async skipRestOfBatch(batchDates, keepIds) {
      let q = db
        .from("outreach_drafts")
        .update({ status: "skipped" })
        .in("batch_date", batchDates)
        .eq("status", "ready");
      if (keepIds.length) q = q.not("id", "in", inList(keepIds));
      const { data, error } = await q.select("id");
      if (error) fail("건너뛰기", error);
      return (data ?? []).length;
    },
    async markSent(id, gmailMessageId, sentAt) {
      const { error } = await db
        .from("outreach_drafts")
        .update({ status: "sent", gmail_message_id: gmailMessageId, sent_at: sentAt, error: null })
        .eq("id", id)
        .eq("status", "sending");
      if (error) fail("보냄 기록", error);
    },
    async markFailed(id, err) {
      const { error } = await db
        .from("outreach_drafts")
        .update({ status: "failed", error: err })
        .eq("id", id)
        .eq("status", "sending");
      if (error) fail("실패 기록", error);
    },
  };
}
