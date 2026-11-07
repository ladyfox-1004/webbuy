// 카카오 채널 챗봇 대화 흐름(상태 기계). 오픈빌더에는 웰컴·폴백 블록 2개만 두고, 흐름은 전부 여기서 정한다.
// 네트워크·DB 는 deps 로 받는다(시험: tests/kakao-chat.test.ts).
//
// 단계(step)
//   idle        메뉴 고르기·자주 묻는 질문·자유 질문
//   c:<키>      상담 신청 자료 받기(메뉴별 순서는 ./faq.ts collect)
//   confirm     받은 내용 요약 → 「접수」/「수정하기(처음부터)」
//   q_offer     챗봇이 못 답한 질문 뒤 「연락처 남기기」/「괜찮아요」
//   q_contact   그 질문의 답을 받을 연락처 기다리는 중
// 🚨 대화 원문은 저장하지 않는다. 세션 data 에는 받은 항목만, 질문은 kakao_questions 에만(FAQ 에 안 걸린 것).
// 🚨 이모지·굵은 글씨·결과 보장·표에 없는 금액 금지. 답 문구는 ./faq.ts(대표님 문서 그대로).
import { InquirySchema, type InquiryInput } from "../inquiry-submit";
import {
  COMMON_FAQ,
  MENUS,
  MENU_KEYS,
  PRIVACY_URL,
  REELS_ORDER_URL,
  REFUND_MENU_LABELS,
  REFUND_WHICH,
  type CollectStep,
  type FaqItem,
  type MenuKey,
} from "./faq";
import {
  checkAiAnswer,
  extractUrls,
  faqByLabel,
  matchFaq,
  norm,
  parseContact,
  type ExtraFaq,
} from "./match";
import { OWNER_BUTTON, link, type CardButton, type Reply } from "./response";

export const SESSION_TTL_MS = 30 * 60 * 1000;
export const MAX_REFS = 10;
export const MAX_PHOTOS = 20;
export const FAQ_PAGE_SIZE = 9;

export type SessionData = {
  /** 받은 자료(키 → 값) */
  a?: Record<string, string>;
  /** 참고 주소 */
  refs?: string[];
  /** 이 대화에서 이미 받은 연락처(질문 답 연락용, 다시 묻지 않는다) */
  contact?: string;
  /** 연락처가 오면 채워 넣을 kakao_questions id */
  qids?: string[];
  faqPage?: number;
  /** 메뉴 고르기 전에 「상담 신청하기」를 눌렀음 → 메뉴를 고르면 바로 자료 받기 */
  applyNext?: boolean;
};

export type Session = {
  menu: MenuKey | null;
  step: string;
  data: SessionData;
  photos: string[];
  updatedAt: string;
};

export type TurnInput = { utterance: string; images: string[]; welcome: boolean };

export type QuestionRecord = {
  id: string;
  menu: MenuKey | null;
  question: string;
  botAnswer: string;
  answeredByAi: boolean;
  contact: string | null;
  /** 대표님 카톡 알림 대상(못 답한 질문·담당자 안내 질문). 10분 묶기는 저장소가 한다. */
  alert: boolean;
};

export type Effect =
  | { kind: "question"; q: QuestionRecord }
  | { kind: "question_contact"; ids: string[]; contact: string };

export type SaveState = {
  menu: MenuKey | null;
  step: string;
  data: SessionData;
  resetPhotos: boolean;
};

export type TurnDeps = {
  now: Date;
  extraFaq: readonly ExtraFaq[];
  /** AI 답(이미 시간 제한이 걸린 호출). 실패·시간 초과면 null. 검사(checkAiAnswer)는 흐름이 한다. */
  ai: (question: string, menu: MenuKey | null) => Promise<string | null>;
  /** 사진·자료 주소 붙이기 → 붙인 뒤 개수 */
  addPhotos: (urls: string[]) => Promise<number>;
  /** inquiries 저장(+알림). 저장 실패면 false */
  submit: (input: InquiryInput) => Promise<boolean>;
  newId: () => string;
};

export type TurnResult = { reply: Reply; save: SaveState; effects: Effect[] };

// ── 고정 문구 ────────────────────────────────────────────────────
export const WELCOME_TEXT = "안녕하세요, 에이아이솔루션입니다. 무엇을 도와드릴까요?";
export const APPLY_START = "상담 신청을 도와드릴게요. 몇 가지만 여쭤볼게요.";
export const DONE_TEXT = "접수됐어요. 담당자가 확인 후 연락드릴게요(보통 24시간 안).";
export const SUBMIT_FAIL_TEXT = "접수 중에 문제가 생겼어요. 잠시 뒤 「접수」를 다시 눌러 주세요.";
export const CONTACT_OFFER =
  "좋은 질문이에요. 담당자가 확인해서 답변드릴게요. 답변 받으실 연락처(휴대폰 또는 이메일)를 남겨 주시면 확인해서 연락드릴게요.";
export const ESCALATE_OFFER =
  "답변 받으실 연락처(휴대폰 또는 이메일)를 남겨 주시면 확인해서 연락드릴게요.";
export const UNKNOWN_KNOWN_CONTACT =
  "좋은 질문이에요. 담당자가 확인해서 답변드릴게요. 남겨 주신 연락처로 연락드릴게요.";
export const UNKNOWN_IN_COLLECT = "좋은 질문이에요. 담당자가 확인해서 답변드릴게요.";
export const CONTACT_BAD =
  "휴대폰 번호나 이메일 형식이 맞지 않아요. 예) 010-1234-5678 또는 name@example.com 처럼 다시 보내 주세요.";
export const WHICH_SERVICE = "어떤 서비스가 궁금하세요? 아래에서 골라 주시면 바로 알려 드릴게요.";
export const BOT_ANSWER_STAFF = "담당자 안내";
export const DEFAULT_NAME = "카카오 채널 손님";
export const SOURCE_LABEL = "카카오 채널 챗봇";

export const Q = {
  apply: "상담 신청하기",
  faq: "자주 묻는 질문",
  other: "다른 질문",
  home: "처음으로",
  more: "질문 더 보기",
  skip: "건너뛰기",
  next: "다음",
  sentAll: "다 보냈어요",
  submit: "접수",
  restart: "수정하기(처음부터)",
  leaveContact: "연락처 남기기",
  noThanks: "괜찮아요",
} as const;

const MENU_QUICK = MENU_KEYS.map((k) => MENUS[k].quickLabel);
const END_QUICK = [Q.apply, Q.other, Q.home];
const AFTER_MENU_QUICK = [Q.apply, Q.faq, Q.home];
const HOME_WORDS = new Set(["처음으로", "처음", "메뉴", "시작", "홈", "처음부터다시"].map(norm));
const SKIP_WORDS = new Set(
  ["건너뛰기", "건너뛸게요", "스킵", "패스", "없음", "없어요", "없습니다"].map(norm),
);
const NEXT_WORDS = new Set(
  ["다음", "다보냈어요", "다보냈습니다", "끝", "완료", "다했어요"].map(norm),
);

// ── 작은 도구 ────────────────────────────────────────────────────
function clip(s: string, max: number): string {
  const c = Array.from(s.trim());
  return c.length > max ? c.slice(0, max).join("") : c.join("");
}

function answerCard(text: string, extra: CardButton[] = []): Reply["parts"][number] {
  return { card: text, buttons: [...extra, OWNER_BUTTON] };
}

function answer(text: string, extra: CardButton[] = []): Reply {
  return { parts: [answerCard(text, extra)], quick: [...END_QUICK] };
}

function isQuestion(s: string): boolean {
  return /[?？]\s*$/.test(s.trim());
}

function isGreeting(s: string): boolean {
  const t = norm(s);
  return !t || (t.length <= 12 && /^(안녕|하이|hi|hello|헬로|반가|ㅎㅇ|저기요|계세요)/.test(t));
}

export function menuFromText(s: string): MenuKey | null {
  const t = norm(s);
  if (!t) return null;
  for (const [i, k] of MENU_KEYS.entries()) {
    const m = MENUS[k];
    if (t === norm(m.quickLabel) || t === norm(m.title) || t === String(i + 1)) return k;
  }
  return null;
}

function stepsOf(menu: MenuKey): CollectStep[] {
  return MENUS[menu].collect;
}

function stepByKey(menu: MenuKey, key: string): CollectStep | undefined {
  return stepsOf(menu).find((s) => s.key === key);
}

function promptText(step: CollectStep, a: Record<string, string>): string {
  return typeof step.prompt === "function" ? step.prompt(a) : step.prompt;
}

function stepQuick(step: CollectStep, received = false): string[] {
  switch (step.kind) {
    case "contact":
      return [Q.home];
    case "refs":
      return received ? [Q.next, Q.home] : [Q.skip, Q.home];
    case "photos":
      return received ? [Q.sentAll, Q.home] : [Q.sentAll, Q.skip, Q.home];
    case "choice":
      return [...(step.choices ?? []), Q.skip, Q.home];
    default:
      return [Q.skip, Q.home];
  }
}

function promptReply(menu: MenuKey, step: CollectStep, s: State, lead?: string): Reply {
  const text = promptText(step, s.data.a ?? {});
  return { parts: [{ text: lead ? `${lead}\n\n${text}` : text }], quick: stepQuick(step) };
}

/** 한 턴 동안 바꿔 가며 쓰는 상태 */
type State = {
  menu: MenuKey | null;
  step: string;
  data: SessionData;
  photos: string[];
  resetPhotos: boolean;
};

function fresh(): State {
  return { menu: null, step: "idle", data: {}, photos: [], resetPhotos: false };
}

function done(s: State, reply: Reply, effects: Effect[] = []): TurnResult {
  return {
    reply,
    save: { menu: s.menu, step: s.step, data: s.data, resetPhotos: s.resetPhotos },
    effects,
  };
}

// ── 화면(답) 만들기 ─────────────────────────────────────────────
function welcome(s: State): Reply {
  s.menu = null;
  s.step = "idle";
  s.data = s.data.contact ? { contact: s.data.contact } : {};
  s.resetPhotos = true;
  s.photos = [];
  return { parts: [answerCard(WELCOME_TEXT)], quick: [...MENU_QUICK] };
}

function menuButtons(menu: MenuKey): CardButton[] {
  return menu === "shorts" ? [link("바로 주문하기", REELS_ORDER_URL)] : [];
}

function menuIntro(s: State, menu: MenuKey): Reply {
  s.menu = menu;
  s.step = "idle";
  s.data.faqPage = 0;
  if (s.data.applyNext) {
    delete s.data.applyNext;
    return startCollect(s, MENUS[menu].intro);
  }
  return {
    parts: [answerCard(MENUS[menu].intro, menuButtons(menu))],
    quick: [...AFTER_MENU_QUICK],
  };
}

function faqList(menu: MenuKey | null): FaqItem[] {
  return menu ? [...MENUS[menu].faq, ...COMMON_FAQ] : COMMON_FAQ;
}

function faqListReply(s: State, page: number): Reply {
  if (!s.menu) {
    return {
      parts: [
        {
          text: "궁금한 점을 편하게 적어 주세요. 서비스를 고르시면 자주 묻는 질문을 보여 드릴게요.",
        },
      ],
      quick: [...MENU_QUICK, ...COMMON_FAQ.map((f) => f.label), Q.home],
    };
  }
  const list = faqList(s.menu);
  const pages = Math.max(1, Math.ceil(list.length / FAQ_PAGE_SIZE));
  const p = ((page % pages) + pages) % pages;
  s.data.faqPage = p;
  const items = list.slice(p * FAQ_PAGE_SIZE, (p + 1) * FAQ_PAGE_SIZE).map((f) => f.label);
  const hasMore = p + 1 < pages;
  return {
    parts: [
      {
        text: `${MENUS[s.menu].title} 자주 묻는 질문이에요. 궁금한 것을 골라 주세요. 다른 궁금한 점은 편하게 적어 주셔도 돼요.`,
      },
    ],
    quick: [...items, hasMore ? Q.more : Q.home],
  };
}

function startCollect(s: State, lead?: string): Reply {
  const menu = s.menu as MenuKey;
  const first = stepsOf(menu)[0];
  s.step = `c:${first.key}`;
  s.data = {
    ...(s.data.contact ? { contact: s.data.contact } : {}),
    qids: s.data.qids ?? [],
    a: {},
    refs: [],
  };
  s.resetPhotos = true;
  s.photos = [];
  const ask = { text: `${APPLY_START}\n\n${promptText(first, {})}` };
  return {
    parts: lead ? [answerCard(lead, menuButtons(menu)), ask] : [ask],
    quick: stepQuick(first),
  };
}

function summaryText(s: State): string {
  const menu = s.menu as MenuKey;
  const a = s.data.a ?? {};
  const lines = [`받은 내용을 확인해 주세요.`, `문의: ${MENUS[menu].title}`];
  for (const st of stepsOf(menu)) {
    if (st.kind === "refs") {
      const refs = s.data.refs ?? [];
      lines.push(`${st.summary}: ${refs.length ? `${refs.length}개` : "없음"}`);
    } else if (st.kind === "photos") {
      const extra = a[st.key] ? ", 글 있음" : "";
      lines.push(`${st.summary}: ${s.photos.length ? `${s.photos.length}개` : "없음"}${extra}`);
    } else {
      lines.push(`${st.summary}: ${clip(a[st.key] ?? "", 80) || "없음"}`);
    }
  }
  lines.push(
    "",
    `이대로 접수할까요? 접수하시면 상담 연락을 위해 이름·연락처를 받는 데 동의하시는 것으로 할게요(개인정보 처리방침 ${PRIVACY_URL}).`,
  );
  return lines.join("\n");
}

function confirmReply(s: State, lead?: string): Reply {
  s.step = "confirm";
  const text = summaryText(s);
  return {
    parts: [{ text: lead ? `${lead}\n\n${text}` : text }],
    quick: [Q.submit, Q.restart, Q.home],
  };
}

function advance(s: State, lead?: string): Reply {
  const menu = s.menu as MenuKey;
  const steps = stepsOf(menu);
  const idx = steps.findIndex((x) => `c:${x.key}` === s.step);
  const next = steps[idx + 1];
  if (!next) return confirmReply(s, lead);
  s.step = `c:${next.key}`;
  return promptReply(menu, next, s, lead);
}

/** 접수 내용 → 기존 상담 폼과 같은 입력 모양(src/lib/inquiry-submit.ts) */
export function buildInquiry(menu: MenuKey, data: SessionData, photos: string[]): InquiryInput {
  const m = MENUS[menu];
  const a = data.a ?? {};
  const refs = data.refs ?? [];
  const lines = [`[출처] ${SOURCE_LABEL}`, `[문의] ${m.title}`];
  for (const st of m.collect) {
    if (st.kind === "refs" || st.key === "contact") continue;
    if (st.kind === "photos") {
      if (a[st.key]) lines.push(`${st.summary}(글): ${a[st.key]}`);
      continue;
    }
    lines.push(`${st.summary}: ${a[st.key] || "없음"}`);
  }
  if (refs.length) lines.push("", "참고 주소:", ...refs.map((r) => `- ${r}`));
  if (photos.length) lines.push("", "사진·자료 주소:", ...photos.map((p) => `- ${p}`));
  return InquirySchema.parse({
    name: clip(a.name || DEFAULT_NAME, 100),
    contact: a.contact,
    services: [m.service],
    referenceLinks: clip(refs.join("\n"), 2000),
    notes: clip(lines.join("\n"), 5000),
    consent: true,
    budget: clip(a.schedule ?? "", 100),
    topic: clip(`${SOURCE_LABEL} · ${m.title}`, 120),
  });
}

// ── 질문 답하기 ─────────────────────────────────────────────────
async function answerQuestion(
  s: State,
  textRaw: string,
  deps: TurnDeps,
  collecting: CollectStep | null,
): Promise<{ reply: Reply; effects: Effect[] }> {
  const text = clip(textRaw, 500);
  const effects: Effect[] = [];
  const knownContact = s.data.contact ?? s.data.a?.contact ?? null;
  const reprompt = (r: Reply): Reply => {
    if (!collecting || !s.menu) return r;
    return {
      parts: [...r.parts, { text: `이어서 여쭤볼게요. ${promptText(collecting, s.data.a ?? {})}` }],
      quick: stepQuick(collecting),
    };
  };
  const record = (botAnswer: string, answeredByAi: boolean, alert: boolean) => {
    const q: QuestionRecord = {
      id: deps.newId(),
      menu: s.menu,
      question: text,
      botAnswer: clip(botAnswer, 1000),
      answeredByAi,
      contact: knownContact,
      alert,
    };
    effects.push({ kind: "question", q });
    if (!knownContact) s.data.qids = [...(s.data.qids ?? []), q.id].slice(-5);
    return q;
  };
  /** 담당자가 따로 답해야 하는 질문 뒤: 연락처가 없으면 받기 */
  const offerContact = (lead: Reply): Reply => {
    if (knownContact || collecting) return lead;
    s.step = "q_offer";
    return { parts: lead.parts, quick: [Q.leaveContact, Q.noThanks, Q.home] };
  };

  const hit = matchFaq(text, s.menu, deps.extraFaq);
  if (hit?.type === "faq") {
    if (!s.menu && hit.menu) s.menu = hit.menu;
    if (hit.item.escalate) {
      record(hit.item.answer, false, true);
      const base = answer(hit.item.answer);
      if (!knownContact && !collecting) {
        base.parts.push({ text: ESCALATE_OFFER });
      }
      return { reply: reprompt(offerContact(base)), effects };
    }
    return {
      reply: reprompt(
        answer(
          hit.item.answer,
          hit.menu === "shorts" && /reels/.test(hit.item.answer)
            ? [link("바로 주문하기", REELS_ORDER_URL)]
            : [],
        ),
      ),
      effects,
    };
  }
  if (hit?.type === "extra") return { reply: reprompt(answer(hit.item.answer)), effects };
  if (hit?.type === "ambiguous" && !collecting) {
    if (hit.refund) {
      return {
        reply: {
          parts: [{ text: REFUND_WHICH }],
          quick: [...MENU_KEYS.map((k) => REFUND_MENU_LABELS[k]), Q.home],
        },
        effects,
      };
    }
    return { reply: { parts: [{ text: WHICH_SERVICE }], quick: [...MENU_QUICK, Q.home] }, effects };
  }

  // FAQ 에 없음 → AI(확정 사실만 근거, 시간 제한은 deps.ai 가) → 실패면 담당자 안내
  let ai: string | null = null;
  try {
    ai = checkAiAnswer(await deps.ai(text, s.menu));
  } catch {
    ai = null;
  }
  if (ai) {
    record(ai, true, false);
    return { reply: reprompt(answer(ai)), effects };
  }
  record(BOT_ANSWER_STAFF, false, true);
  if (collecting) return { reply: reprompt(answer(UNKNOWN_IN_COLLECT)), effects };
  if (knownContact) return { reply: answer(UNKNOWN_KNOWN_CONTACT), effects };
  return { reply: offerContact(answer(CONTACT_OFFER)), effects };
}

function contactSaved(s: State, contact: string): Effect[] {
  s.data.contact = contact;
  const ids = s.data.qids ?? [];
  s.data.qids = [];
  return ids.length ? [{ kind: "question_contact", ids, contact }] : [];
}

// ── 한 턴 ────────────────────────────────────────────────────────
export function sessionAlive(session: Session | null, now: Date): Session | null {
  if (!session) return null;
  const t = Date.parse(session.updatedAt);
  if (!Number.isFinite(t) || now.getTime() - t > SESSION_TTL_MS) return null;
  return session;
}

export async function runTurn(
  sessionIn: Session | null,
  input: TurnInput,
  deps: TurnDeps,
): Promise<TurnResult> {
  const session = sessionAlive(sessionIn, deps.now);
  const s: State = session
    ? {
        menu: session.menu,
        step: session.step,
        data: structuredClone(session.data ?? {}),
        photos: [...(session.photos ?? [])],
        resetPhotos: false,
      }
    : fresh();
  if (!session) s.resetPhotos = true; // 만료됐으면 옛 사진도 버린다
  const utt = (input.utterance ?? "").trim();
  const n = norm(utt);
  const images = input.images;

  // 1) 처음으로·웰컴
  if (input.welcome || HOME_WORDS.has(n)) return done(s, welcome(s));

  // 2) 사진·자료가 왔다
  if (images.length) {
    const cur = s.step.startsWith("c:") && s.menu ? stepByKey(s.menu, s.step.slice(2)) : undefined;
    if (cur && s.menu) {
      const count = await deps.addPhotos(images.slice(0, MAX_PHOTOS));
      s.photos = [...new Set([...s.photos, ...images])].slice(0, MAX_PHOTOS);
      if (cur.kind === "photos") {
        return done(s, {
          parts: [
            {
              text: `사진·자료 ${count || s.photos.length}개 받았어요. 더 있으면 보내 주시고, 다 보내셨으면 「다 보냈어요」를 눌러 주세요.`,
            },
          ],
          quick: stepQuick(cur, true),
        });
      }
      return done(s, promptReply(s.menu, cur, s, "사진 받았어요."));
    }
    return done(s, {
      parts: [
        {
          text: "사진·자료는 상담 신청 중에 받고 있어요. 「상담 신청하기」를 눌러 주시면 순서대로 여쭤볼게요.",
        },
      ],
      quick: s.menu ? [...END_QUICK] : [...MENU_QUICK, Q.home],
    });
  }

  // 3) 단계별
  if (s.step === "q_contact") {
    const c = parseContact(utt);
    if (c) {
      s.step = "idle";
      return done(
        s,
        answer("연락처 받았어요. 담당자가 확인해서 연락드릴게요."),
        contactSaved(s, c),
      );
    }
    if (n === norm(Q.noThanks)) {
      s.step = "idle";
      s.data.qids = [];
      return done(s, answer("알겠어요. 다른 궁금한 점이 있으면 편하게 물어봐 주세요."));
    }
    return done(s, { parts: [{ text: CONTACT_BAD }], quick: [Q.noThanks, Q.home] });
  }

  if (s.step === "q_offer") {
    const c = parseContact(utt);
    if (c) {
      s.step = "idle";
      return done(
        s,
        answer("연락처 받았어요. 담당자가 확인해서 연락드릴게요."),
        contactSaved(s, c),
      );
    }
    if (n === norm(Q.leaveContact)) {
      s.step = "q_contact";
      return done(s, {
        parts: [{ text: "답변 받으실 휴대폰 번호나 이메일을 보내 주세요." }],
        quick: [Q.noThanks, Q.home],
      });
    }
    s.step = "idle";
    if (n === norm(Q.noThanks)) {
      s.data.qids = [];
      return done(s, answer("알겠어요. 다른 궁금한 점이 있으면 편하게 물어봐 주세요."));
    }
    // 그 밖의 말은 보통 대화로
  }

  if (s.step === "confirm" && s.menu) {
    if (n === norm(Q.submit)) {
      let ok = false;
      try {
        ok = await deps.submit(buildInquiry(s.menu, s.data, s.photos));
      } catch {
        ok = false;
      }
      if (!ok) return done(s, { parts: [{ text: SUBMIT_FAIL_TEXT }], quick: [Q.submit, Q.home] });
      const contact = s.data.a?.contact;
      const menu = s.menu;
      const effects = contact ? contactSaved(s, contact) : [];
      s.step = "idle";
      s.data = { ...(contact ? { contact } : {}) };
      s.resetPhotos = true;
      s.photos = [];
      if (menu === "shorts") {
        return done(
          s,
          {
            parts: [
              answerCard(
                `${DONE_TEXT}\n\n바로 주문하시겠어요? 아래 「주문하기」에서 1편·5편·10편을 고르고 결제하실 수 있어요.`,
                [link("주문하기", REELS_ORDER_URL)],
              ),
            ],
            quick: [Q.other, Q.home],
          },
          effects,
        );
      }
      return done(s, { parts: [answerCard(DONE_TEXT)], quick: [Q.other, Q.home] }, effects);
    }
    if (n === norm(Q.restart)) return done(s, startCollect(s));
    if (isQuestion(utt)) {
      const r = await answerQuestion(s, utt, deps, null);
      s.step = "confirm";
      return done(
        s,
        {
          parts: [...r.reply.parts.slice(0, 1), { text: summaryText(s) }],
          quick: [Q.submit, Q.restart, Q.home],
        },
        r.effects,
      );
    }
    return done(s, confirmReply(s, "「접수」를 누르시면 접수돼요."));
  }

  if (s.step.startsWith("c:") && s.menu) {
    const cur = stepByKey(s.menu, s.step.slice(2));
    if (cur) {
      const a = (s.data.a ??= {});
      if (isQuestion(utt) && cur.kind !== "contact") {
        const r = await answerQuestion(s, utt, deps, cur);
        return done(s, r.reply, r.effects);
      }
      const wantsSkip = SKIP_WORDS.has(n) || NEXT_WORDS.has(n);
      switch (cur.kind) {
        case "contact": {
          const c = parseContact(utt);
          if (!c)
            return done(s, {
              parts: [
                {
                  text: wantsSkip
                    ? `연락처는 상담 연락에 꼭 필요해요. ${CONTACT_BAD}`
                    : CONTACT_BAD,
                },
              ],
              quick: stepQuick(cur),
            });
          a.contact = c;
          const effects = contactSaved(s, c);
          return done(s, advance(s), effects);
        }
        case "refs": {
          if (wantsSkip) return done(s, advance(s));
          const urls = extractUrls(utt);
          const add = urls.length ? urls : [clip(utt, 300)];
          s.data.refs = [...new Set([...(s.data.refs ?? []), ...add])].slice(0, MAX_REFS);
          return done(s, {
            parts: [
              {
                text: `주소 ${s.data.refs.length}개 받았어요. 더 있으면 보내 주시고, 없으면 「다음」을 눌러 주세요.`,
              },
            ],
            quick: stepQuick(cur, true),
          });
        }
        case "photos": {
          if (wantsSkip) return done(s, advance(s));
          const urls = extractUrls(utt);
          if (urls.length) {
            const count = await deps.addPhotos(urls);
            s.photos = [...new Set([...s.photos, ...urls])].slice(0, MAX_PHOTOS);
            return done(s, {
              parts: [
                {
                  text: `사진·자료 ${count || s.photos.length}개 받았어요. 더 있으면 보내 주시고, 다 보내셨으면 「다 보냈어요」를 눌러 주세요.`,
                },
              ],
              quick: stepQuick(cur, true),
            });
          }
          a[cur.key] = clip([a[cur.key], utt].filter(Boolean).join("\n"), 1000);
          return done(s, {
            parts: [
              {
                text: "받았어요. 사진이 있으면 이 채팅방에 보내 주시고, 다 보내셨으면 「다 보냈어요」를 눌러 주세요.",
              },
            ],
            quick: stepQuick(cur, true),
          });
        }
        case "choice": {
          if (SKIP_WORDS.has(n)) return done(s, advance(s));
          const choices = [...(cur.choices ?? [])].sort((x, y) => y.length - x.length);
          const pick =
            choices.find((c) => norm(c) === n) ?? choices.find((c) => n.includes(norm(c)));
          if (!pick) return done(s, promptReply(s.menu, cur, s, "아래 단추에서 골라 주세요."));
          a[cur.key] = pick;
          return done(s, advance(s));
        }
        default: {
          if (SKIP_WORDS.has(n) || !n) return done(s, advance(s));
          a[cur.key] = clip(utt, cur.key === "want" ? 2000 : 300);
          return done(s, advance(s));
        }
      }
    }
    s.step = "idle"; // 메뉴 자료 목록이 바뀌어 단계가 없어졌으면 처음부터
  }

  // 4) 보통 대화(idle)
  if (s.step !== "idle") s.step = "idle";

  if (n === norm(Q.apply)) {
    if (s.menu) return done(s, startCollect(s));
    s.data.applyNext = true;
    return done(s, {
      parts: [{ text: "어떤 상담을 원하세요? 아래에서 골라 주세요." }],
      quick: [...MENU_QUICK, Q.home],
    });
  }
  if (n === norm(Q.faq) || n === norm(Q.other)) return done(s, faqListReply(s, 0));
  if (n === norm(Q.more)) return done(s, faqListReply(s, (s.data.faqPage ?? 0) + 1));

  const refundMenu = MENU_KEYS.find((k) => norm(REFUND_MENU_LABELS[k]) === n);
  if (refundMenu) {
    s.menu = refundMenu;
    const items = MENUS[refundMenu].faq.filter((f) => f.kind === "refund" && !f.escalate);
    const refund = items.find((f) => /환불/.test(f.question)) ?? items[0];
    const fix = items.find((f) => /수정/.test(f.question) && f !== refund);
    return done(s, answer([refund?.answer, fix?.answer].filter(Boolean).join("\n\n")));
  }

  const byLabel = faqByLabel(utt, s.menu);
  if (byLabel) {
    if (byLabel.escalate) {
      const r = await answerQuestion(s, byLabel.question, deps, null);
      return done(s, r.reply, r.effects);
    }
    return done(s, answer(byLabel.answer));
  }

  const menu = menuFromText(utt);
  if (menu) return done(s, menuIntro(s, menu));

  if (isGreeting(utt)) return done(s, welcome(s));

  const r = await answerQuestion(s, utt, deps, null);
  return done(s, r.reply, r.effects);
}
