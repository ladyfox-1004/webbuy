// /partner/me?k=<view_key> — 파트너 본인 화면(로그인 없음, 승인 때 만든 긴 무작위 열쇠로만 연다).
// 🚨 head 에는 title·robots(noindex)만. canonical 넣지 마라(비공개 화면).
// 자료: GET /api/partner/me (src/routes/api/partner/me.ts → public.partner_me). 계좌는 끝 4자리만 온다.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { CopyRow } from "@/components/partner/CopyRow";
import { ReelsNav } from "@/components/reels/ReelsParts";

export const Route = createFileRoute("/partner/me")({
  validateSearch: (s: Record<string, unknown>): { k: string } => ({ k: typeof s.k === "string" ? s.k : "" }),
  component: PartnerMePage,
  head: () => ({
    meta: [
      { title: "내 파트너 화면 | 에이아이솔루션" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Status = "pending" | "payable" | "paid" | "cancelled";
type PartnerMe = {
  name: string;
  code: string;
  status: "approved" | "paused";
  bank_name: string;
  bank_last4: string;
  visits_30d: number;
  inquiries: number;
  paid_count: number;
  sum_pending: number;
  sum_payable: number;
  sum_paid: number;
  recent: { created_at: string; source: "reels" | "inquiry"; base_amount: number; amount: number; status: Status; plan: number | null }[];
  months: { month: string; gross: number; income_tax: number; local_tax: number; withholding: number; net: number; status: "pending" | "paid"; paid_at: string | null }[];
};

const SITE = "https://ai-solution.co.kr";
const won = (v: number) => `${Number(v || 0).toLocaleString("ko-KR")}원`;
const STATUS_LABEL: Record<Status, string> = { pending: "대기(환불 기간)", payable: "지급 가능", paid: "지급 완료", cancelled: "취소" };

function PartnerMePage() {
  const { k } = Route.useSearch();
  const q = useQuery({
    queryKey: ["partner-me", k],
    enabled: /^[0-9a-f]{64}$/.test(k),
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/partner/me?k=${encodeURIComponent(k)}`);
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; me?: PartnerMe; error?: string };
      if (!res.ok || !body.me) throw new Error(body.error ?? "링크가 올바르지 않습니다.");
      return body.me;
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ReelsNav />
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-8">
        {!/^[0-9a-f]{64}$/.test(k) ? (
          <Notice text="링크가 올바르지 않습니다. 받으신 링크 전체를 다시 열어 주세요." />
        ) : q.isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : q.error ? (
          <Notice text={(q.error as Error).message} />
        ) : q.data ? (
          <MeView me={q.data} />
        ) : null}
      </main>
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function MeView({ me }: { me: PartnerMe }) {
  const links = [
    { label: "쇼츠 제작 페이지", url: `${SITE}/reels?ref=${me.code}` },
    { label: "홈페이지", url: `${SITE}/?ref=${me.code}` },
  ];
  return (
    <div data-testid="partner-me">
      <p className="text-sm text-muted-foreground">파트너 화면</p>
      <h1 className="mt-1 font-display text-2xl font-bold">{me.name}님</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        내 코드 <b className="font-semibold text-foreground">{me.code}</b> · 정산 계좌 {me.bank_name} ****{me.bank_last4}
      </p>
      {me.status === "paused" && (
        <p className="mt-4 rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          지금은 파트너 활동이 잠시 멈춘 상태입니다. 새 결제에는 수수료가 쌓이지 않습니다. 이미 쌓인 금액은 그대로 정산됩니다.
        </p>
      )}

      <section className="mt-6 space-y-3">
        <h2 className="font-display text-lg font-bold">내 링크</h2>
        {links.map((l) => (
          <CopyRow key={l.url} label={l.label} value={l.url} />
        ))}
        <p className="text-xs leading-relaxed text-muted-foreground">
          홍보할 때는 「광고」 또는 「에이아이솔루션 파트너 활동으로 수수료를 받습니다」를 글 첫머리에 꼭 적어 주세요.
        </p>
      </section>

      <section className="mt-8 grid grid-cols-3 gap-2">
        <Stat label="방문(최근 30일)" value={`${me.visits_30d.toLocaleString("ko-KR")}명`} />
        <Stat label="상담 접수" value={`${me.inquiries.toLocaleString("ko-KR")}건`} />
        <Stat label="결제" value={`${me.paid_count.toLocaleString("ko-KR")}건`} />
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg font-bold">받을 돈</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">대기(결제 뒤 7일 환불 기간)</dt>
            <dd className="font-semibold">{won(me.sum_pending)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">지급 가능(다음 정산)</dt>
            <dd className="font-semibold text-emerald-700">{won(me.sum_payable)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">지급 완료(누적, 원천징수 전)</dt>
            <dd className="font-semibold">{won(me.sum_paid)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">월별 정산</h2>
        {me.months.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">아직 정산 내역이 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {me.months.map((m) => (
              <li key={m.month} className="rounded-2xl border border-border bg-card p-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{m.month.replace("-", "년 ")}월</span>
                  <span className={m.status === "paid" ? "text-emerald-700" : "text-amber-800"}>
                    {m.status === "paid" ? "지급 완료" : "지급 준비 중"}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
                  <span>수수료 합계</span>
                  <span className="text-right text-foreground">{won(m.gross)}</span>
                  <span>소득세 3% · 지방세 0.3%</span>
                  <span className="text-right text-foreground">−{won(m.withholding)}</span>
                  <span className="font-semibold text-foreground">실지급</span>
                  <span className="text-right font-semibold text-foreground">{won(m.net)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">최근 수수료</h2>
        {me.recent.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">아직 결제된 건이 없습니다.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card text-sm">
            {me.recent.map((r, i) => (
              <li key={`${r.created_at}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium">
                    {r.source === "reels" ? `쇼츠 ${r.plan ?? ""}편` : "상담 계약"} · {won(r.base_amount)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("ko-KR")} · {STATUS_LABEL[r.status]}
                  </div>
                </div>
                <div className={`shrink-0 font-semibold ${r.status === "cancelled" ? "text-muted-foreground line-through" : ""}`}>
                  {won(r.amount)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
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
