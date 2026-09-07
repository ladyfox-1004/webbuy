-- 홈페이지 문의 폼 접수 테이블
-- 홈페이지(클라우드)는 여기에 쌓기만 하고, 로컬 생성기가 service_role 로 읽어간다.
-- 컬럼 이름은 생성기 쪽 계약이므로 바꾸지 말 것.

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  contact text not null,
  services text[] not null default '{}',
  reference_links text not null default '',
  notes text not null default '',
  file_storage_path text,
  file_name text,
  consent boolean not null default true,
  source text not null default 'homepage'
);

alter table public.inquiries enable row level security;

-- anon 은 넣을 수만 있다. 읽기 정책은 만들지 않는다 --
-- 남의 문의(이름·연락처)를 브라우저에서 읽을 수 있으면 개인정보 사고다.
-- 읽기는 service_role 만 한다(RLS 우회).
create policy "anon can insert inquiries"
  on public.inquiries for insert to anon with check (true);

create index if not exists inquiries_created_at_idx
  on public.inquiries (created_at desc);
