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

    // resolve seller_id from product (if provided)
    let sellerId: string | null = null;
    if (data.productId) {
      const { data: prod } = await supabaseAdmin
        .from("products").select("seller_id").eq("id", data.productId).maybeSingle();
      sellerId = prod?.seller_id ?? null;
    }

    const { error: dbError } = await supabaseAdmin.from("payments").upsert(
      {
        payment_id: data.paymentId,
        product_title: data.productTitle,
        product_id: data.productId ?? null,
        user_id: userId,
        seller_id: sellerId,
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

    // grant entitlement on successful paid
    if (isPaid && data.productId) {
      const { error: entErr } = await supabaseAdmin.from("entitlements").upsert(
        {
          user_id: userId,
          product_id: data.productId,
          seller_id: sellerId,
          payment_id: data.paymentId,
          customer_email: payment.customer?.email ?? null,
        },
        { onConflict: "payment_id" },
      );
      if (entErr) console.error("Entitlement upsert failed", entErr);
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

export const listMyLibrary = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await getOptionalUserId();
  if (!userId) return [];
  const { data, error } = await supabaseAdmin
    .from("entitlements")
    .select(`
      id, payment_id, access_token, granted_at,
      products:product_id (
        id, title, tag, description, thumbnail_url, product_type, delivery_url, delivery_file_path
      )
    `)
    .eq("user_id", userId)
    .order("granted_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
});

// Issues a short-lived signed URL for a private product file the buyer owns.
export const getProductFileUrl = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ paymentId: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const userId = await getOptionalUserId();
    if (!userId) throw new Error("로그인이 필요합니다.");
    const { data: ent } = await supabaseAdmin
      .from("entitlements")
      .select("product_id")
      .eq("payment_id", data.paymentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!ent?.product_id) throw new Error("권한이 없습니다.");
    const { data: prod } = await supabaseAdmin
      .from("products").select("delivery_file_path").eq("id", ent.product_id).maybeSingle();
    if (!prod?.delivery_file_path) throw new Error("다운로드 파일이 없습니다.");
    const { data: signed, error } = await supabaseAdmin
      .storage.from("product-files").createSignedUrl(prod.delivery_file_path, 300);
    if (error || !signed) throw new Error(error?.message ?? "URL 생성 실패");
    return { url: signed.signedUrl };
  });

// Public product detail by slug. Two-step (no FK between products and seller_profiles).
export const getProductBySlug = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ slug: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { data: product, error } = await supabaseAdmin
      .from("products")
      .select(
        "id, slug, title, tag, description, amount, currency, thumbnail_url, product_type, status, active, created_at, seller_id"
      )
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!product || !product.active || product.status !== "live") return null;

    let seller: {
      user_id: string;
      business_name: string;
      slug: string;
      bio: string | null;
      avatar_url: string | null;
      website_url: string | null;
    } | null = null;
    if (product.seller_id) {
      const { data: s } = await supabaseAdmin
        .from("seller_profiles")
        .select("user_id, business_name, slug, bio, avatar_url, website_url")
        .eq("user_id", product.seller_id)
        .maybeSingle();
      seller = s ?? null;
    }
    return { ...product, seller };
  });
