// /partner/dashboard — 파트너 로그인 대시보드(휴대폰 우선). 로그인 안 했으면 /login?next=/partner/dashboard.
// 자료: /api/partner/dashboard (Bearer 세션 토큰 → 서버가 partners.user_id 확인). 계좌는 끝 4자리만 온다.
// 계좌 변경은 비밀번호를 다시 확인하고, 바뀌면 대표님 카톡이 간다. 이미 만든 정산은 만들 때 계좌로 보낸다.
// 🚨 head 에는 title·robots(noindex)만. canonical 넣지 마라(비공개 화면).
// 🚨 beforeLoad 로 로그인 확인하지 마라 — 세션은 브라우저(localStorage)에만 있다(useAdminGate 와 같은 이유).
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CopyRow } from "@/components/partner/CopyRow";
import { ReelsNav } from "@/components/reels/ReelsParts";
import { BANKS } from "@/lib/partner/bank";

export const Route = createFileRoute("/partner/dashboard")({
  component: PartnerDashboardPage,
  head: () => ({
    meta: [{ title: "파트너 대시보드 | 에이아이솔루션" }, { name: "robots", content: "noindex, nofollow" }],
  }),
});

type Period = "7d" | "30d" | "month";
type CStatus = "pending" | "payable" | "paid" | "cancelled";
type Dashboard = {
  name: string;
  code: string;
  status: "approved" | "paused";
  phone: string;
  email: string;
  channels: string;
  bank_name: string;
  bank_last4: string;
  bank_holder: string;
  account_changed_at: string | null;
  period: Period;
  visits: number;
  inquiries: number;
  paid_count: number;
  sum_pending: number;
  sum_payable: number;
  sum_paid: number;
  sum_reversed: number;
  commissions: {
    created_at: string;
    source: "reels" | "inquiry";
    base_amount: number;
    amount: number;
    status: CStatus;
    plan: number | null;
    is_reversal: boolean;
    paid_at: string | null;
  }[];
  months: {
    month: string;
    gross: number;
    income_tax: number;
    local_tax: number;
    withholding: number;
    net: number;
    status: "pending" | "paid";
    paid_at: string | null;
  }[];
};

const SITE = "https://ai-solution.co.kr";
const LOGIN = `/login?next=${encodeURIComponent("/partner/dashboard")}`;
const won = (v: number | null | undefined) => `${Number(v ?? 0).toLocaleString("ko-KR")}원`;
const day = (iso: string) => new Date(iso).toLocaleDateString("ko-KR");
const PERIODS: { id: Period; label: string }[] = [
  { id: "7d", label: "7일" },
  { id: "30d", label: "30일" },
  { id: "month", label: "이번 달" },
];
const C_LABEL: Record<CStatus, string> = { pending: "대기(환불 기간)", payable: "지급 가능", paid: "지급 완료", cancelled: "취소" };

async function token(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = await token();
  if (!t) throw new HttpError("로그인이 필요합니다.", 401, "login_required");
  const res = await fetch(path, {
    ...init,
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), authorization: `Bearer ${t}` },
  });
  const b = (await res.json().catch(() => ({}))) as { error?: string; reason?: string } & T;
  if (!res.ok) throw new HttpError(b.error ?? `HTTP ${res.status}`, res.status, b.reason);
  return b;
}

function PartnerDashboardPage() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) window.location.replace(LOGIN);
      else setReady(true);
    });
  }, []);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <ReelsNav />
      <main className="mx-auto max-w-2xl px-4 pb-20 pt-6">
        {ready ? (
          <DashboardLoader />
        ) : (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
      </main>
    </div>
  );
}

function DashboardLoader() {
  const [period, setPeriod] = useState<Period>("30d");
  const q = useQuery({
    queryKey: ["partner-dashboard", period],
    retry: false,
    placeholderData: (prev) => prev,
    queryFn: () => api<{ ok: true; me: Dashboard }>(`/api/partner/dashboard?period=${period}`).then((b) => b.me),
  });
  const err = q.error as HttpError | null;
  useEffect(() => {
    if (err?.status === 401) window.location.replace(LOGIN);
  }, [err]);

  if (q.isLoading && !q.data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (err && !q.data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground" data-testid="dashboard-error">
        <p>{err.message}</p>
        <button
          type="button"
          onClick={() => supabase.auth.signOut().then(() => window.location.replace(LOGIN))}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-4 text-sm"
        >
          <LogOut className="h-4 w-4" /> 다른 계정으로 로그인
        </button>
      </div>
    );
  }
  if (!q.data) return null;
  return <DashboardView me={q.data} period={period} setPeriod={setPeriod} loading={q.isFetching} />;
}

function DashboardView({
  me,
  period,
  setPeriod,
  loading,
}: {
  me: Dashboard;
  period: Period;
  setPeriod: (p: Period) => void;
  loading: boolean;
}) {
  const links = [
    { label: "쇼츠 제작 페이지", url: `${SITE}/reels?ref=${me.code}` },
    { label: "홈페이지", url: `${SITE}/?ref=${me.code}` },
  ];
  return (
    <div data-testid="partner-dashboard">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">파트너 대시보드</p>
          <h1 className="mt-1 font-display text-2xl font-bold">{me.name}님</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            내 코드 <span className="font-semibold text-foreground">{me.code}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => supabase.auth.signOut().then(() => window.location.replace("/"))}
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-sm hover:bg-muted"
        >
          <LogOut className="h-4 w-4" /> 로그아웃
        </button>
      </div>
      {me.status === "paused" && (
        <p className="mt-4 rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          지금은 파트너 활동이 잠시 멈춘 상태입니다. 새 결제에는 수수료가 쌓이지 않습니다. 이미 쌓인 금액은 그대로 정산됩니다.
        </p>
      )}

      <Section title="내 링크">
        <div className="space-y-2">
          {links.map((l) => (
            <CopyRow key={l.url} label={l.label} value={l.url} />
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          홍보할 때는 「광고」 또는 「에이아이솔루션 파트너 활동으로 수수료를 받습니다」를 글 첫머리에 꼭 적어 주세요.
        </p>
      </Section>

      <Section title="활동">
        <div className="flex gap-1.5" role="tablist" aria-label="기간">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={`min-h-10 flex-1 rounded-full border px-3 text-sm font-medium ${
                period === p.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className={`mt-3 grid grid-cols-3 gap-2 ${loading ? "opacity-60" : ""}`}>
          <Stat label="방문" value={`${me.visits.toLocaleString("ko-KR")}명`} />
          <Stat label="상담 접수" value={`${me.inquiries.toLocaleString("ko-KR")}건`} />
          <Stat label="결제" value={`${me.paid_count.toLocaleString("ko-KR")}건`} />
        </div>
      </Section>

      <Commissions me={me} />

      <Section title="월별 정산">
        {me.months.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 정산 내역이 없습니다. 매월 1일에 지난달 지급 가능 금액으로 정산이 만들어집니다.</p>
        ) : (
          <ul className="space-y-2">
            {me.months.map((m) => (
              <li key={m.month} className="rounded-2xl border border-border bg-card p-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{m.month.replace("-", "년 ")}월</span>
                  <span className={m.status === "paid" ? "text-emerald-700" : "text-amber-800"}>
                    {m.status === "paid" ? `지급 완료${m.paid_at ? ` · ${day(m.paid_at)}` : ""}` : "지급 준비 중"}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
                  <span>수수료 합계</span>
                  <span className="text-right text-foreground">{won(m.gross)}</span>
                  <span>원천징수 3.3%</span>
                  <span className="text-right text-foreground">−{won(m.withholding)}</span>
                  <span className="font-semibold text-foreground">실지급</span>
                  <span className="text-right font-semibold text-foreground">{won(m.net)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Profile me={me} />
      <Account me={me} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-lg font-bold">{value}</div>
    </div>
  );
}

type CFilter = "all" | "pending" | "payable" | "paid" | "reversal";
function Commissions({ me }: { me: Dashboard }) {
  const [f, setF] = useState<CFilter>("all");
  const list = me.commissions.filter((c) =>
    f === "all" ? true : f === "reversal" ? c.is_reversal : !c.is_reversal && c.status === f,
  );
  const chips: { id: CFilter; label: string }[] = [
    { id: "all", label: "전체" },
    { id: "pending", label: "대기" },
    { id: "payable", label: "지급 가능" },
    { id: "paid", label: "지급 완료" },
    { id: "reversal", label: "환불 차감" },
  ];
  return (
    <Section title="수수료">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Money label="대기(결제 뒤 7일)" value={won(me.sum_pending)} />
        <Money label="지급 가능(다음 정산)" value={won(me.sum_payable)} strong />
        <Money label="지급 완료(누적)" value={won(me.sum_paid)} />
        <Money label="환불 차감(누적)" value={won(me.sum_reversed)} />
      </div>
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setF(c.id)}
            aria-pressed={f === c.id}
            className={`min-h-9 shrink-0 rounded-full border px-3 text-sm ${
              f === c.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">해당하는 수수료가 없습니다.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card text-sm">
          {list.map((r, i) => (
            <li key={`${r.created_at}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="font-medium">
                  {r.is_reversal ? "환불·취소 차감 · " : ""}
                  {r.source === "reels" ? `쇼츠 ${r.plan ?? ""}편` : "상담 계약"} · {won(r.base_amount)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {day(r.created_at)} · {C_LABEL[r.status]}
                </div>
              </div>
              <div className={`shrink-0 font-semibold ${r.status === "cancelled" ? "text-muted-foreground line-through" : ""}`}>
                {won(r.amount)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Money({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-semibold ${strong ? "text-emerald-700" : ""}`}>{value}</div>
    </div>
  );
}

function fmtPhone(p: string) {
  const d = p.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : p;
}

function Profile({ me }: { me: Dashboard }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const [phone, setPhone] = useState(fmtPhone(me.phone));
  const [channels, setChannels] = useState(me.channels);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/partner/dashboard", { method: "POST", body: JSON.stringify({ action: "profile", phone, channels }) });
      setMsg({ ok: true, text: "저장했습니다." });
      setEdit(false);
      await qc.invalidateQueries({ queryKey: ["partner-dashboard"] });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="내 정보">
      <div className="rounded-2xl border border-border bg-card p-4 text-sm">
        {!edit ? (
          <>
            <dl className="space-y-2">
              <Row k="이름" v={me.name} />
              <Row k="휴대폰" v={fmtPhone(me.phone)} />
              <Row k="이메일" v={me.email} />
              <Row k="활동 채널" v={<span className="whitespace-pre-wrap break-all">{me.channels}</span>} />
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">이름·이메일을 바꾸려면 contact@ai-solution.co.kr 로 알려 주세요.</p>
            <button
              type="button"
              onClick={() => {
                setPhone(fmtPhone(me.phone));
                setChannels(me.channels);
                setEdit(true);
                setMsg(null);
              }}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-border px-4 font-semibold hover:bg-muted"
            >
              휴대폰·활동 채널 수정
            </button>
          </>
        ) : (
          <form onSubmit={save} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-muted-foreground">휴대폰</span>
              <input
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                className="w-full rounded-xl border border-input bg-card px-3 py-3 text-base"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-muted-foreground">활동 채널(블로그·인스타 주소 등)</span>
              <textarea
                value={channels}
                onChange={(e) => setChannels(e.target.value)}
                rows={3}
                maxLength={1000}
                className="w-full rounded-xl border border-input bg-card px-3 py-3 text-base"
              />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEdit(false)} className="min-h-11 flex-1 rounded-2xl border border-border px-4">
                취소
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-11 flex-1 rounded-2xl bg-gradient-to-br from-primary to-primary-glow px-4 font-semibold text-primary-foreground disabled:opacity-50"
              >
                저장
              </button>
            </div>
          </form>
        )}
        {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
      </div>
    </Section>
  );
}

const OTHER = "__other__";
function Account({ me }: { me: Dashboard }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [bank, setBank] = useState(BANKS[0].name);
  const [otherBank, setOtherBank] = useState("");
  const [account, setAccount] = useState("");
  const [holder, setHolder] = useState(me.bank_holder);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const bankName = bank === OTHER ? otherBank.trim() : bank;
  const digits = account.replace(/\D/g, "");
  const canSave = !!bankName && digits.length >= 6 && /^[0-9\-\s]+$/.test(account) && holder.trim().length > 0 && pw.length > 0 && !busy;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ bank_name: string; bank_last4: string }>("/api/partner/dashboard", {
        method: "POST",
        body: JSON.stringify({ action: "account", bank_name: bankName, bank_account: account, bank_holder: holder, password: pw }),
      });
      setMsg({ ok: true, text: `정산 계좌를 ${r.bank_name} ****${r.bank_last4} 로 바꿨습니다. 다음 정산부터 이 계좌로 보내 드립니다.` });
      setOpen(false);
      setAccount("");
      setPw("");
      await qc.invalidateQueries({ queryKey: ["partner-dashboard"] });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="정산 계좌">
      <div className="rounded-2xl border border-border bg-card p-4 text-sm" data-testid="account-box">
        <dl className="space-y-2">
          <Row k="은행" v={me.bank_name} />
          <Row k="계좌" v={`****${me.bank_last4}`} />
          <Row k="예금주" v={me.bank_holder} />
        </dl>
        {me.account_changed_at && <p className="mt-2 text-xs text-muted-foreground">마지막 변경: {day(me.account_changed_at)}</p>}
        {!open ? (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setMsg(null);
            }}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-border px-4 font-semibold hover:bg-muted"
          >
            계좌 변경
          </button>
        ) : (
          <form onSubmit={save} className="mt-4 space-y-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              바꾸면 대표님께 바로 알림이 갑니다. 이미 만들어진 정산은 그때 계좌로 보내고, 다음 정산부터 새 계좌로 보냅니다.
            </p>
            <label className="block">
              <span className="mb-1 block text-muted-foreground">은행</span>
              <select
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                className="w-full rounded-xl border border-input bg-card px-3 py-3 text-base"
              >
                {BANKS.map((b) => (
                  <option key={b.code} value={b.name}>
                    {b.name}
                  </option>
                ))}
                <option value={OTHER}>그 밖의 은행(직접 입력)</option>
              </select>
            </label>
            {bank === OTHER && (
              <input
                aria-label="은행 이름"
                placeholder="은행 이름"
                value={otherBank}
                onChange={(e) => setOtherBank(e.target.value)}
                maxLength={30}
                className="w-full rounded-xl border border-input bg-card px-3 py-3 text-base"
              />
            )}
            <label className="block">
              <span className="mb-1 block text-muted-foreground">계좌번호(숫자만, - 는 있어도 됩니다)</span>
              <input
                inputMode="numeric"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                autoComplete="off"
                maxLength={40}
                className="w-full rounded-xl border border-input bg-card px-3 py-3 text-base"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-muted-foreground">예금주</span>
              <input
                value={holder}
                onChange={(e) => setHolder(e.target.value)}
                maxLength={30}
                className="w-full rounded-xl border border-input bg-card px-3 py-3 text-base"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-muted-foreground">비밀번호 다시 확인</span>
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-xl border border-input bg-card px-3 py-3 text-base"
              />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpen(false)} className="min-h-11 flex-1 rounded-2xl border border-border px-4">
                취소
              </button>
              <button
                type="submit"
                disabled={!canSave}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br from-primary to-primary-glow px-4 font-semibold text-primary-foreground disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} 계좌 바꾸기
              </button>
            </div>
          </form>
        )}
        {msg && (
          <p role="status" className={`mt-3 text-sm ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </Section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-muted-foreground">{k}</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </div>
  );
}
