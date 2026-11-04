// 홈 가격 안내 팝업 「오늘 하루 보지 않기」 판단 시험 — 실행: bun test
import { describe, expect, test } from "bun:test";
import {
  PRICE_POPUP_STORAGE_KEY,
  hidePricePopupToday,
  localDateKey,
  readPricePopupHidden,
  shouldShowPricePopup,
} from "../src/lib/price-popup";

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}
const throwing = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("price popup", () => {
  test("localDateKey 는 기기 날짜 기준 YYYY-MM-DD", () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(localDateKey(new Date(2026, 10, 4, 0, 1))).toBe("2026-11-04");
  });

  test("오늘 숨김이면 안 보이고, 값 없음·지난 날짜면 보인다", () => {
    expect(shouldShowPricePopup("2026-11-04", "2026-11-04")).toBe(false);
    expect(shouldShowPricePopup("2026-11-03", "2026-11-04")).toBe(true);
    expect(shouldShowPricePopup(null, "2026-11-04")).toBe(true);
    expect(shouldShowPricePopup("garbage", "2026-11-04")).toBe(true);
  });

  test("저장 후 읽으면 오늘 날짜", () => {
    const s = memStorage();
    expect(hidePricePopupToday("2026-11-04", s)).toBe(true);
    expect(s.getItem(PRICE_POPUP_STORAGE_KEY)).toBe("2026-11-04");
    expect(readPricePopupHidden(s)).toBe("2026-11-04");
  });

  test("저장소가 막혀도 깨지지 않는다", () => {
    expect(readPricePopupHidden(throwing)).toBeNull();
    expect(hidePricePopupToday("2026-11-04", throwing)).toBe(false);
    expect(readPricePopupHidden(null)).toBeNull();
    expect(hidePricePopupToday("2026-11-04", null)).toBe(false);
  });
});
