// 파트너 신청 한 건 처리(POST /api/partner/apply 가 부른다). DB·카톡은 deps 로 받아 단위 시험에서 가짜로 끼운다.
// 시험: tests/partner.test.ts
// 🚨 로그에 휴대폰·계좌·이메일 전체를 남기지 마라(이유 코드만).
import { z } from "zod";
import { checkWantedCode } from "./ref";

/** 요청 본문 상한(바이트) */
export const MAX_APPLY_BODY_BYTES = 4096;
export const PARTNER_CONSENT_VERSION = "partner-2026-11-07";
export const ADMIN_PARTNERS_URL = "https://ai-solution.co.kr/admin/partners";

export const PartnerApplySchema = z.object({
  name: z.string().trim().min(1).max(50),
  phone: z
    .string()
    .trim()
    .max(20)
    .transform((s) => s.replace(/\D/g, ""))
    .refine((s) => /^01[016789]\d{7,8}$/.test(s)),
  email: z
    .string()
    .trim()
    .max(254)
    .transform((s) => s.toLowerCase())
    .refine((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)),
  code: z.string().trim().max(16).optional().default(""),
  channels: z.string().trim().min(1).max(1000),
  bankName: z.string().trim().min(1).max(30),
  bankAccount: z
    .string()
    .trim()
    .max(40)
    .transform((s) => s.replace(/\s/g, ""))
    .refine((s) => /^[0-9-]{6,30}$/.test(s)),
  bankHolder: z.string().trim().min(1).max(30),
  agreeRules: z.literal(true),
  agreeDisclosure: z.literal(true),
  agreePrivacy: z.literal(true),
  // 스팸 봇용 숨김 칸(InquiryForm 의 company_website 와 같은 방식). 값이 있으면 봇이다.
  company_website: z.string().max(200).optional().default(""),
});
export type PartnerApplyInput = z.infer<typeof PartnerApplySchema>;

export type ApplyRpcResult =
  | { ok: true; id: string; code: string; name: string }
  | { ok: false; reason: "invalid" | "duplicate" | "code_taken" | "code_reserved" | string };

export type ApplyDeps = {
  /** public.partner_apply(_p) */
  apply: (p: Record<string, string>) => Promise<ApplyRpcResult>;
  /** 대표님 카톡(나에게 보내기). 실패해도 신청은 성공이다. */
  notify: (text: string) => Promise<unknown>;
};

export type ApplyResponse =
  | { status: 200; body: { ok: true; code: string } }
  | { status: 400 | 409 | 500; body: { ok: false; reason: string; error: string } };

const ERRORS: Record<string, string> = {
  invalid: "입력값을 다시 확인해 주세요.",
  duplicate: "이미 같은 휴대폰 번호나 이메일로 신청하셨습니다. 확인이 필요하시면 contact@ai-solution.co.kr 로 연락 주세요.",
  code_taken: "이미 쓰고 있는 코드입니다. 다른 코드를 적거나 비워 두세요(자동으로 만들어 드립니다).",
  code_reserved: "쓸 수 없는 코드입니다. 다른 코드를 적거나 비워 두세요.",
  server: "신청을 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
};

function fail(status: 400 | 409 | 500, reason: string): ApplyResponse {
  return { status, body: { ok: false, reason, error: ERRORS[reason] ?? ERRORS.invalid } };
}

/** 카톡 알림 글(전화·계좌는 넣지 않는다) */
export function applyKakaoText(name: string): string {
  const n = name.replace(/\s+/g, " ").trim().slice(0, 30);
  return `파트너 신청: ${n} / 확인 ${ADMIN_PARTNERS_URL}`;
}

export async function processPartnerApply(raw: unknown, deps: ApplyDeps): Promise<ApplyResponse> {
  const parsed = PartnerApplySchema.safeParse(raw);
  if (!parsed.success) return fail(400, "invalid");
  const d = parsed.data;
  if (d.company_website.trim()) {
    // 봇: 조용히 성공처럼 답한다(저장·알림 없음)
    console.warn("[partner/apply] honeypot");
    return { status: 200, body: { ok: true, code: "" } };
  }
  if (d.code) {
    const c = checkWantedCode(d.code);
    if (!c.ok) return fail(400, c.reason === "reserved" ? "code_reserved" : "invalid");
  }

  let r: ApplyRpcResult;
  try {
    r = await deps.apply({
      name: d.name,
      phone: d.phone,
      email: d.email,
      code: d.code.toLowerCase(),
      channels: d.channels,
      bank_name: d.bankName,
      bank_account: d.bankAccount,
      bank_holder: d.bankHolder,
      consent_version: PARTNER_CONSENT_VERSION,
    });
  } catch (e) {
    console.error(`[partner/apply] 저장 실패: ${e instanceof Error ? e.name : "unknown"}`);
    return fail(500, "server");
  }
  if (!r.ok) {
    const reason = r.reason in ERRORS ? r.reason : "invalid";
    return fail(reason === "duplicate" || reason === "code_taken" ? 409 : 400, reason);
  }

  try {
    await deps.notify(applyKakaoText(r.name));
  } catch (e) {
    console.error(`[partner/apply] 카톡 알림 실패: ${e instanceof Error ? e.name : "unknown"}`);
  }
  return { status: 200, body: { ok: true, code: r.code } };
}
