// PortOne V2 frontend configuration (publishable values)
// 포트원 콘솔 → 결제연동 → 식별코드·API Keys 에서 복사
// 여러 채널키를 결제수단별로 분리하려면 channelKey를 컨텍스트에 맞게 바꿔주세요.
export const PORTONE_CONFIG = {
  storeId: "store-6a0fe30b-7c6c-4db3-ab21-04853f881094",
  channelKey: "channel-key-9c8a72f5-981b-4b9a-ae99-b8f841a64410",
} as const;
