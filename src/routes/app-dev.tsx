import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Smartphone,
  Zap,
  Sparkles,
  Cpu,
  Plug,
  Monitor,
  Terminal,
  Code2,
  BarChart3,
  Gauge,
  ShieldCheck,
  ServerCog,
  FileCode2,
  Globe,
  Lock,
  CloudCog,
  Wrench,
  PackageCheck,
  Megaphone,
  Target,
  Database,
  TrendingUp,
  LineChart,
  Share2,
} from "lucide-react";

export const Route = createFileRoute("/app-dev")({
  head: () => ({
    meta: [
      { title: "앱 개발 — 에이아이솔루션(AISOLITION)" },
      {
        name: "description",
        content:
          "Flutter 기반 iOS/Android 동시 개발. 견적부터 출시까지 투명한 절차로 함께합니다.",
      },
      { property: "og:title", content: "앱 개발 — 에이아이솔루션(AISOLITION)" },
      {
        property: "og:description",
        content: "Flutter 기반 크로스 플랫폼 앱 개발 서비스",
      },
    ],
  }),
  component: AppDevPage,
});

const features = [
  { icon: Smartphone, title: "크로스 플랫폼", desc: "iOS와 Android 앱을 하나의 코드베이스로 동시에 개발하여 비용과 시간을 절감합니다." },
  { icon: Zap, title: "빠른 개발 속도", desc: "핫리로드(Hot Reload)로 개발-테스트-수정 사이클을 빠르게 반복할 수 있습니다." },
  { icon: Sparkles, title: "매끄러운 UI/UX", desc: "Material Design과 iOS 스타일을 모두 지원하여 일관된 고급 사용자 경험을 제공합니다." },
  { icon: Cpu, title: "성능 최적화", desc: "Flutter는 네이티브 수준의 성능을 제공하며, 복잡한 애니메이션도 부드럽게 처리합니다." },
  { icon: Plug, title: "풍부한 플러그인", desc: "Firebase, Stripe, Maps 등 다양한 기능을 빠르게 연결할 수 있는 라이브러리 생태계." },
  { icon: Monitor, title: "웹 & 데스크탑 확장", desc: "하나의 코드로 앱뿐 아니라 웹, 윈도우, 맥OS 앱까지 확장 개발이 가능합니다." },
];

const process = [
  { n: "01", title: "문의 및 견적 요청", desc: "홈페이지 문의하기를 통해 요청하시면, 1일 이내로 예상 견적과 일정을 안내드립니다." },
  { n: "02", title: "계약 및 계약금 결제", desc: "계약 확정 후 계약금 50%를 결제하시면 프로젝트가 시작됩니다. 필요 시 이행보증보험 발행도 가능합니다." },
  { n: "03", title: "API 연동 및 서버 환경 설정", desc: "Laravel 등 기존 백엔드와의 API 연동을 검토하고, 필요 시 EC2 등 서버 환경을 설정합니다." },
  { n: "04", title: "1차 앱 기능 개발 및 테스트", desc: "로그인, 목록 출력(ListView), 폼 제출 등의 핵심 기능을 우선 개발하고, 디바이스에서 1차 테스트를 진행합니다." },
  { n: "05", title: "UI/UX 개선 및 피드백 반영", desc: "실제 앱 화면을 기준으로 UI 디테일 및 UX 흐름을 개선하며, 피드백 사항을 수렴하여 반영합니다." },
  { n: "06", title: "앱 패키징 및 최종 납품", desc: "Android(APK/AAB) 및 iOS(IPA) 패키지로 제공되며, 앱스토어 등록 가이드도 함께 안내드립니다. 잔금 결제 후 전체 소스코드 및 3개월 무상 오류 수정을 지원합니다." },
];

const whyUs = [
  { icon: Terminal, title: "노코드 아님", desc: "내부 로직과 구조를 투명하게 설계하여, 광고 캠페인이나 A/B 테스트 대응 시에도 빠르게 수정할 수 있도록 만듭니다." },
  { icon: Code2, title: "전문 개발 기반", desc: "시니어 프론트/백엔드 개발자가 솔루션 의존 없이 확장성과 운영 편의성을 고려해 정확하게 개발합니다." },
  { icon: BarChart3, title: "SEO 최적화", desc: "SSR 구조, 시맨틱 태그, 메타/OG 관리 등 검색 노출을 위한 기본을 충실히 갖춰 초기 유입 확보에 유리합니다." },
  { icon: Gauge, title: "UX & 퍼포먼스", desc: "PageSpeed, FCP, CLS 등 핵심 웹 성능 지표를 최적화하고, 모바일 사용자의 이탈을 줄이는 UX 설계를 적용합니다." },
  { icon: ShieldCheck, title: "AD·Log 연동 지원", desc: "Google GTM, Meta Pixel, CRM API 등 주요 광고/분석 도구와의 연동을 기본 고려하여 마케팅 자동화에 용이합니다." },
  { icon: ServerCog, title: "확장 가능한 구조", desc: "트래픽 증가, 기능 추가, 외부 서비스 연동 등 미래 확장을 염두에 두고 모듈식으로 구축합니다." },
];

const benefits1 = [
  { title: "테스트 서버 제공", desc: "프로젝트 착수 후 3일 이내에 테스트 서버를 구축하고, 실제 작동 화면을 웹에서 시연합니다. 프로젝트 완료 시까지 무상으로 운영됩니다." },
  { title: "소스코드 전체 제공", desc: "개발 완료 후 최종 소스 파일과 관련 자료를 제공해드리며, 추후 자유로운 수정 및 운영이 가능하도록 인수인계합니다." },
  { title: "크로스브라우징 지원", desc: "제작하는 모든 사이트는 크로스브라우징 작업을 통해 어느 브라우저에서도 일관된 디자인과 기능을 제공합니다." },
  { title: "SSL 인증서 등 강화된 보안", desc: "방문자 신뢰도를 높이기 위한 SSL 인증서 외에도 보안 헤더, CAPTCHA 등 필수 보안과 광고 추적 데이터 보호를 지원합니다." },
  { title: "Cloudflare CDN 및 보안 설정", desc: "도메인 연결과 함께 Cloudflare CDN을 설정하여 웹사이트의 로딩 속도를 개선하고, 기본적인 보안 기능을 활성화합니다." },
  { title: "3개월 무료 호스팅", desc: "고객사가 별도 서버를 보유하지 않은 경우, 당사의 공용서버를 통해 최대 3개월간 무료 호스팅을 제공합니다." },
  { title: "3개월 무상 유지보수 & 이전 지원", desc: "모든 개발 프로젝트는 3개월간 무상 유지보수(AS) 대상입니다. 기능 오류 및 장애에 신속히 대응합니다." },
  { title: "* 무료 솔루션 설치", desc: "광고 성과 향상을 위한 경쟁업체 분석, 데이터베이스, 전환 최적화, 로그 분석, 자동 입찰, 센티멘트, 소셜 통합을 무료로 지원합니다." },
  { title: "* 무료 광고 대행 지원", desc: "무료 광고 집행을 지원해드려 광고 성과를 경험할 수 있도록 지원합니다. 자사 광고 서비스 이용 시 자동으로 적용됩니다." },
];

const solutions = [
  { icon: Target, title: "경쟁업체 분석", desc: "경쟁사의 키워드를 모두 분석하여 더 효율적으로!", items: ["경쟁사 비즈니스 모델과 전략 파악", "경쟁사 USP 및 포지셔닝 분석", "경쟁사의 최신 소식 및 동향 모니터링", "솔루션 상세"] },
  { icon: Database, title: "데이터베이스", desc: "Data Mining을 활용한 광고를 집행합니다.", items: ["로그 분석 자료", "매체 사용자 정보", "검색어별 쿼리 정보", "광고 플랫폼 예상 시뮬레이션"] },
  { icon: TrendingUp, title: "전환 최적화", desc: "효과적인 타겟팅을 통한 효율적인 광고를 집행합니다.", items: ["Meta Pixel 등 Script 설치로 유저 행동 추적", "성과미비 유저층 분석", "성과 우수 확장 타겟 설정"] },
  { icon: LineChart, title: "로그 분석", desc: "사이트 방문자에 대한 데이터를 수집하고 분석합니다.", items: ["마케팅, 방문 유입 현황/경로, 방문형태 등 데이터 수집", "히트맵을 활용하여 방문자의 마우스 클릭을 열 분포 형태로 시각화", "리포트 최적화로 데이터 분석"] },
  { icon: Megaphone, title: "센티멘트", desc: "유저들의 반응에 따른 센티멘트 점수를 지표로 제공합니다.", items: ["원하는 타켓 오디언스 설정 및 데이터 분석", "타겟 오디언스 기반 광고 전략 구체화", "광고 매체 매칭 및 집행"] },
  { icon: Share2, title: "소셜 통합", desc: "한 번에 여러 소셜 미디어의 광고를 집행하고, 성과를 비교할 수 있습니다.", items: ["틱톡, 유튜브, 인스타그램, 페이스북 등 여러 소셜 미디어에 한 번에 광고 집행", "통합 소셜 미디어 광고 비교 대시보드 제공"] },
];

function AppDevPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-auto mt-4 max-w-6xl px-4">
          <nav className="glass flex items-center justify-between rounded-full px-5 py-3">
            <Link to="/" className="flex items-center gap-2 font-display font-bold tracking-tight">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground text-xs">◆</span>
              <span className="text-base">AISOLITION</span>
            </Link>
            <div className="hidden gap-7 text-sm text-muted-foreground md:flex">
              <Link to="/" className="transition hover:text-foreground">홈</Link>
              <Link to="/app-dev" className="text-foreground">앱 개발</Link>
              <Link to="/sell" className="transition hover:text-foreground">판매하기</Link>
            </div>
            <Link to="/" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">
              문의하기
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="px-4 pt-40 pb-24">
        <div className="mx-auto max-w-5xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/40 px-4 py-1.5 text-xs text-primary-glow">
            <Sparkles className="h-3.5 w-3.5" />Flutter · iOS · Android
          </span>
          <h1 className="mt-6 font-display text-5xl font-bold tracking-tight md:text-7xl">
            <span className="text-gradient">Flutter</span>를 사용한<br />앱 개발
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">하나의 코드로 iOS와 Android를 동시에</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/" className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">견적 문의하기</Link>
            <a href="#process" className="rounded-full border border-border bg-surface/40 px-6 py-3 text-sm transition hover:bg-surface">개발 프로세스 보기</a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="glass glow-hover rounded-3xl p-8">
                <Icon className="h-8 w-8 text-primary-glow" />
                <h3 className="mt-5 font-display text-xl font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section id="process" className="px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <h2 className="font-display text-4xl font-bold md:text-5xl">Flutter 앱 개발 프로세스</h2>
            <p className="mt-4 text-muted-foreground">처음부터 출시까지, 투명하고 전문적인 절차로 함께합니다.</p>
          </div>
          <div className="relative mt-16">
            <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-primary/60 via-border to-transparent md:left-8" />
            <div className="space-y-6">
              {process.map(({ n, title, desc }) => (
                <div key={n} className="relative flex gap-6 md:gap-8">
                  <div className="relative z-10 grid h-12 w-12 shrink-0 place-items-center rounded-full border border-primary/40 bg-surface font-display text-sm font-bold text-primary-glow md:h-16 md:w-16 md:text-base">
                    {n}
                  </div>
                  <div className="glass flex-1 rounded-2xl p-6">
                    <h3 className="font-display text-lg font-semibold md:text-xl">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-10 rounded-2xl border border-primary/30 bg-primary/10 p-5 text-sm text-foreground/90">
            <span className="font-semibold text-primary-glow">준비 자료 안내 · </span>
            앱 개발을 위해 <b>API 명세서</b>, <b>로고/컬러 가이드</b>, <b>이미지/텍스트 콘텐츠</b>, <b>Firebase 정보</b> 등의 자료를 사전에 준비해주셔야 합니다.
          </div>
        </div>
      </section>

      {/* Why Us */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="font-display text-4xl font-bold md:text-5xl">AISOLITION의 SI 개발이 특별한 이유</h2>
            <p className="mt-4 text-muted-foreground">개발만이 아닌,<br />고객에게 도달하고 활용되는 제품을 설계합니다.</p>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {whyUs.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="glass glow-hover rounded-3xl p-8 text-center">
                <Icon className="mx-auto h-8 w-8 text-primary-glow" />
                <h3 className="mt-5 font-display text-xl font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits 1 */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-3xl font-bold md:text-4xl">클라이언트에게 제공하는 무료 혜택 1</h2>
          <p className="mt-3 text-muted-foreground">아래 혜택은 별도 요청 없이 모든 고객에게 기본 제공됩니다.</p>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {benefits1.map((b, i) => {
              const icons = [Wrench, FileCode2, Globe, Lock, CloudCog, ServerCog, Wrench, PackageCheck, Megaphone];
              const Icon = icons[i];
              return (
                <div key={b.title} className="glass rounded-2xl p-6">
                  <Icon className="h-6 w-6 text-primary-glow" />
                  <h3 className="mt-4 font-display text-lg font-semibold text-primary-glow">{b.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{b.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Solutions 2 */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-3xl font-bold md:text-4xl">클라이언트에게 제공하는 무료 솔루션 2</h2>
          <p className="mt-3 text-muted-foreground">광고 성과 향상을 위한 핵심 마케팅 기능을 무료로 제공합니다.</p>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {solutions.map(({ icon: Icon, title, desc, items }) => (
              <div key={title} className="glass rounded-2xl p-7">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary-glow">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="font-display text-xl font-semibold">{title}</h3>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">{desc}</p>
                <ul className="mt-5 space-y-2.5">
                  {items.map((it) => (
                    <li key={it} className="flex gap-2.5 text-sm text-foreground/90">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-glow" />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <div className="glass rounded-3xl p-12">
            <h2 className="font-display text-3xl font-bold md:text-4xl">앱 개발, 지금 시작하세요</h2>
            <p className="mt-4 text-muted-foreground">1일 이내 견적 안내. 계약금 50%로 프로젝트 시작.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/" className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">견적 문의하기</Link>
              <a href="tel:02-533-1134" className="rounded-full border border-border bg-surface/40 px-6 py-3 text-sm transition hover:bg-surface">02-533-1134</a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
