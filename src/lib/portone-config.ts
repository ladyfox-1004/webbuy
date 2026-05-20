// PortOne V2 frontend configuration (publishable values)
// 포트원 콘솔 → 결제연동 → 식별코드·API Keys 에서 복사
// 여러 채널키를 결제수단별로 분리하려면 channelKey를 컨텍스트에 맞게 바꿔주세요.
export const PORTONE_CONFIG = {
  storeId: "store-00000000-0000-0000-0000-000000000000",
  channelKey: "channel-key-00000000-0000-0000-0000-000000000000",
} as const;
