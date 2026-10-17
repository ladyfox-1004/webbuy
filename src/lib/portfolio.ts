// 납품 사이트 목록. 🚨 주소는 여기 한 곳에만 적는다.
// 홈(src/routes/index.tsx)과 업종별 솔루션 페이지(src/components/SolutionPage.tsx)가
// 같은 배열을 읽는다. 주소를 두 벌로 적으면 한쪽만 고쳐진다.
// 썸네일은 public/thumbs/ 에 미리 캡처해 둔 파일이다. 사이트를 추가하면 썸네일도 추가한다(아래 shot 참고).

export type PortfolioSite = {
  title: string;
  tag: string;
  /** 없으면 링크 없이 캡처만 보여주는 카드가 된다(개인 도구처럼 주소를 공개하지 않을 것). */
  url?: string;
  /** url 이 없는 카드의 캡처 파일(public/thumbs/). url 이 있으면 shot(url) 을 쓴다. */
  thumb?: string;
};

export const portfolioSites: PortfolioSite[] = [
  { title: "모발이식 상담 랜딩 · AISOLUTION", tag: "의료", url: "https://radiant-marzipan-765729.netlify.app/" },
  { title: "정부지원 신청 랜딩 · AISOLUTION", tag: "신청/폼", url: "https://apply.xn--zf4b9pu4hbqu.com/" },
  { title: "장기렌트 견적 랜딩 · AISOLUTION", tag: "견적", url: "https://funcar-rentcar.netlify.app/" },
  { title: "법무법인 상담 랜딩 · AISOLUTION", tag: "법률", url: "https://van-pos-legal.netlify.app/" },
  { title: "기사 일정 관리 SaaS · AISOLUTION", tag: "플랫폼", url: "https://ilzik.com/" },
  // 개인 운영 도구라 주소를 걸지 않는다. 캡처는 /simple 화면을 demo 로그인 흉내로 찍은 것(개인 링크·광고주 이름 없는 화면).
  { title: "AI 쇼츠 자동 생성기 · AISOLUTION", tag: "자동화", thumb: "/thumbs/shortsmaker.webp" },
  { title: "마켓 운영대행 소개 · AISOLUTION", tag: "서비스", url: "https://psm-vip-marketing.netlify.app/" },
  { title: "안과 시력교정 랜딩 · AISOLUTION", tag: "의료", url: "https://lambent-salmiakki-a9100e.netlify.app/" },
  { title: "형사전문 법무법인 랜딩 · AISOLUTION", tag: "법률", url: "https://mjcrime.netlify.app/" },
  { title: "음주운전 전문 법무법인 랜딩 · AISOLUTION", tag: "법률", url: "https://chowon-dui.netlify.app/" },
  { title: "식당 브랜드 페이지 · AISOLUTION", tag: "요식", url: "https://thunderous-semolina-973f49.netlify.app/" },
  { title: "오피스텔 분양 방문예약 · AISOLUTION", tag: "분양", url: "https://preeminent-longma-670789.netlify.app/" },
  { title: "자동매매 서비스 소개 · AISOLUTION", tag: "서비스", url: "https://stellular-zabaione-a4c7f8.netlify.app/" },
  { title: "라미네이트 센터 랜딩 · AISOLUTION", tag: "의료", url: "https://sparkly-smakager-4041fe.netlify.app/" },
  { title: "아파트 분양 안내 · AISOLUTION", tag: "분양", url: "https://storied-licorice-8bf649.netlify.app/" },
  { title: "남성의학 센터 랜딩 · AISOLUTION", tag: "의료", url: "https://celadon-puppy-3aca7f.netlify.app/" },
  { title: "비뇨의학과 랜딩 · AISOLUTION", tag: "의료", url: "https://timely-cascaron-a8447e.netlify.app/" },
  { title: "인터넷 가입 센터 랜딩 · AISOLUTION", tag: "통신", url: "https://vocal-kangaroo-bd0025.netlify.app/" },
  { title: "GPA KOREA 브랜드 페이지 · AISOLUTION", tag: "브랜드", url: "https://tangerine-gumdrop-104c7a.netlify.app/" },
];

// 사례 링크는 이름(" · " 앞부분)으로 찾아 쓴다. 링크가 없는 사이트는 사례로 걸 수 없으니 뺀다.
export const portfolioByName = new Map(
  portfolioSites.flatMap((s) =>
    s.url ? [[s.title.split(" · ")[0], { ...s, url: s.url }] as const] : [],
  ),
);

// 에이아이솔루션 1:1 오픈채팅 (개인 카톡 아이디 대신 영업 창구로 사용)
export const KAKAO_OPENCHAT_URL = "https://open.kakao.com/o/sd29wW8h";

// 토스 미니앱은 토스 앱 컨테이너 안에서만 실행된다. PC 브라우저로는 열리지 않는다.
export const TOSS_MINIAPP_URL = "https://minion.toss.im/VlDAkiWn";

// 썸네일은 미리 캡처해 둔 로컬 파일(public/thumbs/<key>.webp)을 쓴다.
// 외부 스크린샷 API는 무료 한도(하루 요청 수)가 낮아 썸네일이 깨지므로 쓰지 않는다.
// key = 주소의 호스트명을 소문자로 바꾸고 "."을 모두 "-"로 바꾼 것 (예: ilzik.com → ilzik-com).
// 🚨 portfolioSites 에 사이트를 추가하면 썸네일도 같이 만든다:
//    python scripts/capture-thumbs.py <key>  → public/thumbs/<key>.webp 생성 후 이미지를 눈으로 확인.
export function thumbKey(url: string) {
  return new URL(url).hostname.toLowerCase().replaceAll(".", "-");
}

export function shot(url: string) {
  return `/thumbs/${thumbKey(url)}.webp`;
}
