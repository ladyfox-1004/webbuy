-- 블로그 (설계: docs/superpowers/specs/2026-10-05-blog-design.md)
-- 1단계(화면·관리자 편집·사이트맵)에서 만들지만, 2·3단계(유튜브 수집·AI 초안·예약 발행)에서
-- 쓸 컬럼까지 지금 다 만든다. 사용자가 Supabase SQL 편집기에 붙여 실행한다.
--
-- 🚨 공개 읽기 정책은 has_role 을 부르지 않는다. has_role 은 anon 실행 권한이 회수돼 있어
--    (20260520061107) 한 정책 안에서 OR 로 섞으면 anon 조회가 권한 오류로 실패할 수 있다.
--    그래서 공개 읽기(anon, authenticated)와 관리자 전체 권한(authenticated)을 정책으로 나눴다.

-- ============ blog_posts ============
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  description text not null default '',
  body_md text not null default '',
  category text not null default 'ai-dev',
  status text not null default 'note',
  my_note text,
  source_video_id text,
  source_url text,
  source_title text,
  source_channel text,
  ai_recommend boolean,
  ai_reason text,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blog_posts_slug_key unique (slug),
  constraint blog_posts_category_check check (category in ('ai-dev', 'business', 'story')),
  constraint blog_posts_status_check check (status in ('note', 'review', 'scheduled', 'published'))
);

-- 목록·사이트맵: 발행된 글을 최신순으로 읽는다.
create index if not exists blog_posts_published_at_idx
  on public.blog_posts (published_at desc) where status = 'published';
-- 관리자 탭·예약 발행(3단계): 상태별, 승인 순.
create index if not exists blog_posts_status_approved_idx
  on public.blog_posts (status, approved_at);

-- touch_updated_at 은 20260520061039 에서 만든 공용 트리거 함수다.
drop trigger if exists blog_posts_updated_at on public.blog_posts;
create trigger blog_posts_updated_at
  before update on public.blog_posts
  for each row execute function public.touch_updated_at();

alter table public.blog_posts enable row level security;

drop policy if exists "public reads published posts" on public.blog_posts;
create policy "public reads published posts" on public.blog_posts
  for select to anon, authenticated
  using (status = 'published');

drop policy if exists "admins manage posts" on public.blog_posts;
create policy "admins manage posts" on public.blog_posts
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ============ blog_sources (2단계: 유튜브 재생목록 수집 대기열) ============
create table if not exists public.blog_sources (
  video_id text primary key,
  title text,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint blog_sources_status_check check (status in ('pending', 'done', 'failed'))
);

alter table public.blog_sources enable row level security;

drop policy if exists "admins manage sources" on public.blog_sources;
create policy "admins manage sources" on public.blog_sources
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

notify pgrst, 'reload schema';
