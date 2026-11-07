-- 영업 메일 자동 발송 스위치(20261107130000_outreach_settings.sql) SQL 시험
--
-- 실행: deno run -A supabase/tests/run-sql-tests.ts  (메모리 Postgres, 운영 DB 에 연결하지 않음)
-- 규칙: 블록마다 성공하면 RAISE NOTICE 'PASS …', 틀리면 RAISE EXCEPTION 'FAIL …'.

BEGIN;

-- ───────── 1) 구조: RLS·정책·권한 ─────────
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.outreach_settings'::regclass) THEN
    RAISE EXCEPTION 'FAIL RLS 꺼짐';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'outreach_settings') THEN
    RAISE EXCEPTION 'FAIL 정책이 있으면 안 됨';
  END IF;
  IF has_table_privilege('anon', 'public.outreach_settings', 'SELECT')
     OR has_table_privilege('anon', 'public.outreach_settings', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.outreach_settings', 'SELECT')
     OR has_table_privilege('authenticated', 'public.outreach_settings', 'UPDATE') THEN
    RAISE EXCEPTION 'FAIL anon/authenticated 에 권한이 남아 있음';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.outreach_settings', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.outreach_settings', 'UPDATE') THEN
    RAISE EXCEPTION 'FAIL service_role 권한 부족';
  END IF;
  RAISE NOTICE 'PASS 구조: RLS 켬·정책 0개·anon/authenticated 권한 없음·service_role 만';
END $$;

-- ───────── 2) 행 하나·기본값 켜짐 ─────────
DO $$
BEGIN
  IF (SELECT count(*) FROM public.outreach_settings) <> 1
     OR NOT (SELECT auto_send FROM public.outreach_settings WHERE id = 1) THEN
    RAISE EXCEPTION 'FAIL 처음 행이 1개·auto_send=true 가 아님';
  END IF;
  BEGIN
    INSERT INTO public.outreach_settings (id, auto_send) VALUES (2, false);
    RAISE EXCEPTION 'FAIL id=2 행이 들어감';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.outreach_settings SET auto_send = NULL WHERE id = 1;
    RAISE EXCEPTION 'FAIL auto_send 가 비어도 들어감';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
  UPDATE public.outreach_settings SET auto_send = false, updated_at = now() WHERE id = 1;
  IF (SELECT auto_send FROM public.outreach_settings WHERE id = 1) THEN
    RAISE EXCEPTION 'FAIL 끄기가 안 됨';
  END IF;
  RAISE NOTICE 'PASS 행은 id=1 하나·기본 켜짐·끄기 가능·빈 값 거절';
END $$;

ROLLBACK;
