// 파트너 API 라우트 공용(서버 전용). 🚨 브라우저 코드에서 import 하지 마라.
import { readNotifyEnv } from "@/lib/notify/env";
import { buildKakaoTextTemplate, sendKakaoTemplate } from "@/lib/notify/kakao";
import { createNotifyServiceClient, supabaseTokenStore, type ServiceDb } from "@/lib/notify/token-store";
import type { NotifyStatus } from "@/lib/notify/types";
import type { AuthUser } from "@/lib/partner/account";

/** Supabase 세션 토큰 → 사용자(서버 service 클라이언트로 확인). 틀리거나 만료면 null. */
export async function userFromToken(db: ServiceDb, token: string): Promise<AuthUser | null> {
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/** user_roles.role='admin' 인가. 읽다 실패하면 false */
export async function isAdminUser(db: ServiceDb, userId: string): Promise<boolean> {
  const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  return !error && !!data;
}

export const PARTNER_MIGRATION_HINT = "마이그레이션 20261107160000_partners.sql 적용 여부를 확인하세요.";

export function partnerDb(): ServiceDb | null {
  return createNotifyServiceClient(readNotifyEnv());
}

/** Origin 머리가 있으면 우리 주소에서 온 것만 받는다(다른 사이트가 대신 보내지 못하게). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

/** 본문을 상한까지만 읽는다. 넘으면 null */
export async function readLimitedText(request: Request, max: number): Promise<string | null> {
  const len = Number(request.headers.get("content-length") ?? "0");
  if (len > max) return null;
  const buf = await request.arrayBuffer();
  if (buf.byteLength > max) return null;
  return new TextDecoder().decode(buf);
}

export function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 대표님 카톡(나에게 보내기)으로 짧은 글 한 통. 던지지 않는다. */
export async function notifyOwner(db: ServiceDb, text: string, url: string, button: string): Promise<NotifyStatus> {
  const env = readNotifyEnv();
  try {
    return await sendKakaoTemplate(
      buildKakaoTextTemplate(text, url, button),
      {
        restApiKey: env.KAKAO_REST_API_KEY,
        clientSecret: env.KAKAO_CLIENT_SECRET,
        seedRefreshToken: env.KAKAO_REFRESH_TOKEN,
      },
      supabaseTokenStore(db),
    );
  } catch (e) {
    return `failed:${e instanceof Error ? e.name : "unknown"}`;
  }
}
