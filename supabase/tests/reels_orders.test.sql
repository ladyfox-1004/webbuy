-- 릴스 판매 마이그레이션(20261106100000_reels_orders.sql) SQL 시험
--
-- 실행: deno run -A supabase/tests/run-sql-tests.ts  (메모리 Postgres, 운영 DB 에 연결하지 않음)
--       또는 로컬 Supabase 에서 psql -f 로도 돌릴 수 있다(BEGIN … ROLLBACK 이라 흔적이 남지 않음).
-- 규칙: 블록마다 성공하면 RAISE NOTICE 'PASS …', 틀리면 RAISE EXCEPTION 'FAIL …' (그 자리에서 멈춤).
-- 시간: 한 트랜잭션 안이라 now() 가 고정이다. 「7일 지남」「24시간 지남」은 paid_at·created_at 을 직접 과거로 돌려 흉내 낸다.

BEGIN;
SET LOCAL TimeZone = 'UTC';   -- Supabase 기본과 같게(한국 날짜는 함수가 Asia/Seoul 로 직접 바꾼다)

-- ───────── 시험 도우미(pg_temp, ROLLBACK 으로 사라짐) ─────────
CREATE FUNCTION pg_temp.kh(_k text) RETURNS text LANGUAGE sql AS
$$ SELECT encode(sha256(convert_to(_k, 'UTF8')), 'hex') $$;

-- 주문 입력 jsonb 만들기
CREATE FUNCTION pg_temp.o(_plan int, _lp int, _disc int, _trial boolean, _credit uuid, _insta text, _phone text, _key text DEFAULT 'k')
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'plan', _plan, 'list_price', _lp, 'discount', _disc, 'amount', _lp - _disc, 'is_trial', _trial,
    'credit_trial_order_id', _credit, 'shop_name', '시험 가게 ' || _insta, 'insta_id', _insta, 'phone', _phone,
    'email', _insta || '@example.com', 'method', 'send_materials', 'view_key_hash', pg_temp.kh(_key),
    'consent_version', 'reels-2026-11-06')
$$;

CREATE FUNCTION pg_temp.trial(_insta text, _phone text, _key text DEFAULT 'k') RETURNS jsonb LANGUAGE sql AS
$$ SELECT public.reels_create_order(pg_temp.o(1, 200000, 101000, true, NULL, _insta, _phone, _key)) $$;

-- 통보 기록 + 적용
CREATE FUNCTION pg_temp.ev(_p jsonb, _verified boolean DEFAULT true) RETURNS jsonb LANGUAGE sql AS
$$ SELECT public.reels_apply_event(public.reels_record_event(_p, 'feedback', _verified, CASE WHEN _verified THEN NULL ELSE 'hash 틀림' END)) $$;

-- 결제 완료 통보
CREATE FUNCTION pg_temp.pay(_order uuid, _mul text, _price text) RETURNS jsonb LANGUAGE sql AS
$$ SELECT pg_temp.ev(jsonb_build_object('pay_state', '4', 'var1', _order::text, 'var2', 'reels', 'mul_no', _mul, 'price', _price,
                                         'linkkey', 'LK', 'linkval', 'LV', 'hash', 'H', 'recvphone', '010-1234-5678')) $$;

CREATE FUNCTION pg_temp.ord(_id uuid) RETURNS public.reels_orders LANGUAGE sql AS
$$ SELECT * FROM public.reels_orders WHERE id = _id $$;

-- ───────── 1) 구조: RLS·버킷·cron·설정 ─────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['reels_settings','reels_order_counters','reels_orders','reels_payapp_events','reels_uploads'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN
      RAISE EXCEPTION 'FAIL RLS 꺼짐: %', t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t) THEN
      RAISE EXCEPTION 'FAIL 정책이 있으면 안 됨: %', t;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.reels_settings) <> 1 OR (SELECT enabled FROM public.reels_settings) THEN
    RAISE EXCEPTION 'FAIL 설정 행 1개·기본 꺼짐이어야 함';
  END IF;
  IF (SELECT consent_version FROM public.reels_settings) <> 'reels-2026-11-06' THEN
    RAISE EXCEPTION 'FAIL 동의 문구 버전';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'reels-uploads' AND NOT public
                   AND file_size_limit = 524288000 AND allowed_mime_types = ARRAY['image/*','video/*']) THEN
    RAISE EXCEPTION 'FAIL 버킷 reels-uploads 설정';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reels-expire-stale' AND schedule = '17 * * * *'
                   AND command = 'SELECT public.reels_expire_stale()') THEN
    RAISE EXCEPTION 'FAIL cron reels-expire-stale';
  END IF;
  RAISE NOTICE 'PASS 구조: RLS 켬·정책 없음·설정 기본 꺼짐·비공개 버킷·cron';
END $$;

-- 읽힐 행을 하나씩 만들어 둔다(아래 RLS 시험이 「0행」을 진짜 숨김으로 확인하도록)
UPDATE public.reels_settings SET enabled = true;
DO $$
DECLARE r jsonb; e bigint;
BEGIN
  r := pg_temp.trial('rls_shop', '01000000000');
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL 준비 주문: %', r; END IF;
  INSERT INTO public.reels_uploads (order_id, kind, note) VALUES ((r->>'order_id')::uuid, 'note', 'x');
  e := public.reels_record_event('{"pay_state":"1"}'::jsonb, 'feedback', true, NULL);
END $$;

-- 2) anon·authenticated 는 5개 표를 못 읽는다(권한 오류 또는 0행 둘 다 「못 읽음」)
DO $$
DECLARE r text; t text; n bigint; outcome text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH t IN ARRAY ARRAY['reels_settings','reels_order_counters','reels_orders','reels_payapp_events','reels_uploads'] LOOP
      BEGIN
        EXECUTE format('SET LOCAL ROLE %I', r);
        EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
        outcome := 'rows=' || n;
      EXCEPTION WHEN insufficient_privilege THEN
        outcome := 'denied';
      END;
      RESET ROLE;
      IF outcome NOT IN ('denied', 'rows=0') THEN
        RAISE EXCEPTION 'FAIL % 가 % 를 읽음(%)', r, t, outcome;
      END IF;
      -- 계약: RLS 와 별개로 표 권한 자체를 회수
      IF has_table_privilege(r, 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'FAIL % 에게 % 표 권한이 남아 있음', r, t;
      END IF;
    END LOOP;
  END LOOP;
  -- 권한을 잠깐 줘도 RLS(정책 없음) 때문에 0행이어야 한다
  GRANT SELECT ON public.reels_orders TO anon;
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM public.reels_orders;
  RESET ROLE;
  REVOKE SELECT ON public.reels_orders FROM anon;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL RLS 가 행을 숨기지 못함(%)', n; END IF;
  -- 쓰기도 못 한다
  BEGIN
    SET LOCAL ROLE anon;
    UPDATE public.reels_settings SET enabled = false;
    RESET ROLE;
    RAISE EXCEPTION 'FAIL anon 이 설정을 바꿈';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;
  RAISE NOTICE 'PASS RLS: anon·authenticated 는 5개 표를 못 읽고 못 씀';
END $$;

-- 3) 함수 권한: anon·authenticated 실행 불가, service_role 만 RPC 실행
DO $$
DECLARE f record; rpc text[] := ARRAY[
  'reels_shop_history','reels_create_order','reels_mark_requested','reels_record_event','reels_apply_event',
  'reels_mail_claim','reels_mail_done','reels_order_view','reels_add_upload','reels_expire_stale'];
  cnt int := 0; ok boolean;
BEGIN
  FOR f IN SELECT p.oid, p.proname, p.prosecdef, p.proconfig FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
            WHERE s.nspname = 'public' AND (p.proname LIKE 'reels\_%' OR p.proname LIKE '\_reels\_%') LOOP
    IF has_function_privilege('anon', f.oid, 'EXECUTE') OR has_function_privilege('authenticated', f.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL % 를 anon/authenticated 가 실행 가능', f.proname;
    END IF;
    IF NOT f.prosecdef OR NOT ('search_path=public' = ANY (coalesce(f.proconfig, '{}'))) THEN
      RAISE EXCEPTION 'FAIL % 는 SECURITY DEFINER + search_path=public 이어야 함', f.proname;
    END IF;
    IF f.proname = ANY (rpc) THEN
      cnt := cnt + 1;
      IF NOT has_function_privilege('service_role', f.oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'FAIL service_role 이 % 실행 불가', f.proname;
      END IF;
    ELSIF has_function_privilege('service_role', f.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL 내부 도우미 % 는 service_role 에도 열지 않음', f.proname;
    END IF;
  END LOOP;
  IF cnt <> 10 THEN RAISE EXCEPTION 'FAIL RPC 10개여야 함(%)', cnt; END IF;

  -- 실제로 anon 이 불러 보면 권한 오류
  ok := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.reels_expire_stale();
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  RESET ROLE;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL anon 이 reels_expire_stale 실행'; END IF;
  ok := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.reels_order_view('R261106-0001', repeat('a', 64));
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  RESET ROLE;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL anon 이 reels_order_view 실행'; END IF;
  ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.reels_create_order('{}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  RESET ROLE;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL authenticated 가 reels_create_order 실행'; END IF;

  -- service_role 은 RPC·표 모두 쓸 수 있다(관리 함수가 표를 직접 읽음)
  SET LOCAL ROLE service_role;
  PERFORM public.reels_expire_stale();
  PERFORM count(*) FROM public.reels_orders;
  PERFORM public.reels_shop_history('rls_shop', NULL);
  RESET ROLE;
  RAISE NOTICE 'PASS 함수 권한: RPC 10개 service_role 전용·내부 도우미 잠금·anon 실행 거부';
END $$;

-- ───────── 4) 주문번호 ─────────
DO $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  pfx text := 'R' || to_char((now() AT TIME ZONE 'Asia/Seoul')::date, 'YYMMDD') || '-';
  r1 jsonb; r2 jsonb; r3 jsonb;
BEGIN
  -- 위 준비 주문이 오늘 1번을 가져갔다. 어제 번호가 커도 오늘은 0001 부터 센다
  IF (SELECT order_no FROM public.reels_orders WHERE insta_id = 'rls_shop') <> pfx || '0001' THEN
    RAISE EXCEPTION 'FAIL 오늘 첫 주문번호: %', (SELECT order_no FROM public.reels_orders WHERE insta_id = 'rls_shop');
  END IF;
  INSERT INTO public.reels_order_counters (day, last_no) VALUES (today - 1, 41);
  r1 := public.reels_create_order(pg_temp.o(10, 1400000, 0, false, NULL, 'no_shop1', '01011110001'));
  r2 := public.reels_create_order(pg_temp.o(5, 750000, 0, false, NULL, 'no_shop2', '01011110002'));
  r3 := public.reels_create_order(pg_temp.o(5, 750000, 0, false, NULL, 'no_shop3', '01011110003'));
  IF r1->>'order_no' <> pfx || '0002' OR r2->>'order_no' <> pfx || '0003' OR r3->>'order_no' <> pfx || '0004' THEN
    RAISE EXCEPTION 'FAIL 같은 날 순번: % % %', r1->>'order_no', r2->>'order_no', r3->>'order_no';
  END IF;
  IF (SELECT last_no FROM public.reels_order_counters WHERE day = today - 1) <> 41 THEN
    RAISE EXCEPTION 'FAIL 어제 번호가 바뀜';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reels_orders WHERE order_no !~ '^R[0-9]{6}-[0-9]{4,}$') THEN
    RAISE EXCEPTION 'FAIL 주문번호 형식';
  END IF;
  IF (SELECT count(*) FROM public.reels_orders) <> (SELECT count(DISTINCT order_no) FROM public.reels_orders) THEN
    RAISE EXCEPTION 'FAIL 주문번호 중복';
  END IF;
  -- 순번은 날짜별 행 하나로 센다: 어제 행(41)은 그대로, 오늘 행만 1→4 로 늘었다
  IF (SELECT last_no FROM public.reels_order_counters WHERE day = today) <> 4 THEN
    RAISE EXCEPTION 'FAIL 오늘 카운터 = 4 여야 함(%)', (SELECT last_no FROM public.reels_order_counters WHERE day = today);
  END IF;
  -- 형식 제약: 틀린 번호는 DB 가 거부
  BEGIN
    UPDATE public.reels_orders SET order_no = 'X1' WHERE id = (r1->>'order_id')::uuid;
    RAISE EXCEPTION 'FAIL 틀린 주문번호를 받아들임';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS 주문번호: 형식·같은 날 순번 중복 없음·날짜별로 0001 부터';
END $$;

-- 5) 금액 제약
DO $$
DECLARE id1 uuid;
BEGIN
  SELECT id INTO id1 FROM public.reels_orders WHERE insta_id = 'no_shop1';
  BEGIN
    UPDATE public.reels_orders SET amount = 1 WHERE id = id1;
    RAISE EXCEPTION 'FAIL amount ≠ list_price - discount 를 받아들임';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.reels_orders SET discount = list_price - 500, amount = 500 WHERE id = id1;
    RAISE EXCEPTION 'FAIL amount < 1000 을 받아들임';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS 금액 제약: amount = list_price - discount, amount >= 1000';
END $$;

-- ───────── 6) create_order ─────────
DO $$
DECLARE r jsonb; n0 bigint;
BEGIN
  UPDATE public.reels_settings SET enabled = false;
  SELECT count(*) INTO n0 FROM public.reels_orders;
  r := pg_temp.trial('off_shop', '01022220000');
  IF r <> '{"ok": false, "reason": "disabled"}'::jsonb THEN RAISE EXCEPTION 'FAIL 꺼짐인데: %', r; END IF;
  IF (SELECT count(*) FROM public.reels_orders) <> n0 THEN RAISE EXCEPTION 'FAIL 꺼짐인데 주문이 생김'; END IF;
  UPDATE public.reels_settings SET enabled = true;
  RAISE NOTICE 'PASS create_order: 꺼짐이면 disabled, 주문 안 만듦';
END $$;

DO $$
DECLARE r jsonb; t uuid; c1 jsonb;
BEGIN
  -- 정가 틀림
  r := public.reels_create_order(pg_temp.o(5, 700000, 0, false, NULL, 'sq_shop', '01033330000'));
  IF r->>'reason' IS DISTINCT FROM 'stale_quote' THEN RAISE EXCEPTION 'FAIL 정가 틀림: %', r; END IF;
  r := public.reels_create_order(pg_temp.o(1, 200000, 0, false, NULL, 'sq_shop', '01033330000') || '{"amount": 190000}');
  IF r->>'reason' IS DISTINCT FROM 'stale_quote' THEN RAISE EXCEPTION 'FAIL 금액 계산 틀림: %', r; END IF;
  -- 체험인데 할인액 틀림 / 체험인데 5편
  r := public.reels_create_order(pg_temp.o(1, 200000, 100000, true, NULL, 'sq_shop', '01033330000'));
  IF r->>'reason' IS DISTINCT FROM 'stale_quote' THEN RAISE EXCEPTION 'FAIL 체험 할인 틀림: %', r; END IF;
  r := public.reels_create_order(pg_temp.o(5, 750000, 101000, true, NULL, 'sq_shop', '01033330000'));
  IF r->>'reason' IS DISTINCT FROM 'stale_quote' THEN RAISE EXCEPTION 'FAIL 5편 체험: %', r; END IF;
  -- 체험도 차감도 아닌데 할인
  r := public.reels_create_order(pg_temp.o(5, 750000, 99000, false, NULL, 'sq_shop', '01033330000'));
  IF r->>'reason' IS DISTINCT FROM 'stale_quote' THEN RAISE EXCEPTION 'FAIL 근거 없는 할인: %', r; END IF;

  -- 체험인데 같은 가게 paid 있음(인스타가 같거나 전화가 같거나)
  c1 := public.reels_create_order(pg_temp.o(5, 750000, 0, false, NULL, 'paid_shop', '01033331111'));
  IF NOT (pg_temp.pay((c1->>'order_id')::uuid, 'MPAID1', '750000')->>'result' = 'applied') THEN
    RAISE EXCEPTION 'FAIL 준비 결제';
  END IF;
  r := pg_temp.trial('paid_shop', '01099999999');
  IF r->>'reason' IS DISTINCT FROM 'stale_quote' THEN RAISE EXCEPTION 'FAIL 아이디 같은 가게 체험: %', r; END IF;
  r := pg_temp.trial('other_name', '01033331111');
  IF r->>'reason' IS DISTINCT FROM 'stale_quote' THEN RAISE EXCEPTION 'FAIL 번호 같은 가게 체험: %', r; END IF;

  -- 차감: 체험 결제 → 8일 지나면 거부, 6일이면 허용, 한 번 쓰면 다시 거부
  r := pg_temp.trial('cr_shop', '01044440000');
  t := (r->>'order_id')::uuid;
  IF pg_temp.pay(t, 'MTRIAL1', '99000')->>'result' <> 'applied' THEN RAISE EXCEPTION 'FAIL 체험 결제'; END IF;
  -- 차감 할인액 틀림
  r := public.reels_create_order(pg_temp.o(5, 750000, 101000, false, t, 'cr_shop', '01044440000'));
  IF r->>'reason' IS DISTINCT FROM 'stale_quote' THEN RAISE EXCEPTION 'FAIL 차감 할인액 틀림: %', r; END IF;
  -- 다른 가게가 남의 체험으로 차감
  r := public.reels_create_order(pg_temp.o(5, 750000, 99000, false, t, 'stranger', '01044449999'));
  IF r->>'reason' IS DISTINCT FROM 'stale_quote' THEN RAISE EXCEPTION 'FAIL 남의 체험 차감: %', r; END IF;
  -- 1편 주문에 차감
  r := public.reels_create_order(pg_temp.o(1, 200000, 99000, false, t, 'cr_shop', '01044440000'));
  IF r->>'reason' IS DISTINCT FROM 'stale_quote' THEN RAISE EXCEPTION 'FAIL 1편 차감: %', r; END IF;
  UPDATE public.reels_orders SET paid_at = now() - interval '8 days' WHERE id = t;
  r := public.reels_create_order(pg_temp.o(5, 750000, 99000, false, t, 'cr_shop', '01044440000'));
  IF r->>'reason' IS DISTINCT FROM 'stale_quote' THEN RAISE EXCEPTION 'FAIL 차감 7일 지남: %', r; END IF;
  UPDATE public.reels_orders SET paid_at = now() - interval '6 days' WHERE id = t;
  r := public.reels_create_order(pg_temp.o(5, 750000, 99000, false, t, 'cr_shop', '01044440000'));
  IF NOT (r->>'ok')::boolean OR (r->>'amount')::int <> 651000 THEN RAISE EXCEPTION 'FAIL 차감 6일째 허용: %', r; END IF;
  IF (pg_temp.ord((r->>'order_id')::uuid)).credit_trial_order_id IS DISTINCT FROM t THEN RAISE EXCEPTION 'FAIL credit 저장'; END IF;
  IF pg_temp.pay((r->>'order_id')::uuid, 'MCR1', '651000')->>'result' <> 'applied' THEN RAISE EXCEPTION 'FAIL 차감 주문 결제'; END IF;
  r := public.reels_create_order(pg_temp.o(10, 1400000, 99000, false, t, 'cr_shop', '01044440000'));
  IF r->>'reason' IS DISTINCT FROM 'stale_quote' THEN RAISE EXCEPTION 'FAIL 차감 이미 씀: %', r; END IF;
  -- 정상 묶음(차감 없음)은 된다
  r := public.reels_create_order(pg_temp.o(10, 1400000, 0, false, NULL, 'cr_shop', '01044440000'));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL 정가 묶음: %', r; END IF;
  RAISE NOTICE 'PASS create_order: stale_quote(정가·체험 중복·차감 7일·차감 이미 씀·할인액·남의 체험)';
END $$;

DO $$
DECLARE a jsonb; b jsonb; c jsonb;
BEGIN
  a := pg_temp.trial('exp_shop', '01055550000');
  b := pg_temp.trial('exp_shop_new', '01055550000');   -- 번호가 같은 가게
  IF NOT (b->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL 두 번째 체험: %', b; END IF;
  IF b->'expired_ids' <> jsonb_build_array(a->>'order_id') THEN RAISE EXCEPTION 'FAIL expired_ids: %', b; END IF;
  IF (pg_temp.ord((a->>'order_id')::uuid)).status <> 'expired' OR (pg_temp.ord((a->>'order_id')::uuid)).expired_at IS NULL THEN
    RAISE EXCEPTION 'FAIL 옛 체험이 만료되지 않음';
  END IF;
  IF (pg_temp.ord((b->>'order_id')::uuid)).status <> 'pending' THEN RAISE EXCEPTION 'FAIL 새 체험 pending'; END IF;
  -- 묶음 주문은 열린 체험을 건드리지 않는다
  c := public.reels_create_order(pg_temp.o(5, 750000, 0, false, NULL, 'exp_shop_new', '01055550000'));
  IF c->'expired_ids' <> '[]'::jsonb OR (pg_temp.ord((b->>'order_id')::uuid)).status <> 'pending' THEN
    RAISE EXCEPTION 'FAIL 묶음 주문이 체험을 만료시킴: %', c;
  END IF;
  -- 저장 값
  IF (pg_temp.ord((b->>'order_id')::uuid)).view_key_hashes <> ARRAY[pg_temp.kh('k')]
     OR (pg_temp.ord((b->>'order_id')::uuid)).consent_version <> 'reels-2026-11-06'
     OR (pg_temp.ord((b->>'order_id')::uuid)).amount <> 99000
     OR NOT (pg_temp.ord((b->>'order_id')::uuid)).is_trial THEN
    RAISE EXCEPTION 'FAIL 저장 값';
  END IF;
  RAISE NOTICE 'PASS create_order: 새 체험이면 같은 가게 옛 pending 체험 expired';
END $$;

-- 입력 검증: 틀린 값은 오류(엣지 함수가 먼저 거르므로 여기 오면 버그)
DO $$
DECLARE bad jsonb; ok boolean;
BEGIN
  FOREACH bad IN ARRAY ARRAY[
    pg_temp.o(3, 200000, 0, false, NULL, 'val_shop', '01066660000'),
    pg_temp.o(1, 200000, 0, false, NULL, 'Bad Insta!', '01066660000'),
    pg_temp.o(1, 200000, 0, false, NULL, 'val_shop', '0212345678'),
    pg_temp.o(1, 200000, 0, false, NULL, 'val_shop', '01066660000') || '{"method":"other"}',
    pg_temp.o(1, 200000, 0, false, NULL, 'val_shop', '01066660000') || '{"view_key_hash":"abc"}'
  ] LOOP
    ok := false;
    BEGIN
      PERFORM public.reels_create_order(bad);
    EXCEPTION WHEN OTHERS THEN ok := true;
    END;
    IF NOT ok THEN RAISE EXCEPTION 'FAIL 틀린 입력을 받아들임: %', bad; END IF;
  END LOOP;
  RAISE NOTICE 'PASS create_order: 틀린 plan·아이디·번호·방식·열쇠 해시는 오류';
END $$;

-- ───────── 7) record_event ─────────
DO $$
DECLARE e bigint; p jsonb; v record;
BEGIN
  e := public.reels_record_event('{"pay_state":"4","mul_no":"MREC","var1":"x","price":"99000","linkkey":"LK","linkval":"LV","hash":"H","recvphone":"010-1234-5678","userid":"u"}'::jsonb,
                                 'feedback', true, NULL);
  SELECT * INTO v FROM public.reels_payapp_events WHERE id = e;
  p := v.payload;
  IF p ? 'linkkey' OR p ? 'linkval' OR p ? 'hash' THEN RAISE EXCEPTION 'FAIL 비밀값이 남음: %', p; END IF;
  IF p->>'recvphone' <> '5678' THEN RAISE EXCEPTION 'FAIL 전화 끝 4자리: %', p; END IF;
  IF p->>'userid' <> 'u' OR v.mul_no <> 'MREC' OR v.pay_state <> 4 OR v.price <> '99000' OR v.var1 <> 'x' OR v.source <> 'feedback' THEN
    RAISE EXCEPTION 'FAIL 통보 열: %', row_to_json(v);
  END IF;
  IF v.result IS NOT NULL OR v.processed_at IS NOT NULL OR NOT v.verified THEN RAISE EXCEPTION 'FAIL 검증된 통보는 처리 전 상태'; END IF;
  e := public.reels_record_event('{"pay_state":"4","hash":"H"}'::jsonb, 'fail', false, 'hash 틀림');
  SELECT * INTO v FROM public.reels_payapp_events WHERE id = e;
  IF v.result <> 'error' OR v.processed_at IS NULL OR v.verified OR v.verify_error <> 'hash 틀림' OR v.source <> 'fail' OR v.payload ? 'hash' THEN
    RAISE EXCEPTION 'FAIL 검증 실패 통보: %', row_to_json(v);
  END IF;
  RAISE NOTICE 'PASS record_event: linkkey·linkval·hash 지움, recvphone 끝 4자리, 검증 실패는 바로 error';
END $$;

-- ───────── 8) apply_event ─────────
DO $$
DECLARE a jsonb; r jsonb; id1 uuid; o public.reels_orders;
BEGIN
  a := pg_temp.trial('pay_shop', '01077770000');
  id1 := (a->>'order_id')::uuid;
  r := pg_temp.pay(id1, 'MP1', '99000.0');
  o := pg_temp.ord(id1);
  IF r->>'result' <> 'applied' OR NOT (r->>'send_mail')::boolean OR (r->>'order_id')::uuid <> id1 THEN RAISE EXCEPTION 'FAIL 정상 결제: %', r; END IF;
  IF o.status <> 'paid' OR o.paid_at IS NULL OR o.mul_no <> 'MP1' OR o.needs_check THEN RAISE EXCEPTION 'FAIL 정상 결제 주문: %', row_to_json(o); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.reels_payapp_events WHERE mul_no = 'MP1' AND result = 'applied' AND order_id = id1 AND processed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 통보 행 기록';
  END IF;
  RAISE NOTICE 'PASS apply_event: 정상 결제 → paid + send_mail';

  r := pg_temp.pay(id1, 'MP1', '99000.0');
  IF r->>'result' <> 'duplicate' OR (r->>'send_mail')::boolean THEN RAISE EXCEPTION 'FAIL 같은 통보 두 번: %', r; END IF;
  IF (pg_temp.ord(id1)).paid_at <> o.paid_at THEN RAISE EXCEPTION 'FAIL 중복 통보가 주문을 바꿈'; END IF;
  RAISE NOTICE 'PASS apply_event: 같은 통보 두 번 → duplicate';

  r := pg_temp.ev(jsonb_build_object('pay_state', '9', 'var1', id1::text, 'mul_no', 'MP1', 'price', '99000'));
  o := pg_temp.ord(id1);
  IF r->>'result' <> 'applied' OR (r->>'send_mail')::boolean OR o.status <> 'cancelled' OR o.cancelled_at IS NULL THEN
    RAISE EXCEPTION 'FAIL 취소: % %', r, o.status;
  END IF;
  r := pg_temp.ev(jsonb_build_object('pay_state', '64', 'var1', id1::text, 'mul_no', 'MP1'));
  IF r->>'result' <> 'duplicate' THEN RAISE EXCEPTION 'FAIL 취소 두 번: %', r; END IF;
  -- 취소된 주문에 결제 완료가 다시 오면 확인 필요
  r := pg_temp.pay(id1, 'MP1', '99000');
  IF r->>'result' <> 'needs_review' OR NOT (pg_temp.ord(id1)).needs_check OR (pg_temp.ord(id1)).status <> 'cancelled' THEN
    RAISE EXCEPTION 'FAIL 취소 뒤 결제 통보: %', r;
  END IF;
  RAISE NOTICE 'PASS apply_event: 취소(9) → cancelled, 다시 오면 duplicate, 취소 뒤 결제는 needs_review';
END $$;

DO $$
DECLARE a jsonb; r jsonb; id1 uuid; o public.reels_orders;
BEGIN
  a := public.reels_create_order(pg_temp.o(5, 750000, 0, false, NULL, 'amt_shop', '01077771111'));
  id1 := (a->>'order_id')::uuid;
  r := pg_temp.pay(id1, 'MA1', '1000');
  o := pg_temp.ord(id1);
  IF r->>'result' <> 'needs_review' OR (r->>'send_mail')::boolean THEN RAISE EXCEPTION 'FAIL 금액 다름 결과: %', r; END IF;
  IF o.status <> 'paid' OR NOT o.needs_check OR o.check_reason NOT LIKE '금액 불일치: 통보 1000원 / 주문 750000원%' THEN
    RAISE EXCEPTION 'FAIL 금액 다름 주문: % %', o.status, o.check_reason;
  END IF;
  RAISE NOTICE 'PASS apply_event: 금액 다름 → needs_check + needs_review + send_mail false';

  r := pg_temp.ev(jsonb_build_object('pay_state', '70', 'var1', id1::text, 'mul_no', 'MA1', 'cancelprice', '5000'));
  o := pg_temp.ord(id1);
  IF r->>'result' <> 'needs_review' OR o.status <> 'paid' OR o.check_reason NOT LIKE '%부분 취소 5000원%' THEN
    RAISE EXCEPTION 'FAIL 부분 취소: % % %', r, o.status, o.check_reason;
  END IF;
  IF o.check_reason NOT LIKE '금액 불일치%' THEN RAISE EXCEPTION 'FAIL 앞선 확인 사유가 지워짐: %', o.check_reason; END IF;
  RAISE NOTICE 'PASS apply_event: 부분취소(70) → needs_check, 상태 그대로';

  -- 결제번호 다름
  a := public.reels_create_order(pg_temp.o(5, 750000, 0, false, NULL, 'mul_shop', '01077772222'));
  id1 := (a->>'order_id')::uuid;
  IF public.reels_mark_requested(id1, 'MX', 'https://payapp.example/pay', NULL) <> '{"ok": true}'::jsonb THEN RAISE EXCEPTION 'FAIL mark_requested'; END IF;
  IF (pg_temp.ord(id1)).payurl <> 'https://payapp.example/pay' OR (pg_temp.ord(id1)).mul_no <> 'MX' THEN RAISE EXCEPTION 'FAIL mark_requested 저장'; END IF;
  r := pg_temp.pay(id1, 'MY', '750000');
  IF r->>'result' <> 'needs_review' OR NOT (pg_temp.ord(id1)).needs_check OR (pg_temp.ord(id1)).status <> 'pending' THEN
    RAISE EXCEPTION 'FAIL 결제번호 다름: %', r;
  END IF;
  -- var1 이 uuid 가 아니면 mul_no 로 찾는다
  r := pg_temp.ev(jsonb_build_object('pay_state', '4', 'var1', 'not-a-uuid', 'mul_no', 'MX', 'price', '750000'));
  IF r->>'result' <> 'applied' OR (r->>'order_id')::uuid <> id1 OR (pg_temp.ord(id1)).status <> 'paid' THEN RAISE EXCEPTION 'FAIL mul_no 로 찾기: %', r; END IF;
  -- 결제창 실패
  a := public.reels_create_order(pg_temp.o(5, 750000, 0, false, NULL, 'mrq_shop', '01077773333'));
  PERFORM public.reels_mark_requested((a->>'order_id')::uuid, NULL, NULL, '페이앱 오류');
  o := pg_temp.ord((a->>'order_id')::uuid);
  IF o.status <> 'expired' OR o.request_error <> '페이앱 오류' OR o.expired_at IS NULL THEN RAISE EXCEPTION 'FAIL mark_requested 오류'; END IF;
  RAISE NOTICE 'PASS apply_event: 결제번호 다름 → needs_review, var1 없으면 mul_no 로 찾음, mark_requested';
END $$;

DO $$
DECLARE r jsonb;
BEGIN
  r := pg_temp.ev(jsonb_build_object('pay_state', '4', 'var1', (SELECT id::text FROM public.reels_orders WHERE insta_id = 'rls_shop'), 'mul_no', 'MV', 'price', '99000'), false);
  IF r->>'result' <> 'error' OR (r->>'send_mail')::boolean THEN RAISE EXCEPTION 'FAIL 검증 안 된 통보: %', r; END IF;
  IF (SELECT status FROM public.reels_orders WHERE insta_id = 'rls_shop') <> 'pending' THEN RAISE EXCEPTION 'FAIL 검증 안 된 통보가 주문을 바꿈'; END IF;
  r := pg_temp.pay(gen_random_uuid(), 'MUNKNOWN', '99000');
  IF r->>'result' <> 'ignored' OR r->'order_id' <> 'null'::jsonb THEN RAISE EXCEPTION 'FAIL 모르는 주문: %', r; END IF;
  r := pg_temp.ev(jsonb_build_object('pay_state', '1', 'var1', (SELECT id::text FROM public.reels_orders WHERE insta_id = 'rls_shop')));
  IF r->>'result' <> 'ignored' THEN RAISE EXCEPTION 'FAIL 모르는 상태값: %', r; END IF;
  RAISE NOTICE 'PASS apply_event: 검증 안 된 통보 → error, 모르는 주문 → ignored';
END $$;

DO $$
DECLARE a jsonb; b jsonb; r jsonb; o public.reels_orders;
BEGIN
  -- 체험 두 번 결제: 옛 체험(A, 만료됨)과 새 체험(B) 둘 다 결제 통보가 옴
  a := pg_temp.trial('dup_trial', '01088880000');
  b := pg_temp.trial('dup_trial', '01088880000');
  r := pg_temp.pay((b->>'order_id')::uuid, 'MDT2', '99000');
  IF r->>'result' <> 'applied' OR (pg_temp.ord((b->>'order_id')::uuid)).needs_check THEN RAISE EXCEPTION 'FAIL 첫 체험 결제: %', r; END IF;
  r := pg_temp.pay((a->>'order_id')::uuid, 'MDT1', '99000');
  o := pg_temp.ord((a->>'order_id')::uuid);
  IF r->>'result' <> 'applied' OR NOT (r->>'send_mail')::boolean THEN RAISE EXCEPTION 'FAIL 두 번째 체험 결제 결과: %', r; END IF;
  IF o.status <> 'paid' OR NOT o.needs_check OR o.check_reason NOT LIKE '같은 가게 체험 중복 결제(주문번호 ' || (b->>'order_no') || ')%' THEN
    RAISE EXCEPTION 'FAIL 체험 중복 표시: % %', o.status, o.check_reason;
  END IF;
  RAISE NOTICE 'PASS apply_event: 체험 두 번 결제 → 두 번째 주문 needs_check';
END $$;

DO $$
DECLARE t jsonb; c1 jsonb; c2 jsonb; r jsonb; o public.reels_orders;
BEGIN
  t := pg_temp.trial('dup_credit', '01088881111');
  PERFORM pg_temp.pay((t->>'order_id')::uuid, 'MDC0', '99000');
  c1 := public.reels_create_order(pg_temp.o(5, 750000, 99000, false, (t->>'order_id')::uuid, 'dup_credit', '01088881111'));
  c2 := public.reels_create_order(pg_temp.o(10, 1400000, 99000, false, (t->>'order_id')::uuid, 'dup_credit', '01088881111'));
  IF NOT (c1->>'ok')::boolean OR NOT (c2->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL 차감 주문 둘: % %', c1, c2; END IF;
  r := pg_temp.pay((c1->>'order_id')::uuid, 'MDC1', '651000');
  IF r->>'result' <> 'applied' OR (pg_temp.ord((c1->>'order_id')::uuid)).needs_check THEN RAISE EXCEPTION 'FAIL 첫 차감 결제: %', r; END IF;
  r := pg_temp.pay((c2->>'order_id')::uuid, 'MDC2', '1301000');
  o := pg_temp.ord((c2->>'order_id')::uuid);
  IF r->>'result' <> 'applied' OR o.status <> 'paid' OR NOT o.needs_check OR o.check_reason NOT LIKE '%체험 차감 중복%' || (c1->>'order_no') || '%' THEN
    RAISE EXCEPTION 'FAIL 차감 중복 표시: % %', r, o.check_reason;
  END IF;
  RAISE NOTICE 'PASS apply_event: 같은 체험 차감 두 주문 결제 → 두 번째 needs_check';
END $$;

-- ───────── 9) mail_claim·mail_done·order_view ─────────
DO $$
DECLARE c jsonb; id1 uuid; no1 text; m jsonb; v jsonb; u jsonb;
BEGIN
  SELECT id, order_no INTO id1, no1 FROM public.reels_orders WHERE insta_id = 'dup_credit' AND plan = 5;
  m := public.reels_mail_claim(id1, pg_temp.kh('mail-key'));
  IF m IS NULL OR m->>'order_no' <> no1 OR m->>'email' <> 'dup_credit@example.com' OR (m->>'amount')::int <> 651000
     OR (m->>'list_price')::int <> 750000 OR (m->>'discount')::int <> 99000 OR (m->>'plan')::int <> 5
     OR (m->>'is_trial')::boolean OR m->>'method' <> 'send_materials' OR m->>'paid_at' IS NULL OR m->>'shop_name' IS NULL THEN
    RAISE EXCEPTION 'FAIL mail_claim 내용: %', m;
  END IF;
  IF (pg_temp.ord(id1)).mail_status <> 'sending' OR (pg_temp.ord(id1)).view_key_hashes <> ARRAY[pg_temp.kh('k'), pg_temp.kh('mail-key')] THEN
    RAISE EXCEPTION 'FAIL mail_claim 저장';
  END IF;
  IF public.reels_mail_claim(id1, pg_temp.kh('again')) IS NOT NULL THEN RAISE EXCEPTION 'FAIL mail_claim 두 번'; END IF;
  IF cardinality((pg_temp.ord(id1)).view_key_hashes) <> 2 THEN RAISE EXCEPTION 'FAIL 두 번째 claim 이 열쇠를 더함'; END IF;
  -- 결제 전 주문은 null
  IF public.reels_mail_claim((SELECT id FROM public.reels_orders WHERE insta_id = 'rls_shop'), pg_temp.kh('x')) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 결제 전 mail_claim';
  END IF;
  PERFORM public.reels_mail_done(id1, 'sent');
  IF (pg_temp.ord(id1)).mail_status <> 'sent' OR (pg_temp.ord(id1)).mail_at IS NULL THEN RAISE EXCEPTION 'FAIL mail_done'; END IF;
  RAISE NOTICE 'PASS mail_claim: 한 번만 나옴 + 열쇠 해시 추가, mail_done 기록';

  v := public.reels_order_view(no1, pg_temp.kh('k'));
  IF v IS NULL OR v->>'order_no' <> no1 OR (v->>'id')::uuid <> id1 OR v->>'status' <> 'paid' OR v->'uploads' <> '[]'::jsonb THEN
    RAISE EXCEPTION 'FAIL order_view: %', v;
  END IF;
  IF v ?| ARRAY['phone','email','needs_check','check_reason','insta_id','view_key_hashes','mul_no','check_note'] THEN
    RAISE EXCEPTION 'FAIL order_view 에 숨길 값: %', v;
  END IF;
  IF NOT (v ?& ARRAY['plan','list_price','discount','amount','is_trial','paid_at','created_at','shop_name','method']) THEN
    RAISE EXCEPTION 'FAIL order_view 키 빠짐: %', v;
  END IF;
  IF public.reels_order_view(no1, pg_temp.kh('mail-key')) IS NULL THEN RAISE EXCEPTION 'FAIL 메일 열쇠로 못 봄'; END IF;
  IF public.reels_order_view(no1, pg_temp.kh('wrong')) IS NOT NULL THEN RAISE EXCEPTION 'FAIL 틀린 열쇠로 봄'; END IF;
  IF public.reels_order_view('R000000-0001', pg_temp.kh('k')) IS NOT NULL THEN RAISE EXCEPTION 'FAIL 없는 주문번호로 봄'; END IF;
  IF public.reels_order_view(no1, NULL) IS NOT NULL THEN RAISE EXCEPTION 'FAIL 열쇠 없이 봄'; END IF;
  RAISE NOTICE 'PASS order_view: 열쇠 틀리면 null, 전화·이메일·needs_check 없음';

  -- add_upload
  u := public.reels_add_upload((SELECT id FROM public.reels_orders WHERE insta_id = 'rls_shop'), 'file', 'x/a.jpg', 'a.jpg', 'image/jpeg', 10, NULL, NULL);
  IF u <> '{"ok": false, "reason": "not_paid"}'::jsonb THEN RAISE EXCEPTION 'FAIL 결제 전 업로드: %', u; END IF;
  u := public.reels_add_upload(id1, 'file', id1::text || '/a.jpg', 'a.jpg', 'image/jpeg', 1234, NULL, NULL);
  IF NOT (u->>'ok')::boolean OR u->>'id' IS NULL THEN RAISE EXCEPTION 'FAIL 업로드: %', u; END IF;
  u := public.reels_add_upload(id1, 'reference', NULL, NULL, NULL, NULL, 'https://www.instagram.com/reel/abc/', NULL);
  IF NOT (u->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL 참고 주소: %', u; END IF;
  v := public.reels_order_view(no1, pg_temp.kh('k'));
  IF jsonb_array_length(v->'uploads') <> 2 OR NOT (v->'uploads'->0 ?& ARRAY['id','kind','file_name','mime','size_bytes','url','note','created_at'])
     OR v->'uploads'->0 ? 'storage_path' THEN
    RAISE EXCEPTION 'FAIL order_view uploads: %', v->'uploads';
  END IF;
  INSERT INTO public.reels_uploads (order_id, kind, note) SELECT id1, 'note', 'n' || g FROM generate_series(1, 198) g;
  u := public.reels_add_upload(id1, 'note', NULL, NULL, NULL, NULL, NULL, '한 줄 더');
  IF u->>'reason' IS DISTINCT FROM 'too_many' THEN RAISE EXCEPTION 'FAIL 200개 넘음: %', u; END IF;
  RAISE NOTICE 'PASS add_upload: 결제 전 거부, 저장, 200개 넘으면 too_many';
END $$;

-- ───────── 10) shop_history ─────────
DO $$
DECLARE h jsonb;
BEGIN
  h := public.reels_shop_history('dup_credit', NULL);
  IF jsonb_typeof(h) <> 'array' OR jsonb_array_length(h) <> 3 THEN RAISE EXCEPTION 'FAIL 아이디로 이력: %', h; END IF;
  IF NOT (h->0 ?& ARRAY['id','order_no','plan','is_trial','status','amount','paid_at','created_at','credit_trial_order_id','insta_id','phone']) THEN
    RAISE EXCEPTION 'FAIL 이력 키: %', h->0;
  END IF;
  h := public.reels_shop_history('nobody', '01088881111');
  IF jsonb_array_length(h) <> 3 THEN RAISE EXCEPTION 'FAIL 번호로 이력: %', h; END IF;
  h := public.reels_shop_history('nobody', '01000001234');
  IF h <> '[]'::jsonb THEN RAISE EXCEPTION 'FAIL 없는 가게 이력: %', h; END IF;
  RAISE NOTICE 'PASS shop_history: 아이디 또는 번호로 찾음, 없으면 []';
END $$;

-- ───────── 11) expire_stale ─────────
DO $$
DECLARE a jsonb; b jsonb; r jsonb;
BEGIN
  a := public.reels_create_order(pg_temp.o(5, 750000, 0, false, NULL, 'stale_a', '01099990001'));
  b := public.reels_create_order(pg_temp.o(5, 750000, 0, false, NULL, 'stale_b', '01099990002'));
  UPDATE public.reels_orders SET created_at = now() - interval '25 hours' WHERE id = (a->>'order_id')::uuid;
  UPDATE public.reels_orders SET created_at = now() - interval '23 hours' WHERE id = (b->>'order_id')::uuid;
  -- 결제 완료된 오래된 주문은 그대로
  UPDATE public.reels_orders SET created_at = now() - interval '30 hours' WHERE insta_id = 'pay_shop';
  r := public.reels_expire_stale();
  IF (r->>'expired_orders')::int <> 1 THEN RAISE EXCEPTION 'FAIL 만료 개수: %', r; END IF;
  IF (pg_temp.ord((a->>'order_id')::uuid)).status <> 'expired' OR (pg_temp.ord((a->>'order_id')::uuid)).expired_at IS NULL
     OR (pg_temp.ord((b->>'order_id')::uuid)).status <> 'pending' THEN
    RAISE EXCEPTION 'FAIL 24시간 기준';
  END IF;
  IF (SELECT status FROM public.reels_orders WHERE insta_id = 'pay_shop') <> 'cancelled' THEN RAISE EXCEPTION 'FAIL 다른 상태를 건드림'; END IF;
  RAISE NOTICE 'PASS expire_stale: pending 24시간 지나면 expired';
END $$;

-- ───────── 12) 순번이 4자리를 넘어도 형식 유지 ─────────
DO $$
DECLARE r jsonb;
BEGIN
  UPDATE public.reels_order_counters SET last_no = 9999 WHERE day = (now() AT TIME ZONE 'Asia/Seoul')::date;
  r := public.reels_create_order(pg_temp.o(5, 750000, 0, false, NULL, 'big_no', '01099990003'));
  IF r->>'order_no' !~ '^R[0-9]{6}-10000$' THEN RAISE EXCEPTION 'FAIL 다섯 자리 순번: %', r->>'order_no'; END IF;
  RAISE NOTICE 'PASS 주문번호: 9999 다음은 10000(잘리지 않음)';
END $$;

-- ───────── 13) 체험 결제 → 취소·환불한 가게는 체험 썼음(11/6 대표님 결정) ─────────
DO $$
DECLARE t jsonb; r jsonb; o public.reels_orders; h jsonb; x jsonb;
BEGIN
  t := pg_temp.trial('refund_shop', '01055510000');
  PERFORM pg_temp.pay((t->>'order_id')::uuid, 'MRF1', '99000');
  r := pg_temp.ev(jsonb_build_object('pay_state', '9', 'var1', t->>'order_id', 'mul_no', 'MRF1', 'price', '99000'));
  o := pg_temp.ord((t->>'order_id')::uuid);
  IF o.status IS DISTINCT FROM 'cancelled' OR o.paid_at IS NULL THEN RAISE EXCEPTION 'FAIL 환불 뒤 paid_at 유지: % % % %', o.status, o.paid_at, t, r; END IF;
  -- shop_history 가 paid_at 을 돌려준다(엣지 함수 computeQuote 가 이 값으로 판정)
  h := public.reels_shop_history('refund_shop', '01055510000');
  IF (SELECT count(*) FROM jsonb_array_elements(h) e WHERE e->>'paid_at' IS NOT NULL AND e->>'status' = 'cancelled') <> 1 THEN
    RAISE EXCEPTION 'FAIL shop_history paid_at: %', h;
  END IF;
  -- 1편 체험 다시 → stale_quote (아이디만·번호만 겹쳐도)
  x := pg_temp.trial('refund_shop', '01055510000');
  IF (x->>'ok')::boolean OR x->>'reason' <> 'stale_quote' THEN RAISE EXCEPTION 'FAIL 환불 가게 체험 재주문: %', x; END IF;
  x := pg_temp.trial('refund_shop', '01055519999');
  IF (x->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL 아이디만 겹침 체험: %', x; END IF;
  x := pg_temp.trial('refund_other', '01055510000');
  IF (x->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL 번호만 겹침 체험: %', x; END IF;
  -- 1편 정가는 된다
  x := public.reels_create_order(pg_temp.o(1, 200000, 0, false, NULL, 'refund_shop', '01055510000'));
  IF NOT (x->>'ok')::boolean OR (x->>'amount')::int <> 200000 THEN RAISE EXCEPTION 'FAIL 환불 가게 1편 정가: %', x; END IF;
  -- 환불된 체험으로 묶음 차감 → stale_quote
  x := public.reels_create_order(pg_temp.o(5, 750000, 99000, false, (t->>'order_id')::uuid, 'refund_shop', '01055510000'));
  IF (x->>'ok')::boolean OR x->>'reason' <> 'stale_quote' THEN RAISE EXCEPTION 'FAIL 환불 체험 차감: %', x; END IF;
  RAISE NOTICE 'PASS 체험 결제→취소 가게: 1편 체험 불가(정가 200,000)·묶음 차감 없음';
END $$;

DO $$
DECLARE a jsonb; x jsonb;
BEGIN
  -- 결제 안 하고 만료된 체험 → 자격 유지
  a := pg_temp.trial('expired_shop', '01055511111');
  UPDATE public.reels_orders SET created_at = now() - interval '25 hours' WHERE id = (a->>'order_id')::uuid;
  PERFORM public.reels_expire_stale();
  IF (pg_temp.ord((a->>'order_id')::uuid)).status <> 'expired' THEN RAISE EXCEPTION 'FAIL 만료 준비'; END IF;
  x := pg_temp.trial('expired_shop', '01055511111');
  IF NOT (x->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL 만료 체험 뒤 자격 유지: %', x; END IF;
  -- 결제 안 하고 요청 취소(8)된 체험도 자격 유지
  PERFORM pg_temp.ev(jsonb_build_object('pay_state', '8', 'var1', x->>'order_id', 'mul_no', 'MEX8', 'price', '99000'));
  IF (pg_temp.ord((x->>'order_id')::uuid)).status <> 'cancelled' THEN RAISE EXCEPTION 'FAIL 요청 취소'; END IF;
  x := pg_temp.trial('expired_shop', '01055511111');
  IF NOT (x->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL 결제 전 취소 뒤 자격 유지: %', x; END IF;
  RAISE NOTICE 'PASS 결제 안 한 만료·취소 체험은 세지 않음(체험 자격 유지)';
END $$;

DO $$
DECLARE t jsonb; b jsonb; r jsonb; o public.reels_orders;
BEGIN
  -- 환불된 체험이 있는데 동시에 열어 둔 다른 체험이 결제되면 확인 필요
  t := pg_temp.trial('refund_dup', '01055512222');
  b := pg_temp.trial('refund_dup', '01055512222');  -- t 는 만료됨
  PERFORM pg_temp.pay((t->>'order_id')::uuid, 'MRD1', '99000');
  PERFORM pg_temp.ev(jsonb_build_object('pay_state', '9', 'var1', t->>'order_id', 'mul_no', 'MRD1', 'price', '99000'));
  r := pg_temp.pay((b->>'order_id')::uuid, 'MRD2', '99000');
  o := pg_temp.ord((b->>'order_id')::uuid);
  IF NOT o.needs_check OR o.check_reason NOT LIKE '같은 가게 체험 중복 결제%' THEN RAISE EXCEPTION 'FAIL 환불 체험 뒤 체험 결제 표시: %', o.check_reason; END IF;
  RAISE NOTICE 'PASS apply_event: 환불된 체험이 있는 가게의 체험 결제 → needs_check';
END $$;

ROLLBACK;
