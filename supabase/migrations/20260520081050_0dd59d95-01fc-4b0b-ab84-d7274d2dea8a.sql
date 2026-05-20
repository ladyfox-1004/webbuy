
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TYPE product_status ADD VALUE IF NOT EXISTS 'review';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS products_category_idx ON public.products(category);
CREATE INDEX IF NOT EXISTS products_tags_gin ON public.products USING GIN(tags);
CREATE INDEX IF NOT EXISTS products_title_trgm ON public.products USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_desc_trgm ON public.products USING GIN (description gin_trgm_ops);
