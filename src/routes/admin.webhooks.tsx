import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, ShieldCheck, RefreshCw, Mail, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminListWebhookEvents } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/webhooks")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/login" });
    const { data: role } = await supabase
      .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!role) throw redirect({ to: "/" });
  },
  component: AdminWebhooksPage,
  head: () => ({ meta: [{ title: "웹훅 로그 — Admin" }] }),
});

function AdminWebhooksPage() {
  const fetch = useServerFn(adminListWebhookEvents);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-webhook-events"],
    queryFn: () => fetch(),
  });

  return (
    <div className="min-h-screen px-4 py-16">
      <div className="mx-auto max-w-6xl">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 홈으로
        </Link>
        <div className="mb-2 flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary-glow" />
          <h1 className="font-display text-3xl font-bold">Lemon Squeezy 웹훅 로그</h1>
        </div>
        <p className="mb-8 text-sm text-muted-foreground">
          Lemon Squeezy에서 <code className="rounded bg-surface px-1 py-0.5 text-xs">order_created</code> 이벤트가 도착하면 아래에 기록됩니다.
        </p>

        <div className="mb-6 flex items-center gap-3">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/40 px-4 py-2 text-sm hover:bg-surface"
          >
            관리자 홈
          </Link>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <RefreshCw className="h-4 w-4" /> 새로고침
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-300">
            {error instanceof Error ? error.message : "권한이 없습니다."}
          </div>
        ) : (
          <div className="space-y-8">
            <section>
              <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
                <CreditCard className="h-5 w-5 text-primary-glow" /> 최근 결제 기록
              </h2>
              {(data?.payments.length ?? 0) === 0 ? (
                <div className="rounded-3xl border border-dashed border-border bg-surface/30 p-12 text-center text-sm text-muted-foreground">
                  아직 Lemon Squeezy 결제 기록이 없습니다. 대시보드에서 "Send test"를 눌러 테스트해 보세요.
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border bg-surface/60">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-surface/80 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">시간</th>
                        <th className="px-4 py-3 font-medium">Payment ID</th>
                        <th className="px-4 py-3 font-medium">상품</th>
                        <th className="px-4 py-3 font-medium">금액</th>
                        <th className="px-4 py-3 font-medium">상태</th>
                        <th className="px-4 py-3 font-medium">이메일</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {data!.payments.map((p) => (
                        <tr key={p.id} className="hover:bg-surface/40">
                          <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString("ko-KR")}</td>
                          <td className="px-4 py-3 font-mono text-xs">{p.payment_id}</td>
                          <td className="px-4 py-3">{p.product_title}</td>
                          <td className="px-4 py-3">{p.amount.toLocaleString("ko-KR")} {p.currency}</td>
                          <td className="px-4 py-3"><span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary-glow">{p.status}</span></td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{p.customer_email ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
                <Mail className="h-5 w-5 text-primary-glow" /> 최근 발송 이메일
              </h2>
              {(data?.emails.length ?? 0) === 0 ? (
                <div className="rounded-3xl border border-dashed border-border bg-surface/30 p-12 text-center text-sm text-muted-foreground">
                  아직 발송된 이메일이 없습니다.
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border bg-surface/60">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-surface/80 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">시간</th>
                        <th className="px-4 py-3 font-medium">템플릿</th>
                        <th className="px-4 py-3 font-medium">수신자</th>
                        <th className="px-4 py-3 font-medium">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {data!.emails.map((e) => (
                        <tr key={e.message_id} className="hover:bg-surface/40">
                          <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("ko-KR")}</td>
                          <td className="px-4 py-3">{e.template_name}</td>
                          <td className="px-4 py-3 text-xs">{e.recipient_email}</td>
                          <td className="px-4 py-3"><span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary-glow">{e.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
