// 릴스 판매 화면 — 표시 상수·포맷·입력 안내·문구 금지어 시험. 실행: bun test ./tests
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  CONSENT_VERSION,
  LIST_PRICE,
  MAX_UPLOAD_BYTES,
  PLAN_CARDS,
  SELLER,
  TRIAL_CREDIT,
  TRIAL_DISCOUNT,
  TRIAL_PRICE,
} from "../src/lib/reels/constants";
import {
  checkoutFieldErrors,
  isEmail,
  isOrderNo,
  isViewKey,
  normalizeInstaPreview,
  normalizePhonePreview,
  parsePlan,
  parseReferenceUrls,
  prettyPhone,
  statusLabel,
  uploadFileError,
  won,
} from "../src/lib/reels/format";

describe("가격표 표시값 = 계약서 상수", () => {
  test("정가 1편 200000 / 5편 750000 / 10편 1400000", () => {
    expect(LIST_PRICE).toEqual({ 1: 200000, 5: 750000, 10: 1400000 });
  });
  test("체험 99000 = 200000 - 101000, 차감 99000", () => {
    expect(TRIAL_PRICE).toBe(99000);
    expect(TRIAL_DISCOUNT).toBe(101000);
    expect(LIST_PRICE[1] - TRIAL_DISCOUNT).toBe(TRIAL_PRICE);
    expect(TRIAL_CREDIT).toBe(99000);
  });
  test("카드: 1편만 짝대기 200,000 + 99,000, 5·10편은 정가", () => {
    const by = Object.fromEntries(PLAN_CARDS.map((c) => [c.plan, c]));
    expect(by[1].strikePrice).toBe(200000);
    expect(by[1].showPrice).toBe(99000);
    expect(by[5].strikePrice).toBeNull();
    expect(by[5].showPrice).toBe(750000);
    expect(by[10].showPrice).toBe(1400000);
    expect(by[5].perReel).toContain("15만");
    expect(by[5].note).toContain("25%");
    expect(by[10].perReel).toContain("14만");
    expect(by[10].note).toContain("30%");
    // 편당 금액과 할인율이 정가와 맞는지
    expect(LIST_PRICE[5] / 5).toBe(150000);
    expect(1 - LIST_PRICE[5] / (5 * LIST_PRICE[1])).toBeCloseTo(0.25);
    expect(LIST_PRICE[10] / 10).toBe(140000);
    expect(1 - LIST_PRICE[10] / (10 * LIST_PRICE[1])).toBeCloseTo(0.3);
  });
  test("5편 체험 차감 = 651,000", () => {
    expect(won(LIST_PRICE[5] - TRIAL_CREDIT)).toBe("651,000원");
  });
  test("동의 버전·파일 한도·판매자 정보", () => {
    expect(CONSENT_VERSION).toBe("reels-2026-11-06");
    expect(MAX_UPLOAD_BYTES).toBe(524288000);
    expect(SELLER.bizNo).toBe("215-28-82229");
    expect(SELLER.mailOrderNo).toBe("2025-서울서초-0732");
    expect(SELLER.email).toBe("contact@ai-solution.co.kr");
    // 빌드넷 src/config/business.ts 확정값(같은 사업자)
    expect(SELLER.ceo).toBe("이서연");
    expect(SELLER.address).toBe("서울특별시 서초구 서초중앙로29길 16-6, B동 303호(반포동, 대림빌라)");
    expect(SELLER.phone).toBe("");
  });
  test("「[대표님 확인]」 이 화면·메일 어디에도 없다", () => {
    const roots = ["src/lib/reels", "src/components/reels", "supabase/functions"];
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n)) files.push(p);
      }
    };
    roots.forEach(walk);
    for (const n of readdirSync("src/routes")) if (/^(reels|admin_\.reels)/.test(n)) files.push(join("src/routes", n));
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) expect(readFileSync(f, "utf8").includes("[대표님 확인]")).toBe(false);
  });
  test("전화가 빈 값이면 판매자 정보에서 전화 줄을 뺀다", () => {
    const src = readFileSync("src/components/reels/ReelsParts.tsx", "utf8");
    expect(src).toMatch(/\.filter\(\(\[, v\]\) => v\.trim\(\) !== ""\)/);
  });
});

describe("표시 포맷", () => {
  test("원 표시", () => {
    expect(won(200000)).toBe("200,000원");
    expect(won(99000)).toBe("99,000원");
    expect(won(1400000)).toBe("1,400,000원");
    expect(won(0)).toBe("0원");
  });
  test("상태 라벨", () => {
    expect(statusLabel("pending")).toBe("결제 대기");
    expect(statusLabel("paid")).toBe("결제 완료");
    expect(statusLabel("cancelled")).toBe("취소");
    expect(statusLabel("expired")).toBe("만료");
    expect(statusLabel("weird")).toBe("weird");
  });
  test("plan 정리: 1·5·10 아니면 1", () => {
    expect(parsePlan("5")).toBe(5);
    expect(parsePlan(10)).toBe(10);
    expect(parsePlan("1")).toBe(1);
    expect(parsePlan("3")).toBe(1);
    expect(parsePlan(undefined)).toBe(1);
    expect(parsePlan("abc")).toBe(1);
  });
  test("전화 보기 좋게", () => {
    expect(prettyPhone("01012345678")).toBe("010-1234-5678");
    expect(prettyPhone("0111234567")).toBe("011-123-4567");
  });
  test("주문번호·열쇠 형식", () => {
    expect(isOrderNo("R261106-0001")).toBe(true);
    expect(isOrderNo("R261106-12345")).toBe(true);
    expect(isOrderNo("R26116-0001")).toBe(false);
    expect(isViewKey("a".repeat(43))).toBe(true);
    expect(isViewKey("a".repeat(42))).toBe(false);
    expect(isViewKey(undefined)).toBe(false);
  });
});

describe("입력 정리·안내(화면 쪽)", () => {
  test("인스타 아이디 정리", () => {
    expect(normalizeInstaPreview("@@MyShop.Seoul ")).toBe("myshop.seoul");
    expect(normalizeInstaPreview("https://www.instagram.com/My_Shop/reels/")).toBe("my_shop");
    expect(normalizeInstaPreview("instagram.com/x")).toBeNull();
    expect(normalizeInstaPreview("가게")).toBeNull();
    expect(normalizeInstaPreview("")).toBeNull();
    expect(normalizeInstaPreview("a".repeat(31))).toBeNull();
  });
  test("휴대폰 번호 정리", () => {
    expect(normalizePhonePreview("010-1234-5678")).toBe("01012345678");
    expect(normalizePhonePreview("011 123 4567")).toBe("0111234567");
    expect(normalizePhonePreview("02-123-4567")).toBeNull();
    expect(normalizePhonePreview("010-123")).toBeNull();
  });
  test("이메일 형식", () => {
    expect(isEmail("shop@example.com")).toBe(true);
    expect(isEmail(" shop@example.co.kr ")).toBe(true);
    expect(isEmail("shop@example")).toBe(false);
    expect(isEmail("shop example.com")).toBe(false);
  });
  test("칸별 안내 문장", () => {
    const ok = checkoutFieldErrors({
      shopName: "꽃집",
      insta: "@flower",
      phone: "010-1234-5678",
      email: "a@b.co",
    });
    expect(ok).toEqual({});
    const bad = checkoutFieldErrors({ shopName: " ", insta: "!!", phone: "02-1", email: "x" });
    expect(bad.shopName).toContain("상호");
    expect(bad.insta).toContain("인스타");
    expect(bad.phone).toContain("휴대폰");
    expect(bad.email).toContain("이메일");
  });
  test("참고 영상 주소: http(s)만, 최대 10개, 중복 제거", () => {
    expect(parseReferenceUrls("https://a.com/1\n\nhttps://a.com/1\nhttp://b.com").urls).toEqual([
      "https://a.com/1",
      "http://b.com",
    ]);
    expect(parseReferenceUrls("javascript:alert(1)").error).not.toBeNull();
    const eleven = Array.from({ length: 11 }, (_, i) => `https://a.com/${i}`).join("\n");
    expect(parseReferenceUrls(eleven).error).toContain("10개");
  });
  test("파일 검사: 사진·영상만, 500MB 넘으면 막기", () => {
    expect(uploadFileError({ name: "a.jpg", type: "image/jpeg", size: 10 })).toBeNull();
    expect(uploadFileError({ name: "a.mp4", type: "video/mp4", size: MAX_UPLOAD_BYTES })).toBeNull();
    expect(uploadFileError({ name: "a.mp4", type: "video/mp4", size: MAX_UPLOAD_BYTES + 1 })).toContain("500MB");
    expect(uploadFileError({ name: "a.pdf", type: "application/pdf", size: 10 })).toContain("사진·영상");
    expect(uploadFileError({ name: "a.png", type: "image/png", size: 0 })).not.toBeNull();
  });
});

// ── 정적 검사: 화면 문구 ─────────────────────────────────────────────
const ROOT = join(import.meta.dir, "..");
function walk(dir: string): string[] {
  let out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}
const reelsFiles = [
  ...readdirSync(join(ROOT, "src/routes"))
    .filter((n) => /^(reels\..*|admin_\.reels)\.tsx$/.test(n))
    .map((n) => join(ROOT, "src/routes", n)),
  ...walk(join(ROOT, "src/lib/reels")),
  ...walk(join(ROOT, "src/components/reels")),
];

describe("화면 문구 정적 검사", () => {
  test("검사 대상 파일이 다 있다", () => {
    const names = reelsFiles.map((f) => f.replace(/\\/g, "/").split("/").pop());
    for (const n of [
      "reels.index.tsx",
      "reels.checkout.tsx",
      "reels.order.$orderNo.tsx",
      "admin_.reels.tsx",
      "constants.ts",
      "format.ts",
      "api.ts",
      "ReelsParts.tsx",
    ])
      expect(names).toContain(n);
  });

  test("이모지·마크다운 볼드·금지 표현 없음", () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}]/u;
    const banned = ["똑같이 복제", "매출", "보장", "10배"];
    for (const f of reelsFiles) {
      const src = readFileSync(f, "utf8");
      // 주석은 개발자용 설명이라 빼고 본다(주석에 「쓰지 마라」고 적은 낱말이 걸리지 않게)
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
      expect({ f, emoji: emoji.test(code) }).toEqual({ f, emoji: false });
      expect({ f, bold: code.includes("**") }).toEqual({ f, bold: false });
      for (const b of banned) expect({ f, b, hit: code.includes(b) }).toEqual({ f, b, hit: false });
    }
  });

  test("카카오톡 단추는 오픈프로필 주소 한 곳(KAKAO_OPENCHAT_URL)으로 새 창 연결", () => {
    const src = readFileSync(join(ROOT, "src/components/reels/ReelsParts.tsx"), "utf8");
    const start = src.indexOf("export function KakaoChannelLink");
    const end = src.indexOf("\n}\n", start);
    const body = src.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain("href={KAKAO_OPENCHAT_URL}");
    expect(body).toContain('target="_blank"');
    expect(body).toContain("noopener");
    const portfolio = readFileSync(join(ROOT, "src/lib/portfolio.ts"), "utf8");
    expect(portfolio).toContain('KAKAO_OPENCHAT_URL = "https://open.kakao.com/o/sd29wW8h"');
    // 화면들은 이 컴포넌트만 쓰고 카카오 주소를 직접 걸지 않는다
    for (const f of reelsFiles) {
      const s = readFileSync(f, "utf8");
      expect({ f, kakaoLink: /href=\{?["'`][^"'`]*(kakao|pf\.kakao)/i.test(s) }).toEqual({
        f,
        kakaoLink: false,
      });
    }
  });

  test("/reels 는 canonical·index, checkout 은 noindex+canonical, order·admin 은 noindex·canonical 없음", () => {
    const r = (n: string) => readFileSync(join(ROOT, "src/routes", n), "utf8");
    const index = r("reels.index.tsx");
    expect(index).toContain('"https://ai-solution.co.kr/reels"');
    expect(index).toContain('content: "index, follow"');
    const co = r("reels.checkout.tsx");
    expect(co).toContain('"https://ai-solution.co.kr/reels/checkout"');
    expect(co).toContain('content: "noindex, follow"');
    for (const n of ["reels.order.$orderNo.tsx", "admin_.reels.tsx"]) {
      const s = r(n);
      expect({ n, noindex: s.includes('content: "noindex') }).toEqual({ n, noindex: true });
      expect({ n, canonical: s.includes('rel: "canonical"') }).toEqual({ n, canonical: false });
    }
  });

  test("사이트맵에 /reels 가 있다", () => {
    const s = readFileSync(join(ROOT, "src/routes/sitemap[.]xml.ts"), "utf8");
    expect(s).toContain('{ loc: `${SITE_URL}/reels`, changefreq: "monthly", priority: "0.8" }');
  });
});
