// GET /api/partner/me?k=<view_key> — 파트너 화면(/partner/me) 자료. 로그인 없이 긴 무작위 열쇠로만 연다.
// 내용: public.partner_me — 내 코드·최근 30일 방문·접수·결제 건수·수수료(대기·지급 가능·지급 완료)·월별 정산.
// 계좌는 끝 4자리만, 손님 정보(이름·연락처)는 내보내지 않는다.
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/notify/admin-auth";
import { PARTNER_MIGRATION_HINT, partnerDb } from "@/lib/partner/server";

export const Route = createFileRoute("/api/partner/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const k = new URL(request.url).searchParams.get("k") ?? "";
        if (!/^[0-9a-f]{64}$/.test(k)) return json({ ok: false, error: "링크가 올바르지 않습니다." }, 404);
        const db = partnerDb();
        if (!db) return json({ ok: false, error: "잠시 뒤 다시 열어 주세요." }, 503);
        const { data, error } = await db.rpc("partner_me", { _view_key: k });
        if (error) {
          console.error(`[partner/me] rpc 실패 [${error.code ?? "?"}] — ${PARTNER_MIGRATION_HINT}`);
          return json({ ok: false, error: "잠시 뒤 다시 열어 주세요." }, 500);
        }
        if (!data) return json({ ok: false, error: "링크가 올바르지 않거나 아직 승인 전입니다." }, 404);
        return json({ ok: true, me: data });
      },
    },
  },
});
