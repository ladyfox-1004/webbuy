// 파트너 승인 안내 메일 — 본문 만들기(순수)와 보내고 기록하기(의존성 주입). 시험: tests/partner-mail.test.ts
// bun test 에서도 읽으므로 "@/..." 를 쓰지 마라(상대 경로만).
//
// 🚨 신청자에게 보내는 거래 안내라 (광고) 표시·수신거부는 넣지 않는다. 홍보·할인 문구를 섞지 마라(섞으면 광고 메일이 된다).
// 🚨 문체: 쉬운 존댓말. 이모지·마크다운 볼드 금지.
// 🚨 view_key 는 비밀번호와 같다. 로그·오류 문구에 넣지 마라(메일 본문에만).
// 🚨 메일이 실패해도 승인은 그대로다. 실패 사유는 partners.approval_mail_error 에만 남기고, 관리자 화면에서 다시 보낸다.
import { buildMimeMessage, escapeHtml, oneLine, SITE_URL, toBase64Url, type MimeOptions } from "../outreach/mail";
import { GMAIL_NOT_CONNECTED, gmailAccessToken, gmailConnected, gmailSendRaw, type FetchFn, type GmailCreds } from "../outreach/gmail";

export const APPROVAL_MAIL_SUBJECT = "[에이아이솔루션] 파트너 승인 안내";
export const PARTNER_CONTACT_EMAIL = "contact@ai-solution.co.kr";

export type ApprovalMailTarget = { name: string; email: string; code: string; view_key: string };
export type ApprovalMail = { to: string; subject: string; text: string; html: string };

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const CODE_RE = /^[a-z0-9]{4,16}$/;
const KEY_RE = /^[0-9a-f]{64}$/;

export function partnerLinks(code: string, viewKey: string) {
  return {
    reels: `${SITE_URL}/reels?ref=${code}`,
    home: `${SITE_URL}/?ref=${code}`,
    me: `${SITE_URL}/partner/me?k=${viewKey}`,
  };
}

const RULES = [
  "수수료는 내 링크로 들어온 손님이 결제한 금액의 10%입니다(원 단위 내림).",
  "쇼츠 첫 주문 체험(99,000원)은 수수료가 없습니다.",
  "손님이 링크를 누른 뒤 30일 안에 결제하면 인정됩니다(마지막으로 누른 링크 기준).",
  "정산은 한 달에 한 번, 사업소득 3.3%(소득세 3% + 지방소득세 0.3%)를 뗀 금액을 등록하신 계좌로 보내 드립니다.",
];
const DISCLOSURE = "홍보할 때는 대가를 받고 소개한다는 사실을 꼭 표시해 주세요(공정거래위원회 추천·보증 심사지침).";
const DISCLOSURE_EXAMPLE = "예) 글·영상 첫머리에 「에이아이솔루션 파트너 활동으로 수수료를 받습니다」";
const KEY_WARNING = "이 주소는 비밀번호처럼 다른 사람과 나누지 마세요.";

export function renderApprovalMail(t: ApprovalMailTarget): ApprovalMail {
  const to = oneLine(t.email).toLowerCase();
  if (!EMAIL_RE.test(to)) throw new Error("받는 주소 형식이 맞지 않습니다");
  const code = oneLine(t.code);
  if (!CODE_RE.test(code)) throw new Error("추천 코드 형식이 맞지 않습니다");
  if (!KEY_RE.test(t.view_key)) throw new Error("파트너 화면 열쇠가 없습니다");
  const name = oneLine(t.name) || "파트너";
  const links = partnerLinks(code, t.view_key);

  const text = [
    `${name}님, 안녕하세요. 에이아이솔루션입니다.`,
    "파트너 신청이 승인되었습니다. 함께하게 되어 반갑습니다.",
    "",
    `내 코드: ${code}`,
    "",
    "내 전용 링크(이 링크로 들어온 손님의 결제가 내 수수료로 쌓입니다)",
    `- 문의 댓글 쇼츠 제작: ${links.reels}`,
    `- 홈페이지·랜딩페이지·AI 개발: ${links.home}`,
    "",
    "내 화면(방문 수·수수료·정산 내역)",
    links.me,
    KEY_WARNING,
    "",
    "수수료 규칙 요약",
    ...RULES.map((r) => `- ${r}`),
    "",
    DISCLOSURE,
    DISCLOSURE_EXAMPLE,
    "",
    `궁금한 점은 ${PARTNER_CONTACT_EMAIL} 로 보내 주세요.`,
    "",
    "에이아이솔루션 드림",
  ].join("\n");

  const p = (s: string) => `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#222222;">${escapeHtml(s)}</p>`;
  const h = (s: string) => `<p style="margin:22px 0 8px 0;padding-top:14px;border-top:1px solid #eeeeee;font-size:16px;line-height:1.5;color:#111111;">${escapeHtml(s)}</p>`;
  const a = (url: string) =>
    `<a href="${escapeHtml(url)}" target="_blank" style="color:#3b5bdb;text-decoration:underline;word-break:break-all;">${escapeHtml(url)}</a>`;
  const li = (inner: string) => `<li style="margin:0 0 6px 0;font-size:14px;line-height:1.6;color:#333333;">${inner}</li>`;
  const ul = (items: string[]) => `<ul style="margin:0 0 14px 0;padding-left:20px;">${items.join("")}</ul>`;

  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(APPROVAL_MAIL_SUBJECT)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f7;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
<tr><td style="padding:28px 20px 24px 20px;">
${p(`${name}님, 안녕하세요. 에이아이솔루션입니다.`)}
${p("파트너 신청이 승인되었습니다. 함께하게 되어 반갑습니다.")}
<p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#222222;">내 코드: <span style="font-family:Menlo,Consolas,monospace;font-size:16px;color:#111111;background:#f1f3f5;padding:2px 8px;border-radius:6px;">${escapeHtml(code)}</span></p>
${h("내 전용 링크")}
${p("이 링크로 들어온 손님의 결제가 내 수수료로 쌓입니다.")}
${ul([li(`문의 댓글 쇼츠 제작<br>${a(links.reels)}`), li(`홈페이지·랜딩페이지·AI 개발<br>${a(links.home)}`)])}
${h("내 화면(방문 수·수수료·정산 내역)")}
<p style="margin:0 0 6px 0;font-size:14px;line-height:1.6;">${a(links.me)}</p>
<p style="margin:0 0 14px 0;font-size:13px;line-height:1.6;color:#c92a2a;">${escapeHtml(KEY_WARNING)}</p>
${h("수수료 규칙 요약")}
${ul(RULES.map((r) => li(escapeHtml(r))))}
<p style="margin:0 0 6px 0;font-size:14px;line-height:1.6;color:#222222;">${escapeHtml(DISCLOSURE)}</p>
<p style="margin:0 0 14px 0;font-size:13px;line-height:1.6;color:#555555;">${escapeHtml(DISCLOSURE_EXAMPLE)}</p>
<p style="margin:20px 0 0 0;font-size:14px;line-height:1.6;color:#444444;">궁금한 점은 <a href="mailto:${PARTNER_CONTACT_EMAIL}" style="color:#3b5bdb;">${PARTNER_CONTACT_EMAIL}</a> 로 보내 주세요.</p>
<p style="margin:14px 0 0 0;font-size:14px;line-height:1.6;color:#444444;">에이아이솔루션 드림</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  return { to, subject: APPROVAL_MAIL_SUBJECT, text, html };
}

/** 지메일 API raw(base64url). 보낸 사람은 "에이아이솔루션" <nancoco0705@gmail.com>, 답장은 문의 주소로. */
export function buildApprovalRaw(mail: ApprovalMail, opts: MimeOptions = {}): string {
  return toBase64Url(buildMimeMessage(mail, [`Reply-To: <${PARTNER_CONTACT_EMAIL}>`], opts));
}

// ───────── 보내고 기록하기 ─────────

export type ApprovalMailDeps = {
  /** partner_approval_mail_target */
  getTarget(id: string): Promise<{ ok: true; target: ApprovalMailTarget } | { ok: false; reason: string }>;
  /** partner_approval_mail_result(_error NULL = 성공) */
  record(id: string, error: string | null): Promise<void>;
  env: GmailCreds;
  fetchFn?: FetchFn;
};

export type ApprovalMailOutcome =
  | { mail: "sent"; mail_error: null }
  | { mail: "failed"; mail_error: string }
  | { mail: "skipped"; mail_error: string };

/** 던지지 않는다. 대상이 아니면 skipped(기록 안 함), 보내다 실패하면 failed(사유 기록). */
export async function deliverApprovalMail(id: string, deps: ApprovalMailDeps): Promise<ApprovalMailOutcome> {
  let target: ApprovalMailTarget;
  try {
    const t = await deps.getTarget(id);
    if (!t.ok) {
      return { mail: "skipped", mail_error: t.reason === "not_approved" ? "승인된 파트너가 아닙니다." : "파트너를 찾지 못했습니다." };
    }
    target = t.target;
  } catch {
    return { mail: "skipped", mail_error: "파트너 정보를 읽지 못했습니다." };
  }

  let error: string | null = null;
  try {
    if (!gmailConnected(deps.env)) throw new Error(GMAIL_NOT_CONNECTED);
    const raw = buildApprovalRaw(renderApprovalMail(target));
    const token = await gmailAccessToken(deps.env, deps.fetchFn);
    await gmailSendRaw(raw, token, deps.fetchFn);
  } catch (e) {
    error = (e instanceof Error ? e.message : "알 수 없는 오류").slice(0, 300);
  }
  try {
    await deps.record(id, error);
  } catch {
    // 기록 실패는 화면 결과로만 알린다(메일은 이미 나갔을 수 있다)
  }
  return error === null ? { mail: "sent", mail_error: null } : { mail: "failed", mail_error: error };
}
