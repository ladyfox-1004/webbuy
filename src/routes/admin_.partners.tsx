// /admin/partners — 추천인(파트너) 관리(관리자 전용). 휴대폰에서 신청 승인·상담 계약 「결제됨」·월 정산·지급 완료.
// 🚨 파일 이름이 admin_.partners 인 이유는 admin_.blog.tsx 머리 주석과 같다(/admin 에 <Outlet/> 이 없다).
// 🚨 beforeLoad 로 관리자 확인하지 마라 — useAdminGate(화면이 뜬 뒤 확인). 실제 보호는 서버 checkAdmin.
// 🚨 head 에는 title·robots 만. canonical 넣지 마라.
// 🚨 확인은 window.confirm 대신 화면 안 확인 상자.
// 승인하면 서버가 바로 안내 메일을 보낸다(실패해도 승인은 그대로 — 「메일 다시 보내기」·링크 복사로 보완).
// 지급 뒤 환불·계약 취소는 음수 「차감」 줄로 남고 다음 정산에서 빠진다(합계 0 이하면 정산 없이 이월).
// 자료: /api/admin/partners (src/routes/api/admin/partners.ts → public.partner_admin_overview 등)
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { adminFetch, useAdminGate } from "@/hooks/useAdminGate";
import { CopyRow } from "@/components/partner/CopyRow";
import { kstMonth, parseWon } from "@/lib/partner/admin";
import { commissionOf } from "@/lib/partner/ref";

export const Route = createFileRoute("/admin_/partners")({
  component: AdminPartnersPage,
  head: () => ({
    meta: [{ title: "파트너 — 에이아이솔루션 관리자" }, { name: "robots", content: "noindex" }],
  }),
});

type PStatus = "applied" | "approved" | "rejected" | "paused";
type CStatus = "pending" | "payable" | "paid" | "cancelled";
type Partner = {
  id: string;
  code: string;
  status: PStatus;
  name: string;
  phone: string;
  email: string;
  channels: string;
  bank_name: string;
  bank_account: string;
  bank_holder: string;
  created_at: string;
  approved_at: string | null;
  view_key: string | null;
  approval_mail_sent_at: string | null;
  approval_mail_error: string | null;
  visits_30d: number;
  inquiries: number;
  paid_count: number;
  sum_pending: number;
  sum_payable: number;
  sum_paid: number;
};
type RefInquiry = {
  id: string;
  created_at: string;
  name: string;
  services: string[];
  ref_code: string;
  partner_name: string | null;
  partner_status: PStatus | null;
  commission_id: string | null;
  base_amount: number | null;
  commission: number | null;
  commission_status: CStatus | null;
  reversed: boolean;
};
type Commission = {
  id: string;
  created_at: string;
  source: "reels" | "inquiry";
  base_amount: number;
  amount: number;
  status: CStatus;
  note: string | null;
  reversal_of: string | null;
  reversed: boolean;
  code: string;
  partner_name: string;
  order_no: string | null;
  plan: number | null;
  inquiry_name: string | null;
};
type Payout = {
  id: string;
  month: string;
  gross: number;
  income_tax: number;
  local_tax: number;
  withholding: number;
  net: number;
  status: "pending" | "paid";
  paid_at: string | null;
  code: string;
  partner_name: string;
  bank_name: string;
  bank_account: string;
  bank_holder: string;
  items: number;
};
type Overview = { partners: Partner[]; inquiries: RefInquiry[]; commissions: Commission[]; payouts: Payout[] };

const SITE = "https://ai-solution.co.kr";
const won = (v: number | null | undefined) => `${Number(v ?? 0).toLocaleString("ko-KR")}원`;
const P_LABEL: Record<PStatus, string> = { applied: "신청", approved: "승인", rejected: "거절", paused: "일시정지" };
const C_LABEL: Record<CStatus, string> = { pending: "대기(7일)", payable: "지급 가능", paid: "지급 완료", cancelled: "취소" };
const C_CLASS: Record<CStatus, string> = {
  pending: "border-amber-500/40 bg-amber-50 text-amber-900",
  payable: "border-sky-500/40 bg-sky-50 text-sky-800",
  paid: "border-emerald-500/40 bg-emerald-50 text-emerald-800",
  cancelled: "border-border bg-muted text-muted-foreground",
};

type Tab = "apply" | "partners" | "inquiries" | "ledger" | "payouts";
type Confirm = { title: string; body: string; label: string; run: () => Promise<void> };
type MailOutcome = { mail?: "sent" | "failed" | "skipped"; mail_error?: string | null };
type PostResult = MailOutcome & { error?: string; view_key?: string; partners?: number; carried?: number; reversed?: boolean };

const shortDate = (iso: string) => new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

function AdminPartnersPage() {
  const ok = useAdminGate();
  if (!ok) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  return <AdminPartners />;
}

function AdminPartners() {
  const q = useQuery({
    queryKey: ["admin-partners"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/partners");
      const body = (await res.json().catch(() => ({}))) as Overview & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body;
    },
  });
  return <AdminPartnersView data={q.data} loading={q.isLoading} error={q.error as Error | null} fetching={q.isFetching} refetch={() => void q.refetch()} />;
}

function AdminPartnersView({
  data,
  loading,
  error,
  fetching,
  refetch,
}: {
  data: Overview | undefined;
  loading: boolean;
  error: Error | null;
  fetching: boolean;
  refetch: () => void;
}) {
  const [tab, setTab] = useState<Tab>("apply");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [justApproved, setJustApproved] = useState<{ name: string; key: string; mail: MailOutcome } | null>(null);

  const partners = data?.partners ?? [];
  const applied = partners.filter((p) => p.status === "applied");
  const others = partners.filter((p) => p.status !== "applied");
  const month = kstMonth();

  async function post(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setResult(null);
    try {
      const res = await adminFetch("/api/admin/partners", { method: "POST", body: JSON.stringify(body) });
      const r = (await res.json().catch(() => ({}))) as PostResult;
      if (!res.ok) throw new Error(r.error ?? `HTTP ${res.status}`);
      let text = okText + (typeof r.partners === "number" ? ` (${r.partners}명)` : "");
      if (r.carried) text += ` · ${r.carried}명은 차감이 더 커서 다음 달로 넘김`;
      if (r.mail === "sent") text += " · 안내 메일 보냄";
      if (r.mail === "failed") text += ` · 안내 메일 실패: ${r.mail_error ?? ""}`;
      setResult({ kind: r.mail === "failed" ? "error" : "ok", text });
      return r;
    } catch (e) {
      setResult({ kind: "error", text: (e as Error).message });
      return null;
    } finally {
      setBusy(false);
      refetch();
    }
  }

  function ask(c: Confirm) {
    setConfirm(c);
  }

  /** 상담 계약 「결제 취소」: 지급 전이면 수수료 취소, 지급 뒤면 음수 차감 줄(다음 정산에서 빠짐) */
  function askContractCancel(commissionId: string, partnerName: string, amount: number, paid: boolean) {
    ask({
      title: "이 계약을 취소 처리할까요?",
      body: paid
        ? `${partnerName}님에게 이미 지급한 ${won(amount)}을 다음 정산에서 뺍니다(−${won(amount)} 차감 줄). 되돌릴 수 없습니다.`
        : `${partnerName}님 수수료 ${won(amount)}을 취소합니다. 정산에 묶여 있었다면 그 정산 금액도 다시 계산됩니다.`,
      label: "계약 취소",
      run: async () => {
        await post({ action: "cancel_commission", id: commissionId, note: "계약 취소" }, paid ? "계약 취소 — 다음 정산에서 차감" : "계약 취소");
      },
    });
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "apply", label: "신청", count: applied.length },
    { id: "partners", label: "파트너", count: others.length },
    { id: "inquiries", label: "추천 상담", count: data?.inquiries.length },
    { id: "ledger", label: "원장" },
    { id: "payouts", label: "정산" },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 pb-40 pt-8" data-testid="admin-partners">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> 관리자
          </Link>
          <h1 className="font-display text-2xl font-bold">파트너</h1>
        </div>
        <button
          type="button"
          onClick={refetch}
          disabled={fetching}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} /> 새로고침
        </button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        모집 화면: <a href="/partner" className="underline underline-offset-2">/partner</a> · 수수료 10%(체험 제외) · 쇼츠는 결제 7일 뒤 지급 가능
      </p>

      <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium ${
              tab === t.id ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
            }`}
          >
            {t.label}
            {typeof t.count === "number" && t.count > 0 ? ` ${t.count}` : ""}
          </button>
        ))}
      </div>

      {result && (
        <p
          role="status"
          className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
            result.kind === "ok" ? "border-emerald-500/40 bg-emerald-50 text-emerald-900" : "border-rose-500/40 bg-rose-50 text-rose-800"
          }`}
        >
          {result.text}
        </p>
      )}

      {justApproved && (
        <div className="mt-4 rounded-2xl border border-emerald-600/30 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">
            {justApproved.name}님 승인 —{" "}
            {justApproved.mail.mail === "sent"
              ? "안내 메일을 보냈습니다(코드·링크·내 화면 주소)."
              : `안내 메일을 못 보냈습니다${justApproved.mail.mail_error ? `(${justApproved.mail.mail_error})` : ""}. 아래 링크를 직접 보내 주세요.`}
          </p>
          <div className="mt-2">
            <CopyRow label="파트너 화면 링크" value={`${SITE}/partner/me?k=${justApproved.key}`} />
          </div>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
      {error && <p className="mt-6 rounded-xl border border-rose-500/40 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error.message}</p>}

      {data && tab === "apply" && (
        <section className="mt-4 space-y-3">
          {applied.length === 0 && <Empty text="새 신청이 없습니다." />}
          {applied.map((p) => (
            <article key={p.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-sm text-muted-foreground">
                    코드 {p.code} · {new Date(p.created_at).toLocaleDateString("ko-KR")}
                  </div>
                </div>
                <Badge text={P_LABEL[p.status]} />
              </div>
              <dl className="mt-3 space-y-1 text-sm">
                <Row k="휴대폰" v={p.phone} />
                <Row k="이메일" v={p.email} />
                <Row k="채널" v={<span className="whitespace-pre-wrap break-all">{p.channels}</span>} />
                <Row k="계좌" v={`${p.bank_name} ${p.bank_account} (${p.bank_holder})`} />
              </dl>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    ask({
                      title: `${p.name}님을 거절할까요?`,
                      body: "거절하면 이 코드로는 수수료가 쌓이지 않습니다. 나중에 다시 승인할 수 있습니다.",
                      label: "거절",
                      run: async () => {
                        await post({ action: "set_status", id: p.id, status: "rejected" }, `${p.name}님 거절`);
                      },
                    })
                  }
                  className="flex-1 rounded-2xl border border-border px-4 py-3 text-base disabled:opacity-50"
                >
                  거절
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    ask({
                      title: `${p.name}님을 승인할까요?`,
                      body: `승인하면 코드 「${p.code}」로 들어온 손님의 결제에 10% 수수료가 쌓이고, 파트너 화면 링크가 만들어집니다.`,
                      label: "승인",
                      run: async () => {
                        const r = await post({ action: "set_status", id: p.id, status: "approved" }, `${p.name}님 승인`);
                        if (r?.view_key) setJustApproved({ name: p.name, key: r.view_key, mail: r });
                      },
                    })
                  }
                  className="flex-1 rounded-2xl bg-gradient-to-br from-primary to-primary-glow px-4 py-3 text-base font-semibold text-primary-foreground disabled:opacity-50"
                >
                  승인
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {data && tab === "partners" && (
        <section className="mt-4 space-y-3">
          {others.length === 0 && <Empty text="아직 승인한 파트너가 없습니다." />}
          {others.map((p) => (
            <article key={p.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">
                    {p.name} <span className="font-normal text-muted-foreground">· {p.code}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    방문 {p.visits_30d}명(30일) · 상담 {p.inquiries} · 결제 {p.paid_count}
                  </div>
                </div>
                <Badge text={P_LABEL[p.status]} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <Mini label="대기" value={won(p.sum_pending)} />
                <Mini label="지급 가능" value={won(p.sum_payable)} />
                <Mini label="지급 완료" value={won(p.sum_paid)} />
              </div>
              {p.view_key && p.status !== "rejected" && (
                <div className="mt-3">
                  <CopyRow label="파트너 화면 링크" value={`${SITE}/partner/me?k=${p.view_key}`} />
                </div>
              )}
              {p.status === "approved" && <MailStatus p={p} />}
              <div className="mt-3 flex flex-wrap gap-2">
                {p.status === "approved" && (
                  <SmallButton
                    disabled={busy}
                    onClick={() =>
                      ask({
                        title: `${p.name}님에게 안내 메일을 다시 보낼까요?`,
                        body: `${p.email} 로 코드·전용 링크·파트너 화면 주소를 다시 보냅니다.`,
                        label: "보내기",
                        run: async () => {
                          await post({ action: "resend_approval_mail", id: p.id }, `${p.name}님 메일 다시 보내기`);
                        },
                      })
                    }
                    text="메일 다시 보내기"
                  />
                )}
                {p.status === "approved" && (
                  <SmallButton
                    disabled={busy}
                    onClick={() =>
                      ask({
                        title: `${p.name}님을 일시정지할까요?`,
                        body: "멈추는 동안 새 결제에는 수수료가 쌓이지 않습니다. 이미 쌓인 금액은 그대로 정산됩니다.",
                        label: "일시정지",
                        run: async () => {
                          await post({ action: "set_status", id: p.id, status: "paused" }, `${p.name}님 일시정지`);
                        },
                      })
                    }
                    text="일시정지"
                  />
                )}
                {(p.status === "paused" || p.status === "rejected") && (
                  <SmallButton
                    disabled={busy}
                    onClick={() =>
                      ask({
                        title: `${p.name}님을 다시 승인할까요?`,
                        body: "다시 승인하면 이 코드로 들어온 새 결제에 수수료가 쌓입니다.",
                        label: "승인",
                        run: async () => {
                          const r = await post({ action: "set_status", id: p.id, status: "approved" }, `${p.name}님 승인`);
                          if (r?.view_key) setJustApproved({ name: p.name, key: r.view_key, mail: r });
                        },
                      })
                    }
                    text="다시 승인"
                  />
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {data && tab === "inquiries" && (
        <section className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            파트너 링크로 들어와 상담을 남긴 손님입니다. 계약이 되어 결제가 확인되면 금액을 넣고 「결제됨」을 누르세요(10%가 바로 지급 가능으로 쌓입니다).
          </p>
          {data.inquiries.length === 0 && <Empty text="추천이 붙은 상담 접수가 없습니다." />}
          {data.inquiries.map((i) => {
            const raw = amounts[i.id] ?? "";
            const amt = parseWon(raw);
            return (
              <article key={i.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{i.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(i.created_at).toLocaleDateString("ko-KR")} · {i.services.join(", ") || "서비스 미선택"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      추천 {i.ref_code}
                      {i.partner_name ? ` (${i.partner_name}, ${P_LABEL[i.partner_status ?? "applied"]})` : " (없는 코드)"}
                    </div>
                  </div>
                  {i.commission_status && <CBadge s={i.commission_status} />}
                </div>
                {i.commission_id ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm">
                      계약 {won(i.base_amount)} → 수수료 <b>{won(i.commission)}</b>
                      {i.reversed && <span className="ml-1 text-amber-800">· 계약 취소됨(다음 정산에서 차감)</span>}
                    </p>
                    {!i.reversed && (
                      <SmallButton
                        disabled={busy}
                        text="계약 취소"
                        onClick={() => askContractCancel(i.commission_id as string, i.partner_name ?? "", i.commission ?? 0, i.commission_status === "paid")}
                      />
                    )}
                  </div>
                ) : i.partner_status === "approved" ? (
                  <div className="mt-3 flex gap-2">
                    <input
                      inputMode="numeric"
                      placeholder="계약 금액(원)"
                      aria-label={`${i.name} 계약 금액`}
                      value={raw}
                      onChange={(e) => setAmounts((a) => ({ ...a, [i.id]: e.target.value }))}
                      className="min-h-12 min-w-0 flex-1 rounded-xl border border-input bg-card px-3 text-base"
                    />
                    <button
                      type="button"
                      disabled={busy || amt === null || amt < 1000}
                      onClick={() =>
                        amt !== null &&
                        ask({
                          title: `${i.name} 상담을 「결제됨」으로 할까요?`,
                          body: `계약 금액 ${won(amt)} → 수수료 ${won(commissionOf(amt))}이 ${i.partner_name}님에게 지급 가능으로 쌓입니다.`,
                          label: "결제됨",
                          run: async () => {
                            const r = await post({ action: "inquiry_paid", inquiry_id: i.id, amount: amt }, `${i.name} 결제됨 처리`);
                            if (r) setAmounts((a) => ({ ...a, [i.id]: "" }));
                          },
                        })
                      }
                      className="shrink-0 rounded-xl bg-gradient-to-br from-primary to-primary-glow px-4 text-base font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      결제됨
                    </button>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">승인된 파트너가 아니라 수수료를 넣을 수 없습니다.</p>
                )}
                {amt !== null && amt >= 1000 && !i.commission_id && (
                  <p className="mt-1 text-xs text-muted-foreground">수수료 미리보기: {won(commissionOf(amt))}</p>
                )}
              </article>
            );
          })}
        </section>
      )}

      {data && tab === "ledger" && (
        <section className="mt-4">
          {data.commissions.length === 0 && <Empty text="아직 수수료가 없습니다." />}
          <ul className="space-y-2">
            {data.commissions.map((c) => (
              <li key={c.id} className="rounded-2xl border border-border bg-card p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {c.reversal_of && <span className="mr-1 rounded border border-amber-500/40 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-900">차감</span>}
                      {c.partner_name} · {c.source === "reels" ? `쇼츠 ${c.plan ?? ""}편 ${c.order_no ?? ""}` : `상담 ${c.inquiry_name ?? ""}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleString("ko-KR")} · 결제 {won(c.base_amount)}
                    </div>
                    {c.note && <div className="mt-1 text-xs text-amber-800">{c.note}</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-semibold">{won(c.amount)}</div>
                    <CBadge s={c.status} />
                  </div>
                </div>
                {!c.reversal_of && c.source === "inquiry" && c.status !== "cancelled" && !c.reversed && (
                  <div className="mt-2">
                    <SmallButton
                      disabled={busy}
                      text="계약 취소"
                      onClick={() => askContractCancel(c.id, c.partner_name, c.amount, c.status === "paid")}
                    />
                  </div>
                )}
                {!c.reversal_of && c.source === "reels" && (c.status === "pending" || c.status === "payable") && (
                  <div className="mt-2">
                    <SmallButton
                      disabled={busy}
                      text="수수료 취소"
                      onClick={() =>
                        ask({
                          title: "이 수수료를 취소할까요?",
                          body: `${c.partner_name}님 ${won(c.amount)}을 취소합니다. 정산에 묶여 있었다면 그 정산 금액도 다시 계산됩니다.`,
                          label: "취소하기",
                          run: async () => {
                            await post({ action: "cancel_commission", id: c.id }, "수수료 취소");
                          },
                        })
                      }
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && tab === "payouts" && (
        <section className="mt-4 space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              ask({
                title: `${month.replace("-", "년 ")}월 정산을 만들까요?`,
                body: "지급 가능한 수수료를 파트너별로 모아 정산 목록을 만듭니다(3.3% 원천징수 계산). 지급 뒤 환불 차감도 함께 빠지고, 차감이 더 크면 그 파트너는 다음 달로 넘깁니다. 다시 눌러도 겹치지 않습니다.",
                label: "만들기",
                run: async () => {
                  await post({ action: "make_payouts", month }, `${month} 정산 만들기 완료`);
                },
              })
            }
            className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow px-5 py-4 text-lg font-semibold text-primary-foreground disabled:opacity-50"
          >
            이번 달 정산 만들기
          </button>
          {data.payouts.length === 0 && <Empty text="정산 내역이 없습니다." />}
          {data.payouts.map((y) => (
            <article key={y.id} className="rounded-2xl border border-border bg-card p-4 text-sm shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">
                    {y.month} · {y.partner_name} <span className="font-normal text-muted-foreground">({y.code})</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {y.bank_name} {y.bank_account} ({y.bank_holder}) · {y.items}건
                  </div>
                </div>
                <Badge text={y.status === "paid" ? "지급 완료" : "지급 전"} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
                <span className="text-muted-foreground">합계</span>
                <span className="text-right">{won(y.gross)}</span>
                <span className="text-muted-foreground">소득세 3%</span>
                <span className="text-right">−{won(y.income_tax)}</span>
                <span className="text-muted-foreground">지방소득세 0.3%</span>
                <span className="text-right">−{won(y.local_tax)}</span>
                <span className="font-semibold">실지급</span>
                <span className="text-right font-semibold">{won(y.net)}</span>
              </div>
              {y.status === "pending" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    ask({
                      title: `${y.partner_name}님 ${won(y.net)} 지급 완료로 할까요?`,
                      body: `${y.bank_name} ${y.bank_account}(${y.bank_holder})로 실제 이체한 뒤 눌러 주세요. 되돌릴 수 없습니다.`,
                      label: "지급 완료",
                      run: async () => {
                        await post({ action: "payout_paid", id: y.id }, `${y.partner_name}님 지급 완료`);
                      },
                    })
                  }
                  className="mt-3 w-full rounded-2xl border border-emerald-600/40 bg-emerald-50 px-4 py-3 text-base font-semibold text-emerald-900 disabled:opacity-50"
                >
                  지급 완료
                </button>
              )}
            </article>
          ))}
        </section>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="partner-confirm-title">
          <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-xl">
            <h2 id="partner-confirm-title" className="text-lg font-bold">
              {confirm.title}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{confirm.body}</p>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="flex-1 rounded-2xl border border-border px-4 py-3 text-base">
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  const c = confirm;
                  setConfirm(null);
                  void c.run();
                }}
                className="flex-1 rounded-2xl bg-gradient-to-br from-primary to-primary-glow px-4 py-3 text-base font-semibold text-primary-foreground"
              >
                {confirm.label}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MailStatus({ p }: { p: Partner }) {
  if (p.approval_mail_error) {
    return (
      <p className="mt-2 rounded-xl border border-rose-500/40 bg-rose-50 px-3 py-2 text-xs text-rose-800">
        안내 메일 실패: {p.approval_mail_error}
        {p.approval_mail_sent_at ? ` (전에 ${shortDate(p.approval_mail_sent_at)} 보냄)` : ""} — 다시 보내거나 링크를 직접 보내 주세요.
      </p>
    );
  }
  if (p.approval_mail_sent_at) {
    return <p className="mt-2 text-xs text-muted-foreground">안내 메일 보냄 · {shortDate(p.approval_mail_sent_at)}</p>;
  }
  return <p className="mt-2 text-xs text-muted-foreground">안내 메일 아직 안 보냄</p>;
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{text}</p>;
}
function Badge({ text }: { text: string }) {
  return <span className="shrink-0 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold">{text}</span>;
}
function CBadge({ s }: { s: CStatus }) {
  return <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${C_CLASS[s]}`}>{C_LABEL[s]}</span>;
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-14 shrink-0 text-muted-foreground">{k}</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </div>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold text-foreground">{value}</div>
    </div>
  );
}
function SmallButton({ text, onClick, disabled }: { text: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
      {text}
    </button>
  );
}
