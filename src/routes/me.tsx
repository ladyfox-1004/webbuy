import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listMyPayments } from "@/lib/payments.functions";
import { StatusBadge } from "@/components/StatusBadge";

export const Route = createFileRoute("/me")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: MePage,
  head: () => ({ meta: [{ title: "내 결제내역 — Studio" }] }),
});

function MePage() {
  const fetchMine = useServerFn(listMyPayments);
  const { data, isLoading } = useQuery({ queryKey: ["my-payments"], queryFn: () => fetchMine() });

  return (
    <div className="min-h-screen px-4 py-20">
      <div className="mx-auto mt-12 max-w-4xl">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />홈
        </Link>
        <h1 className="font-display text-4xl font-bold">내 결제내역</h1>
        <p className="mt-2 text-muted-foreground">최근 결제 100건까지 표시됩니다.</p>

        <div className="mt-8 overflow-hidden rounded-3xl border border-border bg-surface/40">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (data?.length ?? 0) === 0 ? (
            <p className="py-16 text-center text-muted-foreground">아직 결제 내역이 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">상품</th>
                  <th className="px-5 py-3">금액</th>
                  <th className="px-5 py-3">상태</th>
                  <th className="px-5 py-3">결제일</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((p) => (
                  <tr key={p.payment_id} className="border-b border-border/30 last:border-0">
                    <td className="px-5 py-4 font-medium text-foreground">{p.product_title}</td>
                    <td className="px-5 py-4">₩{p.amount.toLocaleString("ko-KR")}</td>
                    <td className="px-5 py-4"><StatusBadge status={p.status} /></td>
                    <td className="px-5 py-4 text-muted-foreground">{new Date(p.created_at).toLocaleString("ko-KR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
