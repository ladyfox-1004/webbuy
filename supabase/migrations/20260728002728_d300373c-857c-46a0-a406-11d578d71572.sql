
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ls_store_slug text,
  ADD COLUMN IF NOT EXISTS ls_variant_id text;

ALTER TABLE public.entitlements
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'portone';

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'portone';

CREATE UNIQUE INDEX IF NOT EXISTS payments_payment_id_unique_idx ON public.payments(payment_id);
