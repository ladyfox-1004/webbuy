// /api/admin/partners 의 POST 본문 검사(순수 함수, 시험: tests/partner.test.ts).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type AdminAction =
  | { action: "set_status"; id: string; status: "approved" | "rejected" | "paused" }
  | { action: "inquiry_paid"; inquiryId: string; amount: number }
  | { action: "cancel_commission"; id: string; note: string }
  | { action: "make_payouts"; month: string }
  | { action: "payout_paid"; id: string }
  | { action: "resend_approval_mail"; id: string };

/** 한국 시간 기준 'YYYY-MM' */
export function kstMonth(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 7);
}

/** 「1,301,000」「1301000원」 → 1301000. 정수 원이 아니면 null */
export function parseWon(v: unknown): number | null {
  if (typeof v === "number") return Number.isSafeInteger(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[,\s원]/g, "");
  if (!/^\d{1,10}$/.test(s)) return null;
  return Number(s);
}

export function parseAdminAction(body: unknown, now = new Date()): AdminAction | { error: string } {
  if (!body || typeof body !== "object") return { error: "요청 형식이 틀렸습니다." };
  const b = body as Record<string, unknown>;
  const id = typeof b.id === "string" && UUID_RE.test(b.id) ? b.id : null;
  switch (b.action) {
    case "set_status":
      if (!id) return { error: "대상이 없습니다." };
      if (b.status !== "approved" && b.status !== "rejected" && b.status !== "paused")
        return { error: "상태 값이 틀렸습니다." };
      return { action: "set_status", id, status: b.status };
    case "inquiry_paid": {
      const inquiryId = typeof b.inquiry_id === "string" && UUID_RE.test(b.inquiry_id) ? b.inquiry_id : null;
      const amount = parseWon(b.amount);
      if (!inquiryId) return { error: "상담 접수가 없습니다." };
      if (amount === null || amount < 1000 || amount > 1_000_000_000) return { error: "계약 금액을 원 단위 숫자로 넣어 주세요." };
      return { action: "inquiry_paid", inquiryId, amount };
    }
    case "cancel_commission":
      if (!id) return { error: "대상이 없습니다." };
      return { action: "cancel_commission", id, note: typeof b.note === "string" ? b.note.trim().slice(0, 200) : "" };
    case "make_payouts": {
      const month = b.month === undefined || b.month === "" ? kstMonth(now) : b.month;
      if (typeof month !== "string" || !MONTH_RE.test(month)) return { error: "정산 달이 틀렸습니다(YYYY-MM)." };
      return { action: "make_payouts", month };
    }
    case "payout_paid":
      if (!id) return { error: "대상이 없습니다." };
      return { action: "payout_paid", id };
    case "resend_approval_mail":
      if (!id) return { error: "대상이 없습니다." };
      return { action: "resend_approval_mail", id };
    default:
      return { error: "모르는 동작입니다." };
  }
}

/** DB 함수가 돌려준 실패 이유 → 화면 문구 */
export const ADMIN_REASON_TEXT: Record<string, string> = {
  not_found: "대상을 찾지 못했습니다.",
  bad_status: "상태 값이 틀렸습니다.",
  not_approved: "승인된 파트너만 일시정지할 수 있습니다.",
  bad_amount: "계약 금액이 틀렸습니다.",
  no_ref: "추천 코드가 없는 상담입니다.",
  partner_not_approved: "추천한 파트너가 승인 상태가 아닙니다(신청·거절·일시정지).",
  duplicate: "이미 「결제됨」으로 넣은 상담입니다. 고치려면 원장에서 취소한 뒤 다시 넣어 주세요.",
  not_cancellable: "이미 취소된 수수료입니다.",
  already_reversed: "이미 차감 줄을 넣은 수수료입니다(다음 정산에서 빠집니다).",
  is_reversal: "환불·계약 취소 차감 줄은 취소할 수 없습니다.",
  bad_month: "정산 달이 틀렸습니다.",
  already_paid: "이미 지급 완료된 정산입니다.",
};
