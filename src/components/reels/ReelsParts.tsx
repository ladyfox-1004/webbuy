// 릴스 판매 화면 공용 조각: 위쪽 메뉴, 판매자 정보(법적 표시), 환불 규정 요약, 카카오톡 채널 단추 자리.
// 주의: 판매자 정보·환불 규정 문구는 src/lib/reels/constants.ts 한 곳에서만 고친다.
import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { KAKAO_PENDING_LABEL, REFUND_RULES, SELLER } from "@/lib/reels/constants";
import { statusLabel } from "@/lib/reels/format";

export function ReelsNav() {
  return (
    <header className="border-b border-border/60 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <Link to="/" className="flex items-center gap-2 font-display font-bold tracking-tight">
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-xs text-primary-foreground"
          >
            ◆
          </span>
          <span className="text-base">AISOLUTION</span>
        </Link>
        <Link to="/reels" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          쇼츠 제작
        </Link>
      </div>
    </header>
  );
}

/**
 * 카카오톡 채널 단추 자리. 채널 주소가 아직 없다(설계서 9절).
 * 주의: href 를 넣지 마라. 주소가 정해지면 그때 진짜 링크로 바꾼다. 지금은 눌러도 아무 곳에도 가지 않는다.
 */
export function KakaoChannelPlaceholder({ className = "" }: { className?: string }) {
  return (
    <span
      role="link"
      aria-disabled="true"
      data-testid="kakao-channel-placeholder"
      className={`inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-2 rounded-full border border-border bg-muted px-5 py-2.5 text-sm font-medium text-muted-foreground select-none ${className}`}
    >
      <MessageCircle aria-hidden className="h-4 w-4" />
      {KAKAO_PENDING_LABEL}
    </span>
  );
}

export function RefundSummary() {
  return (
    <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
      {REFUND_RULES.map((r) => (
        <li key={r} className="flex gap-2">
          <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
          <span>{r}</span>
        </li>
      ))}
    </ul>
  );
}

/** 판매자 정보(전자상거래법 표시). 결제 화면·소개 화면 아래에 둔다. */
export function SellerInfo() {
  const rows: [string, string][] = [
    ["상호", SELLER.name],
    ["대표자", SELLER.ceo],
    ["사업자등록번호", SELLER.bizNo],
    ["통신판매업 신고번호", SELLER.mailOrderNo],
    ["주소", SELLER.address],
    ["전화", SELLER.phone],
    ["이메일", SELLER.email],
  ].filter(([, v]) => v.trim() !== "") as [string, string][]; // 전화가 빈 값이면 줄을 뺀다
  return (
    <dl
      data-testid="seller-info"
      className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs leading-relaxed text-muted-foreground"
    >
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="whitespace-nowrap">{k}</dt>
          <dd className="min-w-0 break-words text-foreground/80">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ReelsFooter({ withRefund = true }: { withRefund?: boolean }) {
  return (
    <footer className="mt-16 border-t border-border/60 bg-surface/60 px-4 py-10">
      <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-2">
        {withRefund && (
          <section>
            <h2 className="font-display text-sm font-semibold text-foreground">환불 규정</h2>
            <div className="mt-3">
              <RefundSummary />
            </div>
          </section>
        )}
        <section>
          <h2 className="font-display text-sm font-semibold text-foreground">판매자 정보</h2>
          <div className="mt-3">
            <SellerInfo />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
              개인정보처리방침
            </Link>
          </p>
        </section>
      </div>
    </footer>
  );
}

const STATUS_BADGE: Record<string, string> = {
  pending: "border-amber-500/40 bg-amber-50 text-amber-900",
  paid: "border-emerald-600/30 bg-emerald-50 text-emerald-800",
  cancelled: "border-rose-500/40 bg-rose-50 text-rose-800",
  expired: "border-border bg-muted text-muted-foreground",
};

/** 주문 상태 배지(결제 대기·결제 완료·취소·만료) */
export function ReelsStatusBadge({ status }: { status: string }) {
  return (
    <span
      data-testid="status-badge"
      className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap ${STATUS_BADGE[status] ?? STATUS_BADGE.expired}`}
    >
      {statusLabel(status)}
    </span>
  );
}
