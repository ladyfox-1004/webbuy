// /partner — 추천인(파트너) 모집·신청(공개). 신청 → partners status 'applied' + 대표님 카톡.
// 주의: 이 라우트의 head 는 루트(__root.tsx)의 메타를 덮는다. title·description·og·canonical 을 이 페이지 것으로 쓴다.
// 주의: 규정·동의 문구는 src/lib/partner/terms.ts 한 곳에서만 고친다. 주민등록번호는 받지 않는다(안내 문구만).
// 서버: POST /api/partner/apply (src/routes/api/partner/apply.ts)
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { ReelsNav } from "@/components/reels/ReelsParts";
import { SiteFooter } from "@/components/SiteFooter";
import { checkWantedCode } from "@/lib/partner/ref";
import {
  PARTNER_CONSENTS,
  PARTNER_EXAMPLES,
  PARTNER_HIGHLIGHTS,
  PARTNER_SERVICES,
  type PartnerConsentKey,
} from "@/lib/partner/terms";

const CANONICAL = "https://ai-solution.co.kr/partner";
const TITLE = "파트너 모집 — 소개하고 결제 금액의 10% 받기 | 에이아이솔루션";
const DESCRIPTION =
  "에이아이솔루션의 쇼츠 제작·홈페이지·랜딩페이지·AI 개발을 소개해 주세요. 파트너 링크로 들어온 손님이 결제하면 결제 금액의 10%를 드립니다. 30일 기억, 월 1회 정산.";

export const Route = createFileRoute("/partner/")({
  component: PartnerPage,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
      { property: "og:image", content: "https://ai-solution.co.kr/og.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: "https://ai-solution.co.kr/og.png" },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
});

function PartnerPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <ReelsNav />
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <section className="pt-10 sm:pt-14">
          <p className="text-sm font-semibold text-primary-glow">파트너 모집</p>
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight sm:text-4xl">
            소개해 주시면,
            <br />
            결제 금액의 10%를 드립니다
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            사장님·마케터·크리에이터 누구나 신청할 수 있습니다. 승인되면 나만의 링크가 생기고, 그 링크로 들어온 손님이
            결제할 때마다 수수료가 쌓입니다.
          </p>
          <a
            href="#apply"
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 text-base font-semibold text-primary-foreground"
          >
            파트너 신청하기
          </a>
        </section>

        <section className="mt-10 grid gap-3 sm:grid-cols-3">
          {PARTNER_HIGHLIGHTS.map((h) => (
            <div key={h.title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-display text-lg font-bold">{h.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{h.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-bold">어떤 서비스를 소개하나요</h2>
          <ul className="mt-4 space-y-3">
            {PARTNER_SERVICES.map((s) => (
              <li key={s.name} className="rounded-2xl border border-border bg-card p-4">
                <div className="font-semibold">{s.name}</div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.rule}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-bold">이렇게 계산합니다</h2>
          <dl className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card">
            {PARTNER_EXAMPLES.map((e) => (
              <div key={e.label} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                <dt className="min-w-0 text-muted-foreground">{e.label}</dt>
                <dd className="shrink-0 font-semibold">{e.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            쇼츠 수수료는 결제 뒤 7일(환불 기간)이 지나면 지급 가능 금액이 됩니다. 정산 때 사업소득 3.3%(소득세 3% +
            지방소득세 0.3%)를 원천징수합니다. 예) 130,100원 → 소득세 3,903원 · 지방소득세 390원 · 실지급 125,807원.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            원천징수 신고를 위해 첫 지급 전에 주민등록번호를 따로 여쭙습니다. 이 화면에서는 받지 않습니다.
          </p>
        </section>

        <ApplyForm />
      </main>
      <SiteFooter />
    </div>
  );
}

type Form = {
  name: string;
  phone: string;
  email: string;
  code: string;
  channels: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
};
const EMPTY: Form = { name: "", phone: "", email: "", code: "", channels: "", bankName: "", bankAccount: "", bankHolder: "" };

function fieldErrors(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  if (!f.name.trim()) e.name = "이름을 적어 주세요.";
  if (!/^01[016789]\d{7,8}$/.test(f.phone.replace(/\D/g, ""))) e.phone = "휴대폰 번호를 확인해 주세요(예: 010-1234-5678).";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) e.email = "이메일을 확인해 주세요.";
  if (f.code.trim()) {
    const c = checkWantedCode(f.code);
    if (!c.ok)
      e.code = c.reason === "reserved" ? "쓸 수 없는 코드입니다. 다른 코드를 적어 주세요." : "영문 소문자·숫자 4~16자로 적어 주세요.";
  }
  if (!f.channels.trim()) e.channels = "홍보하실 채널 주소를 하나 이상 적어 주세요.";
  if (!f.bankName.trim()) e.bankName = "은행을 적어 주세요.";
  if (!/^[0-9-]{6,30}$/.test(f.bankAccount.replace(/\s/g, ""))) e.bankAccount = "계좌번호를 숫자로 적어 주세요.";
  if (!f.bankHolder.trim()) e.bankHolder = "예금주를 적어 주세요.";
  return e;
}

function ApplyForm() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [agree, setAgree] = useState<Record<PartnerConsentKey, boolean>>({
    agreeRules: false,
    agreeDisclosure: false,
    agreePrivacy: false,
  });
  const [honeypot, setHoneypot] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string } | null>(null);

  const errs = fieldErrors(form);
  const allAgreed = agree.agreeRules && agree.agreeDisclosure && agree.agreePrivacy;
  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setTouched(true);
    setError(null);
    if (Object.keys(errs).length) {
      setError("빨간 글씨로 표시된 칸을 확인해 주세요.");
      return;
    }
    if (!allAgreed) {
      setError("필수 동의 3개에 모두 체크해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/partner/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, ...agree, company_website: honeypot }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "신청을 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
      setDone({ code: body.code ?? "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "신청을 보내지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section id="apply" className="mt-12 rounded-3xl border border-emerald-600/30 bg-emerald-50 p-6 text-emerald-950" data-testid="partner-done">
        <div className="flex items-center gap-2 font-display text-xl font-bold">
          <Check className="h-6 w-6" /> 신청을 받았습니다
        </div>
        <p className="mt-3 text-sm leading-relaxed">
          확인 뒤 승인되면 적어 주신 연락처로 파트너 화면 링크를 보내 드립니다.
          {done.code && (
            <>
              {" "}
              신청하신 코드는 <b className="font-semibold">{done.code}</b> 입니다.
            </>
          )}
        </p>
        <Link to="/" className="mt-4 inline-block text-sm underline underline-offset-2">
          홈으로
        </Link>
      </section>
    );
  }

  const input =
    "block w-full min-h-[52px] rounded-xl border bg-card px-4 py-3 text-base text-foreground placeholder:text-muted-foreground/80 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15";
  const border = (k: keyof Form) => (touched && errs[k] ? "border-rose-600" : "border-input");
  const err = (k: keyof Form) =>
    touched && errs[k] ? <p className="mt-1.5 text-sm text-rose-700">{errs[k]}</p> : null;

  return (
    <section id="apply" className="mt-12 scroll-mt-6">
      <h2 className="font-display text-2xl font-bold">파트너 신청</h2>
      <p className="mt-2 text-sm text-muted-foreground">모든 칸은 정산과 연락에만 씁니다.</p>
      <form onSubmit={onSubmit} noValidate className="relative mt-6 space-y-5" data-testid="partner-form">
        <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
          <label htmlFor="partner-hp">회사 웹사이트</label>
          <input
            id="partner-hp"
            type="text"
            name="company_website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        <Field label="이름" htmlFor="p-name">
          <input id="p-name" className={`${input} ${border("name")}`} value={form.name} maxLength={50}
            autoComplete="name" onChange={(e) => set("name", e.target.value)} />
          {err("name")}
        </Field>
        <Field label="휴대폰" htmlFor="p-phone">
          <input id="p-phone" className={`${input} ${border("phone")}`} value={form.phone} inputMode="tel"
            autoComplete="tel" placeholder="010-1234-5678" maxLength={20} onChange={(e) => set("phone", e.target.value)} />
          {err("phone")}
        </Field>
        <Field label="이메일" htmlFor="p-email">
          <input id="p-email" type="email" className={`${input} ${border("email")}`} value={form.email}
            autoComplete="email" maxLength={254} onChange={(e) => set("email", e.target.value)} />
          {err("email")}
        </Field>
        <Field label="원하는 코드(선택)" htmlFor="p-code" hint="링크 끝에 붙는 이름입니다. 비워 두면 자동으로 만들어 드립니다. 예) ai-solution.co.kr/reels?ref=mycode">
          <input id="p-code" className={`${input} ${border("code")}`} value={form.code} maxLength={16}
            autoCapitalize="none" autoComplete="off" placeholder="영문 소문자·숫자 4~16자"
            onChange={(e) => set("code", e.target.value.toLowerCase())} />
          {err("code")}
        </Field>
        <Field label="활동 채널 주소" htmlFor="p-channels" hint="블로그·인스타그램·유튜브·카페 등 홍보하실 곳의 주소(여러 개면 줄을 바꿔 적어 주세요).">
          <textarea id="p-channels" rows={3} className={`${input} ${border("channels")}`} value={form.channels}
            maxLength={1000} onChange={(e) => set("channels", e.target.value)} />
          {err("channels")}
        </Field>
        <fieldset className="rounded-2xl border border-border bg-surface/60 p-4">
          <legend className="px-1 text-sm font-semibold">정산 계좌</legend>
          <div className="space-y-4">
            <Field label="은행" htmlFor="p-bank">
              <input id="p-bank" className={`${input} ${border("bankName")}`} value={form.bankName} maxLength={30}
                placeholder="예) 국민은행" onChange={(e) => set("bankName", e.target.value)} />
              {err("bankName")}
            </Field>
            <Field label="계좌번호" htmlFor="p-account">
              <input id="p-account" className={`${input} ${border("bankAccount")}`} value={form.bankAccount}
                inputMode="numeric" maxLength={40} onChange={(e) => set("bankAccount", e.target.value)} />
              {err("bankAccount")}
            </Field>
            <Field label="예금주" htmlFor="p-holder">
              <input id="p-holder" className={`${input} ${border("bankHolder")}`} value={form.bankHolder}
                maxLength={30} onChange={(e) => set("bankHolder", e.target.value)} />
              {err("bankHolder")}
            </Field>
          </div>
        </fieldset>

        <div className="space-y-2.5">
          {PARTNER_CONSENTS.map((c) => (
            <div key={c.key} className="rounded-2xl border border-border bg-card px-4 py-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  data-testid={`agree-${c.key}`}
                  checked={agree[c.key]}
                  onChange={(e) => setAgree((a) => ({ ...a, [c.key]: e.target.checked }))}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]"
                />
                <span className="text-sm font-medium leading-relaxed">{c.label}</span>
              </label>
              <details className="mt-2 pl-8">
                <summary className="cursor-pointer text-sm text-primary-glow underline underline-offset-2">전문 보기</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                  {c.body.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full min-h-14 items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-primary-glow px-5 text-lg font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy && <Loader2 className="h-5 w-5 animate-spin" />} 파트너 신청하기
        </button>
      </form>
    </section>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold">
        {label}
      </label>
      {hint && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}
