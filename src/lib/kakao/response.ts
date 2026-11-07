// 카카오 i 오픈빌더 스킬 응답(SkillResponse version "2.0") 만들기.
// 공식 형식: https://kakaobusiness.gitbook.io/main/tool/chatbot/skill_guide/answer_json_format
// 카카오 제한(넘으면 카카오가 응답을 버리거나 이상하게 보인다) — 여기서 한 번에 지킨다:
//   outputs 최대 3개 / quickReplies 최대 10개, label 14자 / simpleText 1000자
//   textCard description 400자, buttons 최대 3개, 버튼 label 14자
import { OPEN_PROFILE_URL } from "./faq";

export const LIMITS = {
  outputs: 3,
  quickReplies: 10,
  quickLabel: 14,
  simpleText: 1000,
  cardDescription: 400,
  cardButtons: 3,
  buttonLabel: 14,
} as const;

export type QuickReply = { label: string; action: "message"; messageText: string };
export type CardButton = { label: string; action: "webLink"; webLinkUrl: string };
export type SkillOutput =
  | { simpleText: { text: string } }
  | { textCard: { description: string; buttons: CardButton[] } };
export type SkillResponse = {
  version: "2.0";
  template: { outputs: SkillOutput[]; quickReplies?: QuickReply[] };
};

/** 흐름이 만드는 답(카카오 모양으로 바꾸기 전) */
export type Reply = {
  parts: ({ text: string } | { card: string; buttons: CardButton[] })[];
  quick: string[];
};

function clip(s: string, max: number): string {
  const c = Array.from(s);
  return c.length > max ? c.slice(0, max - 1).join("") + "…" : s;
}

export function qr(label: string, messageText = label): QuickReply {
  return { label: clip(label, LIMITS.quickLabel), action: "message", messageText };
}

export function link(label: string, url: string): CardButton {
  return { label: clip(label, LIMITS.buttonLabel), action: "webLink", webLinkUrl: url };
}

export const OWNER_BUTTON = link("대표와 바로 대화", OPEN_PROFILE_URL);

export function toSkillResponse(r: Reply): SkillResponse {
  const outputs: SkillOutput[] = [];
  for (const p of r.parts) {
    if ("text" in p) {
      outputs.push({ simpleText: { text: clip(p.text, LIMITS.simpleText) || " " } });
    } else if (Array.from(p.card).length <= LIMITS.cardDescription) {
      outputs.push({
        textCard: { description: p.card, buttons: p.buttons.slice(0, LIMITS.cardButtons) },
      });
    } else {
      // 글이 길면 글은 simpleText 로, 버튼만 짧은 카드로
      outputs.push({ simpleText: { text: clip(p.card, LIMITS.simpleText) } });
      outputs.push({
        textCard: {
          description: "아래 버튼을 눌러 주세요.",
          buttons: p.buttons.slice(0, LIMITS.cardButtons),
        },
      });
    }
  }
  const seen = new Set<string>();
  const quickReplies = r.quick
    .filter((q) => (seen.has(q) ? false : (seen.add(q), true)))
    .slice(0, LIMITS.quickReplies)
    .map((q) => qr(q));
  const res: SkillResponse = {
    version: "2.0",
    template: { outputs: outputs.slice(0, LIMITS.outputs) },
  };
  if (quickReplies.length) res.template.quickReplies = quickReplies;
  return res;
}

export const RETRY_TEXT = "잠시 후 다시 시도해 주세요.";

export function retryResponse(): SkillResponse {
  return { version: "2.0", template: { outputs: [{ simpleText: { text: RETRY_TEXT } }] } };
}
