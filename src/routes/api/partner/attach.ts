// POST /api/partner/attach — 쇼츠 주문에 추천 코드 붙이기. 결제 화면(src/routes/reels.checkout.tsx)이
// 주문을 만든 직후(결제창으로 넘어가기 전) 부른다. 엣지 함수(reels-checkout)는 고치지 않는다.
// 본문: { order_no, payurl, phone, ref }
// 주문 소유 확인은 DB 함수 public.partner_attach_reels 가 한다: 주문번호 + 결제창 주소(주문 만든 사람만 받는다)
//   + 휴대폰이 맞고, 만든 지 30분 안이고, 아직 코드가 없을 때만 채운다.
// 🚨 무슨 일이 있어도 결제를 막지 않는다 — 화면은 응답을 기다리되 실패를 무시한다. 응답은 늘 200 {ok}.
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/notify/admin-auth";
import { normalizeRef } from "@/lib/partner/ref";
import { parseJson, partnerDb, readLimitedText, sameOrigin } from "@/lib/partner/server";

export const Route = createFileRoute("/api/partner/attach")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!sameOrigin(request)) return json({ ok: false });
          const b = parseJson(await readLimitedText(request, 2048)) as Record<string, unknown> | null;
          if (!b || typeof b !== "object") return json({ ok: false });
          const ref = normalizeRef(b.ref);
          const orderNo = typeof b.order_no === "string" ? b.order_no.trim() : "";
          const payurl = typeof b.payurl === "string" ? b.payurl.trim().slice(0, 2000) : "";
          const phone = typeof b.phone === "string" ? b.phone.replace(/\D/g, "").slice(0, 11) : "";
          if (!ref || !/^R\d{6}-\d{4,}$/.test(orderNo) || !payurl || !phone) return json({ ok: false });
          const db = partnerDb();
          if (!db) return json({ ok: false });
          const { data, error } = await db.rpc("partner_attach_reels", {
            _order_no: orderNo,
            _payurl: payurl,
            _phone: phone,
            _ref: ref,
          });
          if (error) {
            console.error(`[partner/attach] rpc 실패 [${error.code ?? "?"}]`);
            return json({ ok: false });
          }
          const r = data as { ok?: boolean; reason?: string } | null;
          if (!r?.ok) console.warn(`[partner/attach] 안 붙임: ${r?.reason ?? "?"}`);
          return json({ ok: r?.ok === true });
        } catch {
          return json({ ok: false });
        }
      },
    },
  },
});
