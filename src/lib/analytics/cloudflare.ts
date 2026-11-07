// Cloudflare GraphQL Analytics API 에서 날짜별 페이지뷰·고유 방문자(로봇 섞인 숫자)를 읽는다.
// 🚨 서버 전용. 토큰은 Authorization 머리에만 쓰고, 돌려주는 값·오류 문구에 넣지 않는다.
// 날짜는 Cloudflare 기준 UTC 날짜다(한국 날짜와 9시간 어긋난다).

export type CfDay = { date: string; pageViews: number; uniques: number; requests: number };

export type CfResult =
  | { connected: false }
  | { connected: true; days: CfDay[] }
  | { connected: true; error: string };

const ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

const QUERY = `query Visits($zoneTag: string, $since: Date!, $until: Date!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequests1dGroups(limit: 40, filter: { date_geq: $since, date_leq: $until }, orderBy: [date_DESC]) {
        dimensions { date }
        sum { pageViews requests }
        uniq { uniques }
      }
    }
  }
}`;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type Group = {
  dimensions?: { date?: string };
  sum?: { pageViews?: number; requests?: number };
  uniq?: { uniques?: number };
};

/** 응답 본문 → 날짜별 줄(최신 먼저). 모양이 틀리면 null */
export function parseCfResponse(body: unknown): CfDay[] | null {
  const b = body as {
    data?: { viewer?: { zones?: { httpRequests1dGroups?: Group[] }[] } };
  } | null;
  const groups = b?.data?.viewer?.zones?.[0]?.httpRequests1dGroups;
  if (!Array.isArray(groups)) return null;
  return groups
    .filter((g) => typeof g?.dimensions?.date === "string")
    .map((g) => ({
      date: g.dimensions!.date!,
      pageViews: Number(g.sum?.pageViews ?? 0) || 0,
      requests: Number(g.sum?.requests ?? 0) || 0,
      uniques: Number(g.uniq?.uniques ?? 0) || 0,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export async function fetchCfDaily(opts: {
  token: string | undefined;
  zoneTag: string;
  days?: number;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<CfResult> {
  if (!opts.token) return { connected: false };
  const days = opts.days ?? 30;
  const now = opts.now ?? new Date();
  const until = ymd(now);
  const since = ymd(new Date(now.getTime() - (days - 1) * 86400000));
  const f = opts.fetchImpl ?? fetch;
  try {
    const res = await f(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${opts.token}` },
      body: JSON.stringify({ query: QUERY, variables: { zoneTag: opts.zoneTag, since, until } }),
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => null)) as {
      errors?: { message?: string }[] | null;
    } | null;
    if (!res.ok) return { connected: true, error: `Cloudflare 응답 오류 HTTP ${res.status}` };
    if (body?.errors && body.errors.length > 0) {
      const msg = String(body.errors[0]?.message ?? "알 수 없는 오류").slice(0, 200);
      return { connected: true, error: `Cloudflare 오류: ${msg}` };
    }
    const parsed = parseCfResponse(body);
    if (!parsed) return { connected: true, error: "Cloudflare 응답 모양이 예상과 다릅니다." };
    return { connected: true, days: parsed };
  } catch {
    return { connected: true, error: "Cloudflare 에 연결하지 못했습니다(시간 초과 또는 네트워크)." };
  }
}
