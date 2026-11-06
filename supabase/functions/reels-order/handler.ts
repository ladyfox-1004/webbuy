// reels-order: 손님 주문 화면(/reels/order/<주문번호>?k=<열쇠>). verify_jwt = false.
// 주문번호 + 열쇠(원문은 링크에만, DB 는 sha256 만)로 찾는다. 형식이 틀리거나 못 찾으면 모두 같은 404 문구.
//   view        → 주문 상태·금액·올린 자료(전화·이메일·확인 필요 표시는 DB 함수가 빼고 준다, 주문 id 도 손님에게 안 준다)
//   upload_url  → 비공개 버킷 reels-uploads 에 올릴 서명 주소(사진·영상, 500MB 이하, 결제 완료만)
//   save_upload → 올린 파일 기록(경로가 이 주문 id/ 로 시작해야)
//   save_links  → 홈페이지 주소·참고 릴스 주소(http(s), 10개까지)·요청사항(4000자까지)
import { errMsg, json, readJsonBody, SERVER_ERROR } from "../_shared/http.ts";
import { hashViewKey, isOrderNo, isViewKey, MAX_UPLOAD_BYTES } from "../_shared/reels.ts";

export interface OrderUpload {
  id: string;
  kind: string;
  file_name: string | null;
  mime: string | null;
  size_bytes: number | null;
  url: string | null;
  note: string | null;
  created_at: string;
}

export interface OrderView {
  id: string;
  order_no: string;
  plan: number;
  list_price: number;
  discount: number;
  amount: number;
  is_trial: boolean;
  status: string;
  paid_at: string | null;
  created_at: string;
  shop_name: string | null;
  method: string | null;
  uploads: OrderUpload[];
}

export type AddUploadResult = { ok: true; id: string } | { ok: false; reason: string };
export type UploadKind = "file" | "homepage" | "reference" | "note";

export interface OrderDeps {
  /** reels_order_view(_order_no, _key_hash) */
  view: (orderNo: string, keyHash: string) => Promise<OrderView | null>;
  /** storage.from('reels-uploads').createSignedUploadUrl(path) */
  signUpload: (path: string) => Promise<{ token: string; signed_url: string }>;
  /** reels_add_upload(...) */
  addUpload: (
    orderId: string,
    kind: UploadKind,
    storagePath: string | null,
    fileName: string | null,
    mime: string | null,
    size: number | null,
    url: string | null,
    note: string | null,
  ) => Promise<AddUploadResult>;
  newId?: () => string;
  log?: (...a: unknown[]) => void;
}

export const NOT_FOUND = {
  ok: false,
  reason: "not_found",
  error: "주문을 찾을 수 없습니다. 링크를 다시 확인해 주세요.",
};
const NOT_PAID = {
  ok: false,
  reason: "not_paid",
  error: "결제가 완료된 뒤에 자료를 올릴 수 있습니다.",
};
const TOO_MANY = {
  ok: false,
  reason: "too_many",
  error: "올릴 수 있는 자료 수를 넘었습니다. contact@ai-solution.co.kr 로 문의해 주세요.",
};
const bad = (error: string) => json({ ok: false, reason: "invalid", error }, 400);

export const MAX_REFERENCE_URLS = 10;
export const MAX_NOTE_CHARS = 4000;
const MIME_RE = /^(image|video)\/[a-z0-9][a-z0-9.+-]{0,99}$/i;
const UUID_RE_SRC = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** 저장소 경로에 쓸 안전한 파일 이름(영문·숫자·._- 만, 80자 이하, 확장자 유지). 원래 이름은 file_name 으로 따로 저장 */
export function safeFileName(name: unknown): string {
  const raw = typeof name === "string" ? name : "";
  const base = raw.split(/[\\/]/).pop() ?? "";
  let s = base
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "");
  if (s.length > 80) {
    const dot = s.lastIndexOf(".");
    const ext = dot > 0 && s.length - dot <= 10 ? s.slice(dot) : "";
    s = s.slice(0, 80 - ext.length) + ext;
  }
  return s || "file";
}

function validFile(b: Record<string, unknown>): { mime: string; size: number } | null {
  const mime = typeof b.mime === "string" ? b.mime.trim().toLowerCase() : "";
  const size = b.size;
  if (!MIME_RE.test(mime)) return null;
  if (typeof size !== "number" || !Number.isInteger(size) || size < 1 || size > MAX_UPLOAD_BYTES)
    return null;
  return { mime, size };
}

function httpUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > 2000 || !/^https?:\/\//i.test(s)) return null;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? s : null;
  } catch {
    return null;
  }
}

export function createHandler(deps: OrderDeps) {
  const newId = deps.newId ?? (() => crypto.randomUUID());

  return async (req: Request): Promise<Response> => {
    const body = await readJsonBody(req);
    if (body instanceof Response) return body;
    if (!isOrderNo(body.order_no) || !isViewKey(body.k)) return json(NOT_FOUND, 404);
    const action = body.action;
    if (!["view", "upload_url", "save_upload", "save_links"].includes(String(action)))
      return bad("요청 종류가 올바르지 않습니다.");

    try {
      const order = await deps.view(body.order_no, await hashViewKey(body.k));
      if (!order) return json(NOT_FOUND, 404);

      if (action === "view") {
        const { id: _id, ...pub } = order;
        return json({ ok: true, order: pub });
      }

      if (order.status !== "paid") return json(NOT_PAID, 409);

      const mapAdd = (r: AddUploadResult, extra: Record<string, unknown> = {}) =>
        r.ok
          ? json({ ok: true, ...extra })
          : r.reason === "not_paid"
            ? json(NOT_PAID, 409)
            : r.reason === "too_many"
              ? json(TOO_MANY, 409)
              : json(
                  {
                    ok: false,
                    reason: r.reason,
                    error: "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
                  },
                  409,
                );

      if (action === "upload_url") {
        const f = validFile(body);
        if (!f) return bad("사진·영상 파일(500MB 이하)만 올릴 수 있습니다.");
        const path = `${order.id}/${newId()}-${safeFileName(body.file_name)}`;
        const signed = await deps.signUpload(path);
        return json({ ok: true, path, token: signed.token, signed_url: signed.signed_url });
      }

      if (action === "save_upload") {
        const f = validFile(body);
        const path = typeof body.path === "string" ? body.path : "";
        const pathRe = new RegExp(`^${order.id}/${UUID_RE_SRC}-[A-Za-z0-9._-]{1,100}$`);
        if (!f || !pathRe.test(path) || path.includes(".."))
          return bad("올린 파일 정보가 올바르지 않습니다.");
        const fileName =
          (typeof body.file_name === "string" ? body.file_name.trim() : "").slice(0, 200) ||
          path.split("/").pop()!;
        return mapAdd(
          await deps.addUpload(order.id, "file", path, fileName, f.mime, f.size, null, null),
        );
      }

      // save_links
      const items: { kind: UploadKind; url: string | null; note: string | null }[] = [];
      if (body.homepage_url != null && body.homepage_url !== "") {
        const u = httpUrl(body.homepage_url);
        if (!u) return bad("홈페이지 주소는 http:// 또는 https:// 로 시작해야 합니다.");
        items.push({ kind: "homepage", url: u, note: null });
      }
      if (body.reference_urls != null) {
        if (
          !Array.isArray(body.reference_urls) ||
          body.reference_urls.length > MAX_REFERENCE_URLS
        ) {
          return bad(`참고 릴스 주소는 ${MAX_REFERENCE_URLS}개까지 넣을 수 있습니다.`);
        }
        for (const v of body.reference_urls) {
          if (typeof v === "string" && !v.trim()) continue;
          const u = httpUrl(v);
          if (!u) return bad("참고 릴스 주소는 http:// 또는 https:// 로 시작해야 합니다.");
          items.push({ kind: "reference", url: u, note: null });
        }
      }
      if (body.note != null) {
        if (typeof body.note !== "string" || body.note.length > MAX_NOTE_CHARS)
          return bad(`요청사항은 ${MAX_NOTE_CHARS}자까지 쓸 수 있습니다.`);
        if (body.note.trim()) items.push({ kind: "note", url: null, note: body.note.trim() });
      }
      if (!items.length) return bad("저장할 주소나 요청사항을 넣어 주세요.");
      let saved = 0;
      for (const it of items) {
        const r = await deps.addUpload(order.id, it.kind, null, null, null, null, it.url, it.note);
        if (!r.ok) return mapAdd(r);
        saved++;
      }
      return json({ ok: true, saved });
    } catch (e) {
      deps.log?.("[reels-order] 실패", { action, message: errMsg(e).slice(0, 200) });
      return json(SERVER_ERROR, 500);
    }
  };
}
