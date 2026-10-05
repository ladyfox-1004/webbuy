// 블로그 공용 타입·상수·작은 도우미. 서버/브라우저 어디서나 import 해도 되는 것만 둔다.
// 데이터 조회는 blog.functions.ts(공개, 서버) / blog-admin.ts(관리자, 브라우저 세션) 에 있다.

import type { Database } from "@/integrations/supabase/types";

export type BlogPost = Database["public"]["Tables"]["blog_posts"]["Row"];

export const SITE_URL = "https://ai-solution.co.kr";

export type BlogCategory = "ai-dev" | "business" | "story";
export type BlogStatus = "note" | "review" | "scheduled" | "published";

export const CATEGORY_LABELS: Record<BlogCategory, string> = {
  "ai-dev": "AI·개발",
  business: "사업 인사이트",
  story: "이야기",
};

// 공개 목록의 분류 탭. story 는 공개 탭이 없다(발행할 땐 business 로 바꿔 발행 — 설계 문서).
export const PUBLIC_CATEGORIES = ["ai-dev", "business"] as const;
export type PublicCategory = (typeof PUBLIC_CATEGORIES)[number];

export const STATUS_LABELS: Record<BlogStatus, string> = {
  review: "검토 대기",
  note: "공부 노트",
  scheduled: "발행 예정",
  published: "발행됨",
};

export function categoryLabel(c: string): string {
  return CATEGORY_LABELS[c as BlogCategory] ?? c;
}

/** 목록 카드에 쓰는 열. 본문(body_md)은 목록에서 읽지 않는다. */
export type BlogPostSummary = Pick<
  BlogPost,
  "slug" | "title" | "description" | "category" | "published_at"
>;

/**
 * 제목 → 주소(slug). 한글은 그대로 두고(네이버·구글 모두 한글 URL 을 읽는다),
 * 공백은 -, 주소에 쓰기 곤란한 기호는 지운다.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/** taken 에 이미 있으면 -2, -3 … 을 붙인다. */
export function dedupeSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!set.has(candidate)) return candidate;
  }
}

/** 2026. 10. 5. — 서버(UTC)와 브라우저 시간대가 달라도 같은 값이 나오게 서울 기준으로 고정. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function postUrl(slug: string): string {
  return `${SITE_URL}/blog/${encodeURIComponent(slug)}`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}
