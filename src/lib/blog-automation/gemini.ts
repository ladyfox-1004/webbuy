// Gemini 로 유튜브 영상을 직접 분석해 블로그 초안(JSON)을 받는다.
// REST generateContent + file_data.file_uri(YouTube URL). 공식 문서:
//   https://ai.google.dev/gemini-api/docs/video-understanding  (YouTube URL: 공개 영상만, 무료 등급 하루 8시간)
//   https://ai.google.dev/api/generate-content                  (fileData, generationConfig)
// 🚨 API 키는 Worker 비밀값 GEMINI_API_KEY 로만 받는다. 로그·오류 메시지에 키를 넣지 마라
//    (그래서 키를 URL 쿼리가 아니라 x-goog-api-key 헤더로 보낸다).

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export const DRAFT_CATEGORIES = ["ai-dev", "business", "story"] as const;
export type DraftCategory = (typeof DRAFT_CATEGORIES)[number];

export type BlogDraft = {
  title: string;
  description: string;
  category: DraftCategory;
  recommend: boolean;
  reason: string;
  body_md: string;
};

/** 한도 초과(429). 이 오류가 나면 그날 작업을 멈추고, 영상의 attempts 는 올리지 않는다. */
export class GeminiQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiQuotaError";
  }
}

export function buildPrompt(meta: { title: string | null; channel: string | null }): string {
  const known = [
    meta.title ? `- 영상 제목: ${meta.title}` : null,
    meta.channel ? `- 채널: ${meta.channel}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return `너는 AI 솔루션 개발사 "에이아이솔루션"의 블로그 편집자다. 첨부한 유튜브 영상을 보고 한국어 블로그 초안을 쓴다.
${known ? `\n${known}\n` : ""}
[본문(body_md) 규칙]
- 한국어 마크다운, 공백 포함 1,500~2,500자.
- 번역 전문(대사를 옮겨 적기) 금지. 영상의 핵심을 우리 말로 요약하고 해설한다. 직접 인용은 꼭 필요한 짧은 구절만.
- 구조:
  1) "## 3줄 요약" — 글머리표 3개.
  2) 핵심 내용 — "## " 소제목 3~5개, 각 소제목 아래 2~4문단 또는 글머리표.
  3) "## 우리 일에 적용할 점" — 병원·법률·부동산 등 중소 사업자 관점에서 바로 써먹을 점 3~5개.
- 출처·원본 링크·채널 소개 문장은 넣지 마라(화면이 따로 표시한다). 본문 맨 앞에 제목(# )을 넣지 마라.

[나머지 필드]
- title: 검색에 걸릴 한국어 제목, 40자 안팎. 낚시성 표현 금지.
- description: 검색 결과에 보일 설명, 120자 안팎 한 문장.
- category: AI·개발 내용이면 "ai-dev", 사업 운영·마케팅·고객 확보면 "business", 개인 성공담·동기부여 위주면 "story".
- recommend: AI 솔루션 개발사의 회사 블로그에 올리기 어울리면 true. "story"는 원칙적으로 false.
- reason: recommend 판단 이유 한두 문장.`;
}

/** Gemini responseSchema(OpenAPI 부분집합). 필드 이름은 BlogDraft 와 같다. */
export const DRAFT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    description: { type: "STRING" },
    category: { type: "STRING", enum: [...DRAFT_CATEGORIES] },
    recommend: { type: "BOOLEAN" },
    reason: { type: "STRING" },
    body_md: { type: "STRING" },
  },
  required: ["title", "description", "category", "recommend", "reason", "body_md"],
  propertyOrdering: ["title", "description", "category", "recommend", "reason", "body_md"],
} as const;

export function buildGeminiRequest(
  videoUrl: string,
  meta: { title: string | null; channel: string | null },
) {
  return {
    contents: [
      {
        role: "user",
        parts: [{ file_data: { file_uri: videoUrl } }, { text: buildPrompt(meta) }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: DRAFT_RESPONSE_SCHEMA,
      temperature: 0.6,
      // 영상 토큰을 1/3 로 줄인다(초당 약 300 → 100 토큰). 무료 등급 분당 토큰 한도에 걸리지 않게.
      mediaResolution: "MEDIA_RESOLUTION_LOW",
    },
  };
}

export type ValidationResult = { ok: true; draft: BlogDraft } | { ok: false; error: string };

/** 모델이 준 JSON 값을 검사한다. 필드 누락·형식 오류·잘못된 category 는 거부. */
export function validateDraft(value: unknown): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "응답이 객체가 아님" };
  }
  const v = value as Record<string, unknown>;
  for (const k of ["title", "description", "reason", "body_md"] as const) {
    if (typeof v[k] !== "string" || !(v[k] as string).trim()) {
      return { ok: false, error: `${k} 누락 또는 빈 값` };
    }
  }
  if (typeof v.recommend !== "boolean") return { ok: false, error: "recommend 가 bool 이 아님" };
  if (!DRAFT_CATEGORIES.includes(v.category as DraftCategory)) {
    return { ok: false, error: `잘못된 category: ${String(v.category)}` };
  }
  const body = (v.body_md as string).trim();
  if (body.length < 300) return { ok: false, error: `본문이 너무 짧음(${body.length}자)` };
  return {
    ok: true,
    draft: {
      title: (v.title as string).trim().slice(0, 200),
      description: (v.description as string).trim().slice(0, 300),
      category: v.category as DraftCategory,
      recommend: v.recommend,
      reason: (v.reason as string).trim(),
      body_md: body,
    },
  };
}

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
};

/** generateContent 응답 본문(JSON) → 검증된 초안. */
export function parseGeminiResponse(json: unknown): ValidationResult {
  const r = json as GeminiResponse;
  if (r?.promptFeedback?.blockReason) {
    return { ok: false, error: `차단됨: ${r.promptFeedback.blockReason}` };
  }
  const cand = r?.candidates?.[0];
  if (!cand) return { ok: false, error: "후보 응답 없음" };
  const text = (cand.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  if (!text.trim())
    return { ok: false, error: `빈 응답(finishReason=${cand.finishReason ?? "?"})` };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: `JSON 아님(finishReason=${cand.finishReason ?? "?"})` };
  }
  return validateDraft(parsed);
}

/** 실제 호출. 429 는 GeminiQuotaError, 그 밖의 실패는 Error. */
export async function generateDraft(opts: {
  apiKey: string;
  model: string;
  videoUrl: string;
  meta: { title: string | null; channel: string | null };
}): Promise<BlogDraft> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
    body: JSON.stringify(buildGeminiRequest(opts.videoUrl, opts.meta)),
  });
  if (res.status === 429) {
    throw new GeminiQuotaError(`Gemini 한도 초과(429): ${(await safeText(res)).slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}: ${(await safeText(res)).slice(0, 300)}`);
  }
  const result = parseGeminiResponse(await res.json());
  if (!result.ok) throw new Error(`Gemini 응답 검증 실패: ${result.error}`);
  return result.draft;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
