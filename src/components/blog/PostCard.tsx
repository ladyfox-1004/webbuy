import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { categoryLabel, formatDate, type BlogPostSummary } from "@/lib/blog";

export function PostCard({ post }: { post: BlogPostSummary }) {
  return (
    <Link
      to="/blog/$slug"
      params={{ slug: post.slug }}
      className="group flex h-full flex-col rounded-3xl border border-border bg-surface/40 p-6 transition hover:border-primary/50 hover:bg-surface/60"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border border-primary/40 px-2.5 py-0.5 text-primary-glow">
          {categoryLabel(post.category)}
        </span>
        {post.published_at && (
          <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>
        )}
      </div>
      <h2 className="mt-4 font-display text-xl leading-snug font-semibold break-keep text-foreground">
        {post.title}
      </h2>
      {post.description && (
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed break-keep text-muted-foreground">
          {post.description}
        </p>
      )}
      <span className="mt-auto inline-flex items-center gap-1 pt-5 text-sm text-primary-glow">
        읽기{" "}
        <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </span>
    </Link>
  );
}
