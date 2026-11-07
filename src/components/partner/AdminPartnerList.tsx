// 관리자 파트너 화면(/admin/partners) 「파트너」 탭 — 한눈에 보는 목록(표) + 행을 누르면 상세 칸.
// PC(lg 이상): 가로 표 + 오른쪽 상세 칸. 휴대폰: 한 줄 요약 행(이름·코드·상태·이번 달 수수료) → 누르면 아래로 펼침.
// 자료: GET /api/admin/partners?view=list&period=… (public.partner_admin_list — 서버 한 번 호출로 집계)
//       GET /api/admin/partners?view=detail&id=…  (계좌 변경 이력·최근 수수료·정산)
//       POST /api/admin/partner-account { id }     (계좌 전체 보기 — 누를 때만, 화면 상태에만 두고 저장하지 않는다)
//       GET /api/admin/partner-export?kind=list&… (엑셀, 화면과 같은 검색·필터·정렬, 계좌 끝 4자리만)
// 검색·상태 필터·정렬은 브라우저에서(src/lib/partner/admin-list.ts, 시험: tests/partner-admin-list.test.ts).
// 🚨 확인은 window.confirm 대신 부모 화면의 확인 상자(ask).
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Download, Eye, EyeOff, Loader2, Search, X } from "lucide-react";
import { adminFetch } from "@/hooks/useAdminGate";
import { CopyRow } from "@/components/partner/CopyRow";
import { fileNameFromDisposition, saveBlob } from "@/lib/partner/download";
import {
  DEFAULT_SORT,
  PERIODS,
  STATUS_LABEL,
  filterPartners,
  formatPhone,
  kstDay,
  maskedAccount,
  nextSort,
  periodLabel,
  recentlyChanged,
  sortPartners,
  type ListPartner,
  type ListPeriod,
  type ListResponse,
  type PartnerStatus,
  type SortDir,
  type SortKey,
  type StatusFilter,
} from "@/lib/partner/admin-list";

const SITE = "https://ai-solution.co.kr";
const won = (v: number | null | undefined) => `${Number(v ?? 0).toLocaleString("ko-KR")}원`;
const shortDate = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

const STATUS_CLASS: Record<PartnerStatus, string> = {
  applied: "border-amber-500/50 bg-amber-50 text-amber-900",
  approved: "border-emerald-600/40 bg-emerald-50 text-emerald-800",
  paused: "border-slate-400/60 bg-slate-100 text-slate-700",
  rejected: "border-rose-500/40 bg-rose-50 text-rose-800",
};

type MailOutcome = { mail?: "sent" | "failed" | "skipped"; mail_error?: string | null };
type PostResult = MailOutcome & { error?: string; view_key?: string };
type Confirm = { title: string; body: string; label: string; run: () => Promise<void> };

type Detail = {
  ok: true;
  changes: { changed_at: string; old_bank_name: string | null; new_bank_name: string; old_last4: string | null; new_last4: string }[];
  commissions: {
    id: string;
    created_at: string;
    source: "reels" | "inquiry";
    base_amount: number;
    amount: number;
    status: "pending" | "payable" | "paid" | "cancelled";
    note: string | null;
    is_reversal: boolean;
    order_no: string | null;
    plan: number | null;
    inquiry_name: string | null;
  }[];
  payouts: { id: string; month: string; gross: number; withholding: number; net: number; status: "pending" | "paid"; paid_at: string | null }[];
};

const C_LABEL = { pending: "대기", payable: "지급 가능", paid: "지급 완료", cancelled: "취소" } as const;

type Actions = {
  busy: boolean;
  ask: (c: Confirm) => void;
  post: (body: Record<string, unknown>, okText: string) => Promise<PostResult | null>;
  onApproved: (name: string, key: string, mail: MailOutcome) => void;
};

// group: 머리 위 묶음 줄(기간 집계 / 누적 수수료). wide: 상세 칸을 열면 숨기는 열(상세에 같은 내용이 있다)
type Col = { key: SortKey; label: string; num?: boolean; group?: "period" | "total"; wide?: boolean };
const COLS: Col[] = [
  { key: "name", label: "이름" },
  { key: "code", label: "코드", wide: true },
  { key: "status", label: "상태" },
  { key: "phone", label: "휴대폰", wide: true },
  { key: "email", label: "이메일", wide: true },
  { key: "user_linked", label: "로그인", wide: true },
  { key: "bank", label: "정산 계좌" },
  { key: "approved_at", label: "승인일", wide: true },
  { key: "visits", label: "방문", num: true, group: "period" },
  { key: "inquiries", label: "상담", num: true, group: "period" },
  { key: "paid_count", label: "결제", num: true, group: "period" },
  { key: "paid_amount", label: "결제 금액", num: true, group: "period" },
  { key: "sum_pending", label: "대기", num: true, group: "total" },
  { key: "sum_payable", label: "지급 가능", num: true, group: "total" },
  { key: "sum_paid", label: "지급 완료", num: true, group: "total" },
  { key: "sum_reversed", label: "차감", num: true, group: "total" },
  { key: "last_activity_at", label: "최근 활동" },
];

/** 표 칸에서는 「은행」 꼬리를 떼서 좁게: 「KB국민 ·7654」 */
const shortBank = (name: string) => name.replace(/은행$/, "") || name;
/** 「26.10.15」 */
const tinyDay = (iso: string | null) => (iso ? kstDay(iso).slice(2).replace(/-/g, ".") : "");

function Cell({ p, k }: { p: ListPartner; k: SortKey }) {
  const td = "whitespace-nowrap px-2 py-2";
  switch (k) {
    case "name":
      return null; // 고정 칸으로 따로 그린다
    case "code":
      return <td className={`${td} font-mono text-xs`}>{p.code}</td>;
    case "status":
      return (
        <td className={td}>
          <StatusBadge s={p.status} />
        </td>
      );
    case "phone":
      return <td className={`${td} tabular-nums`}>{formatPhone(p.phone)}</td>;
    case "email":
      return (
        <td className={`${td} max-w-[150px] truncate`} title={p.email}>
          {p.email}
        </td>
      );
    case "user_linked":
      return (
        <td className={td}>
          {p.user_linked ? <span className="text-emerald-700">연결</span> : <span className="text-muted-foreground">없음</span>}
        </td>
      );
    case "bank":
      return (
        <td className={td} title={`${p.bank_name} 끝 ${p.bank_last4} (${p.bank_holder})`}>
          {shortBank(p.bank_name)} ·{p.bank_last4 || "????"}
          {recentlyChanged(p.account_changed_at) && <ChangedTag />}
        </td>
      );
    case "approved_at":
      return <td className={`${td} tabular-nums text-muted-foreground`}>{tinyDay(p.approved_at) || "—"}</td>;
    case "last_activity_at":
      return <td className={`${td} tabular-nums text-muted-foreground`}>{tinyDay(p.last_activity_at) || "—"}</td>;
    case "sum_payable":
      return <Num v={p.sum_payable} strong />;
    default:
      return <Num v={p[k]} />;
  }
}

export function AdminPartnerList(props: Actions) {
  const [period, setPeriod] = useState<ListPeriod>("30d");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>(DEFAULT_SORT);
  const [selected, setSelected] = useState<string | null>(null);
  const [dl, setDl] = useState<{ busy: boolean; msg?: { kind: "ok" | "error"; text: string } }>({ busy: false });

  const list = useQuery({
    queryKey: ["admin-partners", "list", period],
    queryFn: async () => {
      const res = await adminFetch(`/api/admin/partners?view=list&period=${period}`);
      const body = (await res.json().catch(() => ({}))) as ListResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body;
    },
    placeholderData: (prev) => prev,
  });

  const rows = useMemo(() => {
    const all = list.data?.partners ?? [];
    return sortPartners(filterPartners(all, { q, status }), sort.key, sort.dir);
  }, [list.data, q, status, sort]);
  const sel = rows.find((p) => p.id === selected) ?? list.data?.partners.find((p) => p.id === selected) ?? null;
  const t = list.data?.totals;
  const pl = periodLabel(period);
  // 상세 칸을 열면 코드·연락처·로그인·승인일 열을 접는다(상세에 같은 내용) → 1280 폭에서도 숫자 열이 보인다
  const cols = sel ? COLS.filter((c) => !c.wide) : COLS;

  async function download() {
    setDl({ busy: true });
    const qs = new URLSearchParams({ kind: "list", period, status, q, sort: sort.key, dir: sort.dir });
    try {
      const res = await adminFetch(`/api/admin/partner-export?${qs}`);
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      const name = fileNameFromDisposition(res.headers.get("content-disposition"), "partner-list.xlsx");
      saveBlob(await res.blob(), name);
      setDl({ busy: false, msg: { kind: "ok", text: `${name} 내려받음 (${res.headers.get("x-export-rows") ?? rows.length}명)` } });
    } catch (e) {
      setDl({ busy: false, msg: { kind: "error", text: (e as Error).message } });
    }
  }

  return (
    <section className="mt-4" data-testid="partner-list">
      {/* 합계 줄 */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat
          label="파트너"
          value={t ? `${t.partners}명` : "—"}
          sub={t ? `승인 ${t.by_status.approved} · 신청 ${t.by_status.applied} · 일시정지 ${t.by_status.paused} · 거절 ${t.by_status.rejected}` : ""}
        />
        <Stat label="이번 달 결제 금액" value={t ? won(t.month_paid_amount) : "—"} sub="한국 시간 1일부터" />
        <Stat label="지급 가능 합계" value={t ? won(t.payable_total) : "—"} sub="다음 정산 때 지급" strong />
        <Stat label="누적 지급" value={t ? won(t.paid_total) : "—"} sub="지급 완료 수수료" />
      </div>

      {/* 검색·필터·기간·엑셀 */}
      <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름·코드·휴대폰·이메일 검색"
            aria-label="파트너 검색"
            className="min-h-11 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-base lg:text-sm"
          />
        </label>
        <div className="flex gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            aria-label="상태 필터"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-input bg-card px-3 text-base lg:flex-none lg:text-sm"
          >
            <option value="all">전체{t ? ` (${t.partners})` : ""}</option>
            {(["approved", "applied", "paused", "rejected"] as PartnerStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
                {t ? ` (${t.by_status[s]})` : ""}
              </option>
            ))}
          </select>
          <div className="flex shrink-0 rounded-xl border border-input bg-card p-0.5" role="group" aria-label="집계 기간">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={period === p.id}
                onClick={() => setPeriod(p.id)}
                className={`min-h-10 rounded-lg px-2.5 text-sm ${period === p.id ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void download()}
          disabled={dl.busy || !list.data}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
        >
          {dl.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} 목록 엑셀 내려받기
        </button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        방문·상담·결제는 {pl} 기준, 수수료(대기·지급 가능·지급 완료·차감)는 누적입니다. 계좌는 끝 4자리만 보입니다.
        {list.isFetching && !list.isLoading ? " · 새로 읽는 중…" : ""}
      </p>
      {dl.msg && (
        <p
          role="status"
          className={`mt-2 rounded-xl border px-3 py-2 text-sm ${
            dl.msg.kind === "ok" ? "border-emerald-500/40 bg-emerald-50 text-emerald-900" : "border-rose-500/40 bg-rose-50 text-rose-800"
          }`}
        >
          {dl.msg.text}
        </p>
      )}

      {list.isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
      {list.error && (
        <p className="mt-4 rounded-xl border border-rose-500/40 bg-rose-50 px-3 py-2 text-sm text-rose-800">{(list.error as Error).message}</p>
      )}
      {list.data && rows.length === 0 && (
        <p className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {list.data.partners.length === 0 ? "아직 파트너가 없습니다." : "조건에 맞는 파트너가 없습니다."}
        </p>
      )}

      {list.data && rows.length > 0 && (
        <>
          {/* PC: 가로 표 + 오른쪽 상세 */}
          <div className="mt-3 hidden gap-4 lg:flex">
            <div className="min-w-0 flex-1 overflow-x-auto rounded-2xl border border-border bg-card shadow-sm" data-testid="partner-table-wrap">
              <table className="w-full border-collapse text-[13px]" data-testid="partner-table">
                <thead>
                  <tr className="text-[11px] text-muted-foreground">
                    {groupSpans(cols).map((g, i) => (
                      <th
                        key={i}
                        colSpan={g.span}
                        scope="colgroup"
                        className={`px-2 pt-2 font-normal ${i === 0 ? "sticky left-0 z-20 bg-card" : ""} ${
                          g.group ? `border-b text-center ${g.group === "total" ? "border-primary/40 text-primary" : "border-border"}` : ""
                        }`}
                      >
                        {g.group === "period" ? `${pl} 기준` : g.group === "total" ? "수수료 누적(원)" : ""}
                      </th>
                    ))}
                  </tr>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    {cols.map((c) => {
                      const on = sort.key === c.key;
                      return (
                        <th
                          key={c.key}
                          scope="col"
                          aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                          className={`whitespace-nowrap px-2 py-2 font-medium ${c.num ? "text-right" : "text-left"} ${
                            c.key === "name" ? "sticky left-0 z-20 bg-card" : ""
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSort(nextSort(sort, c.key))}
                            className={`inline-flex items-center gap-0.5 hover:text-foreground ${on ? "font-semibold text-foreground" : ""}`}
                          >
                            {c.label}
                            {on && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const on = p.id === selected;
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelected(on ? null : p.id)}
                        aria-selected={on}
                        className={`cursor-pointer border-b border-border/60 last:border-0 ${on ? "bg-primary/10" : "hover:bg-muted/40"}`}
                      >
                        <td
                          className={`sticky left-0 z-10 whitespace-nowrap px-2 py-2 font-semibold ${
                            on
                              ? "bg-[color-mix(in_oklab,var(--color-card),var(--color-primary)_10%)] shadow-[inset_3px_0_0_var(--color-primary)]"
                              : "bg-card"
                          }`}
                        >
                          <button
                            type="button"
                            className="text-left hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(on ? null : p.id);
                            }}
                          >
                            {p.name}
                          </button>
                        </td>
                        {cols.slice(1).map((c) => (
                          <Cell key={c.key} p={p} k={c.key} />
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {sel && (
              <aside className="w-[380px] shrink-0">
                <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <PartnerDetail p={sel} period={period} onClose={() => setSelected(null)} {...props} />
                </div>
              </aside>
            )}
          </div>

          {/* 휴대폰: 한 줄 요약 + 펼치기 */}
          <ul className="mt-3 space-y-2 lg:hidden" data-testid="partner-rows">
            <li className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
              <button type="button" onClick={() => setSort(nextSort(sort, "sum_payable"))} className="inline-flex items-center gap-0.5">
                정렬: {sort.key === "sum_payable" ? "지급 가능" : COLS.find((c) => c.key === sort.key)?.label ?? ""}
                {sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              </button>
              <span>{rows.length}명 · 오른쪽 숫자 = 이번 달 수수료</span>
            </li>
            {rows.map((p) => {
              const on = p.id === selected;
              return (
                <li key={p.id} className={`rounded-2xl border bg-card shadow-sm ${on ? "border-primary/60" : "border-border"}`}>
                  <button
                    type="button"
                    onClick={() => setSelected(on ? null : p.id)}
                    aria-expanded={on}
                    className="flex min-h-14 w-full items-center gap-2 px-3 py-2.5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-semibold">{p.name}</span>
                        <StatusBadge s={p.status} />
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {p.code}
                        {p.sum_payable !== 0 ? ` · 지급 가능 ${won(p.sum_payable)}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold tabular-nums">{won(p.month_commission)}</span>
                      <span className="block text-[11px] text-muted-foreground">이번 달</span>
                    </span>
                    {on ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  </button>
                  {on && (
                    <div className="border-t border-border px-3 pb-4 pt-3">
                      <PartnerDetail p={p} period={period} onClose={() => setSelected(null)} {...props} compact />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

// ───────── 상세 칸 ─────────
function PartnerDetail({
  p,
  period,
  onClose,
  busy,
  ask,
  post,
  onApproved,
  compact,
}: Actions & { p: ListPartner; period: ListPeriod; onClose: () => void; compact?: boolean }) {
  const detail = useQuery({
    queryKey: ["admin-partners", "detail", p.id],
    queryFn: async () => {
      const res = await adminFetch(`/api/admin/partners?view=detail&id=${p.id}`);
      const body = (await res.json().catch(() => ({}))) as Detail & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body;
    },
  });
  const pl = periodLabel(period);

  return (
    <div className="space-y-4 text-sm" data-testid="partner-detail">
      {!compact && (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-bold">{p.name}</h2>
              <StatusBadge s={p.status} />
            </div>
            <div className="font-mono text-xs text-muted-foreground">{p.code}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="상세 닫기" className="rounded-full p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
        <Mini label={`방문(${pl})`} value={`${p.visits}명`} />
        <Mini label={`상담(${pl})`} value={`${p.inquiries}건`} />
        <Mini label={`결제(${pl})`} value={`${p.paid_count}건`} />
        <Mini label="대기" value={won(p.sum_pending)} />
        <Mini label="지급 가능" value={won(p.sum_payable)} strong />
        <Mini label="지급 완료" value={won(p.sum_paid)} />
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        {pl} 결제 금액 {won(p.paid_amount)} · 이번 달 수수료 {won(p.month_commission)}
        {p.sum_reversed !== 0 ? ` · 차감 누적 ${won(p.sum_reversed)}` : ""}
      </p>

      <dl className="space-y-1.5">
        <Row k="휴대폰" v={<a href={`tel:${p.phone}`} className="tabular-nums underline-offset-2 hover:underline">{formatPhone(p.phone)}</a>} />
        <Row k="이메일" v={<span className="break-all">{p.email}</span>} />
        <Row k="활동 채널" v={<Channels text={p.channels} />} />
        <Row k="신청일" v={kstDay(p.created_at)} />
        <Row k="승인일" v={kstDay(p.approved_at) || "—"} />
        <Row k="최근 활동" v={kstDay(p.last_activity_at) || "—"} />
      </dl>

      <BankBox p={p} />

      {p.view_key && p.status !== "rejected" && (
        <div className="space-y-2">
          <CopyRow label="파트너 화면 링크" value={`${SITE}/partner/me?k=${p.view_key}`} />
        </div>
      )}
      {(p.status === "approved" || p.status === "paused") && <CopyRow label="추천 링크(홈)" value={`${SITE}/?ref=${p.code}`} />}
      {p.status === "approved" && <MailStatus p={p} />}
      {(p.status === "approved" || p.status === "paused") && <AccountStatus p={p} />}

      <div className="flex flex-wrap gap-2">
        {p.status === "applied" && (
          <>
            <SmallButton
              disabled={busy}
              text="승인"
              primary
              onClick={() =>
                ask({
                  title: `${p.name}님을 승인할까요?`,
                  body: `승인하면 코드 「${p.code}」로 들어온 손님의 결제에 10% 수수료가 쌓이고, 파트너 화면 링크가 만들어집니다.`,
                  label: "승인",
                  run: async () => {
                    const r = await post({ action: "set_status", id: p.id, status: "approved" }, `${p.name}님 승인`);
                    if (r?.view_key) onApproved(p.name, r.view_key, r);
                  },
                })
              }
            />
            <SmallButton
              disabled={busy}
              text="거절"
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
            />
          </>
        )}
        {p.status === "approved" && (
          <SmallButton
            disabled={busy}
            text="안내 메일 다시 보내기"
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
          />
        )}
        {(p.status === "approved" || p.status === "paused") && !p.user_linked && (
          <SmallButton
            disabled={busy}
            text={p.account_mail_sent_at ? "계정 만들기 메일 다시 보내기" : "계정 만들기 메일 보내기"}
            onClick={() =>
              ask({
                title: `${p.name}님에게 계정 만들기 메일을 보낼까요?`,
                body: `${p.email} 로 「파트너 계정 만들기」 링크를 보냅니다. 파트너가 비밀번호만 정하면 바로 로그인 대시보드를 씁니다.`,
                label: "보내기",
                run: async () => {
                  await post({ action: "send_account_mail", id: p.id }, `${p.name}님 계정 만들기 메일`);
                },
              })
            }
          />
        )}
        {p.status === "approved" && (
          <SmallButton
            disabled={busy}
            text="일시정지"
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
          />
        )}
        {(p.status === "paused" || p.status === "rejected") && (
          <SmallButton
            disabled={busy}
            text="다시 승인"
            onClick={() =>
              ask({
                title: `${p.name}님을 다시 승인할까요?`,
                body: "다시 승인하면 이 코드로 들어온 새 결제에 수수료가 쌓입니다.",
                label: "승인",
                run: async () => {
                  const r = await post({ action: "set_status", id: p.id, status: "approved" }, `${p.name}님 승인`);
                  if (r?.view_key) onApproved(p.name, r.view_key, r);
                },
              })
            }
          />
        )}
      </div>

      <MemoBox key={`${p.id}:${p.memo ?? ""}`} p={p} busy={busy} post={post} />

      {detail.isLoading && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}
      {detail.error && <p className="text-xs text-rose-700">{(detail.error as Error).message}</p>}
      {detail.data && (
        <>
          <Block title="계좌 변경 이력">
            {detail.data.changes.length === 0 ? (
              <p className="text-xs text-muted-foreground">바꾼 적 없음</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {detail.data.changes.map((c, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="tabular-nums text-muted-foreground">{shortDate(c.changed_at)}</span>
                    <span className="text-right">
                      {c.old_bank_name ?? "?"} ·{c.old_last4 ?? "????"} → <b>{c.new_bank_name} ·{c.new_last4}</b>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Block>
          <Block title="최근 수수료">
            {detail.data.commissions.length === 0 ? (
              <p className="text-xs text-muted-foreground">아직 없음</p>
            ) : (
              <ul className="divide-y divide-border/60 text-xs">
                {detail.data.commissions.slice(0, 10).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0">
                      <span className="block truncate">
                        {c.is_reversal && <span className="mr-1 rounded border border-amber-500/40 bg-amber-50 px-1 text-amber-900">차감</span>}
                        {c.source === "reels" ? `쇼츠 ${c.plan ?? ""}편 ${c.order_no ?? ""}` : `상담 ${c.inquiry_name ?? ""}`}
                      </span>
                      <span className="text-muted-foreground">
                        {kstDay(c.created_at)} · 결제 {won(c.base_amount)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={`block font-semibold tabular-nums ${c.status === "cancelled" ? "text-muted-foreground line-through" : ""}`}>{won(c.amount)}</span>
                      <span className="text-muted-foreground">{C_LABEL[c.status]}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Block>
          <Block title="정산">
            {detail.data.payouts.length === 0 ? (
              <p className="text-xs text-muted-foreground">정산 내역 없음</p>
            ) : (
              <ul className="divide-y divide-border/60 text-xs">
                {detail.data.payouts.map((y) => (
                  <li key={y.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span>
                      {y.month} · 합계 {won(y.gross)}
                    </span>
                    <span className="text-right">
                      실지급 <b className="tabular-nums">{won(y.net)}</b>
                      <span className={`ml-1 ${y.status === "paid" ? "text-emerald-700" : "text-amber-800"}`}>
                        {y.status === "paid" ? "지급 완료" : "지급 전"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Block>
        </>
      )}
    </div>
  );
}

/** 정산 계좌: 기본은 끝 4자리. 「전체 보기」를 누를 때만 관리자 API 를 따로 부른다(화면 상태에만, 저장 안 함). */
function BankBox({ p }: { p: ListPartner }) {
  const [full, setFull] = useState<{ bank_name: string; bank_account: string; bank_holder: string } | null>(null);
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const changed = recentlyChanged(p.account_changed_at);

  async function reveal() {
    setState({ busy: true });
    try {
      const res = await adminFetch("/api/admin/partner-account", { method: "POST", body: JSON.stringify({ id: p.id }), cache: "no-store" });
      const b = (await res.json().catch(() => ({}))) as { error?: string; bank_name?: string; bank_account?: string; bank_holder?: string };
      if (!res.ok || !b.bank_account) throw new Error(b.error ?? `HTTP ${res.status}`);
      setFull({ bank_name: b.bank_name ?? "", bank_account: b.bank_account, bank_holder: b.bank_holder ?? "" });
      setState({ busy: false });
    } catch (e) {
      setState({ busy: false, error: (e as Error).message });
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-3" data-testid="bank-box">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">정산 계좌</div>
          <div className="mt-0.5 font-medium tabular-nums">
            {full ? `${full.bank_name} ${full.bank_account}` : maskedAccount(p)}
            <span className="font-normal text-muted-foreground"> ({full?.bank_holder ?? p.bank_holder})</span>
            {changed && <ChangedTag />}
          </div>
        </div>
        {full ? (
          <button type="button" onClick={() => setFull(null)} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted">
            <EyeOff className="h-3.5 w-3.5" /> 가리기
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void reveal()}
            disabled={state.busy}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
          >
            {state.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} 전체 보기
          </button>
        )}
      </div>
      {changed && p.account_changed_at && (
        <p className="mt-1.5 text-xs font-semibold text-amber-800">파트너가 {shortDate(p.account_changed_at)}에 계좌를 바꿨습니다.</p>
      )}
      {state.error && <p className="mt-1.5 text-xs text-rose-700">{state.error}</p>}
    </div>
  );
}

function MemoBox({ p, busy, post }: { p: ListPartner; busy: boolean; post: Actions["post"] }) {
  const [v, setV] = useState(p.memo ?? "");
  const dirty = v.trim() !== (p.memo ?? "").trim();
  return (
    <div>
      <label htmlFor={`memo-${p.id}`} className="text-xs font-medium text-muted-foreground">
        관리자 메모(파트너에게 안 보임)
      </label>
      <textarea
        id={`memo-${p.id}`}
        value={v}
        maxLength={2000}
        rows={3}
        onChange={(e) => setV(e.target.value)}
        placeholder="예) 11/7 통화 — 인스타 공구 위주, 12월 이벤트 관심"
        className="mt-1 w-full rounded-xl border border-input bg-card px-3 py-2 text-base lg:text-sm"
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{v.length}/2000</span>
        <SmallButton
          disabled={busy || !dirty}
          text="메모 저장"
          onClick={() => void post({ action: "set_memo", id: p.id, memo: v }, `${p.name}님 메모 저장`)}
        />
      </div>
    </div>
  );
}

function MailStatus({ p }: { p: ListPartner }) {
  if (p.approval_mail_error) {
    return (
      <p className="rounded-xl border border-rose-500/40 bg-rose-50 px-3 py-2 text-xs text-rose-800">
        안내 메일 실패: {p.approval_mail_error}
        {p.approval_mail_sent_at ? ` (전에 ${shortDate(p.approval_mail_sent_at)} 보냄)` : ""} — 다시 보내거나 링크를 직접 보내 주세요.
      </p>
    );
  }
  if (p.approval_mail_sent_at) return <p className="text-xs text-muted-foreground">안내 메일 보냄 · {shortDate(p.approval_mail_sent_at)}</p>;
  return <p className="text-xs text-muted-foreground">안내 메일 아직 안 보냄</p>;
}

function AccountStatus({ p }: { p: ListPartner }) {
  return (
    <div className="space-y-1 text-xs">
      {p.user_linked ? (
        <p className="text-emerald-800">로그인 계정 연결됨</p>
      ) : (
        <>
          <p className="text-muted-foreground">
            로그인 계정 아직 없음
            {p.account_mail_sent_at ? ` · 계정 메일 보냄 ${shortDate(p.account_mail_sent_at)}` : ""}
          </p>
          {p.account_mail_error && (
            <p className="rounded-xl border border-rose-500/40 bg-rose-50 px-3 py-2 text-rose-800">계정 메일 실패: {p.account_mail_error}</p>
          )}
          {p.view_key && <CopyRow label="계정 만들기 링크" value={`${SITE}/partner/signup?k=${p.view_key}`} />}
        </>
      )}
    </div>
  );
}

function Channels({ text }: { text: string }) {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-col gap-0.5">
      {parts.slice(0, 8).map((s, i) =>
        /^https?:\/\//i.test(s) ? (
          <a key={i} href={s} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-primary underline-offset-2 hover:underline">
            {s}
          </a>
        ) : (
          <span key={i} className="break-all">
            {s}
          </span>
        ),
      )}
    </span>
  );
}

// ───────── 작은 조각 ─────────
function StatusBadge({ s }: { s: PartnerStatus }) {
  return (
    <span className={`inline-block shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[s]}`}>
      {STATUS_LABEL[s]}
    </span>
  );
}
function ChangedTag() {
  return <span className="ml-1 rounded border border-amber-500/50 bg-amber-50 px-1 py-px text-[11px] font-semibold text-amber-900">바뀜</span>;
}
function Num({ v, strong }: { v: number; strong?: boolean }) {
  return (
    <td
      className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${strong ? "font-semibold text-foreground" : ""} ${
        v === 0 ? "text-muted-foreground/60" : ""
      } ${v < 0 ? "text-amber-800" : ""}`}
    >
      {v.toLocaleString("ko-KR")}
    </td>
  );
}
function groupSpans(cols: Col[]): { group?: Col["group"]; span: number }[] {
  const out: { group?: Col["group"]; span: number }[] = [];
  for (const c of cols) {
    const last = out[out.length - 1];
    if (last && last.group === c.group) last.span++;
    else out.push({ group: c.group, span: 1 });
  }
  return out;
}
function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${strong ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{sub}</div>}
    </div>
  );
}
function Mini({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl p-2 ${strong ? "bg-primary/10" : "bg-muted/60"}`}>
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-muted-foreground">{k}</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </div>
  );
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}
function SmallButton({ text, onClick, disabled, primary }: { text: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-3 py-1.5 text-sm disabled:opacity-50 ${
        primary ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border hover:bg-muted"
      }`}
    >
      {text}
    </button>
  );
}
