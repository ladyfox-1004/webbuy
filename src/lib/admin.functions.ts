import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const adminListPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("payments")
      .select("id, payment_id, product_title, amount, currency, status, customer_email, user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, display_name, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });
    return (profiles ?? []).map((p) => ({ ...p, roles: roleMap.get(p.id) ?? [] }));
  });

export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("payments")
      .select("amount, status, created_at")
      .limit(5000);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const paid = rows.filter((r) => r.status === "PAID");
    const totalRevenue = paid.reduce((s, r) => s + r.amount, 0);
    const successRate = rows.length ? paid.length / rows.length : 0;

    // last 14 days revenue
    const days: { date: string; revenue: number; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, revenue: 0, count: 0 });
    }
    const idx = new Map(days.map((d, i) => [d.date, i]));
    paid.forEach((r) => {
      const k = new Date(r.created_at).toISOString().slice(0, 10);
      const i = idx.get(k);
      if (i !== undefined) {
        days[i].revenue += r.amount;
        days[i].count += 1;
      }
    });
    return {
      totalRevenue,
      totalCount: rows.length,
      paidCount: paid.length,
      successRate,
      series: days,
    };
  });

export const adminListWebhookEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: payments, error } = await supabaseAdmin
      .from("payments")
      .select("id, payment_id, product_title, amount, currency, status, customer_email, provider, created_at")
      .eq("provider", "lemonsqueezy")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const { data: emails } = await supabaseAdmin
      .from("email_send_log")
      .select("message_id, template_name, recipient_email, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    return {
      payments: payments ?? [],
      emails: emails ?? [],
    };
  });
