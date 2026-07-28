import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowUpRight, CreditCard, Loader2, MessageCircle, Smartphone, Store, ShoppingBag } from "lucide-react";
import { getProductBySlug, verifyPayment } from "@/lib/payments.functions";
import { PORTONE_CONFIG } from "@/lib/portone-config";
import { supabase } from "@/integrations/supabase/client";
import { InquiryModal } from "@/components/InquiryModal";

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
  const [inquiryOpen, setInquiryOpen] = useState(false);

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
              <div>
                <div className="text-xs text-muted-foreground">견적·상담 후 진행</div>
                <div className="mt-1 font-display text-2xl font-semibold">
                  프로젝트별 맞춤 견적
                </div>
              </div>
              <button
                onClick={() => setInquiryOpen(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                <MessageCircle className="h-4 w-4" /> 문의하기
              </button>
              <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                <li>· 24시간 이내 답변드립니다.</li>
                <li>· 요구사항에 맞춰 견적·일정을 안내드립니다.</li>
                <li>· 계약 및 결제는 상담 후 별도 진행됩니다.</li>
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
      <InquiryModal open={inquiryOpen} onOpenChange={setInquiryOpen} defaultService={product.title} />
    </div>
  );
}
