-- 방문 기록 마이그레이션(20261107100000_site_visits.sql) SQL 시험
--
-- 실행: deno run -A supabase/tests/run-sql-tests.ts  (메모리 Postgres, 운영 DB 에 연결하지 않음)
-- 규칙: 블록마다 성공하면 RAISE NOTICE 'PASS …', 틀리면 RAISE EXCEPTION 'FAIL …'.
-- 기준 시각: 2026-11-07 10:00 한국 시간(= 01:00 UTC). _now 인자로 넘긴다.

BEGIN;
SET LOCAL TimeZone = 'UTC';

-- ───────── 1) 구조: RLS·정책·권한 ─────────
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.site_visits'::regclass) THEN
    RAISE EXCEPTION 'FAIL RLS 꺼짐: site_visits';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'site_visits') THEN
    RAISE EXCEPTION 'FAIL 정책이 있으면 안 됨: site_visits';
  END IF;
  IF has_table_privilege('anon', 'public.site_visits', 'INSERT')
     OR has_table_privilege('anon', 'public.site_visits', 'SELECT')
     OR has_table_privilege('authenticated', 'public.site_visits', 'INSERT')
     OR has_table_privilege('authenticated', 'public.site_visits', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL anon/authenticated 에 표 권한이 남아 있음';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.site_visits', 'INSERT') THEN
    RAISE EXCEPTION 'FAIL service_role 이 넣지 못함';
  END IF;
  IF has_function_privilege('anon', 'public.site_visit_stats(integer, timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.site_visit_stats(integer, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon/authenticated 가 집계 함수를 부를 수 있음';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.site_visit_stats(integer, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL service_role 이 집계 함수를 못 부름';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'site_visits' AND indexname = 'site_visits_created_at_idx')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'site_visits' AND indexname = 'site_visits_source_created_at_idx') THEN
    RAISE EXCEPTION 'FAIL 인덱스 없음';
  END IF;
  RAISE NOTICE 'PASS 구조: RLS 켬·정책 0개·anon/authenticated 권한 없음·service_role 만';
END $$;

-- ───────── 2) 제약: source·device·길이 ─────────
DO $$
BEGIN
  BEGIN
    INSERT INTO public.site_visits (visitor_id, session_id, path, source) VALUES ('vvvvvvvv', 'ssssssss', '/', 'facebook');
    RAISE EXCEPTION 'FAIL 정해지지 않은 source 가 들어감';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.site_visits (visitor_id, session_id, path, device) VALUES ('vvvvvvvv', 'ssssssss', '/', 'tablet');
    RAISE EXCEPTION 'FAIL 정해지지 않은 device 가 들어감';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.site_visits (visitor_id, session_id, path) VALUES ('vvvvvvvv', 'ssssssss', repeat('a', 301));
    RAISE EXCEPTION 'FAIL 301자 경로가 들어감';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.site_visits (visitor_id, session_id, path) VALUES ('short', 'ssssssss', '/');
    RAISE EXCEPTION 'FAIL 너무 짧은 visitor_id 가 들어감';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS 제약: 이상한 source·device·긴 경로·짧은 아이디 거절';
END $$;

-- ───────── 3) 집계 ─────────
-- 시험 자료(한국 시간 기준)
--   오늘(11-07)  : A(당근) / 2쪽, B(direct) / 1쪽, C(당근, 모바일) / 1쪽
--   어제(11-06)  : A(당근) / 1쪽, D(naver) / 1쪽  — 한국 23:30 = UTC 14:30 (UTC 로는 같은 날이지만 한국 날짜로 묶여야 함)
--   11-07 00:10 KST = 11-06 15:10 UTC → 한국 날짜로는 오늘
--   10일 전(10-28): E(google) / 1쪽
--   40일 전: F / 1쪽 (30일 밖 → 빠져야 함)
--   상담: 오늘 1건, 오늘 「테스트」 1건(빠짐), 어제 1건, 40일 전 1건(빠짐)
INSERT INTO public.site_visits (created_at, visitor_id, session_id, path, source, device) VALUES
  ('2026-11-07 00:30+00', 'visitor-A', 'session-A2', '/', 'daangn', 'mobile'),
  ('2026-11-07 00:31+00', 'visitor-A', 'session-A2', '/reels', 'daangn', 'mobile'),
  ('2026-11-06 15:10+00', 'visitor-B', 'session-B1', '/', 'direct', 'desktop'),
  ('2026-11-07 00:50+00', 'visitor-C', 'session-C1', '/', 'daangn', 'mobile'),
  ('2026-11-06 14:30+00', 'visitor-A', 'session-A1', '/', 'daangn', 'mobile'),
  ('2026-11-06 05:00+00', 'visitor-D', 'session-D1', '/reels', 'naver', 'desktop'),
  ('2026-10-28 03:00+00', 'visitor-E', 'session-E1', '/privacy', 'google', 'desktop'),
  ('2026-09-28 03:00+00', 'visitor-F', 'session-F1', '/', 'other', 'desktop');

INSERT INTO public.inquiries (created_at, name, contact) VALUES
  ('2026-11-07 00:40+00', '김가게', '010-0000-0000'),
  ('2026-11-07 00:41+00', '테스트 문의', '010-0000-0000'),
  ('2026-11-06 14:59+00', '박사장', '010-0000-0000'),
  ('2026-09-28 03:00+00', '옛날 문의', '010-0000-0000');

CREATE FUNCTION pg_temp.st() RETURNS jsonb LANGUAGE sql AS
$$ SELECT public.site_visit_stats(30, '2026-11-07 01:00+00'::timestamptz) $$;

CREATE FUNCTION pg_temp.win(_w text) RETURNS jsonb LANGUAGE sql AS
$$ SELECT e FROM jsonb_array_elements(pg_temp.st() -> 'summary') e WHERE e ->> 'window' = _w $$;

CREATE FUNCTION pg_temp.day(_d text) RETURNS jsonb LANGUAGE sql AS
$$ SELECT e FROM jsonb_array_elements(pg_temp.st() -> 'daily') e WHERE e ->> 'day' = _d $$;

DO $$
DECLARE s jsonb := pg_temp.st();
BEGIN
  IF s ->> 'today' <> '2026-11-07' THEN
    RAISE EXCEPTION 'FAIL 오늘 날짜가 한국 날짜가 아님: %', s ->> 'today';
  END IF;
  IF jsonb_array_length(s -> 'daily') <> 30 THEN
    RAISE EXCEPTION 'FAIL 날짜별 표가 30줄이 아님: %', jsonb_array_length(s -> 'daily');
  END IF;
  IF (s -> 'daily' -> 0 ->> 'day') <> '2026-11-07' OR (s -> 'daily' -> 29 ->> 'day') <> '2026-10-09' THEN
    RAISE EXCEPTION 'FAIL 날짜별 표 순서/범위: % ~ %', s -> 'daily' -> 0 ->> 'day', s -> 'daily' -> 29 ->> 'day';
  END IF;
  RAISE NOTICE 'PASS 날짜: 한국 날짜 기준 오늘·최근 30일 빈 날 포함 최신순';
END $$;

DO $$
DECLARE t jsonb := pg_temp.win('today'); w7 jsonb := pg_temp.win('7d'); w30 jsonb := pg_temp.win('30d');
BEGIN
  -- 오늘: A·B·C = 3명, 4쪽, 당근 A·C = 2명, 상담 1건(테스트 빠짐)
  IF (t ->> 'visitors')::int <> 3 OR (t ->> 'pageviews')::int <> 4
     OR (t ->> 'daangn_visitors')::int <> 2 OR (t ->> 'inquiries')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL 오늘 카드: %', t;
  END IF;
  -- 7일: A·B·C·D = 4명(A 는 이틀 왔어도 1명), 6쪽, 당근 2명, 상담 2건
  IF (w7 ->> 'visitors')::int <> 4 OR (w7 ->> 'pageviews')::int <> 6
     OR (w7 ->> 'daangn_visitors')::int <> 2 OR (w7 ->> 'inquiries')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL 7일 카드: %', w7;
  END IF;
  -- 30일: + E = 5명, 7쪽 (40일 전 F·옛날 문의는 빠짐)
  IF (w30 ->> 'visitors')::int <> 5 OR (w30 ->> 'pageviews')::int <> 7
     OR (w30 ->> 'daangn_visitors')::int <> 2 OR (w30 ->> 'inquiries')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL 30일 카드: %', w30;
  END IF;
  RAISE NOTICE 'PASS 카드: 오늘·7일·30일 고유 방문자·당근·상담(테스트 제외)';
END $$;

DO $$
DECLARE d7 jsonb := pg_temp.day('2026-11-07'); d6 jsonb := pg_temp.day('2026-11-06'); d0 jsonb := pg_temp.day('2026-10-30');
BEGIN
  IF (d7 ->> 'visitors')::int <> 3 OR (d7 ->> 'pageviews')::int <> 4 OR (d7 ->> 'daangn_visitors')::int <> 2
     OR (d7 ->> 'inquiries')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL 11-07 줄: %', d7;
  END IF;
  -- 한국 11-06 23:30(UTC 14:30) 의 A, 11-06 14:00 KST 의 D, 11-06 23:59 KST 상담
  IF (d6 ->> 'visitors')::int <> 2 OR (d6 ->> 'pageviews')::int <> 2 OR (d6 ->> 'daangn_visitors')::int <> 1
     OR (d6 ->> 'inquiries')::int <> 1 THEN
    RAISE EXCEPTION 'FAIL 11-06 줄: %', d6;
  END IF;
  IF (d0 ->> 'visitors')::int <> 0 OR (d0 ->> 'pageviews')::int <> 0 OR (d0 ->> 'inquiries')::int <> 0 THEN
    RAISE EXCEPTION 'FAIL 빈 날이 0 이 아님: %', d0;
  END IF;
  RAISE NOTICE 'PASS 날짜별 표: 한국 자정 경계로 나뉘고 빈 날은 0';
END $$;

DO $$
DECLARE s jsonb := pg_temp.st();
BEGIN
  IF (s -> 'sources' -> 0 ->> 'source') <> 'daangn' OR (s -> 'sources' -> 0 ->> 'visitors')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL 유입 1위가 당근 2명이 아님: %', s -> 'sources';
  END IF;
  IF jsonb_array_length(s -> 'sources') <> 4 THEN   -- daangn·direct·google·naver (40일 전 other 빠짐)
    RAISE EXCEPTION 'FAIL 유입 종류 수: %', s -> 'sources';
  END IF;
  IF (s -> 'top_pages' -> 0 ->> 'path') <> '/' OR (s -> 'top_pages' -> 0 ->> 'views')::int <> 4
     OR (s -> 'top_pages' -> 0 ->> 'visitors')::int <> 3 THEN
    RAISE EXCEPTION 'FAIL 많이 본 페이지 1위: %', s -> 'top_pages';
  END IF;
  IF (s -> 'top_pages' -> 1 ->> 'path') <> '/reels' OR (s -> 'top_pages' -> 1 ->> 'views')::int <> 2 THEN
    RAISE EXCEPTION 'FAIL 많이 본 페이지 2위: %', s -> 'top_pages';
  END IF;
  RAISE NOTICE 'PASS 어디서 왔나·많이 본 페이지';
END $$;

DO $$
DECLARE i int;
BEGIN
  FOR i IN 1..12 LOOP
    INSERT INTO public.site_visits (created_at, visitor_id, session_id, path)
    VALUES ('2026-11-07 00:00+00', 'visitor-Z', 'session-Z1', '/p' || i);
  END LOOP;
  IF jsonb_array_length(pg_temp.st() -> 'top_pages') <> 10 THEN
    RAISE EXCEPTION 'FAIL 많이 본 페이지가 10개로 잘리지 않음';
  END IF;
  IF jsonb_array_length(public.site_visit_stats(7, '2026-11-07 01:00+00') -> 'daily') <> 7
     OR jsonb_array_length(public.site_visit_stats(7, '2026-11-07 01:00+00') -> 'summary') <> 2 THEN
    RAISE EXCEPTION 'FAIL _days=7 이면 7줄·카드 2개(오늘·7일)여야 함';
  END IF;
  IF jsonb_array_length(public.site_visit_stats(5000, '2026-11-07 01:00+00') -> 'daily') <> 90 THEN
    RAISE EXCEPTION 'FAIL _days 상한 90 이 안 걸림';
  END IF;
  RAISE NOTICE 'PASS 상위 10개 자르기·기간 인자 범위';
END $$;

ROLLBACK;
