import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { InquiryProvider } from "@/components/InquiryModal";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

// 사이트 기본 검색·공유 문구. 검색 결과용(title·description)과 공유 카드용(og·twitter)을 나눈다.
// title 은 60자 안팎, description 은 120~155자 안팎(검색 결과에서 잘리지 않는 길이).
const SITE_TITLE =
  "AI 기반 웹·앱 플랫폼 구축 · CRM·메타 광고 · 전광판 DOOH 디지털 사이니지 | 에이아이솔루션";
const SITE_DESCRIPTION =
  "AI 기반 데이터 분석과 통합 미디어 솔루션으로 비즈니스의 스케일을 확장합니다. 웹·앱 개발과 플랫폼 구축, CRM·메타 광고 통합 마케팅, 건물 전광판(DOOH) 디지털 사이니지 운영, AI 자동화까지 한 팀이 설계하고 운영합니다.";
const SHARE_TITLE = "AI 데이터 분석 × 통합 미디어 솔루션 — 비즈니스의 스케일을 확장합니다";
const SHARE_DESCRIPTION =
  "웹·앱 플랫폼 구축, CRM·메타 광고 통합 마케팅, 디지털 사이니지(DOOH) 운영까지. 온라인과 오프라인의 고객 접점을 하나의 데이터 흐름으로 묶어 비즈니스의 스케일을 확장합니다.";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      // 🚨 제목·설명은 **검색어**가 들어가야 한다. 예전엔 "AISOLUTION" 뿐이라
      //    브랜드명을 아는 사람만 찾을 수 있었다. 사려는 사람은 "웹·앱 개발",
      //    "메타 광고", "디지털 사이니지" 를 친다.
      // 🚨 홈 히어로("AI 기반 데이터 분석 × 통합 미디어 솔루션", 세 축)와 같은 말을 쓴다.
      //    직원 수·고객 수·매출 같은 숫자, 금액·기간은 넣지 않는다(검증 못 하는 약속이 된다).
      //    업종 페이지 제목은 src/lib/solutions.ts 의 metaTitle 이 따로 맡는다.
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      { name: "author", content: "에이아이솔루션" },
      { name: "robots", content: "index, follow" },

      // 카톡·카페·문자로 링크를 붙였을 때 뜨는 카드.
      // 🚨 og:image 는 **우리 도메인**이어야 한다. 예전엔 러버블 미리보기 서버를
      //    가리켜, 우리가 통제하지 못하는 주소가 대표 이미지였다.
      { property: "og:title", content: SHARE_TITLE },
      { property: "og:description", content: SHARE_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "에이아이솔루션" },
      { property: "og:locale", content: "ko_KR" },
      { property: "og:url", content: "https://ai-solution.co.kr" },
      { property: "og:image", content: "https://ai-solution.co.kr/og.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },

      // summary 는 작은 썸네일이다. 큰 카드가 클릭률이 훨씬 낫다.
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SHARE_TITLE },
      { name: "twitter:description", content: SHARE_DESCRIPTION },
      { name: "twitter:image", content: "https://ai-solution.co.kr/og.png" },
    ],
    links: [
      // 🚨 canonical 은 여기 두지 마라. 라우트 head 의 links 는 **덮어쓰지 않고 합쳐진다**.
      //    (meta 는 title/name/property 로 합쳐지지만 link 는 아니다.)
      //    루트에 canonical 이 있으면 하위 페이지마다 canonical 이 두 개가 되고,
      //    앞에 오는 루트 값(홈 주소)이 먼저 읽혀 색인이 홈으로 몰린다.
      //    canonical 은 각 라우트에서 자기 주소로 단다(홈은 아래 index 라우트에서).
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <InquiryProvider>
        <Outlet />
        <Toaster theme="dark" position="top-center" richColors />
      </InquiryProvider>
    </QueryClientProvider>
  );
}
