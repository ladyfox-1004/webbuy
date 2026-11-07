-- 홈페이지 방문 기록(우리 자체 집계). 당근마켓 광고 → 홈페이지 유입을 관리자 화면(/admin/visits)에서 본다.
--
-- 구성
--   표:   site_visits — 페이지 이동 한 번 = 행 하나. 브라우저가 POST /api/track 으로 보내면
--         서버(service_role)만 넣는다. 사용자 에이전트 원문·IP 는 저장하지 않는다(개인정보 최소화).
--   함수: site_visit_stats(_days, _now) → jsonb — 관리자 화면 집계 한 번에.
--   쓰기·읽기: RLS 켬·정책 없음·anon/authenticated 권한 회수. service_role(서버 라우트)만 쓴다.
--
-- 시각: 날짜는 한국 날짜((created_at AT TIME ZONE 'Asia/Seoul')::date)로 묶는다.
-- 상담 접수 수: public.inquiries.created_at 기준, 이름에 「테스트」가 들어간 시험 건은 뺀다.
-- 시험: supabase/tests/site_visits.test.sql (deno run -A supabase/tests/run-sql-tests.ts)

-- ───────── 1) 표 ─────────
CREATE TABLE public.site_visits (
  id             bigserial PRIMARY KEY,
  created_at     timestamptz NOT NULL DEFAULT now(),
  visitor_id     text NOT NULL CHECK (char_length(visitor_id) BETWEEN 8 AND 64),  -- 브라우저별 무작위 값(localStorage)
  session_id     text NOT NULL CHECK (char_length(session_id) BETWEEN 8 AND 64),  -- 탭 세션별 무작위 값(sessionStorage)
  path           text NOT NULL CHECK (char_length(path) BETWEEN 1 AND 300),
  referrer_host  text CHECK (char_length(referrer_host) <= 100),
  utm_source     text CHECK (char_length(utm_source) <= 100),
  utm_medium     text CHECK (char_length(utm_medium) <= 100),
  utm_campaign   text CHECK (char_length(utm_campaign) <= 100),
  source         text NOT NULL DEFAULT 'direct'
                   CHECK (source IN ('daangn', 'naver', 'google', 'instagram', 'kakao', 'direct', 'other')),
  device         text NOT NULL DEFAULT 'desktop' CHECK (device IN ('mobile', 'desktop'))
);

CREATE INDEX site_visits_created_at_idx ON public.site_visits (created_at DESC);
CREATE INDEX site_visits_source_created_at_idx ON public.site_visits (source, created_at DESC);

ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;
-- 정책 없음: anon·authenticated 는 넣지도 읽지도 못한다. 서버(service_role, RLS 우회)만.
REVOKE ALL ON TABLE public.site_visits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.site_visits_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.site_visits TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.site_visits_id_seq TO service_role;

-- ───────── 2) 집계 함수 ─────────
-- 돌려주는 모양:
--   { today: 'YYYY-MM-DD',
--     summary: [{ window: 'today'|'7d'|'30d', days, visitors, pageviews, daangn_visitors, inquiries }],
--     daily:   [{ day, visitors, pageviews, daangn_visitors, inquiries }]   -- 최근 _days 일, 빈 날도 0 으로, 최신 날짜 먼저
--     sources: [{ source, visitors }]                                       -- 최근 _days 일, 방문자 많은 순
--     top_pages: [{ path, views, visitors }] }                              -- 최근 _days 일, 상위 10개
-- 「방문자」 = 고유 visitor_id. 기간 합계는 날짜별 합이 아니라 기간 전체에서 다시 센다(같은 사람이 여러 날 와도 1명).
-- _now 는 시험용(기본 now()).
CREATE FUNCTION public.site_visit_stats(_days integer DEFAULT 30, _now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH p AS (
    SELECT (_now AT TIME ZONE 'Asia/Seoul')::date AS today,
           greatest(1, least(coalesce(_days, 30), 90)) AS n
  ),
  v AS (
    SELECT (sv.created_at AT TIME ZONE 'Asia/Seoul')::date AS day, sv.visitor_id, sv.path, sv.source
    FROM public.site_visits sv, p
    WHERE sv.created_at >= ((p.today - (p.n - 1))::timestamp AT TIME ZONE 'Asia/Seoul')
      AND sv.created_at <  ((p.today + 1)::timestamp AT TIME ZONE 'Asia/Seoul')
  ),
  q AS (
    SELECT (i.created_at AT TIME ZONE 'Asia/Seoul')::date AS day
    FROM public.inquiries i, p
    WHERE i.created_at >= ((p.today - (p.n - 1))::timestamp AT TIME ZONE 'Asia/Seoul')
      AND i.created_at <  ((p.today + 1)::timestamp AT TIME ZONE 'Asia/Seoul')
      AND position('테스트' IN coalesce(i.name, '')) = 0
  ),
  days AS (
    SELECT (p.today - g)::date AS day FROM p, generate_series(0, p.n - 1) AS g
  ),
  daily AS (
    SELECT d.day,
           (SELECT count(DISTINCT v.visitor_id) FROM v WHERE v.day = d.day) AS visitors,
           (SELECT count(*) FROM v WHERE v.day = d.day) AS pageviews,
           (SELECT count(DISTINCT v.visitor_id) FROM v WHERE v.day = d.day AND v.source = 'daangn') AS daangn_visitors,
           (SELECT count(*) FROM q WHERE q.day = d.day) AS inquiries
    FROM days d
  ),
  windows AS (
    SELECT w.name, w.days FROM (VALUES ('today', 1, 1), ('7d', 7, 2), ('30d', 30, 3)) AS w(name, days, ord), p
    WHERE w.days <= p.n
    ORDER BY w.ord
  ),
  summary AS (
    SELECT w.name, w.days,
           (SELECT count(DISTINCT v.visitor_id) FROM v, p WHERE v.day > p.today - w.days) AS visitors,
           (SELECT count(*) FROM v, p WHERE v.day > p.today - w.days) AS pageviews,
           (SELECT count(DISTINCT v.visitor_id) FROM v, p WHERE v.day > p.today - w.days AND v.source = 'daangn') AS daangn_visitors,
           (SELECT count(*) FROM q, p WHERE q.day > p.today - w.days) AS inquiries
    FROM windows w
  )
  SELECT jsonb_build_object(
    'today', (SELECT to_char(today, 'YYYY-MM-DD') FROM p),
    'summary', coalesce((
      SELECT jsonb_agg(jsonb_build_object('window', s.name, 'days', s.days, 'visitors', s.visitors,
                                          'pageviews', s.pageviews, 'daangn_visitors', s.daangn_visitors,
                                          'inquiries', s.inquiries) ORDER BY s.days)
      FROM summary s), '[]'::jsonb),
    'daily', coalesce((
      SELECT jsonb_agg(jsonb_build_object('day', to_char(d.day, 'YYYY-MM-DD'), 'visitors', d.visitors,
                                          'pageviews', d.pageviews, 'daangn_visitors', d.daangn_visitors,
                                          'inquiries', d.inquiries) ORDER BY d.day DESC)
      FROM daily d), '[]'::jsonb),
    'sources', coalesce((
      SELECT jsonb_agg(jsonb_build_object('source', x.source, 'visitors', x.visitors) ORDER BY x.visitors DESC, x.source)
      FROM (SELECT v.source, count(DISTINCT v.visitor_id) AS visitors FROM v GROUP BY v.source) x), '[]'::jsonb),
    'top_pages', coalesce((
      SELECT jsonb_agg(jsonb_build_object('path', t.path, 'views', t.views, 'visitors', t.visitors) ORDER BY t.views DESC, t.path)
      FROM (SELECT v.path, count(*) AS views, count(DISTINCT v.visitor_id) AS visitors
            FROM v GROUP BY v.path ORDER BY count(*) DESC, v.path LIMIT 10) t), '[]'::jsonb)
  )
$$;

REVOKE ALL ON FUNCTION public.site_visit_stats(integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_visit_stats(integer, timestamptz) TO service_role;
