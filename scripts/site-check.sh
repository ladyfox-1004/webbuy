#!/usr/bin/env bash
# 에이아이솔루션 홈페이지 매일 점검.
# 사용: bash scripts/site-check.sh
# 환경변수:
#   SITE_BASE    기준 주소(기본 https://ai-solution.co.kr). 끝에 / 없이.
#   WWW_BASE     www 주소(기본: SITE_BASE 의 호스트 앞에 www. 를 붙인 주소).
#   RETRY_DELAY  재시도 간격 초(기본 10).
# 필요한 도구: curl, openssl, GNU date.
# 🚨 문의 폼은 HTML 표식만 확인한다. 실제로 제출하지 않는다(운영 DB와 사장님 메일로 간다).

set -u

SITE_BASE="${SITE_BASE:-https://ai-solution.co.kr}"
SITE_BASE="${SITE_BASE%/}"
SCHEME="${SITE_BASE%%://*}"
HOST_PORT="${SITE_BASE#*://}"
HOST_PORT="${HOST_PORT%%/*}"
HOST="${HOST_PORT%%:*}"
if [[ "$HOST" == www.* ]]; then
  DEFAULT_WWW="$SITE_BASE"
else
  DEFAULT_WWW="${SCHEME}://www.${HOST_PORT}"
fi
WWW_BASE="${WWW_BASE:-$DEFAULT_WWW}"
WWW_BASE="${WWW_BASE%/}"

RETRIES=2            # 첫 시도 뒤 재시도 횟수
RETRY_DELAY="${RETRY_DELAY:-10}"
MAX_TIME=10          # 응답 제한 시간(초)
TLS_MIN_DAYS=14
DOMAIN_EXPIRY="2027-09-02"   # 가비아 등록 만료일. 연장하면 이 값을 고친다.
DOMAIN_MIN_DAYS=60
SITEMAP_MIN_LOC=10
ROBOTS_SITEMAP_LINE="Sitemap: https://ai-solution.co.kr/sitemap.xml"
NAVER_FILE="/naver9fb111d1ebad6ab7a5c62bf01e5b065b.html"
# 홈 SSR 결과에 실제로 들어가는 문의 폼 표식(src/routes/index.tsx Contact, src/components/InquiryForm.tsx).
FORM_MARKERS=('id="contact"' '<form' 'data-testid="inquiry-submit"')

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

PASS=0
FAIL=0
ROWS=()

record() { # record 결과(통과|실패) 항목 이유
  local status="$1" name="$2" detail="$3"
  if [[ "$status" == "통과" ]]; then
    PASS=$((PASS + 1))
    echo "[통과] $name — $detail"
  else
    FAIL=$((FAIL + 1))
    echo "[실패] $name — $detail"
  fi
  local cell="${detail//|/\\|}"
  cell="$(printf '%s' "$cell" | sed 's/</\&lt;/g')"
  ROWS+=("| $status | $name | $cell |")
}

# fetch URL 본문저장경로 → 전역 HTTP_CODE, HTTP_TIME, CURL_ERR 설정. 리다이렉트는 따라가지 않는다.
fetch() {
  local url="$1" out="$2" res rc
  res="$(curl -sS -o "$out" -w '%{http_code} %{time_total}' --max-time "$MAX_TIME" \
    -A 'aisolution-site-check/1.0' "$url" 2>"$TMP_DIR/curl.err")"
  rc=$?
  HTTP_CODE="${res%% *}"
  HTTP_TIME="${res##* }"
  CURL_ERR=""
  if [[ $rc -ne 0 ]]; then
    CURL_ERR="$(tr '\n' ' ' <"$TMP_DIR/curl.err" | sed 's/ *$//')"
    [[ -z "$HTTP_CODE" ]] && HTTP_CODE="000"
  fi
  [[ $rc -eq 0 && "$HTTP_CODE" == "200" ]]
}

# fetch_retry URL 본문저장경로 → 200 이 나올 때까지 RETRIES 번 더 시도한다.
fetch_retry() {
  local url="$1" out="$2" i
  ATTEMPTS=0
  for ((i = 0; i <= RETRIES; i++)); do
    ATTEMPTS=$((i + 1))
    fetch "$url" "$out" && return 0
    ((i < RETRIES)) && sleep "$RETRY_DELAY"
  done
  return 1
}

fail_reason() {
  local r="HTTP $HTTP_CODE"
  [[ -n "$CURL_ERR" ]] && r="$r, $CURL_ERR"
  echo "$r (${ATTEMPTS}회 시도)"
}

check_page() { # check_page 이름 URL [본문저장경로]
  local name="$1" url="$2" out="${3:-$TMP_DIR/page}"
  if fetch_retry "$url" "$out"; then
    record 통과 "$name" "HTTP 200, ${HTTP_TIME}초"
    return 0
  fi
  record 실패 "$name" "$url → $(fail_reason)"
  return 1
}

days_until() { # days_until "날짜문자열"
  local target now
  target="$(date -u -d "$1" +%s 2>/dev/null)" || return 1
  now="$(date -u +%s)"
  echo $(((target - now) / 86400))
}

echo "점검 대상: $SITE_BASE (www: $WWW_BASE)"
echo "점검 시각: $(date -u '+%Y-%m-%d %H:%M UTC')"
echo

# 1. 홈(두 주소). 홈 본문은 문의 폼 점검에 다시 쓴다.
HOME_OK=0
check_page "홈 $SITE_BASE/" "$SITE_BASE/" "$TMP_DIR/home.html" && HOME_OK=1
check_page "홈 $WWW_BASE/" "$WWW_BASE/" "$TMP_DIR/www.html"

# 2. 주요 페이지.
for p in /solutions/hospital /solutions/law /solutions/realestate /solutions/telecom \
  /solutions/subsidy /solutions/platform /solutions/automation /blog /privacy /refund; do
  check_page "페이지 $p" "$SITE_BASE$p"
done

# 3. 문의 폼 표식(제출하지 않음).
if [[ $HOME_OK -eq 1 ]]; then
  missing=()
  for m in "${FORM_MARKERS[@]}"; do
    grep -a -q -F -- "$m" "$TMP_DIR/home.html" || missing+=("$m")
  done
  if [[ ${#missing[@]} -eq 0 ]]; then
    record 통과 "문의 폼" "홈 HTML에 표식 ${#FORM_MARKERS[@]}개 모두 있음"
  else
    record 실패 "문의 폼" "홈 HTML에 표식 없음: ${missing[*]}"
  fi
else
  record 실패 "문의 폼" "홈을 받지 못해 확인 못 함"
fi

# 4. 사이트맵.
if fetch_retry "$SITE_BASE/sitemap.xml" "$TMP_DIR/sitemap.xml"; then
  locs="$(grep -a -o '<loc>' "$TMP_DIR/sitemap.xml" | wc -l | tr -d ' ')"
  if ((locs >= SITEMAP_MIN_LOC)); then
    record 통과 "사이트맵" "HTTP 200, <loc> ${locs}개"
  else
    record 실패 "사이트맵" "<loc> ${locs}개(기준 ${SITEMAP_MIN_LOC}개 이상)"
  fi
else
  record 실패 "사이트맵" "$SITE_BASE/sitemap.xml → $(fail_reason)"
fi

# 5. robots.txt 의 Sitemap 줄.
if fetch_retry "$SITE_BASE/robots.txt" "$TMP_DIR/robots.txt"; then
  if tr -d '\r' <"$TMP_DIR/robots.txt" | grep -a -q -x -F -- "$ROBOTS_SITEMAP_LINE"; then
    record 통과 "robots.txt" "Sitemap 줄 있음"
  else
    record 실패 "robots.txt" "'$ROBOTS_SITEMAP_LINE' 줄이 없음"
  fi
else
  record 실패 "robots.txt" "$SITE_BASE/robots.txt → $(fail_reason)"
fi

# 6. 네이버 소유확인 파일. 리다이렉트(307 등)가 나오면 실패다(wrangler.jsonc assets.html_handling 참고).
if fetch_retry "$SITE_BASE$NAVER_FILE" "$TMP_DIR/naver.html"; then
  record 통과 "네이버 소유확인" "리다이렉트 없이 HTTP 200"
else
  record 실패 "네이버 소유확인" "$NAVER_FILE → $(fail_reason) (200이어야 함, 리다이렉트 금지)"
fi

# 7. TLS 인증서 만료.
enddate="$(echo | timeout 20 openssl s_client -connect "${HOST}:443" -servername "$HOST" 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null | sed 's/^notAfter=//')"
if [[ -z "$enddate" ]]; then
  record 실패 "TLS 인증서" "${HOST}:443 인증서를 읽지 못함"
elif ! tls_days="$(days_until "$enddate")"; then
  record 실패 "TLS 인증서" "만료일 해석 실패: $enddate"
elif ((tls_days > TLS_MIN_DAYS)); then
  record 통과 "TLS 인증서" "${tls_days}일 남음($enddate)"
else
  record 실패 "TLS 인증서" "${tls_days}일 남음($enddate), ${TLS_MIN_DAYS}일 넘게 남아야 함. Cloudflare 인증서 갱신 상태 확인"
fi

# 8. 도메인 만료(whois 대신 상수).
dom_days="$(days_until "$DOMAIN_EXPIRY")"
if ((dom_days > DOMAIN_MIN_DAYS)); then
  record 통과 "도메인 만료" "${dom_days}일 남음($DOMAIN_EXPIRY, 가비아)"
else
  record 실패 "도메인 만료" "${dom_days}일 남음($DOMAIN_EXPIRY). 가비아에서 연장하고 스크립트의 DOMAIN_EXPIRY 값을 고칠 것"
fi

# 요약.
echo
TOTAL=$((PASS + FAIL))
if ((FAIL == 0)); then
  SUMMARY="전 항목 통과 (${PASS}/${TOTAL})"
else
  SUMMARY="실패 ${FAIL}개, 통과 ${PASS}개 (총 ${TOTAL}개)"
fi
echo "요약: $SUMMARY"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## 홈페이지 점검 — $SUMMARY"
    echo
    echo "대상: $SITE_BASE"
    echo
    echo "| 결과 | 항목 | 내용 |"
    echo "|---|---|---|"
    printf '%s\n' "${ROWS[@]}"
  } >>"$GITHUB_STEP_SUMMARY"
fi

((FAIL == 0)) || exit 1
