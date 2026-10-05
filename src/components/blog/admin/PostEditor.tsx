// 관리자 글 편집 화면. 왼쪽 마크다운 입력, 오른쪽 미리보기(공개 화면과 같은 Markdown 컴포넌트).
// post 가 null 이면 "새 글"(저장하면 status=note 로 만들어진다).

import { useState } from "react";
import { ArrowLeft, BookOpen, Check, ExternalLink, Loader2, Rocket, Save } from "lucide-react";
import { Markdown } from "@/components/blog/Markdown";
import { DeletePostButton } from "@/components/blog/admin/DeletePostButton";
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  slugify,
  type BlogCategory,
  type BlogPost,
  type BlogStatus,
} from "@/lib/blog";
import type { BlogPostDraft } from "@/lib/blog-admin";

export type EditorAction = "save" | "approve" | "publish" | "note" | "delete";

const inputCls =
  "w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/60";

function toDraft(post: BlogPost | null): BlogPostDraft {
  return {
    title: post?.title ?? "",
    slug: post?.slug ?? "",
    description: post?.description ?? "",
    category: post?.category ?? "ai-dev",
    body_md: post?.body_md ?? "",
    my_note: post?.my_note ?? "",
  };
}

export function PostEditor({
  post,
  busy,
  onBack,
  onAction,
}: {
  post: BlogPost | null;
  busy: EditorAction | null;
  onBack: () => void;
  onAction: (action: EditorAction, draft: BlogPostDraft) => void;
}) {
  const [draft, setDraft] = useState<BlogPostDraft>(() => toDraft(post));
  const set = <K extends keyof BlogPostDraft>(k: K, v: BlogPostDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const status = (post?.status ?? "note") as BlogStatus;
  const canSave = draft.title.trim().length > 0 && busy === null;
  const slugPreview = slugify(draft.slug || draft.title) || "post";

  const btn = (
    action: EditorAction,
    label: string,
    Icon: typeof Save,
    primary = false,
    show = true,
  ) =>
    show && (
      <button
        type="button"
        disabled={!canSave}
        onClick={() => onAction(action, draft)}
        className={
          primary
            ? "inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2 text-sm font-medium text-primary-foreground transition disabled:opacity-50"
            : "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/40 px-4 py-2 text-sm text-foreground transition hover:bg-surface disabled:opacity-50"
        }
      >
        {busy === action ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
        {label}
      </button>
    );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> 목록
        </button>
        <span className="rounded-full border border-border px-3 py-0.5 text-xs text-muted-foreground">
          {post ? STATUS_LABELS[status] : "새 글"}
        </span>
        {post?.status === "published" && (
          <a
            href={`/blog/${encodeURIComponent(post.slug)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary-glow"
          >
            공개 화면 <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">제목</span>
          <input
            className={inputCls}
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">
            주소(slug) — 비우면 제목으로 만듦
          </span>
          <input
            className={inputCls}
            value={draft.slug}
            placeholder={slugPreview}
            onChange={(e) => set("slug", e.target.value)}
          />
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            /blog/{slugPreview}
          </span>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block text-muted-foreground">
            설명(검색 결과·카드에 나옴, 120자 안팎)
          </span>
          <input
            className={inputCls}
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">분류</span>
          <select
            className={inputCls}
            value={draft.category}
            onChange={(e) => set("category", e.target.value as BlogCategory)}
          >
            {(Object.keys(CATEGORY_LABELS) as BlogCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
                {c === "story" ? " (공개 탭 없음 — 발행 시 사업 인사이트로)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">이서연의 한 줄(선택)</span>
          <input
            className={inputCls}
            value={draft.my_note ?? ""}
            onChange={(e) => set("my_note", e.target.value)}
          />
        </label>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">본문(마크다운)</span>
          <textarea
            className={`${inputCls} min-h-[560px] resize-y font-mono leading-relaxed`}
            value={draft.body_md}
            onChange={(e) => set("body_md", e.target.value)}
          />
        </label>
        <div className="text-sm">
          <span className="mb-1 block text-muted-foreground">미리보기</span>
          <div className="max-h-[560px] min-h-[560px] overflow-y-auto rounded-xl border border-border bg-background/40 px-5 py-2">
            {draft.body_md.trim() ? (
              <Markdown source={draft.body_md} />
            ) : (
              <p className="py-6 text-muted-foreground">본문을 입력하면 여기에 보입니다.</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {btn("save", post ? "저장" : "새 글 저장(공부 노트)", Save, true)}
        {btn(
          "approve",
          "승인(발행 예정)",
          Check,
          false,
          !!post && status !== "scheduled" && status !== "published",
        )}
        {btn("publish", "지금 발행", Rocket, false, !!post && status !== "published")}
        {btn("note", "공부 노트로", BookOpen, false, !!post && status !== "note")}
        {post && (
          <div className="ml-auto">
            <DeletePostButton
              title={post.title}
              disabled={busy !== null}
              onConfirm={() => onAction("delete", draft)}
            />
          </div>
        )}
      </div>
      {draft.category === "story" && (
        <p className="mt-3 text-xs text-amber-400">
          「이야기」 분류는 공개 탭이 없습니다. 발행하려면 「사업 인사이트」로 바꾸세요.
        </p>
      )}
    </div>
  );
}
