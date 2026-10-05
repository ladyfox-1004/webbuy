// 관리자 블로그 — "실패한 영상" 탭. 3번 실패한 blog_sources(status=failed)를 보여 주고 다시 시도하게 한다.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { formatDate, youtubeWatchUrl } from "@/lib/blog";
import { listFailedSources, retrySource } from "@/lib/blog-admin";

export function FailedSourceList() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-blog-failed"], queryFn: listFailedSources });

  const retry = useMutation({
    mutationFn: (videoId: string) => retrySource(videoId),
    onSuccess: () => {
      toast.success("대기열로 되돌렸습니다. 다음 수집 때 다시 처리합니다.");
      qc.invalidateQueries({ queryKey: ["admin-blog-failed"] });
      qc.invalidateQueries({ queryKey: ["admin-blog-pending"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "실패했습니다."),
  });

  if (list.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary-glow" />
      </div>
    );
  }
  if (list.error) {
    return (
      <div className="rounded-3xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        불러오지 못했습니다: {list.error instanceof Error ? list.error.message : String(list.error)}
      </div>
    );
  }
  const rows = list.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border px-6 py-14 text-center text-sm text-muted-foreground">
        실패한 영상이 없습니다.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-surface/40">
      {rows.map((s) => (
        <li
          key={s.video_id}
          className="flex flex-col gap-2 px-5 py-4 md:flex-row md:items-start md:gap-4"
        >
          <div className="min-w-0 flex-1">
            <a
              href={youtubeWatchUrl(s.video_id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1 font-medium text-foreground hover:underline"
            >
              <span className="truncate">{s.title || s.video_id}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </a>
            <p className="mt-1 text-xs break-words text-destructive">
              {s.last_error || "(오류 기록 없음)"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              시도 {s.attempts}회 · 등록 {formatDate(s.created_at)}
            </p>
          </div>
          <button
            type="button"
            disabled={retry.isPending}
            onClick={() => retry.mutate(s.video_id)}
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-border bg-background/60 px-4 py-2 text-sm transition hover:bg-surface/70 disabled:opacity-50"
          >
            {retry.isPending && retry.variables === s.video_id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            다시 시도
          </button>
        </li>
      ))}
    </ul>
  );
}
