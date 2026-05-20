import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const slugRegex = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;

const sellerProfileSchema = z.object({
  business_name: z.string().trim().min(1).max(80),
  slug: z.string().trim().toLowerCase().regex(slugRegex, "영문 소문자, 숫자, -만 (2~40자)"),
  bio: z.string().trim().max(500).optional().nullable(),
  avatar_url: z.string().url().max(500).optional().nullable(),
  website_url: z.string().url().max(500).optional().nullable(),
  payout_bank: z.string().trim().max(40).optional().nullable(),
  payout_account: z.string().trim().max(40).optional().nullable(),
  payout_holder: z.string().trim().max(40).optional().nullable(),
});

export const getMySellerProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("seller_profiles")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertMySellerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => sellerProfileSchema.parse(input))
  .handler(async ({ data, context }) => {
    // slug uniqueness check (excluding self)
    const { data: clash } = await supabaseAdmin
      .from("seller_profiles")
      .select("user_id")
      .eq("slug", data.slug)
      .neq("user_id", context.userId)
      .maybeSingle();
    if (clash) throw new Error("이미 사용 중인 스토어 주소입니다.");

    const { error } = await supabaseAdmin
      .from("seller_profiles")
      .upsert({ user_id: context.userId, ...data }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const productSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(120),
  tag: z.string().trim().min(1).max(40),
  description: z.string().trim().min(1).max(500),
  amount: z.number().int().min(0).max(100_000_000),
  thumbnail_url: z.string().url().max(500).optional().nullable(),
  product_type: z.enum(["web", "app", "file", "license"]),
  delivery_url: z.string().url().max(500).optional().nullable(),
  delivery_file_path: z.string().max(300).optional().nullable(),
  status: z.enum(["draft", "review", "live"]).default("draft"),
  category: z.string().trim().max(40).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional().default([]),
});

export const listMyProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("*")
      .eq("seller_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertMyProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => productSchema.parse(input))
  .handler(async ({ data, context }) => {
    // ensure seller has profile
    const { data: profile } = await supabaseAdmin
      .from("seller_profiles").select("user_id").eq("user_id", context.userId).maybeSingle();
    if (!profile) throw new Error("먼저 판매자 프로필을 만들어 주세요.");

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("products").update({ ...data, seller_id: context.userId })
        .eq("id", data.id).eq("seller_id", context.userId);
      if (error) throw new Error(error.message);
    } else {
      const { id: _ignored, ...insertData } = data;
      const { error } = await supabaseAdmin
        .from("products").insert({ ...insertData, seller_id: context.userId });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteMyProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("products").delete().eq("id", data.id).eq("seller_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMySales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("payments")
      .select("payment_id, product_title, amount, currency, status, customer_email, created_at")
      .eq("seller_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const mySalesSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("payments")
      .select("amount, status")
      .eq("seller_id", context.userId);
    if (error) throw new Error(error.message);
    const paid = (data ?? []).filter((p) => p.status === "PAID");
    const gross = paid.reduce((s, p) => s + (p.amount ?? 0), 0);
    return { orderCount: paid.length, gross, fee: Math.round(gross * 0.1), net: gross - Math.round(gross * 0.1) };
  });
