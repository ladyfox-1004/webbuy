// /solutions/hospital — 업종별 솔루션 페이지.
// 내용은 src/lib/solutions.ts, 화면은 src/components/SolutionPage.tsx 가 담당한다.
// 🚨 이 라우트의 head 는 루트(__root.tsx)의 메타를 덮는다. title·description 을
//    반드시 이 페이지 것으로 써야 한다(홈에서 이걸 빠뜨려 옛 메타가 나간 적이 있다).

import { createFileRoute } from "@tanstack/react-router";
import { SolutionPage } from "@/components/SolutionPage";
import { solutionBySlug } from "@/lib/solutions";

const solution = solutionBySlug.get("hospital")!;
const canonical = "https://ai-solution.co.kr/solutions/hospital";

export const Route = createFileRoute("/solutions/hospital")({
  component: () => <SolutionPage solution={solution} />,
  head: () => ({
    meta: [
      { title: solution.metaTitle },
      { name: "description", content: solution.metaDescription },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: solution.metaTitle },
      { property: "og:description", content: solution.metaDescription },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonical },
      { property: "og:image", content: "https://ai-solution.co.kr/og.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: solution.metaTitle },
      { name: "twitter:description", content: solution.metaDescription },
      { name: "twitter:image", content: "https://ai-solution.co.kr/og.png" },
    ],
    links: [{ rel: "canonical", href: canonical }],
  }),
});
