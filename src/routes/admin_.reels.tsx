// /admin/reels — 릴스 판매 주문 관리(관리자 전용). 결제 스위치, 비밀값 있음/없음, 주문 목록, 확인 필요 처리, 올린 자료 내려받기.
// 주의: 파일 이름이 admin_.reels 인 이유는 admin_.blog.tsx 머리 주석과 같다(/admin 에 <Outlet/> 이 없다).
// 주의: useAdminGate 는 화면을 가리는 용도다. 실제 보호는 reels-admin 함수가 Bearer 토큰으로 관리자인지 다시 확인한다.
// 주의: 비밀값은 「있음/없음」만 보여 준다. 값을 화면에 내지 마라(서버도 값을 주지 않는다).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ChevronDown, Download, Loader2, Power } from "lucide-react";
import { useAdminGate } from "@/hooks/useAdminGate";
import { ReelsStatusBadge } from "@/components/reels/ReelsParts";
import { METHOD_LABEL } from "@/lib/reels/constants";
import {
  adminList,
  adminResolve,
  adminSetEnabled,
  adminUploads,
  SECRET_NAMES,
  type AdminList,
  type AdminOrder,
} from "@/lib/reels/api";
import {
  formatBytes,
  kstDateTime,
  mailStatusLabel,
  prettyPhone,
  UPLOAD_KIND_LABEL,
  won,
} from "@/lib/reels/format";

export const Route = createFileRoute("/admin_/reels")({
  component: AdminReelsPage,
  head: () => ({
    meta: [
      { title: "릴스 주문 — 에이아이솔루션 관리자" },
      { name: "description", content: "릴스 제작 주문 관리 화면" },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "릴스 주문 — 에이아이솔루션 관리자" },
    ],
  }),
});

function AdminReelsPage() {
  const ok = useAdminGate();
  if (!ok) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 aria-hidden className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  return <AdminReels />;
}

const LIST_KEY = ["admin-reels"];

function AdminReels() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => {
      const r = await adminList();
      if (!r.ok) throw new Error(r.error);
      return r as AdminList;
    },
    refetchOnWindowFocus: false,
  });

  const checkCount = (q.data?.orders ?? []).filter((o) => o.needs_check).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 text-foreground">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/admin"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" /> 관리자
        </Link>
        <h1 className="font-display text-2xl font-bold">릴스 주문</h1>
      </div>

      {q.isLoading && <Loader2 aria-hidden className="mt-10 h-6 w-6 animate-spin text-primary" />}
      {q.error && <p className="mt-6 text-sm text-rose-700">{(q.error as Error).message}</p>}

      {q.data && (
        <>
          <SwitchPanel data={q.data} onChanged={() => void qc.invalidateQueries({ queryKey: LIST_KEY })} />
          <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">주문 {q.data.orders.length}건</h2>
            <div className="text-sm text-muted-foreground">
              확인 필요{" "}
              <span className={checkCount ? "font-semibold text-rose-700" : ""}>{checkCount}건</span>
              {q.data.review_events > 0 && (
                <span className="ml-3">검토할 결제 통보 {q.data.review_events}건</span>
              )}
            </div>
          </div>
          <ul className="mt-3 space-y-3">
            {q.data.orders.map((o) => (
              <OrderCard
                key={o.id}
                o={o}
                onChanged={() => void qc.invalidateQueries({ queryKey: LIST_KEY })}
              />
            ))}
            {q.data.orders.length === 0 && (
              <li className="text-sm text-muted-foreground">아직 주문이 없습니다.</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

function SwitchPanel({ data, onChanged }: { data: AdminList; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const on = data.settings.enabled;
  const missing = SECRET_NAMES.filter((n) => n !== "RESEND_API_KEY" && !data.secrets[n]);

  async function toggle() {
    const next = !on;
    const msg = next
      ? missing.length
        ? `결제 비밀값 ${missing.length}개가 없습니다. 켜도 손님 화면은 「결제 준비 중」으로 보입니다. 그래도 켤까요?`
        : "결제를 켭니다. 손님이 바로 결제할 수 있게 됩니다. 켤까요?"
      : "결제를 끕니다. 손님 화면이 「결제 준비 중」으로 바뀝니다. 끌까요?";
    if (!window.confirm(msg)) return;
    setBusy(true);
    const r = await adminSetEnabled(next);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(next ? "결제를 켰습니다." : "결제를 껐습니다.");
    onChanged();
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm" data-testid="switch-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">결제 스위치</div>
          <div className="mt-0.5 flex items-center gap-2 font-display text-lg font-bold">
            <span
              aria-hidden
              className={`h-2.5 w-2.5 rounded-full ${on ? "bg-emerald-500" : "bg-muted-foreground"}`}
            />
            {on ? "켜짐" : "꺼짐"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          className={`inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-60 ${
            on
              ? "border border-rose-500/50 bg-card text-rose-700 hover:bg-rose-50"
              : "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground"
          }`}
        >
          {busy ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Power aria-hidden className="h-4 w-4" />}
          {on ? "결제 끄기" : "결제 켜기"}
        </button>
      </div>
      <div className="mt-4 text-xs text-muted-foreground">비밀값(값은 보이지 않습니다)</div>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {SECRET_NAMES.map((n) => (
          <li
            key={n}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              data.secrets[n]
                ? "border-emerald-600/30 bg-emerald-50 text-emerald-800"
                : "border-rose-500/40 bg-rose-50 text-rose-800"
            }`}
          >
            {n} · {data.secrets[n] ? "있음" : "없음"}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </>
  );
}

function OrderCard({ o, onChanged }: { o: AdminOrder; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const uploads = useQuery({
    queryKey: ["admin-reels-uploads", o.id],
    enabled: open,
    queryFn: async () => {
      const r = await adminUploads(o.id);
      if (!r.ok) throw new Error(r.error);
      return r.uploads;
    },
  });

  async function resolve() {
    setBusy(true);
    const r = await adminResolve(o.id, note.trim());
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(`${o.order_no} 확인 완료로 바꿨습니다.`);
    setNote("");
    onChanged();
  }

  return (
    <li
      data-testid="admin-order"
      className={`rounded-2xl border bg-card p-4 shadow-sm ${o.needs_check ? "border-rose-500/60" : "border-border"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-base font-bold">{o.order_no}</div>
          <div className="text-xs text-muted-foreground">{kstDateTime(o.created_at)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {o.needs_check && (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/50 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
              <AlertTriangle aria-hidden className="h-3.5 w-3.5" /> 확인 필요
            </span>
          )}
          <ReelsStatusBadge status={o.status} />
        </div>
      </div>

      {o.needs_check && (
        <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-50 p-3">
          <p className="text-sm text-rose-800">{o.check_reason ?? "사유 없음"}</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="처리 메모(선택)"
              className="min-h-10 flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void resolve()}
              disabled={busy}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60"
            >
              {busy && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />} 확인 완료
            </button>
          </div>
        </div>
      )}

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
        <Row k="상품" v={`${o.plan}편${o.is_trial ? " (체험)" : ""}`} />
        <Row
          k="금액"
          v={
            <>
              {o.discount > 0 && <s className="mr-1.5 text-muted-foreground">{won(o.list_price)}</s>}
              <span className="font-semibold">{won(o.amount)}</span>
            </>
          }
        />
        <Row k="상호" v={o.shop_name} />
        <Row k="인스타" v={`@${o.insta_id}`} />
        <Row k="전화" v={prettyPhone(o.phone)} />
        <Row k="이메일" v={<span className="break-all">{o.email}</span>} />
        <Row k="제작 방식" v={METHOD_LABEL[o.method] ?? o.method} />
        <Row k="메일" v={mailStatusLabel(o.mail_status)} />
        <Row k="결제 일시" v={o.paid_at ? kstDateTime(o.paid_at) : "-"} />
        <Row k="결제번호" v={o.mul_no ?? "-"} />
      </dl>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-full border border-border px-3 py-1 text-sm hover:bg-muted"
      >
        자료 {o.upload_count}개
        <ChevronDown aria-hidden className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2">
          {uploads.isLoading && <Loader2 aria-hidden className="h-4 w-4 animate-spin text-primary" />}
          {uploads.error && <p className="text-sm text-rose-700">{(uploads.error as Error).message}</p>}
          {uploads.data && uploads.data.length === 0 && (
            <p className="text-sm text-muted-foreground">올린 자료가 없습니다.</p>
          )}
          <ul className="divide-y divide-border">
            {(uploads.data ?? []).map((u) => (
              <li key={u.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <span className="mr-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {UPLOAD_KIND_LABEL[u.kind] ?? u.kind}
                  </span>
                  <span className="break-all">
                    {u.kind === "file"
                      ? `${u.file_name ?? "파일"} ${u.size_bytes ? `(${formatBytes(u.size_bytes)})` : ""}`
                      : u.kind === "note"
                        ? u.note
                        : u.url}
                  </span>
                </div>
                {u.kind === "file" && u.download_url && (
                  <a
                    href={u.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary-glow underline underline-offset-2"
                  >
                    <Download aria-hidden className="h-4 w-4" /> 내려받기
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
