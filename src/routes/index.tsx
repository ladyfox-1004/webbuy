import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AppWindow,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarCheck,
  ClipboardList,
  Compass,
  CreditCard,
  ExternalLink,
  Globe,
  GraduationCap,
  Inbox,
  Layers,
  LayoutDashboard,
  Link2,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  MonitorPlay,
  Newspaper,
  Package,
  Plus,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Store,
  Target,
  TrendingUp,
  User as UserIcon,
  UserCheck,
  Users,
  Warehouse,
  Webhook,
  Workflow,
  Wrench,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useInquiry } from "@/components/InquiryModal";
import { InquiryForm } from "@/components/InquiryForm";
import { SiteFooter } from "@/components/SiteFooter";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  TossMiniAppCardBody,
  TossMiniAppCaseLink,
  TossMiniAppQrDialogContent,
} from "@/components/TossMiniApp";
import {
  portfolioSites,
  portfolioByName,
  shot,
  KAKAO_OPENCHAT_URL,
  TOSS_MINIAPP_URL,
} from "@/lib/portfolio";
import { solutions, solutionNavLabels, solutionBySlug } from "@/lib/solutions";
import { CaseStudyFeatureCard } from "@/components/CaseStudy";

export const Route = createFileRoute("/")({
  component: Index,
  // 🚨 여기서 title/description 을 다시 정의하지 마라. 라우트 head 가 루트(__root.tsx)를
  //    덮어써서, 루트의 검색어 중심 제목·설명이 조용히 무시된다. 실제로 그렇게 돼 있었고
  //    og:* 만 새 값이고 title 은 "AISOLUTION" 인 채로 배포됐다.
  //    홈은 사이트 대표 페이지라 루트 메타를 그대로 쓴다.
  //    canonical 만 여기서 단다 — 루트에 두면 하위 페이지마다 두 개가 되기 때문이다.
  head: () => ({
    links: [{ rel: "canonical", href: "https://ai-solution.co.kr" }],
  }),
});

// 섹션 순서 (2026-10 B2B 개편)
// 약속(히어로) → 무엇을 하는가(세 축) → 증명(대표 사례) → 폭(포트폴리오)
// → 깊이(할 수 있는 일) → 신뢰(회사 소개) → 행동(상담 신청).
// 🚨 예전 "컬렉션(#projects)" 섹션은 products 테이블이 없어 빈 화면만 보여서 뺐다.
//    "기획/개발(#develop)" 카드는 "할 수 있는 일" 안의 분야 칩으로 합쳤다.
function Index() {
  return (
    <div className="min-h-screen text-foreground">
      <Nav />
      <Hero />
      <Services />
      <FeaturedCase />
      <Portfolio />
      <Capabilities />
      <About />
      <Contact />
      <SiteFooter />
    </div>
  );
}

// 홈 앵커 메뉴. 데스크톱·모바일 메뉴가 같이 쓴다.
const navItems = [
  { href: "#services", label: "서비스" },
  { href: "#case", label: "대표 사례" },
  { href: "#portfolio", label: "포트폴리오" },
  { href: "#capabilities", label: "역량" },
  { href: "#about", label: "회사 소개" },
];

// 공용 섹션 머리말
function SectionHeading({
  eyebrow,
  title,
  desc,
  center,
}: {
  eyebrow: string;
  title: React.ReactNode;
  desc?: React.ReactNode;
  center?: boolean;
}) {
  return (
    <div className={center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <div className="mb-4 font-display text-xs font-semibold tracking-[0.2em] text-primary-glow uppercase">
        {eyebrow}
      </div>
      <h2 className="font-display text-3xl leading-tight font-bold tracking-tight md:text-5xl">
        {title}
      </h2>
      {desc && (
        <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">{desc}</p>
      )}
    </div>
  );
}

// ── 히어로 ─────────────────────────────────────────────────────────
// 🚨 숫자·실적을 넣지 마라(검증 가능한 것만 쓴다). 약속은 "제작"이 아니라 "확장"이다.
function Hero() {
  return (
    <section id="top" className="relative overflow-hidden px-4 pt-36 pb-24 md:pt-48 md:pb-32">
      {/* 은은한 격자 배경 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black,transparent)]"
      />
      <div className="relative mx-auto max-w-6xl">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border/70 bg-surface/50 px-3.5 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-primary-glow" />
          AISOLUTION · GROWTH PARTNER
        </div>
        <p className="font-display text-base font-medium text-primary-glow md:text-xl">
          AI 기반 데이터 분석 × 통합 미디어 솔루션
        </p>
        <h1 className="mt-4 max-w-5xl font-display text-[2.6rem] leading-[1.12] font-bold tracking-tight md:text-7xl md:leading-[1.08]">
          비즈니스의 <span className="text-gradient">스케일</span>을
          <br />
          확장합니다
        </h1>
        <p className="mt-8 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          웹·앱 플랫폼, CRM·Meta 광고, 건물 전광판(DOOH)까지. 고객이 브랜드를 만나는 온라인과
          오프라인의 접점을 하나의 데이터 흐름으로 묶어, 매출이 커지는 구조를 설계하고 운영합니다.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href="#contact"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3.5 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:scale-[1.02]"
          >
            상담 신청 <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#portfolio"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/40 px-6 py-3.5 font-medium text-foreground backdrop-blur transition hover:bg-surface"
          >
            사례 보기 <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>

        <div className="mt-16 grid max-w-4xl grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/50 sm:grid-cols-3">
          {[
            { icon: AppWindow, k: "Platform", v: "Web/App 플랫폼 구축" },
            { icon: Target, k: "Marketing", v: "CRM · Meta Ads 통합 마케팅" },
            { icon: MonitorPlay, k: "DOOH", v: "디지털 사이니지 통합 운영" },
          ].map(({ icon: Icon, k, v }) => (
            <a
              key={k}
              href="#services"
              className="group flex items-center gap-3 bg-background/80 px-5 py-4 transition hover:bg-surface"
            >
              <Icon className="h-4 w-4 shrink-0 text-primary-glow" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  {k}
                </div>
                <div className="text-sm font-medium text-foreground">{v}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 서비스 세 축 ───────────────────────────────────────────────────
// 🚨 DOOH 는 공개할 사례가 없다. 사례·숫자를 지어내지 말고 서비스 범위만 적는다.
// 🚨 해 본 적 없는 연동을 "된다"고 쓰지 않는다(src/lib/solutions.ts 머리 주석과 같은 원칙).
type Pillar = {
  no: string;
  icon: LucideIcon;
  en: string;
  title: string;
  value: string;
  items: string[];
};

const pillars: Pillar[] = [
  {
    no: "01",
    icon: AppWindow,
    en: "Platform",
    title: "Web/App 플랫폼 구축",
    value: "매출이 일어나는 자사 플랫폼을 설계하고 구축합니다.",
    items: [
      "예약·매칭·커머스 등 서비스 플랫폼 개발",
      "관리자 화면과 운영 업무 자동화",
      "결제(PG)·외부 API·데이터 연동",
      "출시 후 성능 개선과 운영 지원",
    ],
  },
  {
    no: "02",
    icon: Target,
    en: "Integrated Marketing",
    title: "디지털 통합 마케팅 (CRM & Meta Ads)",
    value: "유입부터 재구매까지, 고객 데이터를 한 흐름으로 잇습니다.",
    items: [
      "Meta(페이스북·인스타그램) 광고 캠페인 설계·운영",
      "픽셀·전환 추적 설정과 성과 리포트",
      "CRM 고객 데이터 통합과 세그먼트 관리",
      "문의·상담 리드 자동 수집과 후속 관리",
    ],
  },
  {
    no: "03",
    icon: MonitorPlay,
    en: "Digital Signage · DOOH",
    title: "오프라인 디지털 사이니지(DOOH) 통합 운영",
    value: "건물 전광판 송출을 하나의 통합 시스템으로 운영합니다.",
    items: [
      "건물 전광판 송출 통합 시스템 커스터마이징",
      "여러 스크린의 콘텐츠 편성·스케줄 송출 관리",
      "광고주·소재 관리와 송출 이력 정리",
      "온라인 캠페인과 연계한 오프라인 노출 기획",
    ],
  },
];

function PillarCard({ p, wide }: { p: Pillar; wide?: boolean }) {
  return (
    <div
      className={
        "group relative flex flex-col overflow-hidden rounded-3xl border bg-surface/50 p-7 transition md:p-9 " +
        (wide
          ? "border-primary/40 shadow-[var(--shadow-glow)] lg:col-span-2 lg:grid lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-12"
          : "border-border hover:border-primary/40")
      }
    >
      {wide && (
        <div className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-primary/25 blur-3xl" />
      )}
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span className="font-display text-sm font-semibold text-muted-foreground">
            {p.no}
            <span className="ml-2 text-[11px] tracking-[0.16em] text-primary-glow uppercase">
              {p.en}
            </span>
          </span>
          {wide && (
            <span className="rounded-full bg-gradient-to-br from-primary to-primary-glow px-3 py-1 text-[11px] font-semibold text-primary-foreground">
              Core
            </span>
          )}
        </div>
        <div className="mt-6 flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-lg">
            <p.icon className="h-5 w-5" />
          </span>
          <h3 className="mt-1 font-display text-xl leading-snug font-bold md:text-2xl">
            {p.title}
          </h3>
        </div>
        <p className="mt-5 text-base leading-relaxed text-foreground/90 md:text-lg">{p.value}</p>
        <ul className="mt-6 space-y-3 border-t border-border/70 pt-6">
          {p.items.map((it) => (
            <li
              key={it}
              className="flex items-start gap-3 text-sm text-muted-foreground md:text-[15px]"
            >
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-glow" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      </div>
      {wide && <SignageIllustration />}
    </div>
  );
}

// DOOH 카드의 도식. 실제 화면이 아니라 "여러 스크린을 한 곳에서 편성한다"는 구조만 그린다.
function SignageIllustration() {
  const screens = [
    "from-primary/70 to-primary-glow/40",
    "from-primary-glow/50 to-primary/20",
    "from-primary/40 to-transparent",
    "from-primary-glow/60 to-primary/30",
    "from-primary/30 to-primary-glow/20",
    "from-primary-glow/40 to-transparent",
  ];
  return (
    <div aria-hidden className="relative mt-10 lg:mt-0">
      <div className="rounded-2xl border border-border bg-background/70 p-4 md:p-5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            통합 송출 콘솔
          </span>
          <span>스크린 · 편성 · 스케줄</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {screens.map((g, i) => (
            <div
              key={i}
              className={`aspect-[16/10] rounded-lg border border-border/70 bg-gradient-to-br ${g}`}
            />
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {[
            ["w-[46%]", "ml-[4%]"],
            ["w-[30%]", "ml-[30%]"],
            ["w-[38%]", "ml-[56%]"],
          ].map(([w, ml], i) => (
            <div key={i} className="h-2.5 rounded-full bg-surface">
              <div
                className={`h-2.5 rounded-full bg-gradient-to-r from-primary to-primary-glow ${w} ${ml}`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 업종별 솔루션 페이지로 보내는 링크는 이 섹션 아래에 둔다.
// 🚨 홈에 링크가 없으면 크롤러도 사람도 /solutions/* 페이지를 못 찾는다. 사이트맵만으로는 부족하다.
function Services() {
  return (
    <section id="services" className="scroll-mt-24 px-4 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="What We Do"
          title={
            <>
              세 개의 축으로
              <br className="md:hidden" /> 성장을 설계합니다
            </>
          }
          desc="플랫폼, 마케팅, 오프라인 미디어를 따로 맡기면 데이터가 끊깁니다. 에이아이솔루션은 세 영역을 한 팀이 설계하고 운영해, 고객 접점 전체를 하나의 성장 구조로 만듭니다."
        />

        <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <PillarCard p={pillars[0]} />
          <PillarCard p={pillars[1]} />
          <PillarCard p={pillars[2]} wide />
        </div>

        <div
          id="solutions"
          className="mt-14 scroll-mt-24 rounded-3xl border border-border bg-surface/30 p-6 md:p-8"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-semibold tracking-[0.18em] text-primary-glow uppercase">
                Industry Solutions
              </div>
              <h3 className="mt-2 font-display text-xl font-bold md:text-2xl">업종별 솔루션</h3>
            </div>
            <p className="max-w-md text-sm text-muted-foreground">
              업종마다 문의가 새는 지점이 다릅니다. 어떤 기능을 붙이고 어디까지 확장할 수 있는지
              업종별로 정리했습니다.
            </p>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {solutions.map((s) => (
              <Link
                key={s.slug}
                to={s.path}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/50 px-4 py-3.5 transition hover:border-primary/50 hover:bg-surface"
              >
                <span className="min-w-0">
                  <span className="block text-[11px] font-medium text-primary-glow">
                    {solutionNavLabels[s.slug] ?? s.slug}
                  </span>
                  <span className="mt-0.5 block text-sm leading-snug font-medium text-foreground">
                    {s.h1}
                  </span>
                </span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary-glow" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 대표 사례 ──────────────────────────────────────────────────────
// 데이터는 /solutions/automation 의 caseStudy 하나뿐이다(고객사 익명).
const featuredCase = solutionBySlug.get("automation")?.caseStudy;

function FeaturedCase() {
  if (!featuredCase) return null;
  return (
    <section id="case" className="scroll-mt-24 px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Case Study"
          title="대표 사례 · 운영 자동화"
          desc="한 번 만들고 끝나는 페이지가 아니라, 매일 돌아가는 운영을 시스템으로 바꾼 사례입니다."
        />
        <div className="mt-12">
          <CaseStudyFeatureCard caseStudy={featuredCase} />
        </div>
      </div>
    </section>
  );
}

// ── 포트폴리오 ─────────────────────────────────────────────────────
// 🚨 17개 사례는 하나도 빼지 않는다(사장님 결정).
// 데이터 제목의 " · AISOLUTION" 은 portfolioByName 이 " · " 앞부분으로 찾는 열쇠라 그대로 두고,
// 화면에서만 떼어 낸다(그대로 두면 카드 제목이 잘린다).
const displayTitle = (title: string) => title.split(" · ")[0];

function Portfolio() {
  return (
    <section id="portfolio" className="scroll-mt-24 px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <SectionHeading
            eyebrow="Portfolio"
            title="포트폴리오"
            desc="상담·전환 페이지부터 운영 플랫폼까지, 지금 바로 열어볼 수 있는 납품 사이트입니다."
          />
          <a
            href="#contact"
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-border bg-surface/40 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-surface md:self-auto"
          >
            프로젝트 상담 <ArrowUpRight className="h-4 w-4" />
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
                  alt={displayTitle(s.title)}
                  loading="lazy"
                  width={800}
                  height={500}
                  className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.03]"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />
                <span className="absolute top-3 left-3 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur">
                  {s.tag}
                </span>
                <span className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-background/70 text-foreground/80 backdrop-blur transition group-hover:bg-gradient-to-br group-hover:from-primary group-hover:to-primary-glow group-hover:text-primary-foreground">
                  <ExternalLink className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <h3
                  title={displayTitle(s.title)}
                  className="min-w-0 truncate font-display text-base font-semibold"
                >
                  {displayTitle(s.title)}
                </h3>
                <span className="shrink-0 text-[11px] text-muted-foreground">라이브 보기</span>
              </div>
            </a>
          ))}

          {/* 좁은 화면: QR은 쓸모없으니 토스로 바로 보낸다 */}
          <a
            href={TOSS_MINIAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="glow-hover group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface/60 md:hidden"
          >
            <TossMiniAppCardBody Icon={ExternalLink} action="토스에서 열기" />
          </a>

          {/* 넓은 화면: 눌러도 열리지 않는 링크 대신 폰으로 찍을 QR을 띄운다 */}
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="glow-hover group relative hidden cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-surface/60 text-left md:flex"
              >
                <TossMiniAppCardBody Icon={QrCode} action="QR로 열기" />
              </button>
            </DialogTrigger>
            <TossMiniAppQrDialogContent />
          </Dialog>

          {/* 이외 다수 — 공개하지 않은 프로젝트는 상담에서 업종에 맞춰 보여준다 */}
          <a
            href="#contact"
            className="group relative flex flex-col justify-between gap-6 overflow-hidden rounded-2xl border border-dashed border-primary/40 bg-gradient-to-br from-primary/10 via-surface/40 to-transparent p-6 transition hover:border-primary/70 sm:col-span-2 md:flex-row md:items-center md:p-8 lg:col-span-3"
          >
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-primary/40 bg-background/60 text-primary-glow">
                <Plus className="h-5 w-5" />
              </span>
              <div>
                <div className="font-display text-xl font-bold">이외 다수</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  공개하지 않은 프로젝트가 더 있습니다. 상담 시 업종과 목적에 맞는 사례를 따로
                  보여드립니다.
                </p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-gradient-to-br from-primary to-primary-glow px-5 py-2.5 text-sm font-medium text-primary-foreground md:self-auto">
              사례 상담 요청{" "}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}

// ── "이런 것을 만듭니다" 섹션 ───────────────────────────────────────────────
// 카테고리를 나열하면 사려는 사람이 자기 문제를 못 찾는다. 그래서 제목은 증상,
// 내용은 기능 단위로 쪼개고, 사례가 있는 것에는 실제 포트폴리오를 붙인다.

// 배지에 쓸 수 있는 숫자는 "항목 개수" 가 아니라 "실제로 사례를 걸 수 있는 항목 개수" 다.
function countLinked(items: Capability[]) {
  return items.filter((c) => (c.cases ?? []).some((n) => portfolioByName.has(n)) || c.tossMiniApp)
    .length;
}

type Capability = {
  icon: LucideIcon;
  /** 사장님이 말하는 증상 그대로 */
  title: string;
  /** 스캔되게 칩으로 뿌린다 */
  features: string[];
  /** portfolioSites 의 이름 (예: "기사 일정 관리 SaaS"). 없으면 카드가 상담 문의로 바뀐다 */
  cases?: string[];
  /** 토스 미니앱 사례. PC 에서는 링크가 막다른 길이라 QR 다이얼로그를 연다 */
  tossMiniApp?: boolean;
};

// A. 만들어 본 것
// 순서는 사장님 방향(랜딩은 충분히 했다, 이제 플랫폼으로 확장한다)을 그대로 따른다.
// 1) 플랫폼·SaaS → 2) 업무 시스템 → 3) 전환 페이지.
// cases 는 "정말 그 기능을 만든 사이트"만 적는다. 없으면 비워 두면 카드가 알아서 상담 문의로 바뀐다.
const provenCapabilities: Capability[] = [
  // ── 1. 플랫폼·SaaS ────────────────────────────────────────────────
  {
    icon: CalendarCheck,
    title: "예약을 받고 싶다",
    features: [
      "시간대별 정원 관리",
      "노쇼 방지 선결제",
      "취소·환불 규정 자동 적용",
      "알림 리마인드",
      "관리자 캘린더",
      "중복예약 차단",
      "예약 변경·양도",
    ],
    // 예전에 걸려 있던 "렌터카 예약"·"예약 시스템"은 실제로는 견적·병원 랜딩이었다.
    // 진짜 일정을 굴리는 것은 일:찍 하나뿐이라 그것만 남긴다.
    cases: ["기사 일정 관리 SaaS"],
  },
  {
    icon: Store,
    title: "매장·현장 업무를 시스템으로",
    features: [
      "주문·결제 단말 연동",
      "일 마감 정산",
      "재고 차감",
      "기사·직원 일정 배정",
      "이동 동선 정리",
      "근무 기록",
      "모바일 우선 화면",
    ],
    // 예전에 POS 사례로 걸어 둔 van-pos-legal 은 실제로는 법무법인 랜딩이었다. 뺀다.
    cases: ["기사 일정 관리 SaaS"],
  },
  {
    icon: Smartphone,
    title: "앱처럼 쓰이게 하고 싶다",
    features: ["토스 미니앱", "모바일 웹앱(PWA)", "홈 화면 추가", "푸시 알림", "오프라인 대응"],
    tossMiniApp: true,
  },
  {
    icon: CreditCard,
    title: "결제를 붙이고 싶다",
    features: [
      "PG 심사 대응(사업자 서류·약관)",
      "카드·간편결제",
      "부분 취소와 환불",
      "정기 결제",
      "정산 리포트",
      "결제 실패 재시도",
      "웹훅 중복 처리",
    ],
    // 걸려 있던 두 사례(tangerine-gumdrop·van-pos-legal)에 결제 흔적이 0건이었다. 상담으로 보낸다.
  },

  // ── 2. 업무 시스템 ────────────────────────────────────────────────
  {
    icon: Inbox,
    title: "문의가 여기저기 흩어진다",
    features: [
      "폼·전화·카톡 문의를 한 곳에",
      "담당자 자동 배정",
      "상담 이력 타임라인",
      "재문의 알림",
      "처리 상태 관리",
      "응답 시간 통계",
      "첨부파일 보관",
    ],
    cases: ["법무법인 상담 랜딩", "형사전문 법무법인 랜딩", "정부지원 신청 랜딩"],
  },
  {
    icon: Workflow,
    title: "시스템끼리 연결하고 싶다",
    features: [
      "리드 수신 API",
      "시트·CRM 연동",
      "카카오 알림톡",
      "웹훅 발신과 재시도",
      "API 키 발급·회수",
      "연동 장애 알림",
    ],
    // "VIP 마케팅"·"서비스 소개" 는 연동 사례가 아니라 서비스 소개 랜딩이었다.
  },
  {
    icon: Newspaper,
    title: "콘텐츠를 계속 올려야 한다",
    features: [
      "글·공지 관리 화면",
      "이미지 업로드",
      "예약 발행",
      "카테고리·태그",
      "검색",
      "작성자 권한",
    ],
    // "콘텐츠 페이지"·"스튜디오 소개" 는 분양 안내·병원 랜딩이었다. CMS 사례가 아니다.
  },
  {
    icon: Users,
    title: "사람들이 모이는 공간이 필요하다",
    features: [
      "게시판·댓글·대댓글",
      "신고와 차단",
      "등급·권한 분리",
      "알림",
      "검색",
      "스팸 방지",
      "운영자 화면",
    ],
    // "커뮤니티" 는 인터넷 가입 랜딩이었다. 게시판이 0건이다.
  },
  {
    icon: ShoppingBag,
    title: "물건을 팔고 싶다",
    features: [
      "상품·옵션·재고",
      "장바구니",
      "주문·배송 상태",
      "쿠폰과 할인",
      "리뷰",
      "정산",
      "판매자 화면",
    ],
    // "커머스" 는 GPA KOREA 브랜드 페이지였다. 장바구니가 0건이다.
  },

  // ── 3. 전환 페이지 ────────────────────────────────────────────────
  {
    icon: Globe,
    title: "브랜드를 보여줄 페이지가 필요하다",
    features: [
      "반응형 1~5페이지",
      "문의 폼",
      "검색 노출 기본기(제목·설명·OG)",
      "속도 최적화",
      "도메인·SSL 연결",
      "방문 통계",
    ],
    // 실제로 가장 두꺼운 영역이다. 납품한 랜딩을 전부 건다.
    cases: [
      "모발이식 상담 랜딩",
      "안과 시력교정 랜딩",
      "라미네이트 센터 랜딩",
      "남성의학 센터 랜딩",
      "비뇨의학과 랜딩",
      "법무법인 상담 랜딩",
      "형사전문 법무법인 랜딩",
      "장기렌트 견적 랜딩",
      "인터넷 가입 센터 랜딩",
      "식당 브랜드 페이지",
      "GPA KOREA 브랜드 페이지",
      "마켓 운영대행 소개",
      "자동매매 서비스 소개",
      "아파트 분양 안내",
      "오피스텔 분양 방문예약",
    ],
  },
  {
    icon: ClipboardList,
    title: "신청·설문을 받고 싶다",
    features: [
      "조건부 문항 분기",
      "파일 첨부",
      "중복 제출 방지",
      "결과 통계",
      "시트 자동 적재",
      "신청자 알림 메일",
    ],
    cases: ["정부지원 신청 랜딩", "오피스텔 분양 방문예약"],
  },
];

// B. 아직 공개할 사례가 없는 것 — 링크 대신 상담으로 연결한다
const consultCapabilities: Capability[] = [
  {
    icon: Building2,
    title: "회계·재고·인사를 한 시스템으로",
    features: [
      "맞춤형 ERP",
      "기존 시스템 연동",
      "회계·재무",
      "인사·급여",
      "권한 결재선",
      "데이터 이관",
      "리포트",
    ],
  },
  {
    icon: Warehouse,
    title: "창고·재고를 정확히",
    features: [
      "WMS",
      "입출고",
      "로케이션 관리",
      "바코드·QR 스캔",
      "실사 재고",
      "재고 알림",
      "출고 오류 추적",
    ],
  },
  {
    icon: GraduationCap,
    title: "교육을 온라인으로",
    features: [
      "LMS",
      "강의 업로드",
      "수강 진도",
      "퀴즈·평가",
      "수료증 발급",
      "기수 관리",
      "진도 통계",
    ],
  },
  {
    icon: UserCheck,
    title: "인사평가를 체계적으로",
    features: ["HR", "목표·성과 관리", "다면 평가", "연봉 계약", "결재선", "평가 이력"],
  },
];

// 🚨 이 리포에 실제 흔적이 있는 것만 적는다.
//    포트원 = @portone/browser-sdk + src/lib/portone-config.ts
//    토스페이 = portone-config 의 간편결제 채널키
//    토스 미니앱 = 깔끔집사(TOSS_MINIAPP_URL)
//    Supabase = supabase/migrations + 문의 첨부 스토리지 버킷
//    Cloudflare = wrangler.jsonc (ai-solution.co.kr 커스텀 도메인)
//    웹훅 = src/routes/api/public/webhooks/lemonsqueezy.ts + /admin/webhooks 로그
//    메일 = src/routes/lovable/email/* + 수신거부(suppressed_emails)
//    카카오 오픈채팅 = KAKAO_OPENCHAT_URL
const integrations = [
  "포트원(PortOne) 결제",
  "토스페이 간편결제",
  "토스 미니앱",
  "Supabase · DB/인증/파일 스토리지",
  "Cloudflare Workers 배포",
  "웹훅 수신 · 중복 처리 · 로그",
  "트랜잭션 메일 발송 · 수신거부 처리",
  "카카오 오픈채팅 상담 연결",
];

// D. 그 밖에 기획·개발하는 분야 (예전 "기획/개발" 카드 섹션을 칩으로 합쳤다)
// 🚨 금액을 다시 붙이지 마라(가격은 전면 비공개, 맞춤 견적).
const developFields = [
  "API 연동 · 업무 자동화",
  "유지보수 · 운영 지원",
  "부동산 매물 플랫폼",
  "부동산 경매 정보 플랫폼",
  "암호화폐 서비스 개발",
  "제휴 마케팅(어필리에이트) 플랫폼 개발",
  "위치 기반 매칭 앱",
  "지역 기반 중고거래 플랫폼",
  "AI 제품 광고 숏폼 생성기",
  "블로그 콘텐츠 자동화 도구",
  "SNS 멀티채널 자동 업로드 도구",
];

function CapabilityCard({ item, consult }: { item: Capability; consult?: boolean }) {
  const { openInquiry } = useInquiry();
  const cases = (item.cases ?? []).flatMap((name) => {
    const site = portfolioByName.get(name);
    return site ? [{ name, url: site.url }] : [];
  });
  // 걸 사례가 없으면 "사례" 라벨만 덩그러니 남는다. 그건 없는 걸 있는 척하는 자리다.
  const showCases = cases.length > 0 || item.tossMiniApp;

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-primary/50 hover:bg-white/[0.05]">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow">
          <item.icon className="h-4 w-4" />
        </span>
        <h4 className="mt-1 font-display text-base leading-snug font-semibold text-foreground">
          {item.title}
        </h4>
      </div>

      <div className="mt-4 flex flex-1 flex-wrap content-start gap-1.5">
        {item.features.map((f) => (
          <span
            key={f}
            className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] leading-none text-slate-300"
          >
            {f}
          </span>
        ))}
      </div>

      {consult || !showCases ? (
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
          <span className="text-[11px] text-slate-400">공개 사례 준비 중</span>
          <button
            type="button"
            onClick={() => openInquiry(item.title)}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-3.5 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition hover:scale-[1.02]"
          >
            <MessageCircle className="h-3.5 w-3.5" /> 상담 문의
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-3">
          <span className="text-[11px] text-slate-400">사례</span>
          {cases.map((c) => (
            <a
              key={c.url}
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-primary-glow/30 bg-primary/15 px-2.5 py-1 text-[11px] font-medium text-primary-glow transition hover:bg-primary/25"
            >
              {c.name} <ExternalLink className="h-3 w-3" />
            </a>
          ))}
          {item.tossMiniApp && <TossMiniAppCaseLink />}
          <button
            type="button"
            onClick={() => openInquiry(item.title)}
            className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:text-primary-glow"
          >
            <MessageCircle className="h-3 w-3" /> 문의
          </button>
        </div>
      )}
    </div>
  );
}

function GroupTitle({ title, badge }: { title: string; badge?: React.ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-3">
      <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
      {badge}
      <div className="hidden h-px flex-1 bg-white/10 sm:block" />
    </div>
  );
}

// ── 할 수 있는 일 ──────────────────────────────────────────────────
// 예전에는 이 섹션만 흰 배경(bg-slate-50)이라 다크 톤 사이에서 튀었다. 블랙 계열로 맞춘다.
// id 는 예전 "pricing" 에서 "capabilities" 로 바꿨다(가격 섹션이 아니다).
function Capabilities() {
  const { openInquiry } = useInquiry();

  return (
    <section
      id="capabilities"
      className="scroll-mt-24 border-y border-white/[0.06] bg-[oklch(0.1_0.015_280)] px-4 py-24 md:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-primary-glow">
            <Sparkles className="h-3.5 w-3.5" />
            What We Build
          </span>
          <h2 className="mt-5 font-display text-3xl font-bold tracking-tight md:text-5xl">
            이런 것을 <span className="text-gradient">만듭니다</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-slate-400">
            분야 이름 대신 해결하는 문제로 정리했습니다. 실제 납품 사이트가 있는 항목에는 사례를
            연결해 두었습니다.
          </p>
        </div>

        {/* A. 만들어 본 것 — 플랫폼·SaaS 가 앞, 전환 페이지가 뒤 */}
        <div className="mt-14">
          <GroupTitle
            title="웹·앱으로 만드는 것"
            badge={
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2.5 py-1 text-[11px] font-medium text-primary-glow">
                <ExternalLink className="h-3 w-3" /> 실제 사이트를 붙인 항목{" "}
                {countLinked(provenCapabilities)}개
              </span>
            }
          />
          <p className="mb-5 text-sm text-slate-400">
            사례가 있는 항목은 눌러서 바로 확인하실 수 있습니다. 아직 공개하지 못하는 항목은
            상담에서 범위부터 정리합니다.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {provenCapabilities.map((item) => (
              <CapabilityCard key={item.title} item={item} />
            ))}
          </div>
        </div>

        {/* B. 아직 공개할 사례가 없는 것 */}
        <div className="mt-14">
          <GroupTitle
            title="맞춤 설계로 진행하는 영역"
            badge={
              <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-slate-300">
                <MessageCircle className="h-3 w-3" /> 상담으로 시작합니다
              </span>
            }
          />
          <p className="mb-5 text-sm text-slate-400">
            공개할 수 있는 사례가 아직 없는 영역입니다. 요구사항을 들은 뒤 범위와 일정을
            제안드립니다.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {consultCapabilities.map((item) => (
              <CapabilityCard key={item.title} item={item} consult />
            ))}
          </div>
        </div>

        {/* C. 그 밖에 기획·개발하는 분야 */}
        <div className="mt-14 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <GroupTitle title="그 밖에 기획·개발하는 분야" />
          <p className="text-sm text-slate-400">
            분야를 누르면 해당 주제로 바로 상담을 신청하실 수 있습니다.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {developFields.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => openInquiry(name)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-primary-glow/50 hover:text-primary-glow"
              >
                <Wrench className="h-3 w-3 text-primary-glow" /> {name}
              </button>
            ))}
          </div>
        </div>

        {/* D. 연동해 본 것 */}
        <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <GroupTitle
            title="실제 연동 경험"
            badge={<Link2 className="h-4 w-4 text-primary-glow" />}
          />
          <p className="text-sm text-slate-400">
            이 사이트와 납품 프로젝트에서 실제로 붙여 본 것만 적었습니다.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {integrations.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-primary-glow" /> {name}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4 rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 to-transparent p-8 text-center md:flex-row md:justify-between md:text-left">
          <div>
            <div className="font-display text-lg font-semibold text-foreground">
              필요한 기능이 목록에 없나요?
            </div>
            <div className="mt-1 text-sm text-slate-400">
              지금 쓰는 방식과 불편한 지점을 말씀해 주시면, 어떻게 만들지 정리해서 제안드립니다.
            </div>
          </div>
          <a
            href="#contact"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:scale-[1.02]"
          >
            <MessageCircle className="h-4 w-4" /> 상담 신청
          </a>
        </div>
      </div>
    </section>
  );
}

function Nav() {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  useEffect(() => {
    if (!userOpen) return;
    const handle = (e: MouseEvent) => {
      const el = document.getElementById("user-menu");
      if (el && !el.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [userOpen]);

  // 🚨 블로그 링크는 숨겼다(글이 아직 없다). 라우트와 사이트맵은 그대로 둔다.
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

          {/* Desktop nav */}
          <div className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            {navItems.map((n) => (
              <a key={n.href} href={n.href} className="transition hover:text-foreground">
                {n.label}
              </a>
            ))}
            {isAdmin && (
              <Link to="/app-dev" className="transition hover:text-foreground">
                앱 개발
              </Link>
            )}
            {isAdmin && (
              <Link to="/sell" className="transition hover:text-foreground">
                판매하기
              </Link>
            )}
            <a
              href="#contact"
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-glow)] transition hover:scale-[1.02]"
            >
              상담 신청 <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* Desktop user actions */}
          <div className="hidden items-center gap-2 md:flex">
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/40 px-4 py-2 text-sm text-foreground transition hover:bg-surface"
                >
                  <UserIcon className="h-4 w-4" />
                  <span className="max-w-[120px] truncate">{user.email ?? "내 계정"}</span>
                </button>
                {userOpen && (
                  <div
                    id="user-menu"
                    className="absolute right-0 mt-2 w-52 overflow-hidden rounded-2xl border border-border bg-surface/95 p-2 shadow-card backdrop-blur"
                  >
                    <Link
                      to="/dashboard"
                      onClick={() => setUserOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground transition hover:bg-surface-elevated"
                    >
                      <LayoutDashboard className="h-4 w-4 text-primary-glow" /> 대시보드
                    </Link>
                    <Link
                      to="/me"
                      onClick={() => setUserOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground transition hover:bg-surface-elevated"
                    >
                      <Package className="h-4 w-4 text-primary-glow" /> 보관함
                    </Link>
                    {isAdmin && (
                      <>
                        <div className="my-1 h-px bg-border" />
                        <Link
                          to="/admin"
                          onClick={() => setUserOpen(false)}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground transition hover:bg-surface-elevated"
                        >
                          <ShieldCheck className="h-4 w-4 text-primary-glow" /> 관리자
                        </Link>
                        <Link
                          to="/admin/review"
                          onClick={() => setUserOpen(false)}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground transition hover:bg-surface-elevated"
                        >
                          <ShieldCheck className="h-4 w-4 text-amber-400" /> 검수 대기열
                        </Link>
                        <Link
                          to="/admin/webhooks"
                          onClick={() => setUserOpen(false)}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground transition hover:bg-surface-elevated"
                        >
                          <Webhook className="h-4 w-4 text-primary-glow" /> 웹훅 로그
                        </Link>
                      </>
                    )}
                    <div className="my-1 h-px bg-border" />
                    <button
                      onClick={() => {
                        setUserOpen(false);
                        supabase.auth.signOut();
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-foreground transition hover:bg-surface-elevated"
                    >
                      <LogOut className="h-4 w-4" /> 로그아웃
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex items-center justify-center rounded-full p-2 text-foreground md:hidden"
            aria-label="메뉴 열기"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="mt-2 rounded-3xl border border-border bg-surface/95 p-4 shadow-card backdrop-blur md:hidden">
            <div className="flex flex-col gap-1 text-sm">
              {navItems.map((n) => (
                <a
                  key={n.href}
                  href={n.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl px-3 py-2.5 text-muted-foreground transition hover:bg-surface-elevated hover:text-foreground"
                >
                  {n.label}
                </a>
              ))}
              {isAdmin && (
                <Link
                  to="/app-dev"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl px-3 py-2.5 text-muted-foreground transition hover:bg-surface-elevated hover:text-foreground"
                >
                  앱 개발
                </Link>
              )}
              {isAdmin && (
                <Link
                  to="/sell"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl px-3 py-2.5 text-muted-foreground transition hover:bg-surface-elevated hover:text-foreground"
                >
                  판매하기
                </Link>
              )}
              <a
                href="#contact"
                onClick={() => setMobileOpen(false)}
                className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-primary to-primary-glow px-3 py-2.5 text-sm font-medium text-primary-foreground"
              >
                상담 신청 <ArrowRight className="h-4 w-4" />
              </a>
              {user && (
                <>
                  <div className="my-1 h-px bg-border" />
                  <Link
                    to="/dashboard"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-foreground transition hover:bg-surface-elevated"
                  >
                    <LayoutDashboard className="h-4 w-4 text-primary-glow" /> 대시보드
                  </Link>
                  <Link
                    to="/me"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-foreground transition hover:bg-surface-elevated"
                  >
                    <Package className="h-4 w-4 text-primary-glow" /> 보관함
                  </Link>
                  {isAdmin && (
                    <>
                      <Link
                        to="/admin"
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-foreground transition hover:bg-surface-elevated"
                      >
                        <ShieldCheck className="h-4 w-4 text-primary-glow" /> 관리자
                      </Link>
                      <Link
                        to="/admin/review"
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-foreground transition hover:bg-surface-elevated"
                      >
                        <ShieldCheck className="h-4 w-4 text-amber-400" /> 검수 대기열
                      </Link>
                      <Link
                        to="/admin/webhooks"
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-foreground transition hover:bg-surface-elevated"
                      >
                        <Webhook className="h-4 w-4 text-primary-glow" /> 웹훅 로그
                      </Link>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setMobileOpen(false);
                      supabase.auth.signOut();
                    }}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-foreground transition hover:bg-surface-elevated"
                  >
                    <LogOut className="h-4 w-4" /> 로그아웃
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

// ── 회사 소개 ──────────────────────────────────────────────────────
// 관점은 "우리가 무엇을 만드는가"가 아니라 "고객 사업이 어떻게 커지는가"다.
const workSteps = [
  {
    no: "01",
    icon: Compass,
    title: "상담·진단",
    desc: "사업 목표와 지금의 고객 접점, 막힌 지점을 함께 정리합니다.",
  },
  {
    no: "02",
    icon: Layers,
    title: "범위·제안",
    desc: "필요한 범위만 골라 구조와 일정, 맞춤 견적을 제안드립니다.",
  },
  {
    no: "03",
    icon: Workflow,
    title: "구축·연동",
    desc: "플랫폼·광고·송출 시스템을 하나의 데이터 흐름으로 연결합니다.",
  },
  {
    no: "04",
    icon: TrendingUp,
    title: "운영·개선",
    desc: "출시 뒤에도 데이터를 보며 전환과 운영 효율을 계속 끌어올립니다.",
  },
];

function About() {
  return (
    <section id="about" className="scroll-mt-24 px-4 py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <div>
          <SectionHeading
            eyebrow="About"
            title={
              <>
                사업의 목표가
                <br />
                성과가 되는 곳
              </>
            }
          />
          <div className="mt-6 space-y-4 text-base leading-relaxed text-muted-foreground md:text-lg">
            <p>
              에이아이솔루션은 웹·앱 개발사이면서, 마케팅과 오프라인 미디어까지 운영하는 성장
              파트너입니다.
            </p>
            <p>
              “무엇을 만들까”보다 “어떻게 매출로 이어질까”를 먼저 묻고, 기획·개발·광고·송출을 한
              팀이 책임지고 운영합니다. 담당자가 바뀌어도 데이터와 맥락이 끊기지 않습니다.
            </p>
          </div>
        </div>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {workSteps.map((s) => (
            <li key={s.no} className="rounded-2xl border border-border bg-surface/40 p-5">
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-background/60 text-primary-glow ring-1 ring-border">
                  <s.icon className="h-4 w-4" />
                </span>
                <span className="font-display text-sm font-semibold text-muted-foreground">
                  {s.no}
                </span>
              </div>
              <div className="mt-4 font-display text-lg font-semibold">{s.title}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ── 상담 신청 ──────────────────────────────────────────────────────
// 폼 본체는 InquiryForm 하나다. 다른 페이지의 "문의하기" 버튼이 여는 모달도 같은 폼을 쓴다.
function Contact() {
  return (
    <section id="contact" className="scroll-mt-24 px-4 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-[2rem] border border-border bg-surface/40 p-6 md:p-12">
          <div className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-primary/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-primary-glow/15 blur-3xl" />
          <div className="relative grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
            <div>
              <SectionHeading
                eyebrow="Contact"
                title="프로젝트 상담 신청"
                desc="예산이나 일정이 아직 정해지지 않아도 괜찮습니다. 현재 상황을 남겨 주시면 담당자가 검토한 뒤 연락드립니다. 견적은 범위를 확인한 뒤 맞춤으로 안내드립니다."
              />
              <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
                {[
                  "담당자가 직접 검토 후 회신",
                  "필요한 범위만 골라 맞춤 견적",
                  "예산·일정이 미정이어도 상담 가능",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2.5">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/20 text-primary-glow">
                      <Sparkles className="h-3 w-3" />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col gap-2.5 sm:flex-row lg:flex-col">
                <a
                  href="mailto:contact@ai-solution.co.kr"
                  className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background/50 px-4 py-3 text-sm font-medium text-foreground transition hover:bg-surface"
                >
                  <Mail className="h-4 w-4 text-primary-glow" />
                  contact@ai-solution.co.kr
                </a>
                <a
                  href={KAKAO_OPENCHAT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background/50 px-4 py-3 text-sm font-medium text-foreground transition hover:bg-surface"
                >
                  <MessageCircle className="h-4 w-4 text-primary-glow" />
                  카카오톡 상담
                </a>
              </div>
            </div>
            <div className="rounded-3xl border border-border bg-background/70 p-5 backdrop-blur md:p-8">
              <InquiryForm variant="section" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
