import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowUpRight, CreditCard, Loader2, Smartphone, Store, ShoppingBag } from "lucide-react";
import { getProductBySlug, verifyPayment } from "@/lib/payments.functions";
import { PORTONE_CONFIG } from "@/lib/portone-config";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/p/$slug")({
  component: ProductDetailPage,
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} — 제품 상세` },
      { name: "description", content: "제품 상세 정보 및 구매" },
    ],
  }),
});

function ProductDetailPage() {
  const { slug } = Route.useParams();
  const fetchProduct = useServerFn(getProductBySlug);
  const { data: product, isLoading } = useQuery({
    queryKey: ["product", slug],
    queryFn: () => fetchProduct({ data: { slug } }),
  });

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!product) {
    return (
      <div className="min-h-screen px-4 py-20">
        <div className="mx-auto mt-12 max-w-xl rounded-3xl border border-border bg-surface/60 p-10 text-center">
          <h1 className="font-display text-2xl font-bold">제품을 찾을 수 없어요</h1>
          <p className="mt-2 text-sm text-muted-foreground">삭제되었거나 비공개로 전환된 제품입니다.</p>
          <Link to="/" className="mt-6 inline-flex items-center gap-2 text-sm text-primary-glow hover:underline">
            <ArrowLeft className="h-4 w-4" /> 홈으로
          </Link>
        </div>
      </div>
    );
  }

  return <Detail product={product} />;
}

type Product = NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>;

function Detail({ product }: { product: Product }) {
  const [loading, setLoading] = useState(false);
  const verify = useServerFn(verifyPayment);
  const navigate = useNavigate();

  async function pay(method: "CARD" | "EASY_PAY") {
    const channelKey = method === "CARD" ? PORTONE_CONFIG.channelKeyCard : PORTONE_CONFIG.channelKeyEasyPay;
    if (!channelKey) {
      toast.error("결제 채널이 설정되지 않았습니다.");
      return;
    }
    setLoading(true);
    try {
      const PortOne = (await import("@portone/browser-sdk/v2")).default;
      const paymentId = `pay-${crypto.randomUUID()}`;
      const result = await PortOne.requestPayment({
        storeId: PORTONE_CONFIG.storeId,
        channelKey,
        paymentId,
        orderName: product.title,
        totalAmount: product.amount,
        currency: "CURRENCY_KRW",
        payMethod: method,
      });
      if (result?.code !== undefined) {
        toast.error(result.message ?? "결제가 취소되었습니다.");
        return;
      }
      toast.loading("결제 검증 중…", { id: paymentId });
      const v = await verify({
        data: {
          paymentId,
          expectedAmount: product.amount,
          productTitle: product.title,
          productId: product.id,
        },
      });
      toast.dismiss(paymentId);
      navigate({ to: "/payment/result", search: { paymentId, ok: v.ok ? 1 : 0 } });
    } catch (err) {
      console.error(err);
      toast.error("결제 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-16">
      <div className="mx-auto max-w-5xl">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 모든 제품
        </Link>

        <div className="grid gap-8 md:grid-cols-5">
          <div className="md:col-span-3">
            <div className="aspect-[16/10] w-full overflow-hidden rounded-3xl border border-border bg-surface/60">
              {product.thumbnail_url ? (
                <img src={product.thumbnail_url} alt={product.title} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-muted-foreground text-sm">이미지 없음</div>
              )}
            </div>

            <div className="mt-8">
              <h1 className="font-display text-3xl font-bold md:text-4xl">{product.title}</h1>
              <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-muted-foreground">
                {product.description}
              </p>
            </div>
          </div>

          <aside className="md:col-span-2">
            <div className="sticky top-6 space-y-5 rounded-3xl border border-border bg-surface/60 p-6">
              <span className="inline-flex rounded-full border border-border/80 bg-background/40 px-3 py-1 text-xs text-muted-foreground">
                {product.tag}
              </span>
              <div className="font-display text-4xl font-bold">
                ₩{product.amount.toLocaleString("ko-KR")}
              </div>
              <div className="grid gap-2">
                <button
                  onClick={() => pay("CARD")}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  카드로 결제
                </button>
                <button
                  onClick={() => pay("EASY_PAY")}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background/50 px-5 py-3 text-sm font-medium hover:bg-surface disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                  간편결제
                </button>
              </div>
              <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                <li>· 결제 후 보관함(/me)에서 즉시 접속/다운로드 가능합니다.</li>
                <li>· <span className="text-foreground/80">서비스 제공 기간</span>: 결제일로부터 최대 3개월</li>
                <li>· 환불은 <Link to="/refund" className="underline hover:text-foreground">환불 정책</Link>에 따릅니다.</li>
              </ul>

              {product.seller && (
                <div className="mt-2 rounded-2xl border border-border bg-background/40 p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Store className="h-3.5 w-3.5" /> 판매자
                  </div>
                  <div className="flex items-center gap-3">
                    {product.seller.avatar_url ? (
                      <img src={product.seller.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-xs text-primary-foreground">
                        {product.seller.business_name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{product.seller.business_name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">/u/{product.seller.slug}</div>
                    </div>
                  </div>
                  {product.seller.bio && (
                    <p className="mt-3 line-clamp-3 text-xs text-muted-foreground">{product.seller.bio}</p>
                  )}
                  {product.seller.website_url && (
                    <a
                      href={product.seller.website_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-[11px] text-primary-glow hover:underline"
                    >
                      웹사이트 <ArrowUpRight className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
