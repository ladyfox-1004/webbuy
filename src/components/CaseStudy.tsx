// 실제 납품 사례 블록. 데이터는 src/lib/solutions.ts 의 caseStudy 에 있다.
// 🚨 고객사는 익명이다. 실제 대시보드 스크린샷·상품 사진·상품명을 넣지 마라.
//    화면 예시는 아래 DashboardMockup 처럼 코드로 그린 도식만 쓴다(글자 대신 회색 막대).
// 홈 대표 카드(CaseStudyFeatureCard)와 /solutions/automation 사례 블록(CaseStudySection)이 같이 쓴다.

import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  DownloadCloud,
  Info,
  RefreshCw,
  ShieldCheck,
  Store,
  UserCheck,
  Wand2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CaseStudy, CaseStudyStep, CaseStudyStepIcon } from "@/lib/solutions";

const stepIcons: Record<CaseStudyStepIcon, LucideIcon> = {
  collect: DownloadCloud,
  process: Wand2,
  approve: UserCheck,
  publish: Store,
  sync: RefreshCw,
};

// ── 단계 다이어그램 ─────────────────────────────────────────────
// 넓은 화면은 가로 5칸, 좁은 화면은 세로로 쌓고 칸 사이에 화살표를 둔다.
function StepFlow({ steps }: { steps: CaseStudyStep[] }) {
  return (
    <ol className="grid grid-cols-1 gap-3 lg:grid-cols-5 lg:gap-4">
      {steps.map((step, i) => {
        const Icon = stepIcons[step.icon];
        const isLast = i === steps.length - 1;
        return (
          <li key={step.label} className="relative flex flex-col">
            <div
              className={
                step.human
                  ? "flex h-full flex-col rounded-2xl border border-amber-300/60 bg-amber-300/10 p-5"
                  : "flex h-full flex-col rounded-2xl border border-border bg-surface/60 p-5"
              }
            >
              <div className="flex items-center gap-3">
                <span
                  className={
                    step.human
                      ? "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-300/90 text-slate-900"
                      : "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground"
                  }
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div
                    className={
                      step.human
                        ? "text-[11px] font-medium text-amber-200"
                        : "text-[11px] font-medium text-primary-glow"
                    }
                  >
                    {String(i + 1).padStart(2, "0")} · {step.label}
                    {step.human ? " · 사람" : " · 자동"}
                  </div>
                  <h4 className="font-display text-base leading-snug font-semibold break-keep text-foreground">
                    {step.title}
                  </h4>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed break-keep text-muted-foreground">
                {step.body}
              </p>
            </div>
            {!isLast && (
              <>
                {/* 좁은 화면: 아래로 */}
                <div className="flex justify-center py-1 lg:hidden" aria-hidden>
                  <ArrowRight className="h-4 w-4 rotate-90 text-primary-glow/70" />
                </div>
                {/* 넓은 화면: 오른쪽으로 */}
                <div
                  className="absolute top-1/2 -right-3.5 z-10 hidden -translate-y-1/2 lg:block"
                  aria-hidden
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full border border-border bg-background">
                    <ArrowRight className="h-3.5 w-3.5 text-primary-glow" />
                  </span>
                </div>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ── 승인 화면 도식 ──────────────────────────────────────────────
// 실제 화면이 아니다. 상품명·사진 자리는 회색 막대와 빈 상자로만 그린다.
function DashboardMockup() {
  const rows = [
    { kind: "단품", w: "w-3/5" },
    { kind: "색상 묶음", w: "w-1/2", bundle: true },
    { kind: "단품", w: "w-2/3" },
  ];
  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl"
      role="img"
      aria-label="승인 대시보드 구성 예시 도식(실제 화면 아님)"
    >
      {/* 창 상단 */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="ml-2 text-[11px] font-medium text-slate-500">승인 대기</span>
        <span className="ml-auto rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-500">
          구성 예시
        </span>
      </div>

      <div className="space-y-2.5 p-4">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 p-2.5">
            {/* 사진 자리 */}
            {r.bundle ? (
              <div className="grid h-12 w-12 shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-lg">
                <span className="bg-slate-300" />
                <span className="bg-slate-200" />
                <span className="bg-slate-200" />
                <span className="bg-slate-300" />
              </div>
            ) : (
              <div className="h-12 w-12 shrink-0 rounded-lg bg-slate-200" />
            )}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className={`h-2.5 rounded-full bg-slate-300 ${r.w}`} />
              <div className="flex flex-wrap gap-1">
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] leading-none text-primary">
                  {r.kind}
                </span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] leading-none text-slate-500">
                  시즌 판정
                </span>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] leading-none text-emerald-700">
                  <Check className="h-2.5 w-2.5" /> 검수 통과
                </span>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-gradient-to-br from-primary to-primary-glow px-2.5 py-1 text-[11px] font-medium text-primary-foreground">
              승인
            </span>
          </div>
        ))}

        {/* 재고·가격 요약 줄 */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-xl bg-slate-50 p-2.5">
            <div className="text-[10px] text-slate-500">오늘 재고</div>
            <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-slate-700">
              <RefreshCw className="h-3 w-3 text-primary" /> 품절·재입고 반영
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <div className="text-[10px] text-slate-500">판매가</div>
            <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-slate-700">
              <Info className="h-3 w-3 text-primary" /> 변동 알림
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── /solutions/automation 사례 블록 ──────────────────────────────
export function CaseStudySection({ caseStudy }: { caseStudy: CaseStudy }) {
  return (
    // scroll-mt: 고정 헤더에 제목이 가리지 않게 한다(홈 카드가 #case 로 보낸다)
    <section id={caseStudy.anchor} className="scroll-mt-24 px-4 pb-20 break-keep md:pb-24">
      <div className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-surface/40 p-5 sm:p-8 md:p-10">
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />

          {/* 제목 */}
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-3 py-1 text-xs font-semibold text-primary-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" /> 실제 납품 사례
              </span>
              <span className="rounded-full border border-border bg-background/50 px-3 py-1 text-xs text-muted-foreground">
                {caseStudy.industry}
              </span>
            </div>
            <h2 className="mt-4 font-display text-2xl leading-tight font-bold tracking-tight md:text-4xl">
              {caseStudy.title}
            </h2>
            <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">
              {caseStudy.summary}
            </p>
          </div>

          {/* 문제 + 도식 */}
          <div className="relative mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-10">
            <div>
              <h3 className="font-display text-lg font-semibold text-foreground md:text-xl">
                사람이 하던 일
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {caseStudy.problemBody}
              </p>
              <ul className="mt-4 space-y-2">
                {caseStudy.problemItems.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 rounded-xl border border-border bg-background/40 px-3 py-2.5 text-sm text-foreground/90"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col justify-center">
              <DashboardMockup />
              <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{caseStudy.note}</span>
              </p>
            </div>
          </div>

          {/* 자동화 흐름 */}
          <div className="relative mt-12">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h3 className="font-display text-lg font-semibold text-foreground md:text-xl">
                자동화 흐름
              </h3>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-br from-primary to-primary-glow" />
                  서버 자동
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-300/90" />
                  사람 판단
                </span>
              </div>
            </div>
            <div className="mt-5">
              <StepFlow steps={caseStudy.steps} />
            </div>
          </div>

          {/* 사람이 하는 일 + 결과 */}
          <div className="relative mt-12 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-amber-300/40 bg-amber-300/5 p-5 sm:p-6">
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-foreground">
                <UserCheck className="h-5 w-5 text-amber-200" /> 사람이 하는 일은 판단만
              </h3>
              <ul className="mt-4 space-y-2">
                {caseStudy.humanItems.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-foreground/90">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                {caseStudy.humanNote}
              </p>
            </div>

            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-6">
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-foreground">
                <CheckCircle2 className="h-5 w-5 text-primary-glow" /> 바뀐 점
              </h3>
              <ul className="mt-4 space-y-2">
                {caseStudy.results.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-foreground/90">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-glow" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 무인 운영 장치 + 연동 */}
          <div className="relative mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary-glow" /> 사람 없이 돌게 하는 장치
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {caseStudy.safeguards.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-border bg-background/50 px-2.5 py-1 text-[11px] leading-none text-foreground/80"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">연동한 서비스</div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {caseStudy.integrations.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-border bg-background/50 px-2.5 py-1 text-[11px] leading-none text-foreground/80"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 홈 대표 카드 ────────────────────────────────────────────────
// 랜딩 썸네일 카드들과 구분되는 "운영 시스템 사례" 카드. 누르면 사례 위치로 바로 간다.
export function CaseStudyFeatureCard({ caseStudy }: { caseStudy: CaseStudy }) {
  return (
    <Link
      to="/solutions/automation"
      hash={caseStudy.anchor}
      className="glow-hover group relative mb-5 block overflow-hidden break-keep rounded-3xl border border-primary/30 bg-surface/60 p-6 transition hover:border-primary/60 sm:p-8"
    >
      <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-primary/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-primary-glow/15 blur-3xl" />

      <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-10">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-3 py-1 text-xs font-semibold text-primary-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" /> 운영 시스템 사례
            </span>
            <span className="rounded-full border border-border bg-background/50 px-3 py-1 text-xs text-muted-foreground">
              {caseStudy.industry}
            </span>
          </div>
          <h3 className="mt-4 font-display text-2xl leading-tight font-bold tracking-tight md:text-3xl">
            {caseStudy.title}
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
            {caseStudy.summary}
          </p>
          <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2 text-sm font-medium text-primary-foreground">
            사례 자세히 보기
            <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </div>

        {/* 단계 요약: 좁은 화면은 세로, 넓은 화면은 2열 격자 */}
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {caseStudy.steps.map((step, i) => {
            const Icon = stepIcons[step.icon];
            return (
              <li
                key={step.label}
                className={
                  (step.human
                    ? "border-amber-300/50 bg-amber-300/10 "
                    : "border-border bg-background/50 ") +
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5" +
                  (i === caseStudy.steps.length - 1 ? " sm:col-span-2" : "")
                }
              >
                <span
                  className={
                    step.human
                      ? "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-300/90 text-slate-900"
                      : "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary-glow text-primary-foreground"
                  }
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] text-muted-foreground">
                    {String(i + 1).padStart(2, "0")} · {step.human ? "사람" : "자동"}
                  </div>
                  <div className="truncate text-sm font-medium text-foreground">{step.title}</div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Link>
  );
}
