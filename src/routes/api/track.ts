// POST /api/track — 홈페이지 방문 기록(페이지 이동 한 번 = 한 줄). 브라우저 쪽은 src/lib/analytics/client-track.ts.
// 🚨 무엇이 와도 204 로 조용히 답한다(로봇·형식 틀림·저장 실패 모두). 화면에 아무 영향을 주지 않는다.
// 🚨 사용자 에이전트 원문·IP 는 저장하지 않는다. device·source 판단에만 쓴다.
// 저장: public.site_visits(RLS 켬·정책 없음) 에 service_role 로만 넣는다. 마이그레이션 20261107100000_site_visits.sql
import { createFileRoute } from "@tanstack/react-router";
import { readAnalyticsEnv } from "@/lib/analytics/env";
import {
  MAX_TRACK_BODY_BYTES,
  classifySource,
  deviceOf,
  isBot,
  isUntrackedPath,
  parseTrackBody,
} from "@/lib/analytics/track";
import { createNotifyServiceClient } from "@/lib/notify/token-store";

function noContent(): Response {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

/** Origin 머리가 있으면 우리 주소에서 온 것만 받는다(다른 사이트가 기록을 부풀리지 못하게). */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

async function readLimited(request: Request): Promise<string | null> {
  const len = Number(request.headers.get("content-length") ?? "0");
  if (len > MAX_TRACK_BODY_BYTES) return null;
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_TRACK_BODY_BYTES) return null;
  return new TextDecoder().decode(buf);
}

export const Route = createFileRoute("/api/track")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const ua = request.headers.get("user-agent");
          if (isBot(ua) || !sameOrigin(request)) return noContent();
          const raw = await readLimited(request);
          if (raw === null) return noContent();
          const input = parseTrackBody(raw);
          if (!input || isUntrackedPath(input.path)) return noContent();

          const env = readAnalyticsEnv();
          const db = createNotifyServiceClient(env);
          if (!db) return noContent();

          const { error } = await db.from("site_visits").insert({
            visitor_id: input.visitorId,
            session_id: input.sessionId,
            path: input.path,
            referrer_host: input.referrerHost,
            utm_source: input.utmSource,
            utm_medium: input.utmMedium,
            utm_campaign: input.utmCampaign,
            source: classifySource({
              utmSource: input.utmSource,
              referrerHost: input.referrerHost,
              userAgent: ua,
            }),
            device: deviceOf(ua),
          });
          if (error) console.error(`[track] insert 실패 [${error.code ?? "?"}]`);
        } catch {
          // 조용히 무시
        }
        return noContent();
      },
    },
  },
});
