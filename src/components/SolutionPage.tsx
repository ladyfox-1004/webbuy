// 업종별 솔루션 페이지의 공용 껍데기. 모든 /solutions/* 라우트가 데이터만 바꿔 이 컴포넌트를 쓴다.
// 🚨 페이지를 6벌 복사하지 마라. 문구 하나 고치려고 6곳을 고치게 된다.

import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Check,
  ExternalLink,
  Info,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { useInquiry } from "@/components/InquiryModal";
import { SiteFooter } from "@/components/SiteFooter";
import { TossMiniAppCaseCard } from "@/components/TossMiniApp";
import { portfolioByName, shot, KAKAO_OPENCHAT_URL } from "@/lib/portfolio";
import {
  solutions,
  solutionNavLabels,
  type Product,
  type Solution,
} from "@/lib/solutions";

function SolutionNav() {
  const { openInquiry } = useInquiry();
  return (
    <header className="fixed top-0 right-0 left-0 z-50">
      <div className="mx-auto mt-4 max-w-6xl px-4">
        <nav className="glass flex items-center justify-between rounded-full px-5 py-3">
          <Link to="/" className="flex items-center gap-2 font-display font-bold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-xs text-primary-foreground">
              ◆
            </span>
            <span className="text-base">AISOLUTION</span>
          </Link>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/" className="hidden transition hover:text-foreground sm:inline">
              홈
            </Link>
            <Link to="/blog" className="transition hover:text-foreground">
              블로그
            </Link>
            <button
              type="button"
              onClick={() => openInquiry()}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-glow)] transition hover:scale-[1.02]"
            >
              문의하기 <MessageCircle className="h-3.5 w-3.5" />
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}

// 상품 카드 하나. "이 상품 문의하기"는 상품명을 서비스명으로 문의 모달에 넘긴다.
function ProductCard({ product }: { product: Product }) {
  const { openInquiry } = useInquiry();
  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md sm:p-6">
      <div className="flex flex-wrap gap-1.5">
        {product.audience.map((a) => (
          <span
            key={a}
            className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] leading-none font-medium text-primary"
          >
            {a}
          </span>
        ))}
      </div>
      <h3 className="mt-3 font-display text-lg leading-snug font-semibold text-slate-900">
        {product.name}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{product.summary}</p>

      <ul className="mt-4 space-y-2">
        {product.does.map((d) => (
          <li key={d} className="flex items-start gap-2 text-sm text-slate-700">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{d}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {product.integrations.map((i) => (
          <span
            key={i}
            className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] leading-none text-slate-600"
          >
            {i}
          </span>
        ))}
      </div>

      {product.note && (
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{product.note}</span>
        </p>
      )}

      <div className="mt-auto pt-5">
        <button
          type="button"
          onClick={() => openInquiry(product.name)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:scale-[1.02]"
        >
          <MessageCircle className="h-4 w-4" /> 이 상품 문의하기
        </button>
      </div>
    </article>
  );
}

export function SolutionPage({ solution }: { solution: Solution }) {
  const { openInquiry } = useInquiry();

  // 이름이 portfolioSites 에 없으면 조용히 빠진다. 없는 사례를 지어내지 않기 위해서다.
  const cases = solution.cases.flatMap((name) => {
    const site = portfolioByName.get(name);
    return site ? [{ name, url: site.url }] : [];
  });
  const others = solutions.filter((s) => s.slug !== solution.slug);
  const products = solution.products ?? [];
  const hasProducts = products.length > 0;

  return (
    <div className="min-h-screen text-foreground">
      <SolutionNav />

      {/* ── 히어로 ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 pt-32 pb-16 md:pt-40 md:pb-20">
        <div className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-primary-glow/15 blur-3xl" />
        <div className="relative mx-auto max-w-4xl">
          <Link
            to="/"
            className="text-sm text-muted-foreground transition hover:text-foreground"
          >
            ← 홈으로
          </Link>
          <div className="mt-6 mb-3 text-sm font-medium text-primary-glow">— {solution.eyebrow}</div>
          <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl md:text-5xl">
            {solution.h1}
          </h1>
          <p className="mt-6 max-w-2xl leading-relaxed text-muted-foreground md:text-lg">
            {solution.intro}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => openInquiry(solution.inquirySubject)}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:scale-[1.02]"
            >
              <MessageCircle className="h-4 w-4" /> 상담 문의하기
            </button>
            <a
              href={hasProducts ? "#products" : "#features"}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-6 py-3 text-sm font-medium text-foreground transition hover:bg-surface"
            >
              {hasProducts ? "상품 목록 보기" : "달 수 있는 기능 보기"}{" "}
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ── 상품 목록 (products 가 있는 페이지만) ───────────────── */}
      {hasProducts && (
        <section id="products" className="bg-slate-50 px-4 pt-20 text-slate-900 md:pt-24">
          <div className="mx-auto max-w-6xl">
            <div className="text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Products
              </span>
              <h2 className="mt-5 font-display text-3xl font-bold tracking-tight md:text-4xl">
                상품 <span className="text-gradient">목록</span>
              </h2>
              <p className="mt-4 text-sm text-slate-600 md:text-base">
                바로 시작할 수 있게 묶어 둔 자동화입니다. 업무에 맞춰 조정합니다.
              </p>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {products.map((p) => (
                <ProductCard key={p.name} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 본체: 달 수 있는 기능 ────────────────────────────────── */}
      <section id="features" className="bg-slate-50 px-4 py-20 text-slate-900 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              What We Build
            </span>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight md:text-4xl">
              달 수 있는 <span className="text-gradient">기능</span>
            </h2>
            <p className="mt-4 text-sm text-slate-600 md:text-base">
              필요한 것만 골라 붙입니다. 훑어보시다 &ldquo;이거 우리한테 필요한데&rdquo; 싶은 항목을
              말씀해 주세요.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {solution.featureGroups.map((group) => (
              <div
                key={group.title}
                className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md"
              >
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {group.title}
                </h3>
                <div className="mt-4 flex flex-1 flex-wrap content-start gap-1.5">
                  {group.items.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] leading-none text-slate-600"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {solution.notice && (
            <div className="mt-6 flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-600 shadow-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{solution.notice}</span>
            </div>
          )}

          {/* ── 여기서 더 나아가면 ─────────────────────────────── */}
          <div className="mt-12 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-xl font-semibold text-slate-900 md:text-2xl">
                여기서 더 나아가면
              </h2>
              <div className="hidden h-px flex-1 bg-slate-200 sm:block" />
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">
              {solution.nextStepsNote}
            </p>
            <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {solution.nextSteps.map((step) => (
                <li
                  key={step}
                  className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
            {solution.slug !== "platform" && (
              <Link
                to="/solutions/platform"
                className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:scale-[1.02]"
              >
                예약·매칭 플랫폼 개발 보기 <ArrowUpRight className="h-4 w-4" />
              </Link>
            )}
          </div>

          {/* ── 사례 (분위기용. 설명은 붙이지 않는다) ──────────── */}
          {(cases.length > 0 || solution.tossMiniApp) && (
            <div className="mt-12">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display text-xl font-semibold text-slate-900 md:text-2xl">
                  사례
                </h2>
                <div className="hidden h-px flex-1 bg-slate-200 sm:block" />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {cases.map((c) => (
                  <a
                    key={c.url}
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-primary/40 hover:shadow-md"
                  >
                    <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                      <img
                        src={shot(c.url)}
                        alt={c.name}
                        loading="lazy"
                        className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.03]"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <span className="min-w-0 truncate text-xs font-medium text-slate-700">
                        {c.name}
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    </div>
                  </a>
                ))}
                {solution.tossMiniApp && <TossMiniAppCaseCard />}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── 상담 문의 CTA ──────────────────────────────────────── */}
      <section className="px-4 py-20 md:py-24">
        <div className="mx-auto max-w-4xl">
          <div className="glass relative overflow-hidden rounded-3xl p-8 md:p-14">
            <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-primary-glow/20 blur-3xl" />
            <div className="relative">
              <div className="mb-3 text-sm font-medium text-primary-glow">— Contact</div>
              <h2 className="font-display text-2xl font-bold md:text-4xl">{solution.ctaTitle}</h2>
              <p className="mt-4 max-w-lg leading-relaxed text-muted-foreground md:text-lg">
                {solution.ctaBody}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => openInquiry(solution.inquirySubject)}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3 font-semibold text-primary-foreground transition hover:scale-[1.02]"
                >
                  <MessageCircle className="h-4 w-4" /> 상담 문의하기
                </button>
                <a
                  href={KAKAO_OPENCHAT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-6 py-3 font-medium text-foreground transition hover:bg-surface"
                >
                  <MessageCircle className="h-4 w-4 text-primary-glow" />
                  <span>카카오톡 상담</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 다른 업종 ─────────────────────────────────────────── */}
      <section className="px-4 pb-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 text-sm font-medium text-primary-glow">— 다른 업종</div>
          <div className="flex flex-wrap gap-2">
            {others.map((s) => (
              <Link
                key={s.slug}
                to={s.path}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/40 px-4 py-2 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
              >
                {solutionNavLabels[s.slug] ?? s.slug}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
