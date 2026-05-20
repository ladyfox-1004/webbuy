import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, X, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminListReviewQueue, adminSetProductStatus } from "@/lib/discover.functions";

export const Route = createFileRoute("/admin/review")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: AdminReviewPage,
  head: () => ({ meta: [{ title: "검수 대기 — Admin" }] }),
});

function AdminReviewPage() {
  const fetchQueue = useServerFn(adminListReviewQueue);
  const setStatus = useServerFn(adminSetProductStatus);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-review-queue"],
    queryFn: () => fetchQueue(),
  });

  const mut = useMutation({
    mutationFn: (v: { id: string; status: "draft" | "review" | "live" }) =>
      setStatus({ data: v }),
    onSuccess: () => {
      toast.success("상태가 변경되었습니다.");
      qc.invalidateQueries({ queryKey: ["admin-review-queue"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "실패"),
  });

  return (
    <div className="min-h-screen px-4 py-16">
      <div className="mx-auto max-w-5xl">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 홈으로
        </Link>
        <div className="mb-8 flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary-glow" />
          <h1 className="font-display text-3xl font-bold">검수 대기열</h1>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-300">
            {error instanceof Error ? error.message : "권한이 없습니다."}
          </div>
        ) : (data?.length ?? 0) === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-surface/30 p-12 text-center text-sm text-muted-foreground">
            검수할 제품이 없어요.
          </div>
        ) : (
          <div className="grid gap-3">
            {data!.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-surface/60 p-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-background/50">
                  {p.thumbnail_url ? <img src={p.thumbnail_url} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate font-medium">{p.title}</div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                      p.status === "review" ? "bg-amber-500/15 text-amber-300" : "bg-foreground/10 text-muted-foreground"
                    }`}>{p.status}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p.tag} · ₩{p.amount.toLocaleString("ko-KR")} · {p.seller?.business_name ?? "—"}
                  </div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">{p.description}</div>
                </div>
                <div className="flex gap-2">
                  {p.slug && (
                    <Link to="/p/$slug" params={{ slug: p.slug }} className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-surface">미리보기</Link>
                  )}
                  <button
                    onClick={() => mut.mutate({ id: p.id, status: "live" })}
                    className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-primary to-primary-glow px-3 py-1.5 text-xs font-medium text-primary-foreground"
                  ><Check className="h-3.5 w-3.5" /> 승인</button>
                  <button
                    onClick={() => mut.mutate({ id: p.id, status: "draft" })}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                  ><X className="h-3.5 w-3.5" /> 반려</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
