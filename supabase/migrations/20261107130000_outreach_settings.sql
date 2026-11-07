-- 「채널 라인」 영업 메일 자동 발송 스위치 — 행 하나(id=1)짜리 설정 표.
--
-- 워커 예약 실행(30분마다, src/server/outreach-tasks/auto-send-task.ts)이 auto_send 를 보고
--   true  → 평일 07:00~20:00(한국 시간)에 오늘 묶음의 ready 를 자동으로 보낸다
--   false → 아무것도 안 한다(관리자 화면에서 수동 「보내기」만)
-- 관리자 화면(/admin/outreach) 맨 위 스위치가 /api/admin/outreach action:'set_auto' 로 바꾼다.
-- 권한: RLS 켬·정책 없음·anon/authenticated 권한 회수. service_role(서버)만.
-- 시험: supabase/tests/outreach_settings.test.sql (deno run -A supabase/tests/run-sql-tests.ts)

create table public.outreach_settings (
  id int primary key default 1 check (id = 1),   -- 행은 하나뿐
  auto_send boolean not null default true,
  updated_at timestamptz default now()
);

insert into public.outreach_settings (id, auto_send) values (1, true) on conflict (id) do nothing;

alter table public.outreach_settings enable row level security;
-- 정책 없음: anon·authenticated 는 읽지도 바꾸지도 못한다. 서버(service_role, RLS 우회)만.
revoke all on table public.outreach_settings from public, anon, authenticated;
grant select, insert, update on table public.outreach_settings to service_role;
