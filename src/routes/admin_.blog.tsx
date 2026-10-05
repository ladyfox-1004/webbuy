// /admin/blog — 블로그 관리자(1단계: 수동 글 편집·발행).
// 🚨 파일 이름이 admin_.blog 인 이유: admin.blog 로 두면 /admin(AdminPage) 의 자식이 되는데
//    AdminPage 에는 <Outlet/> 이 없어 이 화면이 안 보인다(admin.review 가 그 상태다).
// 🚨 권한 확인을 beforeLoad 에 두지 않는다. 로그인 세션은 브라우저(localStorage)에만 있어서
//    서버에서 돌면 로그인한 관리자도 /login 으로 튕기고, ssr:false + beforeLoad redirect 는
//    hydration 오류를 낸다. 화면이 뜬 뒤 useAdminGate 로 확인하고, 실제 보호는 RLS 가 한다.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, NotebookPen, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PostEditor, type EditorAction } from "@/components/blog/admin/PostEditor";
import {
  createPost,
  deletePost,
  listPostsByStatus,
  savePost,
  type BlogPostDraft,
} from "@/lib/blog-admin";
import {
  STATUS_LABELS,
  categoryLabel,
  formatDate,
  type BlogPost,
  type BlogStatus,
} from "@/lib/blog";

export const Route = createFileRoute("/admin_/blog")({
  component: AdminBlogPage,
  head: () => ({
    meta: [
      { title: "블로그 관리 — 에이아이솔루션(AISOLITION)" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const TABS: BlogStatus[] = ["review", "note", "scheduled", "published"];

/** /admin 의 beforeLoad 와 같은 확인(user_roles.role='admin')을 화면이 뜬 뒤에 한다. */
function useAdminGate(): boolean {
  const navigate = useNavigate();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return void navigate({ to: "/login", replace: true });
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!role) return void navigate({ to: "/", replace: true });
      if (alive) setOk(true);
    })();
    return () => {
      alive = false;
    };
  }, [navigate]);
  return ok;
}

/** 편집 대상: null = 목록, "new" = 새 글, BlogPost = 기존 글 */
type Editing = null | "new" | BlogPost;

function AdminBlogPage() {
  const ok = useAdminGate();
  if (!ok) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary-glow" />
      </div>
    );
  }
  return <AdminBlog />;
}

function AdminBlog() {
  const [tab, setTab] = useState<BlogStatus>("review");
  const [editing, setEditing] = useState<Editing>(null);
  const [busy, setBusy] = useState<EditorAction | null>(null);
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["admin-blog", tab],
    queryFn: () => listPostsByStatus(tab),
  });

  const mut = useMutation({
    mutationFn: async ({ action, draft }: { action: EditorAction; draft: BlogPostDraft }) => {
      const now = new Date().toISOString();
      if (editing === "new") return { post: await createPost(draft), action };
      if (!editing) throw new Error("편집 중인 글이 없습니다.");
      const id = editing.id;
      switch (action) {
        case "delete":
          await deletePost(id);
          return { post: null, action };
        case "approve":
          return {
            post: await savePost(id, draft, { status: "scheduled", approved_at: now }),
            action,
          };
        case "publish":
          return {
            post: await savePost(id, draft, { status: "published", published_at: now }),
            action,
          };
        case "note":
          return { post: await savePost(id, draft, { status: "note" }), action };
        default:
          return { post: await savePost(id, draft), action };
      }
    },
    onMutate: ({ action }) => setBusy(action),
    onSettled: () => setBusy(null),
    onSuccess: ({ post, action }) => {
      qc.invalidateQueries({ queryKey: ["admin-blog"] });
      const msg: Record<EditorAction, string> = {
        save: "저장했습니다.",
        approve: "승인했습니다. 발행 예정으로 옮겼습니다.",
        publish: "발행했습니다.",
        note: "공부 노트로 옮겼습니다.",
        delete: "삭제했습니다.",
      };
      toast.success(msg[action]);
      if (!post) {
        setEditing(null);
        return;
      }
      setEditing(post);
      setTab(post.status as BlogStatus);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "실패했습니다."),
  });

  return (
    <div className="min-h-screen px-4 py-20">
      <div className="mx-auto mt-12 max-w-6xl">
        <Link
          to="/admin"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          관리자
        </Link>
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <NotebookPen className="h-7 w-7 text-primary-glow" />
          <h1 className="font-display text-4xl font-bold">블로그</h1>
          {editing === null && (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> 새 글
            </button>
          )}
        </div>

        {editing !== null ? (
          <PostEditor
            key={editing === "new" ? "new" : `${editing.id}:${editing.updated_at}`}
            post={editing === "new" ? null : editing}
            busy={busy}
            onBack={() => setEditing(null)}
            onAction={(action, draft) => mut.mutate({ action, draft })}
          />
        ) : (
          <>
            <div className="mb-6 flex gap-1 overflow-x-auto rounded-full border border-border bg-surface/40 p-1">
              {TABS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={`flex-1 rounded-full px-4 py-2 text-sm whitespace-nowrap transition ${
                    tab === k
                      ? "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {STATUS_LABELS[k]}
                </button>
              ))}
            </div>
            <PostList
              loading={list.isLoading}
              error={list.error}
              posts={list.data ?? []}
              onSelect={(p) => setEditing(p)}
            />
          </>
        )}
      </div>
    </div>
  );
}

function PostList({
  loading,
  error,
  posts,
  onSelect,
}: {
  loading: boolean;
  error: unknown;
  posts: BlogPost[];
  onSelect: (p: BlogPost) => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary-glow" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-3xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        글을 불러오지 못했습니다: {error instanceof Error ? error.message : String(error)}
        <div className="mt-1 text-xs text-muted-foreground">
          blog_posts 테이블 마이그레이션(20261005100000_blog.sql)을 실행했는지 확인하세요.
        </div>
      </div>
    );
  }
  if (posts.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border px-6 py-14 text-center text-sm text-muted-foreground">
        이 탭에는 글이 없습니다.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-surface/40">
      {posts.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onSelect(p)}
            className="flex w-full flex-col gap-1 px-5 py-4 text-left transition hover:bg-surface/70 md:flex-row md:items-center md:gap-4"
          >
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
              {p.title || "(제목 없음)"}
            </span>
            <span className="text-xs text-muted-foreground">{categoryLabel(p.category)}</span>
            <span className="text-xs text-muted-foreground md:w-32 md:text-right">
              {formatDate(p.published_at ?? p.updated_at)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
