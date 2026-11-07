// POST /api/kakao/skill 의 본체 — 카카오 스킬 요청 읽기 → 토큰 확인 → 상태 읽기 → 흐름(flow.ts) → 저장 → 답.
// 라우트(src/routes/api/kakao/skill.ts)는 진짜 DB·Gemini·알림을 끼워 넣기만 한다. 시험은 가짜를 끼운다.
// 🚨 카카오는 5초 안에 답을 못 받으면 오류를 보인다. 여기서 전체 4초, AI 2.5초로 끊는다.
// 🚨 토큰이 틀려도 HTTP 200 + 「잠시 후 다시 시도해 주세요」(카카오는 오류 코드를 손님에게 이상하게 보여 준다).
// 🚨 카카오 user id·대화 원문·연락처를 로그에 남기지 마라.
import type { InquiryInput } from "../inquiry-submit";
import type { MenuKey } from "./faq";
import {
  MAX_PHOTOS,
  runTurn,
  type Effect,
  type QuestionRecord,
  type Session,
  type TurnInput,
} from "./flow";
import { extractUrls, hashUserKey, safeEqual, type ExtraFaq } from "./match";
import { retryResponse, toSkillResponse, type SkillResponse } from "./response";
import type { ChatStore } from "./store";

export const SKILL_DEADLINE_MS = 4000;
export const AI_LIMIT_MS = 2500;
export const MAX_SKILL_BODY_BYTES = 64 * 1024;
export const ADMIN_QUESTIONS_URL = "https://ai-solution.co.kr/admin/kakao-questions";

export type Background = (p: Promise<unknown>) => void;

export type SkillDeps = {
  /** 워커 비밀값 KAKAO_SKILL_TOKEN. 없으면 모든 요청을 거절한다(닫힌 쪽으로). */
  expectedToken?: string;
  store: ChatStore | null;
  ai: (question: string, menu: MenuKey | null, timeoutMs: number) => Promise<string | null>;
  /** inquiries 저장. 알림처럼 기다릴 필요 없는 일은 bg 로 넘긴다. 저장 실패면 false. */
  submit: (input: InquiryInput, bg: Background) => Promise<boolean>;
  /** 대표님 카톡 「나에게 보내기」 */
  alert: (text: string) => Promise<void>;
  /** 응답 뒤에도 일을 끝내게(Workers ctx.waitUntil). 없으면 남은 시간 안에서 기다린다. */
  waitUntil?: (p: Promise<unknown>) => void;
  now?: () => Date;
  /** 시간 재기(시험용) */
  clock?: () => number;
  newId?: () => string;
  deadlineMs?: number;
  aiLimitMs?: number;
};

type Bag = Record<string, unknown>;
const obj = (v: unknown): Bag =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Bag) : {};
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export type ParsedSkill = { userKey: string; input: TurnInput };

function looksLikeImage(url: string): boolean {
  return /kakaocdn\.net|kakao\.com\/|\.(jpe?g|png|gif|webp|heic|mp4|mov)(\?|$)/i.test(url);
}

/** 카카오 스킬 요청 v2 → 사용자 키·말·사진 주소. 형식이 틀리면 null. */
export function parseSkillRequest(body: unknown): ParsedSkill | null {
  const b = obj(body);
  const ur = obj(b.userRequest);
  const userKey = str(obj(ur.user).id).trim();
  if (!userKey || userKey.length > 200) return null;
  const utterance = str(ur.utterance).slice(0, 2000);
  const blockName = str(obj(ur.block).name);
  const intentName = str(obj(b.intent).name);
  const welcome = /웰컴|welcome/i.test(blockName) || /웰컴|welcome/i.test(intentName);

  const images: string[] = [];
  // ① 말 자체가 사진 주소(카카오는 사진을 보내면 utterance 에 주소가 온다)
  const trimmed = utterance.trim();
  const uttUrls = extractUrls(trimmed);
  const uttIsImage =
    uttUrls.length > 0 &&
    trimmed.replace(/https?:\/\/\S+/gi, "").trim() === "" &&
    uttUrls.every(looksLikeImage);
  if (uttIsImage) images.push(...uttUrls);
  // ② userRequest.params.media / action.params(이미지 보안 전송 플러그인 secureUrls "List(url,url)" 포함) / detailParams
  const media = obj(obj(ur.params).media);
  if (str(media.url)) images.push(str(media.url));
  const action = obj(b.action);
  const values: string[] = [];
  for (const [k, v] of Object.entries(obj(action.params))) {
    if (
      typeof v === "string" &&
      (/image|photo|secure|media|file|사진|이미지/i.test(k) || /kakaocdn/i.test(v))
    )
      values.push(v);
  }
  for (const [k, v] of Object.entries(obj(action.detailParams))) {
    const origin = str(obj(v).origin) || str(obj(v).value);
    if (
      origin &&
      (/image|photo|secure|media|file|사진|이미지/i.test(k) || /kakaocdn/i.test(origin))
    )
      values.push(origin);
  }
  for (const v of values) images.push(...extractUrls(v));

  const uniq = [...new Set(images)].slice(0, MAX_PHOTOS);
  return { userKey, input: { utterance: uttIsImage ? "" : utterance, images: uniq, welcome } };
}

function clip(s: string, max: number): string {
  const c = Array.from(s.replace(/\s+/g, " ").trim());
  return c.length > max ? `${c.slice(0, max).join("")}…` : c.join("");
}

export function questionAlertText(q: QuestionRecord): string {
  return [
    `챗봇 새 질문: ${clip(q.question, 60)}`,
    q.contact ? `연락처: ${q.contact}` : null,
    `확인: ${ADMIN_QUESTIONS_URL}`,
  ]
    .filter(Boolean)
    .join(" / ");
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      t = setTimeout(() => reject(new Error(`${what} 시간 초과`)), Math.max(0, ms));
    }),
  ]).finally(() => clearTimeout(t));
}

/** 스킬 한 번. rawBody 는 요청 본문 글, token 은 X-Skill-Token 머리. 언제나 카카오 v2 응답을 돌려준다. */
export async function handleSkill(
  rawBody: string,
  token: string | null,
  deps: SkillDeps,
): Promise<SkillResponse> {
  const clock = deps.clock ?? Date.now;
  const start = clock();
  const deadline = deps.deadlineMs ?? SKILL_DEADLINE_MS;
  const remaining = () => deadline - (clock() - start);

  if (!deps.expectedToken || !token || !safeEqual(token, deps.expectedToken))
    return retryResponse();
  if (!deps.store) return retryResponse();
  const store = deps.store;

  let parsed: ParsedSkill | null = null;
  try {
    parsed = parseSkillRequest(JSON.parse(rawBody));
  } catch {
    parsed = null;
  }
  if (!parsed) return retryResponse();
  const { userKey, input } = parsed;

  const tasks: Promise<unknown>[] = [];
  const bg: Background = (p) => {
    const guarded = p.catch((e) =>
      console.error(`[kakao-skill] 뒤처리 실패: ${e instanceof Error ? e.message : "?"}`),
    );
    if (deps.waitUntil) deps.waitUntil(guarded);
    else tasks.push(guarded);
  };

  const work = (async (): Promise<SkillResponse> => {
    const now = (deps.now ?? (() => new Date()))();
    const [session, extra] = await Promise.all([
      withTimeout(store.load(userKey), Math.min(1500, remaining() - 500), "상태 읽기"),
      withTimeout(store.loadExtraFaq(), Math.min(1500, remaining() - 500), "추가 FAQ 읽기").catch(
        (e): ExtraFaq[] => {
          console.error(`[kakao-skill] ${e instanceof Error ? e.message : "추가 FAQ 읽기 실패"}`);
          return [];
        },
      ),
    ]);

    const result = await runTurn(session as Session | null, input, {
      now,
      extraFaq: extra,
      ai: (q, menu) => deps.ai(q, menu, Math.min(deps.aiLimitMs ?? AI_LIMIT_MS, remaining() - 700)),
      addPhotos: (urls) =>
        withTimeout(
          store.addPhotos(userKey, urls, MAX_PHOTOS),
          Math.min(1500, remaining() - 300),
          "사진 붙이기",
        ),
      submit: (inq) => withTimeout(deps.submit(inq, bg), Math.min(2500, remaining() - 400), "접수"),
      newId: deps.newId ?? (() => crypto.randomUUID()),
    });

    await withTimeout(
      store.save(userKey, result.save, now),
      Math.min(1500, remaining() - 100),
      "상태 저장",
    );
    runEffects(result.effects, userKey, now, store, deps, bg);
    return toSkillResponse(result.reply);
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<SkillResponse>((resolve) => {
    timer = setTimeout(() => resolve(retryResponse()), Math.max(0, remaining()));
  });
  let res: SkillResponse;
  try {
    res = await Promise.race([
      work.catch((e) => {
        console.error(`[kakao-skill] 처리 실패: ${e instanceof Error ? e.message : "?"}`);
        return retryResponse();
      }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }

  // waitUntil 이 없으면(로컬 등) 남은 시간 안에서만 뒤처리를 기다린다.
  if (tasks.length) {
    await withTimeout(Promise.allSettled(tasks), Math.max(0, remaining() - 50), "뒤처리").catch(
      () => undefined,
    );
  }
  return res;
}

function runEffects(
  effects: Effect[],
  userKey: string,
  now: Date,
  store: ChatStore,
  deps: SkillDeps,
  bg: Background,
) {
  for (const e of effects) {
    if (e.kind === "question") {
      const q = e.q;
      bg(
        (async () => {
          await store.insertQuestion({
            id: q.id,
            user_key: await hashUserKey(userKey),
            menu: q.menu,
            question: q.question,
            bot_answer: q.botAnswer,
            answered_by_ai: q.answeredByAi,
            contact: q.contact,
          });
          if (q.alert && (await store.alertDue(userKey, now)))
            await deps.alert(questionAlertText(q));
        })(),
      );
    } else if (e.kind === "question_contact") {
      bg(store.setQuestionContact(e.ids, e.contact));
    }
  }
}
