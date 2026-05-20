
-- seller_profiles
CREATE TABLE public.seller_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  slug text NOT NULL UNIQUE,
  bio text,
  avatar_url text,
  website_url text,
  payout_bank text,
  payout_account text,
  payout_holder text,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.seller_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads seller profiles"
  ON public.seller_profiles FOR SELECT USING (true);

CREATE POLICY "users manage own seller profile"
  ON public.seller_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admins manage all seller profiles"
  ON public.seller_profiles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER seller_profiles_updated_at
  BEFORE UPDATE ON public.seller_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- product status enum
DO $$ BEGIN
  CREATE TYPE public.product_status AS ENUM ('draft','review','live','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.product_type AS ENUM ('web','app','file','license');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- products: add seller_id, status, thumbnail, type, delivery
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status public.product_status NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS product_type public.product_type NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS delivery_url text,
  ADD COLUMN IF NOT EXISTS delivery_file_path text,
  ADD COLUMN IF NOT EXISTS slug text;

CREATE INDEX IF NOT EXISTS products_seller_id_idx ON public.products(seller_id);
CREATE UNIQUE INDEX IF NOT EXISTS products_slug_unique ON public.products(slug) WHERE slug IS NOT NULL;

-- replace products RLS to allow sellers
DROP POLICY IF EXISTS "anyone reads active products" ON public.products;
DROP POLICY IF EXISTS "admins write products" ON public.products;

CREATE POLICY "public reads live products"
  ON public.products FOR SELECT
  USING (
    (active = true AND status = 'live')
    OR auth.uid() = seller_id
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "sellers insert own products"
  ON public.products FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "sellers update own products"
  ON public.products FOR UPDATE
  USING (auth.uid() = seller_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = seller_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sellers delete own products"
  ON public.products FOR DELETE
  USING (auth.uid() = seller_id OR public.has_role(auth.uid(), 'admin'));

-- payments: add seller_id for settlement
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payments_seller_id_idx ON public.payments(seller_id);

-- allow sellers to read payments for their own products
CREATE POLICY "sellers read own sales"
  ON public.payments FOR SELECT
  USING (auth.uid() = seller_id);

-- storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('product-thumbnails','product-thumbnails', true),
  ('seller-avatars','seller-avatars', true),
  ('product-files','product-files', false)
ON CONFLICT (id) DO NOTHING;

-- storage policies: thumbnails (public read, owner write under userId/ prefix)
CREATE POLICY "public read product thumbnails"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-thumbnails');

CREATE POLICY "sellers upload own product thumbnails"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "sellers update own product thumbnails"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "sellers delete own product thumbnails"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

-- seller avatars
CREATE POLICY "public read seller avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'seller-avatars');

CREATE POLICY "sellers upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'seller-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "sellers update own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'seller-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "sellers delete own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'seller-avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- product files (private)
CREATE POLICY "sellers read own product files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "sellers upload own product files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "sellers update own product files"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "sellers delete own product files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-files' AND auth.uid()::text = (storage.foldername(name))[1]);
