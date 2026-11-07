// 카카오 채널 챗봇 시험 — 실행: bun test ./tests
// 네트워크·DB 에 나가지 않는다(저장소·AI·접수·알림을 가짜로 끼운다).
import { describe, expect, test } from "bun:test";
import { KAKAO_OPENCHAT_URL } from "../src/lib/portfolio";
import { LIST_PRICE, REFUND_RULES } from "../src/lib/reels/constants";
import {
  COMMON_FAQ,
  MENUS,
  MENU_KEYS,
  OPEN_PROFILE_URL,
  REFUND_WHICH,
  UNKNOWN_ANSWER,
  type MenuKey,
} from "../src/lib/kakao/faq";
import {
  allowedAmounts,
  checkAiAnswer,
  extractUrls,
  hashUserKey,
  matchFaq,
  numberTokens,
  parseContact,
  safeEqual,
  type ExtraFaq,
} from "../src/lib/kakao/match";
import { LIMITS, RETRY_TEXT, type SkillResponse } from "../src/lib/kakao/response";
import {
  BOT_ANSWER_STAFF,
  CONTACT_OFFER,
  DONE_TEXT,
  WELCOME_TEXT,
  buildInquiry,
  type Session,
  type SessionData,
} from "../src/lib/kakao/flow";
import {
  handleSkill,
  parseSkillRequest,
  questionAlertText,
  type SkillDeps,
} from "../src/lib/kakao/skill";
import type { ChatStore, QuestionRow } from "../src/lib/kakao/store";
import { buildAiRequest, buildSystemPrompt, readAiText, askGemini } from "../src/lib/kakao/ai";
import { QuestionAction, cleanKeywords } from "../src/lib/kakao/admin";
import type { InquiryInput } from "../src/lib/inquiry-submit";

const TOKEN = "test-skill-token-not-real";
const USER = "kakao-user-fake-1";

// ── 가짜 저장소 ─────────────────────────────────────────────────
class FakeStore implements ChatStore {
  sessions = new Map<string, Session & { alertAt?: number }>();
  questions: QuestionRow[] = [];
  extra: ExtraFaq[] = [];
  alerts = 0;
  delayMs = 0;
  async load(k: string) {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const s = this.sessions.get(k);
    return s ? (structuredClone(s) as Session) : null;
  }
  async save(
    k: string,
    s: { menu: MenuKey | null; step: string; data: SessionData; resetPhotos: boolean },
    now: Date,
  ) {
    const prev = this.sessions.get(k);
    this.sessions.set(k, {
      menu: s.menu,
      step: s.step,
      data: structuredClone(s.data),
      photos: s.resetPhotos ? [] : (prev?.photos ?? []),
      updatedAt: now.toISOString(),
      alertAt: prev?.alertAt,
    });
  }
  async addPhotos(k: string, urls: string[], max: number) {
    const s = this.sessions.get(k);
    if (!s) return 0;
    s.photos = [...new Set([...s.photos, ...urls])].slice(0, max);
    return s.photos.length;
  }
  async loadExtraFaq() {
    return this.extra;
  }
  async insertQuestion(row: QuestionRow) {
    this.questions.push({ ...row });
  }
  async setQuestionContact(ids: string[], contact: string) {
    for (const q of this.questions) if (ids.includes(q.id) && !q.contact) q.contact = contact;
  }
  async alertDue(k: string, now: Date) {
    const s = this.sessions.get(k);
    const last = s?.alertAt;
    if (last !== undefined && now.getTime() - last < 10 * 60 * 1000) return false;
    if (s) s.alertAt = now.getTime();
    else
      this.sessions.set(k, {
        menu: null,
        step: "idle",
        data: {},
        photos: [],
        updatedAt: now.toISOString(),
        alertAt: now.getTime(),
      });
    return true;
  }
}

type Harness = {
  store: FakeStore;
  submitted: InquiryInput[];
  alertTexts: string[];
  aiCalls: string[];
  now: { t: number };
  say: (utt: string, extra?: Record<string, unknown>) => Promise<SkillResponse>;
  welcome: () => Promise<SkillResponse>;
  deps: SkillDeps;
};

function harness(over: Partial<SkillDeps> & { aiAnswer?: string | null } = {}): Harness {
  const store = new FakeStore();
  const submitted: InquiryInput[] = [];
  const alertTexts: string[] = [];
  const aiCalls: string[] = [];
  const now = { t: Date.parse("2026-11-07T03:00:00Z") };
  let id = 0;
  const deps: SkillDeps = {
    expectedToken: TOKEN,
    store,
    ai: async (q) => {
      aiCalls.push(q);
      return over.aiAnswer === undefined ? null : over.aiAnswer;
    },
    submit: async (inq) => {
      submitted.push(inq);
      return true;
    },
    alert: async (t) => {
      alertTexts.push(t);
    },
    now: () => new Date(now.t),
    newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    ...over,
  };
  const call = (body: unknown, token = TOKEN) => handleSkill(JSON.stringify(body), token, deps);
  return {
    store,
    submitted,
    alertTexts,
    aiCalls,
    now,
    deps,
    say: (utt, extra = {}) =>
      call({
        intent: { id: "x", name: "폴백 블록" },
        userRequest: {
          utterance: utt,
          user: { id: USER, type: "botUserKey" },
          block: { id: "b", name: "폴백 블록" },
          ...extra,
        },
        action: { name: "skill", params: {}, detailParams: {} },
      }),
    welcome: () =>
      call({
        intent: { id: "w", name: "웰컴 블록" },
        userRequest: { utterance: "", user: { id: USER }, block: { id: "w", name: "웰컴 블록" } },
        action: { params: {} },
      }),
  };
}

function texts(r: SkillResponse): string {
  return r.template.outputs
    .map((o) => ("simpleText" in o ? o.simpleText.text : o.textCard.description))
    .join("\n---\n");
}
function quick(r: SkillResponse): string[] {
  return (r.template.quickReplies ?? []).map((q) => q.label);
}
function buttons(r: SkillResponse) {
  return r.template.outputs.flatMap((o) => ("textCard" in o ? o.textCard.buttons : []));
}

/** 카카오 v2 응답 제한 검사 */
function assertKakaoShape(r: SkillResponse) {
  expect(r.version).toBe("2.0");
  expect(r.template.outputs.length).toBeGreaterThanOrEqual(1);
  expect(r.template.outputs.length).toBeLessThanOrEqual(LIMITS.outputs);
  for (const o of r.template.outputs) {
    if ("simpleText" in o) {
      expect(Array.from(o.simpleText.text).length).toBeLessThanOrEqual(LIMITS.simpleText);
    } else {
      expect(Array.from(o.textCard.description).length).toBeLessThanOrEqual(LIMITS.cardDescription);
      expect(o.textCard.buttons.length).toBeLessThanOrEqual(LIMITS.cardButtons);
      for (const b of o.textCard.buttons) {
        expect(Array.from(b.label).length).toBeLessThanOrEqual(LIMITS.buttonLabel);
        expect(b.action).toBe("webLink");
        expect(b.webLinkUrl).toMatch(/^https:\/\//);
      }
    }
  }
  const qr = r.template.quickReplies ?? [];
  expect(qr.length).toBeLessThanOrEqual(LIMITS.quickReplies);
  for (const q of qr) {
    expect(Array.from(q.label).length).toBeLessThanOrEqual(LIMITS.quickLabel);
    expect(q.action).toBe("message");
    expect(q.messageText.length).toBeGreaterThan(0);
  }
  // 이모지·굵은 글씨 금지
  const all = texts(r) + qr.map((q) => q.label).join("");
  expect(all).not.toContain("**");
  expect(/\p{Extended_Pictographic}/u.test(all)).toBe(false);
}

// ── 답변 체계(원본 문서 문구) ────────────────────────────────────
describe("답변 체계 데이터", () => {
  test("대표 문장이 원본 문서와 같다", () => {
    expect(MENUS.homepage.intro).toContain(
      "비용은 99만 원(부가세 별도)이고, 필요한 페이지와 기능에 맞춰 상담 후 확정 견적을 드립니다.",
    );
    expect(MENUS.landing.intro).toStartWith(
      "광고를 보고 들어온 손님이 바로 문의하게 만드는 한 장짜리 페이지(랜딩페이지)를 만들어 드립니다.",
    );
    expect(MENUS.ai.faq.find((f) => f.id === "ai-app")?.answer).toBe(
      "휴대폰 웹앱이나 토스 미니앱 같은 개발도 상담 가능합니다.",
    );
    expect(MENUS.shorts.faq.find((f) => f.id === "sh-price")?.answer).toBe(
      "1편 20만 원(첫 주문만 9.9만 원), 5편 75만 원(편당 15만 원), 10편 140만 원(편당 14만 원), 모두 부가세 포함입니다. 1편은 30초 기준이에요.",
    );
    expect(MENUS.shorts.faq.find((f) => f.id === "sh-refund")?.answer).toBe(
      "제작 시작 전에는 전액 환불해 드려요. 제작 시작 후에는 아직 시작하지 않은 편수만큼 환불해 드리고, 이때 묶음 할인은 빼고 이미 만든 편은 정가 20만 원으로 계산합니다. 완성본을 받으신 뒤 수정은 편당 2회까지 무료예요.",
    );
    expect(MENUS.homepage.faq.find((f) => f.id === "build-refund")?.answer).toStartWith(
      "작업 시작 전에는 전액 환불해 드려요. 작업을 시작한 뒤에는 진행한 만큼을 빼고 환불해 드리고",
    );
    expect(COMMON_FAQ.find((f) => f.id === "common-when")?.answer).toBe(
      "접수되면 담당자가 확인해서 연락드려요(보통 24시간 안).",
    );
    expect(UNKNOWN_ANSWER).toBe(
      "좋은 질문이에요. 담당자가 확인해서 답변드릴게요. 연락처를 남겨 주시면 빠르게 연락드릴게요.",
    );
  });

  test("쇼츠 환불 답이 주문 화면 환불 규정(REFUND_RULES)·정가(LIST_PRICE)와 맞다", () => {
    const a = MENUS.shorts.faq.find((f) => f.id === "sh-refund")!.answer;
    expect(REFUND_RULES[0]).toBe("제작 시작 전에는 전액 환불해 드립니다.");
    expect(a).toContain("제작 시작 전에는 전액 환불");
    expect(REFUND_RULES[1]).toContain("아직 시작하지 않은 편수만큼 환불");
    expect(a).toContain("아직 시작하지 않은 편수만큼 환불");
    expect(REFUND_RULES[1]).toContain("묶음 할인은 빼고");
    expect(a).toContain("묶음 할인은 빼고");
    expect(a).toContain(`정가 ${LIST_PRICE[1] / 10000}만 원`);
    expect(REFUND_RULES[2]).toContain("편당 2회까지 무료");
    expect(a).toContain("편당 2회까지 무료");
  });

  test("이모지·굵은 글씨 없음, 라벨 14자 이내, 메뉴 안 라벨 겹침 없음", () => {
    for (const k of MENU_KEYS) {
      const m = MENUS[k];
      const all = [m.intro, ...m.faq.map((f) => f.answer)].join("\n");
      expect(all).not.toContain("**");
      expect(/\p{Extended_Pictographic}/u.test(all)).toBe(false);
      const labels = [...m.faq, ...COMMON_FAQ].map((f) => f.label);
      expect(new Set(labels).size).toBe(labels.length);
      for (const l of labels) expect(Array.from(l).length).toBeLessThanOrEqual(14);
      expect(Array.from(m.quickLabel).length).toBeLessThanOrEqual(14);
    }
    expect(OPEN_PROFILE_URL).toBe(KAKAO_OPENCHAT_URL);
  });

  test("받아야 할 자료 순서(메뉴별)", () => {
    expect(MENUS.homepage.collect.map((s) => s.key)).toEqual([
      "name",
      "industry",
      "want",
      "refs",
      "photos",
      "domain",
      "contact",
      "schedule",
    ]);
    expect(MENUS.landing.collect.map((s) => s.key)).toEqual([
      "name",
      "industry",
      "want",
      "adChannel",
      "refs",
      "photos",
      "contact",
      "schedule",
    ]);
    expect(MENUS.ai.collect.map((s) => s.key)).toEqual([
      "name",
      "industry",
      "want",
      "tools",
      "photos",
      "contact",
      "schedule",
    ]);
    expect(MENUS.shorts.collect.map((s) => s.key)).toEqual([
      "name",
      "industry",
      "method",
      "refs",
      "photos",
      "instagram",
      "count",
      "contact",
    ]);
    expect(MENUS.shorts.collect.find((s) => s.key === "method")?.choices).toEqual([
      "자료 보내기",
      "촬영 없이 맡기기",
    ]);
    expect(MENUS.shorts.collect.find((s) => s.key === "count")?.choices).toEqual([
      "1편",
      "5편",
      "10편",
    ]);
  });

  test("확정 금액은 이것뿐이다", () => {
    expect(allowedAmounts()).toEqual([
      99000, 140000, 150000, 200000, 750000, 990000, 1400000, 1500000,
    ]);
  });
});

// ── FAQ 키워드 ──────────────────────────────────────────────────
describe("FAQ 키워드 찾기", () => {
  const id = (t: string, m: MenuKey | null, extra: ExtraFaq[] = []) => {
    const h = matchFaq(t, m, extra);
    return h?.type === "faq"
      ? h.item.id
      : h?.type === "extra"
        ? `extra:${h.item.id}`
        : (h?.type ?? null);
  };
  test.each([
    ["가격이 얼마예요?", "homepage", "hp-price"],
    ["모바일에서도 잘 보이나요", "homepage", "hp-mobile"],
    ["도메인은 어떻게 해요", "homepage", "hp-domain"],
    ["예약 기능 넣을 수 있나요?", "homepage", "hp-booking"],
    ["홈페이지랑 뭐가 달라요?", "landing", "lp-diff"],
    ["당근 광고에 써도 돼요?", "landing", "lp-ads"],
    ["문의 많이 오는 거 보장돼요?", "landing", "lp-result"],
    ["챗GPT 넣을 수 있어요?", "ai", "ai-gpt"],
    ["앱도 만들어요?", "ai", "ai-app"],
    ["촬영해야 하나요?", "shorts", "sh-shoot"],
    ["첫 주문 할인 조건이 뭐예요", "shorts", "sh-trial"],
    ["업로드도 해 주시나요", "shorts", "sh-upload"],
  ] as const)("%s (%s) → %s", (t, m, want) => {
    expect(id(t, m)).toBe(want);
  });

  test("환불·수정 키워드 → 메뉴별 정답", () => {
    expect(id("환불되나요?", "homepage")).toBe("build-refund");
    expect(id("취소하고 싶어요", "landing")).toBe("build-refund");
    expect(id("수정은 몇 번 돼요?", "homepage")).toBe("build-fix");
    expect(id("수정 몇 번 돼요", "ai")).toBe("ai-fix");
    expect(id("환불되나요", "shorts")).toBe("sh-refund");
    expect(id("체험 환불받으면 어떻게 돼요", "shorts")).toBe("sh-trial-refund");
    expect(id("환불 신청은 어떻게 해요", "shorts")).toBe("sh-refund-how");
    expect(id("수정 몇 번 돼요", "shorts")).toBe("sh-fix");
    expect(id("2회 넘게 고치고 싶어요", "shorts")).toBe("sh-fix-more");
    expect(id("무료 수정 다 썼는데 더 고치고 싶어요", "homepage")).toBe("build-fix-more");
  });

  test("메뉴 전: 공통은 바로, 가격은 되묻기, 환불은 「어떤 서비스」, 메뉴 이름이 있으면 그 메뉴", () => {
    expect(id("사업자 번호 알려 주세요", null)).toBe("common-company");
    expect(id("상담원 연결해 주세요", null)).toBe("common-human");
    expect(id("가격이 얼마예요", null)).toBe("ambiguous");
    expect(matchFaq("환불돼요?", null)).toEqual({ type: "ambiguous", refund: true });
    expect(id("쇼츠 가격 얼마예요", null)).toBe("sh-price");
    expect(id("랜딩페이지 비용", null)).toBe("lp-price");
  });

  test("관리자가 더한 FAQ 는 기본 FAQ 다음에, 메뉴+공통에서 찾는다", () => {
    const extra: ExtraFaq[] = [
      { id: "e1", menu: null, keywords: ["주차"], answer: "건물 뒤에 주차할 수 있어요." },
      { id: "e2", menu: "landing", keywords: ["주차"], answer: "랜딩 주차 답" },
      { id: "e3", menu: "homepage", keywords: ["가격"], answer: "덮으면 안 됨" },
    ];
    expect(id("주차 되나요", "shorts", extra)).toBe("extra:e1");
    expect(id("주차 되나요", "landing", extra)).toBe("extra:e2");
    expect(id("가격 얼마예요", "homepage", extra)).toBe("hp-price"); // 기본 FAQ 가 먼저
    expect(id("완전히 새로운 질문", "homepage", extra)).toBe(null);
  });
});

// ── AI 답 거르기 ────────────────────────────────────────────────
describe("AI 답 거르기", () => {
  test("확정 금액·기간은 통과, 다듬기", () => {
    expect(
      checkAiAnswer("**홈페이지**는 99만 원(부가세 별도)이에요. 상담 후 확정 견적을 드려요."),
    ).toBe("홈페이지는 99만 원(부가세 별도)이에요. 상담 후 확정 견적을 드려요.");
    expect(checkAiAnswer("체험 뒤 7일 안에 5편을 사시면 9.9만 원을 빼 드려요.")).not.toBeNull();
    expect(checkAiAnswer("하나. 둘. 셋. 넷.")).toBe("하나. 둘. 셋.");
  });
  test.each([
    "홈페이지는 80만 원이에요.",
    "랜딩페이지는 200,000원부터 300,000원까지예요.",
    "보통 2주면 끝나요.",
    "3일 안에 만들어 드려요.",
    "수정은 3회까지 무료예요.",
    "매출이 3배 늘어납니다.",
    "문의가 늘어나는 것을 보장합니다.",
    "십오만 원이면 돼요.",
    "할인율은 25%예요.",
  ])("버림: %s", (t) => {
    expect(checkAiAnswer(t)).toBeNull();
  });
  test("숫자 읽기", () => {
    expect(numberTokens("1편 20만 원, 9.9만 원, 1,400,000원, 7일, 24시간, 2회")).toEqual([
      "편:1",
      "won:200000",
      "won:99000",
      "won:1400000",
      "일:7",
      "시간:24",
      "회:2",
    ]);
  });
  test("시스템 프롬프트에 FAQ 전체·규칙, 요청 모양, 응답 읽기", () => {
    const p = buildSystemPrompt("shorts");
    expect(p).toContain(MENUS.homepage.faq[0].answer);
    expect(p).toContain(MENUS.shorts.intro);
    expect(p).toContain("3문장 이내");
    const req = buildAiRequest("a".repeat(900), null);
    expect(req.contents[0].parts[0].text.length).toBe(500);
    expect(
      readAiText({ candidates: [{ content: { parts: [{ text: "안녕" }, { text: "하세요" }] } }] }),
    ).toBe("안녕하세요");
    expect(readAiText({})).toBeNull();
  });
  test("askGemini: 키 없으면 바로 null", async () => {
    expect(await askGemini("질문", null, { model: "m" })).toBeNull();
  });
  test("askGemini: 2.5초 넘으면 null(중계 워커가 늦게 답함)", async () => {
    const slow = {
      fetch: () => new Promise<Response>((r) => setTimeout(() => r(new Response("{}")), 200)),
    };
    const t0 = Date.now();
    expect(await askGemini("질문", null, { apiKey: "k", model: "m", proxy: slow }, 30)).toBeNull();
    expect(Date.now() - t0).toBeLessThan(180);
  });
  test("askGemini: 중계 워커 경유 성공", async () => {
    let sent: { model?: string } = {};
    const proxy = {
      fetch: async (_u: string, init?: RequestInit) => {
        sent = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: "답이에요." }] } }] }),
        );
      },
    };
    expect(await askGemini("질문", "ai", { apiKey: "k", model: "gemini-x", proxy })).toBe(
      "답이에요.",
    );
    expect(sent.model).toBe("gemini-x");
  });
});

// ── 작은 도구 ───────────────────────────────────────────────────
describe("연락처·주소·해시·토큰", () => {
  test.each([
    ["010-1234-5678", "010-1234-5678"],
    ["01012345678", "010-1234-5678"],
    ["+82 10 1234 5678", "010-1234-5678"],
    ["011-123-4567", "011-123-4567"],
    ["Owner@Example.com", "owner@example.com"],
  ])("맞음 %s", (a, b) => expect(parseContact(a)).toBe(b));
  test.each(["1234", "02-123-4567", "abc@", "연락처요", "010-1234-567"])("틀림 %s", (a) =>
    expect(parseContact(a)).toBeNull(),
  );
  test("주소 뽑기", () => {
    expect(extractUrls("참고 https://a.com/x, 그리고 http://b.kr/y.")).toEqual([
      "https://a.com/x",
      "http://b.kr/y",
    ]);
  });
  test("user_key 해시: sha256 앞 16자", async () => {
    const h = await hashUserKey("abc");
    expect(h).toBe("ba7816bf8f01cfea"); // sha256("abc") = ba7816bf8f01cfea414140de...
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
  test("상수시간 비교", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("스킬 요청 읽기", () => {
  test("사진 주소가 utterance 로 오면 사진", () => {
    const p = parseSkillRequest({
      userRequest: {
        utterance: "http://talk.kakaocdn.net/dn/abc/img.jpg",
        user: { id: "u" },
        block: { name: "폴백 블록" },
      },
    });
    expect(p?.input.images).toEqual(["http://talk.kakaocdn.net/dn/abc/img.jpg"]);
    expect(p?.input.utterance).toBe("");
  });
  test("params 의 secureUrls List(...)·media 도 사진", () => {
    const p = parseSkillRequest({
      userRequest: {
        utterance: "사진",
        user: { id: "u" },
        params: { media: { type: "image", url: "https://k.kakaocdn.net/m.png" } },
      },
      action: {
        params: {
          secureimage:
            '{"privacyAgreement":"Y","imageQuantity":"2","secureUrls":"List(https://x.kakaocdn.net/1.jpg, https://x.kakaocdn.net/2.jpg)"}',
        },
      },
    });
    expect(p?.input.images).toEqual([
      "https://k.kakaocdn.net/m.png",
      "https://x.kakaocdn.net/1.jpg",
      "https://x.kakaocdn.net/2.jpg",
    ]);
    expect(p?.input.utterance).toBe("사진");
  });
  test("보통 주소(사이트)는 사진이 아님, 웰컴 블록 알아보기, 형식 틀림", () => {
    const p = parseSkillRequest({
      userRequest: { utterance: "https://myshop.com", user: { id: "u" } },
    });
    expect(p?.input.images).toEqual([]);
    expect(
      parseSkillRequest({
        intent: { name: "웰컴 블록" },
        userRequest: { utterance: "", user: { id: "u" } },
      })?.input.welcome,
    ).toBe(true);
    expect(parseSkillRequest({ userRequest: { utterance: "x" } })).toBeNull();
  });
});

// ── 흐름 전체 ───────────────────────────────────────────────────
describe("웰컴·메뉴", () => {
  test("웰컴: 인사 + 메뉴 4개(순서·문구 그대로) + 대표와 바로 대화 버튼", async () => {
    const h = harness();
    const r = await h.welcome();
    assertKakaoShape(r);
    expect(texts(r)).toBe(WELCOME_TEXT);
    expect(quick(r)).toEqual([
      "1.홈페이지 제작",
      "2.랜딩페이지 제작",
      "3.AI 개발 문의",
      "4.쇼츠 제작 문의",
    ]);
    expect(buttons(r)).toEqual([
      { label: "대표와 바로 대화", action: "webLink", webLinkUrl: KAKAO_OPENCHAT_URL },
    ]);
  });

  test.each(MENU_KEYS.map((k) => [k]))(
    "메뉴 %s: 첫 안내 + 상담 신청하기·자주 묻는 질문·처음으로 + 대표 버튼",
    async (k) => {
      const h = harness();
      await h.welcome();
      const r = await h.say(MENUS[k].quickLabel);
      assertKakaoShape(r);
      expect(texts(r)).toBe(MENUS[k].intro);
      expect(quick(r)).toEqual(["상담 신청하기", "자주 묻는 질문", "처음으로"]);
      expect(buttons(r).some((b) => b.webLinkUrl === KAKAO_OPENCHAT_URL)).toBe(true);
      if (k === "shorts")
        expect(buttons(r).some((b) => b.webLinkUrl === "https://ai-solution.co.kr/reels")).toBe(
          true,
        );
    },
  );

  test("자주 묻는 질문: 목록(최대 10, 넘으면 「질문 더 보기」) → 누르면 답 + 끝 단추", async () => {
    const h = harness();
    await h.say("1.홈페이지 제작");
    const list = await h.say("자주 묻는 질문");
    assertKakaoShape(list);
    const q = quick(list);
    expect(q.length).toBe(10);
    expect(q[0]).toBe("가격·비용");
    expect(q[9]).toBe("질문 더 보기");
    const more = await h.say("질문 더 보기");
    assertKakaoShape(more);
    expect(quick(more)).toContain("작업 사례");
    expect(quick(more).at(-1)).toBe("처음으로");
    const ans = await h.say("모바일 화면");
    assertKakaoShape(ans);
    expect(texts(ans)).toBe("네, 휴대폰에서 먼저 보기 좋게 만듭니다(반응형).");
    expect(quick(ans)).toEqual(["상담 신청하기", "다른 질문", "처음으로"]);
    expect(buttons(ans).map((b) => b.label)).toContain("대표와 바로 대화");
    expect(h.aiCalls).toEqual([]);
    expect(h.store.questions).toEqual([]); // FAQ 로 답한 건 쌓지 않는다
  });

  test("「상담원」 같은 말 → 대표와 바로 대화 안내", async () => {
    const h = harness();
    const r = await h.say("상담원 연결해 주세요");
    expect(texts(r)).toBe("「대표와 바로 대화」를 누르시면 대표에게 바로 연결됩니다.");
    expect(buttons(r)[0].webLinkUrl).toBe(KAKAO_OPENCHAT_URL);
  });
});

async function collectHomepage(h: Harness) {
  await h.welcome();
  await h.say("1.홈페이지 제작");
  const start = await h.say("상담 신청하기");
  expect(texts(start)).toContain("상담 신청을 도와드릴게요. 몇 가지만 여쭤볼게요.");
  expect(texts(start)).toContain("상호(가게 이름)나 성함");
  expect(quick(start)).toEqual(["건너뛰기", "처음으로"]);
  await h.say("김가게");
  await h.say("식당");
  await h.say("예약 기능이 있는 메뉴 5개짜리");
  let r = await h.say("https://ref1.com 그리고 https://ref2.com");
  expect(texts(r)).toContain("주소 2개 받았어요");
  expect(quick(r)).toEqual(["다음", "처음으로"]);
  r = await h.say("다음");
  expect(texts(r)).toContain("로고, 사진");
  expect(quick(r)).toEqual(["다 보냈어요", "건너뛰기", "처음으로"]);
  r = await h.say("http://talk.kakaocdn.net/dn/a/1.jpg");
  expect(texts(r)).toContain("사진·자료 1개 받았어요");
  r = await h.say("", {
    params: { media: { type: "image", url: "http://talk.kakaocdn.net/dn/a/2.jpg" } },
  });
  expect(texts(r)).toContain("사진·자료 2개 받았어요");
  r = await h.say("다 보냈어요");
  expect(texts(r)).toContain("도메인");
  r = await h.say("건너뛰기");
  expect(texts(r)).toContain("휴대폰 번호나 이메일");
  expect(quick(r)).toEqual(["처음으로"]);
  r = await h.say("연락처는 나중에");
  expect(texts(r)).toContain("형식이 맞지 않아요");
  r = await h.say("010 1234 5678");
  expect(texts(r)).toContain("일정이나 예산");
  r = await h.say("12월 안에, 100만 원 안쪽");
  return r;
}

describe("상담 신청 자료 받기 → 접수", () => {
  test("홈페이지: 순서대로 받고 요약 → 접수 → inquiries 저장 입력", async () => {
    const h = harness();
    const summary = await collectHomepage(h);
    assertKakaoShape(summary);
    const t = texts(summary);
    expect(t).toContain("상호·이름: 김가게");
    expect(t).toContain("연락처: 010-1234-5678");
    expect(t).toContain("참고 사이트: 2개");
    expect(t).toContain("자료: 2개");
    expect(t).toContain("이대로 접수할까요?");
    expect(quick(summary)).toEqual(["접수", "수정하기(처음부터)", "처음으로"]);

    const done = await h.say("접수");
    assertKakaoShape(done);
    expect(texts(done)).toBe(DONE_TEXT);
    expect(buttons(done)[0].webLinkUrl).toBe(KAKAO_OPENCHAT_URL);
    expect(h.submitted.length).toBe(1);
    const inq = h.submitted[0];
    expect(inq.name).toBe("김가게");
    expect(inq.contact).toBe("010-1234-5678");
    expect(inq.services).toEqual(["홈페이지 제작"]);
    expect(inq.referenceLinks).toBe("https://ref1.com\nhttps://ref2.com");
    expect(inq.topic).toBe("카카오 채널 챗봇 · 홈페이지 제작");
    expect(inq.budget).toBe("12월 안에, 100만 원 안쪽");
    expect(inq.consent).toBe(true);
    expect(inq.notes).toStartWith("[출처] 카카오 채널 챗봇\n[문의] 홈페이지 제작");
    expect(inq.notes).toContain("업종: 식당");
    expect(inq.notes).toContain("도메인: 없음");
    expect(inq.notes).toContain(
      "사진·자료 주소:\n- http://talk.kakaocdn.net/dn/a/1.jpg\n- http://talk.kakaocdn.net/dn/a/2.jpg",
    );
    // 접수 뒤 상태: 수집 항목은 지우고 연락처만(질문 답 연락용)
    const s = h.store.sessions.get(USER)!;
    expect(s.step).toBe("idle");
    expect(s.data).toEqual({ contact: "010-1234-5678" });
    expect(s.photos).toEqual([]);
  });

  test("수정하기(처음부터) → 첫 질문부터 다시", async () => {
    const h = harness();
    await collectHomepage(h);
    const r = await h.say("수정하기(처음부터)");
    expect(texts(r)).toContain("상호(가게 이름)나 성함");
    expect(h.store.sessions.get(USER)!.photos).toEqual([]);
    expect(h.submitted.length).toBe(0);
  });

  test("접수 저장 실패 → 다시 누르라고, 상태는 요약에 그대로", async () => {
    const h = harness({ submit: async () => false });
    await collectHomepage(h);
    const r = await h.say("접수");
    expect(texts(r)).toContain("접수 중에 문제가 생겼어요");
    expect(h.store.sessions.get(USER)!.step).toBe("confirm");
  });

  test("랜딩: 순서(알릴 내용 → 광고할 곳 → 참고 페이지 → 자료 → 연락처 → 일정)·건너뛰기", async () => {
    const h = harness();
    await h.say("2.랜딩페이지 제작");
    await h.say("상담 신청하기");
    for (const t of ["건너뛰기", "건너뛰기"]) await h.say(t); // 이름·업종 건너뛰기
    let r = await h.say("여름 이벤트 알리기");
    expect(texts(r)).toContain("어디에 광고");
    r = await h.say("당근");
    expect(texts(r)).toContain("참고하고 싶은 페이지 주소");
    r = await h.say("없음");
    expect(texts(r)).toContain("상세 설명");
    r = await h.say("건너뛰기");
    r = await h.say("me@shop.kr");
    r = await h.say("건너뛰기");
    expect(texts(r)).toContain("이대로 접수할까요?");
    await h.say("접수");
    const inq = h.submitted[0];
    expect(inq.name).toBe("카카오 채널 손님");
    expect(inq.contact).toBe("me@shop.kr");
    expect(inq.services).toEqual(["랜딩페이지 제작"]);
    expect(inq.notes).toContain("광고할 곳: 당근");
  });

  test("AI 개발: 순서(바꾸고 싶은 일 → 쓰는 프로그램 → 참고 자료 → 연락처 → 일정)", async () => {
    const h = harness();
    await h.say("3.AI 개발 문의");
    let r = await h.say("상담 신청하기");
    await h.say("가나상사");
    await h.say("도매");
    r = await h.say("매일 주문을 엑셀로 옮겨요");
    expect(texts(r)).toContain("지금 쓰시는 프로그램");
    r = await h.say("스마트스토어");
    expect(texts(r)).toContain("화면 캡처");
    r = await h.say("다 보냈어요");
    r = await h.say("01099998888");
    r = await h.say("건너뛰기");
    await h.say("접수");
    expect(h.submitted[0].services).toEqual(["AI 업무 자동화"]);
    expect(h.submitted[0].notes).toContain("쓰는 프로그램: 스마트스토어");
  });

  test("쇼츠: 제작 방식·편수 단추, 마지막에 주문 링크", async () => {
    const h = harness();
    await h.say("4.쇼츠 제작 문의");
    await h.say("상담 신청하기");
    await h.say("빵집");
    let r = await h.say("베이커리");
    expect(quick(r)).toEqual(["자료 보내기", "촬영 없이 맡기기", "건너뛰기", "처음으로"]);
    r = await h.say("아무 말");
    expect(texts(r)).toContain("아래 단추에서 골라 주세요");
    r = await h.say("촬영 없이 맡기기");
    expect(texts(r)).toContain("쇼츠·릴스 주소");
    r = await h.say("https://www.instagram.com/reel/abc");
    r = await h.say("다음");
    expect(texts(r)).toContain("홈페이지나 스마트스토어 주소"); // 촬영 없이 맡기기 쪽 질문
    r = await h.say("https://smartstore.naver.com/bread");
    expect(texts(r)).toContain("사진·자료 1개 받았어요");
    r = await h.say("다 보냈어요");
    expect(texts(r)).toContain("인스타그램 아이디");
    r = await h.say("@bread_shop");
    expect(quick(r)).toEqual(["1편", "5편", "10편", "건너뛰기", "처음으로"]);
    r = await h.say("5편");
    expect(texts(r)).toContain("휴대폰 번호나 이메일");
    r = await h.say("010-2222-3333");
    expect(texts(r)).toContain("편수: 5편");
    expect(texts(r)).toContain("제작 방식: 촬영 없이 맡기기");
    const done = await h.say("접수");
    assertKakaoShape(done);
    expect(texts(done)).toContain(DONE_TEXT);
    expect(texts(done)).toContain("바로 주문하시겠어요?");
    expect(buttons(done).map((b) => b.webLinkUrl)).toContain("https://ai-solution.co.kr/reels");
    expect(h.submitted[0].services).toEqual(["쇼츠 제작"]);
    expect(h.submitted[0].notes).toContain("인스타그램: @bread_shop");
  });

  test("처음으로 → 웰컴, 수집 중에 사진은 받아 두고 이어서", async () => {
    const h = harness();
    await h.say("1.홈페이지 제작");
    await h.say("상담 신청하기");
    const r = await h.say("http://talk.kakaocdn.net/dn/z/9.jpg");
    expect(texts(r)).toContain("사진 받았어요");
    expect(texts(r)).toContain("상호(가게 이름)");
    expect(h.store.sessions.get(USER)!.photos).toEqual(["http://talk.kakaocdn.net/dn/z/9.jpg"]);
    const w = await h.say("처음으로");
    expect(texts(w)).toBe(WELCOME_TEXT);
    expect(h.store.sessions.get(USER)!.step).toBe("idle");
    expect(h.store.sessions.get(USER)!.photos).toEqual([]);
  });

  test("수집 중 「?」 질문 → FAQ 답 + 지금 질문 다시", async () => {
    const h = harness();
    await h.say("1.홈페이지 제작");
    await h.say("상담 신청하기");
    const r = await h.say("기간은 얼마나 걸려요?");
    assertKakaoShape(r);
    expect(texts(r)).toContain("페이지 수와 자료 준비 상황에 따라 달라서");
    expect(texts(r)).toContain("이어서 여쭤볼게요. 상호(가게 이름)나 성함");
    expect(h.store.sessions.get(USER)!.step).toBe("c:name");
  });

  test("30분 지나면 새로 시작", async () => {
    const h = harness();
    await h.say("1.홈페이지 제작");
    await h.say("상담 신청하기");
    await h.say("김가게");
    h.now.t += 31 * 60 * 1000;
    const r = await h.say("식당");
    // 이전 단계(업종)가 아니라 새 대화로 본다 → 자유 질문(AI 없음 → 담당자 안내)
    expect(texts(r)).not.toContain("원하시는 것을");
    expect(h.store.sessions.get(USER)!.data.a).toBeUndefined();
  });
});

// ── 자유 질문·챗봇 질문 쌓기 ────────────────────────────────────
describe("자유 질문", () => {
  test("FAQ 에 없음 + AI 답 → 답하고, 질문은 answered_by_ai 로 저장(알림 없음)", async () => {
    const h = harness({ aiAnswer: "네, 상담 때 자세히 안내드릴게요." });
    await h.say("1.홈페이지 제작");
    const r = await h.say("외국어 페이지도 되나요");
    assertKakaoShape(r);
    expect(texts(r)).toBe("네, 상담 때 자세히 안내드릴게요.");
    expect(quick(r)).toEqual(["상담 신청하기", "다른 질문", "처음으로"]);
    expect(h.store.questions.length).toBe(1);
    const q = h.store.questions[0];
    expect(q.answered_by_ai).toBe(true);
    expect(q.bot_answer).toBe("네, 상담 때 자세히 안내드릴게요.");
    expect(q.menu).toBe("homepage");
    expect(q.question).toBe("외국어 페이지도 되나요");
    expect(q.user_key).toBe(await hashUserKey(USER));
    expect(q.user_key).not.toContain(USER);
    expect(h.alertTexts).toEqual([]);
  });

  test("AI 답에 표에 없는 금액 → 버리고 담당자 안내 + 연락처 받기 → 질문 행에 저장 + 알림", async () => {
    const h = harness({ aiAnswer: "외국어 페이지는 50만 원 추가예요." });
    await h.say("1.홈페이지 제작");
    const r = await h.say("외국어 페이지도 되나요");
    assertKakaoShape(r);
    expect(texts(r)).toBe(CONTACT_OFFER);
    expect(quick(r)).toEqual(["연락처 남기기", "괜찮아요", "처음으로"]);
    expect(h.store.questions[0].answered_by_ai).toBe(false);
    expect(h.store.questions[0].bot_answer).toBe(BOT_ANSWER_STAFF);
    expect(h.alertTexts).toEqual([
      "챗봇 새 질문: 외국어 페이지도 되나요 / 확인: https://ai-solution.co.kr/admin/kakao-questions",
    ]);
    let r2 = await h.say("연락처 남기기");
    expect(texts(r2)).toContain("휴대폰 번호나 이메일");
    r2 = await h.say("010-777");
    expect(texts(r2)).toContain("형식이 맞지 않아요");
    r2 = await h.say("010-7777-8888");
    expect(texts(r2)).toContain("연락처 받았어요");
    expect(h.store.questions[0].contact).toBe("010-7777-8888");
    // 다음 못 답한 질문은 연락처를 다시 묻지 않고, 그 연락처로 저장. 10분 안이라 알림은 묶인다.
    h.now.t += 60 * 1000;
    const r3 = await h.say("주말에도 상담돼요");
    expect(texts(r3)).toContain("남겨 주신 연락처로 연락드릴게요");
    expect(quick(r3)).not.toContain("연락처 남기기");
    expect(h.store.questions[1].contact).toBe("010-7777-8888");
    expect(h.alertTexts.length).toBe(1);
    // 10분 지나면 다시 알림
    h.now.t += 10 * 60 * 1000;
    await h.say("세금계산서 되나요");
    expect(h.alertTexts.length).toBe(2);
    expect(h.alertTexts[1]).toContain("연락처: 010-7777-8888");
  });

  test("AI 실패(시간 초과 등) → 담당자 안내, 「괜찮아요」면 연락처 안 받음", async () => {
    const h = harness({ ai: async () => null });
    const r = await h.say("주차 되나요");
    expect(texts(r)).toBe(CONTACT_OFFER);
    const r2 = await h.say("괜찮아요");
    expect(texts(r2)).toContain("알겠어요");
    expect(h.store.questions[0].contact).toBeNull();
    expect(h.store.sessions.get(USER)!.step).toBe("idle");
  });

  test("상담 접수로 받은 연락처가 있으면 질문 뒤에 다시 묻지 않는다", async () => {
    const h = harness();
    await collectHomepage(h);
    await h.say("접수");
    const r = await h.say("주차 되나요");
    expect(texts(r)).toContain("남겨 주신 연락처로 연락드릴게요");
    expect(h.store.questions[0].contact).toBe("010-1234-5678");
  });

  test("수집 중 못 답한 질문은 쌓아 두고, 연락처 단계에서 받은 번호를 채운다", async () => {
    const h = harness();
    await h.say("1.홈페이지 제작");
    await h.say("상담 신청하기");
    const r = await h.say("외국어도 돼요?");
    expect(texts(r)).toContain("담당자가 확인해서 답변드릴게요");
    expect(texts(r)).toContain("이어서 여쭤볼게요");
    expect(quick(r)).not.toContain("연락처 남기기");
    for (const t of ["김가게", "식당", "건너뛰기", "건너뛰기", "건너뛰기", "건너뛰기"])
      await h.say(t);
    await h.say("010-5555-6666");
    expect(h.store.questions[0].contact).toBe("010-5555-6666");
  });

  test("2회 넘게 고치고 싶어요 → 정해진 답 + 저장(new) + 알림 + 연락처 받기", async () => {
    const h = harness();
    await h.say("4.쇼츠 제작 문의");
    const r = await h.say("2회 넘게 고치고 싶어요");
    assertKakaoShape(r);
    expect(texts(r)).toContain("무료 2회를 넘는 수정은 내용을 보고 담당자가 안내드릴게요.");
    expect(texts(r)).toContain("답변 받으실 연락처(휴대폰 또는 이메일)를 남겨 주시면");
    expect(quick(r)).toEqual(["연락처 남기기", "괜찮아요", "처음으로"]);
    expect(h.store.questions.length).toBe(1);
    expect(h.store.questions[0].menu).toBe("shorts");
    expect(h.store.questions[0].bot_answer).toContain("무료 2회를 넘는 수정");
    expect(h.alertTexts.length).toBe(1);
    expect(h.aiCalls).toEqual([]);
  });

  test("환불·수정: 메뉴별 정답, 메뉴 전이면 「어떤 서비스 환불·수정」 되묻기", async () => {
    const h = harness();
    const ask = await h.say("환불 되나요?");
    assertKakaoShape(ask);
    expect(texts(ask)).toBe(REFUND_WHICH);
    expect(quick(ask)).toEqual([
      "홈페이지 환불·수정",
      "랜딩 환불·수정",
      "AI 개발 환불·수정",
      "쇼츠 환불·수정",
      "처음으로",
    ]);
    const sh = await h.say("쇼츠 환불·수정");
    expect(texts(sh)).toContain("이미 만든 편은 정가 20만 원으로 계산합니다");
    expect(texts(sh)).toContain("편당 2회까지 무료로 고쳐 드려요");
    const hp = await h.say("홈페이지 환불·수정");
    expect(texts(hp)).toContain("작업 시작 전에는 전액 환불해 드려요");
    expect(texts(hp)).toContain("작은 수정은 2회까지 무료예요");
    const ai = await h.say("AI 개발 환불·수정");
    expect(texts(ai)).toContain("범위를 넘는 기능 추가는 따로 견적을 드립니다");
    expect(h.store.questions).toEqual([]);
  });

  test("가격을 메뉴 전에 물으면 어떤 서비스인지 되묻는다", async () => {
    const h = harness();
    const r = await h.say("가격이 얼마예요?");
    expect(texts(r)).toContain("어떤 서비스가 궁금하세요?");
    expect(quick(r).slice(0, 4)).toEqual([
      "1.홈페이지 제작",
      "2.랜딩페이지 제작",
      "3.AI 개발 문의",
      "4.쇼츠 제작 문의",
    ]);
    expect(h.aiCalls).toEqual([]);
  });

  test("관리자가 FAQ 에 더한 답은 다음 대화에서 바로(AI 안 부름, 질문도 안 쌓음)", async () => {
    const h = harness({ aiAnswer: "모르겠어요." });
    h.store.extra = [
      { id: "e1", menu: null, keywords: ["주차"], answer: "건물 뒤 공영주차장을 쓰시면 돼요." },
    ];
    const r = await h.say("주차 되나요");
    expect(texts(r)).toBe("건물 뒤 공영주차장을 쓰시면 돼요.");
    expect(h.aiCalls).toEqual([]);
    expect(h.store.questions).toEqual([]);
  });

  test("알림 글: 질문 앞 60자", () => {
    const t = questionAlertText({
      id: "x",
      menu: null,
      question: "가".repeat(80),
      botAnswer: "",
      answeredByAi: false,
      contact: null,
      alert: true,
    });
    expect(t).toBe(
      `챗봇 새 질문: ${"가".repeat(60)}… / 확인: https://ai-solution.co.kr/admin/kakao-questions`,
    );
  });
});

// ── 인증·시간 제한 ──────────────────────────────────────────────
describe("인증·시간 제한", () => {
  const body = JSON.stringify({ userRequest: { utterance: "안녕", user: { id: USER } } });

  test("토큰 틀림·없음·서버 설정 없음 → 200 용 「잠시 후 다시 시도해 주세요」", async () => {
    const h = harness();
    for (const [tok, exp] of [
      ["wrong", TOKEN],
      [null, TOKEN],
      [TOKEN, undefined],
    ] as const) {
      const r = await handleSkill(body, tok, { ...h.deps, expectedToken: exp });
      assertKakaoShape(r);
      expect(texts(r)).toBe(RETRY_TEXT);
    }
    expect(h.store.sessions.size).toBe(0);
  });

  test("본문이 JSON 이 아니면 다시 시도 안내", async () => {
    const h = harness();
    expect(texts(await handleSkill("not json", TOKEN, h.deps))).toBe(RETRY_TEXT);
  });

  test("DB 가 늦으면 4초 제한 안에 다시 시도 안내(여기서는 제한 100ms 로 시험)", async () => {
    const h = harness();
    h.store.delayMs = 1000;
    const t0 = Date.now();
    const r = await handleSkill(body, TOKEN, { ...h.deps, deadlineMs: 100 });
    expect(texts(r)).toBe(RETRY_TEXT);
    expect(Date.now() - t0).toBeLessThan(400);
  });

  test("AI 에 주는 시간은 2.5초를 넘지 않는다", async () => {
    let given = -1;
    const h = harness({
      ai: async (_q, _m, ms) => {
        given = ms;
        return null;
      },
    });
    await h.say("주차 되나요");
    expect(given).toBeGreaterThan(0);
    expect(given).toBeLessThanOrEqual(2500);
  });

  test("waitUntil 이 있으면 뒤처리(질문 저장·알림)를 거기로 넘긴다", async () => {
    const pending: Promise<unknown>[] = [];
    const h = harness({ waitUntil: (p) => pending.push(p) });
    await h.say("주차 되나요");
    expect(pending.length).toBe(1);
    await Promise.all(pending);
    expect(h.store.questions.length).toBe(1);
  });
});

// ── 관리자 입력 ─────────────────────────────────────────────────
describe("관리자 입력 검사", () => {
  test("키워드 정리", () => {
    expect(cleanKeywords("주차, 주차장 ,주차, 차")).toEqual(["주차", "주차장"]);
  });
  test("add_faq: 키워드가 없으면 거절, 메뉴 null 은 공통", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(
      QuestionAction.safeParse({ action: "add_faq", menu: null, keywords: "차", answer: "답" })
        .success,
    ).toBe(false);
    const ok = QuestionAction.safeParse({
      action: "add_faq",
      questionId: id,
      menu: null,
      keywords: "주차, 주차장",
      answer: "답",
    });
    expect(ok.success).toBe(true);
    if (ok.success && ok.data.action === "add_faq")
      expect(ok.data.keywords).toEqual(["주차", "주차장"]);
    expect(
      QuestionAction.safeParse({ action: "add_faq", menu: "blog", keywords: "주차", answer: "답" })
        .success,
    ).toBe(false);
    expect(QuestionAction.safeParse({ action: "done", id }).success).toBe(true);
    expect(
      QuestionAction.safeParse({ action: "memo", id: "not-uuid", adminAnswer: "x" }).success,
    ).toBe(false);
  });
  test("buildInquiry 는 기존 상담 폼 형식(InquirySchema)을 통과한다", () => {
    const inq = buildInquiry("ai", { a: { contact: "a@b.co", want: "x" } }, []);
    expect(inq.name).toBe("카카오 채널 손님");
    expect(inq.honeypot).toBe("");
    expect(inq.attachmentFailed).toBe(false);
  });
});
