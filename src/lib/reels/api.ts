// 릴스 판매 화면 ↔ Supabase 엣지 함수(reels-quote·reels-checkout·reels-order·reels-admin) 호출.
// 계약: 모두 POST JSON, 응답은 항상 { ok, error?, reason? }. 근거는 작업 계약서 「HTTP 계약」.
// 주의: 금액은 서버가 정한다. 화면은 quote 응답을 보여 주고, 결제 때 그 금액을 quoted_amount 로 되돌려 보내기만 한다.
import { supabase } from "@/integrations/supabase/client";
import type { ConsentKey, ReelsMethod, ReelsPlan, ReelsStatus } from "./constants";

export type Quote = {
  plan: ReelsPlan;
  list_price: number;
  discount: number;
  amount: number;
  is_trial: boolean;
  reasons: string[];
};

export type Upload = {
  id: string;
  kind: "file" | "homepage" | "reference" | "note";
  file_name: string | null;
  mime: string | null;
  size_bytes: number | null;
  url: string | null;
  note: string | null;
  created_at: string;
};

export type OrderView = {
  order_no: string;
  plan: ReelsPlan;
  list_price: number;
  discount: number;
  amount: number;
  is_trial: boolean;
  status: ReelsStatus;
  paid_at: string | null;
  created_at: string;
  shop_name: string;
  method: ReelsMethod;
  uploads: Upload[];
};

export type AdminOrder = {
  id: string;
  order_no: string;
  created_at: string;
  plan: ReelsPlan;
  amount: number;
  list_price: number;
  discount: number;
  is_trial: boolean;
  status: ReelsStatus;
  needs_check: boolean;
  check_reason: string | null;
  shop_name: string;
  insta_id: string;
  phone: string;
  email: string;
  method: ReelsMethod;
  mail_status: string | null;
  paid_at: string | null;
  mul_no: string | null;
  upload_count: number;
};

export type AdminUpload = Upload & { download_url?: string | null };

export const SECRET_NAMES = [
  "PAYAPP_USERID",
  "PAYAPP_LINKKEY",
  "PAYAPP_LINKVAL",
  "PAYAPP_REQUESTKEY",
  "RESEND_API_KEY",
] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

export type AdminList = {
  orders: AdminOrder[];
  settings: { enabled: boolean };
  secrets: Record<SecretName, boolean>;
  review_events: number;
};

/** 실패 응답. status 는 HTTP 상태(네트워크 오류면 0) */
export type Fail = { ok: false; status: number; reason?: string; error: string; quote?: Quote };
export type Result<T> = ({ ok: true } & T) | Fail;

const NETWORK_ERROR = "연결이 잠시 끊겼습니다. 잠시 뒤 다시 시도해 주세요.";

function fnUrl(name: string): string {
  const base = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
  return `${base}/functions/v1/${name}`;
}

async function call<T>(name: string, body: unknown, bearer?: string): Promise<Result<T>> {
  let res: Response;
  try {
    res = await fetch(fnUrl(name), {
      method: "POST",
      headers: {
        apikey: String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ""),
        "content-type": "application/json",
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // 본문이 JSON 이 아니면 아래에서 실패로 처리한다
  }
  if (res.ok && data.ok === true) return data as { ok: true } & T;
  return {
    ok: false,
    status: res.status,
    reason: typeof data.reason === "string" ? data.reason : undefined,
    error:
      typeof data.error === "string" && data.error
        ? data.error
        : `처리하지 못했습니다(${res.status}). 잠시 뒤 다시 시도해 주세요.`,
    quote: (data.quote as Quote | undefined) ?? undefined,
  };
}

export function quote(input: { plan: ReelsPlan; insta: string; phone: string }) {
  return call<{ quote: Quote; ready: boolean }>("reels-quote", input);
}

export type CheckoutBody = {
  plan: ReelsPlan;
  shop_name: string;
  insta: string;
  phone: string;
  email: string;
  method: ReelsMethod;
  agree: Record<ConsentKey, boolean>;
  quoted_amount: number;
};

export function checkout(body: CheckoutBody) {
  return call<{ order_no: string; payurl: string }>("reels-checkout", body);
}

export function orderView(order_no: string, k: string) {
  return call<{ order: OrderView }>("reels-order", { order_no, k, action: "view" });
}

export function orderUploadUrl(
  order_no: string,
  k: string,
  f: { file_name: string; mime: string; size: number },
) {
  return call<{ path: string; token: string; signed_url: string }>("reels-order", {
    order_no,
    k,
    action: "upload_url",
    ...f,
  });
}

export function orderSaveUpload(
  order_no: string,
  k: string,
  f: { path: string; file_name: string; mime: string; size: number },
) {
  return call<{ id?: string }>("reels-order", { order_no, k, action: "save_upload", ...f });
}

export function orderSaveLinks(
  order_no: string,
  k: string,
  v: { homepage_url?: string; reference_urls?: string[]; note?: string },
) {
  return call<object>("reels-order", { order_no, k, action: "save_links", ...v });
}

/**
 * 파일 하나 올리기: upload_url 발급 → 저장 공간에 직접 올림 → save_upload 기록.
 * 진행 표시는 단계(0 → 0.1 → 0.9 → 1)로 알린다(supabase-js 업로드는 바이트 진행률을 주지 않는다).
 */
export async function uploadOrderFile(
  order_no: string,
  k: string,
  file: File,
  onStep?: (p: number) => void,
): Promise<Result<object>> {
  onStep?.(0.05);
  const u = await orderUploadUrl(order_no, k, {
    file_name: file.name,
    mime: file.type,
    size: file.size,
  });
  if (!u.ok) return u;
  onStep?.(0.1);
  const { error } = await supabase.storage
    .from("reels-uploads")
    .uploadToSignedUrl(u.path, u.token, file, { contentType: file.type });
  if (error) return { ok: false, status: 0, error: `${file.name}: 올리지 못했습니다. 다시 시도해 주세요.` };
  onStep?.(0.9);
  const s = await orderSaveUpload(order_no, k, {
    path: u.path,
    file_name: file.name,
    mime: file.type,
    size: file.size,
  });
  if (!s.ok) return s;
  onStep?.(1);
  return { ok: true };
}

async function adminToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

export async function adminList() {
  return call<AdminList>("reels-admin", { action: "list" }, await adminToken());
}

export async function adminUploads(order_id: string) {
  return call<{ uploads: AdminUpload[] }>(
    "reels-admin",
    { action: "uploads", order_id },
    await adminToken(),
  );
}

export async function adminResolve(order_id: string, note: string) {
  return call<object>(
    "reels-admin",
    { action: "resolve", order_id, note },
    await adminToken(),
  );
}

export async function adminSetEnabled(enabled: boolean) {
  return call<object>(
    "reels-admin",
    { action: "set_enabled", enabled },
    await adminToken(),
  );
}
