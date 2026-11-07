// POST /api/partner/apply — 파트너 신청(공개). 화면: src/routes/partner.index.tsx
// 처리: src/lib/partner/apply.ts(형식·허니팟·중복) → public.partner_apply → 대표님 카톡 「파트너 신청: 이름 / 확인 …」
// 🚨 로그·응답에 휴대폰·계좌·이메일 전체를 넣지 마라.
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/notify/admin-auth";
import { ADMIN_PARTNERS_URL, MAX_APPLY_BODY_BYTES, processPartnerApply, type ApplyRpcResult } from "@/lib/partner/apply";
import { notifyOwner, parseJson, partnerDb, readLimitedText, sameOrigin } from "@/lib/partner/server";

export const Route = createFileRoute("/api/partner/apply")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!sameOrigin(request)) return json({ ok: false, reason: "invalid", error: "잘못된 요청입니다." }, 403);
        const raw = await readLimitedText(request, MAX_APPLY_BODY_BYTES);
        if (raw === null) return json({ ok: false, reason: "invalid", error: "입력이 너무 깁니다." }, 413);
        const db = partnerDb();
        if (!db) return json({ ok: false, reason: "server", error: "지금은 신청을 받을 수 없습니다. 잠시 뒤 다시 시도해 주세요." }, 503);

        const r = await processPartnerApply(parseJson(raw), {
          apply: async (p) => {
            const { data, error } = await db.rpc("partner_apply", { _p: p });
            if (error) throw new Error(`rpc_${error.code ?? "?"}`);
            return data as unknown as ApplyRpcResult;
          },
          notify: (text) => notifyOwner(db, text, ADMIN_PARTNERS_URL, "신청 보기"),
        });
        return json(r.body, r.status);
      },
    },
  },
});
