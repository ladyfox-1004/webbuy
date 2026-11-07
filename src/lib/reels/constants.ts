// 「문의 댓글이 달리는 릴스 제작」 판매 화면 — 표시용 상수.
// 주의: 금액은 서버(supabase/functions/_shared/reels.ts 의 computeQuote)가 기준이다. 여기 값은 화면에 보여 주기만 한다.
//    손님이 실제로 내는 돈은 언제나 reels-quote / reels-checkout 응답의 금액이다. 여기 숫자로 결제 금액을 계산하지 마라.
// 주의: 가격·기간·성과 숫자를 새로 지어내지 마라. 근거: docs/superpowers/specs/2026-11-06-reference-reel-ad-landing-design.md 2·7절.
// 이 파일은 bun test 에서도 읽는다 — import.meta.env 나 "@/..." 를 쓰지 마라.

export type ReelsPlan = 1 | 5 | 10;
export type ReelsMethod = "send_materials" | "ai_only";
export type ReelsStatus = "pending" | "paid" | "cancelled" | "expired";

export const REELS_PLANS: readonly ReelsPlan[] = [1, 5, 10];

/** 정가(부가세 포함). 계약서 「상수」와 같아야 한다(tests/reels-format.test.ts 가 확인). */
export const LIST_PRICE: Record<ReelsPlan, number> = { 1: 200000, 5: 750000, 10: 1400000 };

/** 첫 주문(체험) 1편 금액과 할인액 */
export const TRIAL_PRICE = 99000;
export const TRIAL_DISCOUNT = 101000;
/** 체험 결제 뒤 7일 안에 5편·10편을 사면 빼 주는 금액 */
export const TRIAL_CREDIT = 99000;
export const TRIAL_CREDIT_DAYS = 7;

export const CONSENT_VERSION = "reels-2026-11-06";

/** 한 파일 최대 크기(500MB). 저장 공간 reels-uploads 의 file_size_limit 와 같다. */
export const MAX_UPLOAD_BYTES = 524288000;
export const MAX_REFERENCE_URLS = 10;
export const MAX_NOTE_CHARS = 4000;

export const PLAN_LABEL: Record<ReelsPlan, string> = { 1: "1편", 5: "5편", 10: "10편" };

export type PlanCard = {
  plan: ReelsPlan;
  title: string;
  listPrice: number;
  /** 카드에 크게 보이는 금액 */
  showPrice: number;
  /** 짝대기(line-through)로 보여 줄 정가. 없으면 null */
  strikePrice: number | null;
  perReel: string;
  note: string;
  cta: string;
};

export const PLAN_CARDS: readonly PlanCard[] = [
  {
    plan: 1,
    title: "1편",
    listPrice: LIST_PRICE[1],
    showPrice: TRIAL_PRICE,
    strikePrice: LIST_PRICE[1],
    perReel: "두 번째 주문부터는 200,000원",
    note: "첫 주문만 99,000원",
    cta: "1편 고르기",
  },
  {
    plan: 5,
    title: "5편",
    listPrice: LIST_PRICE[5],
    showPrice: LIST_PRICE[5],
    strikePrice: null,
    perReel: "편당 15만 원",
    note: "25% 할인",
    cta: "5편 고르기",
  },
  {
    plan: 10,
    title: "10편",
    listPrice: LIST_PRICE[10],
    showPrice: LIST_PRICE[10],
    strikePrice: null,
    perReel: "편당 14만 원",
    note: "30% 할인",
    cta: "10편 고르기",
  },
];

export const TRIAL_CREDIT_NOTE =
  "체험(9.9만) 결제 뒤 7일 안에 5편·10편을 사면 99,000원을 빼 드립니다.";

export const METHOD_LABEL: Record<ReelsMethod, string> = {
  send_materials: "자료 보내 주시는 방식",
  ai_only: "촬영 없이 맡기는 방식",
};

export const METHOD_DESC: Record<ReelsMethod, string> = {
  send_materials:
    "사장님이 가게 사진·영상을 보내 주시면 대본·편집·자막·나레이션은 저희가 맡습니다.",
  ai_only: "홈페이지 주소, 가게 정보, 사진 몇 장만 주시면 촬영 없이 AI로 만들어 드립니다.",
};

export const REELS_PRINCIPLE =
  "참고 영상의 흐름·훅·대본 구성을 분석해서 사장님 가게 자료로 새로 만들어 드립니다";

export const REELS_STEPS: readonly { title: string; desc: string }[] = [
  { title: "결제", desc: "1편·5편·10편 중 고르고 결제합니다." },
  {
    title: "자료 올리기",
    desc: "주문 화면에서 사진·영상, 홈페이지 주소, 참고 영상 주소, 요청사항을 올립니다.",
  },
  { title: "제작", desc: "참고 영상의 흐름·훅·대본 구성을 분석해 사장님 가게 자료로 만듭니다." },
  { title: "완성본 전달", desc: "완성본을 보내 드리고, 편당 2회까지 무료로 고쳐 드립니다." },
];

/**
 * 판매자 정보(법적 표시). 같은 사업자(에이아이솔루션)인 빌드넷 src/config/business.ts 의 확정값과 같다.
 * 전화는 아직 없음(빈 값) → 화면에서 전화 줄을 뺀다. 정해지면 이 한 곳과 supabase/functions/_shared/reelsMail.ts 를 같이 고친다.
 */
export const SELLER = {
  name: "에이아이솔루션",
  ceo: "이서연",
  bizNo: "215-28-82229",
  mailOrderNo: "2025-서울서초-0732",
  email: "contact@ai-solution.co.kr",
  address: "서울특별시 서초구 서초중앙로29길 16-6, B동 303호(반포동, 대림빌라)",
  phone: "",
} as const;

export const PAYMENT_AGENT = "페이앱(PayApp)";

/** 환불 규정(설계서 7절, 대표님 승인) */
export const REFUND_RULES: readonly string[] = [
  "제작 시작 전에는 전액 환불해 드립니다.",
  "제작 시작 후에는 아직 시작하지 않은 편수만큼 환불해 드립니다. 이때 묶음 할인은 빼고, 이미 만든 편은 정가 200,000원으로 계산합니다.",
  "완성본 전달 뒤 수정은 편당 2회까지 무료입니다.",
];

export type ConsentKey = "terms" | "privacy" | "payment";

export const CONSENTS: readonly { key: ConsentKey; label: string; body: readonly string[] }[] = [
  {
    key: "terms",
    label: "(필수) 서비스 이용·환불 규정에 동의합니다",
    body: [
      `${SELLER.name}는 손님이 고른 편수만큼 쇼츠를 만들어 드립니다. ${REELS_PRINCIPLE}. 참고 영상의 장면·음악을 그대로 가져다 쓰지 않습니다.`,
      "제작 방식은 자료 보내 주시는 방식과 촬영 없이 맡기는 방식 중에서 고릅니다. 자료는 결제 뒤 주문 화면에서 올립니다.",
      ...REFUND_RULES,
      `환불 요청은 ${SELLER.email} 로 주문번호와 함께 보내 주세요.`,
    ],
  },
  {
    key: "privacy",
    label: "(필수) 개인정보 수집·이용에 동의합니다",
    body: [
      "수집 항목: 상호, 가게 인스타그램 아이디, 휴대폰 번호, 이메일",
      "이용 목적: 주문 확인, 결제, 같은 가게 첫 주문 할인 확인, 제작 진행 연락, 완성본 전달",
      "보관 기간: 5년(전자상거래 등에서의 소비자보호에 관한 법률에 따른 계약·대금결제 기록 보관)",
      "동의하지 않으실 수 있지만, 동의하지 않으면 주문할 수 없습니다.",
    ],
  },
  {
    key: "payment",
    label: "(필수) 결제 대행(페이앱) 안내를 확인했습니다",
    body: [
      `결제는 결제 대행사 ${PAYMENT_AGENT}을 통해 이루어집니다. 카드 정보 등 결제 수단 정보는 ${SELLER.name}가 받지 않습니다.`,
      "결제를 위해 상품명, 결제 금액, 휴대폰 번호가 페이앱에 전달됩니다.",
      "결제 금액은 [금액 확인]을 눌러 보신 금액과 같습니다.",
    ],
  },
];

export const NOT_READY_MESSAGE =
  "결제는 준비 중입니다. 잠시 뒤 다시 시도하시거나 contact@ai-solution.co.kr 로 문의해 주세요.";

export const KAKAO_PENDING_LABEL = "카카오톡 채널 (준비 중)";
