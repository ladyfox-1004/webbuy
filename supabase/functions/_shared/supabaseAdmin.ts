// 릴스 함수들이 쓰는 service role 클라이언트(엣지 함수 안에서만). 표는 RLS 로 막혀 있고 이 클라이언트로만 읽고 쓴다.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** 결제 뒤 돌아올·메일 링크 사이트(선택 REELS_SITE_URL, 기본 https://ai-solution.co.kr) */
export const siteUrl = Deno.env.get("REELS_SITE_URL") || "https://ai-solution.co.kr";

export const UPLOAD_BUCKET = "reels-uploads";

/** rpc 를 부르고 오류면 던진다 */
export async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as T;
}

/** reels_settings.enabled(행이 없으면 false) */
export async function reelsEnabled(): Promise<boolean> {
  const { data, error } = await admin
    .from("reels_settings")
    .select("enabled")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(`reels_settings: ${error.message}`);
  return Boolean((data as { enabled?: boolean } | null)?.enabled);
}
