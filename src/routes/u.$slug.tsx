import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, BadgeCheck, Loader2, Store } from "lucide-react";
import { getSellerBySlug } from "@/lib/discover.functions";

export const Route = createFileRoute("/u/$slug")({
  component: SellerStorePage,
  head: ({ params }) => ({
    meta: [
      { title: `@${params.slug} — 스토어` },
      { name: "description", content: "판매자의 공개 스토어" },
    ],
  }),
});

function SellerStorePage() {
  const { slug } = Route.useParams();
  const fetchSeller = useServerFn(getSellerBySlug);
  const { data, isLoading } = useQuery({
    queryKey: ["seller-store", slug],
    queryFn: () => fetchSeller({ data: { slug } }),
  });

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen px-4 py-20">
        <div className="mx-auto mt-12 max-w-xl rounded-3xl border border-border bg-surface/60 p-10 text-center">
          <h1 className="font-display text-2xl font-bold">스토어를 찾을 수 없어요</h1>
          <Link to="/" className="mt-6 inline-flex items-center gap-2 text-sm text-primary-glow hover:underline">
            <ArrowLeft className="h-4 w-4" /> 홈으로
          </Link>
        </div>
      </div>
    );
  }

  const { seller, products } = data;

  return (
    <div className="min-h-screen px-4 py-16">
      <div className="mx-auto max-w-6xl">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 홈으로
        </Link>

        <header className="mb-10 flex flex-wrap items-center gap-5 rounded-3xl border border-border bg-surface/60 p-6 md:p-8">
          {seller.avatar_url ? (
            <img src={seller.avatar_url} alt="" className="h-20 w-20 rounded-2xl object-cover" />
          ) : (
            <div className="grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-2xl font-bold text-primary-foreground">
              {seller.business_name.charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-bold md:text-3xl">{seller.business_name}</h1>
              {seller.verified && <BadgeCheck className="h-5 w-5 text-primary-glow" aria-label="인증된 판매자" />}
            </div>
            <div className="text-xs text-muted-foreground">/u/{seller.slug}</div>
            {seller.bio && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{seller.bio}</p>}
            {seller.website_url && (
              <a
                href={seller.website_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-primary-glow hover:underline"
              >
                웹사이트 <ArrowUpRight className="h-3 w-3" />
              </a>
            )}
          </div>
        </header>

        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Store className="h-4 w-4" /> 판매중인 제품 {products.length}개
        </div>

        {products.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-surface/30 p-12 text-center text-sm text-muted-foreground">
            아직 공개된 제품이 없어요.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <Link
                key={p.id}
                to="/p/$slug"
                params={{ slug: p.slug ?? "" }}
                disabled={!p.slug}
                className="group relative overflow-hidden rounded-2xl border border-border bg-surface/60 transition hover:border-primary-glow/60"
              >
                <div className="aspect-[16/10] w-full bg-background/40">
                  {p.thumbnail_url ? (
                    <img src={p.thumbnail_url} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
                  ) : null}
                </div>
                <div className="p-4">
                  <div className="mb-1 text-[11px] text-muted-foreground">{p.tag}</div>
                  <div className="truncate font-display text-base font-semibold">{p.title}</div>
                  <div className="mt-2 text-sm">₩{p.amount.toLocaleString("ko-KR")}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
