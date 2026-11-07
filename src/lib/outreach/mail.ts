// 「채널 라인」 영업 메일 본문 — 이 파일 한 곳에서만 만든다(관리자 미리보기·실제 발송 모두 여기).
// 순수 함수만 둔다(시험: tests/outreach-mail.test.ts). bun test 에서도 읽으므로 "@/..." 를 쓰지 마라.
//
// 🚨 문체: 쉬운 존댓말, 짧게. 이모지·마크다운 볼드 금지. 결과 보장·「매출 N배」 같은 말 금지.
// 🚨 정보통신망법: 제목 맨 앞 「(광고)」, 바닥글에 보낸 사람 정보·수신거부 방법. 빼지 마라.
// 🚨 받는 쪽 글(채널 이름·영상 제목)은 HTML 에서 반드시 escape, 머리(Subject 등)에서는 줄바꿈을 지운다.
import { SELLER } from "../reels/constants";

export const SITE_URL = "https://ai-solution.co.kr";
export const FROM_EMAIL = "nancoco0705@gmail.com";
export const FROM_NAME = "에이아이솔루션";

const UTM = "utm_source=email&utm_medium=outreach&utm_campaign=channel_line";
export const SHORTS_URL = `${SITE_URL}/reels?${UTM}&utm_content=shorts`;
export const LANDING_URL = `${SITE_URL}/?${UTM}&utm_content=landing`;
export const SHORTS_IMG = `${SITE_URL}/mail/shorts.png`;
export const LANDING_IMG = `${SITE_URL}/mail/landing.png`;

/** 메일을 만드는 데 필요한 칸만(outreach_drafts 한 줄의 일부) */
export type OutreachMailInput = {
  id: string;
  channel_name: string;
  top_title?: string | null;
  email: string;
};

export type OutreachMail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** 페이지 수신거부 화면(바닥글 링크) */
  unsubscribeUrl: string;
  /** List-Unsubscribe 원클릭(POST) 주소 */
  oneClickUrl: string;
};

const CARDS = [
  {
    img: SHORTS_IMG,
    url: SHORTS_URL,
    title: "문의 댓글이 달리는 쇼츠 제작",
    desc: "참고 영상의 흐름·훅을 분석해 새로 만들어 드립니다. 1편 30초 기준",
  },
  {
    img: LANDING_IMG,
    url: LANDING_URL,
    title: "랜딩페이지·홈페이지 제작",
    desc: "문의가 들어오면 카톡·시트로 바로 알림까지",
  },
] as const;

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

/** 머리·한 줄 글: 줄바꿈·제어문자 지우고 공백 정리 */
export function oneLine(s: string | null | undefined): string {
  // eslint-disable-next-line no-control-regex
  return (s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 로그용: 앞 3글자 + *** (이메일 전체를 로그에 찍지 마라) */
export function maskEmail(email: string | null | undefined): string {
  const e = (email ?? "").trim();
  return e ? `${e.slice(0, 3)}***` : "***";
}

export function unsubscribePageUrl(id: string): string {
  return `${SITE_URL}/unsubscribe?id=${encodeURIComponent(id)}`;
}
export function oneClickUnsubscribeUrl(id: string): string {
  return `${SITE_URL}/api/unsubscribe?id=${encodeURIComponent(id)}`;
}

export function outreachSubject(channelName: string): string {
  return `(광고) ${oneLine(channelName)} 채널에 쇼츠를 더해 보시면 어떨까요`;
}

/** 본문 문단(글 판·HTML 판 공통). 카드 앞까지. */
function introParagraphs(name: string, topTitle: string): string[] {
  return [
    `${name} 운영자님께`,
    "안녕하세요, 숏폼·랜딩페이지를 만드는 에이아이솔루션입니다.",
    topTitle
      ? `${name} 채널의 「${topTitle}」 편을 보고 연락드립니다.`
      : `${name} 채널을 보고 연락드립니다.`,
    "롱폼은 꾸준히 올리시는데 쇼츠는 아직 없으셔서, 이미 만들어 두신 영상으로 쇼츠를 더하시면 새 시청자가 들어오는 길이 하나 더 생깁니다.",
    "아래 두 가지를 하고 있습니다. 눌러 보시면 자세히 보실 수 있어요.",
  ];
}

const CLOSING = "상담만 받으셔도 됩니다. 이 메일에 답장 주셔도 됩니다.";
const FOOTER_NOTICE = "이 메일은 공개된 비즈니스 문의 주소로 보내 드렸습니다.";

function sellerLine(): string {
  return `상호 ${SELLER.name} · 대표 ${SELLER.ceo} · 사업자등록번호 ${SELLER.bizNo} · 주소 ${SELLER.address} · 이메일 ${SELLER.email}`;
}

export function renderOutreachMail(d: OutreachMailInput): OutreachMail {
  const to = oneLine(d.email).toLowerCase();
  if (!EMAIL_RE.test(to)) throw new Error("받는 주소 형식이 맞지 않습니다");
  const name = oneLine(d.channel_name);
  if (!name) throw new Error("채널 이름이 비었습니다");
  const topTitle = oneLine(d.top_title);
  const unsubscribeUrl = unsubscribePageUrl(d.id);
  const oneClickUrl = oneClickUnsubscribeUrl(d.id);
  const intro = introParagraphs(name, topTitle);

  const text = [
    ...intro,
    "",
    ...CARDS.flatMap((c, i) => [`${i + 1}. ${c.title}`, `   ${c.desc}`, `   ${c.url}`, ""]),
    CLOSING,
    "",
    "--",
    sellerLine(),
    `${FOOTER_NOTICE} 더 받고 싶지 않으시면 아래 주소를 눌러 주세요(수신거부).`,
    unsubscribeUrl,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  const p = (s: string) =>
    `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#222222;">${escapeHtml(s)}</p>`;
  const card = (c: (typeof CARDS)[number]) => `
<tr><td style="padding:0 0 20px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e3e3e8;border-radius:10px;border-collapse:separate;">
    <tr><td style="padding:0;">
      <a href="${escapeHtml(c.url)}" target="_blank" style="text-decoration:none;"><img src="${escapeHtml(c.img)}" width="558" alt="${escapeHtml(c.title)} — 에이아이솔루션 화면" style="display:block;width:100%;max-width:558px;height:auto;border:0;border-radius:10px 10px 0 0;"></a>
    </td></tr>
    <tr><td style="padding:14px 16px 16px 16px;">
      <p style="margin:0 0 6px 0;font-size:16px;line-height:1.5;font-weight:700;color:#111111;">${escapeHtml(c.title)}</p>
      <p style="margin:0 0 10px 0;font-size:14px;line-height:1.6;color:#444444;">${escapeHtml(c.desc)}</p>
      <a href="${escapeHtml(c.url)}" target="_blank" style="font-size:14px;color:#3b5bdb;text-decoration:underline;">자세히 보기</a>
    </td></tr>
  </table>
</td></tr>`;

  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(outreachSubject(name))}</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f7;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
<tr><td style="padding:28px 20px 8px 20px;">
${intro.map(p).join("\n")}
</td></tr>
<tr><td style="padding:6px 20px 0 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${CARDS.map(card).join("")}
</table>
</td></tr>
<tr><td style="padding:0 20px 24px 20px;">
${p(CLOSING)}
</td></tr>
<tr><td style="padding:16px 20px 24px 20px;border-top:1px solid #eeeeee;">
<p style="margin:0 0 6px 0;font-size:12px;line-height:1.6;color:#888888;">${escapeHtml(sellerLine())}</p>
<p style="margin:0;font-size:12px;line-height:1.6;color:#888888;">${escapeHtml(FOOTER_NOTICE)} 더 받고 싶지 않으시면 <a href="${escapeHtml(unsubscribeUrl)}" target="_blank" style="color:#888888;text-decoration:underline;">여기를 눌러 주세요(수신거부)</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  return { to, subject: outreachSubject(name), text, html, unsubscribeUrl, oneClickUrl };
}

// ───────── MIME ─────────

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** 바이트 → base64(브라우저·워커·bun 어디서나 같은 결과가 나오게 직접 만든다) */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + "==";
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + "=";
  }
  return out;
}

export function toBase64Url(s: string): string {
  return bytesToBase64(utf8(s)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * RFC 2047 UTF-8 B 인코딩. 한 조각(encoded-word)은 75자를 넘지 않게 글자 단위로 나누고
 * 조각 사이는 CRLF+공백으로 접는다. ASCII 만 있으면 그대로.
 */
export function encodeHeaderWord(s: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[ -~]*$/.test(s)) return s;
  const words: number[][] = [];
  let chunk: number[] = [];
  for (const ch of s) {
    const b = Array.from(utf8(ch));
    // 45바이트 → base64 60자 + "=?UTF-8?B?" 10자 + "?=" 2자 = 72자
    if (chunk.length + b.length > 45) {
      words.push(chunk);
      chunk = [];
    }
    chunk.push(...b);
  }
  if (chunk.length) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${bytesToBase64(new Uint8Array(w))}?=`).join("\r\n ");
}

function wrap76(b64: string): string {
  return b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

export type MimeOptions = { boundary?: string };

/** 지메일 API 에 넣을 원문 MIME(줄바꿈 CRLF). multipart/alternative = 글 판 + HTML 판. */
export function buildMime(mail: OutreachMail, opts: MimeOptions = {}): string {
  const boundary =
    opts.boundary ?? `aisol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const mailtoUnsub = `mailto:${FROM_EMAIL}?subject=${encodeURIComponent("수신거부")}`;
  const headers = [
    `From: ${encodeHeaderWord(FROM_NAME)} <${FROM_EMAIL}>`,
    `To: <${mail.to}>`,
    `Subject: ${encodeHeaderWord(oneLine(mail.subject))}`,
    "MIME-Version: 1.0",
    `List-Unsubscribe: <${mail.oneClickUrl}>, <${mailtoUnsub}>`,
    "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const part = (type: string, body: string) =>
    [
      `--${boundary}`,
      `Content-Type: ${type}; charset="UTF-8"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(bytesToBase64(utf8(body.replace(/\r?\n/g, "\r\n")))),
    ].join("\r\n");
  return [
    headers.join("\r\n"),
    "",
    part("text/plain", mail.text),
    part("text/html", mail.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/** 지메일 API users.messages.send 의 raw 값(base64url) */
export function buildRawMessage(mail: OutreachMail, opts: MimeOptions = {}): string {
  return toBase64Url(buildMime(mail, opts));
}
