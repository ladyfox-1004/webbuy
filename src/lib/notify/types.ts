// 알림 쪽이 공유하는 "접수 한 건" 모양. DB 행과 별개로, 알림에 필요한 값만 담는다.
export type InquiryNotice = {
  /** inquiries.id (서버가 미리 만든 uuid) */
  id: string;
  /** ISO 시각 */
  receivedAt: string;
  name: string;
  contact: string;
  services: string[];
  topic: string;
  notes: string;
  referenceLinks: string;
  hasAttachment: boolean;
  fileName: string;
  attachmentFailed: boolean;
  /** 예전 폼(캐시된 화면)이 보낸 값만 들어온다. 새 폼에는 칸이 없다. */
  budget?: string;
  launchDate?: string;
  source: "homepage" | "test";
};

/**
 * 알림 결과. inquiries.sheet_notify_status / kakao_notify_status 에 그대로 적는다.
 * - "ok"          : 보냄
 * - "skipped:…"   : 설정이 없어 건너뜀(정상)
 * - "failed:…"    : 보내려다 실패. 뒤에 붙는 말은 오류 종류만(토큰·연락처는 넣지 않는다)
 */
export type NotifyStatus = "ok" | `skipped:${string}` | `failed:${string}`;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** 오류를 상태 문자열로 줄인다. 메시지에 비밀값이 섞일 수 있어 이름과 짧은 메시지만, 120자 이내. */
export function errorReason(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`.slice(0, 120);
  return "unknown";
}
