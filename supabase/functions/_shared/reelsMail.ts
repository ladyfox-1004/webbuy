// 문의 댓글 릴스 결제 완료 메일(전자상거래법 계약 내용 알림) — 순수 로직 + Resend 보내기.
// 데이터는 DB reels_mail_claim() 이 돌려준다(같은 주문은 한 번만 나온다). 이모지·마크다운 볼드·결과 보장 문구를 쓰지 않는다.
// sendViaResend 는 빌드넷 _shared/payappMail.ts 방식(실패는 문자열로 돌려줌, 던지지 않음). 키가 없으면 fetch 하지 않는다.
import { goodname, isPlan, type Plan } from "./reels.ts";

export const MAIL_FROM = "에이아이솔루션 <contact@ai-solution.co.kr>";
export const MAIL_TIMEOUT_MS = 8_000;
/** sendViaResend 가 키 없음일 때 돌려주는 값(→ reels_mail_done('skipped:메일 미설정')) */
export const MAIL_NOT_CONFIGURED = "메일 미설정";

/** 아직 정해지지 않은 값 표시. 이 값이면 메일에서 그 줄을 뺀다 */
export const TBD = "[대표님 확인]";

/**
 * 판매자 정보(한 곳에서만 고친다). 대표자는 홈페이지 개인정보 처리방침의 책임자 표기 기준.
 * address·phone 은 대표님이 정해 주시면 TBD 대신 실제 값을 넣는다(그 전까지 메일에 그 줄이 빠진다).
 */
export const SELLER = {
  name: "에이아이솔루션",
  ceo: "이서연",
  bizNo: "215-28-82229",
  mailOrderNo: "2025-서울서초-0732",
  email: "contact@ai-solution.co.kr",
  address: TBD,
  phone: TBD,
} as const;

export const REFUND_SUMMARY = [
  "제작 시작 전: 전액 환불",
  "제작 시작 후: 아직 시작하지 않은 편수만큼 환불(묶음 할인은 빼고, 이미 만든 편은 정가 20만 원으로 계산)",
  "완성본 전달 뒤 수정은 편당 2회까지 무료",
];

const METHOD_LABEL: Record<string, string> = {
  send_materials: "① 자료 보냄",
  ai_only: "② 촬영 없이 맡김",
};

export interface ReelsMailData {
  order_no: string;
  email: string;
  shop_name: string | null;
  plan: number;
  amount: number;
  list_price: number;
  discount: number;
  is_trial: boolean;
  method: string | null;
  paid_at: string | null;
}

export interface BuiltMail {
  subject: string;
  text: string;
  html: string;
}

const won = (n: number | null | undefined) => `${(n ?? 0).toLocaleString("ko-KR")}원`;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** ISO 시각 → 한국 시각 "2026년 11월 6일 12:00". 형식이 틀리면 "-" */
export function kstDateTimeLabel(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "-";
  const k = new Date(t + 9 * 3600_000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${k.getUTCFullYear()}년 ${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 ${p2(k.getUTCHours())}:${p2(k.getUTCMinutes())}`;
}

/** 판매자 정보 줄들(값이 TBD 인 줄은 뺀다) */
export function sellerLines(): string[] {
  const rows: [string, string][] = [
    ["상호", SELLER.name],
    ["대표자", SELLER.ceo],
    ["사업자등록번호", SELLER.bizNo],
    ["통신판매업 신고번호", SELLER.mailOrderNo],
    ["주소", SELLER.address],
    ["전화", SELLER.phone],
    ["이메일", SELLER.email],
  ];
  return rows.filter(([, v]) => v && v !== TBD).map(([k, v]) => `${k}: ${v}`);
}

export function buildReelsMail(d: ReelsMailData, orderUrl: string): BuiltMail {
  const product = isPlan(d.plan) ? goodname(d.plan as Plan) : `문의 댓글 릴스 ${d.plan}편`;
  const discountLabel =
    d.discount > 0 ? `${won(d.discount)} (${d.is_trial ? "첫 주문 할인" : "체험 차감"})` : null;
  const greeting = d.shop_name?.trim()
    ? `${d.shop_name.trim()} 사장님, 결제가 완료되었습니다.`
    : "결제가 완료되었습니다.";

  const orderRows: [string, string][] = [
    ["주문번호", d.order_no],
    ["상품", product],
    ["정가", won(d.list_price)],
    ...(discountLabel ? ([["할인", discountLabel]] as [string, string][]) : []),
    ["결제 금액", `${won(d.amount)} (부가세 포함)`],
    ["결제 일시", kstDateTimeLabel(d.paid_at)],
    ["제작 방식", METHOD_LABEL[d.method ?? ""] ?? "-"],
  ];

  const howTo = [
    "아래 주문 화면 링크에서 사진·영상, 홈페이지 주소, 참고 릴스 주소, 요청사항을 올려 주세요.",
    "카카오톡 채널은 준비 중입니다.",
  ];

  const subject = `[에이아이솔루션] 문의 댓글 릴스 결제 완료 (주문번호 ${d.order_no})`;

  const text = [
    greeting,
    "",
    ...orderRows.map(([k, v]) => `${k}: ${v}`),
    "",
    "주문 화면(자료 올리기·진행 확인)",
    orderUrl,
    "이 링크는 주문하신 분만 쓰는 주소입니다. 다른 사람에게 전달하지 마세요.",
    "",
    "자료 보내는 법",
    ...howTo.map((l) => `- ${l}`),
    "",
    "환불 규정 요약",
    ...REFUND_SUMMARY.map((l) => `- ${l}`),
    "",
    `문의: ${SELLER.email} (이 메일에 답장하셔도 됩니다)`,
    "",
    "판매자 정보",
    ...sellerLines(),
    "",
  ].join("\n");

  const e = escapeHtml;
  const li = (items: string[]) =>
    `<ul style="margin:4px 0 16px;padding-left:20px">${items.map((l) => `<li>${e(l)}</li>`).join("")}</ul>`;
  const html = `<!doctype html><html lang="ko"><body style="margin:0;padding:24px;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#111;line-height:1.6;font-size:15px">
<p>${e(greeting)}</p>
<table style="border-collapse:collapse;margin:12px 0 20px">${orderRows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#555">${e(k)}</td><td style="padding:4px 0">${e(v)}</td></tr>`,
    )
    .join("")}</table>
<p style="margin:0 0 4px">주문 화면(자료 올리기·진행 확인)</p>
<p style="margin:0 0 4px"><a href="${e(orderUrl)}" style="color:#1a56db">${e(orderUrl)}</a></p>
<p style="margin:0 0 20px;color:#555;font-size:13px">이 링크는 주문하신 분만 쓰는 주소입니다. 다른 사람에게 전달하지 마세요.</p>
<p style="margin:0">자료 보내는 법</p>${li(howTo)}
<p style="margin:0">환불 규정 요약</p>${li(REFUND_SUMMARY)}
<p>문의: <a href="mailto:${e(SELLER.email)}">${e(SELLER.email)}</a> (이 메일에 답장하셔도 됩니다)</p>
<hr style="border:none;border-top:1px solid #ddd;margin:20px 0">
<p style="color:#555;font-size:13px;margin:0">판매자 정보<br>${sellerLines().map(e).join("<br>")}</p>
</body></html>`;

  return { subject, text, html };
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Resend 로 보낸다. 성공 null, 키 없음 MAIL_NOT_CONFIGURED(fetch 안 함), 그 밖의 실패는 문자열(던지지 않음) */
export async function sendViaResend(
  mail: BuiltMail,
  to: string,
  apiKey: string,
  fetchFn: FetchLike,
  timeoutMs = MAIL_TIMEOUT_MS,
): Promise<string | null> {
  if (!apiKey.trim()) return MAIL_NOT_CONFIGURED;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [to],
        reply_to: SELLER.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
      signal: ctrl.signal,
    });
    const body = await res.text();
    return res.ok ? null : `Resend ${res.status}: ${body.slice(0, 300)}`;
  } catch (e) {
    return e instanceof DOMException && e.name === "AbortError"
      ? "메일 발송 시간 초과"
      : `메일 발송 실패: ${String((e as Error)?.message ?? e).slice(0, 300)}`;
  } finally {
    clearTimeout(timer);
  }
}
