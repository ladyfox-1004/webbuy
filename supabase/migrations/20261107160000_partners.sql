-- 추천인(파트너) 프로그램 — 「우리 서비스를 대신 홍보해 주면, 그 사람을 통해 결제될 때마다 결제 금액의 10%」(11/7 대표님 결정)
--
-- 구성
--   표:   partners             — 신청자·파트너(누구나 신청 → 대표님이 /admin/partners 에서 승인한 사람만 수수료)
--         partner_payouts      — 월별 정산(파트너·월마다 한 줄, 3.3% 원천징수 뗀 실지급액)
--         partner_commissions  — 수수료 원장(쇼츠 결제는 트리거가 자동, 상담 계약은 대표님이 「결제됨」)
--   열:   reels_orders.ref_code · inquiries.ref_code · site_visits.ref_code (추천 코드, 형식만 검사)
--   트리거: reels_orders 상태가 결제 완료(paid)가 되면 수수료 한 줄(pending), 결제 뒤 취소되면 cancelled
--   쓰기·읽기: 표 3개 RLS 켬·정책 0개·anon/authenticated 권한 회수. 서버 라우트(service_role)만 아래 함수를 부른다.
--
-- 금액 규칙(정수 원, 모두 원 단위 내림)
--   수수료 = floor(결제 금액 × 0.10). 쇼츠 첫 주문 체험(is_trial)은 수수료 없음.
--   체험 뒤 7일 안에 5편·10편을 사면(credit_trial_order_id) 그 결제 금액(차감 뒤 amount)의 10%.
--     그 묶음 주문에 추천 코드가 없으면 체험 주문의 추천 코드를 이어받는다.
--   원천징수 = 소득세 floor(합계 × 0.03) + 지방소득세 floor(합계 × 0.003). 실지급 = 합계 − 원천징수.
--     예) 130,100 → 소득세 3,903 · 지방세 390 · 실지급 125,807
--
-- 수수료 상태
--   pending   쇼츠 결제 직후(환불 기간 7일 대기)
--   payable   결제 뒤 7일 지남(partner_refresh_payable 이 정산·조회 때 바꾼다) / 상담 계약은 바로 payable
--   paid      정산 「지급 완료」
--   cancelled 결제 취소·환불, 자기 구매, 대표님 취소
--   이미 paid 인 수수료의 주문이 환불되면 상태는 그대로 두고 note 에 「지급 뒤 환불 — 다음 정산에서 차감 필요」.
--
-- 서버 함수 계약(service_role 전용, jsonb 반환)
--   partner_apply(_p jsonb)                         → {ok:true, id, code, name} | {ok:false, reason:'invalid'|'duplicate'|'code_taken'|'code_reserved'}
--   partner_attach_reels(_order_no, _payurl, _phone, _ref, _now) → {ok:true} | {ok:false, reason}
--   partner_refresh_payable(_now)                   → integer(바뀐 줄 수)
--   partner_set_status(_id, _status, _now)          → {ok:true, status, code, view_key} | {ok:false, reason}
--   partner_inquiry_paid(_inquiry_id, _amount, _now) → {ok:true, commission_id, amount} | {ok:false, reason}
--   partner_commission_cancel(_id, _note, _now)     → {ok:true} | {ok:false, reason}
--   partner_make_payouts(_month, _now)              → {ok:true, partners, created, updated, skipped_paid}
--   partner_payout_mark_paid(_id, _now)             → {ok:true} | {ok:false, reason}
--   partner_admin_overview(_now)                    → {partners, inquiries, commissions, payouts}
--   partner_me(_view_key, _now)                     → {...} | null (계좌는 끝 4자리만)
--
-- 시험: supabase/tests/partners.test.sql (deno run -A supabase/tests/run-sql-tests.ts)

-- ───────── 0) 추천 코드 형식 ─────────
-- 소문자 영숫자 4~16자, 예약어 금지. 화면·서버(src/lib/partner/code.ts)와 같은 규칙.
CREATE FUNCTION public._partner_code_ok(_c text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _c IS NOT NULL
     AND _c ~ '^[a-z0-9]{4,16}$'
     AND _c <> ALL (ARRAY[
       'admin', 'administrator', 'api', 'www', 'root', 'system', 'staff', 'manager', 'owner', 'ceo',
       'partner', 'partners', 'reels', 'shorts', 'blog', 'login', 'logout', 'signup', 'dashboard',
       'sell', 'test', 'null', 'none', 'undefined', 'aisol', 'aisolution', 'official', 'support',
       'help', 'contact', 'kakao', 'naver', 'google', 'payapp', 'refund', 'privacy', 'terms'
     ])
$$;

-- ───────── 1) 표 ─────────
CREATE TABLE public.partners (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL UNIQUE CHECK (public._partner_code_ok(code)),
  status           text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'approved', 'rejected', 'paused')),
  name             text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 50),
  phone            text NOT NULL UNIQUE CHECK (phone ~ '^01[016789][0-9]{7,8}$'),
  email            text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  channels         text NOT NULL DEFAULT '' CHECK (char_length(channels) <= 1000),
  bank_name        text NOT NULL CHECK (char_length(btrim(bank_name)) BETWEEN 1 AND 30),
  bank_account     text NOT NULL CHECK (bank_account ~ '^[0-9-]{6,30}$'),
  bank_holder      text NOT NULL CHECK (char_length(btrim(bank_holder)) BETWEEN 1 AND 30),
  agreed_at        timestamptz NOT NULL DEFAULT now(),
  consent_version  text NOT NULL DEFAULT 'partner-2026-11-07' CHECK (consent_version <> ''),
  approved_at      timestamptz,
  view_key         text UNIQUE CHECK (view_key IS NULL OR view_key ~ '^[0-9a-f]{64}$'),
  memo             text CHECK (memo IS NULL OR char_length(memo) <= 2000),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX partners_email_key ON public.partners (lower(email));
CREATE INDEX partners_status_idx ON public.partners (status, created_at DESC);

CREATE TABLE public.partner_payouts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id   uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  month        text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  gross        integer NOT NULL DEFAULT 0 CHECK (gross >= 0),
  income_tax   integer NOT NULL DEFAULT 0 CHECK (income_tax >= 0),
  local_tax    integer NOT NULL DEFAULT 0 CHECK (local_tax >= 0),
  withholding  integer NOT NULL DEFAULT 0 CHECK (withholding >= 0),
  net          integer NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  paid_at      timestamptz,
  UNIQUE (partner_id, month),
  CHECK (withholding = income_tax + local_tax AND net = gross - withholding)
);

CREATE TABLE public.partner_commissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id      uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  source          text NOT NULL CHECK (source IN ('reels', 'inquiry')),
  reels_order_id  uuid UNIQUE REFERENCES public.reels_orders(id) ON DELETE SET NULL,
  inquiry_id      uuid REFERENCES public.inquiries(id) ON DELETE SET NULL,
  base_amount     integer NOT NULL CHECK (base_amount >= 0),
  rate            numeric(5, 4) NOT NULL DEFAULT 0.10 CHECK (rate >= 0 AND rate <= 1),
  amount          integer NOT NULL CHECK (amount >= 0),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'payable', 'paid', 'cancelled')),
  note            text CHECK (note IS NULL OR char_length(note) <= 2000),
  created_at      timestamptz NOT NULL DEFAULT now(),
  payable_at      timestamptz,
  paid_at         timestamptz,
  cancelled_at    timestamptz,
  payout_id       uuid REFERENCES public.partner_payouts(id) ON DELETE SET NULL,
  CONSTRAINT partner_commissions_amount_rule CHECK (amount = floor(base_amount * rate)::integer)
);
-- 상담 한 건에 살아 있는 수수료는 하나(「결제됨」 두 번 눌림 방지). 잘못 넣었으면 취소하고 다시 넣는다.
CREATE UNIQUE INDEX partner_commissions_inquiry_key ON public.partner_commissions (inquiry_id)
  WHERE inquiry_id IS NOT NULL AND status <> 'cancelled';
CREATE INDEX partner_commissions_partner_idx ON public.partner_commissions (partner_id, status, created_at DESC);
CREATE INDEX partner_commissions_payout_idx ON public.partner_commissions (payout_id) WHERE payout_id IS NOT NULL;

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;
-- 정책은 일부러 만들지 않는다(브라우저는 직접 못 읽는다 — 계좌·전화가 들어 있다)
REVOKE ALL ON public.partners, public.partner_payouts, public.partner_commissions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.partners, public.partner_payouts, public.partner_commissions TO service_role;

-- ───────── 2) 추천 코드 열 ─────────
-- 형식만 검사한다(승인 여부는 수수료 만들 때 본다).
ALTER TABLE public.reels_orders ADD COLUMN ref_code text
  CHECK (ref_code IS NULL OR ref_code ~ '^[a-z0-9]{4,16}$');
ALTER TABLE public.inquiries ADD COLUMN ref_code text
  CHECK (ref_code IS NULL OR ref_code ~ '^[a-z0-9]{4,16}$');
ALTER TABLE public.site_visits ADD COLUMN ref_code text
  CHECK (ref_code IS NULL OR ref_code ~ '^[a-z0-9]{4,16}$');
CREATE INDEX reels_orders_ref_code_idx ON public.reels_orders (ref_code) WHERE ref_code IS NOT NULL;
CREATE INDEX inquiries_ref_code_idx ON public.inquiries (ref_code, created_at DESC) WHERE ref_code IS NOT NULL;
CREATE INDEX site_visits_ref_code_idx ON public.site_visits (ref_code, created_at DESC) WHERE ref_code IS NOT NULL;

-- ───────── 3) 금액 도우미 ─────────
CREATE FUNCTION public.partner_commission_amount(_base integer, _rate numeric DEFAULT 0.10)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT floor(_base * _rate)::integer $$;

-- 원천징수: {income_tax, local_tax, withholding, net}
CREATE FUNCTION public.partner_withholding(_gross integer)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'income_tax', floor(_gross * 0.03)::integer,
    'local_tax', floor(_gross * 0.003)::integer,
    'withholding', floor(_gross * 0.03)::integer + floor(_gross * 0.003)::integer,
    'net', _gross - (floor(_gross * 0.03)::integer + floor(_gross * 0.003)::integer))
$$;

-- 결제 대기 정산 한 줄을 다시 계산(지급 완료는 건드리지 않음). 남은 수수료가 없으면 지운다.
CREATE FUNCTION public._partner_payout_recalc(_payout_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gross integer;
  w jsonb;
BEGIN
  IF _payout_id IS NULL THEN RETURN; END IF;
  SELECT coalesce(sum(amount), 0)::integer INTO v_gross
    FROM public.partner_commissions WHERE payout_id = _payout_id AND status IN ('payable', 'paid');
  IF v_gross = 0 THEN
    DELETE FROM public.partner_payouts WHERE id = _payout_id AND status = 'pending';
    RETURN;
  END IF;
  w := public.partner_withholding(v_gross);
  UPDATE public.partner_payouts
     SET gross = v_gross, income_tax = (w->>'income_tax')::integer, local_tax = (w->>'local_tax')::integer,
         withholding = (w->>'withholding')::integer, net = (w->>'net')::integer
   WHERE id = _payout_id AND status = 'pending';
END;
$$;

-- ───────── 4) 쇼츠 결제 → 수수료 트리거 ─────────
CREATE FUNCTION public._partner_reels_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_inherited boolean := false;
  p public.partners%ROWTYPE;
  v_status text := 'pending';
  v_note text;
  c record;
BEGIN
  IF NEW.status = 'paid'
     AND (OLD.status IS DISTINCT FROM 'paid' OR OLD.ref_code IS DISTINCT FROM NEW.ref_code) THEN
    -- 결제 완료(처음 paid 가 됐거나, paid 인 채로 추천 코드가 새로 붙었을 때)
    IF NEW.is_trial THEN
      RETURN NEW;  -- 첫 주문 체험은 수수료 없음
    END IF;
    v_code := NEW.ref_code;
    IF v_code IS NULL AND NEW.credit_trial_order_id IS NOT NULL THEN
      SELECT ref_code INTO v_code FROM public.reels_orders WHERE id = NEW.credit_trial_order_id;
      v_inherited := v_code IS NOT NULL;
    END IF;
    IF v_code IS NULL THEN RETURN NEW; END IF;

    SELECT * INTO p FROM public.partners WHERE code = v_code AND status = 'approved';
    IF NOT FOUND THEN RETURN NEW; END IF;  -- 승인 안 된(신청·거절·일시정지) 코드는 무시

    IF p.phone = NEW.phone OR lower(p.email) = lower(NEW.email) THEN
      v_status := 'cancelled';
      v_note := '자기 구매(파트너 휴대폰·이메일과 같음) — 수수료 없음';
    ELSIF v_inherited THEN
      v_note := '체험 주문의 추천 코드를 이어받음';
    END IF;

    INSERT INTO public.partner_commissions
      (partner_id, source, reels_order_id, base_amount, rate, amount, status, note, cancelled_at)
    VALUES
      (p.id, 'reels', NEW.id, NEW.amount, 0.10, public.partner_commission_amount(NEW.amount, 0.10),
       v_status, v_note, CASE WHEN v_status = 'cancelled' THEN now() END)
    ON CONFLICT (reels_order_id) DO NOTHING;

  ELSIF OLD.status = 'paid' AND NEW.status <> 'paid' THEN
    -- 결제 뒤 취소·환불
    FOR c IN SELECT id, status, payout_id FROM public.partner_commissions
              WHERE reels_order_id = NEW.id FOR UPDATE LOOP
      IF c.status IN ('pending', 'payable') THEN
        UPDATE public.partner_commissions
           SET status = 'cancelled', cancelled_at = now(), payout_id = NULL,
               note = left(concat_ws(' / ', note, '결제 취소·환불'), 2000)
         WHERE id = c.id;
        PERFORM public._partner_payout_recalc(c.payout_id);
      ELSIF c.status = 'paid' THEN
        UPDATE public.partner_commissions
           SET note = left(concat_ws(' / ', note, '지급 뒤 환불 — 다음 정산에서 차감 필요'), 2000)
         WHERE id = c.id AND position('지급 뒤 환불' IN coalesce(note, '')) = 0;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER partner_reels_commission
  AFTER UPDATE OF status, ref_code ON public.reels_orders
  FOR EACH ROW EXECUTE FUNCTION public._partner_reels_trg();

-- ───────── 5) 서버 함수 ─────────

-- 5.1 신청. 입력: {name, phone(숫자만), email, code?, channels, bank_name, bank_account, bank_holder, consent_version?}
CREATE FUNCTION public.partner_apply(_p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(coalesce(_p->>'name', ''));
  v_phone text := regexp_replace(coalesce(_p->>'phone', ''), '[^0-9]', '', 'g');
  v_email text := lower(btrim(coalesce(_p->>'email', '')));
  v_code text := lower(btrim(coalesce(_p->>'code', '')));
  v_channels text := btrim(coalesce(_p->>'channels', ''));
  v_bank text := btrim(coalesce(_p->>'bank_name', ''));
  v_account text := regexp_replace(btrim(coalesce(_p->>'bank_account', '')), '[[:space:]]', '', 'g');
  v_holder text := btrim(coalesce(_p->>'bank_holder', ''));
  v_consent text := coalesce(nullif(btrim(_p->>'consent_version'), ''), 'partner-2026-11-07');
  v_alpha text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_id uuid;
  i integer;
BEGIN
  IF _p IS NULL OR jsonb_typeof(_p) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF char_length(v_name) NOT BETWEEN 1 AND 50
     OR v_phone !~ '^01[016789][0-9]{7,8}$'
     OR char_length(v_email) NOT BETWEEN 3 AND 254
     OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     OR char_length(v_channels) > 1000
     OR char_length(v_bank) NOT BETWEEN 1 AND 30
     OR v_account !~ '^[0-9-]{6,30}$'
     OR char_length(v_holder) NOT BETWEEN 1 AND 30 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF EXISTS (SELECT 1 FROM public.partners WHERE phone = v_phone OR lower(email) = v_email) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate');
  END IF;

  IF v_code <> '' THEN
    IF v_code !~ '^[a-z0-9]{4,16}$' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;
    IF NOT public._partner_code_ok(v_code) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'code_reserved');
    END IF;
    IF EXISTS (SELECT 1 FROM public.partners WHERE code = v_code) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'code_taken');
    END IF;
  ELSE
    -- 자동 코드: 헷갈리는 글자(0·o·1·l·i) 뺀 6자
    FOR i IN 1..30 LOOP
      SELECT string_agg(substr(v_alpha, 1 + floor(random() * length(v_alpha))::integer, 1), '')
        INTO v_code FROM generate_series(1, 6);
      EXIT WHEN public._partner_code_ok(v_code)
            AND NOT EXISTS (SELECT 1 FROM public.partners WHERE code = v_code);
      v_code := '';
    END LOOP;
    IF v_code = '' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'code_taken');
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.partners
      (code, name, phone, email, channels, bank_name, bank_account, bank_holder, agreed_at, consent_version)
    VALUES
      (v_code, v_name, v_phone, v_email, v_channels, v_bank, v_account, v_holder, now(), left(v_consent, 100))
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- 동시에 같은 값으로 들어온 경우
    IF EXISTS (SELECT 1 FROM public.partners WHERE code = v_code) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'code_taken');
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate');
  END;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'code', v_code, 'name', v_name);
END;
$$;

-- 5.2 쇼츠 주문에 추천 코드 붙이기(결제 화면이 주문을 만든 직후 부른다).
--     주문 소유 확인: 주문번호 + 결제창 주소(주문 만든 사람만 받는다) + 휴대폰. 만든 지 30분 안·코드 비어 있을 때만.
CREATE FUNCTION public.partner_attach_reels(
  _order_no text, _payurl text, _phone text, _ref text, _now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.reels_orders%ROWTYPE;
  v_ref text := lower(btrim(coalesce(_ref, '')));
  v_phone text := regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g');
BEGIN
  IF v_ref !~ '^[a-z0-9]{4,16}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_ref');
  END IF;
  IF _order_no IS NULL OR _order_no !~ '^R[0-9]{6}-[0-9]{4,}$' OR coalesce(_payurl, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  SELECT * INTO o FROM public.reels_orders WHERE order_no = _order_no FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF o.payurl IS NULL OR o.payurl <> _payurl OR o.phone <> v_phone THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mismatch');
  END IF;
  IF o.created_at < _now - interval '30 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_old');
  END IF;
  IF o.ref_code IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already');
  END IF;
  IF o.status NOT IN ('pending', 'paid') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'closed');
  END IF;
  UPDATE public.reels_orders SET ref_code = v_ref, updated_at = now() WHERE id = o.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 5.3 쇼츠 수수료 pending → payable: 결제 뒤 7일(환불 기간)이 지났고 주문이 아직 결제 완료일 때
CREATE FUNCTION public.partner_refresh_payable(_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.partner_commissions c
     SET status = 'payable', payable_at = _now
    FROM public.reels_orders o
   WHERE c.status = 'pending' AND c.source = 'reels' AND o.id = c.reels_order_id
     AND o.status = 'paid' AND o.paid_at IS NOT NULL AND o.paid_at <= _now - interval '7 days';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- 5.4 승인·거절·일시정지·다시 승인. 승인 때 파트너 화면 열쇠(view_key)를 만든다(이미 있으면 그대로).
CREATE FUNCTION public.partner_set_status(_id uuid, _status text, _now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.partners%ROWTYPE;
BEGIN
  IF _status IS NULL OR _status NOT IN ('approved', 'rejected', 'paused') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_status');
  END IF;
  SELECT * INTO p FROM public.partners WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF _status = 'paused' AND p.status <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_approved');
  END IF;
  UPDATE public.partners
     SET status = _status,
         approved_at = CASE WHEN _status = 'approved' THEN coalesce(approved_at, _now) ELSE approved_at END,
         view_key = CASE WHEN _status = 'approved' AND view_key IS NULL
                         THEN replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
                         ELSE view_key END,
         updated_at = now()
   WHERE id = _id
  RETURNING * INTO p;
  RETURN jsonb_build_object('ok', true, 'status', p.status, 'code', p.code, 'view_key', p.view_key);
END;
$$;

-- 5.5 상담(홈페이지·랜딩·AI 개발) 계약 결제됨 → 수수료(payable)
CREATE FUNCTION public.partner_inquiry_paid(_inquiry_id uuid, _amount integer, _now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text;
  p public.partners%ROWTYPE;
  v_id uuid;
  v_amt integer;
BEGIN
  IF _amount IS NULL OR _amount < 1000 OR _amount > 1000000000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_amount');
  END IF;
  SELECT ref_code INTO v_ref FROM public.inquiries WHERE id = _inquiry_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_ref IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_ref');
  END IF;
  SELECT * INTO p FROM public.partners WHERE code = v_ref;
  IF NOT FOUND OR p.status <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'partner_not_approved');
  END IF;
  IF EXISTS (SELECT 1 FROM public.partner_commissions WHERE inquiry_id = _inquiry_id AND status <> 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate');
  END IF;
  v_amt := public.partner_commission_amount(_amount, 0.10);
  BEGIN
    INSERT INTO public.partner_commissions
      (partner_id, source, inquiry_id, base_amount, rate, amount, status, payable_at, note)
    VALUES (p.id, 'inquiry', _inquiry_id, _amount, 0.10, v_amt, 'payable', _now, '상담 계약 결제됨(대표님 입력)')
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate');
  END;
  RETURN jsonb_build_object('ok', true, 'commission_id', v_id, 'amount', v_amt);
END;
$$;

-- 5.6 대표님이 수수료 한 줄 취소(잘못 넣은 계약 금액 등). 지급 완료는 취소하지 않는다.
CREATE FUNCTION public.partner_commission_cancel(_id uuid, _note text DEFAULT NULL, _now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.partner_commissions%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.partner_commissions WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF c.status NOT IN ('pending', 'payable') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_cancellable');
  END IF;
  UPDATE public.partner_commissions
     SET status = 'cancelled', cancelled_at = _now, payout_id = NULL,
         note = left(concat_ws(' / ', note, coalesce(nullif(btrim(_note), ''), '대표님 취소')), 2000)
   WHERE id = _id;
  PERFORM public._partner_payout_recalc(c.payout_id);
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 5.7 「이번 달 정산 만들기」: 정산에 아직 안 묶인 payable 수수료를 파트너별로 그 달 정산에 묶는다.
--     같은 달 정산이 이미 있으면(지급 전) 더해서 다시 계산, 이미 지급 완료면 건드리지 않는다(다음 달로).
CREATE FUNCTION public.partner_make_payouts(_month text, _now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_id uuid;
  v_status text;
  v_created integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
BEGIN
  IF _month IS NULL OR _month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_month');
  END IF;
  PERFORM public.partner_refresh_payable(_now);

  FOR r IN SELECT DISTINCT partner_id FROM public.partner_commissions
            WHERE status = 'payable' AND payout_id IS NULL ORDER BY partner_id LOOP
    v_id := NULL; v_status := NULL;
    SELECT id, status INTO v_id, v_status FROM public.partner_payouts
     WHERE partner_id = r.partner_id AND month = _month FOR UPDATE;
    IF v_status = 'paid' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    IF v_id IS NULL THEN
      INSERT INTO public.partner_payouts (partner_id, month, created_at) VALUES (r.partner_id, _month, _now)
      RETURNING id INTO v_id;
      v_created := v_created + 1;
    ELSE
      v_updated := v_updated + 1;
    END IF;
    UPDATE public.partner_commissions SET payout_id = v_id
     WHERE partner_id = r.partner_id AND status = 'payable' AND payout_id IS NULL;
    PERFORM public._partner_payout_recalc(v_id);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'partners', v_created + v_updated, 'created', v_created,
                            'updated', v_updated, 'skipped_paid', v_skipped);
END;
$$;

-- 5.8 「지급 완료」: 정산과 거기 묶인 수수료를 paid 로
CREATE FUNCTION public.partner_payout_mark_paid(_id uuid, _now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.partner_payouts WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_status = 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_paid');
  END IF;
  UPDATE public.partner_payouts SET status = 'paid', paid_at = _now WHERE id = _id;
  UPDATE public.partner_commissions SET status = 'paid', paid_at = _now
   WHERE payout_id = _id AND status = 'payable';
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 5.9 관리자 화면 한 번에: 파트너(통계 포함)·추천 붙은 상담·수수료 원장(최근 300)·정산(최근 200)
CREATE FUNCTION public.partner_admin_overview(_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partners jsonb;
  v_inq jsonb;
  v_comm jsonb;
  v_pay jsonb;
BEGIN
  PERFORM public.partner_refresh_payable(_now);

  SELECT coalesce(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_partners FROM (
    SELECT p.id, p.code, p.status, p.name, p.phone, p.email, p.channels, p.bank_name, p.bank_account, p.bank_holder,
           p.created_at, p.approved_at, p.view_key, p.memo,
           (SELECT count(DISTINCT v.visitor_id) FROM public.site_visits v
             WHERE v.ref_code = p.code AND v.created_at >= _now - interval '30 days') AS visits_30d,
           (SELECT count(*) FROM public.inquiries i WHERE i.ref_code = p.code) AS inquiries,
           (SELECT count(*) FROM public.partner_commissions c
             WHERE c.partner_id = p.id AND c.status <> 'cancelled') AS paid_count,
           (SELECT coalesce(sum(c.amount), 0) FROM public.partner_commissions c
             WHERE c.partner_id = p.id AND c.status = 'pending') AS sum_pending,
           (SELECT coalesce(sum(c.amount), 0) FROM public.partner_commissions c
             WHERE c.partner_id = p.id AND c.status = 'payable') AS sum_payable,
           (SELECT coalesce(sum(c.amount), 0) FROM public.partner_commissions c
             WHERE c.partner_id = p.id AND c.status = 'paid') AS sum_paid
      FROM public.partners p
  ) x;

  SELECT coalesce(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_inq FROM (
    SELECT i.id, i.created_at, i.name, i.services, i.ref_code,
           p.name AS partner_name, p.status AS partner_status,
           c.id AS commission_id, c.base_amount, c.amount AS commission, c.status AS commission_status
      FROM public.inquiries i
      LEFT JOIN public.partners p ON p.code = i.ref_code
      LEFT JOIN LATERAL (
        SELECT * FROM public.partner_commissions pc
         WHERE pc.inquiry_id = i.id AND pc.status <> 'cancelled' ORDER BY pc.created_at DESC LIMIT 1
      ) c ON true
     WHERE i.ref_code IS NOT NULL
     ORDER BY i.created_at DESC
     LIMIT 200
  ) x;

  SELECT coalesce(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_comm FROM (
    SELECT c.id, c.created_at, c.source, c.base_amount, c.rate, c.amount, c.status, c.note,
           c.payable_at, c.paid_at, c.payout_id, p.code, p.name AS partner_name,
           o.order_no, o.plan, i.name AS inquiry_name
      FROM public.partner_commissions c
      JOIN public.partners p ON p.id = c.partner_id
      LEFT JOIN public.reels_orders o ON o.id = c.reels_order_id
      LEFT JOIN public.inquiries i ON i.id = c.inquiry_id
     ORDER BY c.created_at DESC
     LIMIT 300
  ) x;

  SELECT coalesce(jsonb_agg(x ORDER BY x.month DESC, x.partner_name), '[]'::jsonb) INTO v_pay FROM (
    SELECT y.id, y.month, y.gross, y.income_tax, y.local_tax, y.withholding, y.net, y.status, y.created_at, y.paid_at,
           p.code, p.name AS partner_name, p.bank_name, p.bank_account, p.bank_holder,
           (SELECT count(*) FROM public.partner_commissions c WHERE c.payout_id = y.id) AS items
      FROM public.partner_payouts y
      JOIN public.partners p ON p.id = y.partner_id
     ORDER BY y.month DESC
     LIMIT 200
  ) x;

  RETURN jsonb_build_object('partners', v_partners, 'inquiries', v_inq, 'commissions', v_comm, 'payouts', v_pay);
END;
$$;

-- 5.10 파트너 화면(/partner/me?k=…). 신청 중·거절이면 null. 계좌는 끝 4자리만, 손님 정보는 내보내지 않는다.
CREATE FUNCTION public.partner_me(_view_key text, _now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.partners%ROWTYPE;
  v_digits text;
  v_recent jsonb;
  v_months jsonb;
BEGIN
  IF _view_key IS NULL OR _view_key !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO p FROM public.partners WHERE view_key = _view_key AND status IN ('approved', 'paused');
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM public.partner_refresh_payable(_now);
  v_digits := regexp_replace(p.bank_account, '[^0-9]', '', 'g');

  SELECT coalesce(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_recent FROM (
    SELECT c.created_at, c.source, c.base_amount, c.amount, c.status,
           CASE WHEN c.source = 'reels' THEN o.plan END AS plan
      FROM public.partner_commissions c
      LEFT JOIN public.reels_orders o ON o.id = c.reels_order_id
     WHERE c.partner_id = p.id
     ORDER BY c.created_at DESC
     LIMIT 50
  ) x;

  SELECT coalesce(jsonb_agg(x ORDER BY x.month DESC), '[]'::jsonb) INTO v_months FROM (
    SELECT y.month, y.gross, y.income_tax, y.local_tax, y.withholding, y.net, y.status, y.paid_at
      FROM public.partner_payouts y WHERE y.partner_id = p.id
     ORDER BY y.month DESC LIMIT 36
  ) x;

  RETURN jsonb_build_object(
    'name', p.name, 'code', p.code, 'status', p.status,
    'bank_name', p.bank_name, 'bank_last4', right(v_digits, 4),
    'visits_30d', (SELECT count(DISTINCT v.visitor_id) FROM public.site_visits v
                    WHERE v.ref_code = p.code AND v.created_at >= _now - interval '30 days'),
    'inquiries', (SELECT count(*) FROM public.inquiries i WHERE i.ref_code = p.code),
    'paid_count', (SELECT count(*) FROM public.partner_commissions c
                    WHERE c.partner_id = p.id AND c.status <> 'cancelled'),
    'sum_pending', (SELECT coalesce(sum(amount), 0) FROM public.partner_commissions
                     WHERE partner_id = p.id AND status = 'pending'),
    'sum_payable', (SELECT coalesce(sum(amount), 0) FROM public.partner_commissions
                     WHERE partner_id = p.id AND status = 'payable'),
    'sum_paid', (SELECT coalesce(sum(amount), 0) FROM public.partner_commissions
                  WHERE partner_id = p.id AND status = 'paid'),
    'recent', v_recent,
    'months', v_months);
END;
$$;

-- ───────── 6) 실행 권한 ─────────
REVOKE EXECUTE ON FUNCTION public._partner_code_ok(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_commission_amount(integer, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_withholding(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._partner_payout_recalc(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public._partner_reels_trg() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.partner_apply(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_attach_reels(text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_refresh_payable(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_set_status(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_inquiry_paid(uuid, integer, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_commission_cancel(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_make_payouts(text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_payout_mark_paid(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_admin_overview(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_me(text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._partner_code_ok(text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_commission_amount(integer, numeric) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_withholding(integer) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_apply(jsonb) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_attach_reels(text, text, text, text, timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_refresh_payable(timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_set_status(uuid, text, timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_inquiry_paid(uuid, integer, timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_commission_cancel(uuid, text, timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_make_payouts(text, timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_payout_mark_paid(uuid, timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_admin_overview(timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_me(text, timestamptz) TO service_role;
