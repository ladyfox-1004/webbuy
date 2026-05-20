
CREATE TABLE public.entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  seller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_id text NOT NULL UNIQUE,
  access_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  customer_email text,
  granted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX entitlements_user_idx ON public.entitlements(user_id);
CREATE INDEX entitlements_product_idx ON public.entitlements(product_id);
CREATE INDEX entitlements_seller_idx ON public.entitlements(seller_id);

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buyers read own entitlements"
  ON public.entitlements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "sellers read entitlements for own products"
  ON public.entitlements FOR SELECT
  USING (auth.uid() = seller_id);

CREATE POLICY "admins manage entitlements"
  ON public.entitlements FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "no public insert entitlements"
  ON public.entitlements FOR INSERT WITH CHECK (false);
