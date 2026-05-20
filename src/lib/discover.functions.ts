import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PUBLIC_COLS =
  "id, slug, title, tag, description, amount, currency, thumbnail_url, category, tags, created_at, seller_id, sort_order";

// --- Search (public) -------------------------------------------------------
export const searchProducts = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        q: z.string().trim().max(80).optional().default(""),
        category: z.string().trim().max(40).optional().default(""),
        tag: z.string().trim().max(30).optional().default(""),
        limit: z.number().int().min(1).max(60).optional().default(24),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("products")
      .select(PUBLIC_COLS)
      .eq("active", true)
      .eq("status", "live")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.q) {
      const safe = data.q.replace(/[%_\\]/g, "\\$&");
      q = q.or(`title.ilike.%${safe}%,description.ilike.%${safe}%,tag.ilike.%${safe}%`);
    }
    if (data.category) q = q.eq("category", data.category);
    if (data.tag) q = q.contains("tags", [data.tag]);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// --- Distinct categories used on live products (public) --------------------
export const listCategories = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("category")
    .eq("active", true)
    .eq("status", "live")
    .not("category", "is", null);
  if (error) throw new Error(error.message);
  const set = new Set<string>();
  for (const r of data ?? []) if (r.category) set.add(r.category);
  return [...set].sort();
});

// --- Seller public store (public) ------------------------------------------
export const getSellerBySlug = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ slug: z.string().trim().min(1).max(40) }).parse(input))
  .handler(async ({ data }) => {
    const { data: seller, error } = await supabaseAdmin
      .from("seller_profiles")
      .select("user_id, business_name, slug, bio, avatar_url, website_url, verified, created_at")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!seller) return null;

    const { data: products } = await supabaseAdmin
      .from("products")
      .select(PUBLIC_COLS)
      .eq("seller_id", seller.user_id)
      .eq("active", true)
      .eq("status", "live")
      .order("created_at", { ascending: false })
      .limit(60);
    return { seller, products: products ?? [] };
  });

// --- Admin moderation queue ------------------------------------------------
async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("관리자 권한이 필요합니다.");
}

export const adminListReviewQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("products")
      .select(
        "id, slug, title, tag, description, amount, thumbnail_url, status, created_at, updated_at, seller_id, category, tags, delivery_url, delivery_file_path, product_type"
      )
      .in("status", ["review", "draft"])
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const sellerIds = [...new Set((data ?? []).map((p) => p.seller_id).filter(Boolean))] as string[];
    let sellersById = new Map<string, { business_name: string; slug: string }>();
    if (sellerIds.length > 0) {
      const { data: sellers } = await supabaseAdmin
        .from("seller_profiles")
        .select("user_id, business_name, slug")
        .in("user_id", sellerIds);
      sellersById = new Map((sellers ?? []).map((s) => [s.user_id, s]));
    }
    return (data ?? []).map((p) => ({
      ...p,
      seller: p.seller_id ? sellersById.get(p.seller_id) ?? null : null,
    }));
  });

export const adminSetProductStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["draft", "review", "live"]),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("products")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Seller: submit for review --------------------------------------------
export const submitProductForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("products")
      .update({ status: "review" })
      .eq("id", data.id)
      .eq("seller_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
