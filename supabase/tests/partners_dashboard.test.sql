-- 파트너 지급 편의·로그인 대시보드 마이그레이션(20261107180000_partners_dashboard.sql) SQL 시험
--
-- 실행: deno run -A supabase/tests/run-sql-tests.ts  (메모리 Postgres, 운영 DB 에 연결하지 않음)
-- 규칙: 블록마다 성공하면 RAISE NOTICE 'PASS …', 틀리면 RAISE EXCEPTION 'FAIL …'.
-- 실행기가 이 마이그레이션 직전에 「옛 정산 한 줄」(코드 seedold, 2026-09, 지급 전)을 넣어 둔다 → 스냅샷 채우기 확인용.

BEGIN;
SET LOCAL TimeZone = 'UTC';

-- ───────── 시험 도우미 ─────────
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

-- 추천 붙은 상담 하나 + 결제됨(바로 payable) → commission id
CREATE FUNCTION pg_temp.inq(_code text, _amount int) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE i uuid := gen_random_uuid(); r jsonb;
BEGIN
  INSERT INTO public.inquiries (id, name, contact, ref_code) VALUES (i, '상담 ' || _amount, '010-0000-0000', _code);
  r := public.partner_inquiry_paid(i, _amount);
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL 준비 상담 결제됨 실패: %', r; END IF;
  RETURN (r->>'commission_id')::uuid;
END $$;

-- ───────── A1) 구조·권한 ─────────
DO $$
DECLARE f text; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pay_bank_name', 'pay_bank_account', 'pay_bank_holder'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partner_payouts'
                    AND column_name = t AND is_nullable = 'NO') THEN
      RAISE EXCEPTION 'FAIL 정산 스냅샷 열 %(NOT NULL)', t;
    END IF;
  END LOOP;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.partner_payout_runs'::regclass) THEN
    RAISE EXCEPTION 'FAIL partner_payout_runs RLS 꺼짐';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'partner_payout_runs') THEN
    RAISE EXCEPTION 'FAIL partner_payout_runs 에 정책이 있으면 안 됨';
  END IF;
  IF has_table_privilege('anon', 'public.partner_payout_runs', 'SELECT')
     OR has_table_privilege('authenticated', 'public.partner_payout_runs', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL anon/authenticated 가 partner_payout_runs 를 읽을 수 있음';
  END IF;
  FOREACH f IN ARRAY ARRAY['public.partner_auto_payouts(timestamptz)',
                            'public.partner_auto_payouts_notified(text, text, timestamptz)',
                            'public.partner_transfer_list(text)',
                            'public.partner_paid_list(timestamptz, timestamptz)',
                            'public.partner_make_payouts(text, timestamptz)',
                            'public.partner_admin_overview(timestamptz)'] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL anon/authenticated 가 함수를 부를 수 있음: %', f;
    END IF;
    IF NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL service_role 이 함수를 못 부름: %', f;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS A 구조: 스냅샷 열 3개 NOT NULL·실행 기록 표 RLS(정책 0·anon 못 읽음)·함수 권한 service_role 만';
END $$;

-- ───────── A2) 이미 있던 정산 행은 지금 계좌로 채움 ─────────
DO $$
DECLARE y record;
BEGIN
  SELECT py.*, p.bank_name AS cur_bank, p.bank_account AS cur_acc, p.bank_holder AS cur_holder INTO y
    FROM public.partner_payouts py JOIN public.partners p ON p.id = py.partner_id WHERE p.code = 'seedold';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL 실행기가 넣은 옛 정산이 없음'; END IF;
  IF y.pay_bank_name <> y.cur_bank OR y.pay_bank_account <> y.cur_acc OR y.pay_bank_holder <> y.cur_holder THEN
    RAISE EXCEPTION 'FAIL 옛 정산 스냅샷 채우기: %', row_to_json(y);
  END IF;
  RAISE NOTICE 'PASS A 옛 정산 행: 마이그레이션이 지금 partners 계좌로 스냅샷을 채움';
END $$;

-- ───────── A3) 정산 만들 때 스냅샷, 그 뒤 계좌가 바뀌어도 그대로 ─────────
DO $$
DECLARE pa uuid; y public.partner_payouts%ROWTYPE; a jsonb; x jsonb; l jsonb;
BEGIN
  pa := pg_temp.partner('김스냅', '01061110001', 'snapone');
  PERFORM pg_temp.inq('snapone', 300000);
  PERFORM public.partner_make_payouts('2026-10', now());
  SELECT * INTO y FROM public.partner_payouts WHERE partner_id = pa AND month = '2026-10';
  IF y.pay_bank_name <> '국민은행' OR y.pay_bank_account <> '123456-01-987654' OR y.pay_bank_holder <> '김스냅' THEN
    RAISE EXCEPTION 'FAIL 만들 때 스냅샷: %', row_to_json(y);
  END IF;
  -- 계좌 변경(직접) → 같은 달 지급 전 정산에 수수료를 더해도 스냅샷은 처음 그대로
  UPDATE public.partners SET bank_name = '신한은행', bank_account = '110-222-333444', bank_holder = '김스냅' WHERE id = pa;
  PERFORM pg_temp.inq('snapone', 100000);
  PERFORM public.partner_make_payouts('2026-10', now());
  SELECT * INTO y FROM public.partner_payouts WHERE partner_id = pa AND month = '2026-10';
  IF y.gross <> 40000 OR y.pay_bank_name <> '국민은행' OR y.pay_bank_account <> '123456-01-987654' THEN
    RAISE EXCEPTION 'FAIL 더해도 스냅샷 유지: %', row_to_json(y);
  END IF;
  a := public.partner_admin_overview(now());
  SELECT e INTO x FROM jsonb_array_elements(a->'payouts') e WHERE e->>'code' = 'snapone';
  IF x->>'bank_name' <> '국민은행' OR x->>'bank_account' <> '123456-01-987654' OR NOT (x->>'account_changed')::boolean THEN
    RAISE EXCEPTION 'FAIL 관리자 정산 표시는 스냅샷+바뀜 표시: %', x;
  END IF;
  l := public.partner_transfer_list('2026-10');
  SELECT e INTO x FROM jsonb_array_elements(l) e WHERE e->>'code' = 'snapone';
  IF x IS NULL OR x->>'bank_account' <> '123456-01-987654' OR (x->>'net')::int <> 40000 - 1200 - 120 THEN
    RAISE EXCEPTION 'FAIL 대량이체 목록은 스냅샷 계좌·실지급: %', l;
  END IF;
  -- 지급 완료 뒤에도 그대로, 대량이체 목록(지급 전만)에서는 빠진다
  PERFORM public.partner_payout_mark_paid(y.id, '2026-11-03 01:00:00+00');
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(public.partner_transfer_list('2026-10')) e WHERE e->>'code' = 'snapone') THEN
    RAISE EXCEPTION 'FAIL 지급 완료는 대량이체 목록에서 빠짐';
  END IF;
  IF (SELECT pay_bank_account FROM public.partner_payouts WHERE id = y.id) <> '123456-01-987654' THEN
    RAISE EXCEPTION 'FAIL 지급 뒤 스냅샷 유지';
  END IF;
  -- 새 달 정산은 바뀐 계좌로
  PERFORM pg_temp.inq('snapone', 50000);
  PERFORM public.partner_make_payouts('2026-11', now());
  IF (SELECT pay_bank_name || '/' || pay_bank_account FROM public.partner_payouts WHERE partner_id = pa AND month = '2026-11')
     <> '신한은행/110-222-333444' THEN
    RAISE EXCEPTION 'FAIL 새 정산은 바뀐 계좌';
  END IF;
  IF jsonb_array_length(public.partner_transfer_list('bad')) <> 0 THEN RAISE EXCEPTION 'FAIL 틀린 달은 빈 목록'; END IF;
  RAISE NOTICE 'PASS A 스냅샷: 만들 때 계좌 기록·바뀌어도 지급 전/지급 뒤 그대로·관리자 표시 스냅샷+바뀜·새 달은 새 계좌';
END $$;

-- ───────── A4) 원천징수 지급 내역(기간) ─────────
DO $$
DECLARE l jsonb; x jsonb;
BEGIN
  -- A3 에서 snapone 2026-10 정산(40,000)을 2026-11-03 01:00 UTC 에 지급 완료
  l := public.partner_paid_list('2026-11-01 00:00:00+00', '2026-12-01 00:00:00+00');
  SELECT e INTO x FROM jsonb_array_elements(l) e WHERE e->>'partner_name' = '김스냅';
  IF x IS NULL OR (x->>'gross')::int <> 40000 OR (x->>'income_tax')::int <> 1200 OR (x->>'local_tax')::int <> 120
     OR (x->>'net')::int <> 38680 OR x->>'phone' <> '01061110001' OR x->>'bank_account' <> '123456-01-987654' THEN
    RAISE EXCEPTION 'FAIL 지급 내역 한 줄: %', l;
  END IF;
  IF jsonb_array_length(public.partner_paid_list('2026-12-01 00:00:00+00', '2027-01-01 00:00:00+00')) <> 0 THEN
    RAISE EXCEPTION 'FAIL 기간 밖은 빠짐';
  END IF;
  IF jsonb_array_length(public.partner_paid_list('2026-12-01 00:00:00+00', '2026-11-01 00:00:00+00')) <> 0
     OR jsonb_array_length(public.partner_paid_list('2020-01-01 00:00:00+00', '2026-12-01 00:00:00+00')) <> 0 THEN
    RAISE EXCEPTION 'FAIL 거꾸로·400일 넘는 기간은 빈 목록';
  END IF;
  -- 지급 전 정산은 안 나온다
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(public.partner_paid_list('2000-01-01 00:00:00+00', '2001-01-01 00:00:00+00')) e) THEN
    RAISE EXCEPTION 'FAIL 엉뚱한 기간';
  END IF;
  RAISE NOTICE 'PASS A 지급 내역: 지급일 기간 안 paid 만·3%%/0.3%%·연락처·스냅샷 계좌, 잘못된 기간은 빈 목록';
END $$;

-- ───────── A5) 매월 1일 자동 정산: 한국 시간 1일 09:00 판정·멱등·카톡 차례 ─────────
DO $$
DECLARE pa uuid; pb uuid; r jsonb; n_before int; x public.partner_payout_runs%ROWTYPE;
BEGIN
  pa := pg_temp.partner('박자동', '01061110002', 'autoone');
  pb := pg_temp.partner('최자동', '01061110003', 'autotwo');
  PERFORM pg_temp.inq('autoone', 200000);   -- 20,000 → 실지급 19,340
  PERFORM pg_temp.inq('autotwo', 100000);   -- 10,000 → 실지급 9,670

  -- 한국 시간 12/1 08:59(= 11/30 23:59 UTC), 12/1 00:00 KST, 12/2 00:00 KST, 11/15 → 아직 아님
  FOREACH r IN ARRAY ARRAY[
    public.partner_auto_payouts('2026-11-30 23:59:00+00'),
    public.partner_auto_payouts('2026-11-30 15:00:00+00'),
    public.partner_auto_payouts('2026-12-01 15:00:00+00'),
    public.partner_auto_payouts('2026-11-15 03:00:00+00')] LOOP
    IF (r->>'due')::boolean THEN RAISE EXCEPTION 'FAIL 1일 09시 전·2일·보름은 안 돎: %', r; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.partner_payout_runs) THEN RAISE EXCEPTION 'FAIL 판정 전 기록 없음'; END IF;

  -- 12/1 09:00 KST(= 12/1 00:00 UTC) → 지난달(2026-11) 정산
  r := public.partner_auto_payouts('2026-12-01 00:00:00+00');
  IF NOT (r->>'due')::boolean OR NOT (r->>'created')::boolean OR r->>'run_month' <> '2026-12'
     OR r->>'payout_month' <> '2026-11' OR NOT (r->>'notify')::boolean THEN
    RAISE EXCEPTION 'FAIL 첫 실행: %', r;
  END IF;
  -- snapone 의 2026-11(5,000 → 실지급 4,835) 은 A3 에서 이미 지급 전으로 있었다 → 3명
  IF (r->>'partners')::int <> (SELECT count(*) FROM public.partner_payouts WHERE month = '2026-11' AND status = 'pending')
     OR (r->>'partners')::int <> 3
     OR (r->>'net_total')::int <> 19340 + 9670 + 4835 THEN
    RAISE EXCEPTION 'FAIL 인원·실지급 합계: %', r;
  END IF;
  SELECT count(*) INTO n_before FROM public.partner_payouts;

  -- 같은 날 다시(10:30 KST) — 정산을 또 만들지 않는다. 아직 카톡 결과를 안 적었으면 다시 보낼 차례(2번째)
  PERFORM pg_temp.inq('autoone', 100000);   -- 새로 생긴 payable 은 이번 달 자동 정산에 안 들어간다
  r := public.partner_auto_payouts('2026-12-01 01:30:00+00');
  IF (r->>'created')::boolean OR NOT (r->>'notify')::boolean OR (r->>'partners')::int <> 3 THEN
    RAISE EXCEPTION 'FAIL 두 번째 실행은 안 만들고 카톡만 다시: %', r;
  END IF;
  IF (SELECT count(*) FROM public.partner_payouts) <> n_before THEN RAISE EXCEPTION 'FAIL 정산이 늘면 안 됨'; END IF;
  IF (SELECT gross FROM public.partner_payouts WHERE partner_id = pa AND month = '2026-11') <> 20000 THEN
    RAISE EXCEPTION 'FAIL 두 번째 실행이 정산을 다시 계산함';
  END IF;

  -- 카톡 실패 기록 → 세 번째에 마지막으로 한 번 더, 그 뒤엔 그만
  PERFORM public.partner_auto_payouts_notified('2026-12', 'failed:http_500', '2026-12-01 01:31:00+00');
  r := public.partner_auto_payouts('2026-12-01 02:00:00+00');
  IF NOT (r->>'notify')::boolean THEN RAISE EXCEPTION 'FAIL 세 번째 시도: %', r; END IF;
  r := public.partner_auto_payouts('2026-12-01 02:30:00+00');
  IF (r->>'notify')::boolean THEN RAISE EXCEPTION 'FAIL 3번 넘으면 그만: %', r; END IF;
  SELECT * INTO x FROM public.partner_payout_runs WHERE run_month = '2026-12';
  IF x.notify_attempts <> 3 OR x.notified_at IS NOT NULL OR x.notify_status <> 'failed:http_500' THEN
    RAISE EXCEPTION 'FAIL 실행 기록: %', row_to_json(x);
  END IF;

  -- 다음 달 1일: 새 실행, 보내고 'ok' 적으면 다음 실행은 카톡 차례 아님
  r := public.partner_auto_payouts('2027-01-01 00:10:00+00');
  IF NOT (r->>'created')::boolean OR r->>'payout_month' <> '2026-12' OR (r->>'partners')::int <> 1
     OR NOT (r->>'notify')::boolean THEN
    RAISE EXCEPTION 'FAIL 1월 실행(12월 정산, 위에서 생긴 10,000 하나): %', r;
  END IF;
  r := public.partner_auto_payouts_notified('2027-01', 'ok', '2027-01-01 00:10:05+00');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL 기록'; END IF;
  r := public.partner_auto_payouts('2027-01-01 00:40:00+00');
  IF (r->>'notify')::boolean OR (r->>'created')::boolean THEN RAISE EXCEPTION 'FAIL 보낸 뒤엔 조용: %', r; END IF;
  IF (SELECT notified_at FROM public.partner_payout_runs WHERE run_month = '2027-01') <> '2027-01-01 00:10:05+00' THEN
    RAISE EXCEPTION 'FAIL 보낸 시각';
  END IF;
  IF (public.partner_auto_payouts_notified('2099-01', 'ok')->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL 없는 달'; END IF;

  RAISE NOTICE 'PASS A 자동 정산: KST 1일 09시 전·2일 안 돎·지난달 이름·멱등(두 번째 안 만듦)·카톡 최대 3번·ok 뒤 조용';
END $$;

-- ───────── A6) 0명이면 카톡 차례 아님 ─────────
DO $$
DECLARE r jsonb;
BEGIN
  -- 2027-02 실행: 지급 가능 수수료가 하나도 없다
  r := public.partner_auto_payouts('2027-02-01 03:00:00+00');
  IF NOT (r->>'created')::boolean OR (r->>'partners')::int <> 0 OR (r->>'notify')::boolean THEN
    RAISE EXCEPTION 'FAIL 0명: %', r;
  END IF;
  RAISE NOTICE 'PASS A 0명: 실행 기록은 남기고 카톡 차례는 아님';
END $$;

-- ───────── B1) 구조·권한 ─────────
DO $$
DECLARE f text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partners'
                  AND column_name = 'user_id' AND data_type = 'uuid') THEN
    RAISE EXCEPTION 'FAIL partners.user_id 없음';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.partners'::regclass AND contype = 'f'
                  AND confrelid = 'auth.users'::regclass) THEN
    RAISE EXCEPTION 'FAIL user_id 는 auth.users 참조';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.partner_account_changes'::regclass)
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('partner_account_changes', 'partners')) THEN
    RAISE EXCEPTION 'FAIL 변경 이력 표 RLS 켬·정책 0개(partners 도 정책 0개)';
  END IF;
  IF has_table_privilege('anon', 'public.partner_account_changes', 'SELECT')
     OR has_table_privilege('authenticated', 'public.partner_account_changes', 'SELECT')
     OR has_table_privilege('authenticated', 'public.partners', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL 브라우저 역할이 표를 읽을 수 있음';
  END IF;
  FOREACH f IN ARRAY ARRAY['public.partner_account_target(text)', 'public.partner_link_user(text, uuid, text)',
                            'public.partner_session(uuid)', 'public.partner_dashboard(uuid, text, timestamptz)',
                            'public.partner_update_profile(uuid, text, text)',
                            'public.partner_change_account(uuid, text, text, text, text, timestamptz)',
                            'public.partner_account_mail_target(uuid)',
                            'public.partner_account_mail_result(uuid, text, timestamptz)'] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL anon/authenticated 가 함수를 부를 수 있음: %', f;
    END IF;
    IF NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL service_role 이 함수를 못 부름: %', f;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS B 구조: user_id(auth.users·UNIQUE)·변경 이력 표 RLS(정책 0)·브라우저 역할 못 읽음·함수 service_role 만';
END $$;

-- ───────── B2) 계정 만들기: view_key 확인·이메일 같아야 연결·이미 계정 있음 ─────────
DO $$
DECLARE pa uuid; pb uuid; u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); k text; kb text; r jsonb; ap uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES (u1), (u2);
  pa := pg_temp.partner('정계정', '01071110001', 'acctone');
  pb := pg_temp.partner('한계정', '01071110002', 'accttwo');
  SELECT view_key INTO k FROM public.partners WHERE id = pa;
  SELECT view_key INTO kb FROM public.partners WHERE id = pb;

  r := public.partner_account_target(k);
  IF NOT (r->>'ok')::boolean OR r->>'email' <> 'acctone@partner.example.com' OR (r->>'has_account')::boolean
     OR r->>'name' <> '정계정' THEN
    RAISE EXCEPTION 'FAIL 계정 만들기 대상: %', r;
  END IF;
  IF (public.partner_account_target(repeat('0', 64))->>'ok')::boolean
     OR (public.partner_account_target('short')->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL 틀린 열쇠는 not_found';
  END IF;
  -- 신청 중(승인 전)은 열쇠가 없다 → 대상 아님
  r := public.partner_apply(jsonb_build_object('name', '신청만', 'phone', '01071110003', 'email', 'applyonly@example.com',
        'code', 'applyonly', 'channels', 'x', 'bank_name', '국민', 'bank_account', '123456789', 'bank_holder', '신청만'));
  ap := (r->>'id')::uuid;
  IF (SELECT view_key FROM public.partners WHERE id = ap) IS NOT NULL THEN RAISE EXCEPTION 'FAIL 준비'; END IF;

  -- 이메일이 다르면 연결 안 함
  r := public.partner_link_user(k, u1, 'someone@else.com');
  IF r->>'reason' <> 'email_mismatch' THEN RAISE EXCEPTION 'FAIL 이메일 다름: %', r; END IF;
  -- 틀린 열쇠
  r := public.partner_link_user(repeat('a', 64), u1, 'acctone@partner.example.com');
  IF r->>'reason' <> 'not_found' THEN RAISE EXCEPTION 'FAIL 틀린 열쇠 연결: %', r; END IF;
  -- 연결(대소문자 무시)
  r := public.partner_link_user(k, u1, ' AcctOne@Partner.Example.com ');
  IF NOT (r->>'ok')::boolean OR (SELECT user_id FROM public.partners WHERE id = pa) <> u1 THEN
    RAISE EXCEPTION 'FAIL 연결: %', r;
  END IF;
  -- 이미 계정 있음
  r := public.partner_link_user(k, u2, 'acctone@partner.example.com');
  IF r->>'reason' <> 'already_linked' THEN RAISE EXCEPTION 'FAIL 이미 계정: %', r; END IF;
  IF NOT (public.partner_account_target(k)->>'has_account')::boolean THEN RAISE EXCEPTION 'FAIL has_account 표시'; END IF;
  -- 한 계정을 두 파트너에 붙이지 못함
  r := public.partner_link_user(kb, u1, 'accttwo@partner.example.com');
  IF r->>'reason' <> 'user_taken' THEN RAISE EXCEPTION 'FAIL 한 계정 두 파트너: %', r; END IF;

  -- 로그인 판정: 연결 + 승인·일시정지만
  r := public.partner_session(u1);
  IF NOT (r->>'partner')::boolean OR r->>'code' <> 'acctone' THEN RAISE EXCEPTION 'FAIL 파트너 세션: %', r; END IF;
  IF (public.partner_session(u2)->>'partner')::boolean OR (public.partner_session(NULL)->>'partner')::boolean THEN
    RAISE EXCEPTION 'FAIL 연결 안 된 사람은 파트너 아님';
  END IF;
  PERFORM public.partner_set_status(pa, 'paused');
  IF NOT (public.partner_session(u1)->>'partner')::boolean THEN RAISE EXCEPTION 'FAIL 일시정지도 대시보드는 봄'; END IF;
  PERFORM public.partner_set_status(pa, 'rejected');
  IF (public.partner_session(u1)->>'partner')::boolean OR public.partner_dashboard(u1) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 거절이면 파트너 아님';
  END IF;
  PERFORM public.partner_set_status(pa, 'approved');

  -- 계정 만들기 메일 대상: 계정 있으면 has_account, 없으면 ok(이미 승인된 사람도), 신청 중은 not_approved
  IF public.partner_account_mail_target(pa)->>'reason' <> 'has_account' THEN RAISE EXCEPTION 'FAIL 메일 대상 has_account'; END IF;
  r := public.partner_account_mail_target(pb);
  IF NOT (r->>'ok')::boolean OR r->>'view_key' <> kb OR r->>'email' <> 'accttwo@partner.example.com' THEN
    RAISE EXCEPTION 'FAIL 메일 대상: %', r;
  END IF;
  IF public.partner_account_mail_target(ap)->>'reason' <> 'not_approved'
     OR public.partner_account_mail_target(gen_random_uuid())->>'reason' <> 'not_found' THEN
    RAISE EXCEPTION 'FAIL 메일 대상 아님';
  END IF;
  PERFORM public.partner_account_mail_result(pb, 'Gmail 연결 안 됨', '2026-11-07 01:00:00+00');
  PERFORM public.partner_account_mail_result(pb, NULL, '2026-11-07 02:00:00+00');
  IF (SELECT account_mail_sent_at FROM public.partners WHERE id = pb) <> '2026-11-07 02:00:00+00'
     OR (SELECT account_mail_error FROM public.partners WHERE id = pb) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 계정 메일 기록';
  END IF;
  r := public.partner_admin_overview(now());
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'partners') e WHERE e->>'code' = 'acctone' AND (e->>'user_linked')::boolean)
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'partners') e WHERE e->>'code' = 'accttwo'
                     AND NOT (e->>'user_linked')::boolean AND e->>'account_mail_sent_at' IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 관리자 화면 계정 표시';
  END IF;
  RAISE NOTICE 'PASS B 계정: view_key 확인·이메일 같아야 연결·이미 계정 있음·한 계정 한 파트너·세션 판정·계정 메일 대상/기록';
END $$;

-- ───────── B3) 대시보드: 기간(7일·30일·이번 달 KST)·전체 계좌 없음 ─────────
DO $$
DECLARE pa uuid; u uuid; d jsonb; t text; n timestamptz := '2026-11-20 03:00:00+00';
BEGIN
  SELECT id, user_id INTO pa, u FROM public.partners WHERE code = 'acctone';
  -- 방문: 2일 전·10일 전·40일 전, 그리고 이번 달 1일 00:30 KST(= 10/31 15:30 UTC)·10/31 23:00 KST(= 10/31 14:00 UTC)
  INSERT INTO public.site_visits (created_at, visitor_id, session_id, path, ref_code) VALUES
    (n - interval '2 days',  'visitor-aaaa', 'session-1111', '/', 'acctone'),
    (n - interval '2 days',  'visitor-aaaa', 'session-1112', '/reels', 'acctone'),
    (n - interval '10 days', 'visitor-bbbb', 'session-2222', '/', 'acctone'),
    (n - interval '40 days', 'visitor-cccc', 'session-3333', '/', 'acctone'),
    ('2026-10-31 15:30:00+00', 'visitor-dddd', 'session-4444', '/', 'acctone'),
    ('2026-10-31 14:00:00+00', 'visitor-eeee', 'session-5555', '/', 'acctone'),
    (n - interval '1 day',   'visitor-ffff', 'session-6666', '/', 'otherpp');
  INSERT INTO public.inquiries (name, contact, ref_code, created_at) VALUES
    ('손님1', '010-0000-0001', 'acctone', n - interval '3 days'),
    ('손님2', '010-0000-0002', 'acctone', n - interval '25 days');
  d := public.partner_dashboard(u, '7d', n);
  IF (d->>'visits')::int <> 1 OR (d->>'inquiries')::int <> 1 OR d->>'period' <> '7d' THEN RAISE EXCEPTION 'FAIL 7일: %', d; END IF;
  d := public.partner_dashboard(u, '30d', n);
  -- 30일: aaaa·bbbb·dddd·eeee (cccc 는 40일 전)
  IF (d->>'visits')::int <> 4 OR (d->>'inquiries')::int <> 2 THEN RAISE EXCEPTION 'FAIL 30일: %', d; END IF;
  d := public.partner_dashboard(u, 'month', n);
  -- 이번 달(11/1 00:00 KST = 10/31 15:00 UTC 부터): aaaa·bbbb·dddd
  IF (d->>'visits')::int <> 3 OR (d->>'since')::timestamptz <> '2026-10-31 15:00:00+00' THEN
    RAISE EXCEPTION 'FAIL 이번 달(한국 시간): %', d;
  END IF;
  IF public.partner_dashboard(u, 'nonsense', n)->>'period' <> '30d' THEN RAISE EXCEPTION 'FAIL 모르는 기간은 30일'; END IF;
  IF public.partner_dashboard(gen_random_uuid(), '30d', n) IS NOT NULL THEN RAISE EXCEPTION 'FAIL 연결 안 된 사람은 null'; END IF;

  -- 수수료·정산 목록, 차감 합계
  PERFORM pg_temp.inq('acctone', 100000);
  d := public.partner_dashboard(u, '30d', now());
  IF (d->>'sum_payable')::int <> 10000 OR jsonb_array_length(d->'commissions') <> 1 OR (d->>'paid_count')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL 수수료: %', d;
  END IF;
  -- 🚨 전체 계좌 번호가 응답 어디에도 없다(끝 4자리만)
  t := d::text;
  IF position('123456-01-987654' IN t) > 0 OR position('12345601987654' IN t) > 0 OR d ? 'bank_account' THEN
    RAISE EXCEPTION 'FAIL 대시보드에 전체 계좌가 있음: %', t;
  END IF;
  IF d->>'bank_last4' <> '7654' OR d->>'bank_name' <> '국민은행' OR d->>'bank_holder' <> '정계정'
     OR d->>'phone' <> '01071110001' OR d->>'email' <> 'acctone@partner.example.com' THEN
    RAISE EXCEPTION 'FAIL 내 정보·계좌 표시: %', d;
  END IF;
  RAISE NOTICE 'PASS B 대시보드: 7일·30일·이번 달(KST 1일부터) 방문·상담·결제, 연결 안 된 사람 null, 계좌 끝 4자리만';
END $$;

-- ───────── B4) 내 정보 수정 ─────────
DO $$
DECLARE u uuid; r jsonb;
BEGIN
  SELECT user_id INTO u FROM public.partners WHERE code = 'acctone';
  IF public.partner_update_profile(u, '02-123-4567', 'x')->>'reason' <> 'invalid'
     OR public.partner_update_profile(u, '01071119999', '  ')->>'reason' <> 'invalid' THEN
    RAISE EXCEPTION 'FAIL 형식';
  END IF;
  IF public.partner_update_profile(u, '010-7111-0002', 'x')->>'reason' <> 'phone_taken' THEN RAISE EXCEPTION 'FAIL 다른 파트너 번호'; END IF;
  IF public.partner_update_profile(gen_random_uuid(), '01071119999', 'x')->>'reason' <> 'not_found' THEN RAISE EXCEPTION 'FAIL 없는 사람'; END IF;
  r := public.partner_update_profile(u, '010-7111-9999', ' https://blog.example.com/me ');
  IF NOT (r->>'ok')::boolean OR (SELECT phone || '|' || channels FROM public.partners WHERE code = 'acctone')
     <> '01071119999|https://blog.example.com/me' THEN
    RAISE EXCEPTION 'FAIL 수정: %', r;
  END IF;
  RAISE NOTICE 'PASS B 내 정보: 휴대폰·채널만, 형식·다른 파트너 번호·없는 사람 거절';
END $$;

-- ───────── B5) 계좌 변경: 이력·정산 스냅샷 유지 ─────────
DO $$
DECLARE pa uuid; u uuid; r jsonb; h public.partner_account_changes%ROWTYPE; y public.partner_payouts%ROWTYPE; d jsonb;
BEGIN
  SELECT id, user_id INTO pa, u FROM public.partners WHERE code = 'acctone';
  -- 계좌 바꾸기 전에 지급 전 정산 하나(B3 의 10,000)
  PERFORM public.partner_make_payouts('2026-11', now());
  SELECT * INTO y FROM public.partner_payouts WHERE partner_id = pa AND month = '2026-11';
  IF y.pay_bank_account <> '123456-01-987654' THEN RAISE EXCEPTION 'FAIL 준비 정산'; END IF;

  IF public.partner_change_account(u, '', '110-222-333444', '정계정')->>'reason' <> 'invalid'
     OR public.partner_change_account(u, '신한은행', '12ab', '정계정')->>'reason' <> 'invalid'
     OR public.partner_change_account(u, '국민은행', '12345601987654', '정계정')->>'reason' <> 'same'
     OR public.partner_change_account(gen_random_uuid(), '신한은행', '110222333444', 'x')->>'reason' <> 'not_found' THEN
    RAISE EXCEPTION 'FAIL 계좌 변경 거절 사유';
  END IF;
  IF EXISTS (SELECT 1 FROM public.partner_account_changes WHERE partner_id = pa) THEN RAISE EXCEPTION 'FAIL 거절은 이력 없음'; END IF;

  r := public.partner_change_account(u, '신한은행', '110 222 335566', '정계정', 'iPhone Safari', '2026-11-07 05:03:00+00');
  IF NOT (r->>'ok')::boolean OR r->>'old_last4' <> '7654' OR r->>'new_last4' <> '5566' OR r->>'bank_name' <> '신한은행'
     OR r->>'name' <> '정계정' OR r ? 'bank_account' THEN
    RAISE EXCEPTION 'FAIL 변경 결과: %', r;
  END IF;
  SELECT * INTO h FROM public.partner_account_changes WHERE partner_id = pa;
  IF h.old_last4 <> '7654' OR h.new_last4 <> '5566' OR h.old_bank_name <> '국민은행' OR h.new_bank_name <> '신한은행'
     OR h.user_agent <> 'iPhone Safari' OR h.changed_at <> '2026-11-07 05:03:00+00' THEN
    RAISE EXCEPTION 'FAIL 이력: %', row_to_json(h);
  END IF;
  IF (SELECT bank_account FROM public.partners WHERE id = pa) <> '110222335566' THEN RAISE EXCEPTION 'FAIL 계좌 저장(공백 제거)'; END IF;
  -- 이미 만든 정산은 옛 계좌 그대로(대량이체 목록도)
  IF (SELECT pay_bank_name || '/' || pay_bank_account FROM public.partner_payouts WHERE id = y.id) <> '국민은행/123456-01-987654' THEN
    RAISE EXCEPTION 'FAIL 정산 스냅샷이 바뀜';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.partner_transfer_list('2026-11')) e
                  WHERE e->>'code' = 'acctone' AND e->>'bank_account' = '123456-01-987654') THEN
    RAISE EXCEPTION 'FAIL 대량이체는 스냅샷';
  END IF;
  d := public.partner_dashboard(u, '30d', now());
  IF d->>'bank_last4' <> '5566' OR d->>'account_changed_at' IS NULL OR position('110222335566' IN d::text) > 0 THEN
    RAISE EXCEPTION 'FAIL 대시보드 새 계좌 끝 4자리만: %', d;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.partner_admin_overview(now())->'partners') e
                  WHERE e->>'code' = 'acctone' AND e->>'last_account_change_at' IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 관리자 화면 계좌 변경 시각';
  END IF;
  -- user agent 는 120자까지
  r := public.partner_change_account(u, '우리은행', '1002-000-111111', '정계정', repeat('x', 300));
  IF (SELECT max(char_length(user_agent)) FROM public.partner_account_changes WHERE partner_id = pa) <> 120 THEN
    RAISE EXCEPTION 'FAIL user agent 자르기';
  END IF;
  RAISE NOTICE 'PASS B 계좌 변경: 형식·같음 거절, 이력(옛/새 은행·끝 4자리·UA), 이미 만든 정산·대량이체는 옛 계좌, 대시보드는 끝 4자리';
END $$;

ROLLBACK;
