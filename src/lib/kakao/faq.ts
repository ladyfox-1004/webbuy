// 카카오 채널 상담 챗봇의 답변 체계 — 메뉴 4개(첫 안내·자주 묻는 질문·받아야 할 자료)와 공통·환불·수정 FAQ.
// 원본: 대표님 문서 「카카오챗봇_답변체계.md」(2026-11-07, 바탕 화면). 문구는 그 문서 그대로 옮겼다.
// 🚨 답 문구를 바꾸려면 원본 문서와 같이 고쳐라. 줄이지 말고, 이모지·굵은 글씨(**)를 넣지 마라.
// 🚨 금액·기간·횟수는 여기 문구가 기준이다. AI 답에서 여기 없는 금액·기간이 나오면 버린다(./match.ts).
// 🚨 결과(조회·문의·매출)를 약속하는 말을 넣지 마라.
// 이 파일은 bun test 에서도 읽는다 — "@/..." 나 import.meta.env 를 쓰지 마라.
import { LIST_PRICE } from "../reels/constants";

export type MenuKey = "homepage" | "landing" | "ai" | "shorts";
export const MENU_KEYS: readonly MenuKey[] = ["homepage", "landing", "ai", "shorts"];

/**
 * keywords: 띄어쓰기·문장부호를 뺀 소문자 글자. 손님 말(같은 방식으로 정리)에 들어 있으면 맞은 것.
 *           "가&나" 는 「가」와 「나」가 둘 다 있어야 맞다. 점수는 맞은 글자 수 합(긴·구체적인 말이 이긴다).
 * label:    「자주 묻는 질문」 단추 이름(카카오 quickReplies 14자 제한). 손님이 이 단추를 누르면 이 글자가 그대로 온다.
 * question: 원본 표의 「질문」 칸.
 * kind:     refund = 환불·수정 질문(메뉴를 모를 때 「어떤 서비스 환불·수정이 궁금하세요?」로 되묻는다)
 * escalate: 정해진 답을 한 뒤 「챗봇 질문」에 쌓고 대표님께 알린다(예: 무료 수정 2회를 넘는 수정).
 */
export type FaqItem = {
  id: string;
  label: string;
  question: string;
  keywords: string[];
  answer: string;
  kind?: "refund";
  escalate?: boolean;
};

export type CollectKind = "text" | "refs" | "photos" | "contact" | "choice";

/** 받아야 할 자료 한 칸. item 은 원본 목록 문구 그대로, prompt 는 손님에게 묻는 말. */
export type CollectStep = {
  key: string;
  item: string;
  /** 접수 요약·관리자 notes 에 붙는 짧은 이름 */
  summary: string;
  kind: CollectKind;
  prompt: string | ((answers: Record<string, string>) => string);
  /** 「건너뛰기」 가능 여부(연락처만 필수) */
  optional: boolean;
  choices?: readonly string[];
};

export type MenuDef = {
  key: MenuKey;
  /** 웰컴 quickReplies 라벨·messageText(대표님이 정한 순서·문구) */
  quickLabel: string;
  title: string;
  /** inquiries.services 에 들어가는 글자 */
  service: string;
  intro: string;
  faq: FaqItem[];
  collect: CollectStep[];
};

export const OPEN_PROFILE_URL = "https://open.kakao.com/o/sd29wW8h"; // src/lib/portfolio.ts KAKAO_OPEN_PROFILE_URL 과 같아야 함(시험이 확인)
export const REELS_ORDER_URL = "https://ai-solution.co.kr/reels";
export const PORTFOLIO_URL = "https://ai-solution.co.kr/#portfolio";
export const PRIVACY_URL = "https://ai-solution.co.kr/privacy";

/** 쇼츠 1편 정가를 원본 문구 모양(「20만 원」)으로. 주문 화면 상수(LIST_PRICE)와 어긋나지 않게 거기서 읽는다. */
const SHORTS_ONE = `${LIST_PRICE[1] / 10000}만 원`;

// ── 공통 받아야 할 자료 조각 ─────────────────────────────────────
const NAME: CollectStep = {
  key: "name",
  item: "상호 또는 이름",
  summary: "상호·이름",
  kind: "text",
  prompt: "상호(가게 이름)나 성함을 알려 주세요.",
  optional: true,
};
const INDUSTRY: CollectStep = {
  key: "industry",
  item: "업종",
  summary: "업종",
  kind: "text",
  prompt: "어떤 업종이세요? (예: 병원, 학원, 식당, 쇼핑몰)",
  optional: true,
};
const CONTACT: CollectStep = {
  key: "contact",
  item: "연락처(휴대폰 또는 이메일)",
  summary: "연락처",
  kind: "contact",
  prompt: "연락받으실 휴대폰 번호나 이메일을 알려 주세요. 상담 연락에 꼭 필요해요.",
  optional: false,
};
const SCHEDULE: CollectStep = {
  key: "schedule",
  item: "원하는 일정·예산(선택)",
  summary: "일정·예산",
  kind: "text",
  prompt: "원하시는 일정이나 예산이 있으면 알려 주세요. 없으면 「건너뛰기」를 눌러 주세요.",
  optional: true,
};

// ── 환불·수정(홈페이지·랜딩페이지·AI 개발 공통) ──────────────────
const BUILD_REFUND: FaqItem = {
  id: "build-refund",
  label: "환불·취소",
  question: "환불되나요 / 취소하고 싶어요",
  keywords: ["환불", "취소", "돌려받", "돌려주", "돌려줘"],
  answer:
    "작업 시작 전에는 전액 환불해 드려요. 작업을 시작한 뒤에는 진행한 만큼을 빼고 환불해 드리고, 완성본을 드린 뒤에는 환불 대신 수정으로 도와드립니다. 자세한 금액은 담당자가 진행 상황을 확인해서 안내드릴게요.",
  kind: "refund",
};
const BUILD_FIX: FaqItem = {
  id: "build-fix",
  label: "수정 횟수",
  question: "수정은 몇 번 돼요",
  keywords: ["수정", "고쳐", "고치", "바꿔", "바꾸", "수정&몇", "몇번&고", "수정횟수"],
  answer:
    "완성본을 드린 뒤 글자·사진 바꾸기 같은 작은 수정은 2회까지 무료예요. 새 페이지나 새 기능을 더하는 일은 따로 견적을 드립니다.",
  kind: "refund",
};
const BUILD_FIX_MORE: FaqItem = {
  id: "build-fix-more",
  label: "무료 수정 이후",
  question: "무료 수정 다 썼는데 더 고치고 싶어요",
  keywords: [
    "추가수정",
    "다썼",
    "더고치",
    "더고쳐",
    "더수정",
    "또수정",
    "또고치",
    "2회넘",
    "2번넘",
    "두번넘",
    "세번",
    "3번",
    "3회",
    "횟수넘",
    "횟수초과",
  ],
  answer:
    "2회를 넘는 수정이나 기능 추가는 내용을 보고 담당자가 비용을 안내드릴게요. 고치고 싶은 내용을 남겨 주세요.",
  kind: "refund",
  escalate: true,
};
const AI_FIX: FaqItem = {
  id: "ai-fix",
  label: "수정·기능 추가",
  question: "AI 개발 수정·추가",
  keywords: [
    "수정",
    "고쳐",
    "고치",
    "바꿔",
    "바꾸",
    "기능추가",
    "추가&기능",
    "수정&몇",
    "몇번&고",
    "수정횟수",
  ],
  answer:
    "처음에 정한 범위 안의 작은 수정은 2회까지 무료이고, 범위를 넘는 기능 추가는 따로 견적을 드립니다.",
  kind: "refund",
};

// ── 1. 홈페이지 제작 ─────────────────────────────────────────────
const HOMEPAGE: MenuDef = {
  key: "homepage",
  quickLabel: "1.홈페이지 제작",
  title: "홈페이지 제작",
  service: "홈페이지 제작",
  intro:
    "회사·가게를 제대로 소개하는 여러 페이지 홈페이지를 만들어 드립니다. 상담이 들어오면 구글 시트에 쌓이고 카카오톡으로 바로 알림이 가게 연결할 수 있어요. 비용은 99만 원(부가세 별도)이고, 필요한 페이지와 기능에 맞춰 상담 후 확정 견적을 드립니다.",
  faq: [
    {
      id: "hp-price",
      label: "가격·비용",
      question: "가격이 얼마예요 / 비용",
      keywords: ["가격", "비용", "얼마", "견적", "금액", "요금"],
      answer:
        "홈페이지 제작은 99만 원(부가세 별도)입니다. 페이지 수와 기능에 따라 상담 후 확정 견적을 드려요.",
    },
    {
      id: "hp-pages",
      label: "몇 페이지까지",
      question: "몇 페이지까지 돼요",
      keywords: ["몇페이지", "페이지수", "페이지&몇", "메뉴구성", "페이지까지"],
      answer:
        "필요한 페이지와 기능을 들어 보고 견적에 반영해 드립니다. 원하시는 메뉴 구성을 알려 주시면 정확히 안내드릴게요.",
    },
    {
      id: "hp-period",
      label: "제작 기간",
      question: "얼마나 걸려요 / 기간",
      keywords: ["기간", "얼마나걸", "며칠", "언제까지", "걸려", "걸리", "일정"],
      answer: "페이지 수와 자료 준비 상황에 따라 달라서, 상담 때 일정을 함께 정해 드립니다.",
    },
    {
      id: "hp-mobile",
      label: "모바일 화면",
      question: "모바일에서도 잘 보여요",
      keywords: ["모바일", "휴대폰", "핸드폰", "스마트폰", "반응형"],
      answer: "네, 휴대폰에서 먼저 보기 좋게 만듭니다(반응형).",
    },
    {
      id: "hp-domain",
      label: "도메인·호스팅",
      question: "도메인·호스팅은요",
      keywords: ["도메인", "호스팅", "ssl", "주소연결", "서버"],
      answer:
        "도메인 연결과 보안 접속(SSL) 연결까지 도와드립니다. 이미 쓰시는 도메인이 있으면 알려 주세요.",
    },
    {
      id: "hp-seo",
      label: "검색 노출",
      question: "검색에 나오게 해 주나요",
      keywords: ["검색", "노출", "seo", "네이버에", "구글에", "상위"],
      answer:
        "검색 노출 기본(제목·설명·공유 미리보기)은 잡아 드립니다. 검색 순위는 약속드리지 않아요.",
    },
    {
      id: "hp-notify",
      label: "문의 알림",
      question: "문의 오면 알림 오나요",
      keywords: ["알림", "알려", "시트", "문의오면", "문의가오면"],
      answer:
        "네, 상담이 들어오면 구글 시트에 한 줄씩 쌓이고 카카오톡으로 바로 알림이 가게 연결할 수 있어요.",
    },
    {
      id: "hp-maint",
      label: "유지보수",
      question: "만든 뒤 수정은요 / 유지보수",
      keywords: ["유지보수", "유지관리", "운영지원", "관리해", "만든뒤"],
      answer: "연 뒤의 수정과 운영 지원도 상담 때 함께 정해 드립니다.",
    },
    {
      id: "hp-pay",
      label: "결제 기능",
      question: "결제 기능도 넣을 수 있어요",
      keywords: ["결제", "카드", "간편결제", "pg"],
      answer:
        "카드·간편결제 같은 결제 연동도 가능합니다. 원하시는 방식을 알려 주시면 견적에 넣어 드려요.",
    },
    {
      id: "hp-booking",
      label: "예약 기능",
      question: "예약 기능은요",
      keywords: ["예약"],
      answer: "시간대별 예약과 알림을 갖춘 예약 기능도 만들 수 있어요. 상담 때 자세히 여쭤볼게요.",
    },
    {
      id: "hp-cases",
      label: "작업 사례",
      question: "작업 사례 볼 수 있어요",
      keywords: ["사례", "포트폴리오", "작업물", "예시", "샘플", "만든거"],
      answer: `홈페이지 작업 사례에서 보실 수 있어요: ${PORTFOLIO_URL}`,
    },
    BUILD_REFUND,
    BUILD_FIX,
    BUILD_FIX_MORE,
  ],
  collect: [
    NAME,
    INDUSTRY,
    {
      key: "want",
      item: "원하시는 것: 필요한 메뉴·페이지, 넣고 싶은 기능(예약·결제·문의 알림 등)",
      summary: "원하시는 것",
      kind: "text",
      prompt:
        "원하시는 것을 자유롭게 적어 주세요. 필요한 메뉴·페이지, 넣고 싶은 기능(예약·결제·문의 알림 등)을 알려 주시면 좋아요.",
      optional: true,
    },
    {
      key: "refs",
      item: "참고하고 싶은 사이트 주소(없으면 건너뛰기)",
      summary: "참고 사이트",
      kind: "refs",
      prompt:
        "참고하고 싶은 사이트 주소가 있으면 보내 주세요. 여러 개도 괜찮아요. 없으면 「건너뛰기」를 눌러 주세요.",
      optional: true,
    },
    {
      key: "photos",
      item: "자료: 로고, 사진, 소개 글, 지금 쓰는 홈페이지 주소(있으면)",
      summary: "자료",
      kind: "photos",
      prompt:
        "로고, 사진 같은 자료가 있으면 이 채팅방에 보내 주세요. 소개 글이나 지금 쓰는 홈페이지 주소는 글로 보내 주셔도 돼요. 다 보내셨으면 「다 보냈어요」를 눌러 주세요.",
      optional: true,
    },
    {
      key: "domain",
      item: "도메인이 있는지(있으면 주소)",
      summary: "도메인",
      kind: "text",
      prompt: "쓰시는 도메인(인터넷 주소)이 있으면 알려 주세요. 없으면 「건너뛰기」를 눌러 주세요.",
      optional: true,
    },
    CONTACT,
    SCHEDULE,
  ],
};

// ── 2. 랜딩페이지 제작 ───────────────────────────────────────────
const LANDING: MenuDef = {
  key: "landing",
  quickLabel: "2.랜딩페이지 제작",
  title: "랜딩페이지 제작",
  service: "랜딩페이지 제작",
  intro:
    "광고를 보고 들어온 손님이 바로 문의하게 만드는 한 장짜리 페이지(랜딩페이지)를 만들어 드립니다. 15만 원부터(부가세 별도)이고, 상담 후 확정 견적을 드려요. 문의가 들어오면 카톡·시트로 바로 알림이 가게 연결할 수 있어요.",
  faq: [
    {
      id: "lp-price",
      label: "가격·비용",
      question: "가격 / 왜 「부터」예요",
      keywords: ["가격", "비용", "얼마", "견적", "금액", "요금", "부터"],
      answer:
        "15만 원부터(부가세 별도)입니다. 들어갈 내용과 기능(문의 폼, 알림 연결 등)에 따라 상담 후 확정 견적을 드려요.",
    },
    {
      id: "lp-diff",
      label: "홈페이지와 차이",
      question: "홈페이지랑 뭐가 달라요",
      keywords: ["달라", "다른", "차이", "홈페이지랑", "홈페이지와"],
      answer:
        "랜딩페이지는 광고·이벤트 하나를 위해 한 화면으로 문의까지 이어지게 만든 페이지예요. 여러 메뉴로 회사를 소개하려면 홈페이지가 맞습니다.",
    },
    {
      id: "lp-period",
      label: "제작 기간",
      question: "기간",
      keywords: ["기간", "얼마나걸", "며칠", "언제까지", "걸려", "걸리", "일정"],
      answer: "내용과 자료 준비 상황에 따라 달라서 상담 때 일정을 정해 드립니다.",
    },
    {
      id: "lp-ads",
      label: "광고에 쓰기",
      question: "광고(당근·네이버·메타)에 써도 돼요",
      keywords: ["광고", "당근", "메타", "페이스북", "인스타광고", "네이버광고"],
      answer:
        "네, 광고 주소로 쓰시기 좋게 만들어 드려요. 광고에서 몇 명이 들어왔는지 보이게 연결할 수도 있습니다.",
    },
    {
      id: "lp-form",
      label: "문의 폼·알림",
      question: "문의 폼·알림",
      keywords: ["문의폼", "폼", "알림", "알려", "시트"],
      answer:
        "이름·연락처를 받는 문의 폼을 넣고, 들어오면 구글 시트에 쌓이고 카톡으로 바로 알림이 가게 할 수 있어요.",
    },
    {
      id: "lp-copy",
      label: "문구 작성",
      question: "문구도 써 주나요",
      keywords: ["문구", "카피", "글도", "글써", "내용써", "원고"],
      answer:
        "상담에서 들은 내용으로 문구를 정리해 드립니다. 꼭 넣고 싶은 말이 있으면 알려 주세요.",
    },
    {
      id: "lp-result",
      label: "결과 보장",
      question: "결과 보장돼요",
      keywords: ["보장", "효과", "결과", "매출", "문의수", "늘어", "전환"],
      answer: "문의 수나 매출은 약속드리지 않아요. 문의로 이어지기 좋게 구성하는 데 집중합니다.",
    },
    {
      id: "lp-cases",
      label: "작업 사례",
      question: "사례",
      keywords: ["사례", "포트폴리오", "작업물", "예시", "샘플", "만든거"],
      answer: `${PORTFOLIO_URL} 에서 보실 수 있어요.`,
    },
    BUILD_REFUND,
    BUILD_FIX,
    BUILD_FIX_MORE,
  ],
  collect: [
    NAME,
    INDUSTRY,
    {
      key: "want",
      item: "무엇을 알리는 페이지인지(상품·서비스·이벤트), 꼭 넣을 혜택·가격",
      summary: "알릴 내용",
      kind: "text",
      prompt:
        "무엇을 알리는 페이지인지(상품·서비스·이벤트) 알려 주세요. 꼭 넣을 혜택이나 가격이 있으면 같이 적어 주세요.",
      optional: true,
    },
    {
      key: "adChannel",
      item: "어디에 광고하실지(당근, 네이버, 인스타 등 — 선택)",
      summary: "광고할 곳",
      kind: "text",
      prompt:
        "어디에 광고하실 생각이세요? (당근, 네이버, 인스타 등) 정하지 않으셨으면 「건너뛰기」를 눌러 주세요.",
      optional: true,
    },
    {
      key: "refs",
      item: "참고하고 싶은 페이지 주소(없으면 건너뛰기)",
      summary: "참고 페이지",
      kind: "refs",
      prompt:
        "참고하고 싶은 페이지 주소가 있으면 보내 주세요. 여러 개도 괜찮아요. 없으면 「건너뛰기」를 눌러 주세요.",
      optional: true,
    },
    {
      key: "photos",
      item: "자료: 로고, 사진, 상세 설명",
      summary: "자료",
      kind: "photos",
      prompt:
        "로고, 사진 같은 자료가 있으면 이 채팅방에 보내 주세요. 상세 설명은 글로 보내 주셔도 돼요. 다 보내셨으면 「다 보냈어요」를 눌러 주세요.",
      optional: true,
    },
    CONTACT,
    SCHEDULE,
  ],
};

// ── 3. AI 개발 문의 ──────────────────────────────────────────────
const AI: MenuDef = {
  key: "ai",
  quickLabel: "3.AI 개발 문의",
  title: "AI 개발 문의",
  service: "AI 업무 자동화",
  intro:
    "반복되는 업무를 자동으로 돌아가게 하거나, AI 기능을 붙이는 개발을 해 드립니다. 예를 들어 문의 접수 자동 알림, 쇼핑몰 상품 등록·재고 자동화, 데이터를 모아 시트·대시보드로 정리하는 일 등이 있어요. 하시려는 일을 들어 보고 상담 후 견적을 드립니다.",
  faq: [
    {
      id: "ai-price",
      label: "가격·비용",
      question: "가격",
      keywords: ["가격", "비용", "얼마", "견적", "금액", "요금"],
      answer:
        "하시려는 일의 크기에 따라 달라서 상담 후 견적을 드려요. 지금 손으로 하시는 일을 알려 주시면 가능 여부부터 말씀드릴게요.",
    },
    {
      id: "ai-what",
      label: "할 수 있는 일",
      question: "어떤 걸 할 수 있어요",
      keywords: ["어떤걸", "어떤일", "뭘할", "뭐할", "무엇을할", "할수있", "가능한"],
      answer:
        "문의·주문 접수 알림, 쇼핑몰 상품 등록·재고 자동화, 공개 데이터 수집과 시트 정리, 결제(PG)·외부 서비스 연동, 예약 시스템 같은 일을 합니다.",
    },
    {
      id: "ai-gpt",
      label: "AI 기능 넣기",
      question: "챗GPT 같은 AI 넣을 수 있어요",
      keywords: ["챗gpt", "gpt", "chatgpt", "ai넣", "ai기능", "인공지능", "제미나이", "클로드"],
      answer: "업무에 맞게 AI 기능을 붙이는 것도 가능합니다. 어떤 일에 쓰고 싶으신지 알려 주세요.",
    },
    {
      id: "ai-connect",
      label: "프로그램 연결",
      question: "지금 쓰는 프로그램이랑 연결돼요",
      keywords: ["연결", "연동", "프로그램", "쓰는", "엑셀", "스마트스토어"],
      answer: "쓰시는 프로그램 이름을 알려 주시면 연결 가능 여부를 확인해서 답변드릴게요.",
    },
    {
      id: "ai-period",
      label: "개발 기간",
      question: "기간",
      keywords: ["기간", "얼마나걸", "며칠", "언제까지", "걸려", "걸리", "일정"],
      answer: "범위를 정한 뒤 상담 때 일정을 함께 정합니다.",
    },
    {
      id: "ai-app",
      label: "앱 개발",
      question: "앱도 만들어요",
      keywords: ["앱", "어플", "웹앱", "미니앱", "토스"],
      answer: "휴대폰 웹앱이나 토스 미니앱 같은 개발도 상담 가능합니다.",
    },
    BUILD_REFUND,
    AI_FIX,
    BUILD_FIX_MORE,
  ],
  collect: [
    NAME,
    INDUSTRY,
    {
      key: "want",
      item: "지금 손으로 하는 일, 자동으로 바꾸고 싶은 일(자유롭게)",
      summary: "바꾸고 싶은 일",
      kind: "text",
      prompt: "지금 손으로 하시는 일과 자동으로 바꾸고 싶은 일을 자유롭게 적어 주세요.",
      optional: true,
    },
    {
      key: "tools",
      item: "지금 쓰는 프로그램·사이트(예: 스마트스토어, 구글 시트, 예약 앱 — 선택)",
      summary: "쓰는 프로그램",
      kind: "text",
      prompt:
        "지금 쓰시는 프로그램이나 사이트가 있으면 알려 주세요. (예: 스마트스토어, 구글 시트, 예약 앱) 없으면 「건너뛰기」를 눌러 주세요.",
      optional: true,
    },
    {
      key: "photos",
      item: "참고 자료: 화면 캡처, 엑셀 파일 예시(선택)",
      summary: "참고 자료",
      kind: "photos",
      prompt:
        "화면 캡처 같은 참고 자료가 있으면 이 채팅방에 보내 주세요. 파일 주소(링크)는 글로 보내 주셔도 돼요. 다 보내셨으면 「다 보냈어요」를 눌러 주세요.",
      optional: true,
    },
    CONTACT,
    SCHEDULE,
  ],
};

// ── 4. 쇼츠 제작 문의 ────────────────────────────────────────────
export const SHORTS_METHODS = ["자료 보내기", "촬영 없이 맡기기"] as const;
export const SHORTS_COUNTS = ["1편", "5편", "10편"] as const;

const SHORTS: MenuDef = {
  key: "shorts",
  quickLabel: "4.쇼츠 제작 문의",
  title: "쇼츠 제작 문의",
  service: "쇼츠 제작",
  intro: `조회 수보다 문의 댓글이 달리게 기획한 쇼츠를 만들어 드립니다. 참고하고 싶은 영상의 흐름·훅·대본 구성을 분석해서 사장님 가게 자료로 새로 만들어요. 1편(30초 기준) ${SHORTS_ONE}, 첫 주문만 9.9만 원이고, 5편 75만 원, 10편 140만 원(모두 부가세 포함)입니다. 바로 주문은 ${REELS_ORDER_URL} 에서 하실 수 있어요.`,
  faq: [
    {
      id: "sh-price",
      label: "가격·비용",
      question: "가격",
      keywords: ["가격", "비용", "얼마", "견적", "금액", "요금"],
      answer: `1편 ${SHORTS_ONE}(첫 주문만 9.9만 원), 5편 75만 원(편당 15만 원), 10편 140만 원(편당 14만 원), 모두 부가세 포함입니다. 1편은 30초 기준이에요.`,
    },
    {
      id: "sh-trial",
      label: "첫 주문 할인",
      question: "첫 주문 할인 조건",
      keywords: ["첫주문", "할인", "체험", "9.9", "99000"],
      answer:
        "처음 주문하시는 가게만 1편 9.9만 원이에요. 체험 결제 뒤 7일 안에 5편·10편을 사시면 9.9만 원을 빼 드립니다.",
    },
    {
      id: "sh-shoot",
      label: "촬영 필요 여부",
      question: "촬영해야 해요",
      keywords: ["촬영", "찍어", "찍어야", "영상찍", "사진찍"],
      answer:
        "두 가지 중 고르시면 돼요. 가게 사진·영상을 보내 주시면 대본·편집·자막·나레이션은 저희가 하고, 촬영 없이 홈페이지 주소·가게 정보·사진 몇 장으로 맡기실 수도 있어요.",
    },
    {
      id: "sh-copy",
      label: "참고 영상 따라",
      question: "참고 영상은 똑같이 만들어 주나요",
      keywords: ["똑같이", "그대로", "베끼", "따라", "참고영상", "비슷하게"],
      answer: "그대로 베끼지 않고, 흐름·훅·대본 구성을 분석해서 사장님 가게 자료로 새로 만듭니다.",
    },
    {
      id: "sh-pay",
      label: "결제 방법",
      question: "결제는 어떻게",
      keywords: ["결제", "카드", "페이앱", "주문방법", "주문어떻게", "어떻게주문"],
      answer:
        "주문 화면에서 1편·5편·10편을 고르고 결제 대행(페이앱)으로 결제합니다. 자료는 결제 뒤 주문 화면에서 올리시면 돼요.",
    },
    {
      id: "sh-upload",
      label: "업로드·운영",
      question: "업로드도 해 주나요 / 계정 운영",
      keywords: ["업로드", "올려", "계정운영", "운영해", "관리해", "대신올"],
      answer:
        "지금은 쇼츠 제작까지 해 드려요. 올리기·계정 운영은 상담 때 말씀해 주시면 확인해 드릴게요.",
    },
    {
      id: "sh-period",
      label: "제작 기간",
      question: "기간",
      keywords: ["기간", "얼마나걸", "며칠", "언제까지", "걸려", "걸리", "일정"],
      answer: "자료 상황에 따라 달라서 주문 뒤 일정을 안내드려요.",
    },
    {
      id: "sh-result",
      label: "조회수·문의 보장",
      question: "조회수·문의 보장돼요",
      keywords: ["보장", "조회수", "효과", "결과", "매출", "문의많", "늘어"],
      answer: "결과는 약속드리지 않아요. 손님이 댓글로 묻고 싶어지게 흐름을 짜는 데 집중합니다.",
    },
    {
      id: "sh-sample",
      label: "예시 영상",
      question: "예시 볼 수 있어요",
      keywords: ["예시", "샘플", "사례", "포트폴리오", "만든거", "작업물"],
      answer: `${REELS_ORDER_URL} 에 예시가 있어요.`,
    },
    {
      id: "sh-refund",
      label: "환불",
      question: "환불되나요",
      keywords: ["환불", "취소", "돌려받", "돌려주", "돌려줘"],
      answer: `제작 시작 전에는 전액 환불해 드려요. 제작 시작 후에는 아직 시작하지 않은 편수만큼 환불해 드리고, 이때 묶음 할인은 빼고 이미 만든 편은 정가 ${SHORTS_ONE}으로 계산합니다. 완성본을 받으신 뒤 수정은 편당 2회까지 무료예요.`,
      kind: "refund",
    },
    {
      id: "sh-trial-refund",
      label: "체험 환불",
      question: "체험(9.9만)을 환불받으면",
      keywords: ["체험&환불", "체험&취소", "9.9&환불", "첫주문&환불"],
      answer:
        "체험을 결제한 뒤 환불받으셔도 첫 주문 할인은 다시 적용되지 않고, 환불된 체험으로는 묶음 차감도 없어요.",
      kind: "refund",
    },
    {
      id: "sh-fix",
      label: "수정 횟수",
      question: "수정은 몇 번",
      keywords: ["수정", "고쳐", "고치", "바꿔", "바꾸", "수정&몇", "몇번&고", "수정횟수"],
      answer: "완성본을 보내 드리고 편당 2회까지 무료로 고쳐 드려요.",
      kind: "refund",
    },
    {
      id: "sh-fix-more",
      label: "2회 넘는 수정",
      question: "2회 넘게 고치고 싶어요",
      keywords: [
        "추가수정",
        "다썼",
        "더고치",
        "더고쳐",
        "더수정",
        "또수정",
        "또고치",
        "2회넘",
        "2번넘",
        "두번넘",
        "세번",
        "3번",
        "3회",
        "횟수넘",
        "횟수초과",
      ],
      answer:
        "무료 2회를 넘는 수정은 내용을 보고 담당자가 안내드릴게요. 고치고 싶은 내용을 남겨 주세요.",
      kind: "refund",
      escalate: true,
    },
    {
      id: "sh-refund-how",
      label: "환불 신청 방법",
      question: "환불 신청은 어떻게",
      keywords: [
        "환불신청",
        "환불어떻게",
        "환불은어떻게",
        "환불&방법",
        "환불하려면",
        "환불받으려면",
      ],
      answer:
        "주문번호와 함께 이 채팅이나 contact@ai-solution.co.kr 로 말씀해 주시면 확인해서 처리해 드려요.",
      kind: "refund",
    },
  ],
  collect: [
    NAME,
    INDUSTRY,
    {
      key: "method",
      item: "제작 방식: 「자료 보내기」 또는 「촬영 없이 맡기기」",
      summary: "제작 방식",
      kind: "choice",
      choices: SHORTS_METHODS,
      prompt:
        "제작 방식을 골라 주세요. 「자료 보내기」는 가게 사진·영상을 보내 주시는 방식이고, 「촬영 없이 맡기기」는 홈페이지 주소·가게 정보·사진 몇 장으로 맡기시는 방식이에요.",
      optional: true,
    },
    {
      key: "refs",
      item: "참고하고 싶은 쇼츠·릴스 주소(여러 개 가능, 없으면 건너뛰기)",
      summary: "참고 쇼츠·릴스",
      kind: "refs",
      prompt:
        "참고하고 싶은 쇼츠·릴스 주소가 있으면 보내 주세요. 여러 개도 괜찮아요. 없으면 「건너뛰기」를 눌러 주세요.",
      optional: true,
    },
    {
      key: "photos",
      item: "가게 사진·영상(자료 보내기를 고르신 경우), 또는 홈페이지·스마트스토어 주소",
      summary: "가게 자료",
      kind: "photos",
      prompt: (a) =>
        a.method === "촬영 없이 맡기기"
          ? "가게 홈페이지나 스마트스토어 주소를 보내 주세요. 가게 사진 몇 장이 있으면 이 채팅방에 보내 주셔도 좋아요. 다 보내셨으면 「다 보냈어요」를 눌러 주세요."
          : "가게 사진·영상을 이 채팅방에 보내 주세요. 홈페이지·스마트스토어 주소는 글로 보내 주셔도 돼요. 다 보내셨으면 「다 보냈어요」를 눌러 주세요.",
      optional: true,
    },
    {
      key: "instagram",
      item: "인스타그램 아이디(첫 주문 할인 확인용, 있으면)",
      summary: "인스타그램",
      kind: "text",
      prompt:
        "가게 인스타그램 아이디가 있으면 알려 주세요. 첫 주문 할인 확인에 써요. 없으면 「건너뛰기」를 눌러 주세요.",
      optional: true,
    },
    {
      key: "count",
      item: "원하는 편수(1편·5편·10편)",
      summary: "편수",
      kind: "choice",
      choices: SHORTS_COUNTS,
      prompt: "원하시는 편수를 골라 주세요.",
      optional: true,
    },
    CONTACT,
  ],
};

export const MENUS: Record<MenuKey, MenuDef> = {
  homepage: HOMEPAGE,
  landing: LANDING,
  ai: AI,
  shorts: SHORTS,
};

// ── 공통 ─────────────────────────────────────────────────────────
export const HUMAN_FAQ_ID = "common-human";

export const COMMON_FAQ: FaqItem[] = [
  {
    id: "common-company",
    label: "회사 정보",
    question: "어디 있는 회사예요 / 사업자",
    keywords: [
      "어디있",
      "어디에있",
      "위치",
      "사업자",
      "회사주소",
      "주소가",
      "대표가누구",
      "회사정보",
      "사무실",
    ],
    answer:
      "에이아이솔루션, 대표 이서연, 사업자등록번호 215-28-82229, 서울특별시 서초구 서초중앙로29길 16-6 B동 303호입니다.",
  },
  {
    id: HUMAN_FAQ_ID,
    label: "사람과 상담",
    question: "사람이랑 얘기하고 싶어요 / 상담원",
    keywords: [
      "사람이랑",
      "사람과",
      "사람한테",
      "상담원",
      "상담사",
      "직원",
      "대표님",
      "대표와",
      "대표랑",
      "통화",
      "전화",
    ],
    answer: "「대표와 바로 대화」를 누르시면 대표에게 바로 연결됩니다.",
  },
  {
    id: "common-email",
    label: "이메일 문의",
    question: "이메일로 문의",
    keywords: ["이메일", "메일"],
    answer: "contact@ai-solution.co.kr 로 보내 주셔도 됩니다.",
  },
  {
    id: "common-when",
    label: "연락 시점",
    question: "언제 연락 와요",
    keywords: ["언제연락", "연락언제", "연락와", "연락오", "연락은언제", "답장", "회신"],
    answer: "접수되면 담당자가 확인해서 연락드려요(보통 24시간 안).",
  },
];

/** 원본 「그 밖의 모르는 질문」 답 */
export const UNKNOWN_ANSWER =
  "좋은 질문이에요. 담당자가 확인해서 답변드릴게요. 연락처를 남겨 주시면 빠르게 연락드릴게요.";

/** 메뉴를 모를 때 환불·수정 질문이 오면 */
export const REFUND_WHICH = "어떤 서비스 환불·수정이 궁금하세요?";
/** 그 되묻기의 quickReplies(쇼츠와 그 외를 구분해야 한다). 라벨=messageText */
export const REFUND_MENU_LABELS: Record<MenuKey, string> = {
  homepage: "홈페이지 환불·수정",
  landing: "랜딩 환불·수정",
  ai: "AI 개발 환불·수정",
  shorts: "쇼츠 환불·수정",
};

/** AI 에 근거로 넣고, AI 답의 금액·기간 검사에 쓰는 「확정 사실」 글 전체 */
export function allFactTexts(): string[] {
  const out: string[] = [];
  for (const k of MENU_KEYS) {
    const m = MENUS[k];
    out.push(m.intro, ...m.faq.map((f) => f.answer));
  }
  out.push(...COMMON_FAQ.map((f) => f.answer));
  // 홈페이지 정가(대표님 브리프·가격 팝업 src/components/PricePopup.tsx 「150만 원」 → 99만 원)
  out.push("홈페이지 정가 150만 원");
  return out;
}
