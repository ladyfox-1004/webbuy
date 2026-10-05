// /blog — 블로그 목록. loader 가 서버에서 발행된 글을 읽어 SSR 한다.
// 🚨 이 라우트의 head 는 루트(__root.tsx)의 메타를 덮는다. title·description 을 이 페이지 것으로 쓴다.
//    canonical 은 루트에 없다(라우트마다 자기 주소로 단다).

import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { BlogShell } from "@/components/blog/BlogShell";
import { PostCard } from "@/components/blog/PostCard";
import { getPublishedPosts } from "@/lib/blog.functions";
import { CATEGORY_LABELS, PUBLIC_CATEGORIES, SITE_URL, type PublicCategory } from "@/lib/blog";

const canonical = `${SITE_URL}/blog`;
const title = "블로그 — AI·개발, 사업 인사이트 | 에이아이솔루션";
const description =
  "해외 AI·개발 영상과 사업 이야기를 우리 일에 맞게 정리합니다. 랜딩페이지·플랫폼을 만들며 배운 것을 나눕니다.";

const SearchSchema = z.object({
  category: z.enum(PUBLIC_CATEGORIES).optional().catch(undefined),
});

export const Route = createFileRoute("/blog/")({
  validateSearch: SearchSchema,
  loaderDeps: ({ search }) => ({ category: search.category }),
  loader: ({ deps }) => getPublishedPosts({ data: { category: deps.category } }),
  component: BlogListPage,
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonical },
      { property: "og:image", content: `${SITE_URL}/og.png` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: `${SITE_URL}/og.png` },
    ],
    links: [{ rel: "canonical", href: canonical }],
  }),
});

const TABS: { key: PublicCategory | undefined; label: string }[] = [
  { key: undefined, label: "전체" },
  ...PUBLIC_CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABELS[c] })),
];

function BlogListPage() {
  const posts = Route.useLoaderData();
  const { category } = Route.useSearch();

  return (
    <BlogShell>
      <div className="mx-auto max-w-5xl">
        <div className="mb-3 text-sm font-medium text-primary-glow">— BLOG</div>
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl md:text-5xl">
          블로그
        </h1>
        <p className="mt-5 max-w-2xl leading-relaxed text-muted-foreground md:text-lg">
          AI·개발 소식과 사업 이야기를 우리 일에 맞게 정리합니다.
        </p>

        <nav aria-label="분류" className="mt-10 flex flex-wrap gap-2">
          {TABS.map((t) => {
            const active = t.key === category;
            return (
              <Link
                key={t.label}
                to="/blog"
                search={t.key ? { category: t.key } : {}}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  active
                    ? "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground"
                    : "border border-border bg-surface/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        {posts.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-dashed border-border bg-surface/30 px-6 py-16 text-center">
            <p className="font-display text-lg font-semibold text-foreground">
              곧 첫 글이 올라옵니다
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {category
                ? "이 분류에는 아직 글이 없습니다."
                : "준비 중인 글이 있습니다. 조금만 기다려 주세요."}
            </p>
          </div>
        ) : (
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {posts.map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        )}
      </div>
    </BlogShell>
  );
}
