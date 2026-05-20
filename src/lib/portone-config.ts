// PortOne V2 frontend configuration (publishable values)
// 포트원 콘솔 → 결제연동 → 식별코드·API Keys 에서 복사
// 결제수단별 채널키 분리: 토스페이(간편결제)와 카드 채널이 다릅니다.
export const PORTONE_CONFIG = {
  storeId: "store-6a0fe30b-7c6c-4db3-ab21-04853f881094",
  // 토스페이(간편결제) 채널
  channelKeyEasyPay: "channel-key-9c8a72f5-981b-4b9a-ae99-b8f841a64410",
  // 카드(일반결제) 채널 — 포트원 콘솔에서 카드 채널 추가 후 채널키 입력
  channelKeyCard: "" as string,
} as const;
