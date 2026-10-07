# 공유 카드(og.png) 생성 스크립트.
# scripts/og/og.html 을 1200x630 으로 캡처해 public/og.png 로 저장한다.
#
# 준비: pip install playwright pillow && python -m playwright install chromium
# 실행: python scripts/og/render.py                       # public/og.png 만 다시 만든다
#       python scripts/og/render.py --preview <폴더>      # 카톡식 가운데 자르기 미리보기도 만든다
#
# 🚨 웹폰트(Space Grotesk, Noto Sans KR)를 구글 폰트에서 받는다. 인터넷이 필요하다.
#    document.fonts.ready 뒤에 두 글꼴이 실제로 쓰였는지 확인하고, 아니면 저장하지 않고 멈춘다
#    (한글이 OS 기본 글꼴로 대체된 카드가 배포되는 것을 막는다).
# 🚨 300KB 를 넘으면 채널당 7비트로 줄이고, 그래도 넘으면 256색 팔레트로 줄인다
#    (팔레트로 가면 "스케일" 그라데이션에 계단이 생긴다. 결과를 꼭 눈으로 볼 것).
import argparse
import io
import os
import pathlib
import sys

from PIL import Image, ImageOps
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SRC = HERE / "og.html"
OUT = ROOT / "public" / "og.png"
W, H = 1200, 630
MAX_BYTES = 300 * 1024

CHECK_FONTS = """
async () => {
  await document.fonts.ready;
  const need = [
    ['800 84px "Noto Sans KR"', '비즈니스의 스케일을 확장합니다'],
    ['500 25px "Noto Sans KR"', 'AI 기반 데이터 분석 × 통합 미디어 솔루션'],
    ['600 14px "Space Grotesk"', 'AISOLUTION GROWTH PARTNER'],
  ];
  // 명시적으로 불러와 두고, 다 됐는지 확인한다.
  await Promise.all(need.map(([f, t]) => document.fonts.load(f, t)));
  await document.fonts.ready;
  return need.map(([f, t]) => [f, document.fonts.check(f, t)]);
}
"""


def capture() -> bytes:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
        page.goto(SRC.as_uri(), wait_until="networkidle")
        results = page.evaluate(CHECK_FONTS)
        missing = [f for f, ok in results if not ok]
        if missing:
            browser.close()
            sys.exit(f"폰트를 불러오지 못했습니다: {missing}")
        page.wait_for_timeout(300)
        png = page.screenshot(clip={"x": 0, "y": 0, "width": W, "height": H})
        browser.close()
        return png


def encode(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    data = buf.getvalue()
    if len(data) <= MAX_BYTES:
        return data
    # 1단계: 채널당 7비트로 줄인다(어두운 글로우에서도 띠가 거의 안 보인다).
    p7 = ImageOps.posterize(img, 7)
    buf = io.BytesIO()
    p7.save(buf, "PNG", optimize=True)
    if len(buf.getvalue()) <= MAX_BYTES:
        return buf.getvalue()
    # 2단계: 256색 팔레트(글자 그라데이션에 계단이 생길 수 있으니 결과를 꼭 눈으로 볼 것)
    q = img.convert("RGB").quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
    buf = io.BytesIO()
    q.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def preview(img: Image.Image, out_dir: pathlib.Path) -> None:
    """카톡처럼 가운데를 잘랐을 때를 흉내 낸 미리보기 한 장."""
    out_dir.mkdir(parents=True, exist_ok=True)
    full = img.resize((600, 315), Image.LANCZOS)
    # 가운데 정사각형(630x630) - 카톡 목록·작은 카드에서 쓰는 비율
    sq = img.crop(((W - H) // 2, 0, (W + H) // 2, H)).resize((315, 315), Image.LANCZOS)
    # 가운데 2:1(1200x600) - 큰 카드
    wide = img.crop((0, (H - 600) // 2, W, (H + 600) // 2)).resize((600, 300), Image.LANCZOS)
    pad, bg = 24, (233, 233, 238)
    sheet = Image.new("RGB", (pad * 4 + 600 + 315 + 600, pad * 2 + 315), bg)
    x = pad
    for im in (full, sq, wide):
        sheet.paste(im, (x, pad))
        x += im.width + pad
    sheet.save(out_dir / "og-kakao-crop-preview.png", optimize=True)
    img.save(out_dir / "og-full.png", optimize=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", help="미리보기 PNG 를 저장할 폴더")
    args = ap.parse_args()

    img = Image.open(io.BytesIO(capture())).convert("RGB")
    assert img.size == (W, H), img.size
    data = encode(img)
    OUT.write_bytes(data)
    print(f"{OUT} {len(data) / 1024:.1f}KB")
    if args.preview:
        preview(img, pathlib.Path(args.preview))
        print(f"preview -> {args.preview}")


if __name__ == "__main__":
    main()
