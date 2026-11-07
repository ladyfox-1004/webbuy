-- 「채널 라인」 영업 메일 후보 고르기를 노트북(C:\shortsmaker\outreach\daily\pick.py)에서 워커 예약 실행으로 옮긴다.
-- 워커(src/server/outreach-tasks/pick-task.ts, 크론 "15,45 * * * *")가 조금씩:
--   후보 풀(outreach_candidates)에서 email 있는 new 를 「본업 점수 → 구독자」 순으로 꺼내 유튜브로 다시 확인 →
--   통과하면 outreach_drafts 에 오늘 batch_date 로 넣는다(outreach_add_drafts). 풀이 비면 니치 키워드 하나로 검색해 풀을 채운다.
-- 판단: src/lib/outreach/pick.ts · DB 연결: src/lib/outreach/pick-store.ts
--
-- 구성
--   표: outreach_candidates — 후보 풀(채널 하나 = 한 줄). email 은 소문자, 없으면 null(고르기 대상 아님).
--       outreach_quota      — 한국 날짜별 유튜브 API 사용 단위(검색 100, 나머지 1). 하루 3,000 넘으면 검색 멈춤.
--   열:  outreach_settings.auto_pick(자동 고르기 스위치, 기본 켜짐) · pick_cursor(니치 키워드 순환 위치)
--   함수: outreach_add_drafts(jsonb) — 초안 넣기. on conflict do nothing 이 email·channel_id 두 유일 인덱스를 다 막는다.
--        outreach_quota_add(date, int) — 하루 단위를 원자적으로 더한다.
--   권한: RLS 켬·정책 없음·anon/authenticated 권한 회수. service_role(서버)만. 함수도 service_role 만 실행.
-- 시험: supabase/tests/outreach_candidates.test.sql (deno run -A supabase/tests/run-sql-tests.ts)

-- ───────── 1) 후보 풀 ─────────
create table public.outreach_candidates (
  channel_id text primary key,
  channel_name text not null,                   -- 원래 채널 이름(초안에 넣을 때 짧게 다듬는다)
  channel_url text not null,
  subscribers integer,
  country text,                                 -- 유튜브 snippet.country(비어 있으면 null)
  niche text,                                   -- 어떤 검색어로 걸렸나(참고용 — 이걸로 거르지 않는다)
  top_title text,
  top_url text,
  email text check (email is null or email = lower(email)),
  description_summary text,
  business_score integer not null default 0,    -- 본업 점수(select.py score_business: 40·30·15·10·0)
  status text not null default 'new' check (status in ('new', 'checked_ok', 'rejected', 'drafted')),
  reject_reason text,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);
-- 고르기 순서(본업 → 구독자)대로 email 있는 new 만 빨리 찾는다
create index outreach_candidates_pick_idx on public.outreach_candidates (business_score desc, subscribers desc nulls last)
  where status = 'new' and email is not null;

-- ───────── 2) 하루 유튜브 쿼터 ─────────
create table public.outreach_quota (
  day date primary key,                          -- 한국 날짜
  units integer not null default 0 check (units >= 0),
  updated_at timestamptz default now()
);

-- ───────── 3) 스위치·검색 진행 위치 ─────────
alter table public.outreach_settings
  add column auto_pick boolean not null default true,
  add column pick_cursor integer not null default 0 check (pick_cursor >= 0);

-- ───────── 4) 함수 ─────────
-- 초안 넣기: 노트북 pick.py 와 같은 열만(나머지 id·status='ready'·시각은 기본값). 실제로 들어간 channel_id 를 돌려준다.
create function public.outreach_add_drafts(p_rows jsonb)
returns table (channel_id text)
language sql
set search_path = public
as $$
  insert into public.outreach_drafts as d
    (batch_date, channel_id, channel_name, channel_url, subscribers, niche, top_title, top_url, email)
  select r.batch_date, r.channel_id, r.channel_name, r.channel_url, r.subscribers, r.niche, r.top_title, r.top_url, lower(trim(r.email))
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(
    batch_date date, channel_id text, channel_name text, channel_url text, subscribers integer,
    niche text, top_title text, top_url text, email text)
  on conflict do nothing
  returning d.channel_id
$$;

create function public.outreach_quota_add(p_day date, p_units integer)
returns integer
language sql
set search_path = public
as $$
  insert into public.outreach_quota as q (day, units, updated_at)
  values (p_day, greatest(coalesce(p_units, 0), 0), now())
  on conflict (day) do update set units = q.units + excluded.units, updated_at = now()
  returning q.units
$$;

-- ───────── 5) 권한: service_role 만 ─────────
alter table public.outreach_candidates enable row level security;
alter table public.outreach_quota enable row level security;
-- 정책 없음: anon·authenticated 는 넣지도 읽지도 못한다. 서버(service_role, RLS 우회)만.
revoke all on table public.outreach_candidates from public, anon, authenticated;
revoke all on table public.outreach_quota from public, anon, authenticated;
grant select, insert, update, delete on table public.outreach_candidates to service_role;
grant select, insert, update on table public.outreach_quota to service_role;
revoke all on function public.outreach_add_drafts(jsonb) from public, anon, authenticated;
revoke all on function public.outreach_quota_add(date, integer) from public, anon, authenticated;
grant execute on function public.outreach_add_drafts(jsonb) to service_role;
grant execute on function public.outreach_quota_add(date, integer) to service_role;
