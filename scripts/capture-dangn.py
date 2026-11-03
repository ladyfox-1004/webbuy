"""2026-11 흰 바탕 개편 화면 확인용 캡처 + 점검.

사용: (개발 서버를 5240 에 띄운 뒤) python scripts/capture-dangn.py [기준주소]
결과: screenshots-dangn/*.png, 콘솔에 가로 넘침·대비 부족·폼 폭·접수 요청 내용 출력.

🚨 상담 접수는 실제로 보내지 않는다. GET/HEAD 가 아닌 모든 요청(서버 함수 /_serverFn/, Supabase
   REST·저장소 업로드 등)과 카카오·구글 스크립트로 가는 요청은 전부 가로채 막고(abort),
   브라우저가 보내려던 본문만 확인한다(운영 DB·시트·카톡으로 가면 안 된다).
   개발 서버도 SUPABASE_URL 을 죽은 주소로 바꿔 띄우는 것을 권한다(이어서_작업메모.md 참고).
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5240").rstrip("/")
OUT = os.path.join(os.path.dirname(__file__), "..", "screenshots-dangn")
os.makedirs(OUT, exist_ok=True)

# 글자마다 실제 그려진 배경색을 찾아 대비를 잰다. oklch 등 어떤 색 표기든 canvas 로 sRGB 로 바꾼다.
CONTRAST_JS = r"""
() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const toRgb = (c) => { cx.clearRect(0,0,1,1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0,0,1,1);
    const d = cx.getImageData(0,0,1,1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = ([r,g,b]) => 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && e !== document.body) return null; // 그라데이션·이미지 위 — 따로 본다
      const c = cs.backgroundColor;
      if (c && c !== 'transparent' && !/rgba\(0, 0, 0, 0\)/.test(c)) {
        const rgb = toRgb(c); if (rgb[3] > 0.9) return rgb;
      }
    }
    return [255,255,255,1];
  };
  const bad = []; let checked = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode; if (!t.textContent.trim()) continue;
    const el = t.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
    if (el.closest('[aria-hidden="true"],[aria-hidden=""]')) continue; // 장식 그림(DOOH 도식 등)
    const bg = bgOf(el); if (!bg) continue;
    const fg = toRgb(cs.color); if (fg[3] < 1) { // 반투명 글자는 배경과 섞는다
      for (let i = 0; i < 3; i++) fg[i] = fg[i]*fg[3] + bg[i]*(1-fg[3]); }
    const a = L(fg), b = L(bg); const ratio = (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
    const size = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight) >= 700;
    const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
    checked++;
    if (ratio < need) bad.push({ text: t.textContent.trim().slice(0, 40), ratio: +ratio.toFixed(2), need, size });
  }
  return { checked, bad };
}
"""


def check_page(page, label):
    ov = page.evaluate(
        "() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })"
    )
    print(f"[{label}] 가로 넘침: {'있음' if ov['sw'] > ov['cw'] else '없음'} (scrollWidth={ov['sw']}, clientWidth={ov['cw']})")
    c = page.evaluate(CONTRAST_JS)
    print(f"[{label}] 대비 검사 {c['checked']}개 요소, 기준 미달 {len(c['bad'])}개")
    for b in c["bad"][:30]:
        print("    ", b)


def form_widths(page, label):
    w = page.evaluate(
        """() => [...document.querySelectorAll('[data-testid=inquiry-form]')].map(f => {
            const r = f.getBoundingClientRect();
            const i = f.querySelector('input:not([type=checkbox]):not([type=file]):not([tabindex="-1"])');
            const ir = i.getBoundingClientRect();
            const b = f.querySelector('[data-testid=inquiry-submit]').getBoundingClientRect();
            return { formLeft: Math.round(r.left), formWidth: Math.round(r.width), inputHeight: Math.round(ir.height),
                     inputFont: getComputedStyle(i).fontSize, submitHeight: Math.round(b.height),
                     hasBudget: !!f.textContent.match(/예산|론칭/) };
        })"""
    )
    print(f"[{label}] 폼 크기(위·아래): {w}")


HEADER_JS = r"""
() => {
  const nav = document.querySelector('header nav').getBoundingClientRect();
  const sec = document.querySelector('#quick-contact');
  const h2 = sec.querySelector('h2').getBoundingClientRect();
  const inputs = [...sec.querySelectorAll('input:not([type=checkbox]):not([type=file]):not([tabindex="-1"]), textarea')]
    .map(i => { const r = i.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
  const a = document.activeElement; const ar = a ? a.getBoundingClientRect() : null;
  return { headerBottom: Math.round(nav.bottom), h2Top: Math.round(h2.top), scrollY: Math.round(scrollY),
           firstInputTop: inputs[0] && inputs[0].top,
           active: a && a.tagName, activeTop: ar && Math.round(ar.top), activeBottom: ar && Math.round(ar.bottom) };
}
"""


def header_overlap(page, label):
    """고정 메뉴가 상담폼을 가리는지: 메뉴 「상담 신청」 이동, 히어로 버튼 이동, 메뉴 밑에 있는 칸을 눌렀을 때."""
    page.evaluate("() => window.scrollTo(0, 0)")
    page.wait_for_timeout(300)
    page.click("header button[aria-label='메뉴 열기']")
    page.wait_for_timeout(300)
    page.locator("header a[href='#quick-contact']").last.click()
    page.wait_for_timeout(900)
    m = page.evaluate(HEADER_JS)
    print(f"[{label}] 메뉴 「상담 신청」 이동 뒤: {m}  → 제목 가림 {'있음' if m['h2Top'] < m['headerBottom'] else '없음'}")
    page.screenshot(path=f"{OUT}/{label}-10-menu-cta-jump.png")

    page.evaluate("() => window.scrollTo(0, 0)")
    page.wait_for_timeout(300)
    page.locator("a[href='#quick-contact']:not(header a)").first.click()
    page.wait_for_timeout(900)
    m = page.evaluate(HEADER_JS)
    print(f"[{label}] 히어로 「상담 신청」 이동 뒤: {m}  → 제목 가림 {'있음' if m['h2Top'] < m['headerBottom'] else '없음'}")

    # 손으로 스크롤해서 「연락처」 칸이 메뉴 바로 밑(가려진 자리)에 있을 때 그 칸을 누르면?
    contact = page.locator("#quick-contact [data-testid=inquiry-form] input").nth(2)
    page.evaluate(
        """(el) => { const r = el.getBoundingClientRect(); window.scrollBy(0, r.top - 30); }""",
        contact.element_handle(),
    )
    page.wait_for_timeout(400)
    page.screenshot(path=f"{OUT}/{label}-11-input-under-header.png")
    before = page.evaluate(HEADER_JS)
    contact.focus()
    page.wait_for_timeout(600)
    m = page.evaluate(HEADER_JS)
    hidden = m["activeTop"] is not None and m["activeTop"] < m["headerBottom"]
    print(f"[{label}] 메뉴 밑 칸 포커스: 전 {before} / 후 {m}  → 포커스 칸 가림 {'있음' if hidden else '없음'}")
    page.screenshot(path=f"{OUT}/{label}-12-input-focused.png")
    contact.blur()
    page.evaluate("() => window.scrollTo(0, 0)")
    page.wait_for_timeout(300)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        sent = []

        def guard(route):
            req = route.request
            host = req.url.split("/")[2] if "://" in req.url else ""
            outside = any(h in host for h in ("kakao.com", "script.google", "googleusercontent"))
            if req.method not in ("GET", "HEAD") or outside or "/_serverFn/" in req.url:
                sent.append({"method": req.method, "url": req.url[:80], "body": req.post_data})
                route.abort()
            else:
                route.continue_()

        for name, vw, vh, mobile in [("390", 390, 844, True), ("1280", 1280, 800, False)]:
            ctx = browser.new_context(
                viewport={"width": vw, "height": vh}, device_scale_factor=2 if mobile else 1,
                is_mobile=mobile, has_touch=mobile, locale="ko-KR",
            )
            page = ctx.new_page()
            page.route("**/*", guard)
            page.goto(BASE + "/", wait_until="networkidle")
            # 하이드레이션(React 이벤트 연결)이 끝나야 클릭이 먹는다. 안 기다리면 폼이 브라우저 기본 제출로 새로고침된다.
            page.wait_for_function(
                "() => { const b = document.querySelector('[data-testid=pillars-toggle]');"
                " return !!b && Object.keys(b).some(k => k.startsWith('__reactProps')); }",
                timeout=60000,
            )
            page.wait_for_timeout(800)
            page.screenshot(path=f"{OUT}/{name}-01-first-screen.png")
            page.screenshot(path=f"{OUT}/{name}-00-full.png", full_page=True)
            check_page(page, name)
            form_widths(page, name)

            if mobile:
                header_overlap(page, name)

            page.locator("#quick-contact").scroll_into_view_if_needed()
            page.locator("#quick-contact").screenshot(path=f"{OUT}/{name}-02-quick-contact.png")
            page.locator("#portfolio").screenshot(path=f"{OUT}/{name}-03-portfolio.png")
            page.locator("#services").screenshot(path=f"{OUT}/{name}-04-services.png")
            page.locator("#pillars").screenshot(path=f"{OUT}/{name}-05-pillars-closed.png")
            page.click("[data-testid=pillars-toggle]")
            page.wait_for_timeout(300)
            page.locator("#pillars").screenshot(path=f"{OUT}/{name}-06-pillars-open.png")
            check_page(page, name + " 세 축 펼침")
            page.locator("#contact").screenshot(path=f"{OUT}/{name}-07-bottom-contact.png")

            # 접수 흐름: 빈 칸 제출 → 오류, 채우고 제출 → 요청은 가로채 막는다
            form = page.locator("#quick-contact [data-testid=inquiry-form]")
            form.locator("[data-testid=inquiry-submit]").click()
            page.wait_for_timeout(400)
            page.locator("#quick-contact").screenshot(path=f"{OUT}/{name}-08-validation.png")
            form.locator("input").nth(1).fill("시험 / 가로채기")
            form.locator("input").nth(2).fill("010-0000-0000")
            form.get_by_role("button", name="랜딩페이지 제작").click()
            form.locator("textarea").first.fill("가로채기 시험 — 실제로 보내지 않음")
            form.locator("input[type=checkbox]").check()
            form.locator("[data-testid=inquiry-submit]").click()
            page.wait_for_timeout(1500)
            page.screenshot(path=f"{OUT}/{name}-09-submit-intercepted.png")
            ctx.close()

        browser.close()
        print("가로챈 POST:")
        for s in sent:
            body = s["body"] or ""
            print("  ", s["url"], body[:400])


if __name__ == "__main__":
    main()
