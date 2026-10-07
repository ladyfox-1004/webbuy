# 포트폴리오 썸네일 캡처 스크립트.
# src/lib/portfolio.ts 의 portfolioSites 주소를 읽어 1280x800 화면 상단을 캡처하고
# 800x500 WebP 로 줄여 public/thumbs/<key>.webp 로 저장한다. (key 규칙은 portfolio.ts 의 thumbKey 와 같다)
#
# 준비: pip install playwright pillow && python -m playwright install chromium
# 실행: python scripts/capture-thumbs.py              # 전체
#       python scripts/capture-thumbs.py ilzik-com    # 특정 key 만 다시 캡처
# 환경변수 WAIT(ms)로 캡처 전 대기 시간을 늘릴 수 있다(기본 3000).
#
# 🚨 가격은 썸네일에 보이면 안 된다(납품 사이트 자체의 "33만원", "6억대" 같은 문구).
#    캡처 직전에 BLUR_PRICES 스크립트로 가격 표현이 든 텍스트 요소를 강하게 흐린다.
#    배너 이미지 안에 그려진 가격은 DOM 으로 못 잡으니, 캡처 후 반드시 눈으로 보고
#    남아 있으면 그 영역을 PIL 로 따로 흐리거나 캡처 위치를 바꿔야 한다.
import os
import re
import sys
import tempfile
from urllib.parse import urlparse

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "thumbs")
WAIT = int(os.environ.get("WAIT", "3000"))


# 숫자와 붙은 화폐 단위·할인 표현("월 3만원" 도 여기 걸린다). 숫자 없는 "할인가"·"정가" 도 잡는다.
# "10월 7일" 같은 날짜는 걸리지 않게 "월+숫자" 단독 패턴은 두지 않았다.
BLUR_PRICES = r"""
() => {
  const re = /(\d[\d,.]*\s*(만\s*원|천\s*원|원(?![가-힣])|원[대~부이짜까으에의을]|억대?|만원대?|천만|백만)|₩\s*\d|\d+\s*%\s*(할인|OFF|off|DC|dc|세일)|할인가|정가)/;
  const hits = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (!n.nodeValue || !re.test(n.nodeValue)) continue;
    const el = n.parentElement;
    if (el) hits.add(el);
  }
  // 가격 숫자가 여러 태그로 쪼개진 경우(예: <b>33</b>만원)는 텍스트 노드 하나로는 안 잡힌다.
  // 그때는 가격 전체를 담은 "가장 작은" 요소만 흐린다. 자식 중 하나가 이미 가격을 다 담고
  // 있으면 부모는 건너뛴다 — 안 그러면 제목까지 통째로 흐려진다.
  const matches = (el) => re.test((el.innerText || "").replace(/\s+/g, " "));
  document.querySelectorAll("body *").forEach((el) => {
    if (el.children.length === 0 || !matches(el)) return;
    if ([...el.children].some(matches)) return;
    if ((el.innerText || "").length < 120) hits.add(el);
  });
  document.querySelectorAll("input, textarea").forEach((el) => {
    if (re.test(el.value || "") || re.test(el.placeholder || "")) hits.add(el);
  });
  hits.forEach((el) => { el.style.setProperty("filter", "blur(18px)", "important"); });
  return hits.size;
}
"""


def thumb_key(url: str) -> str:
    return urlparse(url).hostname.lower().replace(".", "-")


def main() -> None:
    only = sys.argv[1:]
    src = open(os.path.join(ROOT, "src", "lib", "portfolio.ts"), encoding="utf-8").read()
    block = src.split("portfolioSites")[1].split("];")[0]
    urls = re.findall(r'url:\s*"([^"]+)"', block)
    keys = [thumb_key(u) for u in urls]
    assert len(set(keys)) == len(keys), "호스트명이 겹쳐 썸네일 파일 이름이 중복된다"
    os.makedirs(OUT, exist_ok=True)
    tmp = tempfile.mkdtemp()

    with sync_playwright() as p:
        browser = p.chromium.launch()
        for url, key in zip(urls, keys):
            if only and key not in only:
                continue
            ctx = browser.new_context(
                viewport={"width": 1280, "height": 800}, device_scale_factor=1, locale="ko-KR"
            )
            page = ctx.new_page()
            try:
                page.goto(url, wait_until="load", timeout=45000)
            except Exception as e:  # 로드가 늦어도 일단 찍는다
                print(key, "load 실패:", e)
            try:
                page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                pass
            # 스크롤해서 지연 로딩·페이드인 애니메이션을 깨운 뒤 맨 위로 돌아온다
            for _ in range(3):
                page.mouse.wheel(0, 500)
                page.wait_for_timeout(400)
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(WAIT)
            page.keyboard.press("Escape")  # 팝업이 있으면 닫기 시도
            page.wait_for_timeout(300)
            blurred = page.evaluate(BLUR_PRICES)
            page.wait_for_timeout(300)
            print(key, "가격 요소 흐림:", blurred)
            png = os.path.join(tmp, key + ".png")
            page.screenshot(path=png)
            dest = os.path.join(OUT, key + ".webp")
            Image.open(png).convert("RGB").resize((800, 500), Image.LANCZOS).save(
                dest, "WEBP", quality=75, method=6
            )
            print(key, os.path.getsize(dest), "bytes")
            ctx.close()
        browser.close()
    print("캡처한 이미지를 꼭 눈으로 확인할 것(빈 화면·팝업·로딩 스피너 여부)")


if __name__ == "__main__":
    main()
