CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id TEXT NOT NULL UNIQUE,
  product_title TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KRW',
  status TEXT NOT NULL,
  customer_email TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Anyone can attempt to read their own payment by payment_id (public lookup not allowed without id).
-- Writes go only through service role from the server function.
CREATE POLICY "no public select" ON public.payments FOR SELECT USING (false);
CREATE POLICY "no public insert" ON public.payments FOR INSERT WITH CHECK (false);