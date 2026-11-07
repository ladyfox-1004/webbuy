-- 영업 메일 후보 풀·쿼터·자동 고르기(20261107140000_outreach_candidates.sql) SQL 시험
--
-- 실행: deno run -A supabase/tests/run-sql-tests.ts  (메모리 Postgres, 운영 DB 에 연결하지 않음)
-- 규칙: 블록마다 성공하면 RAISE NOTICE 'PASS …', 틀리면 RAISE EXCEPTION 'FAIL …'.

BEGIN;

-- ───────── 1) 구조: RLS·정책·권한 ─────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['public.outreach_candidates', 'public.outreach_quota'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = t::regclass) THEN
      RAISE EXCEPTION 'FAIL % RLS 꺼짐', t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname || '.' || tablename = t) THEN
      RAISE EXCEPTION 'FAIL % 정책이 있으면 안 됨', t;
    END IF;
    IF has_table_privilege('anon', t, 'SELECT') OR has_table_privilege('anon', t, 'INSERT')
       OR has_table_privilege('authenticated', t, 'SELECT') OR has_table_privilege('authenticated', t, 'UPDATE') THEN
      RAISE EXCEPTION 'FAIL % anon/authenticated 에 권한이 남아 있음', t;
    END IF;
    IF NOT has_table_privilege('service_role', t, 'SELECT') OR NOT has_table_privilege('service_role', t, 'INSERT')
       OR NOT has_table_privilege('service_role', t, 'UPDATE') THEN
      RAISE EXCEPTION 'FAIL % service_role 권한 부족', t;
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'public.outreach_add_drafts(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.outreach_add_drafts(jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.outreach_quota_add(date, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.outreach_quota_add(date, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon/authenticated 가 함수를 실행할 수 있음';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.outreach_add_drafts(jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.outreach_quota_add(date, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL service_role 이 함수를 못 씀';
  END IF;
  RAISE NOTICE 'PASS 구조: 두 표 RLS 켬·정책 0개·anon/authenticated 권한 없음·함수 둘 service_role 만';
END $$;

-- ───────── 2) 후보 풀: 기본값·상태·소문자 이메일 ─────────
DO $$
BEGIN
  INSERT INTO public.outreach_candidates (channel_id, channel_name, channel_url, email)
  VALUES ('UC_a', '가 채널', 'https://www.youtube.com/channel/UC_a', 'a@x.com'),
         ('UC_b', '나 채널', 'https://www.youtube.com/channel/UC_b', NULL);
  IF (SELECT status FROM public.outreach_candidates WHERE channel_id = 'UC_a') <> 'new'
     OR (SELECT business_score FROM public.outreach_candidates WHERE channel_id = 'UC_a') <> 0 THEN
    RAISE EXCEPTION 'FAIL 기본값 status=new·business_score=0 이 아님';
  END IF;
  BEGIN
    INSERT INTO public.outreach_candidates (channel_id, channel_name, channel_url, email) VALUES ('UC_c', 'c', 'u', 'Big@X.com');
    RAISE EXCEPTION 'FAIL 대문자 이메일이 들어감';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.outreach_candidates SET status = 'sent' WHERE channel_id = 'UC_a';
    RAISE EXCEPTION 'FAIL 모르는 상태가 들어감';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.outreach_candidates SET status = 'rejected', reject_reason = '최근 90일 쇼츠 3개', checked_at = now() WHERE channel_id = 'UC_b';
  UPDATE public.outreach_candidates SET status = 'checked_ok' WHERE channel_id = 'UC_a';
  UPDATE public.outreach_candidates SET status = 'drafted' WHERE channel_id = 'UC_a';
  -- 같은 channel_id 는 do nothing(검색 결과 넣기)
  INSERT INTO public.outreach_candidates (channel_id, channel_name, channel_url) VALUES ('UC_a', '덮어쓰기', 'u') ON CONFLICT (channel_id) DO NOTHING;
  IF (SELECT channel_name FROM public.outreach_candidates WHERE channel_id = 'UC_a') <> '가 채널' THEN
    RAISE EXCEPTION 'FAIL 이미 있는 후보가 덮였음';
  END IF;
  RAISE NOTICE 'PASS 후보 풀: 기본 new·점수 0·대문자 이메일 거절·상태 4개만·중복은 그대로';
END $$;

-- ───────── 3) 설정: auto_pick 기본 켜짐·pick_cursor 0 ─────────
DO $$
BEGIN
  IF NOT (SELECT auto_pick FROM public.outreach_settings WHERE id = 1)
     OR (SELECT pick_cursor FROM public.outreach_settings WHERE id = 1) <> 0
     OR NOT (SELECT auto_send FROM public.outreach_settings WHERE id = 1) THEN
    RAISE EXCEPTION 'FAIL auto_pick=true·pick_cursor=0·auto_send 그대로 가 아님';
  END IF;
  BEGIN
    UPDATE public.outreach_settings SET auto_pick = NULL WHERE id = 1;
    RAISE EXCEPTION 'FAIL auto_pick 이 비어도 들어감';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.outreach_settings SET pick_cursor = -1 WHERE id = 1;
    RAISE EXCEPTION 'FAIL 음수 위치가 들어감';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.outreach_settings SET auto_pick = false, pick_cursor = 5 WHERE id = 1;
  IF (SELECT auto_pick FROM public.outreach_settings WHERE id = 1) THEN RAISE EXCEPTION 'FAIL 끄기 안 됨'; END IF;
  RAISE NOTICE 'PASS 설정: auto_pick 기본 켜짐·끄기 가능·빈 값 거절·pick_cursor 0 이상';
END $$;

-- ───────── 4) 쿼터 더하기: 원자적으로 쌓인다 ─────────
DO $$
DECLARE v int;
BEGIN
  v := public.outreach_quota_add('2026-11-07', 101);
  IF v <> 101 THEN RAISE EXCEPTION 'FAIL 첫 더하기 %', v; END IF;
  v := public.outreach_quota_add('2026-11-07', 31);
  IF v <> 132 THEN RAISE EXCEPTION 'FAIL 두 번째 더하기 %', v; END IF;
  v := public.outreach_quota_add('2026-11-07', -50);
  IF v <> 132 THEN RAISE EXCEPTION 'FAIL 음수가 빠졌음 %', v; END IF;
  v := public.outreach_quota_add('2026-11-08', 3);
  IF v <> 3 OR (SELECT count(*) FROM public.outreach_quota) <> 2 THEN RAISE EXCEPTION 'FAIL 날짜별로 안 나뉨'; END IF;
  RAISE NOTICE 'PASS 쿼터: 날짜별로 더해지고 음수는 0 으로';
END $$;

-- ───────── 5) 초안 넣기: 계약 열·기본값·email/channel_id 충돌은 조용히 건너뜀 ─────────
DO $$
DECLARE n int;
BEGIN
  INSERT INTO public.outreach_drafts (batch_date, channel_id, channel_name, channel_url, email, status)
  VALUES ('2026-08-11', 'UC_old', '옛 채널', 'https://www.youtube.com/channel/UC_old', 'old@x.com', 'sent');

  SELECT count(*) INTO n FROM public.outreach_add_drafts('[
    {"batch_date":"2026-11-07","channel_id":"UC_n1","channel_name":"새1","channel_url":"https://www.youtube.com/@n1","subscribers":5000,"niche":"법률","top_title":"제목","top_url":"https://www.youtube.com/watch?v=1","email":"New1@X.com"},
    {"batch_date":"2026-11-07","channel_id":"UC_old","channel_name":"채널 겹침","channel_url":"u","subscribers":1,"niche":"","top_title":null,"top_url":null,"email":"other@x.com"},
    {"batch_date":"2026-11-07","channel_id":"UC_n3","channel_name":"주소 겹침","channel_url":"u","subscribers":1,"niche":"","top_title":null,"top_url":null,"email":"old@x.com"},
    {"batch_date":"2026-11-07","channel_id":"UC_n4","channel_name":"새4","channel_url":"u","subscribers":2000,"niche":"","top_title":null,"top_url":null,"email":"n4@x.com"}
  ]'::jsonb);
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL 들어간 수 % (2 여야 함)', n; END IF;
  IF (SELECT email FROM public.outreach_drafts WHERE channel_id = 'UC_n1') <> 'new1@x.com'
     OR (SELECT status FROM public.outreach_drafts WHERE channel_id = 'UC_n1') <> 'ready'
     OR (SELECT subscribers FROM public.outreach_drafts WHERE channel_id = 'UC_n1') <> 5000 THEN
    RAISE EXCEPTION 'FAIL 소문자·ready·구독자 값이 틀림';
  END IF;
  IF (SELECT channel_name FROM public.outreach_drafts WHERE channel_id = 'UC_old') <> '옛 채널' THEN
    RAISE EXCEPTION 'FAIL 이미 있던 초안이 바뀜';
  END IF;
  SELECT count(*) INTO n FROM public.outreach_add_drafts('[]'::jsonb);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 빈 목록'; END IF;
  RAISE NOTICE 'PASS 초안 넣기: 계약 열만·ready 기본·email/channel_id 충돌 건너뜀·소문자';
END $$;

ROLLBACK;
