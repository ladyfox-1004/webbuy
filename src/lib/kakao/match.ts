// 챗봇 글 판단 도구 — FAQ 키워드 찾기, AI 답 거르기(금액·기간·결과 약속), 연락처·주소 읽기.
// 네트워크·DB 를 쓰지 않는다(시험: tests/kakao-chat.test.ts).
import { COMMON_FAQ, MENUS, MENU_KEYS, allFactTexts, type FaqItem, type MenuKey } from "./faq";

/** 관리자가 더한 FAQ(public.kakao_faq_extra) 한 줄 */
export type ExtraFaq = { id: string; menu: MenuKey | null; keywords: string[]; answer: string };

/** 소문자 + 띄어쓰기·문장부호 빼기. 「9.9」 같은 소수점은 남긴다. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/(\d)\.(?=\d)/g, "$1소수점")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .replace(/소수점/g, ".");
}

function keywordScore(text: string, keywords: readonly string[]): number {
  let score = 0;
  for (const raw of keywords) {
    const parts = raw
      .split("&")
      .map(norm)
      .filter((p) => p.length > 0);
    if (!parts.length) continue;
    // 한 글자 키워드는 잘못 걸리기 쉬워서 쓰지 않는다(「앱」만 예외 — 원본 질문 「앱도 만들어요」).
    if (parts.length === 1 && parts[0].length < 2 && parts[0] !== "앱") continue;
    if (parts.every((p) => text.includes(p))) score += parts.reduce((n, p) => n + p.length, 0);
  }
  return score;
}

export type FaqHit =
  | { type: "faq"; item: FaqItem; menu: MenuKey | null }
  | { type: "extra"; item: ExtraFaq }
  /** 메뉴를 모르는데 여러 메뉴에 걸림 — 어떤 서비스인지 되묻는다 */
  | { type: "ambiguous"; refund: boolean }
  | null;

/** 질문에 메뉴 이름이 들어 있으면 그 메뉴로 본다(메뉴를 고르기 전 질문용). */
export function menuHint(text: string): MenuKey | null {
  const t = norm(text);
  if (/쇼츠|릴스|숏폼|shorts|reels/.test(t)) return "shorts";
  if (t.includes("랜딩")) return "landing";
  if (/ai개발|자동화|인공지능/.test(t)) return "ai";
  if (t.includes("홈페이지")) return "homepage";
  return null;
}

type Scored = { item: FaqItem; menu: MenuKey | null; score: number };

function best(text: string, items: readonly FaqItem[], menu: MenuKey | null): Scored | null {
  let top: Scored | null = null;
  for (const item of items) {
    const score = keywordScore(text, item.keywords);
    if (score > 0 && (!top || score > top.score)) top = { item, menu, score };
  }
  return top;
}

/**
 * 찾는 순서: ① 기본 FAQ(지금 메뉴 + 공통, 메뉴를 모르면 질문 속 메뉴 이름 → 없으면 전체)
 *            ② 관리자가 더한 FAQ(지금 메뉴 + 공통)
 * 메뉴를 모르는데 여러 메뉴의 답이 갈리면(예: 「가격」) ambiguous.
 */
export function matchFaq(
  textRaw: string,
  menu: MenuKey | null,
  extra: readonly ExtraFaq[] = [],
): FaqHit {
  const text = norm(textRaw);
  if (!text) return null;
  const common = best(text, COMMON_FAQ, null);
  const focus = menu ?? menuHint(textRaw);

  if (focus) {
    const m = best(text, MENUS[focus].faq, focus);
    const pick = m && (!common || m.score >= common.score) ? m : common;
    if (pick) return { type: "faq", item: pick.item, menu: pick.menu };
  } else {
    const per = MENU_KEYS.map((k) => best(text, MENUS[k].faq, k)).filter((x): x is Scored => !!x);
    const topScore = Math.max(0, ...per.map((p) => p.score));
    if (common && common.score >= topScore) return { type: "faq", item: common.item, menu: null };
    if (per.length) {
      const tops = per.filter((p) => p.score === topScore);
      const answers = new Set(tops.map((p) => p.item.answer));
      if (tops.some((p) => p.item.kind === "refund")) return { type: "ambiguous", refund: true };
      if (answers.size === 1) return { type: "faq", item: tops[0].item, menu: tops[0].menu };
      return { type: "ambiguous", refund: false };
    }
  }

  let ex: { item: ExtraFaq; score: number } | null = null;
  for (const item of extra) {
    if (item.menu !== null && focus !== null && item.menu !== focus) continue;
    const score = keywordScore(text, item.keywords);
    // 같은 점수면 지금 메뉴 것을 공통보다 먼저
    if (
      score > 0 &&
      (!ex ||
        score > ex.score ||
        (score === ex.score && item.menu !== null && ex.item.menu === null))
    )
      ex = { item, score };
  }
  return ex ? { type: "extra", item: ex.item } : null;
}

/** 「자주 묻는 질문」 단추를 눌러 들어온 글(라벨 그대로)을 지금 메뉴(없으면 공통)에서 찾는다 */
export function faqByLabel(text: string, menu: MenuKey | null): FaqItem | null {
  const t = text.trim();
  const list = menu ? [...MENUS[menu].faq, ...COMMON_FAQ] : COMMON_FAQ;
  return list.find((f) => f.label === t) ?? null;
}

// ── 금액·기간·횟수 검사 ──────────────────────────────────────────
const UNIT_MULT: Record<string, number> = {
  억: 100000000,
  천만: 10000000,
  백만: 1000000,
  만: 10000,
  천: 1000,
};

/** 글 속 「숫자+단위」를 정규화해 모은다. 예) "9.9만 원" → "won:99000", "7일" → "일:7", "2회" → "회:2" */
export function numberTokens(text: string): string[] {
  const out: string[] = [];
  const s = text.replace(/(\d),(?=\d{3}(?!\d))/g, "$1");
  const re =
    /(\d+(?:\.\d+)?)\s*(억|천만|백만|만|천)?\s*(원|일|주일|주|개월|달|년|시간|분|초|회|번|편|%|퍼센트|배)?/g;
  for (const m of s.matchAll(re)) {
    const n = Number(m[1]);
    const mult = m[2];
    const unit = m[3];
    if (!Number.isFinite(n)) continue;
    if (mult || unit === "원") {
      // 「15만」「9.9만」처럼 원이 빠져도 금액으로 본다
      out.push(`won:${Math.round(n * (mult ? UNIT_MULT[mult] : 1))}`);
    } else if (unit) {
      const u = unit === "퍼센트" ? "%" : unit === "주일" ? "주" : unit;
      out.push(`${u}:${n}`);
    }
  }
  return out;
}

let allowedCache: Set<string> | null = null;
/** 확정 사실(FAQ·첫 안내)에 나오는 금액·기간·횟수만 허용 */
export function allowedNumberTokens(): Set<string> {
  if (!allowedCache) allowedCache = new Set(allFactTexts().flatMap(numberTokens));
  return allowedCache;
}

/** 확정 금액(원) 목록 — 시험·보고용 */
export function allowedAmounts(): number[] {
  return [...allowedNumberTokens()]
    .filter((t) => t.startsWith("won:"))
    .map((t) => Number(t.slice(4)))
    .sort((a, b) => a - b);
}

const KOREAN_NUMBER_MONEY = /[일이삼사오육칠팔구십백천]\s*(만|천)?\s*원/;
const PROMISE =
  /(보장(해\s*드립|해\s*드려|합니다|됩니다|돼요|해요)|늘려\s*드|늘어납|늘어나요|올려\s*드|상위\s*노출|무조건|반드시\s*(늘|올|나)|확실히\s*(늘|올))/;

const EMOJI = /\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|\u{20E3}/gu;

/** AI 답 다듬기 + 검사. 쓸 수 있으면 다듬은 글, 버려야 하면 null. */
export function checkAiAnswer(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let t = raw
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*(#+|[-*•]|\d+\.)\s+/gm, "")
    .replace(EMOJI, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  // 3문장 이내
  // 「9.9만」의 점은 문장 끝이 아니다
  const sentences = t.split(/(?<=[.!?。])(?!\d)\s*/).filter((x) => x.trim());
  t = sentences
    .slice(0, 3)
    .map((x) => x.trim())
    .join(" ")
    .trim();
  if (Array.from(t).length > 400) return null;
  if (PROMISE.test(t) || KOREAN_NUMBER_MONEY.test(t)) return null;
  const allowed = allowedNumberTokens();
  for (const tok of numberTokens(t)) if (!allowed.has(tok)) return null;
  return t;
}

// ── 연락처·주소 ─────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[a-z]{2,}$/i;

/** 휴대폰(010-1234-5678 로 맞춤) 또는 이메일이면 그 값, 아니면 null */
export function parseContact(raw: string): string | null {
  const s = raw.trim();
  if (EMAIL_RE.test(s) && s.length <= 200) return s.toLowerCase();
  let d = s.replace(/[\s\-().]/g, "");
  if (d.startsWith("+82")) d = `0${d.slice(3).replace(/^0/, "")}`;
  if (/^010\d{8}$/.test(d) || /^01[16789]\d{7,8}$/.test(d)) {
    return d.length === 11
      ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
      : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return null;
}

/** 글 속 http(s) 주소들(최대 20개) */
export function extractUrls(s: string): string[] {
  const found = s.match(/https?:\/\/[^\s<>"'()]+/gi) ?? [];
  return [...new Set(found.map((u) => u.replace(/[.,]+$/, "")))].slice(0, 20);
}

/** sha256 앞 16자(kakao_questions.user_key). 카카오 id 를 그대로 남기지 않는다. */
export async function hashUserKey(userKey: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userKey));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/** 상수시간 문자열 비교(스킬 토큰) */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  const len = Math.max(ea.length, eb.length);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < len; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}
