
-- Auto-generate unique slugs for products
CREATE OR REPLACE FUNCTION public.slugify(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(both '-' FROM
    regexp_replace(
      regexp_replace(lower(coalesce(input, '')), '[^a-z0-9가-힣]+', '-', 'g'),
      '-+', '-', 'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.products_ensure_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  base text;
  candidate text;
  n int := 0;
BEGIN
  IF NEW.slug IS NULL OR length(trim(NEW.slug)) = 0 THEN
    base := public.slugify(NEW.title);
    IF base IS NULL OR base = '' THEN
      base := 'p';
    END IF;
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM public.products WHERE slug = candidate AND id <> NEW.id) LOOP
      n := n + 1;
      candidate := base || '-' || n::text;
    END LOOP;
    NEW.slug := candidate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_ensure_slug_trg ON public.products;
CREATE TRIGGER products_ensure_slug_trg
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.products_ensure_slug();

-- Backfill existing rows
UPDATE public.products SET slug = NULL WHERE slug = '';
WITH numbered AS (
  SELECT id, public.slugify(title) AS base,
         row_number() OVER (PARTITION BY public.slugify(title) ORDER BY created_at) AS rn
  FROM public.products
  WHERE slug IS NULL
)
UPDATE public.products p
SET slug = CASE WHEN n.rn = 1 THEN n.base ELSE n.base || '-' || (n.rn - 1)::text END
FROM numbered n
WHERE p.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS products_slug_unique ON public.products(slug) WHERE slug IS NOT NULL;
