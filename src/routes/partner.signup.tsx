// /partner/signup?k=<view_key> — 파트너 계정 만들기(승인 메일·계정 안내 메일의 링크로 들어온다).
// 신청 때 이메일을 고정으로 보여 주고 비밀번호만 정한다. 계정은 서버(/api/partner/signup)가 만들고(인증 메일 없음) 파트너와 잇는다.
// 이미 사이트 계정이 있는 이메일이면 → 그 계정으로 로그인한 뒤 「지금 로그인한 계정과 연결」.
// 🚨 head 에는 title·robots(noindex)만. canonical 넣지 마라(비공개 화면).
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ReelsNav } from "@/components/reels/ReelsParts";

export const Route = createFileRoute("/partner/signup")({
  validateSearch: (s: Record<string, unknown>): { k: string } => ({ k: typeof s.k === "string" ? s.k : "" }),
  component: PartnerSignupPage,
  head: () => ({
    meta: [{ title: "파트너 계정 만들기 | 에이아이솔루션" }, { name: "robots", content: "noindex, nofollow" }],
  }),
});

type Info = { name: string; email: string; has_account: boolean; status: "approved" | "paused" };
const KEY_RE = /^[0-9a-f]{64}$/;
const DASHBOARD = "/partner/dashboard";
const LOGIN_TO_DASHBOARD = `/login?next=${encodeURIComponent(DASHBOARD)}`;

function PartnerSignupPage() {
  const { k } = Route.useSearch();
  const q = useQuery({
    queryKey: ["partner-signup", k],
    enabled: KEY_RE.test(k),
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/partner/signup?k=${encodeURIComponent(k)}`);
      const b = (await res.json().catch(() => ({}))) as Partial<Info> & { ok?: boolean; error?: string };
      if (!res.ok || !b.ok) throw new Error(b.error ?? "링크가 올바르지 않습니다.");
      return b as Info;
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ReelsNav />
      <main className="mx-auto max-w-md px-4 pb-16 pt-8" data-testid="partner-signup">
        <p className="text-sm text-muted-foreground">에이아이솔루션 파트너</p>
        <h1 className="mt-1 font-display text-2xl font-bold">파트너 계정 만들기</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          계정을 만들면 이메일·비밀번호로 로그인해서 수수료·정산을 보고, 정산 계좌와 연락처를 직접 바꿀 수 있습니다.
        </p>
        <div className="mt-6">
          {!KEY_RE.test(k) ? (
            <Notice text="링크가 올바르지 않습니다. 받으신 메일의 링크 전체를 다시 열어 주세요." />
          ) : q.isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : q.error ? (
            <Notice text={(q.error as Error).message} />
          ) : q.data?.has_account ? (
            <HasAccount email={q.data.email} />
          ) : q.data ? (
            <SignupForm k={k} info={q.data} />
          ) : null}
        </div>
      </main>
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function HasAccount({ email }: { email: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5" data-testid="has-account">
      <p className="font-semibold">이미 파트너 계정이 있어요</p>
      <p className="mt-1 text-sm text-muted-foreground">{email} 로 로그인해 주세요.</p>
      <a
        href={LOGIN_TO_DASHBOARD}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow px-4 text-base font-semibold text-primary-foreground"
      >
        로그인하기
      </a>
    </div>
  );
}

function SignupForm({ k, info }: { k: string; info: Info }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ reason: string; text: string } | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessionEmail(data.session?.user.email?.toLowerCase() ?? null));
  }, []);

  const tooShort = pw.length > 0 && pw.length < 8;
  const mismatch = pw2.length > 0 && pw !== pw2;
  const canSubmit = pw.length >= 8 && pw.length <= 72 && pw === pw2 && !busy;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/partner/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ k, password: pw }),
      });
      const b = (await res.json().catch(() => ({}))) as { ok?: boolean; email?: string; reason?: string; error?: string };
      if (!res.ok || !b.ok) {
        setErr({ reason: b.reason ?? "server", text: b.error ?? "잠시 뒤 다시 시도해 주세요." });
        return;
      }
      // 계정이 만들어졌다 → 바로 로그인
      const { error } = await supabase.auth.signInWithPassword({ email: b.email ?? info.email, password: pw });
      if (error) {
        window.location.replace(LOGIN_TO_DASHBOARD);
        return;
      }
      window.location.replace(DASHBOARD);
    } catch {
      setErr({ reason: "server", text: "잠시 뒤 다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  }

  async function linkCurrent() {
    setBusy(true);
    setErr(null);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/partner/signup", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ k, mode: "link" }),
      });
      const b = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string; error?: string };
      if (!res.ok || !b.ok) {
        setErr({ reason: b.reason ?? "server", text: b.error ?? "잠시 뒤 다시 시도해 주세요." });
        return;
      }
      window.location.replace(DASHBOARD);
    } finally {
      setBusy(false);
    }
  }

  const sameEmailLoggedIn = sessionEmail !== null && sessionEmail === info.email.toLowerCase();
  const backHere = `/login?next=${encodeURIComponent(`/partner/signup?k=${k}`)}`;

  return (
    <div className="space-y-4">
      {info.status === "paused" && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          지금은 파트너 활동이 잠시 멈춘 상태입니다. 계정은 만들 수 있고, 이미 쌓인 금액은 그대로 정산됩니다.
        </p>
      )}

      {sameEmailLoggedIn && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm">
            지금 <b className="font-semibold">{sessionEmail}</b> 로 로그인되어 있어요. 이 계정을 파트너 계정으로 쓸 수 있습니다.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={linkCurrent}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow px-4 text-base font-semibold text-primary-foreground disabled:opacity-50"
          >
            지금 로그인한 계정과 연결
          </button>
        </div>
      )}

      <form onSubmit={create} className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <span className="mb-1.5 block text-sm text-muted-foreground">이름</span>
          <p className="font-semibold">{info.name}님</p>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm text-muted-foreground">이메일(신청 때 적은 주소 — 바꿀 수 없어요)</span>
          <input
            type="email"
            value={info.email}
            readOnly
            aria-readonly="true"
            autoComplete="username"
            className="w-full rounded-2xl border border-border bg-muted px-4 py-3 text-base text-foreground"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-muted-foreground">비밀번호(8자 이상)</span>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
            className="w-full rounded-2xl border border-border bg-surface/40 px-4 py-3 text-base text-foreground outline-none focus:border-primary-glow"
          />
          {tooShort && <span className="mt-1 block text-xs text-rose-700">8자 이상으로 정해 주세요.</span>}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-muted-foreground">비밀번호 한 번 더</span>
          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            autoComplete="new-password"
            maxLength={72}
            required
            className="w-full rounded-2xl border border-border bg-surface/40 px-4 py-3 text-base text-foreground outline-none focus:border-primary-glow"
          />
          {mismatch && <span className="mt-1 block text-xs text-rose-700">두 비밀번호가 다릅니다.</span>}
        </label>
        {err && (
          <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {err.text}
            {(err.reason === "email_exists" || err.reason === "has_account") && !sameEmailLoggedIn && (
              <a href={err.reason === "has_account" ? LOGIN_TO_DASHBOARD : backHere} className="mt-2 block font-semibold underline">
                로그인하기
              </a>
            )}
          </div>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-primary-glow px-4 text-base font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} 계정 만들고 로그인
        </button>
        <p className="text-center text-sm text-muted-foreground">
          이미 계정을 만드셨나요?{" "}
          <a href={LOGIN_TO_DASHBOARD} className="text-primary underline underline-offset-2">
            로그인
          </a>
        </p>
      </form>
    </div>
  );
}
