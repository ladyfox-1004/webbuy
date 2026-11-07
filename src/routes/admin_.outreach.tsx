// /admin/outreach — 「채널 라인」 영업 메일(관리자 전용). 휴대폰에서 그날 후보를 보고 고른 곳만 보낸다.
// 🚨 파일 이름이 admin_.outreach 인 이유는 admin_.blog.tsx 머리 주석과 같다(/admin 에 <Outlet/> 이 없다).
// 🚨 head 에는 title·robots 만. canonical 넣지 마라(루트 head 와 합쳐진다).
// 🚨 확인은 window.confirm 대신 화면 안 확인 상자(브라우저 확인창은 자동화를 멈춘다).
// 자료: /api/admin/outreach (src/routes/api/admin/outreach.ts). 메일 본문은 src/lib/outreach/mail.ts 한 곳.
// 맨 위 「자동 발송」 스위치 = outreach_settings.auto_send. 켜져 있으면 워커 예약 실행(30분마다,
// src/server/outreach-tasks/auto-send-task.ts)이 한국 시간 매일 07:00~20:00 에 오늘 묶음 ready 를 보낸다.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, Loader2, RefreshCw, Send } from "lucide-react";
import { adminFetch, useAdminGate } from "@/hooks/useAdminGate";

export const Route = createFileRoute("/admin_/outreach")({
  component: AdminOutreachPage,
  head: () => ({
    meta: [{ title: "영업 메일 — 에이아이솔루션 관리자" }, { name: "robots", content: "noindex" }],
  }),
});

type Status = "ready" | "skipped" | "sending" | "sent" | "failed" | "suppressed";
type Row = {
  id: string;
  batch_date: string;
  channel_name: string;
  channel_url: string;
  subscribers: number | null;
  niche: string | null;
  top_title: string | null;
  top_url: string | null;
  email: string;
  status: Status;
  error: string | null;
  sent_at: string | null;
  preview: { subject: string; text: string; error?: string };
};
type Day = { date: string; counts: Record<Status, number> };
type Resp = {
  today: string;
  date: string;
  gmailConnected: boolean;
  /** 자동 발송 켜짐 여부. 설정 표가 없으면 null */
  autoSend: boolean | null;
  rows: Row[];
  days: Day[];
  totalSent: number;
  error?: string;
};
type SendResp = {
  ok?: boolean;
  error?: string;
  sent?: number;
  failed?: number;
  suppressed?: number;
  notReady?: number;
  deferred?: number;
  skipped?: number;
  changed?: number;
};

const STATUS_LABEL: Record<Status, string> = {
  ready: "준비",
  skipped: "건너뜀",
  sending: "보내는 중",
  sent: "보냄",
  failed: "실패",
  suppressed: "수신거부",
};
const STATUS_CLASS: Record<Status, string> = {
  ready: "border-sky-500/40 bg-sky-50 text-sky-800",
  skipped: "border-border bg-muted text-muted-foreground",
  sending: "border-amber-500/40 bg-amber-50 text-amber-800",
  sent: "border-emerald-500/40 bg-emerald-50 text-emerald-800",
  failed: "border-rose-500/40 bg-rose-50 text-rose-800",
  suppressed: "border-zinc-500/40 bg-zinc-100 text-zinc-700",
};

const n = (v: number) => v.toLocaleString("ko-KR");

function subsLabel(v: number | null) {
  if (v === null || v === undefined) return "구독자 ?";
  if (v >= 10000) return `구독자 ${(v / 10000).toFixed(v >= 100000 ? 0 : 1)}만`;
  return `구독자 ${n(v)}`;
}

/** '2026-11-07' → '11월 7일 (토)' */
function dayLabel(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const w = ["일", "월", "화", "수", "목", "금", "토"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일 (${w})`;
}

function AdminOutreachPage() {
  const ok = useAdminGate();
  if (!ok) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  return <AdminOutreach />;
}

function AdminOutreach() {
  const [date, setDate] = useState<string>("");
  const q = useQuery({
    queryKey: ["admin-outreach", date],
    queryFn: async () => {
      const res = await adminFetch(`/api/admin/outreach${date ? `?date=${date}` : ""}`);
      const body = (await res.json()) as Resp;
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body;
    },
  });
  const data = q.data;
  const rows = useMemo(() => data?.rows ?? [], [data]);

  // 체크: 기본은 준비(ready) 전부
  const [checked, setChecked] = useState<Set<string>>(new Set());
  useEffect(() => {
    setChecked(new Set(rows.filter((r) => r.status === "ready").map((r) => r.id)));
  }, [rows]);

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<null | "send" | "action">(null);
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // 자동 발송 스위치 — 누르면 화면 안 확인 상자, 확인하면 저장
  const [autoConfirm, setAutoConfirm] = useState<null | boolean>(null);
  const [autoBusy, setAutoBusy] = useState(false);

  async function doSetAuto(on: boolean) {
    setAutoConfirm(null);
    setAutoBusy(true);
    setResult(null);
    try {
      const res = await adminFetch("/api/admin/outreach", {
        method: "POST",
        body: JSON.stringify({ action: "set_auto", on }),
      });
      const body = (await res.json().catch(() => ({}))) as { autoSend?: boolean; error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setResult({ kind: "ok", text: body.autoSend ? "자동 발송을 켰습니다." : "자동 발송을 껐습니다. 이제 직접 「보내기」를 눌러야 나갑니다." });
    } catch (e) {
      setResult({ kind: "error", text: (e as Error).message });
    } finally {
      setAutoBusy(false);
      void q.refetch();
    }
  }

  const readyRows = rows.filter((r) => r.status === "ready");
  const selected = readyRows.filter((r) => checked.has(r.id));
  const unselectedReady = readyRows.length - selected.length;
  const count = (s: Status) => rows.filter((r) => r.status === s).length;

  async function post(action: "send" | "skip" | "retry", ids: string[]) {
    const res = await adminFetch("/api/admin/outreach", {
      method: "POST",
      body: JSON.stringify({ action, ids }),
    });
    const body = (await res.json().catch(() => ({}))) as SendResp;
    if (!res.ok && !body.sent) throw new Error(body.error ?? `HTTP ${res.status}`);
    return body;
  }

  async function doSend() {
    setConfirming(false);
    setBusy("send");
    setResult(null);
    try {
      const r = await post("send", selected.map((x) => x.id));
      const parts = [`보냄 ${n(r.sent ?? 0)}통`];
      if (r.failed) parts.push(`실패 ${n(r.failed)}통`);
      if (r.suppressed) parts.push(`수신거부라 뺌 ${n(r.suppressed)}곳`);
      if (r.notReady) parts.push(`이미 처리된 ${n(r.notReady)}곳은 그대로`);
      if (r.deferred) parts.push(`한 번에 20통까지라 ${n(r.deferred)}곳은 다음에`);
      if (r.skipped) parts.push(`고르지 않은 ${n(r.skipped)}곳은 건너뜀`);
      setResult({ kind: r.failed || r.error ? "error" : "ok", text: `${parts.join(" · ")}${r.error ? ` — ${r.error}` : ""}` });
    } catch (e) {
      setResult({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
      void q.refetch();
    }
  }

  async function doAction(action: "skip" | "retry", id: string) {
    setBusy("action");
    setResult(null);
    try {
      const r = await post(action, [id]);
      setResult({
        kind: "ok",
        text: action === "retry" ? `다시 보낼 준비로 돌림 ${n(r.changed ?? 0)}곳` : `건너뜀 ${n(r.changed ?? 0)}곳`,
      });
    } catch (e) {
      setResult({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
      void q.refetch();
    }
  }

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const seconds = Math.max(1, Math.round(Math.min(selected.length, 20) * 1.8));

  return (
    <div className="mx-auto max-w-2xl px-4 pb-40 pt-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> 관리자
          </Link>
          <h1 className="font-display text-2xl font-bold">영업 메일</h1>
        </div>
        <button
          type="button"
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} /> 새로고침
        </button>
      </div>

      {data && (
        <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold">
              자동 발송{" "}
              {data.autoSend === null ? (
                <span className="text-muted-foreground">확인 안 됨</span>
              ) : data.autoSend ? (
                <span className="text-emerald-700">켜짐</span>
              ) : (
                <span className="text-muted-foreground">꺼짐</span>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={data.autoSend === true}
              aria-label="자동 발송 켜고 끄기"
              disabled={data.autoSend === null || autoBusy || busy !== null}
              onClick={() => setAutoConfirm(!data.autoSend)}
              className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
                data.autoSend ? "bg-emerald-600" : "bg-zinc-300"
              }`}
            >
              <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition ${data.autoSend ? "translate-x-7" : "translate-x-1"}`} />
            </button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            매일 아침 7시~저녁 8시, 노트북이 골라 넣으면 30분 안에 자동으로 보냅니다. 항의·신고가 오면 꺼 주세요.
          </p>
          {data.autoSend === null && (
            <p className="mt-2 text-sm text-amber-800">설정 표가 아직 없습니다 — 마이그레이션 20261107130000_outreach_settings.sql 을 적용해 주세요.</p>
          )}
        </section>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">날짜</span>
          <input
            type="date"
            value={date || data?.date || ""}
            max={data?.today}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-2 text-base"
          />
        </label>
        {data && date && date !== data.today && (
          <button type="button" onClick={() => setDate("")} className="text-sm text-primary underline">
            오늘로
          </button>
        )}
      </div>

      {q.isLoading && <Loader2 className="mt-10 h-6 w-6 animate-spin text-primary" />}
      {q.error && <p className="mt-6 rounded-xl border border-rose-500/40 bg-rose-50 px-4 py-3 text-sm text-rose-800">{(q.error as Error).message}</p>}

      {data && (
        <>
          {!data.gmailConnected && (
            <p className="mt-4 rounded-xl border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              지메일 연결 안 됨 — 보내기 단추가 동작하지 않습니다. 워커 비밀값 GMAIL_CLIENT_ID·GMAIL_CLIENT_SECRET·GMAIL_REFRESH_TOKEN 을 넣어 주세요.
            </p>
          )}

          <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="text-sm text-muted-foreground">{dayLabel(data.date)}</div>
            <div className="mt-1 text-lg font-semibold">
              준비 {n(count("ready"))} · 보냄 {n(count("sent"))} · 실패 {n(count("failed"))}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              건너뜀 {n(count("skipped"))} · 수신거부 {n(count("suppressed"))}
              {count("sending") > 0 && ` · 보내는 중 ${n(count("sending"))}`} · 지금까지 보낸 메일 {n(data.totalSent)}통
            </div>
          </section>

          {result && (
            <p
              role="status"
              className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                result.kind === "ok" ? "border-emerald-500/40 bg-emerald-50 text-emerald-900" : "border-rose-500/40 bg-rose-50 text-rose-900"
              }`}
            >
              {result.text}
            </p>
          )}

          {rows.length === 0 ? (
            <p className="mt-8 text-center text-sm text-muted-foreground">이 날짜에는 후보가 없습니다.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {rows.map((r) => (
                <li key={r.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`${r.channel_name} 보내기 고르기`}
                      className="mt-1 h-5 w-5 shrink-0 accent-primary"
                      checked={checked.has(r.id)}
                      disabled={r.status !== "ready" || busy !== null}
                      onChange={() => toggle(r.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <a href={r.channel_url} target="_blank" rel="noreferrer" className="font-semibold text-foreground underline-offset-2 hover:underline">
                          {r.channel_name}
                        </a>
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {subsLabel(r.subscribers)}
                        {r.niche ? ` · ${r.niche}` : ""}
                      </div>
                      <div className="mt-1 break-all text-sm">{r.email}</div>
                      {r.top_title && (
                        <div className="mt-1 text-sm">
                          대표 영상:{" "}
                          {r.top_url ? (
                            <a href={r.top_url} target="_blank" rel="noreferrer" className="underline">
                              {r.top_title}
                            </a>
                          ) : (
                            r.top_title
                          )}
                        </div>
                      )}
                      {r.status === "failed" && r.error && <div className="mt-2 text-sm text-rose-700">{r.error}</div>}
                      <details className="group mt-2">
                        <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-primary">
                          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" /> 메일 미리보기
                        </summary>
                        <div className="mt-2 rounded-xl bg-muted/60 p-3 text-sm">
                          <div className="font-semibold">{r.preview.subject}</div>
                          <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-foreground/90">
                            {r.preview.error ?? r.preview.text}
                          </pre>
                        </div>
                      </details>
                      <div className="mt-2 flex gap-2">
                        {r.status === "failed" && (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => doAction("retry", r.id)}
                            className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
                          >
                            다시 시도
                          </button>
                        )}
                        {r.status === "ready" && (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => doAction("skip", r.id)}
                            className="rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-60"
                          >
                            건너뛰기
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {data.days.length > 0 && (
            <section className="mt-8 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h2 className="font-semibold">최근 14일</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[360px] text-sm">
                  <thead className="border-b border-border text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-2 font-medium">날짜</th>
                      <th className="px-1 py-2 text-right font-medium">준비</th>
                      <th className="px-1 py-2 text-right font-medium">보냄</th>
                      <th className="px-1 py-2 text-right font-medium">실패</th>
                      <th className="px-1 py-2 text-right font-medium">건너뜀</th>
                      <th className="py-2 pl-1 text-right font-medium">수신거부</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.days.map((d) => {
                      const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
                      return (
                        <tr
                          key={d.date}
                          onClick={() => setDate(d.date)}
                          className={`cursor-pointer border-b border-border/50 last:border-0 hover:bg-muted/50 ${total === 0 ? "text-muted-foreground" : ""} ${d.date === data.date ? "font-semibold" : ""}`}
                        >
                          <td className="py-1.5 pr-2 whitespace-nowrap">{dayLabel(d.date)}</td>
                          <td className="px-1 py-1.5 text-right">{n(d.counts.ready)}</td>
                          <td className="px-1 py-1.5 text-right">{n(d.counts.sent)}</td>
                          <td className="px-1 py-1.5 text-right">{n(d.counts.failed)}</td>
                          <td className="px-1 py-1.5 text-right">{n(d.counts.skipped)}</td>
                          <td className="py-1.5 pl-1 text-right">{n(d.counts.suppressed)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {readyRows.length > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
              <div className="mx-auto max-w-2xl">
                {data.autoSend === true && busy !== "send" && (
                  <p className="mb-2 text-center text-sm text-muted-foreground">
                    자동 발송이 켜져 있어 곧 자동으로 나갑니다. 빼고 싶은 곳은 '건너뛰기'
                  </p>
                )}
                {busy === "send" ? (
                  <div className="flex items-center justify-center gap-2 py-3 text-base">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    보내는 중… {n(selected.length)}곳, 30초 안팎 걸려요(약 {n(seconds)}초). 화면을 닫지 마세요.
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={selected.length === 0 || busy !== null || !data.gmailConnected}
                    onClick={() => setConfirming(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary to-primary-glow px-5 py-4 text-lg font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    <Send className="h-5 w-5" /> 선택한 {n(selected.length)}곳 보내기
                  </button>
                )}
              </div>
            </div>
          )}

          {autoConfirm !== null && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="outreach-auto-title">
              <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-xl">
                <h2 id="outreach-auto-title" className="text-lg font-bold">
                  {autoConfirm ? "자동 발송을 켤까요?" : "자동 발송을 끌까요?"}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {autoConfirm
                    ? "매일 아침 7시~저녁 8시 사이, 그날 준비된 곳에 30분 안에 자동으로 메일이 나갑니다. 보내면 대표님 카톡으로 알려 드려요."
                    : "끄면 자동으로 나가지 않습니다. 보내려면 직접 골라서 「보내기」를 눌러 주세요."}
                </p>
                <div className="mt-6 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAutoConfirm(null)}
                    className="flex-1 rounded-2xl border border-border px-4 py-3 text-base"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => doSetAuto(autoConfirm)}
                    className="flex-1 rounded-2xl bg-gradient-to-br from-primary to-primary-glow px-4 py-3 text-base font-semibold text-primary-foreground"
                  >
                    {autoConfirm ? "켜기" : "끄기"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {confirming && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="outreach-confirm-title">
              <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-xl">
                <h2 id="outreach-confirm-title" className="text-lg font-bold">
                  {n(selected.length)}곳에 메일을 보낼까요?
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  대표님 지메일(nancoco0705@gmail.com)로 한 통씩 보냅니다. 한 번 보내면 되돌릴 수 없습니다.
                  {selected.length > 20 && " 한 번에 20통까지만 보내고, 나머지는 준비 상태로 남습니다."}
                  {unselectedReady > 0 && ` 고르지 않은 ${n(unselectedReady)}곳은 「건너뜀」으로 바뀝니다.`}
                </p>
                <div className="mt-6 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="flex-1 rounded-2xl border border-border px-4 py-3 text-base"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={doSend}
                    className="flex-1 rounded-2xl bg-gradient-to-br from-primary to-primary-glow px-4 py-3 text-base font-semibold text-primary-foreground"
                  >
                    보내기
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
