import { useEffect, useRef, useState, createContext, useContext, type ReactNode } from "react";
import { X } from "lucide-react";
import { InquiryForm } from "@/components/InquiryForm";

const InquiryContext = createContext<{
  open: boolean;
  /** 열 때 넘긴 문의 주제(호환을 위해 이름은 defaultService 로 둔다) */
  defaultService: string | undefined;
  openInquiry: (topic?: string) => void;
  closeInquiry: () => void;
} | null>(null);

export function InquiryProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [defaultService, setDefaultService] = useState<string | undefined>(undefined);

  const openInquiry = (topic?: string) => {
    setDefaultService(typeof topic === "string" ? topic : undefined);
    setOpen(true);
  };

  const closeInquiry = () => setOpen(false);

  return (
    <InquiryContext.Provider value={{ open, defaultService, openInquiry, closeInquiry }}>
      {children}
      <InquiryModal open={open} onOpenChange={closeInquiry} defaultService={defaultService} />
    </InquiryContext.Provider>
  );
}

export function useInquiry() {
  const ctx = useContext(InquiryContext);
  if (!ctx) throw new Error("useInquiry must be used within InquiryProvider");
  return ctx;
}

/**
 * 문의 모달. 본문은 InquiryForm(variant="modal").
 * defaultService 는 이제 "문의 주제"로 쓰인다 — 솔루션 이름과 정확히 같으면 칩이 미리 선택되고,
 * 아니면 폼 상단에 "문의 주제" 배지로 붙는다.
 */
export function InquiryModal({
  open,
  onOpenChange,
  defaultService,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultService?: string;
}) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center p-3 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onOpenChange(false)}
    >
      {/* 어두운 배경 + 은은한 빛 */}
      <div className="pointer-events-none absolute inset-0 bg-background/75 backdrop-blur-md" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-[30rem] w-[30rem] rounded-full bg-primary-glow/15 blur-3xl" />
      </div>

      {/* 그라데이션 테두리 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inquiry-modal-title"
        className="relative z-10 w-full max-w-2xl rounded-[28px] bg-gradient-to-br from-primary-glow/50 via-border to-primary/40 p-px shadow-2xl shadow-black/60"
      >
        <div className="iqm-scroll relative max-h-[90vh] overflow-y-auto overscroll-contain rounded-[27px] bg-surface px-5 pb-7 pt-6 sm:px-9 sm:pb-9 sm:pt-8">
          <button
            ref={closeBtnRef}
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground sm:right-4 sm:top-4"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>

          <header className="mb-8 pr-10">
            <div className="font-mono text-[11px] font-semibold tracking-[0.2em] text-primary-glow">
              PROJECT INQUIRY
            </div>
            <h2
              id="inquiry-modal-title"
              className="mt-2 font-display text-2xl font-bold leading-tight text-foreground sm:text-[28px]"
            >
              프로젝트 상담 신청
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              몇 가지만 알려주시면 담당자가 직접 검토하고 연락드립니다.
            </p>
          </header>

          <InquiryForm
            // 닫히면 통째로 언마운트되므로 열 때마다 새 상태로 시작한다. 열린 채 주제가 바뀌어도 새로 마운트.
            key={defaultService ?? ""}
            variant="modal"
            topic={defaultService}
            onDone={() => onOpenChange(false)}
          />
        </div>
      </div>

      <style>{`
        .iqm-scroll::-webkit-scrollbar { width: 6px; }
        .iqm-scroll::-webkit-scrollbar-track { background: transparent; margin: 24px 0; }
        .iqm-scroll::-webkit-scrollbar-thumb {
          background: color-mix(in oklab, var(--muted-foreground) 35%, transparent);
          border-radius: 999px;
        }
      `}</style>
    </div>
  );
}
