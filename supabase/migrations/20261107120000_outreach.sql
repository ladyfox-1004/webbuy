-- 「채널 라인」 영업 메일 — 로컬(C:\shortsmaker)이 매일 롱폼만 하는 유튜브 채널 후보를 넣고,
-- 대표님이 관리자 화면(/admin/outreach)에서 고른 곳만 서버가 지메일 API 로 한 통씩 보낸다.
--
-- 구성
--   표: outreach_drafts      — 보낼 후보 한 곳 = 한 줄. 🚨 열 이름·뜻은 로컬과의 계약이다(로컬이 이걸 기준으로 insert).
--       outreach_suppression — 수신거부 주소. 여기 있는 주소에는 절대 보내지 않는다.
--   쓰기·읽기: RLS 켬·정책 없음·anon/authenticated 권한 회수. service_role(서버 라우트·로컬)만.
--   site_visits.source 에 'email'(영업 메일 링크 utm_source=email 로 들어온 방문) 추가.
--
-- 상태: ready(보낼 준비) → sending(보내는 중) → sent | failed,  ready → skipped(이번엔 안 보냄),
--       아무 상태 → suppressed(수신거부). failed → ready(다시 시도).
-- 같은 주소·같은 채널은 평생 한 번(유일 인덱스).
-- 시험: supabase/tests/outreach.test.sql (deno run -A supabase/tests/run-sql-tests.ts)

-- ───────── 1) 보낼 후보 ─────────
create table public.outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  batch_date date not null,                 -- 한국 날짜, 로컬이 넣음
  channel_id text not null,
  channel_name text not null,               -- 이미 다듬은 짧은 이름(로컬이 정리)
  channel_url text not null,
  subscribers integer,
  niche text,
  top_title text,                           -- 대표 롱폼 제목(로컬이 SEO 꼬리 정리)
  top_url text,
  email text not null,                      -- 소문자
  status text not null default 'ready' check (status in ('ready','skipped','sending','sent','failed','suppressed')),
  gmail_message_id text, error text,
  created_at timestamptz not null default now(), approved_at timestamptz, sent_at timestamptz
);
create unique index outreach_drafts_email_uq on public.outreach_drafts (email);   -- 같은 주소는 평생 한 번
create unique index outreach_drafts_channel_uq on public.outreach_drafts (channel_id);
create index outreach_drafts_batch_idx on public.outreach_drafts (batch_date desc);

-- ───────── 2) 수신거부 ─────────
create table public.outreach_suppression (email text primary key, reason text, created_at timestamptz not null default now());

-- ───────── 3) 권한: service_role 만 ─────────
alter table public.outreach_drafts enable row level security;
alter table public.outreach_suppression enable row level security;
-- 정책 없음: anon·authenticated 는 넣지도 읽지도 못한다. 서버(service_role, RLS 우회)만.
revoke all on table public.outreach_drafts from public, anon, authenticated;
revoke all on table public.outreach_suppression from public, anon, authenticated;
grant select, insert, update, delete on table public.outreach_drafts to service_role;
grant select, insert, update, delete on table public.outreach_suppression to service_role;

-- ───────── 4) 방문 기록 유입 경로에 'email' 추가 ─────────
-- 20261107100000_site_visits.sql 의 열 안 CHECK 는 이름이 자동으로 site_visits_source_check 로 붙었다.
alter table public.site_visits drop constraint site_visits_source_check;
alter table public.site_visits add constraint site_visits_source_check
  check (source in ('daangn', 'naver', 'google', 'instagram', 'kakao', 'email', 'direct', 'other'));
