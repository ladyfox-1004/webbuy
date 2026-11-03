// 상담 접수 뒤 알림 두 갈래(구글 시트·카카오톡)를 함께 돌리고 결과를 inquiries 행에 적는다.
// 🚨 여기서 무엇이 실패해도 접수는 이미 성공이다. 예외를 밖으로 던지지 않는다.
// 🚨 Workers 는 응답 뒤 남은 Promise 를 버릴 수 있으므로 호출부에서 await 한다.
import { ADMIN_INQUIRIES_URL, readNotifyEnv, type NotifyEnv } from "./env";
import { sendKakaoNotice } from "./kakao";
import { postToSheet } from "./sheet";
import { createNotifyServiceClient, supabaseTokenStore, type ServiceDb } from "./token-store";
import type { FetchLike, InquiryNotice, NotifyStatus } from "./types";
import { errorReason } from "./types";

export type NotifyResult = { sheet: NotifyStatus; kakao: NotifyStatus };

export async function runInquiryNotifications(
  n: InquiryNotice,
  deps: { env?: NotifyEnv; db?: ServiceDb | null; fetchFn?: FetchLike } = {},
): Promise<NotifyResult> {
  const env = deps.env ?? readNotifyEnv();
  let db: ServiceDb | null = null;
  try {
    db = deps.db !== undefined ? deps.db : createNotifyServiceClient(env);
  } catch (err) {
    console.error(`inquiry notify db client failed: ${errorReason(err)}`);
  }
  const fetchFn = deps.fetchFn ?? fetch;
  // 각 갈래는 원래 던지지 않지만, 혹시 던져도 다른 갈래와 결과 기록은 계속한다.
  const guard = (p: Promise<NotifyStatus>) =>
    p.catch((err): NotifyStatus => `failed:${errorReason(err)}`);

  const [sheet, kakao] = await Promise.all([
    guard(postToSheet(n, { url: env.INQUIRY_SHEET_WEBHOOK_URL, token: env.INQUIRY_SHEET_TOKEN }, fetchFn)),
    guard(sendKakaoNotice(
      n,
      {
        restApiKey: env.KAKAO_REST_API_KEY,
        clientSecret: env.KAKAO_CLIENT_SECRET,
        seedRefreshToken: env.KAKAO_REFRESH_TOKEN,
      },
      db ? supabaseTokenStore(db) : null,
      ADMIN_INQUIRIES_URL,
      fetchFn,
    )),
  ]);

  // 결과 기록 — service_role 이 있어야 한다(anon 에는 수정 권한이 없다). 없거나 칸이 아직 없으면 로그만.
  if (db) {
    try {
      const { error } = await db
        .from("inquiries")
        .update({
          sheet_notify_status: sheet,
          kakao_notify_status: kakao,
          notified_at: new Date().toISOString(),
        })
        .eq("id", n.id);
      if (error) console.error(`inquiry notify result save failed [${error.code ?? "?"}]`);
    } catch (err) {
      console.error(`inquiry notify result save crashed: ${errorReason(err)}`);
    }
  }
  // 상태 문자열에는 토큰·연락처가 없다(오류 종류만).
  if (sheet.startsWith("failed") || kakao.startsWith("failed")) {
    console.error(`inquiry notify: sheet=${sheet} kakao=${kakao}`);
  }
  return { sheet, kakao };
}
