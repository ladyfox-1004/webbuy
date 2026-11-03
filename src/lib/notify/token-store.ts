// 카카오 리프레시 토큰 저장소 = Supabase public.kakao_oauth_tokens (행 하나, id='owner').
// 🚨 이 표는 RLS 를 켜고 정책을 두지 않는다 → anon·로그인 사용자는 못 읽는다. service_role 만 쓴다.
//    마이그레이션: supabase/migrations/20261103100000_inquiry_notify_kakao.sql
// Cloudflare KV 대신 이 표를 쓴 이유: 이 저장소는 이미 service_role 키(블로그 자동화)로 Supabase 를
// 쓰고 있고, KV 는 네임스페이스를 따로 만들고 wrangler.jsonc 에 id 를 적어야 해서 설정이 하나 더 는다.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../integrations/supabase/types";
import type { KakaoTokenStore } from "./kakao";
import type { NotifyEnv } from "./env";

export type ServiceDb = ReturnType<typeof createClient<Database>>;

const ROW_ID = "owner";

export function createNotifyServiceClient(env: NotifyEnv): ServiceDb | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export function supabaseTokenStore(
  db: ServiceDb,
  now: () => Date = () => new Date(),
): KakaoTokenStore {
  return {
    async load() {
      const { data, error } = await db
        .from("kakao_oauth_tokens")
        .select("refresh_token")
        .eq("id", ROW_ID)
        .maybeSingle();
      if (error) throw new Error(`store_load_${error.code ?? "?"}`);
      return data?.refresh_token ?? null;
    },
    async save(refreshToken, expiresInSec) {
      const t = now();
      const { error } = await db.from("kakao_oauth_tokens").upsert({
        id: ROW_ID,
        refresh_token: refreshToken,
        refresh_token_expires_at:
          typeof expiresInSec === "number"
            ? new Date(t.getTime() + expiresInSec * 1000).toISOString()
            : null,
        updated_at: t.toISOString(),
      });
      if (error) throw new Error(`store_save_${error.code ?? "?"}`);
    },
  };
}

/** /admin/kakao-connect 시작: 위조 방지용 state 를 10분짜리로 저장 */
export async function savePendingState(db: ServiceDb, state: string, now = new Date()) {
  const { error } = await db.from("kakao_oauth_tokens").upsert({
    id: ROW_ID,
    pending_state: state,
    pending_state_expires_at: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    updated_at: now.toISOString(),
  });
  if (error) throw new Error(`state_save_${error.code ?? "?"}`);
}

/** 콜백: state 가 맞고 안 지났으면 true. 맞든 틀리든 한 번 쓰면 지운다. */
export async function consumePendingState(db: ServiceDb, state: string, now = new Date()) {
  const { data, error } = await db
    .from("kakao_oauth_tokens")
    .select("pending_state, pending_state_expires_at")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) throw new Error(`state_load_${error.code ?? "?"}`);
  const ok =
    !!data?.pending_state &&
    data.pending_state === state &&
    !!data.pending_state_expires_at &&
    new Date(data.pending_state_expires_at).getTime() > now.getTime();
  await db
    .from("kakao_oauth_tokens")
    .update({ pending_state: null, pending_state_expires_at: null })
    .eq("id", ROW_ID);
  return ok;
}

export async function markConnected(
  db: ServiceDb,
  refreshToken: string,
  expiresInSec: number | undefined,
  now = new Date(),
) {
  const { error } = await db.from("kakao_oauth_tokens").upsert({
    id: ROW_ID,
    refresh_token: refreshToken,
    refresh_token_expires_at:
      typeof expiresInSec === "number"
        ? new Date(now.getTime() + expiresInSec * 1000).toISOString()
        : null,
    connected_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
  if (error) throw new Error(`connect_save_${error.code ?? "?"}`);
}

export async function readConnection(db: ServiceDb) {
  const { data, error } = await db
    .from("kakao_oauth_tokens")
    .select("refresh_token, refresh_token_expires_at, connected_at, updated_at")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) throw new Error(`status_load_${error.code ?? "?"}`);
  return {
    connected: !!data?.refresh_token,
    refreshTokenExpiresAt: data?.refresh_token_expires_at ?? null,
    connectedAt: data?.connected_at ?? null,
    updatedAt: data?.updated_at ?? null,
  };
}
