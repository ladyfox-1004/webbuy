// aisolution-gemini: Gemini generateContent 만 중계하는 작은 워커.
// 왜 따로 있나: 본체 워커(aisolution)는 방문자와 가까운 데이터센터(한국 요청이 홍콩 등)에서 돌 수 있어서
//   구글이 "User location is not supported for the API use"(400)로 막는다.
//   이 워커만 wrangler.jsonc 의 placement.region 으로 미국 근처에 고정하고, 본체는 서비스 바인딩으로 부른다.
// 🚨 공개 주소가 없다(workers_dev: false, 라우트 없음). 본체의 서비스 바인딩 GEMINI_PROXY 로만 호출된다.
// 🚨 API 키는 이 워커에 두지 않는다. 본체가 x-goog-api-key 헤더로 넘긴다. 키를 로그·응답에 남기지 마라.
// 🚨 placement 는 fetch 처리기에만 적용된다(RPC 메서드·named entrypoint 는 적용 안 됨). 그래서 RPC 가 아니라
//    기본 export 의 fetch 로 만든다. 근거: https://developers.cloudflare.com/workers/configuration/placement/#review-limitations-1

const GOOGLE_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
export const MODEL_RE = /^[a-z0-9.\-]+$/;

type CfLike = { colo?: string };

/** 이 워커가 어디서 실행됐는지(진단용). request.cf.colo 가 없으면 "?" */
function coloOf(request: Request): string {
  const cf = (request as unknown as { cf?: CfLike }).cf;
  return typeof cf?.colo === "string" && cf.colo ? cf.colo : "?";
}

function diagHeaders(request: Request, extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("x-proxy-colo", coloOf(request));
  // 문서: placement 가 켜져 있으면 Cloudflare 가 요청에 cf-placement(예: "remote-IAD", "local-HKG")를 붙인다.
  const placement = request.headers.get("cf-placement");
  if (placement) h.set("x-proxy-placement", placement);
  return h;
}

function errorResponse(request: Request, status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: diagHeaders(request, { "content-type": "application/json" }),
  });
}

export async function handle(request: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);

  // 진단: 실제로 밖으로 나가는 위치(구글이 보는 위치와 같은 출구)를 Cloudflare trace 로 확인한다.
  if (request.method === "GET" && url.pathname === "/diag") {
    let trace = "";
    try {
      const r = await fetchImpl("https://www.cloudflare.com/cdn-cgi/trace");
      trace = await r.text();
    } catch (e) {
      trace = `trace 실패: ${e instanceof Error ? e.message : String(e)}`;
    }
    const pick = (k: string) => trace.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "?";
    return new Response(
      JSON.stringify({ colo: coloOf(request), egressColo: pick("colo"), egressLoc: pick("loc") }),
      { status: 200, headers: diagHeaders(request, { "content-type": "application/json" }) },
    );
  }

  if (request.method !== "POST" || url.pathname !== "/generate") {
    return errorResponse(request, 404, "not found");
  }

  const apiKey = request.headers.get("x-goog-api-key");
  if (!apiKey) return errorResponse(request, 401, "x-goog-api-key 헤더 없음");

  let payload: { model?: unknown; body?: unknown };
  try {
    payload = (await request.json()) as { model?: unknown; body?: unknown };
  } catch {
    return errorResponse(request, 400, "JSON 본문이 아님");
  }
  const model = payload?.model;
  if (typeof model !== "string" || !MODEL_RE.test(model)) {
    return errorResponse(request, 400, "model 값이 올바르지 않음");
  }
  if (!payload.body || typeof payload.body !== "object") {
    return errorResponse(request, 400, "body 없음");
  }

  let upstream: Response;
  try {
    upstream = await fetchImpl(`${GOOGLE_BASE}${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(payload.body),
    });
  } catch (e) {
    // fetch 오류 메시지에는 키가 들어가지 않는다(키는 헤더에만 있다).
    return errorResponse(request, 502, `구글 호출 실패: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 구글 응답 상태·본문을 그대로 돌려준다.
  const headers = diagHeaders(request, {
    "content-type": upstream.headers.get("content-type") ?? "application/json",
  });
  return new Response(await upstream.text(), { status: upstream.status, headers });
}

export default {
  fetch(request: Request): Promise<Response> {
    return handle(request);
  },
};
