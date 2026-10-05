// /sitemap.xml — 서버에서 만든다(예전엔 public/sitemap.xml 정적 파일).
// 고정 주소 + 발행된 블로그 글. robots.txt 의 Sitemap 줄이 이 주소를 가리킨다.
// 🚨 public/sitemap.xml 을 다시 만들지 마라. 정적 파일이 이 라우트보다 먼저 나가 글이 빠진다.
// 🚨 DB 조회가 실패해도(테이블 없음 등) 고정 주소만으로 200 을 돌려준다. 사이트맵이 500 이면 색인이 멈춘다.

import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SITE_URL, postUrl } from "@/lib/blog";

type Entry = { loc: string; lastmod?: string; changefreq: string; priority: string };

const STATIC_ENTRIES: Entry[] = [
  { loc: `${SITE_URL}/`, changefreq: "weekly", priority: "1.0" },
  { loc: `${SITE_URL}/solutions/hospital`, changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_URL}/solutions/law`, changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_URL}/solutions/realestate`, changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_URL}/solutions/telecom`, changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_URL}/solutions/subsidy`, changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_URL}/solutions/platform`, changefreq: "monthly", priority: "0.8" },
  { loc: `${SITE_URL}/privacy`, changefreq: "yearly", priority: "0.3" },
  { loc: `${SITE_URL}/refund`, changefreq: "yearly", priority: "0.3" },
];

async function blogEntries(): Promise<Entry[]> {
  try {
    const { data, error } = await supabase
      .from("blog_posts")
      .select("slug, updated_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(5000);
    if (error) {
      console.error(`sitemap blog query failed [${error.code ?? "?"}]: ${error.message}`);
      return [];
    }
    const posts: Entry[] = (data ?? []).map((p) => ({
      loc: postUrl(p.slug),
      lastmod: p.updated_at.slice(0, 10),
      changefreq: "monthly",
      priority: "0.6",
    }));
    // 글이 하나라도 있을 때만 목록 페이지를 넣는다(빈 목록을 색인시키지 않는다).
    return posts.length
      ? [{ loc: `${SITE_URL}/blog`, changefreq: "weekly", priority: "0.7" }, ...posts]
      : [];
  } catch (e) {
    console.error("sitemap blog query failed", e);
    return [];
  }
}

function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!,
  );
}

function render(entries: Entry[]): string {
  const urls = entries
    .map(
      (e) =>
        `  <url><loc>${escapeXml(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}<changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries = [...STATIC_ENTRIES, ...(await blogEntries())];
        return new Response(render(entries), {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
