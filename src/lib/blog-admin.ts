// 관리자 블로그 편집 — 브라우저에서 로그인한 관리자 세션으로 직접 쓴다.
// 권한은 RLS("admins manage posts" = has_role(auth.uid(),'admin'))가 지킨다.
// 🚨 service_role 을 쓰지 마라(공개 저장소).

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { dedupeSlug, slugify, type BlogPost, type BlogStatus } from "@/lib/blog";
import { extractVideoId } from "@/lib/blog-automation/youtube";

export type BlogPostDraft = Pick<
  BlogPost,
  "title" | "slug" | "description" | "category" | "body_md" | "my_note"
>;

export async function listPostsByStatus(status: BlogStatus): Promise<BlogPost[]> {
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("status", status)
    .order(status === "published" ? "published_at" : "updated_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** slug 를 비우면 제목으로 만들고, 다른 글과 겹치면 -2, -3 … 을 붙인다. */
async function resolveSlug(draft: BlogPostDraft, selfId: string | null): Promise<string> {
  const base = slugify(draft.slug || draft.title) || "post";
  const { data, error } = await supabase
    .from("blog_posts")
    .select("id, slug")
    .like("slug", `${base}%`);
  if (error) throw new Error(error.message);
  const taken = (data ?? []).filter((r) => r.id !== selfId).map((r) => r.slug);
  return dedupeSlug(base, taken);
}

function clean(draft: BlogPostDraft) {
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    category: draft.category,
    body_md: draft.body_md,
    my_note: draft.my_note?.trim() ? draft.my_note.trim() : null,
  };
}

export async function createPost(draft: BlogPostDraft): Promise<BlogPost> {
  const slug = await resolveSlug(draft, null);
  const { data, error } = await supabase
    .from("blog_posts")
    .insert({ ...clean(draft), slug, status: "note" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function savePost(
  id: string,
  draft: BlogPostDraft,
  extra: Partial<Pick<BlogPost, "status" | "approved_at" | "published_at">> = {},
): Promise<BlogPost> {
  const slug = await resolveSlug(draft, id);
  const { data, error } = await supabase
    .from("blog_posts")
    .update({ ...clean(draft), slug, ...extra })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deletePost(id: string): Promise<void> {
  const { error } = await supabase.from("blog_posts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ───────────── 2단계: 유튜브 대기열(blog_sources) · 자동화 수동 실행 ─────────────

export type BlogSource = Database["public"]["Tables"]["blog_sources"]["Row"];

export async function countPendingSources(): Promise<number> {
  const { count, error } = await supabase
    .from("blog_sources")
    .select("video_id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function listFailedSources(): Promise<BlogSource[]> {
  const { data, error } = await supabase
    .from("blog_sources")
    .select("*")
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** 실패한 영상을 대기열로 되돌린다(attempts 0). 다음 수집 실행 때 다시 처리된다. */
export async function retrySource(videoId: string): Promise<void> {
  const { error } = await supabase
    .from("blog_sources")
    .update({ status: "pending", attempts: 0, last_error: null })
    .eq("video_id", videoId);
  if (error) throw new Error(error.message);
}

/** 유튜브 링크(watch·youtu.be·shorts)를 대기열에 넣는다. 이미 있으면 그 상태를 알려 준다. */
export async function addSourceFromLink(link: string): Promise<{ videoId: string }> {
  const videoId = extractVideoId(link);
  if (!videoId) throw new Error("유튜브 영상 링크를 알아보지 못했습니다.");
  const { data: existing, error: qErr } = await supabase
    .from("blog_sources")
    .select("status")
    .eq("video_id", videoId)
    .maybeSingle();
  if (qErr) throw new Error(qErr.message);
  if (existing) {
    const label: Record<string, string> = { pending: "대기 중", done: "이미 처리됨", failed: "실패함" };
    throw new Error(`이미 등록된 영상입니다(${label[existing.status] ?? existing.status}).`);
  }
  const { error } = await supabase.from("blog_sources").insert({ video_id: videoId, status: "pending" });
  if (error) throw new Error(error.message);
  return { videoId };
}

export type AutomationJob = "collect" | "publish";

/** /api/admin/blog/run 호출. 서버가 토큰으로 관리자 여부를 다시 확인한다. */
export async function runAutomationJob(job: AutomationJob): Promise<Record<string, unknown>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 필요합니다.");
  const res = await fetch("/api/admin/blog/run", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ job }),
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // 본문 없음
  }
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : `HTTP ${res.status}`);
  return body;
}
