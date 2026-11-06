"""릴스 판매 화면(/reels, /reels/checkout, /reels/order/..., /admin/reels) 캡처 + 점검.

사용: 개발 서버를 죽은 Supabase 주소로 띄운 뒤
  VITE_SUPABASE_URL=http://127.0.0.1:9 SUPABASE_URL=http://127.0.0.1:9 node_modules/.bin/vite dev --port 5250
  python scripts/capture-reels.py [기준주소] [저장폴더]
결과: <저장폴더>/<이름>-375.png, <이름>-1280.png (전체 페이지), 콘솔에 가로 넘침·대비 미달 출력.

주의: 실제 Supabase·페이앱으로는 아무것도 보내지 않는다.
  - */functions/v1/reels-* 는 page.route 로 가짜 응답(fulfill)한다.
  - 127.0.0.1:9 의 auth·rest(관리자 확인)도 가짜 응답한다. 관리자 세션은 localStorage 에 가짜로 넣는다.
  - 그 밖의 GET/HEAD 아닌 요청, 카카오·구글 스크립트·페이앱 요청은 전부 abort 한다(가짜 payurl 도 abort).
"""
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5250").rstrip("/")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "screenshots-reels")
os.makedirs(OUT, exist_ok=True)

DEAD = "127.0.0.1:9"
ORDER_NO = "R261106-0001"
VIEW_KEY = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde"  # 43자, 가짜
assert len(VIEW_KEY) == 43
FAKE_PAYURL = "https://www.payapp.kr/fake-checkout/abc"

CONTRAST_JS = r"""
() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const toRgb = (c) => { cx.clearRect(0,0,1,1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0,0,1,1);
    const d = cx.getImageData(0,0,1,1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = ([r,g,b]) => 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
  const bgOf = (el) => {
    let acc = null;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && e !== document.body) return null;
      const c = cs.backgroundColor;
      if (c && c !== 'transparent' && !/rgba\(0, 0, 0, 0\)/.test(c)) {
        const rgb = toRgb(c);
        if (rgb[3] > 0.9) {
          if (!acc) return rgb;
          return [0,1,2].map(i => acc[i]*acc[3] + rgb[i]*(1-acc[3])).concat([1]);
        }
        if (!acc) acc = rgb; // 반투명 배경(bg-primary/5 등)은 아래 불투명 배경과 섞는다
      }
    }
    if (acc) return [0,1,2].map(i => acc[i]*acc[3] + 255*(1-acc[3])).concat([1]);
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
    if (el.closest('[aria-hidden="true"],[aria-hidden=""]')) continue;
    if (el.closest('.sr-only')) continue;
    const bg = bgOf(el); if (!bg) continue;
    const fg = toRgb(cs.color); if (fg[3] < 1) { for (let i = 0; i < 3; i++) fg[i] = fg[i]*fg[3] + bg[i]*(1-fg[3]); }
    const a = L(fg), b = L(bg); const ratio = (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
    const size = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight) >= 700;
    const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
    checked++;
    if (ratio < need) bad.push({ text: t.textContent.trim().slice(0, 40), ratio: +ratio.toFixed(2), need, size });
  }
  return { checked, bad };
}
"""

OVERFLOW_JS = r"""
() => {
  const sw = document.documentElement.scrollWidth, iw = window.innerWidth;
  const wide = [];
  if (sw > iw) for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.right > iw + 1 && r.width > 0) wide.push((el.tagName + '.' + (el.className || '')).slice(0, 80));
    if (wide.length > 8) break;
  }
  return { sw, iw, wide };
}
"""

# ── 가짜 응답 데이터 ─────────────────────────────────────────────
NOW = "2026-11-06T05:03:00.000Z"
UPLOADS = [
    {"id": "u1", "kind": "file", "file_name": "가게_외관.jpg", "mime": "image/jpeg", "size_bytes": 2480000,
     "url": None, "note": None, "created_at": "2026-11-06T06:10:00.000Z"},
    {"id": "u2", "kind": "file", "file_name": "주방_영상.mp4", "mime": "video/mp4", "size_bytes": 84500000,
     "url": None, "note": None, "created_at": "2026-11-06T06:11:00.000Z"},
    {"id": "u3", "kind": "homepage", "file_name": None, "mime": None, "size_bytes": None,
     "url": "https://example.com", "note": None, "created_at": "2026-11-06T06:12:00.000Z"},
    {"id": "u4", "kind": "reference", "file_name": None, "mime": None, "size_bytes": None,
     "url": "https://www.instagram.com/reel/EXAMPLE123/", "note": None, "created_at": "2026-11-06T06:12:00.000Z"},
    {"id": "u5", "kind": "note", "file_name": None, "mime": None, "size_bytes": None, "url": None,
     "note": "점심 메뉴 위주로 부탁드립니다.\n가격은 영상에 넣지 말아 주세요.", "created_at": "2026-11-06T06:13:00.000Z"},
]


def order(status, uploads=()):
    return {"order_no": ORDER_NO, "plan": 1, "list_price": 200000, "discount": 101000, "amount": 99000,
            "is_trial": True, "status": status, "paid_at": "2026-11-06T05:05:00.000Z" if status == "paid" else None,
            "created_at": NOW, "shop_name": "시험 꽃집", "method": "send_materials", "uploads": list(uploads)}


ADMIN_ORDERS = [
    {"id": "o3", "order_no": "R261106-0003", "created_at": "2026-11-06T07:20:00.000Z", "plan": 1, "amount": 99000,
     "list_price": 200000, "discount": 101000, "is_trial": True, "status": "paid", "needs_check": True,
     "check_reason": "같은 가게 체험 중복 결제(주문번호 R261106-0001)", "shop_name": "시험 꽃집",
     "insta_id": "test.flower", "phone": "01012345678", "email": "shop@example.com", "method": "send_materials",
     "mail_status": "sent", "paid_at": "2026-11-06T07:22:00.000Z", "mul_no": "100000003", "upload_count": 0},
    {"id": "o2", "order_no": "R261106-0002", "created_at": "2026-11-06T06:00:00.000Z", "plan": 5, "amount": 651000,
     "list_price": 750000, "discount": 99000, "is_trial": False, "status": "pending", "needs_check": False,
     "check_reason": None, "shop_name": "시험 분식", "insta_id": "test.bunsik", "phone": "01098765432",
     "email": "bunsik@example.com", "method": "ai_only", "mail_status": None, "paid_at": None, "mul_no": None,
     "upload_count": 0},
    {"id": "o1", "order_no": "R261106-0001", "created_at": "2026-11-06T05:03:00.000Z", "plan": 1, "amount": 99000,
     "list_price": 200000, "discount": 101000, "is_trial": True, "status": "paid", "needs_check": False,
     "check_reason": None, "shop_name": "시험 꽃집", "insta_id": "test.flower", "phone": "01012345678",
     "email": "shop@example.com", "method": "send_materials", "mail_status": "skipped:메일 미설정",
     "paid_at": "2026-11-06T05:05:00.000Z", "mul_no": "100000001", "upload_count": 5},
]
ADMIN_LIST = {
    "ok": True, "orders": ADMIN_ORDERS, "settings": {"enabled": False},
    "secrets": {"PAYAPP_USERID": True, "PAYAPP_LINKKEY": True, "PAYAPP_LINKVAL": False,
                "PAYAPP_REQUESTKEY": False, "RESEND_API_KEY": False},
    "review_events": 1,
}

QUOTES = {
    "trial": {"plan": 1, "list_price": 200000, "discount": 101000, "amount": 99000, "is_trial": True,
              "reasons": ["첫 주문 할인"]},
    "credit5": {"plan": 5, "list_price": 750000, "discount": 99000, "amount": 651000, "is_trial": False,
                "reasons": ["체험 차감 99,000원"]},
}

CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version, accept-profile, prefer",
    "access-control-allow-methods": "GET, POST, OPTIONS, HEAD, PATCH",
}


class Mock:
    def __init__(self):
        self.scenario = {}
        self.calls = []
        self.blocked = []

    def fulfill(self, route, body, status=200):
        route.fulfill(status=status, headers={**CORS, "content-type": "application/json"}, body=json.dumps(body))

    def handle(self, route):
        req = route.request
        url = req.url
        host = url.split("/")[2] if "://" in url else ""
        if DEAD in host:
            if req.method == "OPTIONS":
                return route.fulfill(status=204, headers=CORS, body="")
            if "/functions/v1/reels-" in url:
                return self.fn(route, url.split("/functions/v1/")[1].split("?")[0])
            if "/auth/v1/user" in url:
                return self.fulfill(route, {"id": "00000000-0000-0000-0000-00000000a001", "aud": "authenticated",
                                            "role": "authenticated", "email": "admin@example.com"})
            if "/rest/v1/user_roles" in url:
                return self.fulfill(route, {"role": "admin"})
            self.blocked.append(f"{req.method} {url[:90]}")
            return route.abort()
        outside = any(h in host for h in ("kakao.com", "kakao.co.kr", "script.google", "googleusercontent",
                                          "googletagmanager", "google-analytics", "payapp"))
        if req.method not in ("GET", "HEAD") or outside or "/_serverFn/" in url:
            self.blocked.append(f"{req.method} {url[:90]}")
            return route.abort()
        return route.continue_()

    def fn(self, route, name):
        try:
            body = json.loads(route.request.post_data or "{}")
        except Exception:
            body = {}
        self.calls.append({"fn": name, "body": body})
        sc = self.scenario
        if name == "reels-quote":
            return self.fulfill(route, {"ok": True, "quote": QUOTES[sc.get("quote", "trial")], "ready": sc.get("ready", True)})
        if name == "reels-checkout":
            return self.fulfill(route, {"ok": True, "order_no": ORDER_NO, "payurl": FAKE_PAYURL})
        if name == "reels-order":
            if body.get("action") == "view":
                st = sc.get("order", "pending")
                return self.fulfill(route, {"ok": True, "order": order(st, UPLOADS if st == "paid" else [])})
            return self.fulfill(route, {"ok": False, "reason": "not_paid", "error": "가짜"}, 409)
        if name == "reels-admin":
            act = body.get("action")
            if act == "list":
                return self.fulfill(route, ADMIN_LIST)
            if act == "uploads":
                ups = [dict(u, download_url=("https://example.invalid/dl/" + u["id"]) if u["kind"] == "file" else None)
                       for u in UPLOADS]
                return self.fulfill(route, {"ok": True, "uploads": ups})
            return self.fulfill(route, {"ok": True})
        return self.fulfill(route, {"ok": False, "error": "모르는 함수"}, 404)


def hydrated(page, selector):
    page.wait_for_function(
        "(sel) => { const b = document.querySelector(sel);"
        " return !!b && Object.keys(b).some(k => k.startsWith('__reactProps')); }",
        arg=selector, timeout=90000,
    )
    page.wait_for_timeout(500)


def check(page, label):
    ov = page.evaluate(OVERFLOW_JS)
    print(f"[{label}] 가로 넘침: {'있음' if ov['sw'] > ov['iw'] else '없음'} (scrollWidth={ov['sw']}, innerWidth={ov['iw']})"
          + (f" 넘친 요소: {ov['wide']}" if ov["wide"] else ""))
    c = page.evaluate(CONTRAST_JS)
    print(f"[{label}] 대비 검사 {c['checked']}개 요소, 기준 미달 {len(c['bad'])}개")
    for b in c["bad"][:20]:
        print("     ", b)


def shot(page, name, width):
    page.wait_for_timeout(400)
    label = f"{name}-{width}"
    check(page, label)
    page.screenshot(path=os.path.join(OUT, f"{label}.png"), full_page=True)


def head_check(page, label):
    h = page.evaluate("""() => ({
        title: document.title,
        description: document.querySelector('meta[name=description]')?.content,
        ogTitle: document.querySelector('meta[property="og:title"]')?.content,
        robots: [...document.querySelectorAll('meta[name=robots]')].map(m => m.content),
        canonical: [...document.querySelectorAll('link[rel=canonical]')].map(l => l.href),
    })""")
    print(f"[{label}] head: {h}")


def fill_checkout(page):
    page.fill("input[placeholder='예: 서연네 꽃집']", "시험 꽃집")
    page.fill("input[placeholder='예: myshop.seoul']", "@Test.Flower")
    page.fill("input[placeholder='010-1234-5678']", "010-1234-5678")
    page.fill("input[placeholder='shop@example.com']", "shop@example.com")
    page.click("[data-testid=method-send_materials]")
    for k in ("terms", "privacy", "payment"):
        page.check(f"[data-testid=agree-{k}]")


def main():
    mock = Mock()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width, height, mobile in [(375, 812, True), (1280, 800, False)]:
            ctx = browser.new_context(viewport={"width": width, "height": height},
                                      device_scale_factor=2 if mobile else 1, is_mobile=mobile,
                                      has_touch=mobile, locale="ko-KR")
            ctx.route("**/*", mock.handle)
            page = ctx.new_page()
            page.on("pageerror", lambda e: print("   [pageerror]", str(e)[:200]))

            # 1. 소개
            page.goto(BASE + "/reels", wait_until="domcontentloaded")
            hydrated(page, "a[href='/reels/checkout?plan=5']")
            if mobile:
                head_check(page, "reels")
            shot(page, "reels", width)

            # 2. 결제 — 체험 금액 확인
            mock.scenario = {"quote": "trial", "ready": True}
            page.goto(BASE + "/reels/checkout?plan=1", wait_until="domcontentloaded")
            hydrated(page, "[data-testid=pay-button]")
            if mobile:
                head_check(page, "checkout")
            fill_checkout(page)
            page.click("button[type=submit]")
            page.wait_for_selector("[data-testid=quote-strike]")
            shot(page, "checkout-quoted", width)

            # 결제하기 → 가짜 payurl 로 가려다 abort 되는지(실제 이동 없음)
            if not mobile:
                page.click("[data-testid=pay-button]")
                page.wait_for_timeout(1500)
                print(f"[checkout-pay] 결제하기 뒤 주소: {page.url[:80]} (가짜 payurl 은 abort)")

            # 3. 결제 준비 중
            mock.scenario = {"quote": "trial", "ready": False}
            page.goto(BASE + "/reels/checkout?plan=1", wait_until="domcontentloaded")
            hydrated(page, "[data-testid=pay-button]")
            fill_checkout(page)
            page.click("button[type=submit]")
            page.wait_for_selector("[data-testid=not-ready]")
            print(f"[checkout-not-ready] 결제 단추: '{page.inner_text('[data-testid=pay-button]').strip()}', "
                  f"disabled={page.is_disabled('[data-testid=pay-button]')}")
            shot(page, "checkout-not-ready", width)

            # 4. 5편 체험 차감
            mock.scenario = {"quote": "credit5", "ready": True}
            page.goto(BASE + "/reels/checkout?plan=5", wait_until="domcontentloaded")
            hydrated(page, "[data-testid=pay-button]")
            fill_checkout(page)
            page.click("button[type=submit]")
            page.wait_for_selector("[data-testid=quote-strike]")
            print(f"[checkout-bundle-credit] 결제 금액: {page.inner_text('[data-testid=quote-amount]')}")
            shot(page, "checkout-bundle-credit", width)

            # 5. 주문 — 결제 대기
            mock.scenario = {"order": "pending"}
            page.goto(f"{BASE}/reels/order/{ORDER_NO}?k={VIEW_KEY}", wait_until="domcontentloaded")
            page.wait_for_selector("[data-testid=status-badge]", timeout=90000)
            if mobile:
                head_check(page, "order")
            shot(page, "order-pending", width)

            # 6. 주문 — 결제 완료 + 올린 목록 + 고른 파일
            mock.scenario = {"order": "paid"}
            page.goto(f"{BASE}/reels/order/{ORDER_NO}?k={VIEW_KEY}", wait_until="domcontentloaded")
            page.wait_for_selector("[data-testid=files-upload]", timeout=90000)
            hydrated(page, "[data-testid=file-input]")
            page.set_input_files("[data-testid=file-input]", [
                {"name": "메뉴판.png", "mimeType": "image/png", "buffer": b"\x89PNG\r\n\x1a\n" + b"0" * 2048},
                {"name": "사업자등록증.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4" + b"0" * 512},
            ])
            page.wait_for_timeout(300)
            shot(page, "order-paid", width)

            # 7. 관리자 — 가짜 세션으로 useAdminGate 통과
            exp = int(time.time()) + 3600
            session = {"access_token": "fake-access-token", "refresh_token": "fake-refresh", "token_type": "bearer",
                       "expires_in": 3600, "expires_at": exp,
                       "user": {"id": "00000000-0000-0000-0000-00000000a001", "aud": "authenticated",
                                "role": "authenticated", "email": "admin@example.com"}}
            page.goto(BASE + "/reels", wait_until="domcontentloaded")
            page.evaluate("(s) => localStorage.setItem('sb-127-auth-token', s)", json.dumps(session))
            page.goto(BASE + "/admin/reels", wait_until="domcontentloaded")
            page.wait_for_selector("[data-testid=switch-panel]", timeout=90000)
            hydrated(page, "[data-testid=admin-order] button[aria-expanded]")
            if mobile:
                head_check(page, "admin")
            page.locator("[data-testid=admin-order] button[aria-expanded]").nth(2).click()
            page.wait_for_selector("text=내려받기")
            shot(page, "admin-reels", width)
            ctx.close()
        browser.close()

    print("함수 호출(가짜 응답):")
    for c in mock.calls:
        b = dict(c["body"])
        print("   ", c["fn"], json.dumps(b, ensure_ascii=False)[:220])
    print("막은 요청:")
    for b in mock.blocked:
        print("   ", b)


if __name__ == "__main__":
    main()
