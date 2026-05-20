import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ExternalLink, Download, Package, Receipt, Key } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listMyPayments, listMyLibrary, getProductFileUrl } from "@/lib/payments.functions";
import { StatusBadge } from "@/components/StatusBadge";

export const Route = createFileRoute("/me")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: MePage,
  head: () => ({ meta: [{ title: "내 보관함 — Studio" }] }),
});

type Tab = "library" | "payments";

function MePage() {
  const [tab, setTab] = useState<Tab>("library");

  return (
    <div className="min-h-screen px-4 py-20">
      <div className="mx-auto mt-12 max-w-5xl">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 홈
        </Link>
        <h1 className="font-display text-4xl font-bold">내 보관함</h1>
        <p className="mt-2 text-muted-foreground">구매한 제품에 접속하거나 다운로드할 수 있어요.</p>

        <div className="mt-6 flex gap-2 rounded-full border border-border bg-surface/40 p-1">
          {(["library", "payments"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                tab === t ? "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "library" ? <><Package className="h-4 w-4" /> 보관함</> : <><Receipt className="h-4 w-4" /> 결제내역</>}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === "library" ? <Library /> : <Payments />}
        </div>
      </div>
    </div>
  );
}

function Library() {
  const fetchLib = useServerFn(listMyLibrary);
  const getFile = useServerFn(getProductFileUrl);
  const { data, isLoading } = useQuery({ queryKey: ["my-library"], queryFn: () => fetchLib() });

  async function download(paymentId: string) {
    try {
      const { url } = await getFile({ data: { paymentId } });
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "다운로드 실패");
    }
  }

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data || data.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-surface/30 p-12 text-center text-sm text-muted-foreground">
        아직 구매한 제품이 없어요. <Link to="/" className="text-foreground underline">제품 둘러보기</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.map((e) => {
        const p = e.products;
        if (!p) return null;
        return (
          <div key={e.id} className="overflow-hidden rounded-2xl border border-border bg-surface/60">
            <div className="aspect-video w-full bg-background/50">
              {p.thumbnail_url && <img src={p.thumbnail_url} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="p-5">
              <div className="mb-2 inline-flex rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[10px] text-muted-foreground">{p.tag}</div>
              <h3 className="font-display text-lg font-semibold">{p.title}</h3>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/40 pt-4 text-xs">
                {p.delivery_url && (
                  <a
                    href={p.delivery_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-primary to-primary-glow px-3 py-1.5 font-medium text-primary-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> 접속하기
                  </a>
                )}
                {p.delivery_file_path && (
                  <button
                    onClick={() => download(e.payment_id)}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background/40 px-3 py-1.5"
                  >
                    <Download className="h-3.5 w-3.5" /> 다운로드
                  </button>
                )}
                {p.product_type === "license" && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(e.access_token); toast.success("라이선스 키 복사됨"); }}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background/40 px-3 py-1.5 font-mono"
                  >
                    <Key className="h-3.5 w-3.5" /> {e.access_token.slice(0, 12)}…
                  </button>
                )}
                <span className="ml-auto text-muted-foreground">{new Date(e.granted_at).toLocaleDateString("ko-KR")}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Payments() {
  const fetchMine = useServerFn(listMyPayments);
  const { data, isLoading } = useQuery({ queryKey: ["my-payments"], queryFn: () => fetchMine() });

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface/40">
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
  );
}
