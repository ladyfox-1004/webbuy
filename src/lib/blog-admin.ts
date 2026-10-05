// 관리자 블로그 편집 — 브라우저에서 로그인한 관리자 세션으로 직접 쓴다.
// 권한은 RLS("admins manage posts" = has_role(auth.uid(),'admin'))가 지킨다.
// 🚨 service_role 을 쓰지 마라(공개 저장소).

import { supabase } from "@/integrations/supabase/client";
import { dedupeSlug, slugify, type BlogPost, type BlogStatus } from "@/lib/blog";

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
