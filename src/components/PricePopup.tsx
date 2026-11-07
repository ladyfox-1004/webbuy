import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, ChevronRight, MessageCircle, X } from "lucide-react";
import { KAKAO_OPENCHAT_URL } from "@/lib/portfolio";
import { Dialog, DialogClose, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import {
  hidePricePopupToday,
  localDateKey,
  readPricePopupHidden,
  shouldShowPricePopup,
} from "@/lib/price-popup";

// ── 홈 가격 안내 팝업 (2026-11, 대표님 요청) ─────────────────────────
// 홈(/) 라우트 컴포넌트에서만 그린다 → /admin·/blog·/login 등에는 안 뜬다.
// 🚨 모바일에서 홈에 들어오면 이 팝업이 가장 먼저 보여야 한다(지연 없이, 하이드레이션 직후 바로).
// 🚨 서버 렌더링에서는 항상 닫힌 상태로 그리고, localStorage 는 effect 안에서만 읽는다(하이드레이션 오류 방지).
// 🚨 "오픈 특가"·"기간 한정" 같은 기한·한정 표현을 쓰지 마라 — 정해진 기한이 없다.
// 🚨 「부가세 별도」는 가격 바로 옆/아래에 항상 보이게 둔다.
// 🚨 390폭에서 가격 두 줄과 「상담 신청하기」가 스크롤 없이 보여야 한다. 문구를 늘리면 캡처로 다시 확인.

export type PricePopupService = "랜딩페이지 제작" | "홈페이지 제작";

const QUICK_CONTACT_ID = "quick-contact";

export function PricePopup({
  onRequestConsult,
}: {
  // 「상담 신청하기」·가격 줄을 눌렀을 때. 가격 줄이면 해당 항목을 넘긴다(상담폼 「필요한 것」 미리 선택용).
  onRequestConsult?: (service?: PricePopupService) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hideToday, setHideToday] = useState(false);
  // 닫힐 때 상담폼으로 갈지(true) 원래 자리로 포커스를 돌릴지(false).
  const goToFormRef = useRef(false);

  useEffect(() => {
    if (shouldShowPricePopup(readPricePopupHidden(), localDateKey())) setOpen(true);
  }, []);

  function handleOpenChange(next: boolean) {
    if (!next && hideToday) hidePricePopupToday();
    setOpen(next);
  }

  function consult(service?: PricePopupService) {
    goToFormRef.current = true;
    onRequestConsult?.(service);
    handleOpenChange(false);
  }

  function onCloseAutoFocus(e: Event) {
    if (!goToFormRef.current) return; // 기본 동작: 열리기 전 포커스 자리로 돌아간다.
    goToFormRef.current = false;
    e.preventDefault();
    const target = document.getElementById(QUICK_CONTACT_ID);
    if (!target) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    try {
      history.replaceState(null, "", `#${QUICK_CONTACT_ID}`);
    } catch {
      /* 주소 바꾸기 실패는 무시 */
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/50 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          aria-modal="true"
          // 열릴 때 포커스는 대화상자 자체로 옮긴다(닫기 버튼에 포커스 테두리가 먼저 보이지 않게). Tab 은 안에서만 돈다.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={onCloseAutoFocus}
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl border border-border bg-card p-5 text-foreground shadow-[var(--shadow-card)] outline-none duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 motion-reduce:animate-none sm:p-7"
        >
          <DialogClose
            aria-label="닫기"
            className="absolute right-2 top-2 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" aria-hidden />
          </DialogClose>

          <div className="pr-10">
            <div className="mb-1.5 font-display text-xs font-semibold tracking-[0.2em] text-primary-glow uppercase">
              Price
            </div>
            <DialogPrimitive.Title className="font-display text-xl font-bold tracking-tight sm:text-2xl">
              제작 비용 안내
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1.5 text-sm leading-relaxed text-muted-foreground break-keep">
              필요한 페이지와 기능에 맞춰 상담 후 확정 견적을 드립니다.
            </DialogPrimitive.Description>
          </div>

          <ul className="mt-4 space-y-2.5">
            <li>
              <PriceRow
                label="랜딩페이지 제작"
                onClick={() => consult("랜딩페이지 제작")}
                price={
                  <>
                    <span className="text-2xl font-bold text-primary">15만 원</span>
                    <span className="ml-0.5 text-sm font-semibold text-foreground">부터</span>
                  </>
                }
              />
            </li>
            <li>
              <PriceRow
                label="홈페이지 제작"
                onClick={() => consult("홈페이지 제작")}
                price={
                  <>
                    <span className="sr-only">기존 가격</span>
                    <s className="mr-1.5 text-sm text-muted-foreground">150만 원</s>
                    <span className="sr-only">변경 가격</span>
                    <span className="text-2xl font-bold text-primary">99만 원</span>
                  </>
                }
              />
            </li>
          </ul>

          <button
            type="button"
            onClick={() => consult()}
            className="mt-4 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 text-base font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:scale-100"
          >
            상담 신청하기 <ArrowRight className="h-4 w-4" aria-hidden />
          </button>

          {/* 2026-11-07 대표님: 카톡 문의 단추(오픈프로필). 주소는 src/lib/portfolio.ts KAKAO_OPENCHAT_URL 한 곳 */}
          <a
            href={KAKAO_OPENCHAT_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => handleOpenChange(false)}
            className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#FEE500] px-6 text-base font-semibold text-[#191919] transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <MessageCircle className="h-4 w-4" aria-hidden /> 카카오톡으로 문의하기
          </a>

          <div className="mt-2 flex items-center justify-between gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={hideToday}
                onChange={(e) => setHideToday(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-[var(--primary)]"
              />
              오늘 하루 보지 않기
            </label>
            <DialogClose className="inline-flex min-h-11 cursor-pointer items-center rounded-full px-3 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              닫기
            </DialogClose>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

function PriceRow({
  label,
  price,
  onClick,
}: {
  label: string;
  price: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-left transition hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1 text-[15px] font-semibold text-foreground break-keep">
        {label}
      </span>
      <span className="shrink-0 text-right">
        <span className="block whitespace-nowrap leading-none">{price}</span>
        <span className="mt-1 block text-xs text-muted-foreground">부가세 별도</span>
      </span>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary"
        aria-hidden
      />
    </button>
  );
}
