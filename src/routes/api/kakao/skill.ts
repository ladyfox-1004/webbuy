// POST /api/kakao/skill — 카카오 i 오픈빌더 스킬(채널 「에이아이솔루션」 상담 챗봇). 웰컴·폴백 블록 둘 다 이 주소를 부른다.
// 오픈빌더 설정: 스킬 URL https://ai-solution.co.kr/api/kakao/skill, 사용자 헤더 X-Skill-Token = 비밀값 KAKAO_SKILL_TOKEN.
// 흐름·답 문구: src/lib/kakao/flow.ts·faq.ts, 본체: src/lib/kakao/skill.ts handleSkill.
// 저장: kakao_chat_sessions·kakao_questions·kakao_faq_extra(마이그레이션 20261107150000_kakao_chat.sql),
//       접수는 기존 상담 폼과 같은 public.inquiries + 시트·카톡 알림(src/lib/inquiry-submit.ts processInquiry).
// 🚨 언제나 HTTP 200 + 카카오 v2 JSON 으로 답한다(오류 코드를 주면 카카오가 손님에게 이상한 화면을 보인다).
import { createFileRoute } from "@tanstack/react-router";
import { geminiModel, readAutomationEnv } from "@/lib/blog-automation/env";
import { processInquiry } from "@/lib/inquiry-submit";
import { askGemini } from "@/lib/kakao/ai";
import { readKakaoChatEnv } from "@/lib/kakao/env";
import { MAX_SKILL_BODY_BYTES, handleSkill, ADMIN_QUESTIONS_URL } from "@/lib/kakao/skill";
import { supabaseChatStore } from "@/lib/kakao/store";
import { retryResponse } from "@/lib/kakao/response";
import { runInquiryNotifications } from "@/lib/notify";
import { readNotifyEnv } from "@/lib/notify/env";
import { buildKakaoTextTemplate, sendKakaoTemplate } from "@/lib/notify/kakao";
import { createNotifyServiceClient, supabaseTokenStore } from "@/lib/notify/token-store";

function reply(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** nitro(cloudflare-module)가 요청 객체에 붙여 주는 ctx.waitUntil. 없으면 undefined(handleSkill 이 남은 시간 안에서 기다린다). */
function waitUntilOf(request: Request): ((p: Promise<unknown>) => void) | undefined {
  const r = request as unknown as {
    waitUntil?: (p: Promise<unknown>) => void;
    runtime?: { cloudflare?: { context?: { waitUntil?: (p: Promise<unknown>) => void } } };
  };
  if (typeof r.waitUntil === "function") return r.waitUntil;
  const ctx = r.runtime?.cloudflare?.context;
  if (ctx && typeof ctx.waitUntil === "function") return ctx.waitUntil.bind(ctx);
  return undefined;
}

async function readLimited(request: Request): Promise<string | null> {
  const len = Number(request.headers.get("content-length") ?? "0");
  if (len > MAX_SKILL_BODY_BYTES) return null;
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_SKILL_BODY_BYTES) return null;
  return new TextDecoder().decode(buf);
}

export const Route = createFileRoute("/api/kakao/skill")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const raw = await readLimited(request);
          if (raw === null) return reply(retryResponse());
          const chatEnv = readKakaoChatEnv();
          const notifyEnv = readNotifyEnv();
          const aiEnv = readAutomationEnv();
          const db = createNotifyServiceClient(notifyEnv);
          const res = await handleSkill(raw, request.headers.get("x-skill-token"), {
            expectedToken: chatEnv.KAKAO_SKILL_TOKEN,
            store: db ? supabaseChatStore(db) : null,
            ai: (q, menu, timeoutMs) =>
              askGemini(
                q,
                menu,
                {
                  apiKey: aiEnv.GEMINI_API_KEY,
                  model: chatEnv.KAKAO_CHAT_GEMINI_MODEL || geminiModel(aiEnv),
                  proxy: aiEnv.GEMINI_PROXY,
                  ai: aiEnv.AI,
                  gatewayId: aiEnv.AI_GATEWAY_ID,
                },
                timeoutMs,
              ),
            submit: async (input, bg) => {
              if (!db) return false;
              try {
                await processInquiry(input, {
                  // service_role 로 넣는다(RLS 우회). 행 모양은 기존 상담 폼과 같다.
                  insert: async (row) => {
                    const { error } = await db.from("inquiries").insert(row);
                    return { error };
                  },
                  // 시트·카톡 알림은 기다리지 않는다(카카오 5초 제한). 결과는 inquiries 행에 적힌다.
                  notify: async (n) => {
                    bg(runInquiryNotifications(n, { env: notifyEnv, db }));
                  },
                });
                return true;
              } catch {
                return false;
              }
            },
            alert: async (text) => {
              if (!db) return;
              const status = await sendKakaoTemplate(
                buildKakaoTextTemplate(text, ADMIN_QUESTIONS_URL, "질문 보기"),
                {
                  restApiKey: notifyEnv.KAKAO_REST_API_KEY,
                  clientSecret: notifyEnv.KAKAO_CLIENT_SECRET,
                  seedRefreshToken: notifyEnv.KAKAO_REFRESH_TOKEN,
                },
                supabaseTokenStore(db),
              );
              if (status !== "ok") console.error(`[kakao-skill] 질문 알림: ${status}`);
            },
            waitUntil: waitUntilOf(request),
          });
          return reply(res);
        } catch (e) {
          console.error(`[kakao-skill] ${e instanceof Error ? e.name : "?"}`);
          return reply(retryResponse());
        }
      },
    },
  },
});
