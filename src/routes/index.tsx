import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight,
  ExternalLink,
  Sparkles,
  Code2,
  Zap,
  Mail,
  CreditCard,
  Loader2,
  Smartphone,
  LogIn,
  LogOut,
  Search,
  ShieldCheck,
  User as UserIcon,
  Building2,
  Gavel,
  Bitcoin,
  Link2,
  MapPinned,
  ShoppingBag,
  MessageCircle,
  Menu,
  X,
  LayoutDashboard,
  Package,
  Webhook,
} from "lucide-react";
import { PORTONE_CONFIG } from "@/lib/portone-config";
import { verifyPayment } from "@/lib/payments.functions";
import { searchProducts, listCategories } from "@/lib/discover.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "AISOLUTION" },
      { name: "description", content: "AI자동화와 함께 빠르게 결과물을 받아보세요." },
    ],
  }),
});

type Product = {
  id: string;
  title: string;
  tag: string;
  description: string;
  amount: number;
  span?: string;
  accent?: string;
  slug?: string | null;
  thumbnail_url?: string | null;
};

function Index() {
  return (
    <div className="min-h-screen text-foreground">
      <Nav />
      <Hero />
      <Portfolio />
      <Develop />
      <Projects />
      <Pricing />
      <About />
      <Contact />
      <Footer />
    </div>
  );
}

const portfolioSites = [
  { title: "브랜드 랜딩 · Radiant", tag: "Landing", url: "https://radiant-marzipan-765729.netlify.app/" },
  { title: "온라인 신청 폼 · 지원하기", tag: "Form/Apply", url: "https://apply.xn--zf4b9pu4hbqu.com/" },
  { title: "펀카 렌터카 예약", tag: "Booking", url: "https://funcar-rentcar.netlify.app/" },
  { title: "VAN POS · 법률 특화", tag: "POS/SaaS", url: "https://van-pos-legal.netlify.app/" },
  { title: "PSM VIP 마케팅", tag: "Marketing", url: "https://psm-vip-marketing.netlify.app/" },
  { title: "Lambent 랜딩", tag: "Landing", url: "https://lambent-salmiakki-a9100e.netlify.app/" },
  { title: "Thunderous 프로덕트", tag: "Product", url: "https://thunderous-semolina-973f49.netlify.app/" },
  { title: "Preeminent 프로모션", tag: "Promo", url: "https://preeminent-longma-670789.netlify.app/" },
  { title: "Stellular 서비스", tag: "Service", url: "https://stellular-zabaione-a4c7f8.netlify.app/" },
  { title: "Sparkly 브랜드", tag: "Brand", url: "https://sparkly-smakager-4041fe.netlify.app/" },
  { title: "Storied 콘텐츠", tag: "Content", url: "https://storied-licorice-8bf649.netlify.app/" },
  { title: "Celadon 스튜디오", tag: "Studio", url: "https://celadon-puppy-3aca7f.netlify.app/" },
  { title: "Timely 예약", tag: "Booking", url: "https://timely-cascaron-a8447e.netlify.app/" },
  { title: "Vocal 커뮤니티", tag: "Community", url: "https://vocal-kangaroo-bd0025.netlify.app/" },
  { title: "Tangerine 커머스", tag: "Commerce", url: "https://tangerine-gumdrop-104c7a.netlify.app/" },
];

function shot(url: string) {
  return `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url&viewport.width=1280&viewport.height=800`;
}

function Portfolio() {
  return (
    <section id="portfolio" className="px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <div className="mb-3 text-sm font-medium text-primary-glow">— Portfolio</div>
            <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
              포트폴리오
            </h2>
          </div>
          <a
            href="#projects"
            className="hidden shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2 text-sm font-medium text-primary-foreground md:inline-flex"
          >
            컬렉션 보기 <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {portfolioSites.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="glow-hover group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface/60"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-background/40">
                <img
                  src={shot(s.url)}
                  alt={s.title}
                  loading="lazy"
                  className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.03]"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />
                <span className="absolute left-3 top-3 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur">
                  {s.tag}
                </span>
                <span className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-background/70 text-foreground/80 backdrop-blur transition group-hover:bg-gradient-to-br group-hover:from-primary group-hover:to-primary-glow group-hover:text-primary-foreground">
                  <ExternalLink className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <h3 className="min-w-0 truncate font-display text-base font-semibold">{s.title}</h3>
                <span className="shrink-0 text-[11px] text-muted-foreground">라이브 보기</span>
              </div>
            </a>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 rounded-3xl border border-border bg-surface/40 p-8 text-center md:flex-row md:justify-between md:text-left">
          <div>
            <div className="font-display text-lg font-semibold">이런 스타일로 내 사이트가 필요하신가요?</div>
            <div className="text-sm text-muted-foreground">아래 컬렉션에서 즉시 결제하거나, 맞춤 제작을 문의하세요.</div>
          </div>
          <div className="flex gap-2">
            <a href="#projects" className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-5 py-2.5 text-sm font-medium text-primary-foreground">
              컬렉션 보기 <ArrowUpRight className="h-4 w-4" />
            </a>
            <a href="#contact" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-5 py-2.5 text-sm">
              맞춤 문의
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

const developItems = [
  {
    icon: Building2,
    title: "부동산 홈페이지",
    tag: "Real Estate",
    desc: "매물 등록·검색, 지도 연동, 중개사 문의까지 갖춘 부동산 전용 홈페이지를 제작합니다. 반응형 디자인과 빠른 로딩 속도로 방문자 이탈을 줄입니다.",
    slug: "real-estate-site",
    price: 100000,
  },
  {
    icon: Gavel,
    title: "부동산 경매 홈페이지",
    tag: "Auction",
    desc: "경매 물건 정보, 입찰 일정, 결과 조회 기능을 제공하는 경매 특화 플랫폼입니다. 실시간 데이터 갱신과 사용자 알림을 지원합니다.",
    slug: "real-estate-auction",
    price: 120000,
  },
  {
    icon: Bitcoin,
    title: "암호화폐 개발건",
    tag: "Crypto",
    desc: "코인 정보 대시보드, 지갑 연동, 차트 시각화 등 암호화폐 서비스 개발 경험이 있습니다. 보안과 실시간성을 중시하는 구조로 설계합니다.",
    slug: "crypto-dev",
    price: 150000,
  },
  {
    icon: Link2,
    title: "어필리에이트 개발건",
    tag: "Affiliate",
    desc: "수익형 제휴 마케팅 사이트, 추천 링크 추적, 실적 집계 기능을 구현합니다. 광고주와 프로모터 모두가 쓰기 편한 관리자 페이지를 함께 만듭니다.",
    slug: "affiliate-dev",
    price: 100000,
  },
  {
    icon: MapPinned,
    title: "지도연동 소개팅앱",
    tag: "Social / Dating",
    desc: "위치 기반 매칭, 지도 위 핀 표시, 채팅 기능이 연동된 소개팅 서비스를 개발합니다. 사용자 경험과 프라이버시 보호를 동시에 고려합니다.",
    slug: "dating-map-app",
    price: 130000,
  },
  {
    icon: ShoppingBag,
    title: "중고거래 플랫폼",
    tag: "C2C Marketplace",
    desc: "당근마켓 스타일의 지역 기반 중고거래 플랫폼을 구축합니다. 상품 등록, 채팅, 거래 상태 관리, 신고 기능까지 포함합니다.",
    slug: "c2c-marketplace",
    price: 130000,
  },
];

function Develop() {
  return (
    <section id="develop" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <div className="mb-3 text-sm font-medium text-primary-glow">— Develop</div>
            <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
              개발 경험
            </h2>
            <p className="mt-4 max-w-xl text-muted-foreground">
              랜딩페이지 외에도 다양한 웹/앱 서비스를 직접 설계하고 개발해 왔습니다.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {developItems.map((item) => (
            <Link
              key={item.title}
              to="/p/$slug"
              params={{ slug: item.slug }}
              className="glass glow-hover flex flex-col rounded-2xl border border-border bg-surface/60 p-6 transition hover:border-primary/40"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
                  <item.icon className="h-5 w-5" />
                </span>
                <span className="rounded-full border border-border/70 bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur">
                  {item.tag}
                </span>
              </div>
              <h3 className="font-display text-lg font-semibold">{item.title}</h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                {item.desc}
              </p>
              <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-4">
                <span className="font-display text-lg font-bold">
                  ₩{item.price.toLocaleString("ko-KR")}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-glow">
                  구매하기 <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-10 rounded-3xl border border-border bg-surface/40 p-8 text-center">
          <div className="font-display text-lg font-semibold">비슷한 서비스가 필요하신가요?</div>
          <div className="mt-2 text-sm text-muted-foreground">
            위 분야 외에도 웹/앱 기획·개발·배포 전 과정을 지원합니다.
          </div>
          <a
            href="#contact"
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            프로젝트 문의 <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

const pricingTiers = [
  { tag: "WordPress", title: "워드프레스 커스터마이징", desc: "테마 수정 및 기능 확장 대응", price: 400000 },
  { tag: "CMS", title: "콘텐츠 관리 시스템", desc: "랜딩페이지나 블로그용 CMS 개발", price: 800000 },
  { tag: "E-Commerce", title: "쇼핑몰 시스템", desc: "기초 쇼핑몰 기능 및 결제 연동 포함", price: 1200000 },
  { tag: "LMS", title: "온라인 교육 시스템", desc: "강의 업로드, 수강, 평가 기능 제공", price: 1200000 },
  { tag: "HR", title: "인사평가 관리 시스템", desc: "성과관리, 연봉계약 등 인사 모듈", price: 1000000 },
  { tag: "WMS", title: "재고·창고 관리 시스템", desc: "입출고·로케이션 기반 재고관리", price: 1400000 },
  { tag: "CRM", title: "고객관리 시스템", desc: "문의, 상담, 이력 기반 고객 관리", price: 700000 },
  { tag: "Chatbot", title: "AI 챗봇 (RAG 기반)", desc: "문서 기반 질문 응답 챗봇 구현", price: 1600000 },
  { tag: "ERP", title: "맞춤형 ERP", desc: "회계, 재무, 인사 등 통합 관리", price: 1400000 },
  { tag: "Booking", title: "예약형 시스템", desc: "스케줄 기반 예약·결제 플랫폼", price: 600000 },
  { tag: "Survey", title: "설문 시스템", desc: "결과 통계 포함 맞춤 설문 툴", price: 400000 },
  { tag: "Forum", title: "커뮤니티/포럼 시스템", desc: "게시판, 댓글, 신고 기능 포함", price: 800000 },
];

function Pricing() {
  return (
    <section id="pricing" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/40 px-4 py-1.5 text-xs text-primary-glow">
            <Sparkles className="h-3.5 w-3.5" />Pricing Guide
          </span>
          <h2 className="mt-5 font-display text-4xl font-bold tracking-tight md:text-5xl">
            자주 문의받은 <span className="text-gradient">시스템 개발 단가</span> 안내
          </h2>
          <p className="mt-4 text-muted-foreground">
            고객님들이 가장 많이 요청하신 시스템을 기준으로<br />최소 개발 단가와 기능 요약을 정리했습니다.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {pricingTiers.map((t) => (
            <div key={t.title} className="glass glow-hover rounded-2xl p-6 text-center">
              <span className="inline-flex rounded-full bg-primary/15 px-3 py-1 text-[11px] font-medium text-primary-glow">
                {t.tag}
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold leading-snug">{t.title}</h3>
              <p className="mt-2 min-h-[40px] text-xs leading-relaxed text-muted-foreground">{t.desc}</p>
              <div className="mt-5 border-t border-border/60 pt-4">
                <div className="font-display text-xl font-bold text-foreground">
                  ₩{t.price.toLocaleString()}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">~</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          * 표기된 금액은 최소 단가이며, 요구 기능·디자인 범위에 따라 변동될 수 있습니다. 정확한 견적은 문의 부탁드립니다.
        </p>
      </div>
    </section>
  );
}


function Nav() {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="mx-auto mt-4 max-w-6xl px-4">
        <nav className="glass flex items-center justify-between rounded-full px-5 py-3">
          <Link to="/" className="flex items-center gap-2 font-display font-bold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground text-xs">
              ◆
            </span>
            <span className="text-base">AISOLUTION</span>
          </Link>
          <div className="hidden gap-7 text-sm text-muted-foreground md:flex">
            <a href="#portfolio" className="transition hover:text-foreground">포트폴리오</a>
            <a href="#develop" className="transition hover:text-foreground">개발 경험</a>
            <a href="#projects" className="transition hover:text-foreground">Projects</a>
            <Link to="/app-dev" className="transition hover:text-foreground">앱 개발</Link>
            <Link to="/sell" className="transition hover:text-foreground">판매하기</Link>
            {user && (
              <>
                <Link to="/dashboard" className="transition hover:text-foreground">대시보드</Link>
                <Link to="/me" className="transition hover:text-foreground">보관함</Link>
              </>
            )}
            {isAdmin && (
              <Link to="/admin/review" className="inline-flex items-center gap-1 text-primary-glow transition hover:text-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />검수
              </Link>
            )}
          </div>
          {user ? (
            <button
              onClick={() => supabase.auth.signOut()}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/40 px-4 py-2 text-sm text-foreground transition hover:bg-surface"
            >
              <LogOut className="h-4 w-4" />로그아웃
            </button>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              <LogIn className="h-4 w-4" />로그인
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative px-4 pt-40 pb-24 md:pt-48 md:pb-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/40 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-primary-glow" />
          AI 자동화 · 라이브
        </div>
        <h1 className="font-display text-5xl font-bold leading-[1.08] md:text-7xl lg:text-8xl">
          AISOLUTION
        </h1>
        <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
          AI자동화와 함께 빠르게 결과물을 받아보세요.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href="#projects"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3 font-medium text-primary-foreground shadow-[var(--shadow-glow)] transition hover:scale-[1.02]"
          >
            프로젝트 보기 <ArrowUpRight className="h-4 w-4" />
          </a>
          <a
            href="#contact"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/40 px-6 py-3 font-medium text-foreground backdrop-blur transition hover:bg-surface"
          >
            문의하기
          </a>
        </div>
      </div>
    </section>
  );
}

function Projects() {
  const fetchSearch = useServerFn(searchProducts);
  const fetchCategories = useServerFn(listCategories);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [category, setCategory] = useState<string>("");

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  const { data: products, isLoading } = useQuery({
    queryKey: ["search-products", debouncedQ, category],
    queryFn: () => fetchSearch({ data: { q: debouncedQ, category, limit: 36 } }),
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => fetchCategories(),
  });

  return (
    <section id="projects" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <div className="mb-3 text-sm font-medium text-primary-glow">— Projects</div>
            <h2 className="font-display text-4xl font-bold md:text-5xl">컬렉션</h2>
          </div>
          <div className="hidden text-sm text-muted-foreground md:block">
            클릭해서 바로 결제하고 사용하기
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="제품·태그·설명 검색"
              className="w-full rounded-full border border-border bg-surface/60 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-primary-glow"
            />
          </div>
          {(categories?.length ?? 0) > 0 && (
            <div className="-mx-1 flex flex-wrap gap-2">
              <button
                onClick={() => setCategory("")}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  category === ""
                    ? "border-primary-glow bg-gradient-to-br from-primary to-primary-glow text-primary-foreground"
                    : "border-border bg-surface/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                전체
              </button>
              {(categories ?? []).map((c: string) => (
                <button
                  key={c}
                  onClick={() => setCategory(c === category ? "" : c)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    category === c
                      ? "border-primary-glow bg-gradient-to-br from-primary to-primary-glow text-primary-foreground"
                      : "border-border bg-surface/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (products ?? []).length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-surface/30 p-16 text-center text-sm text-muted-foreground">
            검색 결과가 없어요.
          </div>
        ) : (
          <div className="grid auto-rows-[minmax(0,auto)] grid-cols-1 gap-4 md:grid-cols-3">
            {((products ?? []) as Product[]).map((p) => (
              <ProjectCard key={p.id} project={{ ...p, span: "min-h-[260px]", accent: "from-primary/30 to-transparent" }} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ProjectCard({ project }: { project: Product }) {
  const [loading, setLoading] = useState(false);
  const verify = useServerFn(verifyPayment);
  const navigate = useNavigate();

  async function pay(method: "CARD" | "EASY_PAY") {
    const channelKey = method === "CARD" ? PORTONE_CONFIG.channelKeyCard : PORTONE_CONFIG.channelKeyEasyPay;
    if (!channelKey) {
      toast.error("카드 결제 채널이 아직 설정되지 않았습니다. 간편결제를 이용해 주세요.");
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
        orderName: project.title,
        totalAmount: project.amount,
        currency: "CURRENCY_KRW",
        payMethod: method,
      });

      if (result?.code !== undefined) {
        toast.error(result.message ?? "결제가 취소되었습니다.");
        return;
      }

      toast.loading("결제 검증 중…", { id: paymentId });
      const verification = await verify({
        data: {
          paymentId,
          expectedAmount: project.amount,
          productTitle: project.title,
          productId: project.id,
        },
      });
      toast.dismiss(paymentId);
      navigate({ to: "/payment/result", search: { paymentId, ok: verification.ok ? 1 : 0 } });
    } catch (err) {
      console.error(err);
      toast.error("결제 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <article
      className={`glow-hover group relative overflow-hidden rounded-3xl border border-border bg-surface/60 p-6 ${project.span}`}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${project.accent} opacity-60`}
      />
      <div className="relative flex h-full flex-col justify-between gap-8">
        <div className="flex items-start justify-between">
          <span className="rounded-full border border-border/80 bg-background/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            {project.tag}
          </span>
          <ArrowUpRight className="h-5 w-5 text-muted-foreground transition group-hover:rotate-45 group-hover:text-primary-glow" />
        </div>
        <div>
          {project.slug ? (
            <Link to="/p/$slug" params={{ slug: project.slug }} className="block group/title">
              <h3 className="font-display text-2xl font-semibold text-foreground transition group-hover/title:text-primary-glow md:text-3xl">
                {project.title}
              </h3>
            </Link>
          ) : (
            <h3 className="font-display text-2xl font-semibold text-foreground md:text-3xl">
              {project.title}
            </h3>
          )}
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
            {project.description}
          </p>
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
            <span className="font-display text-lg font-semibold whitespace-nowrap">
              ₩{project.amount.toLocaleString("ko-KR")}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => pay("CARD")}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-gradient-to-br hover:from-primary hover:to-primary-glow hover:text-primary-foreground disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                카드
              </button>
              <button
                onClick={() => pay("EASY_PAY")}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-gradient-to-br hover:from-primary hover:to-primary-glow hover:text-primary-foreground disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Smartphone className="h-3.5 w-3.5" />}
                간편결제
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function About() {
  return (
    <section id="about" className="px-4 py-24">
      <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-2 md:gap-20">
        <div>
          <div className="mb-3 text-sm font-medium text-primary-glow">— About</div>
          <h2 className="font-display text-4xl font-bold leading-tight md:text-5xl">
            혼자 만드는 작은 스튜디오.
          </h2>
        </div>
        <div className="space-y-6 text-muted-foreground">
          <p className="text-lg leading-relaxed">
            아이디어가 떠오르면 주말에 만들고, 다음 주말에 출시합니다. 빠르게 만들고,
            진짜 쓰는 사람들에게서 배웁니다.
          </p>
          <div className="grid grid-cols-2 gap-4 pt-4">
            {[
              { i: Code2, t: "Full-stack" },
              { i: Zap, t: "Ship Fast" },
              { i: CreditCard, t: "PortOne" },
              { i: UserIcon, t: "AI Native" },
            ].map(({ i: Icon, t }) => (
              <div key={t} className="flex items-center gap-3 rounded-2xl border border-border bg-surface/40 px-4 py-3">
                <Icon className="h-4 w-4 text-primary-glow" />
                <span className="text-sm text-foreground">{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contact" className="px-4 py-24">
      <div className="mx-auto max-w-4xl">
        <div className="glass relative overflow-hidden rounded-3xl p-10 md:p-16">
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/30 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-primary-glow/20 blur-3xl" />
          <div className="relative">
            <div className="mb-3 text-sm font-medium text-primary-glow">— Contact</div>
            <h2 className="font-display text-4xl font-bold md:text-5xl">함께 만들어요.</h2>
            <p className="mt-4 max-w-lg text-muted-foreground md:text-lg">
              협업, 외주, 혹은 그냥 인사. 무엇이든 환영합니다.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="mailto:nancoco0705@gmail.com"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3 font-medium text-primary-foreground transition hover:scale-[1.02]"
              >
                <Mail className="h-4 w-4" /><span>nancoco0705@gmail.com</span>
              </a>
              <button
                onClick={() => {
                  navigator.clipboard.writeText("pinkfox1015");
                  toast.success("카톡아이디가 복사되었습니다");
                }}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-6 py-3 font-medium text-foreground transition hover:bg-surface"
              >
                <MessageCircle className="h-4 w-4 text-primary-glow" /><span>카톡: pinkfox1015</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/40 px-4 py-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Link to="/terms" className="text-muted-foreground transition hover:text-foreground">이용약관</Link>
          <Link to="/privacy" className="font-medium text-foreground transition hover:text-primary-glow">개인정보처리방침</Link>
          <Link to="/refund" className="text-muted-foreground transition hover:text-foreground">환불 정책</Link>
        </div>

        <div className="rounded-2xl border border-border/60 bg-surface/40 p-5 text-xs leading-relaxed text-muted-foreground md:text-sm">
          <div className="mb-2 font-display text-sm font-semibold text-foreground md:text-base">에이아이솔루션 (AISOLUTION)</div>
          <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
            <div><span className="text-foreground/70">대표</span> · 이서연</div>
            <div><span className="text-foreground/70">사업자등록번호</span> · 215-28-82229</div>
            <div className="md:col-span-2"><span className="text-foreground/70">주소</span> · 서울특별시 서초구 서초중앙로29길 16-6, 대림빌라 B-303</div>
            <div><span className="text-foreground/70">고객센터</span> · 02-533-1134</div>
            <div><span className="text-foreground/70">이메일</span> · nancoco0705@gmail.com</div>
            <div className="md:col-span-2"><span className="text-foreground/70">통신판매업신고번호</span> · 신고 예정 (PG 계약 후 신고 진행)</div>
            <div className="md:col-span-2"><span className="text-foreground/70">서비스 제공 기간</span> · 단건 결제 상품은 결제일로부터 최대 3개월</div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground md:flex-row">
          <div>© {new Date().getFullYear()} AISOLUTION. All rights reserved.</div>
          <div className="flex items-center gap-2">
            Powered by <span className="text-foreground">PortOne</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </footer>
  );
}

