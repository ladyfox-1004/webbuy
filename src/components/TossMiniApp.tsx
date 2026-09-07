// 토스 미니앱 사례를 보여주는 조각들.
// PC 에서는 링크를 눌러도 막다른 길이라 QR 다이얼로그를 띄우고, 좁은 화면에서는 토스로 바로 보낸다.
// 홈(포트폴리오·기능 카드)과 업종별 솔루션 페이지가 같이 쓴다.

import { ExternalLink, QrCode, Smartphone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TOSS_MINIAPP_URL } from "@/lib/portfolio";
import tossMiniappShot from "@/assets/portfolio/toss-miniapp-kkalkkeum.jpg";
import tossMiniappQr from "@/assets/portfolio/toss-miniapp-qr.png";

export { TOSS_MINIAPP_URL };

// QR 다이얼로그 내용. 포트폴리오 카드와 사례 링크가 같이 쓴다.
export function TossMiniAppQrDialogContent() {
  return (
    <DialogContent className="max-w-sm rounded-2xl border-border bg-surface">
      <DialogTitle className="font-display text-lg font-semibold">
        깔끔집사 · 토스 미니앱
      </DialogTitle>
      <DialogDescription className="text-sm text-muted-foreground">
        토스 앱 안에서 도는 미니앱이라 PC 브라우저로는 열리지 않습니다. 폰 카메라로 아래 QR을 찍으면
        토스에서 바로 열립니다.
      </DialogDescription>
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-xl border border-border bg-white p-3">
          <img src={tossMiniappQr} alt="깔끔집사 토스 미니앱 QR 코드" className="h-64 w-64" />
        </div>
        <div className="text-center text-xs break-all text-muted-foreground select-all">
          {TOSS_MINIAPP_URL}
        </div>
      </div>
    </DialogContent>
  );
}

// 카드 내용은 하나인데 넓은 화면(QR 다이얼로그)과 좁은 화면(직접 링크)에서 감싸는 요소가 다르다.
export function TossMiniAppCardBody({ Icon, action }: { Icon: LucideIcon; action: string }) {
  return (
    <>
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-background/40">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-surface/70 to-primary-glow/20" />
        <div className="absolute inset-0 grid place-items-center px-3 pt-3 pb-12">
          {/* 904x1905 원본 비율을 박스에 못박는다. w-auto로 두면 lazy 이미지가 폭 0이라 영영 안 뜬다 */}
          <div className="aspect-[904/1905] h-full overflow-hidden rounded-xl bg-background shadow-lg ring-1 ring-border/70 transition duration-500 group-hover:scale-[1.03]">
            <img
              src={tossMiniappShot}
              alt="깔끔집사 토스 미니앱 화면"
              width={904}
              height={1905}
              loading="lazy"
              className="h-full w-full"
            />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />
        <span className="absolute left-3 top-3 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur">
          Toss Mini App
        </span>
        <span className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-background/70 text-foreground/80 backdrop-blur transition group-hover:bg-gradient-to-br group-hover:from-primary group-hover:to-primary-glow group-hover:text-primary-foreground">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] whitespace-nowrap text-muted-foreground backdrop-blur">
          <Smartphone className="h-3 w-3" /> 모바일에서 열립니다
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 p-4">
        <h3 className="min-w-0 truncate font-display text-base font-semibold">
          깔끔집사 · 청소 기사 매칭
        </h3>
        <span className="shrink-0 text-[11px] text-muted-foreground">{action}</span>
      </div>
    </>
  );
}

// 작은 사례 링크(칩). 좁은 화면은 토스로 바로, 넓은 화면은 QR 다이얼로그로.
export function TossMiniAppCaseLink() {
  return (
    <>
      <a
        href={TOSS_MINIAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/10 md:hidden"
      >
        깔끔집사 토스 미니앱 <ExternalLink className="h-3 w-3" />
      </a>
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="hidden items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/10 md:inline-flex"
          >
            깔끔집사 토스 미니앱 <QrCode className="h-3 w-3" />
          </button>
        </DialogTrigger>
        <TossMiniAppQrDialogContent />
      </Dialog>
    </>
  );
}

// 솔루션 페이지의 "사례" 섹션에 들어가는 썸네일 카드.
// 스크린샷 서비스로는 토스 미니앱을 못 찍으므로 실제 앱 화면을 세로 목업으로 넣는다.
export function TossMiniAppCaseCard() {
  const body = (
    <>
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-white to-primary-glow/10" />
        <div className="absolute inset-0 grid place-items-center p-3">
          <div className="aspect-[904/1905] h-full overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200">
            <img
              src={tossMiniappShot}
              alt="깔끔집사 토스 미니앱 화면"
              width={904}
              height={1905}
              loading="lazy"
              className="h-full w-full"
            />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="min-w-0 truncate text-xs font-medium text-slate-700">
          깔끔집사 토스 미니앱
        </span>
        <QrCode className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </div>
    </>
  );

  return (
    <>
      <a
        href={TOSS_MINIAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-primary/40 hover:shadow-md md:hidden"
      >
        {body}
      </a>
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="group hidden cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-primary/40 hover:shadow-md md:flex"
          >
            {body}
          </button>
        </DialogTrigger>
        <TossMiniAppQrDialogContent />
      </Dialog>
    </>
  );
}
