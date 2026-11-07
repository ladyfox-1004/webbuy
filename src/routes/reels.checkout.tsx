// /reels/checkout?plan=1|5|10 — 주문 정보 입력 → [금액 확인](reels-quote) → [결제하기](reels-checkout) → 페이앱 결제창.
// 주의: 금액은 서버가 정한다. 화면은 확인한 금액을 quoted_amount 로 되돌려 보낼 뿐이고, 입력이 바뀌면 확인한 금액은 무효다.
// 주의: 결제 준비가 안 됐으면(ready=false 또는 409 not_ready) 결제 단추를 막고 「결제 준비 중」으로 보여 준다.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { ReelsFooter, ReelsNav } from "@/components/reels/ReelsParts";
import {
  CONSENTS,
  LIST_PRICE,
  METHOD_DESC,
  METHOD_LABEL,
  NOT_READY_MESSAGE,
  PLAN_CARDS,
  REELS_PLANS,
  type ConsentKey,
  type ReelsMethod,
  type ReelsPlan,
} from "@/lib/reels/constants";
import { checkout, quote, type Quote } from "@/lib/reels/api";
import { attachReelsRef } from "@/lib/partner/client";
import {
  checkoutFieldErrors,
  normalizeInstaPreview,
  normalizePhonePreview,
  parsePlan,
  won,
  type CheckoutInput,
} from "@/lib/reels/format";

const CANONICAL = "https://ai-solution.co.kr/reels/checkout";
const TITLE = "쇼츠 제작 주문하기 | 에이아이솔루션";
const DESCRIPTION =
  "문의 댓글이 달리는 쇼츠 제작 주문 화면입니다. 상품을 고르고 가게 정보를 적은 뒤 금액을 확인하고 결제합니다.";

export const Route = createFileRoute("/reels/checkout")({
  validateSearch: (s: Record<string, unknown>): { plan: ReelsPlan } => ({ plan: parsePlan(s.plan) }),
  component: CheckoutPage,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex, follow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
});

type Quoted = { quote: Quote; ready: boolean };

const inputCls =
  "mt-1.5 block w-full rounded-xl border border-input bg-card px-4 py-3 text-base text-foreground outline-none transition placeholder:text-muted-foreground/80 focus:border-primary focus:ring-2 focus:ring-primary/25";

function CheckoutPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/reels/checkout" });
  const [plan, setPlanState] = useState<ReelsPlan>(search.plan);
  const [form, setForm] = useState<CheckoutInput>({ shopName: "", insta: "", phone: "", email: "" });
  const [method, setMethodState] = useState<ReelsMethod | null>(null);
  const [agree, setAgreeState] = useState<Record<ConsentKey, boolean>>({
    terms: false,
    privacy: false,
    payment: false,
  });
  const [touched, setTouched] = useState(false);
  const [quoted, setQuoted] = useState<Quoted | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [busy, setBusy] = useState<"quote" | "pay" | null>(null);

  const fieldErrors = checkoutFieldErrors(form);
  const fieldsOk = Object.keys(fieldErrors).length === 0;
  const allAgreed = agree.terms && agree.privacy && agree.payment;

  // 입력이 바뀌면 확인한 금액은 무효(가게가 바뀌면 할인도 바뀐다).
  function invalidate() {
    setQuoted(null);
    setNotice(null);
    setError(null);
    setNotReady(false);
  }
  function setField(k: keyof CheckoutInput, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    invalidate();
  }
  function setPlan(p: ReelsPlan) {
    setPlanState(p);
    invalidate();
    void navigate({ search: { plan: p }, replace: true });
  }

  async function onQuote() {
    setTouched(true);
    setError(null);
    setNotice(null);
    if (!fieldsOk) {
      setError("빨간 글씨로 표시된 칸을 확인해 주세요.");
      return;
    }
    setBusy("quote");
    const r = await quote({ plan, insta: form.insta.trim(), phone: form.phone.trim() });
    setBusy(null);
    if (!r.ok) {
      setQuoted(null);
      setError(r.error);
      return;
    }
    setQuoted({ quote: r.quote, ready: r.ready });
    setNotReady(!r.ready);
  }

  async function onPay() {
    if (!quoted || !method || !allAgreed || notReady) return;
    setBusy("pay");
    setError(null);
    setNotice(null);
    const r = await checkout({
      plan,
      shop_name: form.shopName.trim(),
      insta: form.insta.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      method,
      agree,
      quoted_amount: quoted.quote.amount,
    });
    if (r.ok) {
      // 추천인(파트너) 링크로 들어온 손님이면 이 주문에 코드를 붙인다(실패해도 결제는 그대로, 최대 1.5초).
      await attachReelsRef({ order_no: r.order_no, payurl: r.payurl, phone: form.phone.trim() });
      // 결제창으로 넘어간다. 이동하는 동안 단추는 계속 막아 둔다.
      window.location.href = r.payurl;
      return;
    }
    setBusy(null);
    if (r.reason === "not_ready") {
      setNotReady(true);
      return;
    }
    if (r.reason === "amount_changed" && r.quote) {
      setQuoted({ quote: r.quote, ready: true });
      setNotice("금액이 바뀌었습니다. 새 금액을 확인하시고 [결제하기]를 다시 눌러 주세요.");
      return;
    }
    setError(r.error);
  }

  const payBlockedHint = !quoted
    ? "먼저 [금액 확인]을 눌러 주세요."
    : !method
      ? "제작 방식을 골라 주세요."
      : !allAgreed
        ? "동의 3개에 모두 체크해 주세요."
        : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ReelsNav />
      <main className="mx-auto max-w-2xl px-4 pt-8 pb-4">
        <Link
          to="/reels"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" /> 쇼츠 제작 소개
        </Link>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight md:text-3xl">
          쇼츠 제작 주문하기
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          가격은 부가세 포함입니다. 첫 주문 할인·체험 차감은 [금액 확인]에서 바로 보여 드립니다.
        </p>

        <form
          className="mt-8 space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            void onQuote();
          }}
          noValidate
        >
          <fieldset>
            <legend className="font-display text-base font-semibold">1. 상품 고르기</legend>
            <p className="mt-1 text-sm text-muted-foreground">1편 = 30초 기준 쇼츠 한 편입니다.</p>
            <div className="mt-3 grid gap-2.5" role="radiogroup">
              {REELS_PLANS.map((p) => {
                const c = PLAN_CARDS.find((x) => x.plan === p)!;
                const on = plan === p;
                return (
                  <label
                    key={p}
                    data-testid={`plan-option-${p}`}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 transition ${
                      on ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="plan"
                      value={p}
                      checked={on}
                      onChange={() => setPlan(p)}
                      className="h-4 w-4 shrink-0 accent-[var(--primary)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{c.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {p === 1 ? c.note : `${c.perReel} · ${c.note}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-sm font-semibold">
                      정가 {won(LIST_PRICE[p])}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="font-display text-base font-semibold">2. 가게 정보</legend>
            <Field
              label="상호"
              error={touched ? fieldErrors.shopName : undefined}
              input={
                <input
                  className={inputCls}
                  value={form.shopName}
                  onChange={(e) => setField("shopName", e.target.value)}
                  placeholder="예: 서연네 꽃집"
                  autoComplete="organization"
                  maxLength={100}
                />
              }
            />
            <Field
              label="가게 인스타그램 아이디"
              hint={
                normalizeInstaPreview(form.insta)
                  ? `@${normalizeInstaPreview(form.insta)} 로 확인합니다.`
                  : "@ 없이 적거나 프로필 주소를 붙여 넣어도 됩니다."
              }
              error={touched ? fieldErrors.insta : undefined}
              input={
                <input
                  className={inputCls}
                  value={form.insta}
                  onChange={(e) => setField("insta", e.target.value)}
                  placeholder="예: myshop.seoul"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              }
            />
            <Field
              label="휴대폰 번호"
              hint={
                normalizePhonePreview(form.phone)
                  ? "결제 안내가 이 번호로 갑니다."
                  : "휴대폰 번호만 됩니다(결제 안내가 이 번호로 갑니다)."
              }
              error={touched ? fieldErrors.phone : undefined}
              input={
                <input
                  className={inputCls}
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  placeholder="010-1234-5678"
                  inputMode="tel"
                  autoComplete="tel"
                />
              }
            />
            <Field
              label="이메일"
              hint="결제가 끝나면 주문 화면 링크를 이 주소로 보내 드립니다."
              error={touched ? fieldErrors.email : undefined}
              input={
                <input
                  className={inputCls}
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="shop@example.com"
                  inputMode="email"
                  autoComplete="email"
                  type="email"
                />
              }
            />
          </fieldset>

          <fieldset>
            <legend className="font-display text-base font-semibold">3. 제작 방식</legend>
            <div className="mt-3 grid gap-2.5">
              {(["send_materials", "ai_only"] as const).map((m, i) => {
                const on = method === m;
                return (
                  <label
                    key={m}
                    data-testid={`method-${m}`}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3.5 transition ${
                      on ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="method"
                      value={m}
                      checked={on}
                      onChange={() => setMethodState(m)}
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]"
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {i === 0 ? "①" : "②"} {METHOD_LABEL[m]}
                      </span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
                        {METHOD_DESC[m]}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-display text-base font-semibold">4. 동의</legend>
            <div className="mt-3 space-y-2.5">
              {CONSENTS.map((c) => (
                <div key={c.key} className="rounded-2xl border border-border bg-card px-4 py-3">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      data-testid={`agree-${c.key}`}
                      checked={agree[c.key]}
                      onChange={(e) => setAgreeState((a) => ({ ...a, [c.key]: e.target.checked }))}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]"
                    />
                    <span className="text-sm leading-relaxed font-medium">{c.label}</span>
                  </label>
                  <details className="mt-2 pl-8">
                    <summary className="cursor-pointer text-sm text-primary-glow underline underline-offset-2">
                      전문 보기
                    </summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                      {c.body.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              ))}
            </div>
          </fieldset>

          <section
            aria-live="polite"
            className="rounded-2xl border border-border bg-surface/70 p-5"
            data-testid="quote-box"
          >
            <h2 className="font-display text-base font-semibold">5. 금액 확인</h2>
            {quoted ? (
              <QuoteView q={quoted.quote} />
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                가게 정보를 적고 [금액 확인]을 누르면, 이 가게의 주문 기록을 보고 결제 금액을 알려
                드립니다.
              </p>
            )}
            {notice && (
              <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {notice}
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 rounded-xl border border-rose-500/40 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {error}
              </p>
            )}
            {notReady && (
              <p
                data-testid="not-ready"
                className="mt-3 rounded-xl border border-border bg-card px-3 py-2 text-sm leading-relaxed text-foreground/90"
              >
                {NOT_READY_MESSAGE}
              </p>
            )}

            <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
              <button
                type="submit"
                disabled={busy !== null}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-primary bg-card px-6 py-3 font-semibold text-primary-glow transition hover:bg-primary/5 disabled:opacity-60"
              >
                {busy === "quote" && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
                {quoted ? "금액 다시 확인" : "금액 확인"}
              </button>
              <button
                type="button"
                data-testid="pay-button"
                onClick={() => void onPay()}
                disabled={!quoted || !method || !allAgreed || notReady || busy !== null}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3 font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition disabled:cursor-not-allowed disabled:from-muted-foreground disabled:to-muted-foreground disabled:shadow-none"
              >
                {busy === "pay" ? (
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock aria-hidden className="h-4 w-4" />
                )}
                {notReady ? "결제 준비 중" : quoted ? `${won(quoted.quote.amount)} 결제하기` : "결제하기"}
              </button>
            </div>
            {!notReady && payBlockedHint && (
              <p className="mt-2 text-center text-xs text-muted-foreground">{payBlockedHint}</p>
            )}
          </section>
        </form>
      </main>
      <ReelsFooter />
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  input,
}: {
  label: string;
  hint?: string;
  error?: string;
  input: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {input}
      {error ? (
        <span className="mt-1 block text-sm text-rose-700">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

function QuoteView({ q }: { q: Quote }) {
  const discounted = q.discount > 0;
  return (
    <dl className="mt-3 space-y-2 text-sm" data-testid="quote-view">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted-foreground">상품</dt>
        <dd className="font-medium">문의 댓글 쇼츠 {q.plan}편(30초 기준)</dd>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted-foreground">정가</dt>
        <dd>{discounted ? <s data-testid="quote-strike">{won(q.list_price)}</s> : won(q.list_price)}</dd>
      </div>
      {discounted && (
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">
            할인{q.reasons.length ? ` (${q.reasons.join(", ")})` : ""}
          </dt>
          <dd className="font-medium text-primary-glow">-{won(q.discount)}</dd>
        </div>
      )}
      <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
        <dt className="font-semibold">결제 금액</dt>
        <dd className="font-display text-2xl font-bold" data-testid="quote-amount">
          {won(q.amount)}
        </dd>
      </div>
    </dl>
  );
}
