
-- ============ enums ============
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- ============ profiles ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

-- ============ user_roles ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "admins manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- trigger after both functions exist
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ products ============
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  tag TEXT NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KRW',
  span TEXT NOT NULL DEFAULT 'min-h-[220px]',
  accent TEXT NOT NULL DEFAULT 'from-primary/30 to-transparent',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads active products" ON public.products
  FOR SELECT USING (active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins write products" ON public.products
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ payments extension ============
ALTER TABLE public.payments
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "no public select" ON public.payments;
CREATE POLICY "users read own payments" ON public.payments
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ============ seed products ============
INSERT INTO public.products (title, tag, description, amount, span, accent, sort_order) VALUES
  ('노션 자동화 봇', 'Productivity', '노션 워크스페이스에 일정·할일·메모를 자동 정리해주는 AI 에이전트.', 9900, 'md:col-span-2 md:row-span-2 min-h-[420px]', 'from-primary/40 to-primary-glow/10', 1),
  ('AI 카피라이터', 'Marketing', '브랜드 톤에 맞춘 인스타·블로그 카피를 한 번에.', 4900, 'min-h-[220px]', 'from-primary-glow/30 to-transparent', 2),
  ('포트원 결제 데모', 'Payments', '실제 결제 흐름을 체험할 수 있는 라이브 데모.', 1000, 'min-h-[220px]', 'from-accent/30 to-transparent', 3),
  ('수익 대시보드', 'Analytics', '여러 SaaS의 매출·구독을 한 화면에서.', 19000, 'md:col-span-2 min-h-[260px]', 'from-primary/30 to-primary-glow/20', 4),
  ('PDF 요약기', 'AI Tool', '긴 문서를 한 페이지 인사이트로.', 2900, 'min-h-[240px]', 'from-primary-glow/25 to-transparent', 5),
  ('이력서 빌더', 'Career', 'AI가 직무에 맞춰 다듬어주는 이력서 에디터.', 7900, 'md:col-span-2 min-h-[240px]', 'from-primary/35 to-transparent', 6);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER products_touch BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
