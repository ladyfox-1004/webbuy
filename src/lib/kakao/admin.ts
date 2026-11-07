// 관리자 「챗봇 질문」(/admin/kakao-questions, /api/admin/kakao-questions) 입력 검사. 시험: tests/kakao-chat.test.ts
import { z } from "zod";
import { MENU_KEYS, type MenuKey } from "./faq";

const Id = z.string().uuid();
const Menu = z.enum(MENU_KEYS as unknown as [MenuKey, ...MenuKey[]]).nullable();

/** 「주차, 주차장 ,주차」 → ["주차","주차장"]. 한 글자는 챗봇이 쓰지 않으므로 뺀다. */
export function cleanKeywords(input: string[] | string): string[] {
  const list = Array.isArray(input) ? input : input.split(/[,，\n]/);
  const out: string[] = [];
  for (const k of list) {
    const t = k.replace(/\s+/g, " ").trim().slice(0, 40);
    if (Array.from(t.replace(/\s/g, "")).length < 2) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out.slice(0, 20);
}

export const QuestionAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("memo"), id: Id, adminAnswer: z.string().trim().max(2000) }),
  z.object({
    action: z.literal("done"),
    id: Id,
    adminAnswer: z.string().trim().max(2000).optional(),
  }),
  z.object({ action: z.literal("reopen"), id: Id }),
  z.object({
    action: z.literal("add_faq"),
    questionId: Id.optional(),
    menu: Menu,
    keywords: z
      .union([z.array(z.string()), z.string()])
      .transform(cleanKeywords)
      .pipe(z.array(z.string()).min(1)),
    answer: z.string().trim().min(1).max(1000),
  }),
  z.object({ action: z.literal("faq_active"), faqId: Id, active: z.boolean() }),
]);
export type QuestionActionInput = z.infer<typeof QuestionAction>;

export const MENU_LABEL: Record<MenuKey, string> = {
  homepage: "홈페이지 제작",
  landing: "랜딩페이지 제작",
  ai: "AI 개발 문의",
  shorts: "쇼츠 제작 문의",
};
