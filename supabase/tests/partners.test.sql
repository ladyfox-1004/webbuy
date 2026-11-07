-- 추천인(파트너) 마이그레이션(20261107160000_partners.sql) SQL 시험
--
-- 실행: deno run -A supabase/tests/run-sql-tests.ts  (메모리 Postgres, 운영 DB 에 연결하지 않음)
-- 규칙: 블록마다 성공하면 RAISE NOTICE 'PASS …', 틀리면 RAISE EXCEPTION 'FAIL …'.
-- 시간: 한 트랜잭션 안이라 now() 가 고정이다. 「7일 지남」「30분 지남」은 _now 인자나 paid_at·created_at 을 직접 돌려 흉내 낸다.

BEGIN;
SET LOCAL TimeZone = 'UTC';
UPDATE public.reels_settings SET enabled = true;

-- ───────── 시험 도우미 ─────────
CREATE FUNCTION pg_temp.kh(_k text) RETURNS text LANGUAGE sql AS
$$ SELECT encode(sha256(convert_to(_k, 'UTF8')), 'hex') $$;

-- 주문 만들기 → 결제창 기록까지(payurl = https://payapp.kr/p/<mul>)
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

CREATE FUNCTION pg_temp.app(_name text, _phone text, _email text, _code text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.partner_apply(jsonb_build_object(
    'name', _name, 'phone', _phone, 'email', _email, 'code', _code, 'channels', 'https://instagram.com/x',
    'bank_name', '국민은행', 'bank_account', '123456-01-987654', 'bank_holder', _name))
$$;

-- ───────── 1) 구조 ─────────
DO $$
DECLARE t text; f text;
BEGIN
  FOREACH t IN ARRAY ARRAY['partners', 'partner_commissions', 'partner_payouts'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN
      RAISE EXCEPTION 'FAIL RLS 꺼짐: %', t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t) THEN
      RAISE EXCEPTION 'FAIL 정책이 있으면 안 됨: %', t;
    END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT') OR has_table_privilege('authenticated', 'public.' || t, 'SELECT')
       OR has_table_privilege('anon', 'public.' || t, 'INSERT') THEN
      RAISE EXCEPTION 'FAIL anon/authenticated 에 표 권한: %', t;
    END IF;
    IF NOT has_table_privilege('service_role', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION 'FAIL service_role 이 못 읽음: %', t;
    END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['public.partner_apply(jsonb)', 'public.partner_me(text, timestamptz)',
                            'public.partner_attach_reels(text, text, text, text, timestamptz)',
                            'public.partner_admin_overview(timestamptz)', 'public.partner_make_payouts(text, timestamptz)'] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL anon/authenticated 가 함수를 부를 수 있음: %', f;
    END IF;
    IF NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL service_role 이 함수를 못 부름: %', f;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['reels_orders', 'inquiries', 'site_visits'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = t AND column_name = 'ref_code') THEN
      RAISE EXCEPTION 'FAIL ref_code 열 없음: %', t;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS 구조: RLS 켬·정책 0개·anon 권한 없음·service_role 만·ref_code 열 3개';
END $$;

-- ───────── 2) 금액 규칙(원 단위 내림) ─────────
DO $$
DECLARE w jsonb;
BEGIN
  IF public.partner_commission_amount(200000) <> 20000 THEN RAISE EXCEPTION 'FAIL 200,000 → 20,000'; END IF;
  IF public.partner_commission_amount(750000) <> 75000 THEN RAISE EXCEPTION 'FAIL 750,000 → 75,000'; END IF;
  IF public.partner_commission_amount(1400000 - 99000) <> 130100 THEN RAISE EXCEPTION 'FAIL 1,301,000 → 130,100'; END IF;
  IF public.partner_commission_amount(12345) <> 1234 THEN RAISE EXCEPTION 'FAIL 내림(12,345 → 1,234)'; END IF;
  w := public.partner_withholding(130100);
  IF (w->>'income_tax')::int <> 3903 OR (w->>'local_tax')::int <> 390 OR (w->>'withholding')::int <> 4293
     OR (w->>'net')::int <> 125807 THEN
    RAISE EXCEPTION 'FAIL 원천징수 130,100: %', w;
  END IF;
  w := public.partner_withholding(20000);
  IF (w->>'income_tax')::int <> 600 OR (w->>'local_tax')::int <> 60 OR (w->>'net')::int <> 19340 THEN
    RAISE EXCEPTION 'FAIL 원천징수 20,000: %', w;
  END IF;
  RAISE NOTICE 'PASS 금액: 10%%·3%%·0.3%% 원 단위 내림(130,100 → 3,903 / 390 / 125,807)';
END $$;

-- ───────── 3) 신청 ─────────
DO $$
DECLARE r jsonb;
BEGIN
  r := pg_temp.app('김파트', '010-1111-2222', 'Kim@Example.com', 'Kimpart');
  IF NOT (r->>'ok')::boolean OR r->>'code' <> 'kimpart' THEN RAISE EXCEPTION 'FAIL 신청: %', r; END IF;
  IF (SELECT status FROM public.partners WHERE code = 'kimpart') <> 'applied'
     OR (SELECT phone FROM public.partners WHERE code = 'kimpart') <> '01011112222'
     OR (SELECT view_key FROM public.partners WHERE code = 'kimpart') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 신청 행(applied·숫자 전화·열쇠 없음)';
  END IF;
  r := pg_temp.app('다른사람', '01011112222', 'other@example.com', NULL);
  IF r->>'reason' IS DISTINCT FROM 'duplicate' THEN RAISE EXCEPTION 'FAIL 같은 휴대폰 중복: %', r; END IF;
  r := pg_temp.app('다른사람', '01099998888', 'KIM@example.com', NULL);
  IF r->>'reason' IS DISTINCT FROM 'duplicate' THEN RAISE EXCEPTION 'FAIL 같은 이메일(대소문자) 중복: %', r; END IF;
  r := pg_temp.app('다른사람', '01099998888', 'other@example.com', 'kimpart');
  IF r->>'reason' IS DISTINCT FROM 'code_taken' THEN RAISE EXCEPTION 'FAIL 코드 중복: %', r; END IF;
  r := pg_temp.app('다른사람', '01099998888', 'other@example.com', 'admin');
  IF r->>'reason' IS DISTINCT FROM 'code_reserved' THEN RAISE EXCEPTION 'FAIL 예약어: %', r; END IF;
  r := pg_temp.app('다른사람', '01099998888', 'other@example.com', 'ab');
  IF r->>'reason' IS DISTINCT FROM 'invalid' THEN RAISE EXCEPTION 'FAIL 짧은 코드: %', r; END IF;
  r := pg_temp.app('다른사람', '02-123-4567', 'other@example.com', NULL);
  IF r->>'reason' IS DISTINCT FROM 'invalid' THEN RAISE EXCEPTION 'FAIL 휴대폰 아님: %', r; END IF;
  r := pg_temp.app('자동코드', '01099998888', 'auto@example.com', NULL);
  IF NOT (r->>'ok')::boolean OR r->>'code' !~ '^[a-hj-km-np-z2-9]{6}$' THEN RAISE EXCEPTION 'FAIL 자동 코드: %', r; END IF;
  RAISE NOTICE 'PASS 신청: applied·휴대폰/이메일 중복 거절·코드 중복/예약어/형식·자동 코드 6자';
END $$;

-- 승인: kimpart(승인) / 자동코드 사람은 신청 상태로 둔다
DO $$
DECLARE r jsonb; v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.partners WHERE code = 'kimpart';
  r := public.partner_set_status(v_id, 'approved');
  IF NOT (r->>'ok')::boolean OR r->>'view_key' !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'FAIL 승인: %', r; END IF;
  IF (public.partner_set_status(v_id, 'approved'))->>'view_key' <> r->>'view_key' THEN
    RAISE EXCEPTION 'FAIL 다시 승인해도 열쇠는 그대로여야 함';
  END IF;
  IF (public.partner_set_status(v_id, 'bogus'))->>'reason' <> 'bad_status' THEN RAISE EXCEPTION 'FAIL 잘못된 상태'; END IF;
  RAISE NOTICE 'PASS 승인: view_key 64자 생성·다시 승인해도 유지';
END $$;

-- ───────── 4) 붙이기(attach) ─────────
DO $$
DECLARE o uuid; o2 uuid; r jsonb; v_no text;
BEGIN
  o := pg_temp.mk(1, 200000, 0, false, NULL, 'shop_a', '01020000001', 'A1');
  SELECT order_no INTO v_no FROM public.reels_orders WHERE id = o;
  r := public.partner_attach_reels(v_no, 'https://payapp.kr/p/WRONG', '01020000001', 'kimpart');
  IF r->>'reason' IS DISTINCT FROM 'mismatch' THEN RAISE EXCEPTION 'FAIL 결제창 주소 틀림: %', r; END IF;
  r := public.partner_attach_reels(v_no, 'https://payapp.kr/p/A1', '01099990000', 'kimpart');
  IF r->>'reason' IS DISTINCT FROM 'mismatch' THEN RAISE EXCEPTION 'FAIL 휴대폰 틀림: %', r; END IF;
  r := public.partner_attach_reels(v_no, 'https://payapp.kr/p/A1', '010-2000-0001', 'Bad Code!');
  IF r->>'reason' IS DISTINCT FROM 'bad_ref' THEN RAISE EXCEPTION 'FAIL 코드 형식: %', r; END IF;
  r := public.partner_attach_reels(v_no, 'https://payapp.kr/p/A1', '010-2000-0001', 'KimPart', now() + interval '31 minutes');
  IF r->>'reason' IS DISTINCT FROM 'too_old' THEN RAISE EXCEPTION 'FAIL 30분 지남: %', r; END IF;
  r := public.partner_attach_reels(v_no, 'https://payapp.kr/p/A1', '010-2000-0001', 'KimPart');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL 붙이기: %', r; END IF;
  IF (SELECT ref_code FROM public.reels_orders WHERE id = o) <> 'kimpart' THEN RAISE EXCEPTION 'FAIL ref_code 저장'; END IF;
  r := public.partner_attach_reels(v_no, 'https://payapp.kr/p/A1', '01020000001', 'other1');
  IF r->>'reason' IS DISTINCT FROM 'already' THEN RAISE EXCEPTION 'FAIL 이미 붙은 주문 덮어쓰기: %', r; END IF;
  IF EXISTS (SELECT 1 FROM public.partner_commissions) THEN RAISE EXCEPTION 'FAIL 결제 전에는 수수료 없음'; END IF;
  RAISE NOTICE 'PASS 붙이기: 결제창 주소·휴대폰·30분·형식 확인, 한 번만, 결제 전 수수료 없음';
END $$;

-- ───────── 5) 일반 결제 → 수수료 20,000 pending, 중복 통보에도 한 줄 ─────────
DO $$
DECLARE o uuid; r jsonb;
BEGIN
  SELECT id INTO o FROM public.reels_orders WHERE insta_id = 'shop_a';
  r := pg_temp.pay(o);
  IF r->>'result' <> 'applied' THEN RAISE EXCEPTION 'FAIL 결제 적용: %', r; END IF;
  r := pg_temp.pay(o);
  IF r->>'result' <> 'duplicate' THEN RAISE EXCEPTION 'FAIL 중복 통보: %', r; END IF;
  IF (SELECT count(*) FROM public.partner_commissions WHERE reels_order_id = o) <> 1 THEN
    RAISE EXCEPTION 'FAIL 수수료는 한 줄';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partner_commissions WHERE reels_order_id = o AND source = 'reels'
                  AND base_amount = 200000 AND amount = 20000 AND status = 'pending'
                  AND partner_id = (SELECT id FROM public.partners WHERE code = 'kimpart')) THEN
    RAISE EXCEPTION 'FAIL 200,000 결제 → 20,000 pending';
  END IF;
  -- 상태를 다시 paid 로 덮어써도(같은 값) 늘지 않는다
  UPDATE public.reels_orders SET status = 'paid' WHERE id = o;
  UPDATE public.reels_orders SET ref_code = 'kimpart' WHERE id = o;
  IF (SELECT count(*) FROM public.partner_commissions WHERE reels_order_id = o) <> 1 THEN
    RAISE EXCEPTION 'FAIL 다시 덮어써도 한 줄';
  END IF;
  RAISE NOTICE 'PASS 일반 결제: 200,000 → 20,000 pending, 중복 없음';
END $$;

-- ───────── 6) 5편 750,000 → 75,000 ─────────
DO $$
DECLARE o uuid;
BEGIN
  o := pg_temp.mk(5, 750000, 0, false, NULL, 'shop_b', '01020000002', 'B1');
  PERFORM pg_temp.attach(o, 'kimpart');
  PERFORM pg_temp.pay(o);
  IF NOT EXISTS (SELECT 1 FROM public.partner_commissions WHERE reels_order_id = o AND amount = 75000 AND status = 'pending') THEN
    RAISE EXCEPTION 'FAIL 750,000 → 75,000';
  END IF;
  RAISE NOTICE 'PASS 5편: 750,000 → 75,000';
END $$;

-- ───────── 7) 체험 제외 + 체험 뒤 10편(차감 뒤 1,301,000 → 130,100, 코드 이어받기) ─────────
DO $$
DECLARE t uuid; b uuid; c public.partner_commissions%ROWTYPE;
BEGIN
  t := pg_temp.mk(1, 200000, 101000, true, NULL, 'shop_c', '01020000003', 'C1');
  PERFORM pg_temp.attach(t, 'kimpart');
  PERFORM pg_temp.pay(t);
  IF (SELECT status FROM public.reels_orders WHERE id = t) <> 'paid' THEN RAISE EXCEPTION 'FAIL 체험 결제'; END IF;
  IF EXISTS (SELECT 1 FROM public.partner_commissions WHERE reels_order_id = t) THEN
    RAISE EXCEPTION 'FAIL 체험 99,000 은 수수료 없음';
  END IF;
  -- 다른 기기에서 와서 묶음 주문에는 코드가 없다 → 체험 주문 코드를 이어받는다
  b := pg_temp.mk(10, 1400000, 99000, false, t, 'shop_c', '01020000003', 'C2');
  PERFORM pg_temp.pay(b);
  SELECT * INTO c FROM public.partner_commissions WHERE reels_order_id = b;
  IF NOT FOUND OR c.base_amount <> 1301000 OR c.amount <> 130100 OR c.status <> 'pending'
     OR position('이어받음' IN coalesce(c.note, '')) = 0 THEN
    RAISE EXCEPTION 'FAIL 체험 뒤 10편 1,301,000 → 130,100(이어받기): %', row_to_json(c);
  END IF;
  RAISE NOTICE 'PASS 체험: 99,000 수수료 없음 / 체험 뒤 10편 1,301,000 → 130,100';
END $$;

-- ───────── 8) 승인 안 된 코드·없는 코드·일시정지 무시, 자기 구매 취소 ─────────
DO $$
DECLARE o uuid; v_code text; v_id uuid;
BEGIN
  SELECT code INTO v_code FROM public.partners WHERE name = '자동코드';  -- 신청 상태
  o := pg_temp.mk(1, 200000, 0, false, NULL, 'shop_d', '01020000004', 'D1');
  PERFORM pg_temp.attach(o, v_code);
  PERFORM pg_temp.pay(o);
  IF EXISTS (SELECT 1 FROM public.partner_commissions WHERE reels_order_id = o) THEN
    RAISE EXCEPTION 'FAIL 신청 상태 코드는 무시';
  END IF;
  o := pg_temp.mk(1, 200000, 0, false, NULL, 'shop_e', '01020000005', 'E1');
  PERFORM pg_temp.attach(o, 'nobody123');
  PERFORM pg_temp.pay(o);
  IF EXISTS (SELECT 1 FROM public.partner_commissions WHERE reels_order_id = o) THEN
    RAISE EXCEPTION 'FAIL 없는 코드는 무시';
  END IF;
  -- 일시정지된 파트너
  PERFORM pg_temp.app('정지될', '01077776666', 'pause@example.com', 'pauseme');
  SELECT id INTO v_id FROM public.partners WHERE code = 'pauseme';
  PERFORM public.partner_set_status(v_id, 'approved');
  PERFORM public.partner_set_status(v_id, 'paused');
  o := pg_temp.mk(1, 200000, 0, false, NULL, 'shop_f', '01020000006', 'F1');
  PERFORM pg_temp.attach(o, 'pauseme');
  PERFORM pg_temp.pay(o);
  IF EXISTS (SELECT 1 FROM public.partner_commissions WHERE reels_order_id = o) THEN
    RAISE EXCEPTION 'FAIL 일시정지 파트너는 무시';
  END IF;
  -- 자기 구매(파트너 휴대폰으로 주문)
  o := pg_temp.mk(1, 200000, 0, false, NULL, 'kim_self', '01011112222', 'G1');
  PERFORM pg_temp.attach(o, 'kimpart');
  PERFORM pg_temp.pay(o);
  IF NOT EXISTS (SELECT 1 FROM public.partner_commissions WHERE reels_order_id = o AND status = 'cancelled'
                  AND position('자기 구매' IN note) > 0) THEN
    RAISE EXCEPTION 'FAIL 자기 구매는 cancelled';
  END IF;
  RAISE NOTICE 'PASS 무시: 신청 상태·없는 코드·일시정지 / 자기 구매는 cancelled';
END $$;

-- ───────── 9) 환불 → cancelled ─────────
DO $$
DECLARE o uuid; r jsonb;
BEGIN
  SELECT id INTO o FROM public.reels_orders WHERE insta_id = 'shop_b';
  r := pg_temp.refund(o);
  IF r->>'result' <> 'applied' OR (SELECT status FROM public.reels_orders WHERE id = o) <> 'cancelled' THEN
    RAISE EXCEPTION 'FAIL 환불 적용: %', r;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partner_commissions WHERE reels_order_id = o AND status = 'cancelled'
                  AND cancelled_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 환불된 주문 수수료 cancelled';
  END IF;
  RAISE NOTICE 'PASS 환불: 결제 뒤 취소 → 수수료 cancelled';
END $$;

-- ───────── 10) 7일 지나면 payable ─────────
DO $$
DECLARE n int;
BEGIN
  n := public.partner_refresh_payable(now());
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 7일 전엔 그대로(%)', n; END IF;
  n := public.partner_refresh_payable(now() + interval '7 days 1 minute');
  -- shop_a 20,000 + shop_c 10편 130,100 (shop_b 는 취소, 자기 구매는 cancelled)
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL 7일 뒤 payable 2줄이어야 함(%)', n; END IF;
  IF (SELECT sum(amount) FROM public.partner_commissions WHERE status = 'payable') <> 150100 THEN
    RAISE EXCEPTION 'FAIL payable 합계 150,100';
  END IF;
  RAISE NOTICE 'PASS 7일: 결제 뒤 7일 지나야 payable';
END $$;

-- ───────── 11) 상담 계약 결제됨 ─────────
DO $$
DECLARE i1 uuid := gen_random_uuid(); i2 uuid := gen_random_uuid(); r jsonb;
BEGIN
  INSERT INTO public.inquiries (id, name, contact, ref_code) VALUES (i1, '홈페이지 손님', '010-0000-0000', 'kimpart');
  INSERT INTO public.inquiries (id, name, contact) VALUES (i2, '추천 없는 손님', '010-0000-0001');
  r := public.partner_inquiry_paid(i2, 3000000);
  IF r->>'reason' IS DISTINCT FROM 'no_ref' THEN RAISE EXCEPTION 'FAIL 추천 없는 상담: %', r; END IF;
  r := public.partner_inquiry_paid(i1, 0);
  IF r->>'reason' IS DISTINCT FROM 'bad_amount' THEN RAISE EXCEPTION 'FAIL 금액 0: %', r; END IF;
  r := public.partner_inquiry_paid(i1, 3333333);
  IF NOT (r->>'ok')::boolean OR (r->>'amount')::int <> 333333 THEN RAISE EXCEPTION 'FAIL 상담 결제됨: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partner_commissions WHERE inquiry_id = i1 AND source = 'inquiry'
                  AND status = 'payable' AND payable_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 상담 수수료는 바로 payable';
  END IF;
  r := public.partner_inquiry_paid(i1, 3333333);
  IF r->>'reason' IS DISTINCT FROM 'duplicate' THEN RAISE EXCEPTION 'FAIL 두 번 누름: %', r; END IF;
  -- 취소하고 다시 넣기
  r := public.partner_commission_cancel((SELECT id FROM public.partner_commissions WHERE inquiry_id = i1));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL 취소: %', r; END IF;
  r := public.partner_inquiry_paid(i1, 1000000);
  IF NOT (r->>'ok')::boolean OR (r->>'amount')::int <> 100000 THEN RAISE EXCEPTION 'FAIL 다시 넣기: %', r; END IF;
  RAISE NOTICE 'PASS 상담: 추천 없음 거절·금액 검사·10%% payable·중복 거절·취소 뒤 다시';
END $$;

-- ───────── 12) 정산 만들기 → 지급 완료 → 지급 뒤 환불 표시 ─────────
DO $$
DECLARE r jsonb; y public.partner_payouts%ROWTYPE; o uuid;
BEGIN
  r := public.partner_make_payouts('2026-13');
  IF r->>'reason' IS DISTINCT FROM 'bad_month' THEN RAISE EXCEPTION 'FAIL 잘못된 달: %', r; END IF;
  r := public.partner_make_payouts('2026-11', now() + interval '8 days');
  IF NOT (r->>'ok')::boolean OR (r->>'created')::int <> 1 THEN RAISE EXCEPTION 'FAIL 정산 만들기: %', r; END IF;
  SELECT * INTO y FROM public.partner_payouts WHERE month = '2026-11';
  -- 20,000 + 130,100 + 100,000 = 250,100 → 소득세 7,503 · 지방세 750 · 실지급 241,847
  IF y.gross <> 250100 OR y.income_tax <> 7503 OR y.local_tax <> 750 OR y.withholding <> 8253 OR y.net <> 241847
     OR y.status <> 'pending' THEN
    RAISE EXCEPTION 'FAIL 정산 금액: %', row_to_json(y);
  END IF;
  -- 다시 눌러도 늘지 않는다
  r := public.partner_make_payouts('2026-11', now() + interval '8 days');
  IF (r->>'partners')::int <> 0 OR (SELECT count(*) FROM public.partner_payouts) <> 1 THEN
    RAISE EXCEPTION 'FAIL 다시 눌러도 그대로: %', r;
  END IF;
  -- 상담 수수료 취소 → 대기 정산이 다시 계산된다(150,100)
  PERFORM public.partner_commission_cancel((SELECT id FROM public.partner_commissions
                                             WHERE source = 'inquiry' AND status = 'payable'));
  IF (SELECT gross FROM public.partner_payouts WHERE id = y.id) <> 150100 THEN
    RAISE EXCEPTION 'FAIL 취소 뒤 정산 다시 계산';
  END IF;
  r := public.partner_payout_mark_paid(y.id, now() + interval '9 days');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL 지급 완료: %', r; END IF;
  IF (public.partner_payout_mark_paid(y.id))->>'reason' <> 'already_paid' THEN RAISE EXCEPTION 'FAIL 두 번 지급'; END IF;
  IF (SELECT count(*) FROM public.partner_commissions WHERE payout_id = y.id AND status = 'paid') <> 2 THEN
    RAISE EXCEPTION 'FAIL 묶인 수수료 paid';
  END IF;
  -- 지급 뒤 환불: 상태는 paid 그대로, note 남김
  SELECT id INTO o FROM public.reels_orders WHERE insta_id = 'shop_a';
  PERFORM pg_temp.refund(o);
  IF NOT EXISTS (SELECT 1 FROM public.partner_commissions WHERE reels_order_id = o AND status = 'paid'
                  AND position('지급 뒤 환불 — 다음 정산에서 차감 필요' IN note) > 0) THEN
    RAISE EXCEPTION 'FAIL 지급 뒤 환불 표시';
  END IF;
  IF (SELECT gross FROM public.partner_payouts WHERE id = y.id) <> 150100 THEN
    RAISE EXCEPTION 'FAIL 지급 완료 정산은 그대로';
  END IF;
  RAISE NOTICE 'PASS 정산: 3.3%% 계산·다시 눌러도 그대로·취소 반영·지급 완료·지급 뒤 환불 표시';
END $$;

-- 130,100 한 건 정산 → 3,903 / 390 / 125,807 (작업 지시 고정값)
DO $$
DECLARE v_id uuid; o uuid; y public.partner_payouts%ROWTYPE;
BEGIN
  PERFORM pg_temp.app('박정산', '01055554444', 'park@example.com', 'parkpay');
  SELECT id INTO v_id FROM public.partners WHERE code = 'parkpay';
  PERFORM public.partner_set_status(v_id, 'approved');
  o := pg_temp.mk(1, 200000, 101000, true, NULL, 'shop_h', '01020000008', 'H1');
  PERFORM pg_temp.attach(o, 'parkpay');
  PERFORM pg_temp.pay(o);
  o := pg_temp.mk(10, 1400000, 99000, false, o, 'shop_h', '01020000008', 'H2');
  PERFORM pg_temp.attach(o, 'parkpay');
  PERFORM pg_temp.pay(o);
  PERFORM public.partner_make_payouts('2026-12', now() + interval '8 days');
  SELECT * INTO y FROM public.partner_payouts WHERE partner_id = v_id AND month = '2026-12';
  IF y.gross <> 130100 OR y.income_tax <> 3903 OR y.local_tax <> 390 OR y.net <> 125807 THEN
    RAISE EXCEPTION 'FAIL 130,100 정산: %', row_to_json(y);
  END IF;
  RAISE NOTICE 'PASS 정산 고정값: 130,100 → 3,903 / 390 / 125,807';
END $$;

-- ───────── 13) 파트너 화면·관리자 화면 ─────────
DO $$
DECLARE k text; m jsonb; a jsonb; v_code text;
BEGIN
  INSERT INTO public.site_visits (visitor_id, session_id, path, ref_code)
  VALUES ('visitor-0001', 'session-0001', '/reels', 'kimpart'),
         ('visitor-0001', 'session-0002', '/', 'kimpart'),
         ('visitor-0002', 'session-0003', '/', 'kimpart'),
         ('visitor-0003', 'session-0004', '/', 'parkpay');
  INSERT INTO public.site_visits (visitor_id, session_id, path, ref_code, created_at)
  VALUES ('visitor-0009', 'session-0009', '/', 'kimpart', now() - interval '31 days');
  SELECT view_key INTO k FROM public.partners WHERE code = 'kimpart';
  m := public.partner_me(k);
  IF m IS NULL OR m->>'code' <> 'kimpart' OR (m->>'visits_30d')::int <> 2 OR (m->>'inquiries')::int <> 1
     OR m->>'bank_last4' <> '7654' OR m ? 'bank_account' OR m ? 'phone' OR m ? 'email' THEN
    RAISE EXCEPTION 'FAIL 파트너 화면: %', m;
  END IF;
  IF (m->>'sum_paid')::int <> 150100 OR jsonb_array_length(m->'months') <> 1 THEN
    RAISE EXCEPTION 'FAIL 파트너 화면 금액·정산: %', m;
  END IF;
  IF public.partner_me('0000000000000000000000000000000000000000000000000000000000000000') IS NOT NULL
     OR public.partner_me('짧음') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 틀린 열쇠는 null';
  END IF;
  -- 거절된 사람은 열쇠가 있어도 null
  SELECT code INTO v_code FROM public.partners WHERE code = 'pauseme';
  PERFORM public.partner_set_status((SELECT id FROM public.partners WHERE code = v_code), 'rejected');
  IF public.partner_me((SELECT view_key FROM public.partners WHERE code = v_code)) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 거절된 파트너 화면은 null';
  END IF;

  a := public.partner_admin_overview();
  IF jsonb_array_length(a->'partners') <> 4 OR jsonb_array_length(a->'inquiries') <> 1
     OR jsonb_array_length(a->'payouts') <> 2 OR jsonb_array_length(a->'commissions') < 5 THEN
    RAISE EXCEPTION 'FAIL 관리자 화면 묶음: partners % inquiries % payouts % commissions %',
      jsonb_array_length(a->'partners'), jsonb_array_length(a->'inquiries'),
      jsonb_array_length(a->'payouts'), jsonb_array_length(a->'commissions');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a->'partners') e
                  WHERE e->>'code' = 'kimpart' AND (e->>'visits_30d')::int = 2 AND (e->>'sum_paid')::int = 150100) THEN
    RAISE EXCEPTION 'FAIL 관리자 파트너 통계';
  END IF;
  RAISE NOTICE 'PASS 화면: 파트너 화면(30일 방문·끝 4자리·개인정보 없음)·틀린/거절 열쇠 null·관리자 묶음';
END $$;

ROLLBACK;
