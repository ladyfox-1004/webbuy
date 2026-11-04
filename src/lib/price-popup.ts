// 홈 가격 안내 팝업 — 「오늘 하루 보지 않기」 날짜 판단.
// 브라우저 저장소(localStorage)는 막혀 있을 수 있다(사파리 개인 정보 보호 모드 등).
// 읽기·쓰기는 모두 try/catch 로 감싸고, 실패하면 "그냥 보여 준다 / 저장 못 함"으로 넘어간다.

export const PRICE_POPUP_STORAGE_KEY = "aisol:price-popup:hide-date";

// 사용자 기기 기준 오늘 날짜(YYYY-MM-DD). UTC 로 하면 한국 아침 9시 전에 날짜가 어긋난다.
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 저장된 날짜가 오늘이면 숨긴다. 그 밖(값 없음·지난 날짜·이상한 값)은 보여 준다.
export function shouldShowPricePopup(stored: string | null | undefined, today: string): boolean {
  return stored !== today;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function getStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readPricePopupHidden(storage: StorageLike | null = getStorage()): string | null {
  try {
    return storage?.getItem(PRICE_POPUP_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function hidePricePopupToday(
  today: string = localDateKey(),
  storage: StorageLike | null = getStorage(),
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(PRICE_POPUP_STORAGE_KEY, today);
    return true;
  } catch {
    return false;
  }
}
