// 블로그 자동화가 쓰는 설정값과 service_role 클라이언트.
// 🚨 서버 전용. 브라우저 코드에서 import 하지 마라.
// 🚨 키(SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY)는 Worker 비밀값(wrangler secret)으로만 들어온다.
//    공개 저장소이므로 코드·.env·wrangler.jsonc 에 적지 마라.
//
// 값이 들어오는 길:
//  - 예약 실행(nitro task): context.cloudflare.env  ← 가장 확실한 경로라 이것을 우선한다.
//  - 서버 라우트(/api/admin/blog/run): process.env (nodejs_compat + compatibility_date ≥ 2025-04-01 이면
//    Workers 가 vars·secrets 를 process.env 에 채운다) 와 nitro 가 매 요청 넣는 globalThis.__env__.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../integrations/supabase/types";
import { DEFAULT_GEMINI_MODEL } from "./gemini";

export type AutomationEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  BLOG_PLAYLIST_ID?: string;
  BLOG_DAILY_LIMIT?: string;
};

type Bag = Record<string, unknown>;

function pickStrings(src: Bag | undefined): AutomationEnv {
  const out: Record<string, string> = {};
  if (!src) return out;
  for (const k of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "BLOG_PLAYLIST_ID",
    "BLOG_DAILY_LIMIT",
  ]) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

/** 뒤에 오는 값이 앞을 덮는다. cfEnv(바인딩)를 가장 우선한다. */
export function readAutomationEnv(cfEnv?: unknown): AutomationEnv {
  const proc = typeof process !== "undefined" ? (process.env as Bag) : undefined;
  const nitroEnv = (globalThis as { __env__?: Bag }).__env__;
  return {
    ...pickStrings(proc),
    ...pickStrings(nitroEnv),
    ...pickStrings(cfEnv as Bag | undefined),
  };
}

export type ServiceClient = ReturnType<typeof createClient<Database>>;

/** service_role 클라이언트. 키가 없으면 null(예외 없이). */
export function createServiceClient(env: AutomationEnv): ServiceClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export function geminiModel(env: AutomationEnv): string {
  return env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

export function dailyLimit(env: AutomationEnv): number {
  const n = Number.parseInt(env.BLOG_DAILY_LIMIT ?? "", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10) : 3;
}
