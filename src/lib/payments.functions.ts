import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const verifySchema = z.object({
  paymentId: z.string().min(1).max(200),
  expectedAmount: z.number().int().positive().max(100_000_000),
  productTitle: z.string().min(1).max(200),
});

type PortOnePayment = {
  status: string;
  amount?: { total?: number };
  currency?: string;
  customer?: { email?: string };
  orderName?: string;
};

export const verifyPayment = createServerFn({ method: "POST" })
  .inputValidator((input) => verifySchema.parse(input))
  .handler(async ({ data }) => {
    const apiSecret = process.env.PORTONE_V2_API_SECRET;
    if (!apiSecret) {
      console.error("Missing PORTONE_V2_API_SECRET");
      return { ok: false as const, error: "Server misconfigured" };
    }

    // 1) Fetch from PortOne
    const res = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(data.paymentId)}`,
      { headers: { Authorization: `PortOne ${apiSecret}` } },
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("PortOne lookup failed", res.status, text);
      return { ok: false as const, error: `Lookup failed (${res.status})` };
    }

    const payment = (await res.json()) as PortOnePayment;

    // 2) Verify amount + status
    const paidAmount = payment.amount?.total ?? 0;
    if (paidAmount !== data.expectedAmount) {
      console.error("Amount mismatch", paidAmount, data.expectedAmount);
      return { ok: false as const, error: "결제 금액이 일치하지 않습니다." };
    }

    const isPaid = payment.status === "PAID" || payment.status === "VIRTUAL_ACCOUNT_ISSUED";

    // 3) Persist
    const { error: dbError } = await supabaseAdmin.from("payments").upsert(
      {
        payment_id: data.paymentId,
        product_title: data.productTitle,
        amount: paidAmount,
        currency: payment.currency ?? "KRW",
        status: payment.status,
        customer_email: payment.customer?.email ?? null,
        raw: payment as never,
      },
      { onConflict: "payment_id" },
    );

    if (dbError) {
      console.error("DB upsert failed", dbError);
      return { ok: false as const, error: "기록 저장 실패" };
    }

    return { ok: isPaid, status: payment.status };
  });
