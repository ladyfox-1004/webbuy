// 유튜브 재생목록·영상 정보. 순수 함수(파싱·video_id 추출)와 네트워크 함수(fetch)를 나눠 둔다.
// 🚨 이 파일은 브라우저(관리자 화면의 "영상 링크 추가")에서도 import 한다. 서버 전용 모듈을 넣지 마라.
// 🚨 API 키를 쓰지 않는다. 재생목록은 공개 페이지 HTML, 제목·채널은 oEmbed(키 불필요)로 읽는다.

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function isVideoId(s: string): boolean {
  return VIDEO_ID_RE.test(s);
}

/**
 * 유튜브 링크 → video_id(11자). 못 찾으면 null.
 * 지원: youtube.com/watch?v=, m.youtube.com, music.youtube.com, youtu.be/, /shorts/, /embed/, /live/,
 *      뒤에 &list=·&t= 등이 붙어도 된다. 11자 ID 만 넣어도 받아 준다.
 */
export function extractVideoId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (isVideoId(raw)) return raw;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\.|^music\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  let id: string | null = null;
  if (host === "youtu.be") {
    id = parts[0] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") id = url.searchParams.get("v");
    else if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "")) id = parts[1] ?? null;
  }
  return id && isVideoId(id) ? id : null;
}

/**
 * 재생목록 페이지 HTML → video_id 목록(나온 순서, 중복 제거).
 * 유튜브는 화면 형식을 자주 바꾸므로 세 가지 방식을 차례로 시도하고, 처음으로 결과가 나온 것을 쓴다.
 *  1) 예전 형식  "playlistVideoRenderer":{"videoId":"…"}
 *  2) 2025~ 형식 "contentId":"…","contentType":"LOCKUP_CONTENT_TYPE_VIDEO"  (2026-10 실제 페이지가 이 형식)
 *  3) 최후 수단   "videoId":"…" 전부
 */
export function parsePlaylistVideoIds(html: string): string[] {
  const strategies: RegExp[] = [
    /"playlistVideoRenderer":\{"videoId":"([A-Za-z0-9_-]{11})"/g,
    /"contentId":"([A-Za-z0-9_-]{11})","contentType":"LOCKUP_CONTENT_TYPE_VIDEO"/g,
    /"videoId":"([A-Za-z0-9_-]{11})"/g,
  ];
  for (const re of strategies) {
    const seen = new Set<string>();
    for (const m of html.matchAll(re)) seen.add(m[1]);
    if (seen.size > 0) return [...seen];
  }
  return [];
}

export function playlistUrl(playlistId: string): string {
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
}

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept-Language": "ko,en;q=0.8",
  // 유럽 등에서 뜨는 쿠키 동의 화면을 건너뛴다.
  Cookie: "CONSENT=YES+1",
};

/** 재생목록 페이지를 받아 video_id 목록을 돌려준다. 실패하면 예외. */
export async function fetchPlaylistVideoIds(playlistId: string): Promise<string[]> {
  const res = await fetch(playlistUrl(playlistId), { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`재생목록 페이지 HTTP ${res.status}`);
  return parsePlaylistVideoIds(await res.text());
}

export type VideoMeta = { title: string | null; channel: string | null };

/** oEmbed 로 제목·채널명. 비공개·삭제 영상이면 둘 다 null(예외 없음). */
export async function fetchVideoMeta(videoId: string): Promise<VideoMeta> {
  try {
    const watch = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`,
      { headers: BROWSER_HEADERS },
    );
    if (!res.ok) return { title: null, channel: null };
    const j = (await res.json()) as { title?: unknown; author_name?: unknown };
    return {
      title: typeof j.title === "string" ? j.title : null,
      channel: typeof j.author_name === "string" ? j.author_name : null,
    };
  } catch {
    return { title: null, channel: null };
  }
}
