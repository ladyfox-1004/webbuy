// reels-admin: 홈페이지 관리자 전용(/admin/reels). verify_jwt = false — 대신 직접 확인한다:
// Authorization: Bearer <access token> → auth.getUser → user_roles.role='admin'(홈페이지 src/lib/notify/admin-auth.ts 와 같은 방식·문구).
//   list        → 주문 목록 + 개시 스위치 + 비밀값 있음/없음(boolean 만, 값은 절대 안 줌) + 검토할 통보 수
//   uploads     → 주문별 올린 자료(파일은 1시간 서명 내려받기 주소)
//   resolve     → 「확인 필요」 처리(needs_check=false, check_resolved_at, check_note)
//   set_enabled → reels_settings.enabled 켜기/끄기
import { corsHeaders, errMsg, json, SERVER_ERROR } from "../_shared/http.ts";
import { ADMIN_SECRET_NAMES } from "../_shared/reels.ts";

export interface AdminOrderRow {
  id: string;
  order_no: string;
  created_at: string;
  plan: number;
  amount: number;
  list_price: number;
  discount: number;
  is_trial: boolean;
  status: string;
  needs_check: boolean;
  check_reason: string | null;
  shop_name: string | null;
  insta_id: string | null;
  phone: string | null;
  email: string | null;
  method: string | null;
  mail_status: string | null;
  paid_at: string | null;
  mul_no: string | null;
  upload_count: number;
}

export interface AdminUploadRow {
  id: string;
  kind: string;
  storage_path: string | null;
  file_name: string | null;
  mime: string | null;
  size_bytes: number | null;
  url: string | null;
  note: string | null;
  created_at: string;
}

export interface AdminDeps {
  /** auth.getUser(token) → 사용자 또는 null */
  getUser: (token: string) => Promise<{ id: string } | null>;
  /** user_roles 에 role='admin' 이 있나(오류는 던짐 → 500 권한 확인 실패) */
  isAdmin: (userId: string) => Promise<boolean>;
  listOrders: () => Promise<AdminOrderRow[]>;
  getSettings: () => Promise<{ enabled: boolean }>;
  /** 검토할 통보 수(검증 실패·needs_review·error) */
  reviewEventCount: () => Promise<number>;
  /** 환경 변수 읽기(있음/없음 판단에만 쓴다) */
  env: (name: string) => string | undefined;
  listUploads: (orderId: string) => Promise<AdminUploadRow[]>;
  /** 1시간 서명 내려받기 주소 */
  signDownload: (path: string) => Promise<string | null>;
  resolve: (orderId: string, note: string | null, by: string) => Promise<boolean>;
  setEnabled: (enabled: boolean, by: string) => Promise<void>;
  log?: (...a: unknown[]) => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (error: string, status: number, reason?: string) =>
  json({ ok: false, ...(reason ? { reason } : {}), error }, status);

export function createHandler(deps: AdminDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return fail("POST 만 받습니다.", 405);

    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return fail("로그인이 필요합니다.", 401);
    let userId: string;
    try {
      const u = await deps.getUser(token);
      if (!u) return fail("로그인이 만료됐습니다.", 401);
      userId = u.id;
    } catch {
      return fail("로그인이 만료됐습니다.", 401);
    }
    try {
      if (!(await deps.isAdmin(userId))) return fail("관리자만 쓸 수 있습니다.", 403);
    } catch {
      return fail("권한 확인 실패", 500);
    }

    let b: Record<string, unknown>;
    try {
      const raw = await req.json();
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return fail("요청 형식이 올바르지 않습니다.", 400, "invalid");
      b = raw as Record<string, unknown>;
    } catch {
      return fail("요청 형식이 올바르지 않습니다.", 400, "invalid");
    }

    try {
      switch (b.action) {
        case "list": {
          const [orders, settings, review] = await Promise.all([
            deps.listOrders(),
            deps.getSettings(),
            deps.reviewEventCount(),
          ]);
          const secrets: Record<string, boolean> = {};
          for (const n of ADMIN_SECRET_NAMES) secrets[n] = Boolean((deps.env(n) ?? "").trim());
          return json({
            ok: true,
            orders,
            settings: { enabled: Boolean(settings.enabled) },
            secrets,
            review_events: review,
          });
        }
        case "uploads": {
          if (typeof b.order_id !== "string" || !UUID_RE.test(b.order_id))
            return fail("주문 id 가 올바르지 않습니다.", 400, "invalid");
          const rows = await deps.listUploads(b.order_id);
          const uploads = await Promise.all(
            rows.map(async (r) => ({
              ...r,
              download_url:
                r.kind === "file" && r.storage_path
                  ? await deps.signDownload(r.storage_path)
                  : null,
            })),
          );
          return json({ ok: true, uploads });
        }
        case "resolve": {
          if (typeof b.order_id !== "string" || !UUID_RE.test(b.order_id))
            return fail("주문 id 가 올바르지 않습니다.", 400, "invalid");
          if (b.note != null && (typeof b.note !== "string" || b.note.length > 2000))
            return fail("메모는 2000자까지 쓸 수 있습니다.", 400, "invalid");
          const note = typeof b.note === "string" && b.note.trim() ? b.note.trim() : null;
          const found = await deps.resolve(b.order_id, note, userId);
          return found ? json({ ok: true }) : fail("주문을 찾을 수 없습니다.", 404, "not_found");
        }
        case "set_enabled": {
          if (typeof b.enabled !== "boolean")
            return fail("enabled 는 true/false 여야 합니다.", 400, "invalid");
          await deps.setEnabled(b.enabled, userId);
          return json({ ok: true, settings: { enabled: b.enabled } });
        }
        default:
          return fail("요청 종류가 올바르지 않습니다.", 400, "invalid");
      }
    } catch (e) {
      deps.log?.("[reels-admin] 실패", {
        action: String(b.action),
        message: errMsg(e).slice(0, 200),
      });
      return json(SERVER_ERROR, 500);
    }
  };
}
