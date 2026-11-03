-- 상담 접수 알림(구글 시트·카카오톡 나에게 보내기) 결과 기록 + 카카오 리프레시 토큰 저장소
-- 2026-11-03. 적용 전에도 홈페이지 접수는 그대로 된다(결과 기록·토큰 저장만 건너뛰고 로그를 남긴다).
--
-- 🚨 2026-10-30 부터 Supabase 는 public 스키마의 새 표에 권한을 자동으로 주지 않는다.
--    아래 GRANT 를 지우지 마라(service_role 이 못 읽으면 카톡 알림이 조용히 꺼진다).

-- 1) inquiries: 알림 결과 칸
--    값: 'ok' / 'skipped:<이유>' / 'failed:<오류 종류>' (토큰·연락처는 적지 않는다)
alter table public.inquiries
  add column if not exists sheet_notify_status text,
  add column if not exists kakao_notify_status text,
  add column if not exists notified_at timestamptz;

-- 서버(service_role)가 결과 칸을 고치고, 관리자 문의 화면이 읽는다. anon 은 여전히 insert 만.
grant select, update on table public.inquiries to service_role;

-- 2) 카카오 리프레시 토큰 — 행 하나(id='owner')만 쓴다.
create table if not exists public.kakao_oauth_tokens (
  id text primary key default 'owner' check (id = 'owner'),
  refresh_token text,
  refresh_token_expires_at timestamptz,
  -- /admin/kakao-connect 시작 때 만든 위조 방지 값(10분). 콜백에서 확인 후 지운다.
  pending_state text,
  pending_state_expires_at timestamptz,
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);

-- RLS 를 켜고 정책은 만들지 않는다 → anon·authenticated 는 읽기·쓰기 모두 불가. service_role 만 쓴다.
alter table public.kakao_oauth_tokens enable row level security;
revoke all on table public.kakao_oauth_tokens from anon, authenticated;
grant select, insert, update, delete on table public.kakao_oauth_tokens to service_role;
