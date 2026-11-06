// reels-feedback: 페이앱 결제 결과 통보(feedbackurl) 받기. verify_jwt = false(페이앱 서버가 부른다).
// 빌드넷 payapp-feedback 과 같은 흐름: POST+form 확인 → 검증(userid·linkkey·linkval·hash·responsedate) → 원본 저장 →
// 검증 통과 시 reels_apply_event → SUCCESS/FAIL.
// - 원본은 검증·처리 전에 저장한다. 저장 실패는 500 FAIL(페이앱 재시도). 검증 실패는 200 FAIL. apply 결과 error 만 FAIL.
// - apply 가 send_mail=true 를 주면: 새 열쇠 → reels_mail_claim(주문, 열쇠 해시) → 메일 → reels_mail_done.
//   메일 실패는 응답에 영향 없다. 같은 주문 메일은 DB(mail_status IS NULL 일 때만 claim)가 한 번만 내준다.
// - 로그에는 통보 id·주문 id·코드만 남긴다(비밀값·전화번호·열쇠 원문 없음).
import {
  feedbackReply,
  isFormContentType,
  parseForm,
  sanitizePayload,
  verifyNotification,
  type ApplyResult,
  type PayAppSecrets,
} from "../_shared/payapp.ts";
import { hashViewKey, newViewKey, orderPageUrl } from "../_shared/reels.ts";
import {
  buildReelsMail,
  MAIL_NOT_CONFIGURED,
  sendViaResend,
  type FetchLike,
  type ReelsMailData,
} from "../_shared/reelsMail.ts";

export interface ApplyOutcome {
  result: ApplyResult;
  detail: string | null;
  order_id: string | null;
  send_mail: boolean;
}

export interface ReelsFeedbackDeps {
  secrets: () => PayAppSecrets | null;
  /** reels_record_event → 통보 id */
  record: (
    payload: Record<string, unknown>,
    source: "feedback" | "fail",
    verified: boolean,
    verifyError: string | null,
  ) => Promise<number>;
  /** reels_apply_event */
  apply: (eventId: number) => Promise<ApplyOutcome>;
  /** reels_mail_claim(주문 id, 새 열쇠 해시) → 메일 데이터 또는 null(이미 보냄·대상 아님) */
  mailClaim: (orderId: string, keyHash: string) => Promise<ReelsMailData | null>;
  /** reels_mail_done(주문 id, 'sent' | 'skipped:메일 미설정' | 'failed:…') */
  mailDone: (orderId: string, status: string) => Promise<void>;
  resendKey: () => string;
  fetch: FetchLike;
  siteUrl: string;
  newViewKey?: () => string;
  /** 응답을 먼저 돌려주고 뒤에서 마저 할 일(EdgeRuntime.waitUntil). 없으면 기다렸다가 응답한다 */
  defer?: (task: Promise<unknown>) => void;
  now: () => Date;
  log?: (...a: unknown[]) => void;
}

const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createHandler(deps: ReelsFeedbackDeps) {
  const makeKey = deps.newViewKey ?? newViewKey;

  async function sendPaidMail(orderId: string): Promise<void> {
    const key = makeKey();
    const data = await deps.mailClaim(orderId, await hashViewKey(key));
    if (!data) return;
    const mail = buildReelsMail(data, orderPageUrl(deps.siteUrl, data.order_no, key));
    const err = await sendViaResend(mail, data.email, deps.resendKey(), deps.fetch);
    const status =
      err === null
        ? "sent"
        : err === MAIL_NOT_CONFIGURED
          ? `skipped:${MAIL_NOT_CONFIGURED}`
          : `failed:${err}`.slice(0, 500);
    await deps.mailDone(orderId, status);
    if (err)
      deps.log?.("[reels-feedback] 메일 보내지 않음", {
        order: data.order_no,
        status: status.slice(0, 80),
      });
  }

  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST" || !isFormContentType(req.headers.get("Content-Type"))) {
      return text("FAIL", 405);
    }
    const source = new URL(req.url).searchParams.get("src") === "fail" ? "fail" : "feedback";
    let fields: Record<string, string>;
    try {
      fields = parseForm(await req.text());
    } catch {
      return text("FAIL", 405);
    }

    const now = deps.now();
    const v = await verifyNotification(fields, deps.secrets(), now);
    const payload: Record<string, unknown> = { ...sanitizePayload(fields) };
    if (v.skewSeconds !== null) payload._responsedate_skew_sec = v.skewSeconds;
    payload._received_at = now.toISOString();

    let id: number;
    try {
      id = await deps.record(payload, source, v.ok, v.error);
    } catch (e) {
      deps.log?.("[reels-feedback] 원본 저장 실패", msg(e).slice(0, 200));
      return text("FAIL", 500);
    }
    if (!v.ok) {
      deps.log?.("[reels-feedback] 검증 실패", { id, error: v.error });
      return text("FAIL");
    }

    let outcome: ApplyOutcome | null = null;
    try {
      outcome = await deps.apply(id);
    } catch (e) {
      deps.log?.("[reels-feedback] 적용 실패", { id, message: msg(e).slice(0, 200) });
    }
    const result: ApplyResult = outcome?.result ?? "error";
    if (result === "needs_review" || result === "error") {
      deps.log?.("[reels-feedback] 확인 필요", { id, result, order: outcome?.order_id ?? null });
    }

    if (outcome?.send_mail && outcome.order_id) {
      const orderId = outcome.order_id;
      const task = sendPaidMail(orderId).catch((e) => {
        deps.log?.("[reels-feedback] 메일 처리 실패(결제 처리에는 영향 없음)", {
          order: orderId,
          message: msg(e).slice(0, 200),
        });
      });
      if (deps.defer) deps.defer(task);
      else await task;
    }
    return text(feedbackReply(result));
  };
}
