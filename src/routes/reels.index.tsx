// /reels — 「문의 댓글이 달리는 릴스 제작」 소개·가격 페이지.
// 설계서: docs/superpowers/specs/2026-11-06-reference-reel-ad-landing-design.md 2절.
// 주의: 이 라우트의 head 는 루트(__root.tsx)의 메타를 덮는다. title·description·og 를 반드시 이 페이지 것으로 쓴다.
// 주의: 문구 원칙: 「참고 릴스의 흐름·훅·대본 구성을 분석해서 사장님 가게 자료로 새로 만들어 드립니다」.
//    남의 릴스를 그대로 베낀다는 표현, 결과(조회·문의·매출 숫자)를 약속하는 표현, 제작 기간 약속은 쓰지 않는다.
// 주의: 예시 영상 칸은 대표님이 예시를 고르기 전까지 자리만 둔다(실제 이미지·영상 넣지 마라).
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Camera, Check, MessageSquareText, Sparkles } from "lucide-react";
import { KakaoChannelPlaceholder, ReelsFooter, ReelsNav } from "@/components/reels/ReelsParts";
import {
  METHOD_DESC,
  METHOD_LABEL,
  PLAN_CARDS,
  REELS_PRINCIPLE,
  REELS_STEPS,
  SELLER,
  TRIAL_CREDIT_NOTE,
} from "@/lib/reels/constants";
import { num } from "@/lib/reels/format";

const CANONICAL = "https://ai-solution.co.kr/reels";
const TITLE = "문의 댓글이 달리는 쇼츠 제작 | 에이아이솔루션";
const DESCRIPTION =
  "조회 수 말고, 문의 댓글이 달리는 쇼츠를 만들어 드립니다. 참고 영상의 흐름·훅·대본 구성을 분석해서 사장님 가게 자료로 새로 만듭니다. 1편 200,000원(첫 주문 99,000원), 5편 750,000원, 10편 1,400,000원, 부가세 포함.";
const SHARE_TITLE = "조회 수 말고, 문의 댓글이 달리는 쇼츠 — 에이아이솔루션";

export const Route = createFileRoute("/reels/")({
  component: ReelsPage,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: SHARE_TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
      { property: "og:image", content: "https://ai-solution.co.kr/og.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SHARE_TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: "https://ai-solution.co.kr/og.png" },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
});

function ReelsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <ReelsNav />
      <Hero />
      <Methods />
      <Examples />
      <Pricing />
      <Steps />
      <Contact />
      <ReelsFooter />
    </div>
  );
}

function Hero() {
  return (
    <section className="px-4 pt-12 pb-12 md:pt-20 md:pb-16">
      <div className="mx-auto max-w-5xl">
        <p className="font-display text-sm font-semibold text-primary-glow md:text-base">
          문의 댓글이 달리는 쇼츠 제작
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-[2rem] leading-[1.22] font-bold tracking-tight md:text-5xl md:leading-[1.15]">
          조회 수 말고, <span className="text-gradient">문의 댓글이 달리는 쇼츠</span>를 만들어
          드립니다
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          {REELS_PRINCIPLE}. 참고하고 싶은 영상(유튜브 쇼츠·인스타 릴스 등) 주소와 가게 자료를 주시면, 손님이 댓글로 묻고 싶어지는
          흐름으로 대본을 짜고 편집해 드립니다.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href="#pricing"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-7 py-3.5 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:scale-[1.02]"
          >
            가격 보고 고르기 <ArrowRight aria-hidden className="h-4 w-4" />
          </a>
          <a
            href="#methods"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-border bg-card px-7 py-3.5 font-medium text-foreground shadow-sm transition hover:bg-surface"
          >
            제작 방식 보기
          </a>
        </div>
      </div>
    </section>
  );
}

function SectionTitle({ eyebrow, title, desc }: { eyebrow: string; title: string; desc?: string }) {
  return (
    <div className="max-w-3xl">
      <div className="font-display text-xs font-semibold tracking-[0.2em] text-primary-glow uppercase">
        {eyebrow}
      </div>
      <h2 className="mt-3 font-display text-2xl leading-snug font-bold tracking-tight md:text-4xl">
        {title}
      </h2>
      {desc && <p className="mt-4 text-base leading-relaxed text-muted-foreground">{desc}</p>}
    </div>
  );
}

function Methods() {
  const items = [
    {
      no: "①",
      icon: Camera,
      key: "send_materials" as const,
      points: ["사장님 사진·영상을 그대로 살립니다", "대본·편집·자막·나레이션은 저희가 맡습니다"],
    },
    {
      no: "②",
      icon: Sparkles,
      key: "ai_only" as const,
      points: ["촬영하실 필요가 없습니다", "홈페이지 주소·가게 정보·사진 몇 장으로 AI로 만듭니다"],
    },
  ];
  return (
    <section id="methods" className="scroll-mt-4 bg-surface/60 px-4 py-14 md:py-20">
      <div className="mx-auto max-w-5xl">
        <SectionTitle
          eyebrow="How"
          title="제작 방식은 두 가지 중에서 고르세요"
          desc="어느 쪽이든 참고 영상의 흐름·훅·대본 구성을 먼저 분석하고, 사장님 가게에 맞게 새로 만듭니다."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {items.map(({ no, icon: Icon, key, points }) => (
            <article
              key={key}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-7"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
                  <Icon aria-hidden className="h-5 w-5" />
                </span>
                <h3 className="font-display text-lg font-bold md:text-xl">
                  {no} {METHOD_LABEL[key]}
                </h3>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
                {METHOD_DESC[key]}
              </p>
              <ul className="mt-4 space-y-2">
                {points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-foreground/90">
                    <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary-glow" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// 예시 영상. 2026-11-07 대표님 결정: 남의 영상 캡처 대신 우리가 만든 시험 영상(상호 없는 것만)을 쓴다.
// 파일: public/reels-examples/ex1~3.mp4(720p 압축)·jpg(첫 화면). 원본은 shorts_maker/ad_maker/runs 의
// rent_sample_nobrand(final_v2) · dui_generic_01 · 바탕 화면\법무법인글로리\숏폼견본\개인회생_숏폼_견본_v3_댓글형.mp4.
// 상호·실전화번호가 나오는 영상, 상품 제휴 영상(로봇청소기 등 — 대표님이 뺌)은 넣지 마라.
const EXAMPLES = [
  { src: "/reels-examples/ex1.mp4", poster: "/reels-examples/ex1.jpg", label: "장기렌트" },
  { src: "/reels-examples/ex2.mp4", poster: "/reels-examples/ex2.jpg", label: "음주운전 상담" },
  { src: "/reels-examples/ex3.mp4", poster: "/reels-examples/ex3.jpg", label: "개인회생" },
];

function Examples() {
  return (
    <section className="px-4 py-14 md:py-20">
      <div className="mx-auto max-w-5xl">
        <SectionTitle
          eyebrow="Example"
          title="이런 구조로 기획해 드립니다"
          desc="첫 장면에서 궁금증을 만들고, 손님이 댓글로 묻고 싶어지게 흐름을 짭니다."
        />
        <ul className="mt-8 grid max-w-3xl grid-cols-3 gap-3 md:gap-6">
          {EXAMPLES.map((ex) => (
            <li key={ex.src} data-testid="example-slot">
              <video
                src={ex.src}
                poster={ex.poster}
                controls
                playsInline
                preload="none"
                className="aspect-[9/16] w-full rounded-2xl border border-border bg-black object-cover"
                aria-label={`예시 영상: ${ex.label}`}
              />
              <p className="mt-2 text-center text-xs font-medium text-foreground md:text-sm">
                예시 영상 · {ex.label}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-4 bg-surface/60 px-4 py-14 md:py-20">
      <div className="mx-auto max-w-5xl">
        <SectionTitle eyebrow="Price" title="가격" desc="1편은 30초 기준 쇼츠 한 편입니다. 모든 가격은 부가세 포함입니다." />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PLAN_CARDS.map((c) => (
            <article
              key={c.plan}
              data-testid={`plan-card-${c.plan}`}
              className={`flex flex-col rounded-2xl border bg-card p-6 shadow-sm ${
                c.plan === 1 ? "border-primary/50 shadow-[var(--shadow-glow)]" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-xl font-bold">{c.title}</h3>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary-glow">
                  {c.note}
                </span>
              </div>
              <div className="mt-5">
                {c.strikePrice != null && (
                  <div className="text-sm text-muted-foreground">
                    <s data-testid="strike-price">{num(c.strikePrice)}원</s>
                  </div>
                )}
                <div className="font-display text-3xl font-bold tracking-tight">
                  {num(c.showPrice)}
                  <span className="ml-0.5 text-lg font-semibold">원</span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{c.perReel}</div>
              </div>
              <div className="mt-6 flex-1" />
              <Link
                to="/reels/checkout"
                search={{ plan: c.plan }}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3 font-semibold text-primary-foreground transition hover:scale-[1.02]"
              >
                {c.cta} <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>
        <p className="mt-6 rounded-2xl border border-border bg-card px-5 py-4 text-sm leading-relaxed text-foreground/90">
          {TRIAL_CREDIT_NOTE}
          <span className="mt-1 block text-muted-foreground">
            첫 주문 할인과 체험 차감은 같은 가게(인스타 아이디 또는 휴대폰 번호 기준)에 한 번만
            적용되며, 결제 화면의 [금액 확인]에서 바로 보여 드립니다. 체험을 결제한 뒤 환불받으신
            경우에도 첫 주문 할인은 다시 적용되지 않고, 환불된 체험으로는 묶음 차감도 없습니다.
          </span>
        </p>
      </div>
    </section>
  );
}

function Steps() {
  return (
    <section className="px-4 py-14 md:py-20">
      <div className="mx-auto max-w-5xl">
        <SectionTitle eyebrow="Process" title="진행 순서" />
        <ol className="mt-8 grid gap-3 md:grid-cols-4">
          {REELS_STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="font-display text-sm font-semibold text-primary-glow">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="mt-2 font-display text-lg font-bold">{s.title}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section className="px-4 pb-4">
      <div className="mx-auto max-w-5xl rounded-2xl border border-border bg-card p-6 shadow-sm md:flex md:items-center md:justify-between md:gap-6 md:p-8">
        <div className="flex items-start gap-3">
          <MessageSquareText aria-hidden className="mt-1 h-5 w-5 shrink-0 text-primary-glow" />
          <div>
            <h2 className="font-display text-lg font-bold">궁금한 점이 있으세요?</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              이메일 {SELLER.email} 로 물어봐 주세요. 카카오톡 채널은 준비 중입니다.
            </p>
          </div>
        </div>
        <div className="mt-4 md:mt-0">
          <KakaoChannelPlaceholder className="w-full md:w-auto" />
        </div>
      </div>
    </section>
  );
}
