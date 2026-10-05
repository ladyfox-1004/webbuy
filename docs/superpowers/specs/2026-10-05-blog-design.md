# 블로그 + 유튜브 요약 자동 초안·예약 발행 설계 (2026-10-05)

사용자(대표 이서연) 승인 완료. 단계별로 구현·배포한다.

## 목적
- "나중에 볼" 해외 유튜브(AI·개발·사업)를 요약해 대표 본인의 공부 노트로 남긴다.
- 그중 회사와 어울리는 글만 `ai-solution.co.kr/blog`에 발행해 검색 유입과 신뢰를 만든다.
- 홈페이지는 문의 창구이므로 모든 글 끝에 "견적 문의하기" 버튼을 둔다.

## 원칙
- **완전 자동 발행 금지.** AI 초안 → 사람이 승인 → 예약 발행. (구글 대량 생성 콘텐츠 불이익 회피, 공부 목적)
- **번역 전문 금지.** 요약·해설 + 출처(채널명·원본 링크) 표기. (저작권)
- 공개 저장소다. 서비스 키(service_role, Gemini, YouTube)는 Worker 비밀값에만 둔다.

## 흐름
```
"블로그용" 재생목록(일부 공개)
 → [매일 06:00 KST] 새 영상을 blog_sources 에 등록, 하루 최대 3개 처리
 → Gemini 가 YouTube URL 을 직접 분석 → 요약 본문·분류·발행추천·검색 설명(JSON)
 → 추천: status=review / 비추천: status=note(공부 노트, 비공개)
 → 관리자 승인: status=scheduled
 → [화·금 09:00 KST] 가장 먼저 승인된 scheduled 1편을 published 로
```
실패하면 다음 날 재시도, 3회 실패 시 blog_sources.status=failed 로 관리자 화면에 표시.

## 방문자 화면
- `/blog`: 목록, 분류 탭(전체 / AI·개발 / 사업 인사이트).
- `/blog/$slug`: 서버 렌더(loader)로 본문·메타·OG·Article JSON-LD. 원본 영상 삽입, 출처 표기, 하단 문의 버튼(기존 InquiryModal 재사용).
- 상단 메뉴·하단에 "블로그" 링크.
- 사이트맵: 정적 `public/sitemap.xml` → 서버 생성 `/sitemap.xml`(기존 주소 + 발행 글).

## 글 형식 (AI 초안)
3줄 요약 → 핵심 내용(소제목 3~5) → 우리 일에 적용할 점(사업자 관점) → 이서연의 한 줄(선택, my_note) → 출처. 1,500~2,500자, 마크다운.

## 관리자 화면 `/admin/blog`
- 탭: 검토 대기(review) / 공부 노트(note) / 발행 예정(scheduled) / 발행됨(published) / 실패한 영상
- 편집: 마크다운 입력 + 미리보기, 제목·주소(slug)·설명·분류·이서연의 한 줄.
- 버튼: 승인(예약), 지금 발행, 공부 노트로, 삭제. 영상 링크 직접 추가. 새 글 직접 쓰기.
- 접근: 기존 `/admin` 과 같이 `user_roles.role='admin'`.

## 데이터 (Supabase, 마이그레이션은 사용자가 SQL 편집기에 붙여 실행)
- `blog_posts`: id, slug(unique), title, description, body_md, category(`ai-dev`|`business`|`story`), status(`note`|`review`|`scheduled`|`published`), my_note, source_video_id, source_url, source_title, source_channel, ai_recommend(bool), ai_reason, approved_at, published_at, created_at, updated_at.
- `blog_sources`: video_id(pk), title, status(`pending`|`done`|`failed`), attempts, last_error, created_at, processed_at.
- RLS: anon/authenticated 는 status='published' 만 select. admin 만 insert/update/delete. blog_sources 는 admin 만.
- 공개 분류 탭은 ai-dev, business 두 개. story 는 기본 비공개(공부 노트)지만 발행하면 business 로 바꿔 발행.

## 비용
Gemini 영상 1개 약 50~200원, 하루 3개 상한 → 월 최대 약 1만 8천 원. YouTube Data API 무료 할당량. 서버·DB 기존.

## 단계
1. 블로그 화면 + 관리자 편집(수동 글) + 동적 사이트맵.
2. 자동 수집·AI 초안(Worker 예약 실행, Gemini, YouTube Data API).
3. 예약 자동 발행.

## 사용자 준비물
"블로그용" 재생목록 링크, Gemini API 키, YouTube Data API 키, Supabase SQL 실행.
