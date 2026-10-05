// 블로그 본문 마크다운 렌더. 공개 글 상세와 관리자 미리보기가 같은 컴포넌트를 쓴다.
// 🚨 SSR(Workers, DOM 없음)에서도 돌아야 해서 DOMPurify 대신 react-markdown 을 쓴다.
// 🚨 rehype-raw 를 붙이지 마라. raw HTML(<script>, <iframe> 등)은 렌더하지 않는다(skipHtml).
//    javascript: 같은 위험한 주소는 react-markdown 기본 urlTransform 이 지운다.

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

function isExternal(href: string | undefined): boolean {
  if (!href) return false;
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    const host = new URL(href).hostname;
    return host !== "ai-solution.co.kr" && host !== "www.ai-solution.co.kr";
  } catch {
    return true;
  }
}

const components: Components = {
  h1: ({ node: _n, ...p }) => (
    <h2
      className="mt-12 mb-4 font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl"
      {...p}
    />
  ),
  h2: ({ node: _n, ...p }) => (
    <h2
      className="mt-12 mb-4 font-display text-2xl font-bold tracking-tight text-foreground md:text-[1.7rem]"
      {...p}
    />
  ),
  h3: ({ node: _n, ...p }) => (
    <h3 className="mt-9 mb-3 font-display text-xl font-semibold text-foreground" {...p} />
  ),
  h4: ({ node: _n, ...p }) => (
    <h4 className="mt-7 mb-2 text-lg font-semibold text-foreground" {...p} />
  ),
  p: ({ node: _n, ...p }) => <p className="my-5" {...p} />,
  a: ({ node: _n, href, ...p }) =>
    isExternal(href) ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-primary-glow underline underline-offset-4 hover:opacity-80"
        {...p}
      />
    ) : (
      <a
        href={href}
        className="text-primary-glow underline underline-offset-4 hover:opacity-80"
        {...p}
      />
    ),
  ul: ({ node: _n, ...p }) => (
    <ul className="my-5 list-disc space-y-2 pl-6 marker:text-primary-glow" {...p} />
  ),
  ol: ({ node: _n, ...p }) => (
    <ol className="my-5 list-decimal space-y-2 pl-6 marker:text-muted-foreground" {...p} />
  ),
  li: ({ node: _n, ...p }) => <li className="pl-1" {...p} />,
  blockquote: ({ node: _n, ...p }) => (
    <blockquote
      className="my-6 border-l-2 border-primary-glow/60 pl-4 text-muted-foreground italic"
      {...p}
    />
  ),
  hr: () => <hr className="my-10 border-border/60" />,
  strong: ({ node: _n, ...p }) => <strong className="font-semibold text-foreground" {...p} />,
  code: ({ node: _n, className, ...p }) =>
    className ? (
      <code className={className} {...p} />
    ) : (
      <code
        className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-[0.9em] text-foreground"
        {...p}
      />
    ),
  pre: ({ node: _n, ...p }) => (
    <pre
      className="my-6 overflow-x-auto rounded-2xl border border-border bg-surface/60 p-4 font-mono text-sm leading-relaxed text-foreground"
      {...p}
    />
  ),
  table: ({ node: _n, ...p }) => (
    <div className="my-6 overflow-x-auto rounded-2xl border border-border">
      <table className="w-full border-collapse text-sm" {...p} />
    </div>
  ),
  thead: ({ node: _n, ...p }) => (
    <thead className="bg-surface/60 text-left text-foreground" {...p} />
  ),
  th: ({ node: _n, ...p }) => (
    <th className="border-b border-border px-4 py-2.5 font-semibold" {...p} />
  ),
  td: ({ node: _n, ...p }) => (
    <td className="border-b border-border/50 px-4 py-2.5 align-top" {...p} />
  ),
  img: ({ node: _n, alt, ...p }) => (
    <img
      alt={alt ?? ""}
      loading="lazy"
      className="my-6 h-auto max-w-full rounded-2xl border border-border"
      {...p}
    />
  ),
};

export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  return (
    <div className={`text-[1.05rem] leading-[1.85] break-keep text-foreground/90 ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {source}
      </ReactMarkdown>
    </div>
  );
}
