// 은행 이름 → 표준 이름·은행 코드(3자리). 대량이체 파일(src/lib/partner/export.ts)·대시보드 계좌 변경 화면이 쓴다.
// 순수 함수(브라우저·서버 공용). 시험: tests/partner-payout.test.ts
// 파트너가 신청서에 손으로 적은 이름이라 「국민」「KB」「농협은행」「NH」처럼 흔들린다 → 공백·「은행」 같은 꼬리를 떼고 별칭으로 맞춘다.
// 🚨 못 맞추면 null(파일에는 코드 빈칸 + 경고). 억지로 비슷한 은행을 고르지 마라(잘못 이체된다).

export type Bank = { code: string; name: string };

/** 표준 이름·코드. 화면의 은행 고르기 목록 순서이기도 하다. */
export const BANKS: Bank[] = [
  { code: "004", name: "KB국민은행" },
  { code: "088", name: "신한은행" },
  { code: "020", name: "우리은행" },
  { code: "081", name: "하나은행" },
  { code: "011", name: "NH농협은행" },
  { code: "003", name: "IBK기업은행" },
  { code: "090", name: "카카오뱅크" },
  { code: "092", name: "토스뱅크" },
  { code: "089", name: "케이뱅크" },
  { code: "045", name: "새마을금고" },
  { code: "071", name: "우체국" },
  { code: "007", name: "수협은행" },
  { code: "032", name: "부산은행" },
  { code: "031", name: "iM뱅크" },
  { code: "034", name: "광주은행" },
  { code: "037", name: "전북은행" },
  { code: "039", name: "경남은행" },
  { code: "035", name: "제주은행" },
  { code: "023", name: "SC제일은행" },
  { code: "027", name: "한국씨티은행" },
];

// [별칭(정리한 모양), 코드]. 정리: 공백·점·괄호 빼고 영문은 대문자. 「은행」 앞부분이 별칭과 정확히 같아야 맞춘다.
const ALIASES: [string, string][] = [
  ["KB국민", "004"], ["국민", "004"], ["KB", "004"], ["KOOKMIN", "004"],
  ["신한", "088"], ["SHINHAN", "088"],
  ["우리", "020"], ["WOORI", "020"],
  ["KEB하나", "081"], ["하나", "081"], ["HANA", "081"],
  ["NH농협", "011"], ["농협", "011"], ["NH", "011"],
  ["IBK기업", "003"], ["기업", "003"], ["IBK", "003"],
  ["카카오뱅크", "090"], ["카카오", "090"], ["카뱅", "090"], ["KAKAOBANK", "090"], ["KAKAO", "090"],
  ["토스뱅크", "092"], ["토스", "092"], ["TOSSBANK", "092"], ["TOSS", "092"],
  ["케이뱅크", "089"], ["K뱅크", "089"], ["KBANK", "089"],
  ["MG새마을금고", "045"], ["새마을금고", "045"], ["새마을", "045"], ["MG", "045"],
  ["우체국", "071"], ["우정사업본부", "071"],
  ["SH수협", "007"], ["수협", "007"],
  ["BNK부산", "032"], ["부산", "032"],
  ["DGB대구", "031"], ["IM뱅크", "031"], ["대구", "031"], ["DGB", "031"],
  ["광주", "034"],
  ["JB전북", "037"], ["전북", "037"],
  ["BNK경남", "039"], ["경남", "039"],
  ["제주", "035"],
  ["SC제일", "023"], ["스탠다드차타드", "023"], ["제일", "023"], ["SC", "023"],
  ["한국씨티", "027"], ["씨티", "027"], ["시티", "027"], ["CITI", "027"],
];

const BY_CODE = new Map(BANKS.map((b) => [b.code, b]));

function clean(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\s.·()（）[\]_-]/g, "")
    .toUpperCase()
    .replace(/(주식회사|㈜)/g, "");
}

/** 「국민」「KB 국민은행」「농협은행」 → {code, name}. 모르면 null */
export function normalizeBank(input: string | null | undefined): Bank | null {
  if (typeof input !== "string") return null;
  const c = clean(input);
  if (!c) return null;
  // 은행 코드 3자리를 그대로 적은 경우
  if (/^\d{3}$/.test(c)) return BY_CODE.get(c) ?? null;
  // 「은행」 앞까지만 본다(「국민은행 강남지점」「신한은행(주)」 → 국민·신한). 그 밖에는 별칭과 정확히 같아야 한다.
  const i = c.indexOf("은행");
  const base = i > 0 ? c.slice(0, i) : c;
  for (const [alias, code] of ALIASES) {
    if (base === alias || c === alias) return BY_CODE.get(code) ?? null;
  }
  return null;
}

/** 계좌번호에서 숫자만 */
export function accountDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}
