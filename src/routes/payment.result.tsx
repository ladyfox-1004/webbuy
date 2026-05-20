import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Loader2, ArrowLeft } from "lucide-react";
import { z } from "zod";
import { getPayment } from "@/lib/payments.functions";

const searchSchema = z.object({
  paymentId: z.string(),
  ok: z.number().optional(),
});

export const Route = createFileRoute("/payment/result")({
  validateSearch: (s) => searchSchema.parse(s),
  component: ResultPage,
  head: () => ({ meta: [{ title: "결제 결과 — Studio" }] }),
});

const STATUS_LABEL: Record<string, { label: string; tone: "ok" | "warn" | "err" }> = {
  PAID: { label: "결제 완료", tone: "ok" },
  VIRTUAL_ACCOUNT_ISSUED: { label: "가상계좌 발급", tone: "warn" },
  READY: { label: "결제 대기중", tone: "warn" },
  FAILED: { label: "결제 실패", tone: "err" },
  CANCELLED: { label: "결제 취소", tone: "err" },
  PARTIAL_CANCELLED: { label: "부분 취소", tone: "warn" },
};

function ResultPage() {
  const { paymentId, ok } = Route.useSearch();
  const fetchPayment = useServerFn(getPayment);
  const { data, isLoading } = useQuery({
    queryKey: ["payment", paymentId],
    queryFn: () => fetchPayment({ data: { paymentId } }),
  });

  const status = data?.status ?? "";
  const meta = STATUS_LABEL[status] ?? { label: status || (ok ? "처리됨" : "처리 실패"), tone: ok ? "ok" : "err" as const };

  return (
    <div className="min-h-screen px-4 py-20">
      <div className="mx-auto mt-12 max-w-xl">
        <Link to="/" className="mb-8 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />홈으로
        </Link>
        <div className="glass rounded-3xl p-10 text-center">
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="mb-6 flex justify-center">
                {meta.tone === "ok" ? (
                  <CheckCircle2 className="h-16 w-16 text-primary-glow" />
                ) : meta.tone === "warn" ? (
                  <Loader2 className="h-16 w-16 text-amber-400" />
                ) : (
                  <XCircle className="h-16 w-16 text-destructive" />
                )}
              </div>
              <h1 className="font-display text-3xl font-bold">{meta.label}</h1>
              {data && (
                <div className="mt-8 space-y-3 text-left">
                  <Row k="상품" v={data.product_title} />
                  <Row k="금액" v={`₩${data.amount.toLocaleString("ko-KR")}`} />
                  <Row k="결제 ID" v={data.payment_id} mono />
                  <Row k="결제일시" v={new Date(data.created_at).toLocaleString("ko-KR")} />
                </div>
              )}
              {!data && !isLoading && (
                <p className="mt-4 text-sm text-muted-foreground">결제 정보를 찾을 수 없습니다.</p>
              )}
              <div className="mt-10 flex justify-center gap-3">
                <Link to="/" className="rounded-full border border-border bg-surface/40 px-5 py-2.5 text-sm text-foreground hover:bg-surface">
                  홈으로
                </Link>
                <Link to="/me" className="rounded-full bg-gradient-to-br from-primary to-primary-glow px-5 py-2.5 text-sm font-medium text-primary-foreground">
                  내 결제내역
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-3 last:border-0">
      <span className="text-sm text-muted-foreground">{k}</span>
      <span className={`text-sm text-foreground ${mono ? "font-mono text-xs" : ""}`}>{v}</span>
    </div>
  );
}
