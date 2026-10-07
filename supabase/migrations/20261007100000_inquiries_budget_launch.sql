-- 선택 사항 — 적용하지 않아도 폼은 동작한다.
--
-- 이 파일은 아직 어떤 환경에도 적용하지 않았다(의도적으로 보류).
-- 현재 앱은 예산·희망 론칭일을 inquiries.notes 첫 줄 머리말에 담는다:
--   [예산] 3,000만 원 / [희망 론칭일] 미정 ...
-- 나중에 이 마이그레이션을 적용하면 서버 함수(src/lib/inquiry.functions.ts)가
-- 아래 두 컬럼도 함께 채우도록 고칠 수 있다(지금은 그렇게 하지 않는다).

alter table public.inquiries
  add column if not exists budget text,
  add column if not exists launch_date text;
