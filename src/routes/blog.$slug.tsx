// /blog/$slug — 블로그 글 상세.
// 🚨 p.$slug.tsx 처럼 브라우저에서 읽으면 검색엔진이 빈 페이지를 본다. 반드시 loader(서버)로 읽어 SSR 한다.
// 🚨 head 는 루트 메타를 덮는다. title·description·og·canonical 을 이 글 것으로 넣는다.
// 발행되지 않았거나 없는 글은 notFound(404).

import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, MessageCircle, Quote } from "lucide-react";
import { BlogShell } from "@/components/blog/BlogShell";
import { Markdown } from "@/components/blog/Markdown";
import { YouTubeEmbed } from "@/components/blog/YouTubeEmbed";
import { useInquiry } from "@/components/InquiryModal";
import { getPublishedPost } from "@/lib/blog.functions";
import {
  SITE_URL,
  categoryLabel,
  formatDate,
  postUrl,
  youtubeWatchUrl,
  type BlogPost,
} from "@/lib/blog";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const post = await getPublishedPost({ data: { slug: params.slug } });
    if (!post) throw notFound();
    return post;
  },
  component: BlogPostPage,
  notFoundComponent: PostNotFound,
  head: ({ loaderData }) => (loaderData ? postHead(loaderData) : notFoundHead()),
});

// <script> 안에 넣는 JSON 이 "</script>" 로 끊기지 않게 < 를 이스케이프한다.
function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function postHead(post: BlogPost) {
  const url = postUrl(post.slug);
  const title = `${post.title} | 에이아이솔루션 블로그`;
  const description = post.description || post.title;
  const image = post.source_video_id
    ? `https://i.ytimg.com/vi/${post.source_video_id}/hqdefault.jpg`
    : `${SITE_URL}/og.png`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: post.title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:url", content: url },
      { property: "og:image", content: image },
      ...(post.published_at
        ? [{ property: "article:published_time", content: post.published_at }]
        : []),
      { property: "article:modified_time", content: post.updated_at },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: post.title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: [
      {
        type: "application/ld+json",
        children: jsonLd({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: post.title,
          description,
          image: [image],
          datePublished: post.published_at ?? undefined,
          dateModified: post.updated_at,
          inLanguage: "ko-KR",
          mainEntityOfPage: { "@type": "WebPage", "@id": url },
          author: { "@type": "Person", name: "이서연" },
          publisher: {
            "@type": "Organization",
            name: "에이아이솔루션",
            url: SITE_URL,
            logo: { "@type": "ImageObject", url: `${SITE_URL}/og.png` },
          },
        }),
      },
    ],
  };
}

function notFoundHead() {
  return {
    meta: [
      { title: "글을 찾을 수 없습니다 | 에이아이솔루션 블로그" },
      { name: "robots", content: "noindex" },
    ],
  };
}

function BlogPostPage() {
  const post = Route.useLoaderData();
  const { openInquiry } = useInquiry();

  return (
    <BlogShell>
      <article className="mx-auto max-w-[720px]">
        <Link
          to="/blog"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> 블로그 목록
        </Link>

        <header className="mt-8">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="rounded-full border border-primary/40 px-2.5 py-0.5 text-xs text-primary-glow">
              {categoryLabel(post.category)}
            </span>
            {post.published_at && (
              <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>
            )}
          </div>
          <h1 className="mt-5 font-display text-3xl leading-tight font-bold tracking-tight break-keep sm:text-4xl">
            {post.title}
          </h1>
          {post.description && (
            <p className="mt-5 text-lg leading-relaxed break-keep text-muted-foreground">
              {post.description}
            </p>
          )}
        </header>

        {post.source_video_id && (
          <div className="mt-10">
            <YouTubeEmbed videoId={post.source_video_id} title={post.source_title ?? post.title} />
          </div>
        )}

        <Markdown source={post.body_md} className="mt-10" />

        {post.my_note && (
          <aside className="mt-12 rounded-3xl border border-primary/30 bg-primary/5 p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary-glow">
              <Quote className="h-4 w-4" /> 이서연의 한 줄
            </div>
            <p className="mt-3 leading-relaxed break-keep whitespace-pre-line text-foreground">
              {post.my_note}
            </p>
          </aside>
        )}

        {post.source_video_id && <SourceBox post={post} />}

        <section className="mt-14 rounded-3xl border border-border bg-surface/40 p-8 text-center">
          <p className="font-display text-xl font-semibold break-keep">
            이런 걸 우리 회사에도 만들고 싶다면
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            필요한 범위를 알려주시면 30분 상담 후 확정 견적을 드립니다.
          </p>
          <button
            type="button"
            onClick={() => openInquiry()}
            className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3 text-sm font-medium text-primary-foreground shadow-[var(--shadow-glow)] transition hover:scale-[1.02]"
          >
            견적 문의하기 <MessageCircle className="h-4 w-4" />
          </button>
        </section>

        <div className="mt-10">
          <Link
            to="/blog"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> 목록으로
          </Link>
        </div>
      </article>
    </BlogShell>
  );
}

function SourceBox({ post }: { post: BlogPost }) {
  const href = post.source_url || youtubeWatchUrl(post.source_video_id!);
  return (
    <aside className="mt-8 rounded-2xl border border-border bg-surface/30 p-5 text-sm text-muted-foreground">
      <div className="font-semibold text-foreground">출처</div>
      <p className="mt-2 break-keep">
        {post.source_channel && <span className="text-foreground">{post.source_channel}</span>}
        {post.source_channel && " · "}
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex items-center gap-1 text-primary-glow underline underline-offset-4"
        >
          {post.source_title || "원본 영상"} <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </p>
      <p className="mt-2 text-xs">이 글은 영상을 요약·해설한 것입니다.</p>
    </aside>
  );
}

function PostNotFound() {
  return (
    <BlogShell>
      <div className="mx-auto max-w-xl py-10 text-center">
        <div className="font-display text-6xl font-bold text-foreground">404</div>
        <h1 className="mt-4 text-xl font-semibold">글을 찾을 수 없습니다</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          주소가 바뀌었거나 아직 발행되지 않은 글입니다.
        </p>
        <Link
          to="/blog"
          className="mt-8 inline-flex items-center gap-1 rounded-full border border-border bg-surface/40 px-5 py-2.5 text-sm transition hover:bg-surface"
        >
          <ArrowLeft className="h-4 w-4" /> 블로그 목록
        </Link>
      </div>
    </BlogShell>
  );
}
