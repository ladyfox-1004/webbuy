// 구글 시트 알림 — Apps Script 웹 앱(apps-script/Code.gs)에 JSON 을 POST 한다.
// 설정 방법: apps-script/README.md
// 시트는 "있으면 좋은" 사본이다. 원본은 DB(inquiries)다. 그래서 어떤 이유로든 예외를 던지지 않고
// 결과를 상태 문자열로 돌려준다.
import type { FetchLike, InquiryNotice, NotifyStatus } from "./types";
import { errorReason } from "./types";

export type SheetPayload = {
  token: string;
  inquiryId: string;
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
  /** 예전 폼이 보낸 값이 있을 때만 들어간다(새 폼에는 칸이 없다) */
  budget?: string;
  launchDate?: string;
  source: string;
};

/** Code.gs doPost 가 읽는 본문. 시트 칸 순서는 Code.gs 의 HEADERS 가 정한다. */
export function buildSheetPayload(n: InquiryNotice, token: string): SheetPayload {
  const body: SheetPayload = {
    token,
    inquiryId: n.id,
    receivedAt: n.receivedAt,
    name: n.name,
    contact: n.contact,
    services: n.services,
    topic: n.topic,
    notes: n.notes,
    referenceLinks: n.referenceLinks,
    hasAttachment: n.hasAttachment,
    fileName: n.fileName,
    attachmentFailed: n.attachmentFailed,
    source: n.source,
  };
  if (n.budget?.trim()) body.budget = n.budget.trim();
  if (n.launchDate?.trim()) body.launchDate = n.launchDate.trim();
  return body;
}

export async function postToSheet(
  n: InquiryNotice,
  cfg: { url?: string; token?: string },
  fetchFn: FetchLike = fetch,
): Promise<NotifyStatus> {
  if (!cfg.url) return "skipped:no_url";
  try {
    // Apps Script 웹 앱은 POST 에 302(googleusercontent)로 답한다. 따라가도 된다.
    const res = await fetchFn(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSheetPayload(n, cfg.token ?? "")),
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return `failed:http_${res.status}`;
    // Apps Script 는 토큰이 틀려도 200 으로 {ok:false} 를 돌려준다.
    const text = await res.text().catch(() => "");
    if (text.includes('"ok":false')) {
      const m = text.match(/"error":"([a-z_]{1,40})"/);
      return `failed:${m ? m[1] : "rejected"}`;
    }
    return "ok";
  } catch (err) {
    return `failed:${errorReason(err)}`;
  }
}
