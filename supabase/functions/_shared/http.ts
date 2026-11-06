// 릴스 함수들 공통 HTTP 도우미(작업 계약서 「HTTP 계약」): POST JSON + CORS.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

export const INVALID_JSON = {
  ok: false,
  reason: "invalid",
  error: "요청 형식이 올바르지 않습니다.",
};
export const SERVER_ERROR = {
  ok: false,
  reason: "server_error",
  error: "잠시 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.",
};

/** OPTIONS·POST 아닌 요청·JSON 본문 읽기를 한 번에. 응답을 돌려주면 그대로 끝, 아니면 본문 객체 */
export async function readJsonBody(req: Request): Promise<Response | Record<string, unknown>> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST")
    return json({ ok: false, reason: "method", error: "POST 만 받습니다." }, 405);
  try {
    const b = await req.json();
    if (!b || typeof b !== "object" || Array.isArray(b)) return json(INVALID_JSON, 400);
    return b as Record<string, unknown>;
  } catch {
    return json(INVALID_JSON, 400);
  }
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
