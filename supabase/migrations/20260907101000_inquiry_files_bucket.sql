-- 문의 첨부파일 버킷.
-- 🚨 비공개다 — 열람은 생성기가 service_role 로 서명 URL 을 만들어서 한다.
--    홈페이지는 공개 리포라 service_role 키를 둘 수 없다.
insert into storage.buckets (id, name, public)
values ('inquiry-files', 'inquiry-files', false)
on conflict (id) do nothing;

-- anon 은 올릴 수만 있다(읽기 정책 없음). 홈페이지 문의 폼이 첨부를 올리는 경로다.
drop policy if exists "Anyone can upload inquiry files" on storage.objects;
create policy "Anyone can upload inquiry files"
  on storage.objects for insert to anon
  with check (bucket_id = 'inquiry-files');
