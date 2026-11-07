// /api/unsubscribe — 영업 메일 수신거부(누구나 부를 수 있음, 로그인 없음).
//   POST JSON { id }                          ← /unsubscribe?id=… 화면의 「수신거부」 단추
//   POST ?id=…  본문 List-Unsubscribe=One-Click ← 메일 프로그램의 원클릭 수신거부(RFC 8058, 메일 머리 List-Unsubscribe-Post)
//   GET  ?id=…                                ← 처리하지 않고 화면(/unsubscribe?id=…)으로 보낸다
// 🚨 GET 으로는 절대 처리하지 마라. 메일 보안 검사기가 링크를 미리 열어 보는 일이 흔하다.
// 🚨 없는 id·형식 틀린 id 도 같은 답(존재 여부를 밖에 알리지 않는다).
// 처리: 그 id 의 주소를 outreach_suppression 에 넣고, 그 줄 상태를 suppressed 로(src/lib/outreach/service.ts).
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/notify/admin-auth";
import { createNotifyServiceClient } from "@/lib/notify/token-store";
import { readOutreachEnv } from "@/lib/outreach/env";
import { unsubscribeById } from "@/lib/outreach/service";
import { supabaseOutreachStore } from "@/lib/outreach/store";

const UNSUBSCRIBED_MESSAGE = "더 이상 보내지 않겠습니다.";

async function readId(request: Request): Promise<unknown> {
  const fromQuery = new URL(request.url).searchParams.get("id");
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  const raw = (await request.text()).slice(0, 2000);
  if (type.includes("application/json")) {
    try {
      const b = JSON.parse(raw) as { id?: unknown };
      if (b && typeof b === "object" && b.id !== undefined) return b.id;
    } catch {
      // 아래로
    }
  }
  // 원클릭: 본문 List-Unsubscribe=One-Click, id 는 주소(?id=)에
  return fromQuery;
}

export const Route = createFileRoute("/api/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id") ?? "";
        const to = `/unsubscribe${id ? `?id=${encodeURIComponent(id.slice(0, 64))}` : ""}`;
        return new Response(null, { status: 303, headers: { location: to, "cache-control": "no-store" } });
      },
      POST: async ({ request }) => {
        const env = readOutreachEnv();
        const db = createNotifyServiceClient(env);
        if (!db) return json({ ok: false, error: "잠시 뒤 다시 눌러 주세요." }, 500);
        try {
          const id = await readId(request);
          await unsubscribeById(id, supabaseOutreachStore(db));
        } catch (e) {
          console.error(`[unsubscribe] ${e instanceof Error ? e.message : "실패"}`);
          return json({ ok: false, error: "잠시 뒤 다시 눌러 주세요." }, 500);
        }
        return json({ ok: true, message: UNSUBSCRIBED_MESSAGE });
      },
    },
  },
});
