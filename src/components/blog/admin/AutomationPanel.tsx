// 관리자 블로그 — 자동화(2·3단계) 조작판: 대기 중 영상 수, 영상 링크 추가, 수집·예약 발행 수동 실행.
// 수동 실행은 /api/admin/blog/run 을 부른다(서버가 관리자 토큰을 다시 확인한다).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Link2, Loader2, Send } from "lucide-react";
import {
  addSourceFromLink,
  countPendingSources,
  runAutomationJob,
  type AutomationJob,
} from "@/lib/blog-admin";

const btnCls =
  "inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-4 py-2 text-sm text-foreground transition hover:bg-surface/70 disabled:cursor-not-allowed disabled:opacity-50";

/** 실행 결과(JSON) → toast 한 줄 + 자세한 설명. */
function summarizeJobResult(r: Record<string, unknown>): {
  ok: boolean;
  title: string;
  detail?: string;
} {
  const errors = Array.isArray(r.errors) ? (r.errors as string[]) : [];
  const skipped = typeof r.skipped === "string" ? r.skipped : null;
  if (r.job === "publish") {
    const p = r.published as { title?: string } | null;
    if (p) return { ok: true, title: `발행했습니다: ${p.title ?? ""}` };
    if (skipped || errors.length)
      return {
        ok: false,
        title: "예약 발행 실패",
        detail: [skipped, ...errors].filter(Boolean).join("\n"),
      };
    return { ok: true, title: "발행 예정 글이 없습니다." };
  }
  const processed = Array.isArray(r.processed) ? (r.processed as { status: string }[]) : [];
  const failed = Array.isArray(r.failed) ? r.failed.length : 0;
  const review = processed.filter((p) => p.status === "review").length;
  const parts = [
    `재생목록 ${Number(r.playlistFound ?? 0)}개`,
    `새 영상 ${Number(r.newSources ?? 0)}개`,
    `초안 ${processed.length}개(검토 대기 ${review} · 공부 노트 ${processed.length - review})`,
    `실패 ${failed}개`,
  ];
  if (r.quotaStopped) parts.push("Gemini 한도 초과로 중단(내일 재시도)");
  if (typeof r.pendingLeft === "number") parts.push(`남은 대기 ${r.pendingLeft}개`);
  const detail = [skipped, ...errors].filter(Boolean).join("\n") || undefined;
  return { ok: !skipped && errors.length === 0 && failed === 0, title: parts.join(" · "), detail };
}

export function AutomationPanel() {
  const qc = useQueryClient();
  const [link, setLink] = useState("");

  const pending = useQuery({ queryKey: ["admin-blog-pending"], queryFn: countPendingSources });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-blog"] });
    qc.invalidateQueries({ queryKey: ["admin-blog-pending"] });
    qc.invalidateQueries({ queryKey: ["admin-blog-failed"] });
  };

  const add = useMutation({
    mutationFn: (l: string) => addSourceFromLink(l),
    onSuccess: ({ videoId }) => {
      toast.success(`대기열에 넣었습니다(${videoId}). 다음 수집 때 초안이 만들어집니다.`);
      setLink("");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "추가하지 못했습니다."),
  });

  const run = useMutation({
    mutationFn: (job: AutomationJob) => runAutomationJob(job),
    onSuccess: (r) => {
      const s = summarizeJobResult(r);
      (s.ok ? toast.success : toast.warning)(s.title, {
        description: s.detail,
        duration: 12000,
      });
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "실행하지 못했습니다."),
  });

  const running = run.isPending ? run.variables : null;

  return (
    <div className="mb-6 rounded-3xl border border-border bg-surface/40 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">
          대기 중 영상{" "}
          <strong className="text-foreground">
            {pending.isLoading ? "…" : pending.error ? "?" : `${pending.data}개`}
          </strong>
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            className={btnCls}
            disabled={run.isPending}
            onClick={() => run.mutate("collect")}
          >
            {running === "collect" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            지금 수집 실행
          </button>
          <button
            type="button"
            className={btnCls}
            disabled={run.isPending}
            onClick={() => run.mutate("publish")}
          >
            {running === "publish" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            지금 예약 발행 실행
          </button>
        </div>
      </div>
      {running === "collect" && (
        <p className="mt-2 text-xs text-muted-foreground">
          영상 분석에 1편당 30초~2분 걸립니다. 창을 닫지 마세요.
        </p>
      )}
      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (link.trim()) add.mutate(link);
        }}
      >
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="유튜브 영상 링크(watch, youtu.be, shorts)"
            className="w-full rounded-xl border border-border bg-background/60 py-2 pr-3 pl-9 text-sm text-foreground outline-none transition focus:border-primary/60"
          />
        </div>
        <button type="submit" className={btnCls} disabled={add.isPending || !link.trim()}>
          {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          영상 링크 추가
        </button>
      </form>
    </div>
  );
}
