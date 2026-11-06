// reels-admin 엣지 함수(verify_jwt = false, 대신 Bearer 토큰 → user_roles.role='admin' 직접 확인).
// 환경 변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (PAYAPP_*·RESEND_API_KEY 는 있음/없음만 본다)
import { json, SERVER_ERROR } from "../_shared/http.ts";
import { admin, UPLOAD_BUCKET } from "../_shared/supabaseAdmin.ts";
import { createHandler, type AdminOrderRow, type AdminUploadRow } from "./handler.ts";

const ORDER_COLUMNS =
  "id, order_no, created_at, plan, amount, list_price, discount, is_trial, status, needs_check, check_reason, " +
  "shop_name, insta_id, phone, email, method, mail_status, paid_at, mul_no, reels_uploads(count)";

type OrderWithCount = Omit<AdminOrderRow, "upload_count"> & { reels_uploads?: { count: number }[] };

const handler = createHandler({
  async getUser(token) {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id };
  },
  async isAdmin(userId) {
    const { data, error } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return Boolean(data);
  },
  async listOrders() {
    const { data, error } = await admin
      .from("reels_orders")
      .select(ORDER_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(`reels_orders: ${error.message}`);
    return ((data ?? []) as unknown as OrderWithCount[]).map(({ reels_uploads, ...r }) => ({
      ...r,
      upload_count: reels_uploads?.[0]?.count ?? 0,
    }));
  },
  async getSettings() {
    const { data, error } = await admin
      .from("reels_settings")
      .select("enabled")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(`reels_settings: ${error.message}`);
    return { enabled: Boolean((data as { enabled?: boolean } | null)?.enabled) };
  },
  async reviewEventCount() {
    const { count, error } = await admin
      .from("reels_payapp_events")
      .select("id", { count: "exact", head: true })
      .or("verified.eq.false,result.in.(needs_review,error)");
    if (error) throw new Error(`reels_payapp_events: ${error.message}`);
    return count ?? 0;
  },
  env: (n) => Deno.env.get(n),
  async listUploads(orderId) {
    const { data, error } = await admin
      .from("reels_uploads")
      .select("id, kind, storage_path, file_name, mime, size_bytes, url, note, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`reels_uploads: ${error.message}`);
    return (data ?? []) as AdminUploadRow[];
  },
  async signDownload(path) {
    const { data, error } = await admin.storage.from(UPLOAD_BUCKET).createSignedUrl(path, 3600);
    return error || !data ? null : data.signedUrl;
  },
  async resolve(orderId, note, _by) {
    const { data, error } = await admin
      .from("reels_orders")
      .update({ needs_check: false, check_resolved_at: new Date().toISOString(), check_note: note })
      .eq("id", orderId)
      .select("id");
    if (error) throw new Error(`resolve: ${error.message}`);
    return (data ?? []).length > 0;
  },
  async setEnabled(enabled, by) {
    const { error } = await admin
      .from("reels_settings")
      .update({ enabled, updated_at: new Date().toISOString(), updated_by: by })
      .eq("id", true);
    if (error) throw new Error(`reels_settings: ${error.message}`);
  },
  log: (...a) => console.warn(...a),
});

Deno.serve(async (req) => {
  try {
    return await handler(req);
  } catch (e) {
    console.error("[reels-admin] 예외", e instanceof Error ? e.message.slice(0, 200) : "unknown");
    return json(SERVER_ERROR, 500);
  }
});
