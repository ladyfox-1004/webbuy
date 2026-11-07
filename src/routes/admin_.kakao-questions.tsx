// /admin/kakao-questions — 카카오 채널 챗봇이 FAQ 로 못 찾은 질문 목록(관리자 전용). 휴대폰에서 먼저 보기 좋게.
// 「챗봇 새 질문」 카톡 알림의 단추가 여기로 온다. API: /api/admin/kakao-questions
// 「자주 묻는 질문에 추가」 → kakao_faq_extra 에 들어가고, 챗봇이 다음 대화부터 그 답으로 바로 대답한다.
// 🚨 파일 이름이 admin_.kakao-questions 인 이유는 admin_.blog.tsx 머리 주석과 같다(/admin 에 <Outlet/> 이 없다).
// 🚨 beforeLoad 로 막지 마라(세션이 브라우저에만 있다) — useAdminGate 로 가리고, 실제 보호는 API 의 checkAdmin.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminFetch, useAdminGate } from "@/hooks/useAdminGate";
import { MENU_LABEL } from "@/lib/kakao/admin";
import type { MenuKey } from "@/lib/kakao/faq";

export const Route = createFileRoute("/admin_/kakao-questions")({
  component: AdminKakaoQuestionsPage,
  head: () => ({
    meta: [{ title: "챗봇 질문 — 에이아이솔루션 관리자" }, { name: "robots", content: "noindex" }],
  }),
});

type QRow = {
  id: string;
  created_at: string;
  menu: MenuKey | null;
  question: string;
  bot_answer: string;
  answered_by_ai: boolean;
  contact: string | null;
  status: "new" | "done";
  admin_answer: string | null;
  added_to_faq: boolean;
};
type FaqRow = {
  id: string;
  created_at: string;
  menu: MenuKey | null;
  keywords: string[];
  answer: string;
  active: boolean;
};
type Data = { rows: QRow[]; faq: FaqRow[]; newCount: number };
type Filter = "new" | "done" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "new", label: "새 질문" },
  { key: "done", label: "완료" },
  { key: "all", label: "전체" },
];

function fmt(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}

function menuLabel(m: MenuKey | null) {
  return m ? MENU_LABEL[m] : "공통";
}

async function post(body: unknown) {
  const res = await adminFetch("/api/admin/kakao-questions", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
}

function AdminKakaoQuestionsPage() {
  const ok = useAdminGate();
  if (!ok) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  return <AdminKakaoQuestions />;
}

function AdminKakaoQuestions() {
  const [filter, setFilter] = useState<Filter>("new");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-kakao-questions", filter],
    queryFn: async () => {
      const res = await adminFetch(`/api/admin/kakao-questions?status=${filter}`);
      const body = (await res.json()) as Data & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body;
    },
  });
  const act = useMutation({
    mutationFn: post,
    onSuccess: () => {
      toast.success("저장했어요");
      qc.invalidateQueries({ queryKey: ["admin-kakao-questions"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center gap-3">
        <Link
          to="/admin"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> 관리자
        </Link>
        <h1 className="font-display text-2xl font-bold">챗봇 질문</h1>
      </div>
      <p className="mt-2 text-sm text-muted-foreground break-keep">
        카카오 채널 챗봇이 자주 묻는 질문으로 못 찾은 질문입니다. 답을 적고 「자주 묻는 질문에
        추가」를 누르면 다음부터 챗봇이 그 답으로 바로 대답합니다.
      </p>

      <div className="mt-4 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1.5 text-sm ${filter === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
          >
            {f.label}
            {f.key === "new" && q.data ? ` ${q.data.newCount}` : ""}
          </button>
        ))}
      </div>

      {q.isLoading && <Loader2 className="mt-8 h-6 w-6 animate-spin text-primary" />}
      {q.error && <p className="mt-6 text-sm text-rose-700">{(q.error as Error).message}</p>}

      <ul className="mt-5 space-y-3">
        {(q.data?.rows ?? []).map((r) => (
          <QuestionCard key={r.id} row={r} busy={act.isPending} onAction={(b) => act.mutate(b)} />
        ))}
        {q.data && q.data.rows.length === 0 && (
          <li className="text-sm text-muted-foreground">질문이 없습니다.</li>
        )}
      </ul>

      <h2 className="mt-10 font-display text-lg font-bold">추가한 자주 묻는 질문</h2>
      <ul className="mt-3 space-y-2">
        {(q.data?.faq ?? []).map((f) => (
          <li
            key={f.id}
            className={`rounded-xl border border-border p-3 text-sm ${f.active ? "bg-card" : "bg-muted opacity-70"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {menuLabel(f.menu)} · 키워드: {f.keywords.join(", ")}
              </span>
              <button
                type="button"
                disabled={act.isPending}
                onClick={() => act.mutate({ action: "faq_active", faqId: f.id, active: !f.active })}
                className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"
              >
                {f.active ? "끄기" : "다시 켜기"}
              </button>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words">{f.answer}</p>
          </li>
        ))}
        {q.data && q.data.faq.length === 0 && (
          <li className="text-sm text-muted-foreground">아직 없습니다.</li>
        )}
      </ul>
    </div>
  );
}

function QuestionCard({
  row,
  busy,
  onAction,
}: {
  row: QRow;
  busy: boolean;
  onAction: (b: unknown) => void;
}) {
  const [memo, setMemo] = useState(row.admin_answer ?? "");
  const [adding, setAdding] = useState(false);
  const [keywords, setKeywords] = useState("");
  const [menu, setMenu] = useState<MenuKey | "">(row.menu ?? "");

  return (
    <li className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {menuLabel(row.menu)} · {fmt(row.created_at)}
        </span>
        <span>
          {row.status === "done" ? "완료" : "새 질문"}
          {row.added_to_faq ? " · FAQ 추가됨" : ""}
        </span>
      </div>
      <p className="mt-2 font-semibold whitespace-pre-wrap break-words">{row.question}</p>
      <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap break-words">
        봇 답({row.answered_by_ai ? "AI" : "담당자 안내"}): {row.bot_answer || "-"}
      </p>
      <p className="mt-1 text-sm">
        연락처:{" "}
        {row.contact ? (
          <span className="font-medium break-all">{row.contact}</span>
        ) : (
          <span className="text-muted-foreground">없음</span>
        )}
      </p>

      <label className="mt-3 block text-xs text-muted-foreground" htmlFor={`memo-${row.id}`}>
        답변 메모
      </label>
      <textarea
        id={`memo-${row.id}`}
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        maxLength={1000}
        rows={3}
        className="mt-1 w-full rounded-xl border border-border bg-background p-2 text-sm"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction({ action: "memo", id: row.id, adminAnswer: memo })}
          className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          메모 저장
        </button>
        {row.status === "new" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction({ action: "done", id: row.id, adminAnswer: memo })}
            className="rounded-full bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            완료
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction({ action: "reopen", id: row.id })}
            className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            다시 새 질문으로
          </button>
        )}
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-full border border-primary/50 px-3 py-1.5 text-sm text-primary hover:bg-primary/10"
        >
          자주 묻는 질문에 추가
        </button>
      </div>

      {adding && (
        <div className="mt-3 space-y-2 rounded-xl border border-border bg-muted/40 p-3">
          <label className="block text-xs text-muted-foreground" htmlFor={`kw-${row.id}`}>
            질문 키워드(쉼표로 나눠서, 두 글자 이상) — 손님 말에 이 말이 들어 있으면 아래 답을 바로
            보냅니다
          </label>
          <input
            id={`kw-${row.id}`}
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="예: 주차, 주차장"
            className="w-full rounded-lg border border-border bg-background p-2 text-sm"
          />
          <label className="block text-xs text-muted-foreground" htmlFor={`menu-${row.id}`}>
            어느 메뉴 질문인가요
          </label>
          <select
            id={`menu-${row.id}`}
            value={menu}
            onChange={(e) => setMenu(e.target.value as MenuKey | "")}
            className="w-full rounded-lg border border-border bg-background p-2 text-sm"
          >
            <option value="">공통(모든 메뉴)</option>
            {(Object.keys(MENU_LABEL) as MenuKey[]).map((k) => (
              <option key={k} value={k}>
                {MENU_LABEL[k]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            답은 위 「답변 메모」 글을 그대로 씁니다. 이모지·굵은 글씨 없이, 확정된 금액만 적어
            주세요.
          </p>
          <button
            type="button"
            disabled={busy || !memo.trim() || !keywords.trim()}
            onClick={() =>
              onAction({
                action: "add_faq",
                questionId: row.id,
                menu: menu || null,
                keywords,
                answer: memo,
              })
            }
            className="rounded-full bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            추가하기
          </button>
        </div>
      )}
    </li>
  );
}
