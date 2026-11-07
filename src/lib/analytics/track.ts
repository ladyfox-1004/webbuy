// 방문 기록(POST /api/track) 서버 쪽 판단 — 로봇 거르기·유입 경로·기기·입력 검사.
// 순수 함수만 둔다(시험: tests/site-track.test.ts). 브라우저 쪽은 ./client-track.ts.
// 🚨 사용자 에이전트 원문은 저장하지 않는다(개인정보 최소화). 여기서 device·source 판단에만 쓴다.

export const VISIT_SOURCES = [
  "daangn",
  "naver",
  "google",
  "instagram",
  "kakao",
  "email",
  "direct",
  "other",
] as const;
export type VisitSource = (typeof VISIT_SOURCES)[number];

/** 요청 본문 상한(바이트). 정상 기록은 300바이트 안팎이다. */
export const MAX_TRACK_BODY_BYTES = 2048;

/** 기록하지 않는 경로: 관리자 화면·로그인 */
export function isUntrackedPath(path: string): boolean {
  return /^\/admin(\/|$|[_.?#])/i.test(path) || /^\/login(\/|$|[?#])/i.test(path);
}

// 검색엔진·미리보기·자동화 도구. KakaoTalk 앱 안 브라우저("KAKAOTALK")는 사람이라 막지 않는다.
// 카톡 링크 미리보기는 "kakaotalk-scrap", 네이버 검색 로봇은 "Yeti", 다음은 "Daumoa".
const BOT_RE =
  /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|scrap|yeti|daumoa|curl|wget|python|httpclient|go-http|okhttp|axios|node-fetch|undici|scrapy|phantom|selenium|puppeteer|playwright|pingdom|uptime|monitor|validator|embedly|whatsapp|telegram|discord|slack|vercel|cloudflare/i;

export function isBot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  if (ua.length < 10) return true; // 비었거나 지나치게 짧은 값 = 사람 브라우저가 아니다
  return BOT_RE.test(ua);
}

export function deviceOf(userAgent: string | null | undefined): "mobile" | "desktop" {
  return /mobi|android|iphone|ipad|ipod|windows phone/i.test(userAgent ?? "") ? "mobile" : "desktop";
}

const OWN_HOSTS = /(^|\.)ai-solution\.co\.kr$|^localhost$|^127\.0\.0\.1$/;

function hostIs(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * 유입 경로 판별.
 * 당근: utm_source 가 daangn/karrot/당근 → referrer 가 daangn.com·karrotmarket → 사용자 에이전트(당근 앱 안 브라우저).
 * 영업 메일: utm_source=email.
 * 나머지(네이버·구글·인스타그램·카카오)는 utm_source → referrer 호스트 → 앱 안 브라우저 순.
 * 아무 단서도 없으면 direct(주소 입력·즐겨찾기·앱이 referrer 를 안 넘긴 경우).
 */
export function classifySource(input: {
  utmSource?: string | null;
  referrerHost?: string | null;
  userAgent?: string | null;
}): VisitSource {
  const utm = (input.utmSource ?? "").trim().toLowerCase();
  const ref = (input.referrerHost ?? "").trim().toLowerCase();
  const host = ref && !OWN_HOSTS.test(ref) ? ref : "";
  const ua = input.userAgent ?? "";

  // 1) 당근
  if (/daangn|karrot|당근/.test(utm)) return "daangn";
  if (host && (hostIs(host, "daangn.com") || /karrotmarket/.test(host))) return "daangn";
  if (/daangn|karrot/i.test(ua)) return "daangn";

  // 2) utm_source 이름. 영업 메일(src/lib/outreach/mail.ts)의 링크는 utm_source=email.
  if (utm) {
    if (/^e-?mail$/.test(utm)) return "email";
    if (/naver/.test(utm)) return "naver";
    if (/google/.test(utm)) return "google";
    if (/instagram|^ig$|insta/.test(utm)) return "instagram";
    if (/kakao/.test(utm)) return "kakao";
  }

  // 3) referrer 호스트
  if (host) {
    if (hostIs(host, "naver.com") || hostIs(host, "naver.me")) return "naver";
    if (/(^|\.)google\.[a-z.]+$/.test(host) || hostIs(host, "googleadservices.com")) return "google";
    if (hostIs(host, "instagram.com")) return "instagram";
    if (hostIs(host, "kakao.com") || hostIs(host, "kakaocorp.com") || hostIs(host, "kakao.co.kr"))
      return "kakao";
    return "other";
  }

  // 4) 앱 안 브라우저(referrer 를 넘기지 않는 앱이 많다)
  if (/\bNAVER\(inapp|NAVER\//.test(ua)) return "naver";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/KAKAOTALK/i.test(ua)) return "kakao";

  if (utm) return "other";
  return "direct";
}

export type TrackInput = {
  visitorId: string;
  sessionId: string;
  path: string;
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const HOST_RE = /^[a-z0-9.-]{1,100}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

/** 짧은 글(utm_*) — 없으면 null, 형식이 틀리면 undefined(요청 전체를 버림) */
function shortText(v: unknown, max = 100): string | null | undefined {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return null;
  if (t.length > max || CONTROL_RE.test(t)) return undefined;
  return t;
}

/**
 * 브라우저가 보낸 본문(JSON 문자열) 검사. 틀리면 null(서버는 204 로 조용히 답한다).
 * 본문 모양: { v: visitor_id, s: session_id, p: path, r?: referrer_host, us?, um?, uc? }
 */
export function parseTrackBody(raw: string): TrackInput | null {
  if (!raw || raw.length > MAX_TRACK_BODY_BYTES) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const b = o as Record<string, unknown>;

  if (typeof b.v !== "string" || !ID_RE.test(b.v)) return null;
  if (typeof b.s !== "string" || !ID_RE.test(b.s)) return null;
  if (typeof b.p !== "string") return null;
  const path = b.p;
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 300 || CONTROL_RE.test(path))
    return null;

  let referrerHost: string | null = null;
  if (b.r !== undefined && b.r !== null && b.r !== "") {
    if (typeof b.r !== "string") return null;
    const h = b.r.trim().toLowerCase();
    if (!HOST_RE.test(h)) return null;
    referrerHost = h;
  }

  const utmSource = shortText(b.us);
  const utmMedium = shortText(b.um);
  const utmCampaign = shortText(b.uc);
  if (utmSource === undefined || utmMedium === undefined || utmCampaign === undefined) return null;

  return { visitorId: b.v, sessionId: b.s, path, referrerHost, utmSource, utmMedium, utmCampaign };
}
