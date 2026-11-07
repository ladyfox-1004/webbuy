// 관리자 파트너 화면 「정산」 탭의 내려받기 상자 — 은행 대량이체(.xlsx·CSV)와 원천징수 지급 내역(.xlsx).
// 파일은 서버(/api/admin/partner-export)가 만든다. 관리자 토큰을 붙여야 해서 링크 대신 adminFetch → Blob 저장.
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { adminFetch } from "@/hooks/useAdminGate";
import { exportWarnings, fileNameFromDisposition, saveBlob } from "@/lib/partner/download";

export const EXPORT_PRIVACY_NOTE = "이 파일에는 계좌·연락처가 있습니다. 보관에 주의하세요.";

function thisYearRange(month: string): { from: string; to: string } {
  return { from: `${month.slice(0, 4)}-01`, to: month };
}

export function PayoutDownloads({ pendingMonths, month }: { pendingMonths: string[]; month: string }) {
  const [tMonth, setTMonth] = useState(pendingMonths[0] ?? month);
  const init = thisYearRange(month);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string; warnings?: string[] } | null>(null);

  async function get(key: string, url: string, fallback: string) {
    setBusy(key);
    setMsg(null);
    try {
      const res = await adminFetch(url);
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      const name = fileNameFromDisposition(res.headers.get("content-disposition"), fallback);
      const warnings = exportWarnings(res.headers.get("x-export-warnings"));
      saveBlob(await res.blob(), name);
      const rows = res.headers.get("x-export-rows");
      setMsg({ kind: warnings.length ? "error" : "ok", text: `${name} 내려받음${rows ? ` (${rows}줄)` : ""}`, warnings });
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-border bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50";

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid="payout-downloads">
      <h2 className="font-semibold">파일 내려받기</h2>
      <p className="mt-1 rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">{EXPORT_PRIVACY_NOTE}</p>

      <div className="mt-4">
        <div className="text-sm font-medium">은행 대량이체(지급 전 정산)</div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          계좌는 정산을 만들 때 계좌입니다. CSV 는 은행 사이트 업로드용(엑셀로 열면 앞자리 0 이 사라질 수 있어요).
        </p>
        <div className="mt-2 flex gap-2">
          <select
            aria-label="대량이체 정산 달"
            value={tMonth}
            onChange={(e) => setTMonth(e.target.value)}
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-input bg-card px-3 text-base"
          >
            {(pendingMonths.length ? pendingMonths : [month]).map((m) => (
              <option key={m} value={m}>
                {m.replace("-", "년 ")}월
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={busy !== null}
            className={btn}
            onClick={() => get("t-xlsx", `/api/admin/partner-export?kind=transfer&format=xlsx&month=${tMonth}`, `partner-transfer-${tMonth}.xlsx`)}
          >
            {busy === "t-xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} 엑셀(.xlsx)
          </button>
          <button
            type="button"
            disabled={busy !== null}
            className={btn}
            onClick={() => get("t-csv", `/api/admin/partner-export?kind=transfer&format=csv&month=${tMonth}`, `partner-transfer-${tMonth}.csv`)}
          >
            {busy === "t-csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} CSV
          </button>
        </div>
      </div>

      <div className="mt-5">
        <div className="text-sm font-medium">원천징수 지급 내역(지급 완료)</div>
        <p className="mt-0.5 text-xs text-muted-foreground">지급일 기준, 최대 12달. 월별 합계 시트가 함께 들어 있습니다.</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground">
            시작 달
            <input
              type="month"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block min-h-12 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            끝 달
            <input
              type="month"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block min-h-12 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground"
            />
          </label>
        </div>
        <div className="mt-2 flex">
          <button
            type="button"
            disabled={busy !== null || !from || !to}
            className={btn}
            onClick={() => get("w", `/api/admin/partner-export?kind=withholding&from=${from}&to=${to}`, `partner-withholding-${from}_${to}.xlsx`)}
          >
            {busy === "w" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} 지급 내역(.xlsx)
          </button>
        </div>
      </div>

      {msg && (
        <div
          role="status"
          className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
            msg.kind === "ok" ? "border-emerald-500/40 bg-emerald-50 text-emerald-900" : "border-rose-500/40 bg-rose-50 text-rose-800"
          }`}
        >
          {msg.text}
          {msg.warnings && msg.warnings.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {msg.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
