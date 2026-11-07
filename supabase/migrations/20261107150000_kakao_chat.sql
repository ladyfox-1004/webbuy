-- 카카오톡 채널 「에이아이솔루션」 상담 챗봇(오픈빌더 스킬 POST /api/kakao/skill)이 쓰는 표.
--
-- 구성
--   kakao_chat_sessions  손님 한 명(카카오 userRequest.user.id)의 대화 상태. 30분 지나면 서버가 새로 시작한다.
--                        🚨 대화 원문은 저장하지 않는다. 수집 항목(data)·사진 주소(photos)만.
--                        photos 는 따로 둔다 — 사진 여러 장이 동시에 와도(요청 여러 개) 서로 덮어쓰지 않게
--                        kakao_chat_add_photos() 로만 붙이고, 보통 저장(upsert)은 이 칸을 건드리지 않는다.
--                        question_alert_at: 「챗봇 새 질문」 카톡 알림을 같은 사람 10분에 한 번으로 묶는 시각.
--   kakao_questions      FAQ 에 안 걸린 자유 질문(AI 가 답했든 못 했든)과 「2회 넘게 고치고 싶어요」 같은 담당자 안내 질문.
--                        user_key 는 카카오 id 그대로가 아니라 sha256 앞 16자. 관리자 /admin/kakao-questions 에서 본다.
--   kakao_faq_extra      관리자가 「자주 묻는 질문에 추가」로 넣은 답. 챗봇이 기본 FAQ 다음 순서로 찾는다.
--   함수 kakao_chat_add_photos(키, 주소들, 최대) → 붙인 뒤 사진 수(행이 없으면 0)
--   함수 kakao_question_alert_due(키, 시각)      → 알림 보낼 차례면 true(그 시각을 적음), 10분 안이면 false
--   예약 kakao-chat-cleanup 매시 23분 — 하루 지난 대화 상태 지우기(연락처가 들어 있으므로 오래 두지 않는다)
--   쓰기·읽기: 셋 다 RLS 켬·정책 없음·anon/authenticated 권한 회수. service_role(서버)만.
-- 시험: supabase/tests/kakao_chat.test.sql (deno run -A supabase/tests/run-sql-tests.ts)

-- ───────── 1) 대화 상태 ─────────
CREATE TABLE public.kakao_chat_sessions (
  user_key          text PRIMARY KEY CHECK (char_length(user_key) BETWEEN 1 AND 200),
  menu              text CHECK (menu IN ('homepage', 'landing', 'ai', 'shorts')),
  step              text NOT NULL DEFAULT 'idle' CHECK (char_length(step) BETWEEN 1 AND 40),
  data              jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  photos            text[] NOT NULL DEFAULT '{}',
  question_alert_at timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX kakao_chat_sessions_updated_at_idx ON public.kakao_chat_sessions (updated_at);

ALTER TABLE public.kakao_chat_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kakao_chat_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.kakao_chat_sessions TO service_role;

-- ───────── 2) 챗봇 질문 ─────────
CREATE TABLE public.kakao_questions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  user_key       text NOT NULL CHECK (user_key ~ '^[0-9a-f]{16}$'),
  menu           text CHECK (menu IN ('homepage', 'landing', 'ai', 'shorts')),
  question       text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 500),
  bot_answer     text NOT NULL DEFAULT '' CHECK (char_length(bot_answer) <= 1000),
  answered_by_ai boolean NOT NULL DEFAULT false,
  contact        text CHECK (char_length(contact) <= 200),
  status         text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'done')),
  admin_answer   text CHECK (char_length(admin_answer) <= 2000),
  added_to_faq   boolean NOT NULL DEFAULT false
);

CREATE INDEX kakao_questions_status_created_idx ON public.kakao_questions (status, created_at DESC);

ALTER TABLE public.kakao_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kakao_questions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.kakao_questions TO service_role;

-- ───────── 3) 관리자가 더한 FAQ ─────────
CREATE TABLE public.kakao_faq_extra (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu       text CHECK (menu IN ('homepage', 'landing', 'ai', 'shorts')),   -- null = 공통
  keywords   text[] NOT NULL CHECK (cardinality(keywords) BETWEEN 1 AND 20),
  answer     text NOT NULL CHECK (char_length(answer) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  active     boolean NOT NULL DEFAULT true
);

CREATE INDEX kakao_faq_extra_active_idx ON public.kakao_faq_extra (active, created_at);

ALTER TABLE public.kakao_faq_extra ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kakao_faq_extra FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.kakao_faq_extra TO service_role;

-- ───────── 4) 사진 붙이기(동시에 와도 안 잃게 한 문장으로) ─────────
CREATE FUNCTION public.kakao_chat_add_photos(_user_key text, _urls text[], _max integer DEFAULT 20)
RETURNS integer
LANGUAGE sql
SET search_path = public
AS $$
  WITH u AS (
    UPDATE public.kakao_chat_sessions s
    SET photos = (
          SELECT coalesce(array_agg(x.url ORDER BY x.ord), '{}')
          FROM (
            SELECT d.url, min(d.ord) AS ord
            FROM unnest(s.photos || coalesce(_urls, '{}')) WITH ORDINALITY AS d(url, ord)
            WHERE d.url IS NOT NULL AND char_length(d.url) BETWEEN 1 AND 1000
            GROUP BY d.url
            ORDER BY min(d.ord)
            LIMIT greatest(1, least(coalesce(_max, 20), 50))
          ) x
        ),
        updated_at = now()
    WHERE s.user_key = _user_key
    RETURNING cardinality(s.photos) AS n
  )
  SELECT coalesce((SELECT n FROM u), 0)
$$;

-- ───────── 5) 「챗봇 새 질문」 알림 10분 묶기 ─────────
CREATE FUNCTION public.kakao_question_alert_due(_user_key text, _now timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql
SET search_path = public
AS $$
  WITH u AS (
    INSERT INTO public.kakao_chat_sessions AS s (user_key, question_alert_at, updated_at)
    VALUES (_user_key, _now, _now)
    ON CONFLICT (user_key) DO UPDATE
      SET question_alert_at = EXCLUDED.question_alert_at
      WHERE s.question_alert_at IS NULL OR s.question_alert_at <= _now - interval '10 minutes'
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM u)
$$;

REVOKE ALL ON FUNCTION public.kakao_chat_add_photos(text, text[], integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kakao_question_alert_due(text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kakao_chat_add_photos(text, text[], integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.kakao_question_alert_due(text, timestamptz) TO service_role;

-- ───────── 6) 하루 지난 대화 상태 지우기 ─────────
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'kakao-chat-cleanup';
  PERFORM cron.schedule(
    'kakao-chat-cleanup',
    '23 * * * *',
    $c$DELETE FROM public.kakao_chat_sessions WHERE updated_at < now() - interval '1 day'$c$
  );
END $$;
