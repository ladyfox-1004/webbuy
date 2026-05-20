import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const verifySchema = z.object({
  paymentId: z.string().min(1).max(200),
  expectedAmount: z.number().int().positive().max(100_000_000),
  productTitle: z.string().min(1).max(200),
  productId: z.string().uuid().optional(),
});

type PortOnePayment = {
  status: string;
  amount?: { total?: number };
  currency?: string;
  customer?: { email?: string };
  orderName?: string;
};

async function getOptionalUserId(): Promise<string | null> {
  try {
    const req = getRequest();
    const auth = req?.headers?.get("authorization");
    if (!auth?.startsWith("Bearer ")) return null;
    const token = auth.slice(7);
    if (!token) return null;
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await sb.auth.getClaims(token);
    return data?.claims?.sub ?? null;
  } catch {
    return null;
  }
}

export const verifyPayment = createServerFn({ method: "POST" })
  .inputValidator((input) => verifySchema.parse(input))
  .handler(async ({ data }) => {
    const apiSecret = process.env.PORTONE_V2_API_SECRET;
    if (!apiSecret) {
      console.error("Missing PORTONE_V2_API_SECRET");
      return { ok: false, error: "Server misconfigured", status: "ERROR" };
    }

    const res = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(data.paymentId)}`,
      { headers: { Authorization: `PortOne ${apiSecret}` } },
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("PortOne lookup failed", res.status, text);
      return { ok: false, error: `Lookup failed (${res.status})`, status: "ERROR" };
    }

    const payment = (await res.json()) as PortOnePayment;
    const paidAmount = payment.amount?.total ?? 0;

    if (paidAmount !== data.expectedAmount) {
      console.error("Amount mismatch", paidAmount, data.expectedAmount);
      return { ok: false, error: "결제 금액이 일치하지 않습니다.", status: payment.status };
    }

    const isPaid = payment.status === "PAID" || payment.status === "VIRTUAL_ACCOUNT_ISSUED";
    const userId = await getOptionalUserId();

    const { error: dbError } = await supabaseAdmin.from("payments").upsert(
      {
        payment_id: data.paymentId,
        product_title: data.productTitle,
        product_id: data.productId ?? null,
        user_id: userId,
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
      return { ok: false, error: "기록 저장 실패", status: payment.status };
    }

    return { ok: isPaid, status: payment.status };
  });

export const getPayment = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ paymentId: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("payments")
      .select("payment_id, product_title, amount, currency, status, customer_email, created_at")
      .eq("payment_id", data.paymentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const listMyPayments = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await getOptionalUserId();
  if (!userId) return [];
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("payment_id, product_title, amount, currency, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
});
