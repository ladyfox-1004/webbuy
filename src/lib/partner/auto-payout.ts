// 매월 1일 파트너 정산 자동 생성 + 대표님 카톡 — 워커 예약 실행(30분마다, "*/30 * * * *")이 부르는 판단 한 곳.
// 실제 연결(Supabase·카톡)은 밖에서 받는다(시험: tests/partner-payout.test.ts 는 전부 가짜).
// 예약 실행 진입점: src/server/partner-tasks/auto-payouts-task.ts, 크론: vite.config.ts nitro.scheduledTasks 의 "*/30 * * * *".
//
// 흐름
//   1) 한국 시간 1일 09:00 ~ 23:59 가 아니면 아무것도 안 한다(외부 호출 0개).
//   2) public.partner_auto_payouts(_now) — DB 가 같은 판정을 한 번 더 하고, 그 달 첫 실행일 때만 지난달 이름으로 정산을 만든다
//      (partner_payout_runs 한 달 한 줄 → 두 번 안 만든다). 카톡 보낼 차례(notify)도 DB 가 잡아 준다(최대 3번).
//   3) notify 이고 1명 이상이면 카톡 「이번 달 파트너 정산 N명, 실지급 합계 ○원. 확인: …/admin/partners」 → 결과 기록.
//
// 🚨 Cloudflare 무료 요금제는 실행 하나에 외부 호출 50개 상한이고, 같은 크론(*/30)의 영업 메일 자동 발송과 한도를 나눠 쓴다.
//    이 작업의 호출 수: 1일 09시 전·다른 날 0개 / 1일 정산 뒤 실행 1개 / 카톡 보내는 실행 최대 6개(DB 1 + 카톡 4 + 기록 1).
import type { NotifyStatus } from "../notify/types";
import { ADMIN_PARTNERS_URL } from "./apply";

export const AUTO_PAYOUT_HOUR = 9;

export type AutoPayoutRpc =
  | { ok: true; due: false }
  | {
      ok: true;
      due: true;
      created: boolean;
      run_month: string;
      payout_month: string;
      partners: number;
      net_total: number;
      notify: boolean;
    };

export type AutoPayoutDeps = {
  now?: Date;
  /** public.partner_auto_payouts(_now) */
  run: (nowIso: string) => Promise<AutoPayoutRpc>;
  /** 대표님 카톡(나에게 보내기). 던지지 않는 것이 좋지만 던져도 된다. */
  notify: (text: string) => Promise<NotifyStatus>;
  /** public.partner_auto_payouts_notified(_run_month, _status) */
  recordNotify: (runMonth: string, status: string) => Promise<void>;
};

export type AutoPayoutResult =
  | { ran: false; reason: "not_due" }
  | { ran: true; created: boolean; payoutMonth: string; partners: number; netTotal: number; notify: NotifyStatus | "none" }
  | { ran: false; reason: "rpc_failed"; error: string };

/** 한국 시간 그 달 1일이고 09시가 지났는가(1일 23:59 까지). 한국은 서머타임이 없다. */
export function autoPayoutDue(now: Date): boolean {
  const k = new Date(now.getTime() + 9 * 3600_000);
  return k.getUTCDate() === 1 && k.getUTCHours() >= AUTO_PAYOUT_HOUR;
}

export function autoPayoutKakaoText(partners: number, netTotal: number): string {
  return `이번 달 파트너 정산 ${partners}명, 실지급 합계 ${netTotal.toLocaleString("ko-KR")}원. 확인: ${ADMIN_PARTNERS_URL}`;
}

export async function runAutoPayouts(deps: AutoPayoutDeps): Promise<AutoPayoutResult> {
  const now = deps.now ?? new Date();
  if (!autoPayoutDue(now)) return { ran: false, reason: "not_due" };

  let r: AutoPayoutRpc;
  try {
    r = await deps.run(now.toISOString());
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 100) : "unknown";
    console.error(`[partner:auto-payouts] DB 실패 ${error}`);
    return { ran: false, reason: "rpc_failed", error };
  }
  if (!r.due) return { ran: false, reason: "not_due" };

  let notify: NotifyStatus | "none" = "none";
  if (r.notify && r.partners > 0) {
    try {
      notify = await deps.notify(autoPayoutKakaoText(r.partners, r.net_total));
    } catch (e) {
      notify = `failed:${e instanceof Error ? e.name : "unknown"}`;
    }
    try {
      await deps.recordNotify(r.run_month, notify);
    } catch {
      console.error("[partner:auto-payouts] 카톡 결과 기록 실패");
    }
  }
  return { ran: true, created: r.created, payoutMonth: r.payout_month, partners: r.partners, netTotal: r.net_total, notify };
}
