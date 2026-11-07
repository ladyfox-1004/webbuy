-- 관리자 파트너 목록 마이그레이션(20261107190000_partners_admin_list.sql) SQL 시험
--
-- 실행: deno run -A supabase/tests/run-sql-tests.ts  (메모리 Postgres, 운영 DB 에 연결하지 않음)
-- 규칙: 블록마다 성공하면 RAISE NOTICE 'PASS …', 틀리면 RAISE EXCEPTION 'FAIL …'.
-- 기준 시각 _now = 2026-11-20 03:00 UTC(한국 11/20 12:00) → 이번 달 시작 = 2026-10-31 15:00 UTC(한국 11/1 0시)

BEGIN;
SET LOCAL TimeZone = 'UTC';

-- 앞 시험이 남긴 줄(시드 옛 정산 등)을 이 트랜잭션 안에서만 비운다(끝에 ROLLBACK)
DELETE FROM public.partner_commissions WHERE reversal_of IS NOT NULL;
DELETE FROM public.partner_commissions;
DELETE FROM public.partner_payouts;
DELETE FROM public.partner_account_changes;
DELETE FROM public.partners;

CREATE FUNCTION pg_temp.now0() RETURNS timestamptz LANGUAGE sql AS $$ SELECT '2026-11-20 03:00:00+00'::timestamptz $$;

CREATE FUNCTION pg_temp.mk(_name text, _phone text, _code text, _status text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE r jsonb; v uuid;
BEGIN
  r := public.partner_apply(jsonb_build_object(
    'name', _name, 'phone', _phone, 'email', _code || '@partner.example.com', 'code', _code, 'channels', 'https://instagram.com/' || _code,
    'bank_name', '국민은행', 'bank_account', '123456-01-987654', 'bank_holder', _name));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL 준비 신청 실패: %', r; END IF;
  v := (r->>'id')::uuid;
  IF _status IN ('approved', 'paused') THEN PERFORM public.partner_set_status(v, 'approved', '2026-10-01 00:00:00+00'); END IF;
  IF _status = 'paused' THEN PERFORM public.partner_set_status(v, 'paused'); END IF;
  IF _status = 'rejected' THEN PERFORM public.partner_set_status(v, 'rejected'); END IF;
  RETURN v;
END $$;

CREATE FUNCTION pg_temp.com(_pid uuid, _source text, _base int, _status text, _at timestamptz, _rev uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  INSERT INTO public.partner_commissions (partner_id, source, base_amount, rate, amount, status, created_at, reversal_of)
  VALUES (_pid, _source, _base, 0.10,
          CASE WHEN _base >= 0 THEN floor(_base * 0.10)::integer ELSE -floor(-_base * 0.10)::integer END,
          _status, _at, _rev)
  RETURNING id INTO v;
  RETURN v;
END $$;

-- ───────── 준비 ─────────
DO $$
DECLARE a uuid; b uuid; c2 uuid; n timestamptz := pg_temp.now0();
BEGIN
  a := pg_temp.mk('가나다', '01077770001', 'lista', 'approved');
  b := pg_temp.mk('라마바', '01077770002', 'listb', 'paused');
  PERFORM pg_temp.mk('사아자', '01077770003', 'listc', 'applied');
  PERFORM pg_temp.mk('차카타', '01077770004', 'listd', 'rejected');

  INSERT INTO public.site_visits (created_at, visitor_id, session_id, path, ref_code) VALUES
    (n - interval '2 days',  'visitor-a001', 'session-a001', '/', 'lista'),
    (n - interval '3 days',  'visitor-a001', 'session-a002', '/', 'lista'),
    (n - interval '10 days', 'visitor-a002', 'session-a003', '/', 'lista'),
    (n - interval '40 days', 'visitor-a003', 'session-a004', '/', 'lista');
  INSERT INTO public.inquiries (name, contact, ref_code, created_at) VALUES
    ('손님1', '010-0000-0001', 'lista', n - interval '1 day'),
    ('손님2', '010-0000-0002', 'lista', n - interval '20 days');

  PERFORM pg_temp.com(a, 'inquiry', 100000, 'payable', n - interval '1 day');
  c2 := pg_temp.com(a, 'reels', 50000, 'paid', n - interval '40 days');
  PERFORM pg_temp.com(a, 'reels', -50000, 'payable', n - interval '5 days', c2);
  PERFORM pg_temp.com(a, 'reels', 30000, 'cancelled', n - interval '2 days');
  PERFORM pg_temp.com(a, 'reels', 20000, 'pending', n - interval '3 days');
  PERFORM pg_temp.com(b, 'inquiry', 200000, 'payable', n - interval '2 days');

  INSERT INTO public.partner_account_changes (partner_id, changed_at, old_bank_name, new_bank_name, old_last4, new_last4)
  VALUES (a, n - interval '3 days', '신한은행', '국민은행', '1111', '7654');
END $$;

-- ───────── 1) 권한 ─────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.partner_admin_list(text, timestamptz)', 'public.partner_admin_summary(timestamptz)',
                            'public.partner_admin_detail(uuid)', 'public.partner_admin_bank(uuid)',
                            'public.partner_set_memo(uuid, text, timestamptz)'] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL anon/authenticated 가 % 를 부를 수 있음', f;
    END IF;
    IF NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL service_role 이 % 를 못 부름', f;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS 목록·요약·상세·계좌·메모 함수는 service_role 전용';
END $$;

-- ───────── 2) 30일 집계 ─────────
DO $$
DECLARE r jsonb; a jsonb; b jsonb;
BEGIN
  r := public.partner_admin_list('30d', pg_temp.now0());
  IF r->>'period' <> '30d' OR jsonb_array_length(r->'partners') <> 4 THEN RAISE EXCEPTION 'FAIL 목록 기본: %', r; END IF;
  SELECT x INTO a FROM jsonb_array_elements(r->'partners') x WHERE x->>'code' = 'lista';
  SELECT x INTO b FROM jsonb_array_elements(r->'partners') x WHERE x->>'code' = 'listb';
  IF (a->>'visits')::int <> 2 OR (a->>'inquiries')::int <> 2 OR (a->>'paid_count')::int <> 2
     OR (a->>'paid_amount')::int <> 120000 THEN
    RAISE EXCEPTION 'FAIL 30일 방문·상담·결제: %', a;
  END IF;
  IF (a->>'sum_pending')::int <> 2000 OR (a->>'sum_payable')::int <> 5000 OR (a->>'sum_paid')::int <> 5000
     OR (a->>'sum_reversed')::int <> -5000 OR (a->>'month_commission')::int <> 7000 THEN
    RAISE EXCEPTION 'FAIL 누적 수수료: %', a;
  END IF;
  IF (a->>'last_activity_at')::timestamptz <> pg_temp.now0() - interval '1 day' THEN
    RAISE EXCEPTION 'FAIL 마지막 활동일: %', a->>'last_activity_at';
  END IF;
  IF a->>'bank_last4' <> '7654' OR a->>'bank_name' <> '국민은행'
     OR (a->>'account_changed_at')::timestamptz <> pg_temp.now0() - interval '3 days' THEN
    RAISE EXCEPTION 'FAIL 계좌 요약: %', a;
  END IF;
  IF (a->>'user_linked')::boolean OR a->>'approved_at' IS NULL OR a->>'status' <> 'approved' THEN
    RAISE EXCEPTION 'FAIL 상태·계정: %', a;
  END IF;
  IF (b->>'sum_payable')::int <> 20000 OR b->>'status' <> 'paused' THEN RAISE EXCEPTION 'FAIL 일시정지 파트너: %', b; END IF;
  -- 기본 순서: 지급 가능 큰 순
  IF r->'partners'->0->>'code' <> 'listb' OR r->'partners'->1->>'code' <> 'lista' THEN
    RAISE EXCEPTION 'FAIL 기본 순서(지급 가능 큰 순): %, %', r->'partners'->0->>'code', r->'partners'->1->>'code';
  END IF;
  RAISE NOTICE 'PASS 30일: 방문(고유)·상담·결제 건수·금액, 누적 대기·지급 가능·지급 완료·차감, 이번 달 수수료, 마지막 활동, 기본 순서';
END $$;

-- ───────── 3) 기간 ─────────
DO $$
DECLARE a jsonb; p text;
BEGIN
  FOREACH p IN ARRAY ARRAY['7d', 'month', 'all', 'zzz'] LOOP
    SELECT x INTO a FROM jsonb_array_elements(public.partner_admin_list(p, pg_temp.now0())->'partners') x WHERE x->>'code' = 'lista';
    IF p = '7d' AND ((a->>'visits')::int <> 1 OR (a->>'inquiries')::int <> 1 OR (a->>'paid_count')::int <> 2
                     OR (a->>'paid_amount')::int <> 120000) THEN
      RAISE EXCEPTION 'FAIL 7일: %', a;
    END IF;
    IF p = 'month' AND ((a->>'visits')::int <> 2 OR (a->>'inquiries')::int <> 1 OR (a->>'paid_count')::int <> 2) THEN
      RAISE EXCEPTION 'FAIL 이번 달: %', a;
    END IF;
    IF p = 'all' AND ((a->>'visits')::int <> 3 OR (a->>'inquiries')::int <> 2 OR (a->>'paid_count')::int <> 3
                      OR (a->>'paid_amount')::int <> 170000) THEN
      RAISE EXCEPTION 'FAIL 전체: %', a;
    END IF;
    -- 누적 금액은 기간과 상관없다
    IF (a->>'sum_payable')::int <> 5000 OR (a->>'sum_paid')::int <> 5000 THEN RAISE EXCEPTION 'FAIL 기간 % 에 누적이 바뀜: %', p, a; END IF;
  END LOOP;
  IF public.partner_admin_list('zzz', pg_temp.now0())->>'period' <> '30d' THEN RAISE EXCEPTION 'FAIL 틀린 기간 → 30d'; END IF;
  IF public.partner_admin_list('all', pg_temp.now0())->>'since' IS NOT NULL THEN RAISE EXCEPTION 'FAIL 전체 기간 since 는 null'; END IF;
  IF (public.partner_admin_list('month', pg_temp.now0())->>'since')::timestamptz <> '2026-10-31 15:00:00+00' THEN
    RAISE EXCEPTION 'FAIL 이번 달 시작(한국 1일 0시)';
  END IF;
  RAISE NOTICE 'PASS 기간 7일·이번 달(한국)·전체·틀린 값 → 30일, 누적 금액은 기간과 무관';
END $$;

-- ───────── 4) 합계 줄 ─────────
DO $$
DECLARE t jsonb;
BEGIN
  t := public.partner_admin_list('30d', pg_temp.now0())->'totals';
  IF (t->>'partners')::int <> 4 OR (t->'by_status'->>'approved')::int <> 1 OR (t->'by_status'->>'paused')::int <> 1
     OR (t->'by_status'->>'applied')::int <> 1 OR (t->'by_status'->>'rejected')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL 상태별 파트너 수: %', t;
  END IF;
  IF (t->>'month_paid_amount')::int <> 320000 OR (t->>'payable_total')::int <> 25000 OR (t->>'paid_total')::int <> 5000 THEN
    RAISE EXCEPTION 'FAIL 합계 금액: %', t;
  END IF;
  RAISE NOTICE 'PASS 합계 줄: 상태별 수·이번 달 결제 금액·지급 가능 합계·누적 지급';
END $$;

-- ───────── 5) 계좌 가림 ─────────
DO $$
DECLARE r jsonb; x jsonb;
BEGIN
  r := public.partner_admin_list('all', pg_temp.now0());
  FOR x IN SELECT * FROM jsonb_array_elements(r->'partners') LOOP
    IF x ? 'bank_account' THEN RAISE EXCEPTION 'FAIL 목록에 계좌 전체 번호 열이 있음'; END IF;
  END LOOP;
  IF position('123456-01' IN r::text) > 0 OR position('12345601' IN r::text) > 0 THEN
    RAISE EXCEPTION 'FAIL 목록 응답 어딘가에 계좌 앞자리가 있음';
  END IF;
  IF position('123456-01' IN public.partner_admin_detail((SELECT id FROM public.partners WHERE code = 'lista'))::text) > 0 THEN
    RAISE EXCEPTION 'FAIL 상세 응답에 계좌 전체 번호';
  END IF;
  RAISE NOTICE 'PASS 목록·상세 응답에는 계좌 끝 4자리만';
END $$;

-- ───────── 6) 상세·계좌 전체·메모 ─────────
DO $$
DECLARE a uuid := (SELECT id FROM public.partners WHERE code = 'lista'); r jsonb;
BEGIN
  r := public.partner_admin_detail(a);
  IF NOT (r->>'ok')::boolean OR jsonb_array_length(r->'commissions') <> 5 OR jsonb_array_length(r->'changes') <> 1
     OR r->'changes'->0->>'new_last4' <> '7654' OR r->'changes'->0->>'old_bank_name' <> '신한은행' THEN
    RAISE EXCEPTION 'FAIL 상세: %', r;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'commissions') c WHERE (c->>'is_reversal')::boolean) THEN
    RAISE EXCEPTION 'FAIL 상세 수수료에 차감 줄 표시 없음';
  END IF;
  IF public.partner_admin_detail(gen_random_uuid())->>'reason' <> 'not_found' THEN RAISE EXCEPTION 'FAIL 없는 상세'; END IF;

  r := public.partner_admin_bank(a);
  IF r->>'bank_account' <> '123456-01-987654' OR r->>'bank_holder' <> '가나다' THEN RAISE EXCEPTION 'FAIL 계좌 전체: %', r; END IF;
  IF public.partner_admin_bank(gen_random_uuid())->>'reason' <> 'not_found' THEN RAISE EXCEPTION 'FAIL 없는 계좌'; END IF;

  r := public.partner_set_memo(a, '  11월 릴스 3건 소개해 줌  ');
  IF r->>'memo' <> '11월 릴스 3건 소개해 줌' OR (SELECT memo FROM public.partners WHERE id = a) <> '11월 릴스 3건 소개해 줌' THEN
    RAISE EXCEPTION 'FAIL 메모 저장: %', r;
  END IF;
  IF (SELECT x->>'memo' FROM jsonb_array_elements(public.partner_admin_list('30d', pg_temp.now0())->'partners') x
       WHERE x->>'code' = 'lista') <> '11월 릴스 3건 소개해 줌' THEN
    RAISE EXCEPTION 'FAIL 목록에 메모가 안 보임';
  END IF;
  PERFORM public.partner_set_memo(a, repeat('가', 2500));
  IF char_length((SELECT memo FROM public.partners WHERE id = a)) <> 2000 THEN RAISE EXCEPTION 'FAIL 메모 2000자 자르기'; END IF;
  PERFORM public.partner_set_memo(a, '   ');
  IF (SELECT memo FROM public.partners WHERE id = a) IS NOT NULL THEN RAISE EXCEPTION 'FAIL 빈 메모 → NULL'; END IF;
  IF public.partner_set_memo(gen_random_uuid(), 'x')->>'reason' <> 'not_found' THEN RAISE EXCEPTION 'FAIL 없는 메모 대상'; END IF;
  RAISE NOTICE 'PASS 상세(이력·수수료·차감 표시)·계좌 전체 보기·메모 저장(다듬기·2000자·빈 값 NULL)';
END $$;

-- ───────── 7) 첫 화면 요약 ─────────
DO $$
DECLARE r jsonb;
BEGIN
  r := public.partner_admin_summary(pg_temp.now0());
  IF (r->>'approved')::int <> 1 OR (r->>'applied')::int <> 1 OR (r->>'paused')::int <> 1 OR (r->>'payable_total')::int <> 25000 THEN
    RAISE EXCEPTION 'FAIL 요약: %', r;
  END IF;
  RAISE NOTICE 'PASS 첫 화면 요약(승인 수·신청 수·지급 가능 합계)';
END $$;

-- ───────── 8) 빈 상태 ─────────
DO $$
DECLARE r jsonb;
BEGIN
  DELETE FROM public.partner_commissions WHERE reversal_of IS NOT NULL;
  DELETE FROM public.partner_commissions;
  DELETE FROM public.partner_account_changes;
  DELETE FROM public.partners;
  r := public.partner_admin_list('30d', pg_temp.now0());
  IF jsonb_array_length(r->'partners') <> 0 OR (r->'totals'->>'partners')::int <> 0 OR (r->'totals'->>'payable_total')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL 빈 목록: %', r;
  END IF;
  RAISE NOTICE 'PASS 파트너가 없어도 빈 목록·0 합계';
END $$;

ROLLBACK;
