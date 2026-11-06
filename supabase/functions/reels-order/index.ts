// reels-order 엣지 함수(verify_jwt = false). 주문번호 + 열쇠로 주문 화면 보기·자료 올리기.
// 환경 변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. 저장소: 비공개 버킷 reels-uploads
import { json, SERVER_ERROR } from "../_shared/http.ts";
import { admin, rpc, UPLOAD_BUCKET } from "../_shared/supabaseAdmin.ts";
import { createHandler, type AddUploadResult, type OrderView } from "./handler.ts";

const handler = createHandler({
  view: (orderNo, keyHash) =>
    rpc<OrderView | null>("reels_order_view", { _order_no: orderNo, _key_hash: keyHash }),
  async signUpload(path) {
    const { data, error } = await admin.storage.from(UPLOAD_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`signed upload: ${error?.message ?? "no data"}`);
    return { token: data.token, signed_url: data.signedUrl };
  },
  addUpload: (orderId, kind, storagePath, fileName, mime, size, url, note) =>
    rpc<AddUploadResult>("reels_add_upload", {
      _order_id: orderId,
      _kind: kind,
      _storage_path: storagePath,
      _file_name: fileName,
      _mime: mime,
      _size: size,
      _url: url,
      _note: note,
    }),
  log: (...a) => console.warn(...a),
});

Deno.serve(async (req) => {
  try {
    return await handler(req);
  } catch (e) {
    console.error("[reels-order] 예외", e instanceof Error ? e.message.slice(0, 200) : "unknown");
    return json(SERVER_ERROR, 500);
  }
});
