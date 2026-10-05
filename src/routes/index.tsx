import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
  FileText,
  Share2,
  Menu,
  X,
  LayoutDashboard,
  Package,
  Webhook,
  Workflow,
  Activity,
  QrCode,
  CalendarCheck,
  Inbox,
  Store,
  Users,
  ClipboardList,
  Globe,
  Newspaper,
  Warehouse,
  GraduationCap,
  UserCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { searchProducts, listCategories } from "@/lib/discover.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useInquiry } from "@/components/InquiryModal";
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
import { solutions, solutionNavLabels } from "@/lib/solutions";
import realEstateBg from "@/assets/card-bg/real-estate-bg.jpg";
import auctionBg from "@/assets/card-bg/auction-bg.jpg";
import cryptoBg from "@/assets/card-bg/crypto-bg.jpg";
import affiliateBg from "@/assets/card-bg/affiliate-bg.jpg";
import datingBg from "@/assets/card-bg/dating-bg.jpg";
import marketplaceBg from "@/assets/card-bg/marketplace-bg.jpg";
import shortsBg from "@/assets/card-bg/shorts-bg.jpg";
import blogAutomationBg from "@/assets/card-bg/blog-automation-bg.jpg";
import snsAutoBg from "@/assets/card-bg/sns-auto-bg.jpg";


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

type Product = {
  id: string;
  title: string;
  tag: string;
  description: string;
  amount: number;
  category?: string | null;
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
      <SolutionLinks />
      <Develop />
      <Projects />
      <Capabilities />
      <About />
      <Contact />
      <SiteFooter />
    </div>
  );
}

// 업종별 솔루션 페이지로 보내는 링크.
// 🚨 홈에 링크가 없으면 크롤러도 사람도 이 페이지들을 못 찾는다. 사이트맵만으로는 부족하다.
function SolutionLinks() {
  return (
    <section id="solutions" className="px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-3 text-sm font-medium text-primary-glow">— Solutions</div>
        <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">업종별 솔루션</h2>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          업종마다 문의가 새는 지점이 다릅니다. 어떤 기능을 달 수 있고 어디까지 확장할 수 있는지
          업종별로 정리해 뒀습니다.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {solutions.map((s) => (
            <Link
              key={s.slug}
              to={s.path}
              className="glow-hover group flex flex-col rounded-2xl border border-border bg-surface/60 p-6 transition hover:border-primary/40"
            >
              <span className="text-xs font-medium text-primary-glow">
                {solutionNavLabels[s.slug] ?? s.slug}
              </span>
              <h3 className="mt-2 font-display text-lg leading-snug font-semibold text-foreground">
                {s.h1}
              </h3>
              <p className="mt-3 line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {s.intro}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-glow">
                기능 보기 <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
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
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 rounded-3xl border border-border bg-surface/40 p-8 text-center md:flex-row md:justify-between md:text-left">
          <div>
            <div className="font-display text-lg font-semibold">이런 스타일로 내 사이트가 필요하신가요?</div>
            <div className="text-sm text-muted-foreground">아래 컬렉션에서 마음에 드는 스타일을 고르고, 맞춤 제작을 문의하세요.</div>
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
    icon: Workflow,
    title: "API 연동 / 자동화",
    tag: "API Integration",
    desc: "외부 플랫폼 API, 결제·배송·CRM 연동과 데이터 자동화 파이프라인을 구축합니다. 반복 업무를 줄이고 운영 효율을 높이는 구조로 설계합니다.",
    slug: "api-integration",
    price: 500000,
    image: affiliateBg,
  },
  {
    icon: Activity,
    title: "유지보수 / 운영 지원",
    tag: "Maintenance",
    desc: "배포 후에도 안정적으로 운영될 수 있도록 모니터링, 보안 패치, 기능 개선, 기술 지원을 제공합니다. 정기 점검과 긴급 대응을 함께합니다.",
    slug: "maintenance",
    price: 300000,
    recurring: true,
    image: marketplaceBg,
  },
  {
    icon: Building2,
    title: "부동산 홈페이지",
    tag: "Real Estate",
    desc: "매물 등록·검색, 지도 연동, 중개사 문의까지 갖춘 부동산 전용 홈페이지를 제작합니다. 반응형 디자인과 빠른 로딩 속도로 방문자 이탈을 줄입니다.",
    slug: "real-estate-site",
    price: 100000,
    image: realEstateBg,
  },
  {
    icon: Gavel,
    title: "부동산 경매 홈페이지",
    tag: "Auction",
    desc: "경매 물건 정보, 입찰 일정, 결과 조회 기능을 제공하는 경매 특화 플랫폼입니다. 실시간 데이터 갱신과 사용자 알림을 지원합니다.",
    slug: "real-estate-auction",
    price: 120000,
    image: auctionBg,
  },
  {
    icon: Bitcoin,
    title: "암호화폐 개발건",
    tag: "Crypto",
    desc: "코인 정보 대시보드, 지갑 연동, 차트 시각화 등 암호화폐 서비스를 구축합니다. 보안과 실시간성을 중시하는 구조로 설계합니다.",
    slug: "crypto-dev",
    price: 150000,
    image: cryptoBg,
  },
  {
    icon: Link2,
    title: "어필리에이트 개발건",
    tag: "Affiliate",
    desc: "수익형 제휴 마케팅 사이트, 추천 링크 추적, 실적 집계 기능을 구현합니다. 광고주와 프로모터 모두가 쓰기 편한 관리자 페이지를 함께 만듭니다.",
    slug: "affiliate-dev",
    price: 100000,
    image: affiliateBg,
  },
  {
    icon: MapPinned,
    title: "지도연동 소개팅앱",
    tag: "Social / Dating",
    desc: "위치 기반 매칭, 지도 위 핀 표시, 채팅 기능이 연동된 소개팅 서비스를 개발합니다. 사용자 경험과 프라이버시 보호를 동시에 고려합니다.",
    slug: "dating-map-app",
    price: 130000,
    image: datingBg,
  },
  {
    icon: ShoppingBag,
    title: "중고거래 플랫폼",
    tag: "C2C Marketplace",
    desc: "당근마켓 스타일의 지역 기반 중고거래 플랫폼을 구축합니다. 상품 등록, 채팅, 거래 상태 관리, 신고 기능까지 포함합니다.",
    slug: "c2c-marketplace",
    price: 130000,
    image: marketplaceBg,
  },
  {
    icon: Sparkles,
    title: "제품 광고 숏폼 생성기",
    tag: "Shorts / AI",
    desc: "AI로 제품 이미지와 스크립트를 넣으면 즉시 광고용 숏폼을 뽑아주는 생성기를 개발합니다. SNS 마케팅 자동화에 최적화된 파이프라인입니다.",
    slug: "shorts-generator",
    price: 150000,
    image: shortsBg,
  },
  {
    icon: FileText,
    title: "블로그 자동화 툴",
    tag: "Blog Automation",
    desc: "키워드 입력만으로 AI가 기획·초안·이미지까지 준비해주는 블로그 자동화 도구를 개발합니다. 배포와 SEO 메타 태그까지 자동화해 운영 부담을 줄입니다.",
    slug: "blog-automation",
    price: 130000,
    image: blogAutomationBg,
  },
  {
    icon: Share2,
    title: "SNS 자동업로드 툴",
    tag: "SNS Auto",
    desc: "제작된 콘텐츠를 예약 시간에 맞춰 인스타그램, 블로그, 쇼츠 등 여러 채널에 자동 업로드하는 파이프라인을 구축합니다. 해시태그와 썸네일도 자동 생성됩니다.",
    slug: "sns-auto-upload",
    price: 130000,
    image: snsAutoBg,
  },
];

const categoryBgMap: Record<string, string> = {
  "API Integration": affiliateBg,
  "Maintenance": marketplaceBg,
  "Real Estate": realEstateBg,
  "Auction": auctionBg,
  "Crypto": cryptoBg,
  "Affiliate": affiliateBg,
  "Social / Dating": datingBg,
  "C2C Marketplace": marketplaceBg,
  "Shorts / AI": shortsBg,
  "Blog Automation": blogAutomationBg,
  "SNS Auto": snsAutoBg,
};

function Develop() {
  const { openInquiry } = useInquiry();
  return (
    <section id="develop" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <div className="mb-3 text-sm font-medium text-primary-glow">— Planning / Develop</div>
            <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
              기획/개발
            </h2>
            <p className="mt-4 max-w-xl text-muted-foreground">
              비즈니스 목표에 맞춰 기획부터 개발까지 완성도 높은 웹/앱 서비스를 만들어갑니다.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {developItems.map((item) => (
            <button
              key={item.title}
              type="button"
              onClick={() => openInquiry(item.title)}
              className="glow-hover group flex flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white/95 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md dark:border-slate-700/60 dark:bg-slate-900/95"
            >
              {item.image && (
                <div className="relative aspect-[16/7] w-full overflow-hidden">
                  <img
                    src={item.image}
                    alt=""
                    loading="lazy"
                    width={1280}
                    height={800}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                </div>
              )}
              <div className="flex flex-1 flex-col p-5">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-lg">
                    <item.icon className="h-5 w-5" />
                  </span>
                  <span className="rounded-full border border-slate-200/80 bg-slate-100/80 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-300">
                    {item.tag}
                  </span>
                </div>
                <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">{item.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {item.desc}
                </p>
                <div className="mt-5 flex items-center justify-between border-t border-slate-200/60 pt-4 dark:border-slate-700/50">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {item.recurring ? "월 구독형 · 견적 상담" : "견적 상담"}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-primary to-primary-glow px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg">
                    <MessageCircle className="h-3.5 w-3.5" /> 문의하기
                  </span>
                </div>
              </div>
            </button>
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

// ⚠️ 화면에서는 금액을 빼기로 했다(2026-09-07). 데이터는 나중에 되살릴 수 있게 남겨 둔다.
//    아래 pricingTiers / pricingGroupLabels 는 현재 어디에서도 렌더하지 않는다.
const pricingTiers = [
  // 빠른 구축 · 1~3주
  { group: "빠른 구축 · 1~3주", tag: "Landing", title: "랜딩·브랜드 사이트", desc: "반응형 1~5페이지, 문의폼·배포 포함", price: 890000, duration: "1~2주" },
  { group: "빠른 구축 · 1~3주", tag: "CMS", title: "CMS 구축", desc: "블로그·공지 관리형 콘텐츠 시스템", price: 1400000, duration: "2주" },
  { group: "빠른 구축 · 1~3주", tag: "Survey", title: "설문·신청 폼 시스템", desc: "결과 통계·시트 연동 포함", price: 1800000, duration: "2주" },
  { group: "빠른 구축 · 1~3주", tag: "Integration", title: "시스템 연동 · API 구축", desc: "리드 수신 API, 시트·CRM 연동, 키 발급 구조", price: 1900000, duration: "2~3주" },

  // 업무 시스템 · 3~8주
  { group: "업무 시스템 · 3~8주", tag: "Booking", title: "예약형 시스템", desc: "스케줄·결제 연동, 관리자 포함", price: 3800000, duration: "4주" },
  { group: "업무 시스템 · 3~8주", tag: "Forum", title: "커뮤니티·포럼", desc: "게시판, 댓글, 신고, 권한 관리", price: 3800000, duration: "4주" },
  { group: "업무 시스템 · 3~8주", tag: "CRM", title: "CRM 고객관리", desc: "문의·상담·이력, 담당자 배분", price: 4800000, duration: "5주" },
  { group: "업무 시스템 · 3~8주", tag: "Chatbot", title: "AI 챗봇 (RAG)", desc: "문서 임베딩, 출처 표기, 관리자 학습", price: 5800000, duration: "5주" },
  { group: "업무 시스템 · 3~8주", tag: "LMS", title: "LMS 온라인 교육", desc: "강의·수강·평가·수료 관리", price: 6800000, duration: "6~8주" },
  { group: "업무 시스템 · 3~8주", tag: "HR", title: "HR 인사평가", desc: "성과관리, 연봉계약, 결재선", price: 6800000, duration: "6~8주" },

  // 통합 시스템 · 8주~
  { group: "통합 시스템 · 8주~", tag: "E-Commerce", title: "커머스 시스템", desc: "주문·정산·환불, PG 연동 및 심사 대응", price: 7800000, duration: "8주~" },
  { group: "통합 시스템 · 8주~", tag: "WMS", title: "WMS 재고·창고", desc: "입출고, 로케이션, 바코드 연동", price: 9800000, duration: "10주~" },
  { group: "통합 시스템 · 8주~", tag: "ERP", title: "맞춤형 ERP", desc: "회계·재무·인사 통합, 기존 시스템 연동", price: 14000000, duration: "12주~" },

  // 운영
  { group: "운영", tag: "Maintenance", title: "연동 유지보수", desc: "장애 감지·알림·복구, 스펙 변경 대응", price: 150000, duration: "월 단위", recurring: true },
];

// 화면에 노출하는 그룹 이름 (데이터의 group 키에는 기간이 들어 있어 표시용으로만 분리한다)
const pricingGroupLabels: Record<string, string> = {
  "빠른 구축 · 1~3주": "빠른 구축",
  "업무 시스템 · 3~8주": "업무 시스템",
  "통합 시스템 · 8주~": "통합 시스템",
  "운영": "운영",
};

// ── "이런 것을 만듭니다" 섹션 ───────────────────────────────────────────────
// 카테고리를 나열하면 사려는 사람이 자기 문제를 못 찾는다. 그래서 제목은 증상,
// 내용은 기능 단위로 쪼개고, 사례가 있는 것에는 실제 포트폴리오를 붙인다.

// 배지에 쓸 수 있는 숫자는 "항목 개수" 가 아니라 "실제로 사례를 걸 수 있는 항목 개수" 다.
function countLinked(items: Capability[]) {
  return items.filter(
    (c) => (c.cases ?? []).some((n) => portfolioByName.has(n)) || c.tossMiniApp,
  ).length;
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
    features: [
      "토스 미니앱",
      "모바일 웹앱(PWA)",
      "홈 화면 추가",
      "푸시 알림",
      "오프라인 대응",
    ],
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
    features: [
      "HR",
      "목표·성과 관리",
      "다면 평가",
      "연봉 계약",
      "결재선",
      "평가 이력",
    ],
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

function CapabilityCard({ item, consult }: { item: Capability; consult?: boolean }) {
  const { openInquiry } = useInquiry();
  const cases = (item.cases ?? []).flatMap((name) => {
    const site = portfolioByName.get(name);
    return site ? [{ name, url: site.url }] : [];
  });
  // 걸 사례가 없으면 "사례" 라벨만 덩그러니 남는다. 그건 없는 걸 있는 척하는 자리다.
  const showCases = cases.length > 0 || item.tossMiniApp;

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow">
          <item.icon className="h-4 w-4" />
        </span>
        <h4 className="mt-1 font-display text-base leading-snug font-semibold text-slate-900">
          {item.title}
        </h4>
      </div>

      <div className="mt-4 flex flex-1 flex-wrap content-start gap-1.5">
        {item.features.map((f) => (
          <span
            key={f}
            className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] leading-none text-slate-600"
          >
            {f}
          </span>
        ))}
      </div>

      {consult || !showCases ? (
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-200/70 pt-3">
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
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-200/70 pt-3">
          <span className="text-[11px] text-slate-400">사례</span>
          {cases.map((c) => (
            <a
              key={c.url}
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/10"
            >
              {c.name} <ExternalLink className="h-3 w-3" />
            </a>
          ))}
          {item.tossMiniApp && <TossMiniAppCaseLink />}
          <button
            type="button"
            onClick={() => openInquiry(item.title)}
            className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:text-primary"
          >
            <MessageCircle className="h-3 w-3" /> 문의
          </button>
        </div>
      )}
    </div>
  );
}

function Capabilities() {
  const { openInquiry } = useInquiry();

  return (
    <section id="pricing" className="bg-slate-50 px-4 py-24 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            What We Build
          </span>
          <h2 className="mt-5 font-display text-4xl font-bold tracking-tight md:text-5xl">
            이런 것을 <span className="text-gradient">만듭니다</span>
          </h2>
          <p className="mt-4 text-slate-600">
            분야 이름 대신 기능으로 적었습니다. 훑어보시다 &ldquo;이거 우리 얘기다&rdquo; 싶은 항목을 눌러 주세요.
            <br />
            사례를 붙일 수 있는 항목에만 실제 사이트를 걸어 뒀습니다. 눌러서 바로 확인하실 수 있습니다.
          </p>
        </div>

        {/* A. 만들어 본 것 — 플랫폼·SaaS 가 앞, 전환 페이지가 뒤 */}
        <div className="mt-14">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h3 className="font-display text-lg font-semibold text-slate-900">웹·앱으로 만드는 것</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
              <ExternalLink className="h-3 w-3" /> 실제 사이트를 붙인 항목 {countLinked(provenCapabilities)}개
            </span>
            <div className="hidden h-px flex-1 bg-slate-200 sm:block" />
          </div>
          <p className="mb-5 text-sm text-slate-600">
            보여드릴 사이트가 있는 항목에는 사례를 붙여 뒀습니다. 눌러서 바로 확인하세요.
            사례를 아직 공개하지 못하는 항목은 상담부터 시작합니다.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {provenCapabilities.map((item) => (
              <CapabilityCard key={item.title} item={item} />
            ))}
          </div>
        </div>

        {/* B. 아직 공개할 사례가 없는 것 */}
        <div className="mt-14">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h3 className="font-display text-lg font-semibold text-slate-900">사례가 아직 없는 것</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-200/70 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              <MessageCircle className="h-3 w-3" /> 상담으로 시작합니다
            </span>
            <div className="hidden h-px flex-1 bg-slate-200 sm:block" />
          </div>
          <p className="mb-5 text-sm text-slate-600">
            공개할 수 있는 사례가 아직 없는 영역입니다. 요구사항을 들은 뒤 범위와 일정을 정리해 드립니다.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {consultCapabilities.map((item) => (
              <CapabilityCard key={item.title} item={item} consult />
            ))}
          </div>
        </div>

        {/* C. 연동해 본 것 */}
        <div className="mt-14 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="inline-flex items-center gap-2 font-display text-lg font-semibold text-slate-900">
              <Link2 className="h-4 w-4 text-primary" /> 연동해 본 것
            </h3>
            <div className="hidden h-px flex-1 bg-slate-200 sm:block" />
          </div>
          <p className="mt-2 text-sm text-slate-600">
            이 사이트와 납품 프로젝트에서 실제로 붙여 본 것만 적었습니다.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {integrations.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-primary" /> {name}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="font-display text-lg font-semibold text-slate-900">필요한 기능이 목록에 없나요?</div>
          <div className="mt-2 text-sm text-slate-600">
            쓰던 방식과 불편한 지점을 그대로 말씀해 주시면, 어떻게 만들지 정리해서 알려드립니다.
          </div>
          <button
            type="button"
            onClick={() => openInquiry()}
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:scale-[1.02]"
          >
            <MessageCircle className="h-4 w-4" /> 상담 문의하기
          </button>
        </div>
      </div>
    </section>
  );
}


function Nav() {
  const { openInquiry } = useInquiry();
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

          {/* Desktop nav */}
          <div className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#portfolio" className="transition hover:text-foreground">포트폴리오</a>
            <a href="#solutions" className="transition hover:text-foreground">업종별 솔루션</a>
            <a href="#develop" className="transition hover:text-foreground">기획/개발</a>
            <a href="#projects" className="transition hover:text-foreground">Projects</a>
            <Link to="/blog" className="transition hover:text-foreground">블로그</Link>
            {isAdmin && <Link to="/app-dev" className="transition hover:text-foreground">앱 개발</Link>}
            {isAdmin && <Link to="/sell" className="transition hover:text-foreground">판매하기</Link>}
            <button
              onClick={() => openInquiry()}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-glow)] transition hover:scale-[1.02]"
            >
              문의하기 <MessageCircle className="h-3.5 w-3.5" />
            </button>
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
                  <div id="user-menu" className="absolute right-0 mt-2 w-52 overflow-hidden rounded-2xl border border-border bg-surface/95 p-2 shadow-card backdrop-blur">
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
              <a href="#portfolio" onClick={() => setMobileOpen(false)} className="rounded-xl px-3 py-2.5 text-muted-foreground transition hover:bg-surface-elevated hover:text-foreground">포트폴리오</a>
              <a href="#solutions" onClick={() => setMobileOpen(false)} className="rounded-xl px-3 py-2.5 text-muted-foreground transition hover:bg-surface-elevated hover:text-foreground">업종별 솔루션</a>
              <a href="#develop" onClick={() => setMobileOpen(false)} className="rounded-xl px-3 py-2.5 text-muted-foreground transition hover:bg-surface-elevated hover:text-foreground">기획/개발</a>
              <a href="#projects" onClick={() => setMobileOpen(false)} className="rounded-xl px-3 py-2.5 text-muted-foreground transition hover:bg-surface-elevated hover:text-foreground">Projects</a>
              <Link to="/blog" onClick={() => setMobileOpen(false)} className="rounded-xl px-3 py-2.5 text-muted-foreground transition hover:bg-surface-elevated hover:text-foreground">블로그</Link>
              {isAdmin && <Link to="/app-dev" onClick={() => setMobileOpen(false)} className="rounded-xl px-3 py-2.5 text-muted-foreground transition hover:bg-surface-elevated hover:text-foreground">앱 개발</Link>}
              {isAdmin && <Link to="/sell" onClick={() => setMobileOpen(false)} className="rounded-xl px-3 py-2.5 text-muted-foreground transition hover:bg-surface-elevated hover:text-foreground">판매하기</Link>}
              <button
                onClick={() => {
                  setMobileOpen(false);
                  openInquiry();
                }}
                className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-primary to-primary-glow px-3 py-2.5 text-sm font-medium text-primary-foreground"
              >
                문의하기 <MessageCircle className="h-4 w-4" />
              </button>
              {user && (
                <>
                  <div className="my-1 h-px bg-border" />
                  <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-foreground transition hover:bg-surface-elevated">
                    <LayoutDashboard className="h-4 w-4 text-primary-glow" /> 대시보드
                  </Link>
                  <Link to="/me" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-foreground transition hover:bg-surface-elevated">
                    <Package className="h-4 w-4 text-primary-glow" /> 보관함
                  </Link>
                  {isAdmin && (
                    <>
                      <Link to="/admin" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-foreground transition hover:bg-surface-elevated">
                        <ShieldCheck className="h-4 w-4 text-primary-glow" /> 관리자
                      </Link>
                      <Link to="/admin/review" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-foreground transition hover:bg-surface-elevated">
                        <ShieldCheck className="h-4 w-4 text-amber-400" /> 검수 대기열
                      </Link>
                      <Link to="/admin/webhooks" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-foreground transition hover:bg-surface-elevated">
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
  const { openInquiry } = useInquiry();
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
            <p className="mt-3 max-w-xl text-muted-foreground">
              한눈에 비교하고, 필요한 서비스를 바로 문의하세요.
            </p>
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
          <div className="overflow-hidden rounded-3xl border border-border bg-surface/40">
            <div className="hidden grid-cols-12 gap-4 border-b border-border bg-surface/70 px-6 py-3 text-xs font-medium text-muted-foreground md:grid">
              <div className="col-span-6">서비스</div>
              <div className="col-span-3">분야</div>
              <div className="col-span-3 text-right">문의</div>
            </div>
            {((products ?? []) as Product[]).map((p) => {
              const thumb = p.thumbnail_url || categoryBgMap[p.tag ?? ""] || shortsBg;
              return (
                <div
                  key={p.id}
                  className="group grid grid-cols-1 items-start gap-3 border-b border-border/50 px-5 py-4 transition last:border-b-0 hover:bg-surface/70 md:grid-cols-12 md:items-center md:gap-4 md:px-6 md:py-4"
                >
                  <div className="col-span-6 flex items-center gap-4">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border/50 bg-background/40">
                      <img
                        src={thumb}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    </div>
                    <div className="min-w-0">
                      {p.slug ? (
                        <Link to="/p/$slug" params={{ slug: p.slug }} className="block group/title">
                          <h3 className="truncate font-display text-base font-semibold text-foreground transition group-hover/title:text-primary-glow">
                            {p.title}
                          </h3>
                        </Link>
                      ) : (
                        <h3 className="truncate font-display text-base font-semibold text-foreground">
                          {p.title}
                        </h3>
                      )}
                      <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{p.description}</p>
                    </div>
                  </div>

                  <div className="col-span-3 flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-border bg-surface/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                      {p.tag || p.category || "기타"}
                    </span>
                  </div>

                  <div className="col-span-3 flex items-center justify-start gap-2 md:justify-end">
                    <button
                      onClick={() => openInquiry(p.title)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> 문의
                    </button>
                    {p.slug && (
                      <Link
                        to="/p/$slug"
                        params={{ slug: p.slug }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface/60 text-muted-foreground transition hover:text-foreground"
                        aria-label="상세 보기"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function About() {
  return (
    <section id="about" className="px-4 py-24">
      <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-2 md:gap-20">
        <div>
          <div className="mb-3 text-sm font-medium text-primary-glow">— About</div>
          <h2 className="font-display text-4xl font-bold leading-tight md:text-5xl">
            개발자의 아이디어가 제품이 되는 곳
          </h2>
        </div>
        <div className="space-y-6 text-muted-foreground">
          <p className="text-lg leading-relaxed">
            좋은 코드는 혼자 완성되지 않습니다. 기획·개발·배포 전 과정을 함께하며,
            아이디어를 실제 제품과 비즈니스로 만듭니다.
          </p>
          <div className="grid grid-cols-2 gap-4 pt-4">
            {[
              { i: Sparkles, t: "AI 기획" },
              { i: Code2, t: "MVP 개발" },
              { i: Zap, t: "빠른 출시" },
              { i: Smartphone, t: "운영·배포" },
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
  const { openInquiry } = useInquiry();
  return (
    <section id="contact" className="px-4 py-24">
      <div className="mx-auto max-w-4xl">
        <div className="glass relative overflow-hidden rounded-3xl p-10 md:p-16">
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/30 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-primary-glow/20 blur-3xl" />
          <div className="relative">
            <div className="mb-3 text-sm font-medium text-primary-glow">— Contact</div>
            <h2 className="font-display text-4xl font-bold md:text-5xl">프로젝트를 시작해요</h2>
            <p className="mt-4 max-w-lg text-muted-foreground md:text-lg">
              아이디어를 현실로 만드는 첫 단추를 눌러보세요.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => openInquiry()}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3 font-semibold text-primary-foreground transition hover:scale-[1.02]"
              >
                <MessageCircle className="h-4 w-4" /> 문의하기
              </button>
              <a
                href="mailto:contact@ai-solution.co.kr"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-6 py-3 font-medium text-foreground transition hover:bg-surface"
              >
                <Mail className="h-4 w-4 text-primary-glow" /><span>contact@ai-solution.co.kr</span>
              </a>
              <a
                href={KAKAO_OPENCHAT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-6 py-3 font-medium text-foreground transition hover:bg-surface"
              >
                <MessageCircle className="h-4 w-4 text-primary-glow" /><span>카카오톡 상담</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
