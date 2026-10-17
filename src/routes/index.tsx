import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AppWindow,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarCheck,
  Clapperboard,
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
  Megaphone,
  Menu,
  MessageCircle,
  MonitorPlay,
  Newspaper,
  Package,
  Plus,
  QrCode,
  Radar,
  Repeat2,
  Send,
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
      "숏폼·SNS 콘텐츠 자동 제작·발행",
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

// DOOH 카드의 도식. 실제 운영 화면이 아니라 "여러 스크린을 한 곳에서 편성한다"는 구조를 그린 예시다.
// 🚨 실제 브랜드·고객사 이름, 가격, 실적 숫자를 넣지 마라. 칩의 숫자는 이 그림 안의 개수(스크린 6면,
//    송출 중 4면, 편성 3개)와 맞춘다. 문구는 "NEW SEASON" 같은 일반 카피만 쓴다.
type ScreenTile = {
  loc: string;
  status: "live" | "idle" | "check";
  /** live 일 때 현재 소재 진행률(%) */
  progress?: number;
  meta?: string;
};

const signageScreens: ScreenTile[] = [
  { loc: "외벽 미디어파사드", status: "live", progress: 62 },
  { loc: "로비 사이니지", status: "live", progress: 28 },
  { loc: "엘리베이터", status: "live", progress: 85 },
  { loc: "주차장 입구", status: "idle", meta: "15:00 시작" },
  { loc: "1F 리테일", status: "live", progress: 44 },
  { loc: "옥상 LED", status: "check", meta: "원격 점검" },
];

// 타일 안 "광고 소재 미리보기". 그라데이션 위 도형 + 짧은 일반 카피.
function ScreenCreative({ i }: { i: number }) {
  switch (i) {
    case 0:
      return (
        <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary-glow">
          <span className="absolute -top-5 -right-4 h-16 w-16 rounded-full bg-white/25" />
          <span className="absolute top-2 right-2.5 h-5 w-5 rounded-full border-2 border-white/50" />
          <div className="absolute bottom-1.5 left-2 leading-none text-white">
            <div className="text-[8px] tracking-[0.18em] opacity-80">FW COLLECTION</div>
            <div className="mt-0.5 font-display text-[12px] font-extrabold tracking-tight">
              NEW SEASON
            </div>
          </div>
        </div>
      );
    case 1:
      return (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-primary/70">
          <span className="absolute top-0 right-0 h-full w-1/3 bg-gradient-to-b from-primary-glow/60 to-transparent" />
          <div className="absolute bottom-1.5 left-2 leading-none text-white">
            <div className="text-[8px] tracking-[0.18em] opacity-70">WELCOME</div>
            <div className="mt-0.5 font-display text-[12px] font-extrabold">OPEN 10:00</div>
          </div>
        </div>
      );
    case 2:
      return (
        <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/80 to-primary/80">
          <span className="absolute -bottom-6 -left-3 h-14 w-24 rotate-[-18deg] bg-white/15" />
          <span className="absolute top-1 right-1 grid h-5 w-5 place-items-center rounded-md bg-white/90 text-[9px] font-bold text-primary">
            2F
          </span>
          <div className="absolute bottom-1.5 left-2 leading-none text-white">
            <div className="text-[8px] tracking-[0.14em] opacity-80">THIS WEEKEND</div>
            <div className="mt-0.5 font-display text-[12px] font-extrabold tracking-tight">
              EVENT
            </div>
          </div>
        </div>
      );
    case 3:
      return (
        <div className="absolute inset-0 bg-surface">
          <div className="absolute inset-0 grid place-items-center pt-2">
            <div className="text-center leading-none">
              <div className="font-display text-[11px] font-bold text-foreground/50">PARKING</div>
              <div className="mt-1 text-[8px] text-muted-foreground">다음 편성 대기</div>
            </div>
          </div>
        </div>
      );
    case 4:
      return (
        <div className="absolute inset-0 bg-gradient-to-br from-teal-400/70 to-primary/70">
          <div className="absolute top-1.5 right-1.5 grid grid-cols-2 gap-0.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-white/70" />
            <span className="h-2.5 w-2.5 rounded-sm bg-white/30" />
            <span className="h-2.5 w-2.5 rounded-sm bg-white/30" />
            <span className="h-2.5 w-2.5 rounded-sm bg-white/70" />
          </div>
          <div className="absolute bottom-1.5 left-2 leading-none text-white">
            <div className="text-[8px] tracking-[0.18em] opacity-80">1F STORE</div>
            <div className="mt-0.5 font-display text-[12px] font-extrabold tracking-tight">
              NEW ARRIVAL
            </div>
          </div>
        </div>
      );
    default:
      return (
        <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,oklch(0.3_0.06_70/0.5)_0_6px,oklch(0.18_0.03_280)_6px_12px)]">
          <div className="absolute inset-0 grid place-items-center pt-2">
            <span className="inline-flex items-center gap-1 rounded bg-background/85 px-1.5 py-0.5 text-[9px] font-medium text-amber-200">
              <Wrench className="h-2.5 w-2.5" /> 점검 중
            </span>
          </div>
        </div>
      );
  }
}

const statusChip = {
  live: {
    label: "송출 중",
    cls: "text-emerald-300",
    dot: "bg-emerald-400 motion-safe:animate-pulse",
  },
  idle: { label: "대기", cls: "text-slate-300", dot: "bg-slate-400" },
  check: { label: "점검", cls: "text-amber-200", dot: "bg-amber-400" },
} as const;

// 편성 타임라인. 범위 05~23시(18시간), 그림 속 현재 시각은 13:20 으로 고정한다.
const TL_START = 5;
const TL_SPAN = 18;
const TL_TICKS = [6, 9, 12, 15, 18, 21];
const tlPos = (h: number) => `${((h - TL_START) / TL_SPAN) * 100}%`;
const TL_NOW = 13 + 20 / 60;
const timeline = [
  { name: "캠페인 A · 아침 편성", from: 7, to: 11, state: "done" },
  { name: "캠페인 B · 낮 편성", from: 11, to: 15, state: "live" },
  { name: "캠페인 C · 저녁 편성", from: 17, to: 22, state: "next" },
] as const;
const timelineState = {
  done: { label: "완료", text: "text-muted-foreground", bar: "bg-primary/40" },
  live: {
    label: "송출 중",
    text: "text-emerald-300",
    bar: "bg-gradient-to-r from-primary to-primary-glow shadow-[0_0_12px_-2px_var(--primary-glow)]",
  },
  next: {
    label: "예약",
    text: "text-primary-glow",
    bar: "border border-dashed border-primary-glow/70 bg-primary/15",
  },
};

function SignageIllustration() {
  const liveCount = signageScreens.filter((s) => s.status === "live").length;
  return (
    <div aria-hidden className="relative mt-10 lg:mt-0">
      <div className="rounded-2xl border border-border bg-background/80 p-3 shadow-xl sm:p-4 md:p-5">
        {/* 상단 바 */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
            통합 송출 콘솔
          </span>
          <div className="flex flex-wrap gap-1 text-[10px] leading-none">
            <span className="rounded-full border border-border bg-surface/80 px-2 py-1 text-foreground/80">
              스크린 {signageScreens.length}
            </span>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-emerald-300">
              송출 중 {liveCount}
            </span>
            <span className="rounded-full border border-border bg-surface/80 px-2 py-1 text-foreground/80">
              오늘 편성 {timeline.length}
            </span>
          </div>
        </div>

        {/* 스크린 타일: 좁은 화면 2열, 넓은 화면 3열 */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-2.5">
          {signageScreens.map((s, i) => {
            const chip = statusChip[s.status];
            return (
              <div key={s.loc} className="rounded-lg border border-border/80 bg-surface/50 p-1.5">
                <div className="relative aspect-[16/9] overflow-hidden rounded-md">
                  <ScreenCreative i={i} />
                  <span
                    className={`absolute top-1 left-1 inline-flex items-center gap-1 rounded bg-background/75 px-1 py-0.5 text-[9px] leading-none font-medium backdrop-blur ${chip.cls}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${chip.dot}`} />
                    {chip.label}
                  </span>
                </div>
                <div className="mt-1.5 truncate px-0.5 text-[10.5px] leading-tight font-medium text-foreground/90">
                  {s.loc}
                </div>
                <div className="mt-1 flex h-2.5 items-center px-0.5">
                  {s.status === "live" ? (
                    <div className="h-1 w-full overflow-hidden rounded-full bg-border">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-primary-glow"
                        style={{ width: `${s.progress}%` }}
                      />
                    </div>
                  ) : (
                    <span className="text-[9.5px] leading-none text-muted-foreground">
                      {s.meta}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 편성 타임라인 */}
        <div className="mt-3 rounded-xl border border-border/70 bg-surface/40 px-3 pt-2.5 pb-3">
          <div className="flex items-center justify-between text-[10.5px] leading-none">
            <span className="font-semibold text-foreground/90">오늘 편성</span>
            <span className="inline-flex items-center gap-1 text-rose-300">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
              현재 13:20
            </span>
          </div>
          <div className="relative mt-2.5">
            {/* 시간 눈금 */}
            <div className="relative h-3 text-[9.5px] leading-none text-muted-foreground tabular-nums">
              {TL_TICKS.map((h) => (
                <span
                  key={h}
                  className="absolute top-0 -translate-x-1/2"
                  style={{ left: tlPos(h) }}
                >
                  {String(h).padStart(2, "0")}
                </span>
              ))}
            </div>
            <div className="relative space-y-2 pt-1.5">
              {TL_TICKS.map((h) => (
                <span
                  key={h}
                  className="absolute top-0 bottom-0 w-px bg-border/60"
                  style={{ left: tlPos(h) }}
                />
              ))}
              {timeline.map((t) => {
                const st = timelineState[t.state];
                return (
                  <div key={t.name} className="relative">
                    <div className="flex items-center justify-between gap-2 text-[10.5px] leading-none">
                      <span className="truncate rounded bg-background/70 pr-1 text-foreground/85">
                        {t.name}
                      </span>
                      <span className={`shrink-0 rounded bg-background/70 pl-1 ${st.text}`}>
                        {st.label}
                      </span>
                    </div>
                    <div className="relative mt-1 h-2 rounded-full bg-background/60">
                      <span
                        className={`absolute top-0 h-2 rounded-full ${st.bar}`}
                        style={{
                          left: tlPos(t.from),
                          width: `${((t.to - t.from) / TL_SPAN) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              {/* 현재 시각 표시선 */}
              <span
                className="absolute top-0 -bottom-1 w-px bg-rose-400"
                style={{ left: tlPos(TL_NOW) }}
              >
                <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-rose-400 motion-safe:animate-pulse" />
              </span>
            </div>
          </div>
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
          {portfolioSites.map((s) => {
            // 주소가 없는 사이트(개인 도구)는 링크 없이 캡처만 보여준다.
            const Card = s.url ? "a" : "div";
            const linkProps = s.url ? { href: s.url, target: "_blank", rel: "noreferrer" } : {};
            return (
            <Card
              key={s.title}
              {...linkProps}
              className="glow-hover group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface/60"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-background/40">
                <img
                  src={s.url ? shot(s.url) : s.thumb}
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
                {s.url && (
                  <span className="absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-background/70 text-foreground/80 backdrop-blur transition group-hover:bg-gradient-to-br group-hover:from-primary group-hover:to-primary-glow group-hover:text-primary-foreground">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <h3
                  title={displayTitle(s.title)}
                  className="min-w-0 truncate font-display text-base font-semibold"
                >
                  {displayTitle(s.title)}
                </h3>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {s.url ? "라이브 보기" : "화면 캡처"}
                </span>
              </div>
            </Card>
            );
          })}

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

// ── "제공 서비스" 섹션 ───────────────────────────────────────────────────────
// 예전 제목은 "예약을 받고 싶다" 같은 고객 증상이었는데 주먹구구로 보인다는 지적을 받았다.
// 그래서 제목은 업계 서비스명(ERP 구축·CRM 구축처럼), 그 아래 한 줄 부제로 고객 관점 설명을 둔다.
// 내용은 기능 단위 칩으로 쪼개고, 사례가 있는 것에는 실제 포트폴리오를 붙인다.

// 🚨 사례 개수·유무를 강조하는 배지나 문구는 달지 않는다(사장님 결정).
//    사이트가 안 붙은 항목이 오히려 이력 없어 보인다. 카드 안의 개별 사례 칩만 둔다.

type Capability = {
  icon: LucideIcon;
  /** 업계 서비스명. 상담 문의 주제로도 그대로 넘어간다 */
  title: string;
  /** 제목 아래 한 줄 부제. "~합니다" 톤 */
  summary: string;
  /** 스캔되게 칩으로 뿌린다 */
  features: string[];
  /** portfolioSites 의 이름 (예: "기사 일정 관리 SaaS"). 없으면 사례 줄 없이 상담 문의 버튼만 둔다 */
  cases?: string[];
  /** 토스 미니앱 사례. PC 에서는 링크가 막다른 길이라 QR 다이얼로그를 연다 */
  tossMiniApp?: boolean;
};

// A. 만들어 본 것
// 순서는 사장님 방향(랜딩은 충분히 했다, 이제 플랫폼으로 확장한다)을 그대로 따른다.
// 1) 플랫폼·SaaS → 2) 업무 시스템 → 3) 전환 페이지.
// cases 는 "정말 그 기능을 만든 사이트"만 적는다. 없으면 비워 둔다(사례 줄만 빠지고 상담 문의 버튼은 모든 카드에 같다).
const provenCapabilities: Capability[] = [
  // ── 1. 플랫폼·SaaS ────────────────────────────────────────────────
  {
    icon: CalendarCheck,
    title: "예약·스케줄링 시스템 구축",
    summary: "시간대별 정원·선결제·알림을 갖춘 온라인 예약 시스템을 구축합니다.",
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
    title: "POS·현장 업무 시스템 구축",
    summary: "주문·정산·재고·인력 배정을 하나의 현장 업무 시스템으로 묶습니다.",
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
    title: "모바일 웹앱(PWA)·토스 미니앱 개발",
    summary: "설치 없이 앱처럼 쓰이는 웹앱과 토스 미니앱을 개발합니다.",
    features: ["토스 미니앱", "모바일 웹앱(PWA)", "홈 화면 추가", "푸시 알림", "오프라인 대응"],
    tossMiniApp: true,
  },
  {
    icon: CreditCard,
    title: "PG 결제·정산 시스템 연동",
    summary: "PG 심사부터 결제·환불·정산까지 결제 흐름 전체를 연동합니다.",
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
    title: "리드·문의 통합 관리(CRM) 구축",
    summary: "채널별로 흩어진 문의를 한 곳에 모아 배정·이력·통계로 관리합니다.",
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
    title: "API 연동·업무 자동화",
    summary: "사내 시스템과 외부 서비스를 API로 연결하고 반복 업무를 자동화합니다.",
    features: [
      "리드 수신 API",
      "시트·CRM 연동",
      "카카오 알림톡",
      "웹훅 발신과 재시도",
      "API 키 발급·회수",
      "연동 장애 알림",
      "매일 운영 리포트",
      "인증 토큰 자동 갱신",
      "멈춘 자동화 감지 알림",
      "영업 리드 정리·제안 메일 자동화(사람 승인 후 발송·수신거부 준수)",
    ],
    // "VIP 마케팅"·"서비스 소개" 는 연동 사례가 아니라 서비스 소개 랜딩이었다.
  },
  {
    icon: Newspaper,
    title: "CMS(콘텐츠 관리 시스템) 구축",
    summary: "글·공지를 직접 작성하고 예약 발행하는 관리 시스템을 구축합니다.",
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
    title: "커뮤니티 플랫폼 개발",
    summary: "게시판·회원 등급·신고 관리를 갖춘 커뮤니티를 개발합니다.",
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
    title: "쇼핑몰·커머스 플랫폼 구축",
    summary: "상품·주문·배송·정산을 관리하는 자사 쇼핑몰을 구축합니다.",
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
    title: "홈페이지·랜딩페이지 제작",
    summary: "문의 전환과 검색 노출을 고려한 반응형 페이지를 제작합니다.",
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
    title: "신청·설문 폼 시스템 구축",
    summary: "조건부 문항과 자동 집계를 갖춘 신청·설문 시스템을 구축합니다.",
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

// A-2. 콘텐츠·마케팅 자동화
// 근거는 회사가 직접 만들어 운영 중인 콘텐츠 자동화 시스템이다(납품 사례가 아니라 cases 는 비운다).
// 수요 키워드(숏폼 대량 제작·유튜브 쇼츠 자동 업로드·크롤링)는 드러내되, 위험한 "방식" 표현만 피한다.
// 🚨 남의 채널·플랫폼 영상을 내려받아 재업로드·재사용, 봇 차단 우회, 로그인 재사용, 이미지 스크래핑처럼
//    읽힐 말을 쓰지 않는다. 소재는 "라이선스 스톡·고객 촬영본·AI 생성 소재", 수집은 "공개 데이터·공식 API·
//    허가된 범위에서" 로만 말한다. 대량 제작에는 "검수" 를 꼭 붙인다.
// 🚨 채널명·계정·성과 수치·제휴 수익 활동·"알림톡"·금액·기간은 적지 않는다.
const contentCapabilities: Capability[] = [
  {
    icon: Clapperboard,
    title: "숏폼 제작·멀티채널 자동 발행",
    summary: "템플릿으로 숏폼을 대량 제작하고 검수 후 채널별로 자동 발행합니다.",
    features: [
      "숏폼 대량 제작 파이프라인(템플릿 기반 하루 수십 편, 검수 후 자동 발행)",
      "템플릿 렌더(자막·BGM·음성)",
      "소재 자동 수집·편집(라이선스 스톡·고객 촬영본·AI 생성 소재)",
      "유튜브 쇼츠·릴스·틱톡 자동 업로드(공식 API)",
      "예약 시간 발행·제목·해시태그 자동 생성",
      "업로드 실패 재시도",
      "프로필 링크 페이지 자동 갱신",
      "광고·AI 사용 고지 자동 삽입",
    ],
  },
  {
    icon: Megaphone,
    title: "AI 광고 영상 제작",
    summary: "상품 정보를 바탕으로 15~30초 세로 광고 영상을 제작합니다.",
    features: [
      "홈페이지 주소로 문구·컬러·이미지 수집",
      "과장·근거 없는 문구 자동 경고",
      "AI 기획안·샷리스트",
      "AI 영상과 실사 스틸 혼합",
      "나레이션·자막 동기화",
      "15~30초 세로 광고",
    ],
  },
  {
    icon: Send,
    title: "SNS 콘텐츠 자동 운영",
    summary: "상품 소개 콘텐츠를 정기 게시하고 성과를 보며 카피를 개선합니다.",
    features: [
      "상품 정보·후기 기반 카피",
      "스레드 글·인스타 카드뉴스 예약 게시",
      "발행 다음 날 성과를 재서 카피 개선",
      "제휴·광고 고지 자동 삽입",
    ],
  },
  {
    icon: Repeat2,
    title: "영상 재편집·다국어 현지화",
    summary: "보유 롱폼을 숏폼으로 재구성하고 다국어 버전으로 현지화합니다.",
    features: [
      "보유 롱폼 전사 후 강한 구간 선정",
      "세로 재구성·자막",
      "다국어 대본·음성",
      "예약 공개와 사람 검수",
    ],
  },
  {
    icon: Radar,
    title: "웹 데이터 수집·크롤링 자동화",
    summary: "공개 데이터를 정해진 주기로 수집해 시트·대시보드로 정리합니다.",
    features: [
      "경쟁사 가격·상품 정보 수집",
      "리뷰·키워드 모니터링",
      "정해진 주기로 자동 수집",
      "시트·대시보드로 정리",
      "바뀌면 바로 알림",
      "공개 데이터·공식 API·허가된 범위에서",
    ],
  },
];

// B. 아직 공개할 사례가 없는 것 — 링크 대신 상담으로 연결한다
const consultCapabilities: Capability[] = [
  {
    icon: Building2,
    title: "ERP 시스템 구축",
    summary: "회계·재고·인사를 하나의 시스템으로 통합합니다.",
    features: [
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
    title: "WMS(창고 관리 시스템) 구축",
    summary: "입출고·로케이션·실사 재고를 정확하게 관리합니다.",
    features: [
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
    title: "LMS(학습 관리 시스템) 구축",
    summary: "강의·진도·평가·수료를 관리하는 온라인 교육 시스템을 구축합니다.",
    features: ["강의 업로드", "수강 진도", "퀴즈·평가", "수료증 발급", "기수 관리", "진도 통계"],
  },
  {
    icon: UserCheck,
    title: "HR 성과관리 시스템 구축",
    summary: "목표 설정부터 다면 평가·연봉 계약까지 인사평가를 체계화합니다.",
    features: ["목표·성과 관리", "다면 평가", "연봉 계약", "결재선", "평가 이력"],
  },
];

// 🚨 실제로 붙여 본 흔적이 있는 것만 적는다. 근거는 (1) 이 리포, (2) 회사가 직접 운영 중인
//    자체 콘텐츠 자동화 시스템(숏폼 렌더·SNS 발행·운영 알림) 두 가지뿐이다.
//    (1) 이 리포
//    포트원 = @portone/browser-sdk + src/lib/portone-config.ts
//    토스페이 = portone-config 의 간편결제 채널키
//    토스 미니앱 = 깔끔집사(TOSS_MINIAPP_URL)
//    Supabase = supabase/migrations + 문의 첨부 스토리지 버킷
//    Cloudflare = wrangler.jsonc (ai-solution.co.kr 커스텀 도메인)
//    웹훅 = src/routes/api/public/webhooks/lemonsqueezy.ts + /admin/webhooks 로그
//    메일 = src/routes/lovable/email/* + 수신거부(suppressed_emails)
//    카카오 오픈채팅 = KAKAO_OPENCHAT_URL
//    (2) 자체 콘텐츠 자동화 시스템
//    YouTube Data API(업로드·댓글), Instagram Graph API(릴스·캐러셀), Threads API, TikTok 업로드,
//    Gmail API, Google Sheets·Drive, 카카오톡 메시지(나에게 보내기 — 알림톡이 아니다),
//    Remotion·FFmpeg 렌더, 음성합성(TTS), Claude·Gemini, Supabase, Cloudflare Pages
const integrations = [
  "포트원(PortOne) 결제",
  "토스페이 간편결제",
  "토스 미니앱",
  "Supabase · DB/인증/파일 스토리지",
  "Cloudflare Workers · Pages 배포",
  "웹훅 수신 · 중복 처리 · 로그",
  "트랜잭션 메일 발송 · 수신거부 처리",
  "카카오 오픈채팅 상담 연결",
  "YouTube Data API · 업로드/댓글",
  "Instagram Graph API · 릴스/캐러셀",
  "Threads API 게시",
  "TikTok 업로드",
  "Gmail API 발송",
  "Google Sheets · Drive",
  "카카오톡 메시지 API · 운영 알림",
  "Remotion · FFmpeg 영상 렌더",
  "음성합성(TTS)",
  "Claude · Gemini API",
];

// D. 그 밖에 기획·개발하는 분야 (예전 "기획/개발" 카드 섹션을 칩으로 합쳤다)
// 🚨 금액을 다시 붙이지 마라(가격은 전면 비공개, 맞춤 견적).
const developFields = [
  // "API 연동 · 업무 자동화" 는 같은 이름의 카드가 생겨 칩에서 뺐다.
  "유지보수 · 운영 지원",
  "부동산 매물 플랫폼",
  "부동산 경매 정보 플랫폼",
  "암호화폐 서비스 개발",
  "제휴 마케팅(어필리에이트) 플랫폼 개발",
  "위치 기반 매칭 앱",
  "지역 기반 중고거래 플랫폼",
  // "AI 제품 광고 숏폼 생성기"·"SNS 멀티채널 자동 업로드 도구" 는 콘텐츠·마케팅 자동화 카드로 올라갔다.
  // 블로그 자동화는 이 사이트의 블로그 자동화(유튜브 재생목록·Gemini 초안·예약 발행)가 근거라 남긴다.
  "블로그 콘텐츠 자동화 도구",
];

function CapabilityCard({ item, consult }: { item: Capability; consult?: boolean }) {
  const { openInquiry } = useInquiry();
  const cases = (item.cases ?? []).flatMap((name) => {
    const site = portfolioByName.get(name);
    return site ? [{ name, url: site.url }] : [];
  });
  // 걸 사례가 없으면 "사례" 라벨만 덩그러니 남는다. 그건 없는 걸 있는 척하는 자리다.
  const hasCases = !consult && (cases.length > 0 || !!item.tossMiniApp);

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-primary/50 hover:bg-white/[0.05]">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow">
          <item.icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h4 className="mt-1 font-display text-base leading-snug font-semibold break-keep text-foreground">
            {item.title}
          </h4>
          <p className="mt-1 text-xs leading-relaxed break-keep text-slate-400">{item.summary}</p>
        </div>
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

      {/* 버튼은 모든 카드에서 같은 모양이다. 사례 칩은 위 줄, 버튼은 아래 줄 오른쪽에 둬서
          좁은 폭(300px 안팎)에서도 겹치지 않는다. */}
      <div className="mt-4 border-t border-white/10 pt-3">
        {hasCases && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
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
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          {!hasCases && <span className="text-[11px] text-slate-400">요구사항에 맞춰 설계</span>}
          <button
            type="button"
            onClick={() => openInquiry(item.title)}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-3.5 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition hover:scale-[1.02]"
          >
            <MessageCircle className="h-3.5 w-3.5" /> 상담 문의
          </button>
        </div>
      </div>
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
            제공 <span className="text-gradient">서비스</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl break-keep text-slate-400">
            구축부터 운영까지, 비즈니스에 필요한 시스템을 만듭니다.
          </p>
        </div>

        {/* A. 만들어 본 것 — 플랫폼·SaaS 가 앞, 전환 페이지가 뒤 */}
        <div className="mt-14">
          <GroupTitle title="웹·앱으로 만드는 것" />
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {provenCapabilities.map((item) => (
              <CapabilityCard key={item.title} item={item} />
            ))}
          </div>
        </div>

        {/* A-2. 콘텐츠·마케팅 자동화 — 직접 운영 중인 시스템이 근거, 사례 링크는 없다 */}
        <div className="mt-14">
          <GroupTitle title="콘텐츠·마케팅 자동화" />
          <p className="mb-5 text-sm text-slate-400">
            직접 만들어 운영 중인 콘텐츠 자동화를 바탕으로 만듭니다. 공식 API와 고객 제공 정보,
            라이선스 스톡·고객 촬영본·AI 생성 소재만 씁니다.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {contentCapabilities.map((item) => (
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
            요구사항을 들은 뒤 범위와 일정을 맞춰 제안드립니다.
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
            이 사이트와 납품 프로젝트, 직접 운영 중인 콘텐츠 자동화 시스템에서 실제로 붙여 본 것만
            적었습니다.
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
