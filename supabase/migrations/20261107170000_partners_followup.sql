-- 추천인(파트너) 후속 — 11/7 대표님 결정 3가지(20261107160000_partners.sql 다음에 적용)
--
-- 1) 미승인 신청 6개월 뒤 삭제(개인정보 보관 기간 문구 「승인되지 않은 신청은 6개월 안에 지웁니다」를 실제로)
--    partner_cleanup_unapproved(_now) — status 가 applied·rejected 이고 created_at 이 6개월 지났고
--    수수료·정산 기록이 하나도 없는 partners 행만 지운다. pg_cron 매일 04:10(한국 시간, UTC 19:10).
--
-- 2) 승인 안내 메일 기록 — 메일은 서버(/api/admin/partners → 지메일 API)가 보내고, 결과만 여기 적는다.
--    partners.approval_mail_sent_at(마지막 성공 시각) · approval_mail_error(마지막 실패 사유, 성공하면 비움)
--    partner_approval_mail_target(_id)            → {ok:true, name, email, code, view_key} | {ok:false, reason:'not_found'|'not_approved'}
--    partner_approval_mail_result(_id, _error, _now) → {ok:true} | {ok:false, reason:'not_found'}  (_error NULL = 성공)
--
-- 3) 지급 뒤 환불·계약 취소 → 다음 정산에서 자동 차감
--    이미 paid 인 수수료의 쇼츠 주문이 취소·환불되면(트리거) 또는 대표님이 paid 인 수수료를 취소하면(partner_commission_cancel)
--    같은 파트너에게 음수 수수료 한 줄을 넣는다:
--      amount = −원래 수수료, base_amount = −원래 결제액, status 'payable', reels_order_id NULL,
--      reversal_of = 원래 수수료 id(UNIQUE — 환불 통보가 두 번 와도 한 줄)
--    정산 만들기(partner_make_payouts)는 파트너별 payable 합계(음수 포함)로 계산하고,
--    합계(같은 달 지급 전 정산이 있으면 그 금액 포함)가 0 이하면 그 달 정산을 만들지 않는다(행은 payable 그대로 → 다음 달로 이월).
--    원천징수는 양수 합계에만(partner_withholding 은 0 이하를 0으로 본다).
--
-- 함수 계약 변화
--   partner_commission_cancel: pending·payable → cancelled(그대로) / paid → 음수 한 줄 {ok:true, reversed:true, reversal_id}
--                              실패 reason 추가: 'already_reversed'(이미 차감 줄 있음) · 'is_reversal'(차감 줄은 취소 불가)
--   partner_make_payouts: 결과에 carried(합계 0 이하라 이월한 파트너 수) 추가
--   partner_admin_overview: partners 에 approval_mail_sent_at·approval_mail_error,
--                           commissions 에 reversal_of·inquiry_id·reversed, inquiries 에 reversed
--   partner_me: recent 에 is_reversal. paid_count 는 차감 줄을 세지 않는다.
--
-- 시험: supabase/tests/partners_followup.test.sql (deno run -A supabase/tests/run-sql-tests.ts)

-- ───────── 1) 열·제약 ─────────
ALTER TABLE public.partners
  ADD COLUMN approval_mail_sent_at timestamptz,
  ADD COLUMN approval_mail_error text CHECK (approval_mail_error IS NULL OR char_length(approval_mail_error) <= 500);

ALTER TABLE public.partner_commissions
  ADD COLUMN reversal_of uuid UNIQUE REFERENCES public.partner_commissions(id) ON DELETE RESTRICT;

-- 금액 제약: 보통 줄은 0 이상·10% 내림, 차감 줄은 원래 줄의 정확한 음수(−floor(결제액 × 비율))
ALTER TABLE public.partner_commissions DROP CONSTRAINT IF EXISTS partner_commissions_base_amount_check;
ALTER TABLE public.partner_commissions DROP CONSTRAINT IF EXISTS partner_commissions_amount_check;
ALTER TABLE public.partner_commissions DROP CONSTRAINT IF EXISTS partner_commissions_amount_rule;
ALTER TABLE public.partner_commissions ADD CONSTRAINT partner_commissions_amount_rule CHECK (
  (reversal_of IS NULL AND base_amount >= 0 AND amount >= 0 AND amount = floor(base_amount * rate)::integer)
  OR
  (reversal_of IS NOT NULL AND base_amount <= 0 AND amount <= 0 AND reels_order_id IS NULL
   AND amount = -floor(-base_amount * rate)::integer)
);

-- 상담 한 건에 살아 있는 수수료는 하나 — 차감 줄(같은 inquiry_id)은 세지 않는다
DROP INDEX IF EXISTS public.partner_commissions_inquiry_key;
CREATE UNIQUE INDEX partner_commissions_inquiry_key ON public.partner_commissions (inquiry_id)
  WHERE inquiry_id IS NOT NULL AND status <> 'cancelled' AND reversal_of IS NULL;

-- ───────── 2) 원천징수: 0 이하면 0 ─────────
CREATE OR REPLACE FUNCTION public.partner_withholding(_gross integer)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'income_tax', floor(greatest(_gross, 0) * 0.03)::integer,
    'local_tax', floor(greatest(_gross, 0) * 0.003)::integer,
    'withholding', floor(greatest(_gross, 0) * 0.03)::integer + floor(greatest(_gross, 0) * 0.003)::integer,
    'net', _gross - (floor(greatest(_gross, 0) * 0.03)::integer + floor(greatest(_gross, 0) * 0.003)::integer))
$$;

-- 결제 대기 정산 다시 계산. 합계가 0 이하가 되면 정산을 지운다(묶인 줄은 FK 로 payout_id NULL → 다음 달로).
CREATE OR REPLACE FUNCTION public._partner_payout_recalc(_payout_id uuid)
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
  IF v_gross <= 0 THEN
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

-- ───────── 3) 차감 줄 만들기(내부) ─────────
-- 지급 완료(paid) 수수료 한 줄의 음수 줄을 넣는다. 이미 있으면 NULL(아무것도 안 함).
CREATE FUNCTION public._partner_commission_reverse(_id uuid, _note text, _now timestamptz DEFAULT now())
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.partner_commissions%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO c FROM public.partner_commissions WHERE id = _id;
  IF NOT FOUND OR c.status <> 'paid' OR c.reversal_of IS NOT NULL THEN RETURN NULL; END IF;
  INSERT INTO public.partner_commissions
    (partner_id, source, reels_order_id, inquiry_id, base_amount, rate, amount, status, payable_at, note, reversal_of, created_at)
  VALUES
    (c.partner_id, c.source, NULL, c.inquiry_id, -c.base_amount, c.rate, -c.amount, 'payable', _now,
     left(_note, 2000), c.id, _now)
  ON CONFLICT (reversal_of) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN
    UPDATE public.partner_commissions
       SET note = left(concat_ws(' / ', note, '지급 뒤 취소 — 다음 정산에서 차감'), 2000)
     WHERE id = c.id;
  END IF;
  RETURN v_id;
END;
$$;

-- ───────── 4) 쇼츠 결제 트리거: 지급 뒤 환불 → 차감 줄 ─────────
CREATE OR REPLACE FUNCTION public._partner_reels_trg()
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
        -- 이미 지급됨 → 같은 파트너에게 음수 한 줄(다음 정산에서 빠진다). reversal_of UNIQUE 라 두 번 와도 한 줄.
        PERFORM public._partner_commission_reverse(c.id, '지급 뒤 환불 차감: 주문 ' || NEW.order_no, now());
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- ───────── 5) 대표님 취소: 지급 전 → cancelled / 지급 뒤 → 차감 줄 ─────────
CREATE OR REPLACE FUNCTION public.partner_commission_cancel(_id uuid, _note text DEFAULT NULL, _now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.partner_commissions%ROWTYPE;
  v_order text;
  v_rev uuid;
  v_why text := nullif(btrim(coalesce(_note, '')), '');
BEGIN
  SELECT * INTO c FROM public.partner_commissions WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF c.reversal_of IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'is_reversal');
  END IF;
  IF c.status = 'paid' THEN
    IF EXISTS (SELECT 1 FROM public.partner_commissions WHERE reversal_of = c.id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_reversed');
    END IF;
    IF c.source = 'reels' THEN
      SELECT order_no INTO v_order FROM public.reels_orders WHERE id = c.reels_order_id;
      v_rev := public._partner_commission_reverse(c.id,
        concat_ws(' — ', '지급 뒤 취소 차감: 주문 ' || coalesce(v_order, '?'), v_why), _now);
    ELSE
      v_rev := public._partner_commission_reverse(c.id, concat_ws(' — ', '지급 뒤 계약 취소 차감', v_why), _now);
    END IF;
    IF v_rev IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_reversed');
    END IF;
    RETURN jsonb_build_object('ok', true, 'reversed', true, 'reversal_id', v_rev);
  END IF;
  IF c.status NOT IN ('pending', 'payable') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_cancellable');
  END IF;
  UPDATE public.partner_commissions
     SET status = 'cancelled', cancelled_at = _now, payout_id = NULL,
         note = left(concat_ws(' / ', note, coalesce(v_why, '대표님 취소')), 2000)
   WHERE id = _id;
  PERFORM public._partner_payout_recalc(c.payout_id);
  RETURN jsonb_build_object('ok', true, 'reversed', false);
END;
$$;

-- ───────── 6) 정산 만들기: 순액(음수 포함), 0 이하면 이월 ─────────
CREATE OR REPLACE FUNCTION public.partner_make_payouts(_month text, _now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_id uuid;
  v_status text;
  v_gross integer;
  v_created integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_carried integer := 0;
BEGIN
  IF _month IS NULL OR _month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_month');
  END IF;
  PERFORM public.partner_refresh_payable(_now);

  FOR r IN SELECT partner_id, sum(amount)::integer AS s FROM public.partner_commissions
            WHERE status = 'payable' AND payout_id IS NULL
            GROUP BY partner_id ORDER BY partner_id LOOP
    v_id := NULL; v_status := NULL; v_gross := NULL;
    SELECT id, status, gross INTO v_id, v_status, v_gross FROM public.partner_payouts
     WHERE partner_id = r.partner_id AND month = _month FOR UPDATE;
    IF v_status = 'paid' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    IF coalesce(v_gross, 0) + r.s <= 0 THEN
      -- 지급 뒤 환불 차감이 더 커서 줄 돈이 없다 → 정산 안 만듦, 줄은 payable 그대로 다음 달로
      v_carried := v_carried + 1;
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
                            'updated', v_updated, 'skipped_paid', v_skipped, 'carried', v_carried);
END;
$$;

-- ───────── 7) 승인 안내 메일 대상·결과 기록 ─────────
CREATE FUNCTION public.partner_approval_mail_target(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.partners%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.partners WHERE id = _id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF p.status <> 'approved' OR p.view_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_approved');
  END IF;
  RETURN jsonb_build_object('ok', true, 'name', p.name, 'email', p.email, 'code', p.code, 'view_key', p.view_key);
END;
$$;

-- _error NULL = 보냄(시각 적고 오류 지움) / 값 있음 = 실패(사유만 적고 마지막 성공 시각은 그대로)
CREATE FUNCTION public.partner_approval_mail_result(_id uuid, _error text DEFAULT NULL, _now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_err text := nullif(left(btrim(coalesce(_error, '')), 500), '');
BEGIN
  UPDATE public.partners
     SET approval_mail_sent_at = CASE WHEN v_err IS NULL THEN _now ELSE approval_mail_sent_at END,
         approval_mail_error = v_err,
         updated_at = now()
   WHERE id = _id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ───────── 8) 화면 묶음: 메일 기록·차감 줄 표시 ─────────
CREATE OR REPLACE FUNCTION public.partner_admin_overview(_now timestamptz DEFAULT now())
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
           p.created_at, p.approved_at, p.view_key, p.memo, p.approval_mail_sent_at, p.approval_mail_error,
           (SELECT count(DISTINCT v.visitor_id) FROM public.site_visits v
             WHERE v.ref_code = p.code AND v.created_at >= _now - interval '30 days') AS visits_30d,
           (SELECT count(*) FROM public.inquiries i WHERE i.ref_code = p.code) AS inquiries,
           (SELECT count(*) FROM public.partner_commissions c
             WHERE c.partner_id = p.id AND c.status <> 'cancelled' AND c.reversal_of IS NULL) AS paid_count,
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
           c.id AS commission_id, c.base_amount, c.amount AS commission, c.status AS commission_status,
           (c.id IS NOT NULL AND EXISTS (SELECT 1 FROM public.partner_commissions rv WHERE rv.reversal_of = c.id)) AS reversed
      FROM public.inquiries i
      LEFT JOIN public.partners p ON p.code = i.ref_code
      LEFT JOIN LATERAL (
        SELECT * FROM public.partner_commissions pc
         WHERE pc.inquiry_id = i.id AND pc.status <> 'cancelled' AND pc.reversal_of IS NULL
         ORDER BY pc.created_at DESC LIMIT 1
      ) c ON true
     WHERE i.ref_code IS NOT NULL
     ORDER BY i.created_at DESC
     LIMIT 200
  ) x;

  SELECT coalesce(jsonb_agg(x ORDER BY x.created_at DESC), '[]'::jsonb) INTO v_comm FROM (
    SELECT c.id, c.created_at, c.source, c.base_amount, c.rate, c.amount, c.status, c.note,
           c.payable_at, c.paid_at, c.payout_id, c.reversal_of, c.inquiry_id,
           EXISTS (SELECT 1 FROM public.partner_commissions rv WHERE rv.reversal_of = c.id) AS reversed,
           p.code, p.name AS partner_name,
           o.order_no, o.plan, i.name AS inquiry_name
      FROM public.partner_commissions c
      JOIN public.partners p ON p.id = c.partner_id
      LEFT JOIN public.partner_commissions orig ON orig.id = c.reversal_of
      LEFT JOIN public.reels_orders o ON o.id = coalesce(c.reels_order_id, orig.reels_order_id)
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

CREATE OR REPLACE FUNCTION public.partner_me(_view_key text, _now timestamptz DEFAULT now())
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
           CASE WHEN c.source = 'reels' THEN o.plan END AS plan,
           (c.reversal_of IS NOT NULL) AS is_reversal
      FROM public.partner_commissions c
      LEFT JOIN public.partner_commissions orig ON orig.id = c.reversal_of
      LEFT JOIN public.reels_orders o ON o.id = coalesce(c.reels_order_id, orig.reels_order_id)
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
                    WHERE c.partner_id = p.id AND c.status <> 'cancelled' AND c.reversal_of IS NULL),
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

-- ───────── 9) 미승인 신청 6개월 뒤 삭제 ─────────
CREATE FUNCTION public.partner_cleanup_unapproved(_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  DELETE FROM public.partners p
   WHERE p.status IN ('applied', 'rejected')
     AND p.created_at < _now - interval '6 months'
     AND NOT EXISTS (SELECT 1 FROM public.partner_commissions c WHERE c.partner_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM public.partner_payouts y WHERE y.partner_id = p.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ───────── 10) 실행 권한 ─────────
REVOKE EXECUTE ON FUNCTION public._partner_commission_reverse(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.partner_approval_mail_target(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_approval_mail_result(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.partner_cleanup_unapproved(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.partner_approval_mail_target(uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_approval_mail_result(uuid, text, timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.partner_cleanup_unapproved(timestamptz) TO service_role;
-- CREATE OR REPLACE 는 기존 권한을 그대로 둔다(위 함수들은 20261107160000 에서 이미 막아 둠).

-- ───────── 11) 매일 04:10(한국 시간) 미승인 신청 정리 ─────────
-- pg_cron 은 UTC 로 돈다 → 19:10 UTC = 다음 날 04:10 KST
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'partner-cleanup-unapproved';
  PERFORM cron.schedule(
    'partner-cleanup-unapproved',
    '10 19 * * *',
    $c$SELECT public.partner_cleanup_unapproved(now())$c$
  );
END $$;
