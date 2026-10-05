// 블로그 공개 조회. 서버 함수라 SSR 때도, 화면 이동 때도 서버에서 읽는다.
// 🚨 service_role 을 쓰지 마라(공개 저장소). anon 키 + RLS(status='published' 만 select)로 읽는다.
//    RLS 가 막아 주지만, 쿼리에도 status='published' 를 걸어 의도를 분명히 한다.
// 🚨 테이블이 아직 없거나(마이그레이션 전) DB 오류가 나도 페이지가 500 으로 죽으면 안 된다.
//    목록은 빈 배열, 상세는 null(→ 404)로 돌려준다.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PUBLIC_CATEGORIES, type BlogPost, type BlogPostSummary } from "@/lib/blog";

const ListInput = z.object({
  category: z.enum(PUBLIC_CATEGORIES).optional(),
});

export const getPublishedPosts = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => ListInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<BlogPostSummary[]> => {
    try {
      let q = supabase
        .from("blog_posts")
        .select("slug, title, description, category, published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(200);
      if (data.category) q = q.eq("category", data.category);
      const { data: rows, error } = await q;
      if (error) {
        console.error(`blog list failed [${error.code ?? "?"}]: ${error.message}`);
        return [];
      }
      return rows ?? [];
    } catch (e) {
      console.error("blog list failed", e);
      return [];
    }
  });

const SlugInput = z.object({ slug: z.string().trim().min(1).max(200) });

export const getPublishedPost = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => SlugInput.parse(input))
  .handler(async ({ data }): Promise<BlogPost | null> => {
    try {
      const { data: row, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("slug", data.slug)
        .eq("status", "published")
        .maybeSingle();
      if (error) {
        console.error(`blog post failed [${error.code ?? "?"}]: ${error.message}`);
        return null;
      }
      return row;
    } catch (e) {
      console.error("blog post failed", e);
      return null;
    }
  });
