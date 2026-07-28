import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Lemon Squeezy webhook receiver.
 * Configure in LS dashboard: URL = https://<your-domain>/api/public/webhooks/lemonsqueezy
 * Signing secret = LEMONSQUEEZY_WEBHOOK_SECRET
 *
 * On `order_created` we insert a payment row (payment_id = `ls_<order_id>`)
 * and grant an entitlement to the buyer. If `custom_data.user_id` and
 * `custom_data.product_id` are provided (via checkout URL), we use those;
 * otherwise we best-effort match by email + variant_id.
 */
export const Route = createFileRoute("/api/public/webhooks/lemonsqueezy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
        if (!secret) {
          console.error("LEMONSQUEEZY_WEBHOOK_SECRET not set");
          return new Response("Server not configured", { status: 500 });
        }

        const signature = request.headers.get("x-signature") ?? "";
        const raw = await request.text();
        const expected = createHmac("sha256", secret).update(raw).digest("hex");

        let ok = false;
        try {
          const a = Buffer.from(signature, "hex");
          const b = Buffer.from(expected, "hex");
          ok = a.length === b.length && timingSafeEqual(a, b);
        } catch {
          ok = false;
        }
        if (!ok) return new Response("Invalid signature", { status: 401 });

        let payload: any;
        try {
          payload = JSON.parse(raw);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const eventName: string = payload?.meta?.event_name ?? "";
        // Only handle successful order creation. Ignore subscription events / refunds for now.
        if (eventName !== "order_created") {
          return new Response("ok", { status: 200 });
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const attrs = payload?.data?.attributes ?? {};
        const orderId = String(payload?.data?.id ?? "");
        if (!orderId) return new Response("Missing order id", { status: 400 });

        const paymentId = `ls_${orderId}`;
        const customerEmail: string | null = attrs.user_email ?? null;
        const currency: string = (attrs.currency ?? "USD").toUpperCase();
        // total in cents (LS uses smallest currency unit)
        const amount: number =
          typeof attrs.total === "number" ? attrs.total : Number(attrs.total ?? 0);
        const status: string = attrs.status === "paid" ? "PAID" : String(attrs.status ?? "unknown");
        const orderItem = Array.isArray(attrs.first_order_item)
          ? attrs.first_order_item[0]
          : attrs.first_order_item;
        const variantId: string | null = orderItem?.variant_id
          ? String(orderItem.variant_id)
          : null;
        const productTitle: string =
          orderItem?.product_name ?? orderItem?.variant_name ?? "Lemon Squeezy Order";

        // Custom data pushed from our checkout link
        const customData = payload?.meta?.custom_data ?? {};
        let productId: string | null = customData.product_id ?? null;
        let userId: string | null = customData.user_id ?? null;

        // Fallback: match product by ls_variant_id
        if (!productId && variantId) {
          const { data: matched } = await supabaseAdmin
            .from("products")
            .select("id, seller_id")
            .eq("ls_variant_id", variantId)
            .maybeSingle();
          if (matched) productId = matched.id;
        }

        // Look up seller_id
        let sellerId: string | null = null;
        if (productId) {
          const { data: prod } = await supabaseAdmin
            .from("products")
            .select("seller_id")
            .eq("id", productId)
            .maybeSingle();
          sellerId = prod?.seller_id ?? null;
        }

        // Fallback: resolve buyer by email
        if (!userId && customerEmail) {
          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("email", customerEmail)
            .maybeSingle();
          userId = prof?.id ?? null;
        }

        // Idempotent upsert of payment
        const { error: payErr } = await supabaseAdmin.from("payments").upsert(
          {
            payment_id: paymentId,
            product_title: productTitle,
            amount,
            currency,
            status,
            customer_email: customerEmail,
            user_id: userId,
            product_id: productId,
            seller_id: sellerId,
            provider: "lemonsqueezy",
            raw: payload as never,
          },
          { onConflict: "payment_id" },
        );
        if (payErr) {
          console.error("LS payment upsert failed", payErr);
          return new Response("DB error", { status: 500 });
        }

        // Grant entitlement on successful paid orders
        if (status === "PAID" && productId) {
          const { error: entErr } = await supabaseAdmin.from("entitlements").upsert(
            {
              user_id: userId,
              product_id: productId,
              seller_id: sellerId,
              payment_id: paymentId,
              customer_email: customerEmail,
              provider: "lemonsqueezy",
            },
            { onConflict: "payment_id" },
          );
          if (entErr) console.error("LS entitlement upsert failed", entErr);

          // Best-effort receipt email
          if (customerEmail) {
            try {
              const { data: prod } = await supabaseAdmin
                .from("products")
                .select("delivery_url, delivery_file_path")
                .eq("id", productId)
                .maybeSingle();

              let downloadUrl: string | null = null;
              if (prod?.delivery_file_path) {
                const { data: signed } = await supabaseAdmin.storage
                  .from("product-files")
                  .createSignedUrl(prod.delivery_file_path, 60 * 60 * 24);
                downloadUrl = signed?.signedUrl ?? null;
              }

              const { sendInternalTransactionalEmail } = await import(
                "@/lib/email/send-internal.server"
              );
              await sendInternalTransactionalEmail({
                templateName: "purchase-receipt",
                recipientEmail: customerEmail,
                idempotencyKey: `receipt-${paymentId}`,
                templateData: {
                  productTitle,
                  amount,
                  paymentId,
                  libraryUrl: "https://ai-solution.space/me",
                  deliveryUrl: prod?.delivery_url ?? null,
                  downloadUrl,
                  siteName: "AISOLUTION",
                },
              });
            } catch (mailErr) {
              console.error("LS receipt email failed", mailErr);
            }
          }
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
