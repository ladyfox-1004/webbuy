// 브라우저에서 파트너 API 를 부르는 작은 도우미.
import { readStoredRef } from "./ref";

/**
 * 쇼츠 주문을 만든 직후(결제창으로 넘어가기 전) 저장된 추천 코드를 그 주문에 붙인다.
 * 🚨 결제를 막지 않는다: 코드가 없으면 바로 끝, 1.5초 안에 답이 없거나 실패해도 그냥 넘어간다.
 */
export async function attachReelsRef(o: { order_no: string; payurl: string; phone: string }): Promise<void> {
  const ref = readStoredRef()?.code;
  if (!ref) return;
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), 1500);
  try {
    await fetch("/api/partner/attach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...o, ref }),
      keepalive: true,
      signal: ctl?.signal,
    });
  } catch {
    // 무시 — 결제가 먼저다
  } finally {
    clearTimeout(timer);
  }
}
