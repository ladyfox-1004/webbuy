// 영업 메일 후보 고르기 — 규칙만(네트워크 없음). 노트북 원본을 그대로 옮겼다:
//   제외 규칙·이메일 검사·이름 다듬기      ← C:/shortsmaker/outreach/daily/pick.py
//   short_name()/clean_title()              ← C:/shortsmaker/outreach/sampler/make_drafts.py (+ pick.py 영문 이름 보호)
//   본업 점수 score_business                ← C:/shortsmaker/outreach/sampler/select.py
//   관련성 게이트·쇼츠/롱폼 판정·연락처     ← C:/shortsmaker/outreach/screener/screener.py
// 시험: tests/outreach-pick.test.ts (원본 시험 사례를 옮김)
//
// 🚨 니치 키워드 매칭으로 거르지 않는다(진짜 후보인 변호사·학원 채널을 죽인다). niche 는 「어떤 검색어로 걸렸나」뿐.
// 🚨 국가: country 가 KR 이 아니면 뺀다. 비어 있거나 KR 이면 문자 비율로 죽이지 않는다(고르기 단계).
// 🚨 파이썬 \w 는 한글도 포함한다. JS 로 옮길 때 \w 대신 [\p{L}\p{N}_] (u 플래그)를 썼다.

export const MIN_SUBS = 1000;
export const MAX_SUBS = 100000;
/** 최근 90일 쇼츠가 이보다 많으면(3개 이상) 뺀다 */
export const MAX_SHORTS_90D = 2;
/** 최근 90일 롱폼이 이보다 적으면(0개) 뺀다 — 쉬는 채널 */
export const MIN_LONGFORM_90D = 1;
export const RECENT_DAYS = 90;
/** 롱폼/쇼츠 판정 경계(초). 180~240초는 회색지대라 어느 쪽으로도 안 센다. */
export const LONGFORM_MIN_SEC = 240;
export const SHORTS_MAX_SEC = 180;

export const BAD_EMAIL_SUFFIXES = [".ac.kr", ".go.kr", ".or.kr", ".mil.kr"] as const;
// 「대학」「공사」 단순 포함은 빼지 마라 — 「대학입시」 컨설팅·「인테리어 공사」 같은 진짜 영업 대상이 죽는다(11/7).
export const BAD_NAME_WORDS = ["대학교", "대학원", "학교", "교육청", "공단", "시청", "구청", "군청", "도청", "정부", "국회"] as const;
// 설명란 정규식이 이미지 파일명(logo@2x.png)을 이메일로 잡는 경우가 있다.
const BAD_TLDS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);
const EMAIL_OK =
  /^[a-z0-9](?:[a-z0-9._%+\-]*[a-z0-9_%+\-])?@[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?)*\.[a-z]{2,}$/;

// ───────── 작은 도우미 ─────────

export function maskEmail(email: string | null | undefined): string {
  return `${String(email ?? "").slice(0, 3)}***`;
}

export function normEmail(email: unknown): string {
  return String(email ?? "").trim().toLowerCase();
}

/** 이메일이 쓸 수 없으면 사유, 쓸 수 있으면 "" */
export function emailProblem(email: unknown): string {
  const e = normEmail(email);
  if (!e || !EMAIL_OK.test(e) || e.includes("..")) return "이메일 형식 이상";
  if (BAD_TLDS.has(e.slice(e.lastIndexOf(".") + 1))) return "이메일 형식 이상(이미지 파일명)";
  const domain = e.split("@")[1];
  for (const suffix of BAD_EMAIL_SUFFIXES) if (domain.endsWith(suffix)) return `기관 도메인(${suffix})`;
  return "";
}

export function nameProblem(title: string | null | undefined): string {
  for (const w of BAD_NAME_WORDS) if ((title ?? "").includes(w)) return `채널 이름에 '${w}'`;
  return "";
}

const fmt = (n: number) => n.toLocaleString("en-US");

export function subsProblem(subs: unknown, hidden = false): string {
  if (hidden) return "구독자 비공개";
  const n = typeof subs === "number" ? subs : Number.parseInt(String(subs ?? ""), 10);
  if (!Number.isFinite(n)) return "구독자 수 불명";
  if (n < MIN_SUBS) return `구독자 ${fmt(n)} < ${fmt(MIN_SUBS)}`;
  if (n > MAX_SUBS) return `구독자 ${fmt(n)} > ${fmt(MAX_SUBS)}`;
  return "";
}

export function countryProblem(country: unknown): string {
  const c = String(country ?? "").trim().toUpperCase();
  return c && c !== "KR" ? `해외 채널(country=${c})` : "";
}

/** "a@x.com / b@y.com" 같은 칸 → 소문자 주소 목록(중복 제거, 순서 유지) */
export function splitEmails(raw: unknown): string[] {
  const out: string[] = [];
  for (const part of String(raw ?? "").split(/\s*\/\s*|[,;\s]+/)) {
    const e = normEmail(part);
    if (e && !out.includes(e)) out.push(e);
  }
  return out;
}

/** 목록에서 처음으로 쓸 수 있는 주소. 없으면 email="" 과 첫 사유. */
export function firstUsableEmail(emails: string[]): { email: string; problem: string } {
  const problems: string[] = [];
  for (const e of emails) {
    const p = emailProblem(e);
    if (!p) return { email: e, problem: "" };
    problems.push(p);
  }
  return { email: "", problem: problems[0] ?? "이메일 없음" };
}

/** 이름 비교용: 소문자 + 글자·숫자만(파이썬 str.isalnum) */
export function normName(s: unknown): string {
  return Array.from(String(s ?? "").toLowerCase())
    .filter((ch) => /[\p{L}\p{N}]/u.test(ch))
    .join("");
}

// ───────── 이름 다듬기 (make_drafts.py) ─────────

const HANGUL = /[가-힣]/;

function baseShortName(name: string): string {
  let s = name.trim().split(/\s*[|｜/·]\s*/)[0];
  s = s.replace(/\s*[([].*?[)\]]\s*/g, " ").trim();
  // '돈재이 DONJAY', '소울시커 Soul Seeker' 처럼 뒤에 붙은 로마자 표기 제거
  s = s.replace(/\s+[A-Za-z][A-Za-z .]*$/, "").trim();
  return s || name.trim();
}

/** 메일에 부를 이름. 영문 이름(`Jay Choi | 인디해커`)은 구분자 앞 토막을 그대로 쓴다(pick.py 보호). */
export function shortName(name: string | null | undefined): string {
  const raw = name ?? "";
  const out = baseShortName(raw);
  if (!HANGUL.test(out)) {
    let head = raw.trim().split(/\s*[|｜/·]\s*/)[0];
    head = head.replace(/\s*[([].*?[)\]]\s*/g, " ").trim();
    if (head && !HANGUL.test(head)) return head;
  }
  return out;
}

function stripChars(t: string, chars: string): string {
  const a = Array.from(t);
  let i = 0;
  let j = a.length;
  while (i < j && chars.includes(a[i])) i++;
  while (j > i && chars.includes(a[j - 1])) j--;
  return a.slice(i, j).join("");
}

/** 유튜브 제목의 SEO 키워드 꼬리를 잘라낸다. 첫 구분자 앞까지만, 46자 넘으면 어절 경계에서 줄임. */
export function cleanTitle(title: string | null | undefined): string {
  let t = (title ?? "").trim();
  t = t.split(/\s*[|｜]\s*/)[0].trim();
  t = t.split(/\s+#/)[0].trim();
  t = stripChars(t, " -·|,");
  const chars = Array.from(t);
  if (chars.length > 46) {
    const head = chars.slice(0, 46).join("");
    const sp = head.lastIndexOf(" ");
    const cut = sp >= 0 ? head.slice(0, sp) : head;
    t = (cut || head) + "…";
  }
  return t;
}

export function channelUrl(channelId: string, customUrl?: string | null): string {
  let handle = (customUrl ?? "").trim();
  if (handle) {
    if (!handle.startsWith("@")) handle = "@" + handle.replace(/^\/+/, "");
    return `https://www.youtube.com/${handle}`;
  }
  return `https://www.youtube.com/channel/${channelId}`;
}

// ───────── 연락처 (screener.py extract_emails) ─────────

const SCREENER_EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

/** 설명에 적힌 이메일 전부(순서 유지, 대소문자 무시 중복 제거) */
export function extractEmails(text: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of (text ?? "").matchAll(SCREENER_EMAIL_RE)) {
    const k = m[0].toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m[0]);
  }
  return out;
}

export function summarizeDescription(text: string | null | undefined, limit = 100): string {
  return Array.from((text ?? "").replace(/\s+/g, " ").trim()).slice(0, limit).join("");
}

// ───────── 본업 점수 (select.py score_business) ─────────

const SEL_EMAIL_RE = /[\p{L}\p{N}_.\-+]+@[\p{L}\p{N}_\-]+\.[\p{L}\p{N}_.\-]+/u;
const SEL_PHONE_RE = /(?:0\d{1,2}[-.\s]\d{3,4}[-.\s]\d{4}|1\d{3}[-.\s]\d{4})/;
const DOMAIN_RE =
  /(?<![\p{L}\p{N}_@.\-])((?:[\p{L}\p{N}_\-]+\.)+(?:com|co\.kr|kr|net|org|io|me|dev|ai|shop|store|blog))(?![A-Za-z0-9\-])/giu;

export function findSite(text: string): string {
  for (const m of text.matchAll(DOMAIN_RE)) {
    const d = m[1].toLowerCase();
    if (d.includes("youtu")) continue;
    return d;
  }
  return "";
}

const BIZ_TIER_A = [
  "학원", "교습소", "병원", "의원", "한의원", "치과", "클리닉", "약국", "약사",
  "변호사", "법무법인", "법률사무소", "세무사", "회계사", "법무사", "노무사",
  "공인중개사사무소", "중개사무소", "사업자등록", "등록번호", "상호명", "진료", "원장",
];
const BIZ_TIER_B_PRODUCT = [
  "강사", "강의", "수강", "수강료", "교재", "멤버십", "커리큘럼", "기출문제",
  "컨설팅", "코칭", "저서", "출간", "양성 과정", "양성과정", "클래스", "특강",
];
const BIZ_TIER_B_TITLE = ["컨설턴트", "코치", "아카데미", "연구소", "소장", "대표", "교육을 하는"];
const BIZ_TIER_C = ["출신", "경력", "현직", "실무 경험", "전문가", "년 경력", "년 간", "20년"];
// 한국어는 띄어쓰기로 단어를 못 자른다. 「건강의」 안의 「강의」 같은 매치는 무효.
const KEYWORD_BLOCKERS: Record<string, string[]> = {
  강의: ["건강의", "수강의"],
  강사: ["건강사"],
  학원: ["대학원"],
  의원: ["국회의원", "지방의원", "시의원", "도의원"],
  약사: ["제약사", "계약사"],
  대표: ["대표적"],
  진료: ["무진료"],
};
export const BIZ_A_ANCHORED = 40;
export const BIZ_A_BARE = 30;
export const BIZ_B_ANCHORED = 30;
export const BIZ_B_BARE = 15;
export const BIZ_C_SCORE = 10;

export function keywordHit(text: string, keyword: string): boolean {
  const blockers = KEYWORD_BLOCKERS[keyword] ?? [];
  let start = 0;
  for (;;) {
    const i = text.indexOf(keyword, start);
    if (i < 0) return false;
    let blocked = false;
    for (const word of blockers) {
      const offset = word.indexOf(keyword);
      if (offset < 0) continue;
      const begin = i - offset;
      if (begin >= 0 && text.slice(begin, begin + word.length) === word) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return true;
    start = i + 1;
  }
}

function hasHardContact(text: string): boolean {
  return SEL_EMAIL_RE.test(text) || SEL_PHONE_RE.test(text) || !!findSite(text);
}

/** 본업 신호(학원·변호사·병원 등 → 높음). → { score, keyword, tier } */
export function scoreBusiness(name: string, description: string): { score: number; keyword: string; tier: "A" | "B" | "C" | "none" } {
  const text = `${name ?? ""} ${description ?? ""}`;
  const anchored = hasHardContact(text);
  const a = BIZ_TIER_A.find((w) => keywordHit(text, w));
  if (a) return { score: anchored ? BIZ_A_ANCHORED : BIZ_A_BARE, keyword: a, tier: "A" };
  const p = BIZ_TIER_B_PRODUCT.find((w) => keywordHit(text, w));
  if (p) return { score: BIZ_B_ANCHORED, keyword: p, tier: "B" };
  const t = BIZ_TIER_B_TITLE.find((w) => keywordHit(text, w));
  if (t) return { score: anchored ? BIZ_B_ANCHORED : BIZ_B_BARE, keyword: t, tier: "B" };
  const c = BIZ_TIER_C.find((w) => keywordHit(text, w));
  if (c) return { score: BIZ_C_SCORE, keyword: c, tier: "C" };
  return { score: 0, keyword: "", tier: "none" };
}

// ───────── 관련성 게이트 (screener.py judge_relevance) — 검색 결과를 풀에 넣을 때 ─────────

const MIN_HANGUL_RATIO = 0.3;
const MIN_LETTERS_TO_JUDGE = 4;
const HANGUL_ALL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/g;
const OTHER_LETTER =
  /[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u30FFA-Za-z\u0400-\u04FF\u0600-\u06FF\u0E00-\u0E7F\u0900-\u097F\u0590-\u05FF\u0370-\u03FF]/g;
const FICTION_MARKERS = [
  "드라마", "숏드라마", "웹드라마", "단편극", "막장", "드라마추천", "몰아보기",
  "剧场", "劇場", "短剧", "短劇", "动漫", "動漫", "追剧", "追劇", "漫画", "漫畫",
  "drama", "theatre", "theater", "anime", "animation", "webtoon",
  "mini-drama", "minidrama", "short film", "multisub", "full episode",
  "episode", "ep.", "romance", "revenge", "완결",
];

export function hangulRatio(text: string): { letters: number; ratio: number } {
  const h = (text.match(HANGUL_ALL) ?? []).length;
  const o = (text.match(OTHER_LETTER) ?? []).length;
  const total = h + o;
  return total ? { letters: total, ratio: h / total } : { letters: 0, ratio: 0 };
}

/** 한국 사업자·전문가 채널일 수 있는가. 탈락이면 사유, 통과면 "" */
export function relevanceProblem(ch: { title?: string; description?: string; country?: string }): string {
  const title = ch.title ?? "";
  const blob = `${title} ${ch.description ?? ""}`;
  const country = (ch.country ?? "").trim().toUpperCase();
  if (country && country !== "KR") return `선언 국가가 ${country} 입니다 (KR 아님)`;
  if (!country) {
    const t = hangulRatio(title);
    const titleKorean = t.letters >= MIN_LETTERS_TO_JUDGE && t.ratio >= 0.5;
    if (!titleKorean) {
      const b = hangulRatio(blob);
      if (b.letters >= MIN_LETTERS_TO_JUDGE && b.ratio < MIN_HANGUL_RATIO) {
        return `한국어 비중이 ${Math.round(b.ratio * 100)}% 입니다 (기준 30%, 국가 미기재)`;
      }
    }
  }
  const low = blob.toLowerCase();
  const hits = FICTION_MARKERS.filter((m) => low.includes(m.toLowerCase()));
  if (hits.length) return `드라마·애니 채널로 보입니다 (${hits.slice(0, 3).join(", ")})`;
  return "";
}

// ───────── 최근 90일 쇼츠/롱폼 (screener.py evaluate_channel) ─────────

export type VideoInfo = { id: string; title: string; publishedAt: string; durationSec: number; views: number };

/** ISO 8601 기간 → 초. 'PT1H2M10S' → 3730. 형식이 아니면 -1(라이브 등 길이 미상). */
export function parseIsoDuration(text: string | null | undefined): number {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec((text ?? "").trim());
  if (!m || !m.slice(1).some((x) => x !== undefined)) return -1;
  const [, w, d, h, mi, s] = m;
  return Math.floor(
    Number(w ?? 0) * 604800 + Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Number(s ?? 0),
  );
}

export type VideoVerdict =
  | { ok: true; longform: number; shorts: number; topTitle: string; topUrl: string }
  | { ok: false; reason: string; longform: number; shorts: number };

export function evaluateVideos(videos: VideoInfo[], now: Date): VideoVerdict {
  const cutoff = now.getTime() - RECENT_DAYS * 86400 * 1000;
  const longform: VideoInfo[] = [];
  let shorts = 0;
  for (const v of videos) {
    if (!v.publishedAt) continue;
    const when = Date.parse(v.publishedAt);
    if (!Number.isFinite(when) || when < cutoff) continue;
    if (v.durationSec < 0) continue;
    if (v.durationSec > LONGFORM_MIN_SEC) longform.push(v);
    else if (v.durationSec <= SHORTS_MAX_SEC) shorts++;
  }
  if (longform.length < MIN_LONGFORM_90D) return { ok: false, reason: "최근 90일 롱폼 0(쉬는 채널)", longform: 0, shorts };
  if (shorts > MAX_SHORTS_90D) return { ok: false, reason: `최근 90일 쇼츠 ${shorts}개`, longform: longform.length, shorts };
  const top = longform.reduce((a, b) => (b.views > a.views ? b : a));
  return { ok: true, longform: longform.length, shorts, topTitle: top.title, topUrl: `https://www.youtube.com/watch?v=${top.id}` };
}

// ───────── 빼기 명단 (pick.py Exclusions) ─────────

export class Exclusions {
  /** 보냄 + 수신거부 + 이미 초안(소문자) */
  emails = new Set<string>();
  /** 이미 초안 */
  channelIds = new Set<string>();
  /** 이미 초안에 있는 채널 이름(정규화) */
  names = new Set<string>();

  addDraft(r: { email?: string | null; channel_id?: string | null; channel_name?: string | null }) {
    const e = normEmail(r.email);
    if (e) this.emails.add(e);
    if (r.channel_id) this.channelIds.add(String(r.channel_id));
    if (r.channel_name) {
      const a = normName(r.channel_name);
      const b = normName(shortName(r.channel_name));
      if (a) this.names.add(a);
      if (b) this.names.add(b);
    }
  }

  reason(channelId: string | null | undefined, title: string | null | undefined, emails: string[]): string {
    if (channelId && this.channelIds.has(channelId)) return "이미 초안에 있는 채널";
    for (const e of emails) if (this.emails.has(e)) return "보냈거나 수신거부했거나 이미 초안에 있는 주소";
    if (title && (this.names.has(normName(title)) || this.names.has(normName(shortName(title))))) {
      return "이미 보낸 채널(이름 일치)";
    }
    return "";
  }
}
