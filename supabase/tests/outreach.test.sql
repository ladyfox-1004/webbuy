-- 영업 메일 마이그레이션(20261107120000_outreach.sql) SQL 시험
--
-- 실행: deno run -A supabase/tests/run-sql-tests.ts  (메모리 Postgres, 운영 DB 에 연결하지 않음)
-- 규칙: 블록마다 성공하면 RAISE NOTICE 'PASS …', 틀리면 RAISE EXCEPTION 'FAIL …'.

BEGIN;

-- ───────── 1) 구조: RLS·정책·권한 ─────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['outreach_drafts', 'outreach_suppression'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN
      RAISE EXCEPTION 'FAIL RLS 꺼짐: %', t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t) THEN
      RAISE EXCEPTION 'FAIL 정책이 있으면 안 됨: %', t;
    END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT')
       OR has_table_privilege('anon', 'public.' || t, 'INSERT')
       OR has_table_privilege('anon', 'public.' || t, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || t, 'SELECT')
       OR has_table_privilege('authenticated', 'public.' || t, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || t, 'UPDATE') THEN
      RAISE EXCEPTION 'FAIL anon/authenticated 에 표 권한이 남아 있음: %', t;
    END IF;
    IF NOT has_table_privilege('service_role', 'public.' || t, 'SELECT')
       OR NOT has_table_privilege('service_role', 'public.' || t, 'INSERT')
       OR NOT has_table_privilege('service_role', 'public.' || t, 'UPDATE') THEN
      RAISE EXCEPTION 'FAIL service_role 권한 부족: %', t;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'outreach_drafts' AND indexname = 'outreach_drafts_email_uq')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'outreach_drafts' AND indexname = 'outreach_drafts_channel_uq')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'outreach_drafts' AND indexname = 'outreach_drafts_batch_idx') THEN
    RAISE EXCEPTION 'FAIL 인덱스 없음';
  END IF;
  RAISE NOTICE 'PASS 구조: 두 표 RLS 켬·정책 0개·anon/authenticated 권한 없음·service_role 만·인덱스 3개';
END $$;

-- ───────── 2) 기본값·상태 제약 ─────────
INSERT INTO public.outreach_drafts (batch_date, channel_id, channel_name, channel_url, email)
VALUES ('2026-11-07', 'UC_A', '가나다TV', 'https://www.youtube.com/channel/UC_A', 'a@example.com');

DO $$
DECLARE r public.outreach_drafts;
BEGIN
  SELECT * INTO r FROM public.outreach_drafts WHERE channel_id = 'UC_A';
  IF r.status <> 'ready' OR r.id IS NULL OR r.created_at IS NULL OR r.sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 기본값: %', row_to_json(r);
  END IF;
  BEGIN
    UPDATE public.outreach_drafts SET status = 'queued' WHERE channel_id = 'UC_A';
    RAISE EXCEPTION 'FAIL 정해지지 않은 상태가 들어감';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.outreach_drafts SET status = 'sending' WHERE channel_id = 'UC_A';
  UPDATE public.outreach_drafts SET status = 'sent', sent_at = now(), gmail_message_id = 'm1' WHERE channel_id = 'UC_A';
  UPDATE public.outreach_drafts SET status = 'suppressed' WHERE channel_id = 'UC_A';
  BEGIN
    INSERT INTO public.outreach_drafts (batch_date, channel_id, channel_name, channel_url)
    VALUES ('2026-11-07', 'UC_X', 'x', 'https://x');
    RAISE EXCEPTION 'FAIL email 없이 들어감';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS 기본값 ready·상태 6가지만·email 필수';
END $$;

-- ───────── 3) 평생 한 번: 같은 주소·같은 채널 거절 ─────────
DO $$
BEGIN
  BEGIN
    INSERT INTO public.outreach_drafts (batch_date, channel_id, channel_name, channel_url, email)
    VALUES ('2026-11-08', 'UC_B', '다른채널', 'https://www.youtube.com/channel/UC_B', 'a@example.com');
    RAISE EXCEPTION 'FAIL 같은 주소가 두 번 들어감';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.outreach_drafts (batch_date, channel_id, channel_name, channel_url, email)
    VALUES ('2026-11-08', 'UC_A', '가나다TV', 'https://www.youtube.com/channel/UC_A', 'b@example.com');
    RAISE EXCEPTION 'FAIL 같은 채널이 두 번 들어감';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS 같은 주소·같은 채널은 평생 한 번';
END $$;

-- ───────── 4) 수신거부 표 ─────────
DO $$
BEGIN
  INSERT INTO public.outreach_suppression (email, reason) VALUES ('a@example.com', 'unsubscribe');
  INSERT INTO public.outreach_suppression (email, reason) VALUES ('a@example.com', 'again') ON CONFLICT (email) DO NOTHING;
  IF (SELECT count(*) FROM public.outreach_suppression) <> 1
     OR (SELECT reason FROM public.outreach_suppression WHERE email = 'a@example.com') <> 'unsubscribe' THEN
    RAISE EXCEPTION 'FAIL 수신거부 주소가 한 줄로 유지되지 않음';
  END IF;
  RAISE NOTICE 'PASS 수신거부 주소는 한 줄(email 기본키)';
END $$;

-- ───────── 5) site_visits.source 에 email ─────────
DO $$
BEGIN
  INSERT INTO public.site_visits (visitor_id, session_id, path, source) VALUES ('visitor-M', 'session-M1', '/reels', 'email');
  BEGIN
    INSERT INTO public.site_visits (visitor_id, session_id, path, source) VALUES ('visitor-M', 'session-M1', '/', 'facebook');
    RAISE EXCEPTION 'FAIL 정해지지 않은 source 가 들어감';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.site_visits (visitor_id, session_id, path, source) VALUES ('visitor-N', 'session-N1', '/', 'daangn');
  RAISE NOTICE 'PASS site_visits.source: email 받고 기존 값 유지·이상한 값 거절';
END $$;

ROLLBACK;
