// 영업 메일 자동 발송 — 워커 예약 실행(30분마다)이 부르는 판단 한 곳.
// 실제 연결(Supabase·지메일·카톡)은 밖에서 받는다(시험: tests/outreach-auto.test.ts 는 전부 가짜).
// 예약 실행 진입점: src/server/outreach-tasks/auto-send-task.ts, 크론 등록: vite.config.ts nitro.scheduledTasks.
//
// 보내는 조건(모두 맞아야 함)
//   1) 한국 시간 매일(월~일, 주말 포함 — 대표님 11/7 결정) 07:00 ≤ 시각 < 20:00
//   2) outreach_settings.auto_send = true (관리자 화면 스위치. 읽다 실패하면 안 보낸다)
//   3) 지메일 비밀값이 있다
//   4) 오늘(한국 날짜) batch_date 의 status='ready' 줄이 있다 — 🚨 옛 날짜 ready 는 보내지 않는다(밀린 것 몰아 보내기 금지)
// 보내기는 수동 「보내기」와 같은 sendSelected(수신거부 제외·ready→sending 조건부 선점·1.5초 간격·실패 기록).
// 그래서 관리자가 같은 때 수동으로 눌러도 선점에서 갈려 한 통만 나간다.
//
// 🚨 Cloudflare 무료 요금제는 실행 하나에 외부 호출 50개 상한. 이 실행의 호출 수:
//    설정 1 + 오늘 ready 1 + sendSelected 준비 최대 6(읽기·수신거부·수신거부 처리·지메일 토큰·선점·건너뛰기)
//    + 카톡 최대 4(토큰 읽기·토큰 갱신·토큰 저장·보내기) + 보내기 2 × N  →  N=18 이면 48.
//    그래서 자동은 한 번에 18통까지(수동은 관리자 인증이 2개라 20통). 남은 줄은 30분 뒤 다음 실행이 보낸다.
import type { NotifyStatus } from "../notify/types";
import { GMAIL_NOT_CONNECTED, gmailConnected } from "./gmail";
import { kstDate, sendSelected, type SendDeps } from "./service";

/** 자동 발송 한 실행에서 보내는 최대 통수(위 호출 수 계산 참고) */
export const AUTO_MAX_PER_RUN = 18;
/** 자동 발송 시간 창(한국 시간, 시작 포함·끝 제외) */
export const AUTO_START_HOUR = 7;
export const AUTO_END_HOUR = 20;
export const ADMIN_OUTREACH_URL = "https://ai-solution.co.kr/admin/outreach";

/** 자동 발송이 쓰는 DB 일(설정 읽기, 오늘 ready 고르기) */
export interface AutoSendStore {
  getAutoSend(): Promise<boolean>;
  /** batch_date = date 이고 status='ready' 인 줄의 id(만든 순서) */
  readyIdsForDate(date: string): Promise<string[]>;
}

export type AutoSendDeps = SendDeps & {
  auto: AutoSendStore;
  /** 카톡 「나에게 보내기」. 던져도 발송 결과는 그대로다. */
  notify?: (text: string) => Promise<NotifyStatus>;
};

export type AutoSendReason =
  | "outside_window"
  | "auto_off"
  | "settings_error"
  | "gmail_not_connected"
  | "no_ready"
  | "send_error"
  | "done";

export type AutoSendResult = {
  reason: AutoSendReason;
  date: string;
  sent: number;
  failed: number;
  suppressed: number;
  deferred: number;
  kakao?: NotifyStatus | "not_sent";
  error?: string;
};

/** 한국 시간의 요일(0=일 ~ 6=토)·시·분 */
export function kstParts(d: Date): { day: number; hour: number; minute: number } {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return { day: k.getUTCDay(), hour: k.getUTCHours(), minute: k.getUTCMinutes() };
}

/** 한국 시간 07:00 ≤ 시각 < 20:00 이면 true. 요일은 따지지 않는다(주말도 보냄). */
export function inAutoSendWindow(d: Date): boolean {
  const { hour } = kstParts(d);
  return hour >= AUTO_START_HOUR && hour < AUTO_END_HOUR;
}

/** 대표님 카톡 알림 글. 🚨 이모지·마크다운 볼드 금지. */
export function autoSendKakaoText(sent: number, failed: number): string {
  return `오늘 영업 메일 ${sent}통 보냈어요(실패 ${failed}). 확인: ${ADMIN_OUTREACH_URL}`;
}

function shortError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/\s+/g, " ").slice(0, 200) || "알 수 없는 오류";
}

/** 예약 실행 한 번. 예외를 밖으로 던지지 않는다. */
export async function runAutoSend(deps: AutoSendDeps): Promise<AutoSendResult> {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((m: string) => console.log(m));
  const at = now();
  const date = kstDate(at);
  const res: AutoSendResult = { reason: "done", date, sent: 0, failed: 0, suppressed: 0, deferred: 0 };

  if (!inAutoSendWindow(at)) return { ...res, reason: "outside_window" };

  let on: boolean;
  try {
    on = await deps.auto.getAutoSend();
  } catch (e) {
    log(`[outreach:auto] 설정 읽기 실패 — 안 보냄: ${shortError(e)}`);
    return { ...res, reason: "settings_error", error: shortError(e) };
  }
  if (!on) return { ...res, reason: "auto_off" };

  if (!gmailConnected(deps.env)) {
    log(`[outreach:auto] ${GMAIL_NOT_CONNECTED}`);
    return { ...res, reason: "gmail_not_connected", error: GMAIL_NOT_CONNECTED };
  }

  try {
    const ids = await deps.auto.readyIdsForDate(date);
    if (!ids.length) return { ...res, reason: "no_ready" };

    const r = await sendSelected(ids, { ...deps, maxPerRun: Math.min(deps.maxPerRun ?? AUTO_MAX_PER_RUN, AUTO_MAX_PER_RUN) });
    Object.assign(res, { sent: r.sent, failed: r.failed, suppressed: r.suppressed, deferred: r.deferred });
    if (!r.ok) {
      res.reason = "send_error";
      res.error = r.error;
      log(`[outreach:auto] 보내기 실패: ${r.error ?? "?"}`);
    }
  } catch (e) {
    log(`[outreach:auto] 오류: ${shortError(e)}`);
    return { ...res, reason: "send_error", error: shortError(e) };
  }

  log(`[outreach:auto] ${date} 보냄 ${res.sent} · 실패 ${res.failed} · 다음으로 미룸 ${res.deferred}`);

  // 카톡 — 이번 실행에서 1통 이상 보냈을 때만. 실패해도 발송 결과는 그대로.
  if (res.sent >= 1 && deps.notify) {
    try {
      res.kakao = await deps.notify(autoSendKakaoText(res.sent, res.failed));
    } catch (e) {
      res.kakao = `failed:${shortError(e).slice(0, 100)}`;
    }
    if (res.kakao !== "ok") log(`[outreach:auto] 카톡 알림: ${res.kakao}`);
  } else {
    res.kakao = "not_sent";
  }
  return res;
}
