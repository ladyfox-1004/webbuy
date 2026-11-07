// /api/admin/outreach — 관리자 영업 메일 화면(/admin/outreach)용.
// 인증: Bearer <관리자 access token> (api/admin/inquiries.ts 와 같은 checkAdmin)
//   GET  ?date=YYYY-MM-DD(기본 오늘 한국 날짜) → 그날 묶음(+메일 미리보기) · 최근 14일 날짜별 개수 · 누적 보낸 수
//   POST { action: 'send',  ids } → 고른 것만 한 통씩 지메일로(최대 20), 그날 묶음의 나머지 ready 는 건너뜀
//   POST { action: 'skip',  ids } → ready → skipped
//   POST { action: 'retry', ids } → failed → ready
//   POST { action: 'set_auto', on: boolean } → 자동 발송 스위치(outreach_settings.auto_send). 크론: src/server/outreach-tasks/auto-send-task.ts
// 판단은 src/lib/outreach/service.ts, 본문은 src/lib/outreach/mail.ts.
// 🚨 GMAIL_* 비밀값·access token 은 응답·로그에 절대 넣지 않는다(connected 여부만).
import { createFileRoute } from "@tanstack/react-router";
import { checkAdmin, json } from "@/lib/notify/admin-auth";
import { createNotifyServiceClient } from "@/lib/notify/token-store";
import { readOutreachEnv } from "@/lib/outreach/env";
import { GMAIL_NOT_CONNECTED, gmailConnected } from "@/lib/outreach/gmail";
import { renderOutreachMail } from "@/lib/outreach/mail";
import {
  addDays,
  cleanIds,
  countByDay,
  isYmd,
  kstDate,
  retrySelected,
  sendSelected,
  skipSelected,
  type DraftRow,
} from "@/lib/outreach/service";
import { DRAFT_COLS, readAutoSend, supabaseOutreachStore, writeAutoSend } from "@/lib/outreach/store";

const MIGRATION_HINT = "마이그레이션 20261107120000_outreach.sql 적용 여부를 확인하세요.";
const SETTINGS_HINT = "마이그레이션 20261107130000_outreach_settings.sql 적용 여부를 확인하세요.";

function preview(r: DraftRow) {
  try {
    const m = renderOutreachMail(r);
    return { subject: m.subject, text: m.text };
  } catch (e) {
    return { subject: "", text: "", error: e instanceof Error ? e.message : "미리보기 실패" };
  }
}

export const Route = createFileRoute("/api/admin/outreach")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const env = readOutreachEnv();
        const db = createNotifyServiceClient(env);
        if (!db) return json({ error: "서버 설정 누락(SUPABASE_SERVICE_ROLE_KEY)" }, 500);
        const denied = await checkAdmin(request, db);
        if (denied) return denied;

        const today = kstDate();
        const q = new URL(request.url).searchParams.get("date");
        const date = isYmd(q) ? q : today;

        const [rows, recent, total] = await Promise.all([
          db.from("outreach_drafts").select(DRAFT_COLS).eq("batch_date", date).order("created_at", { ascending: true }),
          db.from("outreach_drafts").select("batch_date, status").gte("batch_date", addDays(today, -13)).limit(5000),
          db.from("outreach_drafts").select("id", { count: "exact", head: true }).not("sent_at", "is", null),
        ]);
        const err = rows.error ?? recent.error ?? total.error;
        if (err) return json({ error: `영업 메일 목록을 읽지 못했습니다 [${err.code ?? "?"}] — ${MIGRATION_HINT}` }, 500);

        // 스위치 표가 아직 없으면 목록은 그대로 보여 주고 스위치만 「모름」(null)
        let autoSend: boolean | null = null;
        try {
          autoSend = await readAutoSend(db);
        } catch (e) {
          console.error(`[outreach] ${e instanceof Error ? e.message : "자동 발송 설정 읽기 실패"}`);
        }

        return json({
          today,
          date,
          gmailConnected: gmailConnected(env),
          autoSend,
          rows: ((rows.data ?? []) as DraftRow[]).map((r) => ({ ...r, preview: preview(r) })),
          days: countByDay(recent.data ?? [], today, 14),
          totalSent: total.count ?? 0,
        });
      },

      POST: async ({ request }) => {
        const env = readOutreachEnv();
        const db = createNotifyServiceClient(env);
        if (!db) return json({ error: "서버 설정 누락(SUPABASE_SERVICE_ROLE_KEY)" }, 500);
        const denied = await checkAdmin(request, db);
        if (denied) return denied;

        let body: { action?: unknown; ids?: unknown; on?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return json({ error: "요청 형식이 틀렸습니다." }, 400);
        }
        if (body?.action === "set_auto") {
          if (typeof body.on !== "boolean") return json({ error: "켜기/끄기 값이 틀렸습니다." }, 400);
          try {
            return json({ ok: true, autoSend: await writeAutoSend(db, body.on) });
          } catch (e) {
            const m = e instanceof Error ? e.message : "저장 실패";
            console.error(`[outreach] ${m}`);
            return json({ error: `${m} — ${SETTINGS_HINT}` }, 500);
          }
        }
        const ids = cleanIds(body?.ids);
        if (!ids) return json({ error: "고른 항목이 없거나 형식이 틀렸습니다." }, 400);
        const store = supabaseOutreachStore(db);

        try {
          if (body.action === "send") {
            if (!gmailConnected(env)) return json({ error: GMAIL_NOT_CONNECTED }, 503);
            const r = await sendSelected(ids, { store, env });
            return json(r, r.ok ? 200 : 502);
          }
          if (body.action === "skip") return json({ ok: true, changed: await skipSelected(ids, store) });
          if (body.action === "retry") return json({ ok: true, changed: await retrySelected(ids, store) });
          return json({ error: "모르는 동작입니다." }, 400);
        } catch (e) {
          const m = e instanceof Error ? e.message : "처리 실패";
          console.error(`[outreach] ${m}`);
          return json({ error: `${m} — ${MIGRATION_HINT}` }, 500);
        }
      },
    },
  },
});
