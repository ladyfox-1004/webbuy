// 사이트 공용 하단. 홈·업종별 솔루션·블로그가 같이 쓴다.
// 🚨 페이지마다 복사하지 마라. 연락처 한 줄 바꾸려고 여러 곳을 고치게 된다.

import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/40 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center gap-2 text-center text-xs text-muted-foreground md:flex-row md:justify-between md:text-left">
          <div className="font-display text-sm font-semibold text-foreground">
            에이아이솔루션 (AISOLUTION)
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link to="/blog" className="transition hover:text-foreground">
              블로그
            </Link>
            <span>사업자등록번호 · 215-28-82229</span>
            <span>contact@ai-solution.co.kr</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
