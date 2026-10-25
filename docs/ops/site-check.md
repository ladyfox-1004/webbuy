# 홈페이지 매일 점검

## 언제
GitHub Actions `site-check` 워크플로가 매일 07:30 KST(22:30 UTC)에 돈다.
GitHub 예약 실행은 몇 분에서 수십 분 늦게 시작될 수 있다.
공개 저장소에서 60일 동안 커밋이 없으면 GitHub이 예약 실행을 멈추므로, 그때는 Actions 화면에서 다시 켠다.
Claude 사용량은 쓰지 않는다.

## 무엇을
- 홈 두 주소(`https://ai-solution.co.kr/`, `https://www.ai-solution.co.kr/`)가 200이고 10초 안에 응답하는지 본다.
- 솔루션 7쪽(hospital, law, realestate, telecom, subsidy, platform, automation)과 `/blog`, `/privacy`, `/refund`가 200인지 본다.
- 홈 HTML에 문의 폼 표식 `id="contact"`, `<form`, `data-testid="inquiry-submit"`이 모두 있는지 본다.
- 문의는 실제로 제출하지 않는다(운영 DB에 가짜 문의가 쌓이고 사장님께 메일이 가기 때문이다).
- `/sitemap.xml`이 200이고 `<loc>`가 10개 이상인지 본다.
- `/robots.txt`에 `Sitemap: https://ai-solution.co.kr/sitemap.xml` 줄이 있는지 본다.
- 네이버 소유확인 파일 `/naver9fb111d1ebad6ab7a5c62bf01e5b065b.html`이 리다이렉트 없이 200인지 본다.
- TLS 인증서가 14일 넘게 남았는지 본다.
- 도메인(가비아 등록, 2027-09-02 만료)이 60일 넘게 남았는지 본다.
- 페이지 요청은 실패하면 10초 간격으로 2번 더 시도한 뒤에야 실패로 친다.

## 실패 메일이 오면
1. 메일의 링크로 실패한 실행을 열고, 실행 요약 표에서 `실패` 줄을 찾는다.
2. 홈·페이지가 `HTTP 000`이면 접속 자체가 안 된 것이니 Cloudflare 대시보드에서 Workers와 DNS 상태를 본다.
3. 홈·페이지가 `HTTP 5xx`이면 Workers 로그와 최근 배포를 본다.
4. 특정 페이지만 `HTTP 404`이면 최근 커밋에서 경로가 바뀌었는지 본다.
5. 문의 폼 표식이 없으면 `src/routes/index.tsx`의 Contact와 `src/components/InquiryForm.tsx`가 바뀌었는지 본다.
6. 폼을 일부러 바꿨다면 `scripts/site-check.sh`의 `FORM_MARKERS`도 함께 고친다.
7. 사이트맵 `<loc>` 개수가 모자라면 사이트맵 생성 코드와 배포 결과를 본다.
8. robots.txt 줄이 없으면 `public/robots.txt`가 Cloudflare 관리 robots.txt에 덮이지 않았는지 본다.
9. 네이버 파일이 307이면 `wrangler.jsonc`의 `assets.html_handling: "none"` 설정이 빠졌는지 본다.
10. TLS 인증서가 14일 이하면 Cloudflare SSL/TLS 화면에서 인증서 갱신 상태를 본다.
11. 도메인 만료가 60일 이하면 가비아에서 연장하고, `scripts/site-check.sh`의 `DOMAIN_EXPIRY` 값을 새 만료일로 고친다.
12. 다시 확인하려면 아래 수동 실행을 돌린다.

## 수동 실행
- GitHub: 저장소 Actions 탭 → `site-check` → `Run workflow`.
- 로컬(Git Bash): `bash scripts/site-check.sh`.
- 다른 주소로 시험: `SITE_BASE=https://example.com RETRY_DELAY=1 bash scripts/site-check.sh`.
- `SITE_BASE`는 기준 주소(기본 운영 주소), `WWW_BASE`는 www 주소, `RETRY_DELAY`는 재시도 간격(초)이다.
- 하나라도 실패하면 종료 코드가 1이다.
