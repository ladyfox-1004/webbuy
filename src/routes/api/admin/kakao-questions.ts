// /api/admin/kakao-questions — 관리자 「챗봇 질문」 화면(/admin/kakao-questions)용.
// 인증: Bearer <관리자 access token> (api/admin/inquiries.ts 와 같은 checkAdmin)
//   GET  ?status=new|done|all(기본 new) → 질문 최근 200건 + 추가 FAQ 전체
//   POST { action:'memo', id, adminAnswer }            답변 메모 저장
//   POST { action:'done', id, adminAnswer? }           완료(메모 같이 저장 가능)
//   POST { action:'reopen', id }                       다시 새 질문으로
//   POST { action:'add_faq', questionId?, menu|null, keywords, answer }
//        → kakao_faq_extra 에 넣는다(챗봇이 다음 대화부터 기본 FAQ 다음 순서로 찾아 바로 답). 질문은 added_to_faq·완료로.
//   POST { action:'faq_active', faqId, active }        추가 FAQ 끄기·켜기
// 표: 마이그레이션 20261107150000_kakao_chat.sql
import { createFileRoute } from "@tanstack/react-router";
import { checkAdmin, json } from "@/lib/notify/admin-auth";
import { readNotifyEnv } from "@/lib/notify/env";
import { createNotifyServiceClient } from "@/lib/notify/token-store";
import { QuestionAction } from "@/lib/kakao/admin";

const HINT = "마이그레이션 20261107150000_kakao_chat.sql 적용 여부를 확인하세요.";
const Q_COLS =
  "id, created_at, menu, question, bot_answer, answered_by_ai, contact, status, admin_answer, added_to_faq";

export const Route = createFileRoute("/api/admin/kakao-questions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const db = createNotifyServiceClient(readNotifyEnv());
        if (!db) return json({ error: "서버 설정 누락(SUPABASE_SERVICE_ROLE_KEY)" }, 500);
        const denied = await checkAdmin(request, db);
        if (denied) return denied;
        const status = new URL(request.url).searchParams.get("status");
        let q = db
          .from("kakao_questions")
          .select(Q_COLS)
          .order("created_at", { ascending: false })
          .limit(200);
        if (status !== "all") q = q.eq("status", status === "done" ? "done" : "new");
        const [rows, faq, newCount] = await Promise.all([
          q,
          db
            .from("kakao_faq_extra")
            .select("id, created_at, menu, keywords, answer, active")
            .order("created_at", { ascending: false })
            .limit(300),
          db
            .from("kakao_questions")
            .select("id", { count: "exact", head: true })
            .eq("status", "new"),
        ]);
        const err = rows.error ?? faq.error ?? newCount.error;
        if (err)
          return json({ error: `챗봇 질문을 읽지 못했습니다 [${err.code ?? "?"}] — ${HINT}` }, 500);
        return json({ rows: rows.data, faq: faq.data, newCount: newCount.count ?? 0 });
      },
      POST: async ({ request }) => {
        const db = createNotifyServiceClient(readNotifyEnv());
        if (!db) return json({ error: "서버 설정 누락(SUPABASE_SERVICE_ROLE_KEY)" }, 500);
        const denied = await checkAdmin(request, db);
        if (denied) return denied;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "JSON 본문이 아닙니다." }, 400);
        }
        const parsed = QuestionAction.safeParse(body);
        if (!parsed.success)
          return json(
            { error: "입력이 올바르지 않습니다(키워드는 두 글자 이상, 답은 1000자까지)." },
            400,
          );
        const a = parsed.data;
        const done = (error: { code?: string } | null) =>
          error
            ? json({ error: `저장 실패 [${error.code ?? "?"}] — ${HINT}` }, 500)
            : json({ ok: true });

        switch (a.action) {
          case "memo": {
            const { error } = await db
              .from("kakao_questions")
              .update({ admin_answer: a.adminAnswer || null })
              .eq("id", a.id);
            return done(error);
          }
          case "done": {
            const patch: { status: string; admin_answer?: string | null } = { status: "done" };
            if (a.adminAnswer !== undefined) patch.admin_answer = a.adminAnswer || null;
            const { error } = await db.from("kakao_questions").update(patch).eq("id", a.id);
            return done(error);
          }
          case "reopen": {
            const { error } = await db
              .from("kakao_questions")
              .update({ status: "new" })
              .eq("id", a.id);
            return done(error);
          }
          case "add_faq": {
            const { error } = await db
              .from("kakao_faq_extra")
              .insert({ menu: a.menu, keywords: a.keywords, answer: a.answer });
            if (error) return done(error);
            if (a.questionId) {
              const { error: e2 } = await db
                .from("kakao_questions")
                .update({ added_to_faq: true, status: "done", admin_answer: a.answer })
                .eq("id", a.questionId);
              return done(e2);
            }
            return json({ ok: true });
          }
          case "faq_active": {
            const { error } = await db
              .from("kakao_faq_extra")
              .update({ active: a.active })
              .eq("id", a.faqId);
            return done(error);
          }
        }
      },
    },
  },
});
