-- 카카오 챗봇 마이그레이션(20261107150000_kakao_chat.sql) SQL 시험
-- 실행: deno run -A supabase/tests/run-sql-tests.ts  (메모리 Postgres, 운영 DB 에 연결하지 않음)
-- 규칙: 블록마다 성공하면 RAISE NOTICE 'PASS …', 틀리면 RAISE EXCEPTION 'FAIL …'.

BEGIN;
SET LOCAL TimeZone = 'UTC';

-- ───────── 1) 구조: RLS·정책·권한 ─────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['kakao_chat_sessions', 'kakao_questions', 'kakao_faq_extra'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN
      RAISE EXCEPTION 'FAIL RLS 꺼짐: %', t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t) THEN
      RAISE EXCEPTION 'FAIL 정책이 있으면 안 됨: %', t;
    END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT') OR has_table_privilege('anon', 'public.' || t, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || t, 'SELECT')
       OR has_table_privilege('authenticated', 'public.' || t, 'INSERT') THEN
      RAISE EXCEPTION 'FAIL anon/authenticated 에 표 권한이 남아 있음: %', t;
    END IF;
    IF NOT has_table_privilege('service_role', 'public.' || t, 'INSERT')
       OR NOT has_table_privilege('service_role', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION 'FAIL service_role 이 못 씀: %', t;
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'public.kakao_chat_add_photos(text, text[], integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.kakao_question_alert_due(text, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL anon/authenticated 가 함수를 부를 수 있음';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.kakao_chat_add_photos(text, text[], integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.kakao_question_alert_due(text, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL service_role 이 함수를 못 부름';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kakao-chat-cleanup' AND schedule = '23 * * * *') THEN
    RAISE EXCEPTION 'FAIL 정리 예약 없음';
  END IF;
  RAISE NOTICE 'PASS 구조: 표 3개 RLS 켬·정책 0개·service_role 만·정리 예약';
END $$;

-- ───────── 2) 제약 ─────────
DO $$
BEGIN
  BEGIN
    INSERT INTO public.kakao_chat_sessions (user_key, menu) VALUES ('u1', 'blog');
    RAISE EXCEPTION 'FAIL 없는 메뉴가 들어감';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.kakao_chat_sessions (user_key, data) VALUES ('u1', '[]'::jsonb);
    RAISE EXCEPTION 'FAIL data 가 객체가 아닌데 들어감';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.kakao_questions (user_key, question) VALUES ('raw-kakao-user-id', '질문');
    RAISE EXCEPTION 'FAIL 해시가 아닌 user_key 가 들어감';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.kakao_questions (user_key, question) VALUES ('0123456789abcdef', repeat('가', 501));
    RAISE EXCEPTION 'FAIL 501자 질문이 들어감';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.kakao_questions (user_key, question, status) VALUES ('0123456789abcdef', '질문', 'hold');
    RAISE EXCEPTION 'FAIL 없는 상태가 들어감';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.kakao_faq_extra (keywords, answer) VALUES ('{}', '답');
    RAISE EXCEPTION 'FAIL 키워드 없는 FAQ 가 들어감';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS 제약: 메뉴·data 모양·해시 키·질문 길이·상태·키워드';
END $$;

-- ───────── 3) 기본값 ─────────
DO $$
DECLARE q public.kakao_questions; f public.kakao_faq_extra; s public.kakao_chat_sessions;
BEGIN
  INSERT INTO public.kakao_questions (user_key, menu, question) VALUES ('0123456789abcdef', 'shorts', '주차 되나요?') RETURNING * INTO q;
  IF q.status <> 'new' OR q.added_to_faq OR q.answered_by_ai OR q.bot_answer <> '' THEN
    RAISE EXCEPTION 'FAIL 질문 기본값: %', row_to_json(q);
  END IF;
  INSERT INTO public.kakao_faq_extra (menu, keywords, answer) VALUES (NULL, ARRAY['주차'], '건물 뒤에 주차할 수 있어요.') RETURNING * INTO f;
  IF NOT f.active OR f.menu IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL FAQ 기본값: %', row_to_json(f);
  END IF;
  INSERT INTO public.kakao_chat_sessions (user_key) VALUES ('u-default') RETURNING * INTO s;
  IF s.step <> 'idle' OR s.data <> '{}'::jsonb OR s.photos <> '{}' THEN
    RAISE EXCEPTION 'FAIL 상태 기본값: %', row_to_json(s);
  END IF;
  RAISE NOTICE 'PASS 기본값: 질문 new·FAQ active·상태 idle';
END $$;

-- ───────── 4) 사진 붙이기 ─────────
DO $$
DECLARE n int; p text[];
BEGIN
  IF public.kakao_chat_add_photos('nobody', ARRAY['http://a/1.jpg']) <> 0 THEN
    RAISE EXCEPTION 'FAIL 행 없을 때 0 이 아님';
  END IF;
  INSERT INTO public.kakao_chat_sessions (user_key, step) VALUES ('u-photo', 'c:photos');
  n := public.kakao_chat_add_photos('u-photo', ARRAY['http://a/1.jpg', 'http://a/2.jpg']);
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL 첫 2장: %', n; END IF;
  -- 같은 주소는 한 번만, 순서 유지
  n := public.kakao_chat_add_photos('u-photo', ARRAY['http://a/2.jpg', 'http://a/3.jpg']);
  SELECT photos INTO p FROM public.kakao_chat_sessions WHERE user_key = 'u-photo';
  IF n <> 3 OR p <> ARRAY['http://a/1.jpg', 'http://a/2.jpg', 'http://a/3.jpg'] THEN
    RAISE EXCEPTION 'FAIL 중복 빼기·순서: % %', n, p;
  END IF;
  -- 최대 장수
  n := public.kakao_chat_add_photos('u-photo', ARRAY['http://a/4.jpg', 'http://a/5.jpg'], 4);
  IF n <> 4 THEN RAISE EXCEPTION 'FAIL 최대 4장: %', n; END IF;
  -- 보통 저장(upsert)은 photos 를 건드리지 않는다
  INSERT INTO public.kakao_chat_sessions (user_key, step, data) VALUES ('u-photo', 'confirm', '{"a":{"name":"김가게"}}')
  ON CONFLICT (user_key) DO UPDATE SET step = EXCLUDED.step, data = EXCLUDED.data;
  IF (SELECT cardinality(photos) FROM public.kakao_chat_sessions WHERE user_key = 'u-photo') <> 4 THEN
    RAISE EXCEPTION 'FAIL 보통 저장이 사진을 지움';
  END IF;
  RAISE NOTICE 'PASS 사진: 행 없으면 0·중복 빼기·순서·최대 장수·보통 저장과 분리';
END $$;

-- ───────── 5) 알림 10분 묶기 ─────────
DO $$
BEGIN
  IF NOT public.kakao_question_alert_due('u-alert', '2026-11-07 01:00+00') THEN
    RAISE EXCEPTION 'FAIL 처음 질문인데 알림 차례가 아님';
  END IF;
  IF public.kakao_question_alert_due('u-alert', '2026-11-07 01:05+00') THEN
    RAISE EXCEPTION 'FAIL 5분 뒤인데 또 알림';
  END IF;
  IF public.kakao_question_alert_due('u-alert', '2026-11-07 01:09:59+00') THEN
    RAISE EXCEPTION 'FAIL 10분 안인데 또 알림';
  END IF;
  IF NOT public.kakao_question_alert_due('u-alert', '2026-11-07 01:10+00') THEN
    RAISE EXCEPTION 'FAIL 10분 지났는데 알림 차례가 아님';
  END IF;
  IF NOT public.kakao_question_alert_due('u-other', '2026-11-07 01:05+00') THEN
    RAISE EXCEPTION 'FAIL 다른 사람까지 묶임';
  END IF;
  -- 기존 대화 상태 행이 있어도 단계·자료는 그대로
  INSERT INTO public.kakao_chat_sessions (user_key, step, data) VALUES ('u-keep', 'c:name', '{"a":{"x":"1"}}');
  PERFORM public.kakao_question_alert_due('u-keep', '2026-11-07 01:00+00');
  IF (SELECT step FROM public.kakao_chat_sessions WHERE user_key = 'u-keep') <> 'c:name' THEN
    RAISE EXCEPTION 'FAIL 알림 기록이 대화 단계를 바꿈';
  END IF;
  RAISE NOTICE 'PASS 알림: 같은 사람 10분에 한 번·다른 사람은 따로·대화 상태 유지';
END $$;

ROLLBACK;
