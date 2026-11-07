// YouTube Data API v3 — 워커에서 직접 부른다(영업 메일 후보 고르기, ./pick.ts).
// 단위 비용은 노트북 screener.py 와 같다: search.list 100, channels/playlistItems/videos.list 1.
// 🚨 API 키(YOUTUBE_API_KEY, 워커 비밀값)는 오류 글·로그에 절대 넣지 않는다(주소에 key= 가 붙으므로 주소도 안 찍는다).
// 🚨 무료 요금제는 실행 하나에 외부 호출 50개. 그래서 다시 시도하지 않는다(실패하면 다음 실행이 한다).
//    호출 수·단위는 밖에서 준 meter 가 센다(호출 전에 한도를 넘으면 BudgetStop).
import { parseIsoDuration, type VideoInfo } from "./pick-rules";

export const API_BASE = "https://www.googleapis.com/youtube/v3";
export const COST_SEARCH = 100;
export const COST_CHANNELS = 1;
export const COST_PLAYLIST_ITEMS = 1;
export const COST_VIDEOS = 1;

export type YtFetch = (url: string) => Promise<{ status: number; json(): Promise<unknown> }>;

/** 구글이 쿼터 초과(403 quotaExceeded 등)를 돌려줬다 — 오늘은 더 부르지 않는다 */
export class YouTubeQuotaExceeded extends Error {}
/** 그 밖의 오류. 메시지에 키·주소가 없다. */
export class YouTubeError extends Error {}
/** 이 실행의 호출 한도/하루 단위 한도에 닿아 부르지 않았다 */
export class BudgetStop extends Error {}

/** 이 실행에서 쓴 외부 호출 수(Supabase 포함)와 유튜브 단위 */
export interface Meter {
  calls: number;
  units: number;
  /** 이번 호출(1개, cost 단위)을 해도 되는가. 안 되면 BudgetStop 사유 */
  check(cost: number): string;
}

export type ChannelMeta = {
  id: string;
  title: string;
  description: string;
  customUrl: string;
  country: string;
  hiddenSubs: boolean;
  subscribers: number;
  uploadsPlaylist: string;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const int = (v: unknown): number => {
  const n = Number.parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
};

export function createYouTubeClient(apiKey: string, fetchFn: YtFetch, meter: Meter) {
  async function call(endpoint: string, params: Record<string, string>, cost: number): Promise<Obj> {
    const why = meter.check(cost);
    if (why) throw new BudgetStop(why);
    meter.calls += 1;
    meter.units += cost;
    const q = new URLSearchParams({ ...params, key: apiKey });
    let res: { status: number; json(): Promise<unknown> };
    try {
      res = await fetchFn(`${API_BASE}/${endpoint}?${q.toString()}`);
    } catch (e) {
      const m = e instanceof Error ? e.name : "network";
      throw new YouTubeError(`${endpoint} 네트워크 오류(${m})`);
    }
    let body: Obj = {};
    try {
      body = obj(await res.json());
    } catch {
      body = {};
    }
    if (res.status === 200) return body;
    const err = obj(body.error);
    const reason = str(obj((Array.isArray(err.errors) ? err.errors[0] : undefined) as unknown).reason) || "unknown";
    if (res.status === 403 && ["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"].includes(reason)) {
      throw new YouTubeQuotaExceeded(`구글 쿼터 초과(${reason})`);
    }
    throw new YouTubeError(`${endpoint} 오류 HTTP ${res.status} (${reason})`);
  }

  return {
    /** search.list 1회(100단위) — 최근 롱폼 영상을 올린 채널ID */
    async searchChannelIds(keyword: string, publishedAfter: string): Promise<string[]> {
      const data = await call(
        "search",
        {
          part: "snippet",
          type: "video",
          videoDuration: "long",
          regionCode: "KR",
          relevanceLanguage: "ko",
          publishedAfter,
          order: "relevance",
          maxResults: "50",
          q: keyword,
        },
        COST_SEARCH,
      );
      const ids: string[] = [];
      for (const it of Array.isArray(data.items) ? data.items : []) {
        const cid = str(obj(obj(it).snippet).channelId);
        if (cid && !ids.includes(cid)) ids.push(cid);
      }
      return ids;
    },

    /** channels.list — 50개씩 1회(1단위). 없는(삭제·비공개) 채널은 결과에 없다. */
    async fetchChannels(ids: string[]): Promise<Map<string, ChannelMeta>> {
      const out = new Map<string, ChannelMeta>();
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const data = await call(
          "channels",
          { part: "snippet,statistics,contentDetails", id: batch.join(","), maxResults: "50" },
          COST_CHANNELS,
        );
        for (const it of Array.isArray(data.items) ? data.items : []) {
          const o = obj(it);
          const id = str(o.id);
          if (!id) continue;
          const sn = obj(o.snippet);
          const st = obj(o.statistics);
          out.set(id, {
            id,
            title: str(sn.title),
            description: str(sn.description),
            customUrl: str(sn.customUrl),
            country: str(sn.country),
            hiddenSubs: st.hiddenSubscriberCount === true,
            subscribers: int(st.subscriberCount),
            uploadsPlaylist: str(obj(obj(o.contentDetails).relatedPlaylists).uploads),
          });
        }
      }
      return out;
    },

    /** playlistItems.list 1회 — 최근 영상 ID 50개 */
    async recentVideoIds(uploadsPlaylist: string): Promise<string[]> {
      const data = await call(
        "playlistItems",
        { part: "contentDetails", playlistId: uploadsPlaylist, maxResults: "50" },
        COST_PLAYLIST_ITEMS,
      );
      const ids: string[] = [];
      for (const it of Array.isArray(data.items) ? data.items : []) {
        const v = str(obj(obj(it).contentDetails).videoId);
        if (v) ids.push(v);
      }
      return ids;
    },

    /** videos.list — 50개씩 1회. 길이·조회수·제목 */
    async fetchVideos(ids: string[]): Promise<VideoInfo[]> {
      const out: VideoInfo[] = [];
      for (let i = 0; i < ids.length; i += 50) {
        const data = await call(
          "videos",
          { part: "contentDetails,statistics,snippet", id: ids.slice(i, i + 50).join(","), maxResults: "50" },
          COST_VIDEOS,
        );
        for (const it of Array.isArray(data.items) ? data.items : []) {
          const o = obj(it);
          const id = str(o.id);
          if (!id) continue;
          out.push({
            id,
            title: str(obj(o.snippet).title),
            publishedAt: str(obj(o.snippet).publishedAt),
            durationSec: parseIsoDuration(str(obj(o.contentDetails).duration)),
            views: int(obj(o.statistics).viewCount),
          });
        }
      }
      return out;
    },
  };
}

export type YouTubeClient = ReturnType<typeof createYouTubeClient>;
