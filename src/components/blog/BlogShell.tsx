// 블로그 페이지(목록·상세) 공용 껍데기: 상단 메뉴 + 본문 + 하단.

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { useInquiry } from "@/components/InquiryModal";
import { SiteFooter } from "@/components/SiteFooter";

function BlogNav() {
  const { openInquiry } = useInquiry();
  return (
    <header className="fixed top-0 right-0 left-0 z-50">
      <div className="mx-auto mt-4 max-w-6xl px-4">
        <nav className="glass flex items-center justify-between rounded-full px-5 py-3">
          <Link to="/" className="flex items-center gap-2 font-display font-bold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-xs text-primary-foreground">
              ◆
            </span>
            <span className="text-base">AISOLUTION</span>
          </Link>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/" className="hidden transition hover:text-foreground sm:inline">
              홈
            </Link>
            <Link
              to="/blog"
              className="transition hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              블로그
            </Link>
            <button
              type="button"
              onClick={() => openInquiry()}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-glow)] transition hover:scale-[1.02]"
            >
              문의하기 <MessageCircle className="h-3.5 w-3.5" />
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}

export function BlogShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col text-foreground">
      <BlogNav />
      <main className="relative flex-1 overflow-hidden px-4 pt-32 pb-20 md:pt-40">
        <div className="pointer-events-none absolute -top-32 -right-24 h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 -left-24 h-80 w-80 rounded-full bg-primary-glow/10 blur-3xl" />
        <div className="relative">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
