
INSERT INTO public.products (title, tag, description, amount, currency, category, tags, slug, status, active, product_type, sort_order)
VALUES
  ('부동산 홈페이지 개발 상담 · 기획 패키지', 'Real Estate',
   '매물 등록·검색, 지도 연동, 중개사 문의까지 갖춘 부동산 전용 홈페이지 개발을 위한 상담과 기획 문서 패키지입니다. 구매 후 이메일로 기획서 PDF와 상담 예약 링크가 발송됩니다.',
   100000, 'KRW', '개발 상담', ARRAY['부동산','웹','기획'], 'real-estate-site', 'live', true, 'file', 10),
  ('부동산 경매 플랫폼 개발 상담 · 기획 패키지', 'Auction',
   '경매 물건 정보, 입찰 일정, 실시간 알림 등 경매 특화 플랫폼 개발을 위한 상담과 기획 문서 패키지입니다. 구매 후 이메일로 기획서 PDF와 상담 예약 링크가 발송됩니다.',
   120000, 'KRW', '개발 상담', ARRAY['부동산','경매','웹'], 'real-estate-auction', 'live', true, 'file', 20),
  ('암호화폐 서비스 개발 상담 · 기획 패키지', 'Crypto',
   '코인 대시보드, 지갑 연동, 차트 시각화 등 암호화폐 서비스 개발을 위한 상담과 기획 문서 패키지입니다. 구매 후 이메일로 기획서 PDF와 상담 예약 링크가 발송됩니다.',
   150000, 'KRW', '개발 상담', ARRAY['crypto','wallet','dashboard'], 'crypto-dev', 'live', true, 'file', 30),
  ('어필리에이트 사이트 개발 상담 · 기획 패키지', 'Affiliate',
   '제휴 마케팅 사이트, 추천 링크 추적, 실적 집계 관리자 개발을 위한 상담과 기획 문서 패키지입니다. 구매 후 이메일로 기획서 PDF와 상담 예약 링크가 발송됩니다.',
   100000, 'KRW', '개발 상담', ARRAY['affiliate','marketing','tracking'], 'affiliate-dev', 'live', true, 'file', 40),
  ('지도연동 소개팅앱 개발 상담 · 기획 패키지', 'Social / Dating',
   '위치 기반 매칭, 지도 핀, 채팅 기능이 연동된 소개팅 서비스 개발을 위한 상담과 기획 문서 패키지입니다. 구매 후 이메일로 기획서 PDF와 상담 예약 링크가 발송됩니다.',
   130000, 'KRW', '개발 상담', ARRAY['dating','map','app'], 'dating-map-app', 'live', true, 'file', 50),
  ('중고거래 플랫폼 개발 상담 · 기획 패키지', 'C2C Marketplace',
   '당근마켓 스타일 지역 기반 중고거래 플랫폼 (등록·채팅·거래 상태·신고 포함) 개발을 위한 상담과 기획 문서 패키지입니다. 구매 후 이메일로 기획서 PDF와 상담 예약 링크가 발송됩니다.',
   130000, 'KRW', '개발 상담', ARRAY['c2c','marketplace','chat'], 'c2c-marketplace', 'live', true, 'file', 60);
