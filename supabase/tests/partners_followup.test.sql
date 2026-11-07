-- 추천인(파트너) 후속 마이그레이션(20261107170000_partners_followup.sql) SQL 시험
--
-- 실행: deno run -A supabase/tests/run-sql-tests.ts  (메모리 Postgres, 운영 DB 에 연결하지 않음)
-- 규칙: 블록마다 성공하면 RAISE NOTICE 'PASS …', 틀리면 RAISE EXCEPTION 'FAIL …'.
-- 앞 partners.test.sql 은 ROLLBACK 으로 끝나므로 여기는 빈 표에서 시작한다.

BEGIN;
SET LOCAL TimeZone = 'UTC';
UPDATE public.reels_settings SET enabled = true;

-- ───────── 시험 도우미(partners.test.sql 과 같은 것) ─────────
CREATE FUNCTION pg_temp.kh(_k text) RETURNS text LANGUAGE sql AS
$$ SELECT encode(sha256(convert_to(_k, 'UTF8')), 'hex') $$;

CREATE FUNCTION pg_temp.mk(_plan int, _lp int, _disc int, _trial boolean, _credit uuid, _insta text, _phone text, _mul text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE r jsonb; v uuid;
BEGIN
  r := public.reels_create_order(jsonb_build_object(
    'plan', _plan, 'list_price', _lp, 'discount', _disc, 'amount', _lp - _disc, 'is_trial', _trial,
    'credit_trial_order_id', _credit, 'shop_name', '시험 가게 ' || _insta, 'insta_id', _insta, 'phone', _phone,
    'email', _insta || '@example.com', 'method', 'send_materials', 'view_key_hash', pg_temp.kh('k' || _mul),
    'consent_version', 'reels-2026-11-06'));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL 준비 주문 실패: %', r; END IF;
  v := (r->>'order_id')::uuid;
  PERFORM public.reels_mark_requested(v, _mul, 'https://payapp.kr/p/' || _mul, NULL);
  RETURN v;
END $$;

CREATE FUNCTION pg_temp.ev(_p jsonb) RETURNS jsonb LANGUAGE sql AS
$$ SELECT public.reels_apply_event(public.reels_record_event(_p, 'feedback', true, NULL)) $$;

CREATE FUNCTION pg_temp.pay(_order uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.ev(jsonb_build_object('pay_state', '4', 'var1', _order::text, 'var2', 'reels',
    'mul_no', (SELECT mul_no FROM public.reels_orders WHERE id = _order),
    'price', (SELECT amount::text FROM public.reels_orders WHERE id = _order)))
$$;

CREATE FUNCTION pg_temp.refund(_order uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.ev(jsonb_build_object('pay_state', '9', 'var1', _order::text, 'var2', 'reels',
    'mul_no', (SELECT mul_no FROM public.reels_orders WHERE id = _order)))
$$;

CREATE FUNCTION pg_temp.attach(_order uuid, _ref text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.partner_attach_reels(o.order_no, o.payurl, o.phone, _ref) FROM public.reels_orders o WHERE o.id = _order
$$;

-- 신청 + 승인 → partner id
CREATE FUNCTION pg_temp.partner(_name text, _phone text, _code text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE r jsonb; v uuid;
BEGIN
  r := public.partner_apply(jsonb_build_object(
    'name', _name, 'phone', _phone, 'email', _code || '@partner.example.com', 'code', _code, 'channels', 'https://instagram.com/x',
    'bank_name', '국민은행', 'bank_account', '123456-01-987654', 'bank_holder', _name));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL 준비 신청 실패: %', r; END IF;
  v := (r->>'id')::uuid;
  PERFORM public.partner_set_status(v, 'approved');
  RETURN v;
END $$;

-- 추천 붙은 상담 하나 + 결제됨 → commission id
CREATE FUNCTION pg_temp.inq(_code text, _amount int) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE i uuid := gen_random_uuid(); r jsonb;
BEGIN
  INSERT INTO public.inquiries (id, name, contact, ref_code) VALUES (i, '상담 ' || _amount, '010-0000-0000', _code);
  r := public.partner_inquiry_paid(i, _amount);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL 준비 상담 결제됨 실패: %', r; END IF;
  RETURN (r->>'commission_id')::uuid;
END $$;

-- ───────── 1) 구조 ─────────
DO $$
DECLARE f text; j record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners'
                  AND column_name = 'approval_mail_sent_at')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners'
                  AND column_name = 'approval_mail_error')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                  AND table_name = 'partner_commissions' AND column_name = 'reversal_of') THEN
    RAISE EXCEPTION 'FAIL 새 열 없음';
  END IF;
  FOREACH f IN ARRAY ARRAY['public.partner_approval_mail_target(uuid)',
                            'public.partner_approval_mail_result(uuid, text, timestamptz)',
                            'public.partner_cleanup_unapproved(timestamptz)'] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL anon/authenticated 가 함수를 부를 수 있음: %', f;
    END IF;
    IF NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL service_role 이 함수를 못 부름: %', f;
    END IF;
  END LOOP;
  IF has_function_privilege('service_role', 'public._partner_commission_reverse(uuid, text, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 내부 차감 함수는 서버도 직접 못 불러야 함';
  END IF;
  SELECT * INTO j FROM cron.job WHERE jobname = 'partner-cleanup-unapproved';
  IF NOT FOUND OR j.schedule <> '10 19 * * *' OR position('partner_cleanup_unapproved' IN j.command) = 0 THEN
    RAISE EXCEPTION 'FAIL 매일 정리 예약: %', row_to_json(j);
  END IF;
  -- 보통 줄에 음수는 안 들어간다
  BEGIN
    INSERT INTO public.partner_commissions (partner_id, source, base_amount, amount, status)
    VALUES (gen_random_uuid(), 'inquiry', -1000, -100, 'payable');
    RAISE EXCEPTION 'FAIL 차감 표시 없는 음수 줄이 들어감';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS 구조: 새 열 3개·함수 권한·매일 19:10 UTC(04:10 KST) 예약·차감 아닌 음수 거절';
END $$;

-- ───────── 2) 지급 뒤 환불 → 음수 한 줄(환불 통보 두 번에도 한 줄) ─────────
DO $$
DECLARE pa uuid; o uuid; c public.partner_commissions%ROWTYPE; rv public.partner_commissions%ROWTYPE; y uuid; v_no text;
BEGIN
  pa := pg_temp.partner('이환불', '01031110001', 'refundp');
  o := pg_temp.mk(1, 200000, 0, false, NULL, 'shop_ra', '01040000001', 'RA1');
  PERFORM pg_temp.attach(o, 'refundp');
  PERFORM pg_temp.pay(o);
  PERFORM public.partner_make_payouts('2026-11', now() + interval '8 days');
  SELECT id INTO y FROM public.partner_payouts WHERE partner_id = pa AND month = '2026-11';
  PERFORM public.partner_payout_mark_paid(y, now() + interval '9 days');
  SELECT * INTO c FROM public.partner_commissions WHERE reels_order_id = o;
  IF c.status <> 'paid' OR c.amount <> 20000 THEN RAISE EXCEPTION 'FAIL 준비: 20,000 지급 완료 %', row_to_json(c); END IF;

  PERFORM pg_temp.refund(o);
  PERFORM pg_temp.refund(o);
  -- 같은 상태로 한 번 더 덮어써도(취소 → 취소) 늘지 않는다
  UPDATE public.reels_orders SET status = 'cancelled' WHERE id = o;
  IF (SELECT count(*) FROM public.partner_commissions WHERE reversal_of = c.id) <> 1 THEN
    RAISE EXCEPTION 'FAIL 차감 줄은 정확히 1개(%)', (SELECT count(*) FROM public.partner_commissions WHERE reversal_of = c.id);
  END IF;
  SELECT order_no INTO v_no FROM public.reels_orders WHERE id = o;
  SELECT * INTO rv FROM public.partner_commissions WHERE reversal_of = c.id;
  IF rv.partner_id <> pa OR rv.amount <> -20000 OR rv.base_amount <> -200000 OR rv.status <> 'payable'
     OR rv.reels_order_id IS NOT NULL OR rv.payout_id IS NOT NULL OR rv.source <> 'reels'
     OR rv.note <> '지급 뒤 환불 차감: 주문 ' || v_no THEN
    RAISE EXCEPTION 'FAIL 차감 줄 내용: %', row_to_json(rv);
  END IF;
  IF (SELECT status FROM public.partner_commissions WHERE id = c.id) <> 'paid' THEN
    RAISE EXCEPTION 'FAIL 원래 줄은 paid 그대로';
  END IF;
  IF (SELECT gross FROM public.partner_payouts WHERE id = y) <> 20000 THEN
    RAISE EXCEPTION 'FAIL 지급 완료된 정산은 그대로';
  END IF;
  RAISE NOTICE 'PASS 지급 뒤 환불: −20,000 payable 한 줄(통보 두 번·덮어쓰기에도 1개), 원래 줄·지급 정산 그대로';
END $$;

-- ───────── 3) 다음 달 정산은 순액, 원천징수는 순액에 ─────────
DO $$
DECLARE pa uuid; o uuid; y public.partner_payouts%ROWTYPE; r jsonb;
BEGIN
  SELECT id INTO pa FROM public.partners WHERE code = 'refundp';
  o := pg_temp.mk(5, 750000, 0, false, NULL, 'shop_rb', '01040000002', 'RB1');
  PERFORM pg_temp.attach(o, 'refundp');
  PERFORM pg_temp.pay(o);
  r := public.partner_make_payouts('2026-12', now() + interval '8 days');
  IF NOT (r->>'ok')::boolean OR (r->>'created')::int <> 1 OR (r->>'carried')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL 다음 달 정산 만들기: %', r;
  END IF;
  SELECT * INTO y FROM public.partner_payouts WHERE partner_id = pa AND month = '2026-12';
  -- 75,000 − 20,000 = 55,000 → 소득세 1,650 · 지방세 165 · 실지급 53,185
  IF y.gross <> 55000 OR y.income_tax <> 1650 OR y.local_tax <> 165 OR y.withholding <> 1815 OR y.net <> 53185 THEN
    RAISE EXCEPTION 'FAIL 순액 정산: %', row_to_json(y);
  END IF;
  IF (SELECT count(*) FROM public.partner_commissions WHERE payout_id = y.id) <> 2 THEN
    RAISE EXCEPTION 'FAIL 차감 줄도 같은 정산에 묶임';
  END IF;
  PERFORM public.partner_payout_mark_paid(y.id, now() + interval '9 days');
  IF EXISTS (SELECT 1 FROM public.partner_commissions WHERE partner_id = pa AND status <> 'paid') THEN
    RAISE EXCEPTION 'FAIL 지급 완료 뒤 차감 줄도 paid';
  END IF;
  RAISE NOTICE 'PASS 순액: 75,000 − 20,000 = 55,000 → 1,650 / 165 / 53,185, 차감 줄도 지급 완료';
END $$;

-- ───────── 4) 합계 0 이하 → 정산 안 만들고 이월 ─────────
DO $$
DECLARE pb uuid; o uuid; y uuid; r jsonb; yy public.partner_payouts%ROWTYPE;
BEGIN
  pb := pg_temp.partner('박이월', '01031110002', 'carryp');
  o := pg_temp.mk(1, 200000, 0, false, NULL, 'shop_rc', '01040000003', 'RC1');
  PERFORM pg_temp.attach(o, 'carryp');
  PERFORM pg_temp.pay(o);
  PERFORM public.partner_make_payouts('2026-11', now() + interval '8 days');
  SELECT id INTO y FROM public.partner_payouts WHERE partner_id = pb AND month = '2026-11';
  PERFORM public.partner_payout_mark_paid(y, now() + interval '9 days');
  PERFORM pg_temp.refund(o);  -- −20,000

  -- (가) 차감 줄만 있음: −20,000 → 이월
  r := public.partner_make_payouts('2027-01', now() + interval '40 days');
  IF (r->>'carried')::int <> 1 OR (r->>'created')::int <> 0
     OR EXISTS (SELECT 1 FROM public.partner_payouts WHERE partner_id = pb AND month = '2027-01') THEN
    RAISE EXCEPTION 'FAIL 음수 합계는 정산 안 만듦: %', r;
  END IF;
  -- (나) 상담 200,000 → +20,000, 합계 0 → 그래도 이월
  PERFORM pg_temp.inq('carryp', 200000);
  r := public.partner_make_payouts('2027-01', now() + interval '40 days');
  IF (r->>'carried')::int <> 1
     OR EXISTS (SELECT 1 FROM public.partner_payouts WHERE partner_id = pb AND month = '2027-01') THEN
    RAISE EXCEPTION 'FAIL 합계 0 은 정산 안 만듦: %', r;
  END IF;
  IF (SELECT count(*) FROM public.partner_commissions WHERE partner_id = pb AND status = 'payable' AND payout_id IS NULL) <> 2 THEN
    RAISE EXCEPTION 'FAIL 이월한 줄은 payable·정산 없음으로 남음';
  END IF;
  -- (다) 다음 달 상담 300,000 → +30,000, 합계 30,000 → 정산(원천징수는 30,000 에만)
  PERFORM pg_temp.inq('carryp', 300000);
  r := public.partner_make_payouts('2027-02', now() + interval '70 days');
  IF (r->>'created')::int <> 1 THEN RAISE EXCEPTION 'FAIL 양수 되면 정산: %', r; END IF;
  SELECT * INTO yy FROM public.partner_payouts WHERE partner_id = pb AND month = '2027-02';
  IF yy.gross <> 30000 OR yy.income_tax <> 900 OR yy.local_tax <> 90 OR yy.net <> 29010 THEN
    RAISE EXCEPTION 'FAIL 이월 뒤 정산: %', row_to_json(yy);
  END IF;
  IF (SELECT count(*) FROM public.partner_commissions WHERE payout_id = yy.id) <> 3 THEN
    RAISE EXCEPTION 'FAIL 이월한 줄까지 3줄 묶임';
  END IF;
  -- 원천징수 함수는 0 이하를 0 으로
  IF (public.partner_withholding(-20000))->>'withholding' <> '0' OR (public.partner_withholding(0))->>'net' <> '0' THEN
    RAISE EXCEPTION 'FAIL 원천징수 0 이하: %', public.partner_withholding(-20000);
  END IF;
  RAISE NOTICE 'PASS 이월: −20,000·0 은 정산 없이 다음 달로, +30,000 되면 900 / 90 / 29,010';
END $$;

-- ───────── 5) 대기 정산 안에서 양수 줄을 취소해 0 이하가 되면 정산을 지우고 줄은 이월 ─────────
DO $$
DECLARE pb uuid; o uuid; y uuid; c uuid; rvid uuid;
BEGIN
  pb := pg_temp.partner('최대기', '01031110003', 'pendp');
  o := pg_temp.mk(1, 200000, 0, false, NULL, 'shop_rd', '01040000004', 'RD1');
  PERFORM pg_temp.attach(o, 'pendp');
  PERFORM pg_temp.pay(o);
  PERFORM public.partner_make_payouts('2026-11', now() + interval '8 days');
  PERFORM public.partner_payout_mark_paid((SELECT id FROM public.partner_payouts WHERE partner_id = pb), now() + interval '9 days');
  PERFORM pg_temp.refund(o);                 -- −20,000
  c := pg_temp.inq('pendp', 500000);         -- +50,000
  PERFORM public.partner_make_payouts('2027-03', now() + interval '100 days');
  SELECT id INTO y FROM public.partner_payouts WHERE partner_id = pb AND month = '2027-03';
  IF (SELECT gross FROM public.partner_payouts WHERE id = y) <> 30000 THEN RAISE EXCEPTION 'FAIL 준비 30,000'; END IF;
  PERFORM public.partner_commission_cancel(c, '잘못 넣음');
  IF EXISTS (SELECT 1 FROM public.partner_payouts WHERE id = y) THEN
    RAISE EXCEPTION 'FAIL 0 이하 된 대기 정산은 지움';
  END IF;
  SELECT id INTO rvid FROM public.partner_commissions WHERE partner_id = pb AND reversal_of IS NOT NULL;
  IF (SELECT status FROM public.partner_commissions WHERE id = rvid) <> 'payable'
     OR (SELECT payout_id FROM public.partner_commissions WHERE id = rvid) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 차감 줄은 payable·정산 없음으로 남음';
  END IF;
  RAISE NOTICE 'PASS 대기 정산: 양수 줄 취소로 0 이하 → 정산 지우고 차감 줄 이월';
END $$;

-- ───────── 6) 계약 취소: 지급 전 cancelled / 지급 뒤 음수 한 줄 ─────────
DO $$
DECLARE pc uuid; c1 uuid; c2 uuid; r jsonb; rv public.partner_commissions%ROWTYPE; v_inq uuid;
BEGIN
  pc := pg_temp.partner('정계약', '01031110004', 'contp');
  c1 := pg_temp.inq('contp', 1000000);
  r := public.partner_commission_cancel(c1, '계약 취소');
  IF NOT (r->>'ok')::boolean OR (r->>'reversed')::boolean
     OR (SELECT status FROM public.partner_commissions WHERE id = c1) <> 'cancelled' THEN
    RAISE EXCEPTION 'FAIL 지급 전 계약 취소는 cancelled: %', r;
  END IF;
  IF EXISTS (SELECT 1 FROM public.partner_commissions WHERE reversal_of = c1) THEN
    RAISE EXCEPTION 'FAIL 지급 전엔 차감 줄 없음';
  END IF;

  c2 := pg_temp.inq('contp', 2000000);   -- +200,000
  PERFORM public.partner_make_payouts('2026-11', now() + interval '1 day');
  PERFORM public.partner_payout_mark_paid((SELECT id FROM public.partner_payouts WHERE partner_id = pc), now() + interval '2 days');
  r := public.partner_commission_cancel(c2, '계약 취소');
  IF NOT (r->>'ok')::boolean OR NOT (r->>'reversed')::boolean THEN RAISE EXCEPTION 'FAIL 지급 뒤 계약 취소: %', r; END IF;
  SELECT * INTO rv FROM public.partner_commissions WHERE id = (r->>'reversal_id')::uuid;
  SELECT inquiry_id INTO v_inq FROM public.partner_commissions WHERE id = c2;
  IF rv.reversal_of <> c2 OR rv.amount <> -200000 OR rv.base_amount <> -2000000 OR rv.status <> 'payable'
     OR rv.source <> 'inquiry' OR rv.inquiry_id IS DISTINCT FROM v_inq
     OR position('지급 뒤 계약 취소 차감' IN rv.note) = 0 THEN
    RAISE EXCEPTION 'FAIL 계약 취소 차감 줄: %', row_to_json(rv);
  END IF;
  IF (SELECT status FROM public.partner_commissions WHERE id = c2) <> 'paid' THEN RAISE EXCEPTION 'FAIL 원래 줄 paid'; END IF;
  r := public.partner_commission_cancel(c2);
  IF r->>'reason' IS DISTINCT FROM 'already_reversed' THEN RAISE EXCEPTION 'FAIL 두 번 계약 취소: %', r; END IF;
  r := public.partner_commission_cancel(rv.id);
  IF r->>'reason' IS DISTINCT FROM 'is_reversal' THEN RAISE EXCEPTION 'FAIL 차감 줄 취소: %', r; END IF;
  r := public.partner_commission_cancel(c1);
  IF r->>'reason' IS DISTINCT FROM 'not_cancellable' THEN RAISE EXCEPTION 'FAIL 취소된 줄 다시 취소: %', r; END IF;
  -- 차감 줄이 있어도 같은 상담 「결제됨」 중복은 그대로 막힌다(원래 줄 paid)
  r := public.partner_inquiry_paid(v_inq, 2000000);
  IF r->>'reason' IS DISTINCT FROM 'duplicate' THEN RAISE EXCEPTION 'FAIL 계약 취소 뒤 결제됨 중복: %', r; END IF;
  -- 다음 정산: 합계 −200,000 → 이월
  r := public.partner_make_payouts('2026-12', now() + interval '30 days');
  IF EXISTS (SELECT 1 FROM public.partner_payouts WHERE partner_id = pc AND month = '2026-12') THEN
    RAISE EXCEPTION 'FAIL 계약 취소 차감만 있으면 이월';
  END IF;
  RAISE NOTICE 'PASS 계약 취소: 지급 전 cancelled·지급 뒤 −200,000 한 줄·두 번/차감 줄 취소 거절·이월';
END $$;

-- ───────── 7) 승인 메일 대상·기록 ─────────
DO $$
DECLARE pm uuid; r jsonb; t timestamptz := now(); a jsonb; e jsonb;
BEGIN
  r := public.partner_apply(jsonb_build_object(
    'name', '한메일', 'phone', '01031110005', 'email', 'Mail@Partner.Example.com', 'code', 'mailp', 'channels', '',
    'bank_name', '신한은행', 'bank_account', '110-123-456789', 'bank_holder', '한메일'));
  pm := (r->>'id')::uuid;
  r := public.partner_approval_mail_target(pm);
  IF r->>'reason' IS DISTINCT FROM 'not_approved' THEN RAISE EXCEPTION 'FAIL 신청 상태는 메일 대상 아님: %', r; END IF;
  IF (public.partner_approval_mail_target(gen_random_uuid()))->>'reason' <> 'not_found' THEN RAISE EXCEPTION 'FAIL 없는 id'; END IF;
  PERFORM public.partner_set_status(pm, 'approved');
  r := public.partner_approval_mail_target(pm);
  IF NOT (r->>'ok')::boolean OR r->>'email' <> 'mail@partner.example.com' OR r->>'code' <> 'mailp'
     OR r->>'view_key' !~ '^[0-9a-f]{64}$' OR r->>'name' <> '한메일' THEN
    RAISE EXCEPTION 'FAIL 메일 대상: %', r;
  END IF;
  -- 실패 → 사유만, 시각 없음
  PERFORM public.partner_approval_mail_result(pm, '지메일 보내기 실패(HTTP 500)', t);
  IF (SELECT approval_mail_sent_at FROM public.partners WHERE id = pm) IS NOT NULL
     OR (SELECT approval_mail_error FROM public.partners WHERE id = pm) <> '지메일 보내기 실패(HTTP 500)' THEN
    RAISE EXCEPTION 'FAIL 실패 기록';
  END IF;
  -- 성공 → 시각, 사유 지움
  PERFORM public.partner_approval_mail_result(pm, NULL, t + interval '1 minute');
  IF (SELECT approval_mail_sent_at FROM public.partners WHERE id = pm) <> t + interval '1 minute'
     OR (SELECT approval_mail_error FROM public.partners WHERE id = pm) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 성공 기록';
  END IF;
  -- 다시 보내기 실패 → 마지막 성공 시각은 남기고 사유
  PERFORM public.partner_approval_mail_result(pm, repeat('가', 600), t + interval '2 minutes');
  IF (SELECT approval_mail_sent_at FROM public.partners WHERE id = pm) <> t + interval '1 minute'
     OR char_length((SELECT approval_mail_error FROM public.partners WHERE id = pm)) <> 500 THEN
    RAISE EXCEPTION 'FAIL 다시 보내기 실패 기록(500자 자름)';
  END IF;
  IF (public.partner_approval_mail_result(gen_random_uuid(), NULL))->>'reason' <> 'not_found' THEN
    RAISE EXCEPTION 'FAIL 없는 id 기록';
  END IF;
  a := public.partner_admin_overview();
  SELECT x INTO e FROM jsonb_array_elements(a->'partners') x WHERE x->>'code' = 'mailp';
  IF NOT (e ? 'approval_mail_sent_at') OR char_length(e->>'approval_mail_error') <> 500 THEN
    RAISE EXCEPTION 'FAIL 관리자 화면에 메일 기록: %', e;
  END IF;
  RAISE NOTICE 'PASS 승인 메일: 승인된 사람만 대상·실패/성공/재실패 기록·관리자 화면에 보임';
END $$;

-- ───────── 8) 화면 묶음: 차감 줄 표시·결제 수에서 제외 ─────────
DO $$
DECLARE a jsonb; e jsonb; m jsonb;
BEGIN
  a := public.partner_admin_overview(now() + interval '100 days');
  SELECT x INTO e FROM jsonb_array_elements(a->'partners') x WHERE x->>'code' = 'refundp';
  -- refundp: 200,000(환불됨, 지급 완료) + 750,000 → 결제 2건, 차감 줄은 세지 않음
  IF (e->>'paid_count')::int <> 2 OR (e->>'sum_paid')::int <> 75000 THEN
    RAISE EXCEPTION 'FAIL 관리자 파트너 통계: %', e;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a->'commissions') x
                  WHERE x->>'code' = 'refundp' AND x->>'reversal_of' IS NOT NULL AND (x->>'amount')::int = -20000
                    AND x->>'order_no' IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 원장에 차감 줄(주문번호 포함)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a->'commissions') x
                  WHERE x->>'code' = 'refundp' AND x->>'reversal_of' IS NULL AND (x->>'reversed')::boolean) THEN
    RAISE EXCEPTION 'FAIL 원장 원래 줄에 reversed 표시';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a->'inquiries') x
                  WHERE x->>'ref_code' = 'contp' AND x->>'commission_status' = 'paid' AND (x->>'reversed')::boolean) THEN
    RAISE EXCEPTION 'FAIL 추천 상담에 계약 취소(reversed) 표시';
  END IF;
  m := public.partner_me((SELECT view_key FROM public.partners WHERE code = 'refundp'), now() + interval '100 days');
  IF (m->>'paid_count')::int <> 2
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(m->'recent') x
                     WHERE (x->>'is_reversal')::boolean AND (x->>'amount')::int = -20000 AND (x->>'plan')::int = 1) THEN
    RAISE EXCEPTION 'FAIL 파트너 화면 차감 줄: %', m;
  END IF;
  RAISE NOTICE 'PASS 화면: 차감 줄 표시(주문번호·편수)·reversed 표시·결제 수에서 제외';
END $$;

-- ───────── 9) 미승인 신청 6개월 뒤 정리 ─────────
DO $$
DECLARE n int; v_rej uuid;
BEGIN
  INSERT INTO public.partners (code, status, name, phone, email, bank_name, bank_account, bank_holder, created_at) VALUES
    ('oldapp1', 'applied',  '오래신청', '01051110001', 'oa1@example.com', '국민', '123456789', '오래신청', now() - interval '7 months'),
    ('oldrej1', 'rejected', '오래거절', '01051110002', 'or1@example.com', '국민', '123456789', '오래거절', now() - interval '7 months'),
    ('newapp1', 'applied',  '새신청',   '01051110003', 'na1@example.com', '국민', '123456789', '새신청',   now() - interval '5 months'),
    ('oldok01', 'approved', '오래승인', '01051110004', 'ok1@example.com', '국민', '123456789', '오래승인', now() - interval '7 months'),
    ('oldrej2', 'rejected', '기록있음', '01051110005', 'or2@example.com', '국민', '123456789', '기록있음', now() - interval '7 months'),
    ('oldpau1', 'paused',   '오래정지', '01051110006', 'op1@example.com', '국민', '123456789', '오래정지', now() - interval '7 months');
  SELECT id INTO v_rej FROM public.partners WHERE code = 'oldrej2';
  INSERT INTO public.partner_commissions (partner_id, source, base_amount, amount, status, cancelled_at)
  VALUES (v_rej, 'inquiry', 10000, 1000, 'cancelled', now());
  n := public.partner_cleanup_unapproved(now());
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL 지운 수 2 이어야 함(%)', n; END IF;
  IF EXISTS (SELECT 1 FROM public.partners WHERE code IN ('oldapp1', 'oldrej1')) THEN
    RAISE EXCEPTION 'FAIL 6개월 지난 신청·거절은 지움';
  END IF;
  IF (SELECT count(*) FROM public.partners WHERE code IN ('newapp1', 'oldok01', 'oldrej2', 'oldpau1')) <> 4 THEN
    RAISE EXCEPTION 'FAIL 6개월 안 됨·승인·기록 있음·일시정지는 남김';
  END IF;
  IF public.partner_cleanup_unapproved(now()) <> 0 THEN RAISE EXCEPTION 'FAIL 두 번째는 0'; END IF;
  RAISE NOTICE 'PASS 정리: 6개월 지난 신청·거절(기록 없음)만 지움, 승인·정지·기록 있음·최근은 남김';
END $$;

ROLLBACK;
