# 영업 메일 카드 그림 찍기 — public/mail/shorts.png (/reels 첫 화면), public/mail/landing.png (홈 첫 화면)
#
# 실행(저장소 루트에서): python scripts/capture-mail-cards.py
#   필요: pip install playwright pillow  (크로미움은 이미 C:\Users\gram\AppData\Local\ms-playwright 에 있음)
#
# - 실제 사이트(https://ai-solution.co.kr)를 연다. 방문 기록이 남지 않게 첫 화면을 열기 전에
#   localStorage aisol_no_track=1 을 넣는다(src/lib/analytics/client-track.ts 의 NO_TRACK_KEY).
# - 홈 가격 안내 팝업은 「오늘 하루 보지 않기」 값(aisol:price-popup:hide-date = 오늘)을 미리 넣어 막고,
#   그래도 뜨면 닫기 단추를 누른다.
# - 1200x900 창으로 열어 위쪽 1200x700 을 잘라 PNG 로 저장(각 300KB 이하가 되도록 색 수를 줄여 압축).
# - 🚨 그림 위에 글을 덧쓰지 마라. 찍은 뒤 눈으로 확인하라.
import datetime
import io
import pathlib
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "mail"
SITE = "https://ai-solution.co.kr"
SHOTS = [("/reels", "shorts.png"), ("/", "landing.png")]
VIEW_W, VIEW_H, CROP_H = 1200, 900, 700
MAX_BYTES = 300 * 1024


def save_small_png(png_bytes: bytes, path: pathlib.Path) -> int:
    img = Image.open(io.BytesIO(png_bytes)).convert("RGB").crop((0, 0, VIEW_W, CROP_H))
    for colors in (256, 192, 128, 96, 64):
        buf = io.BytesIO()
        img.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(
            buf, format="PNG", optimize=True
        )
        if buf.tell() <= MAX_BYTES:
            path.write_bytes(buf.getvalue())
            return buf.tell()
    raise SystemExit(f"{path.name}: 300KB 이하로 줄이지 못함({buf.tell()} bytes)")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    today = datetime.date.today().isoformat()
    init = (
        "try{localStorage.setItem('aisol_no_track','1');"
        f"localStorage.setItem('aisol:price-popup:hide-date','{today}');}}catch(e){{}}"
    )
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": VIEW_W, "height": VIEW_H}, device_scale_factor=1, locale="ko-KR")
        ctx.add_init_script(init)
        page = ctx.new_page()
        for path, name in SHOTS:
            page.goto(SITE + path, wait_until="networkidle")
            page.wait_for_timeout(1500)
            # 팝업이 그래도 떴으면 닫는다
            for sel in ["[role=dialog] button:has-text('닫기')", "[role=dialog] [aria-label*='닫기']", "[role=dialog] button[aria-label='Close']"]:
                loc = page.locator(sel)
                if loc.count() and loc.first.is_visible():
                    loc.first.click()
                    page.wait_for_timeout(500)
                    break
            if page.locator("[role=dialog]").count() and page.locator("[role=dialog]").first.is_visible():
                print(f"경고: {path} 에 아직 대화상자가 떠 있음", file=sys.stderr)
            page.evaluate("window.scrollTo(0,0)")
            page.wait_for_timeout(500)
            size = save_small_png(page.screenshot(), OUT / name)
            print(f"{name}: {SITE + path} -> {size:,} bytes")
        browser.close()


if __name__ == "__main__":
    main()
