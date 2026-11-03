// /admin/inquiries — 상담 접수 목록(관리자 전용). 카톡 알림의 "문의 보기" 단추가 여기로 온다.
// 🚨 파일 이름이 admin_.inquiries 인 이유는 admin_.blog.tsx 머리 주석과 같다(/admin 에 <Outlet/> 이 없다).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MessageCircle } from "lucide-react";
import { adminFetch, useAdminGate } from "@/hooks/useAdminGate";

export const Route = createFileRoute("/admin_/inquiries")({
  component: AdminInquiriesPage,
  head: () => ({
    meta: [{ title: "상담 접수 — 에이아이솔루션 관리자" }, { name: "robots", content: "noindex" }],
  }),
});

type Row = {
  id: string;
  created_at: string;
  name: string;
  contact: string;
  services: string[];
  notes: string;
  reference_links: string;
  file_name: string | null;
  source: string;
  sheet_notify_status?: string | null;
  kakao_notify_status?: string | null;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
}

function StatusChip({ label, value }: { label: string; value?: string | null }) {
  const v = value ?? "기록 없음";
  const cls =
    v === "ok"
      ? "border-emerald-600/30 bg-emerald-50 text-emerald-800"
      : v.startsWith("failed")
        ? "border-rose-600/30 bg-rose-50 text-rose-800"
        : "border-border bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${cls}`}
    >
      {label} · {v}
    </span>
  );
}

function AdminInquiriesPage() {
  const ok = useAdminGate();
  if (!ok) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  return <AdminInquiries />;
}

function AdminInquiries() {
  const q = useQuery({
    queryKey: ["admin-inquiries"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/inquiries");
      const body = (await res.json()) as { rows?: Row[]; notifyColumns?: boolean; error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body;
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> 관리자
          </Link>
          <h1 className="font-display text-2xl font-bold">상담 접수</h1>
        </div>
        <Link
          to="/admin/kakao-connect"
          search={{ result: undefined }}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <MessageCircle className="h-4 w-4 text-primary" /> 카카오톡 알림 연결
        </Link>
      </div>

      {q.isLoading && <Loader2 className="mt-10 h-6 w-6 animate-spin text-primary" />}
      {q.error && <p className="mt-6 text-sm text-rose-700">{(q.error as Error).message}</p>}
      {q.data && !q.data.notifyColumns && (
        <p className="mt-4 rounded-xl border border-amber-500/40 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          알림 결과 칸이 아직 없습니다(마이그레이션 20261103100000 적용 전).
        </p>
      )}

      <ul className="mt-6 space-y-3">
        {(q.data?.rows ?? []).map((r) => (
          <li key={r.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-semibold">
                {r.name} <span className="ml-2 font-normal text-muted-foreground">{r.contact}</span>
              </div>
              <div className="text-xs text-muted-foreground">{fmt(r.created_at)}</div>
            </div>
            {r.services.length > 0 && (
              <div className="mt-1 text-sm text-muted-foreground">
                관심: {r.services.join(", ")}
              </div>
            )}
            <pre className="mt-2 max-h-48 overflow-auto font-body text-sm break-words whitespace-pre-wrap text-foreground">
              {r.notes}
            </pre>
            {r.reference_links && (
              <div className="mt-1 text-xs break-all text-muted-foreground">
                참고: {r.reference_links}
              </div>
            )}
            {r.file_name && (
              <div className="mt-1 text-xs text-muted-foreground">첨부: {r.file_name}</div>
            )}
            {q.data?.notifyColumns && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <StatusChip label="시트" value={r.sheet_notify_status} />
                <StatusChip label="카톡" value={r.kakao_notify_status} />
              </div>
            )}
          </li>
        ))}
        {q.data && q.data.rows?.length === 0 && (
          <li className="text-sm text-muted-foreground">아직 접수된 문의가 없습니다.</li>
        )}
      </ul>
    </div>
  );
}
