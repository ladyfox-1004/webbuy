// 납품 사이트 목록. 🚨 주소는 여기 한 곳에만 적는다.
// 홈(src/routes/index.tsx)과 업종별 솔루션 페이지(src/components/SolutionPage.tsx)가
// 같은 배열을 읽는다. 주소를 두 벌로 적으면 한쪽만 고쳐진다.

export type PortfolioSite = {
  title: string;
  tag: string;
  url: string;
};

export const portfolioSites: PortfolioSite[] = [
  { title: "모발이식 상담 랜딩 · AISOLUTION", tag: "의료", url: "https://radiant-marzipan-765729.netlify.app/" },
  { title: "정부지원 신청 랜딩 · AISOLUTION", tag: "신청/폼", url: "https://apply.xn--zf4b9pu4hbqu.com/" },
  { title: "장기렌트 견적 랜딩 · AISOLUTION", tag: "견적", url: "https://funcar-rentcar.netlify.app/" },
  { title: "법무법인 상담 랜딩 · AISOLUTION", tag: "법률", url: "https://van-pos-legal.netlify.app/" },
  { title: "기사 일정 관리 SaaS · AISOLUTION", tag: "플랫폼", url: "https://ilzik.com/" },
  { title: "마켓 운영대행 소개 · AISOLUTION", tag: "서비스", url: "https://psm-vip-marketing.netlify.app/" },
  { title: "안과 시력교정 랜딩 · AISOLUTION", tag: "의료", url: "https://lambent-salmiakki-a9100e.netlify.app/" },
  { title: "형사전문 법무법인 랜딩 · AISOLUTION", tag: "법률", url: "https://mjcrime.netlify.app/" },
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

// 사례 링크는 이름(" · " 앞부분)으로 찾아 쓴다.
export const portfolioByName = new Map(
  portfolioSites.map((s) => [s.title.split(" · ")[0], s] as const),
);

// 에이아이솔루션 1:1 오픈채팅 (개인 카톡 아이디 대신 영업 창구로 사용)
export const KAKAO_OPENCHAT_URL = "https://open.kakao.com/o/sd29wW8h";

// 토스 미니앱은 토스 앱 컨테이너 안에서만 실행된다. PC 브라우저로는 열리지 않는다.
export const TOSS_MINIAPP_URL = "https://minion.toss.im/VlDAkiWn";

export function shot(url: string) {
  return `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url&viewport.width=1280&viewport.height=800`;
}
