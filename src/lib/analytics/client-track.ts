// 브라우저 쪽 방문 기록 — 페이지 이동마다 POST /api/track 한 번(sendBeacon, 없으면 fetch keepalive).
// 서버 쪽은 src/routes/api/track.ts. 루트 레이아웃의 <VisitTracker/> 가 부른다.
//
// - visitor_id: localStorage(브라우저마다 하나). 막혀 있으면 세션 값으로 대신한다.
// - session_id: sessionStorage(탭 세션마다 하나).
// - 세션 첫 방문 때 URL 의 utm_* 와 document.referrer 호스트를 세션에 저장해 그 세션 모든 기록에 붙인다.
// - 기록 안 함: /admin…, /login, 그리고 관리자 본인(관리자 화면에 들어오면 useAdminGate 가 aisol_no_track=1 을 저장).

export const NO_TRACK_KEY = "aisol_no_track";
const VISITOR_KEY = "aisol_vid";
const SESSION_KEY = "aisol_trk_sess";

type SessionInfo = { id: string; r?: string; us?: string; um?: string; uc?: string };

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // 아래로
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function lsGet(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string) {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    // 저장 막힘 — 무시
  }
}

/** 관리자 화면에 들어오면 부른다. 이 브라우저는 이후 방문 기록에서 빠진다. */
export function markNoTrack() {
  lsSet(NO_TRACK_KEY, "1");
}

function shouldSkip(path: string): boolean {
  if (/^\/admin(\/|$|[_.])/i.test(path) || /^\/login(\/|$)/i.test(path)) return true;
  return lsGet(NO_TRACK_KEY) === "1";
}

function clip(v: string | null, max = 100): string | undefined {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : undefined;
}

function sessionInfo(): SessionInfo {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    raw = null;
  }
  if (raw) {
    try {
      const s = JSON.parse(raw) as SessionInfo;
      if (s && typeof s.id === "string" && s.id) return s;
    } catch {
      // 새로 만든다
    }
  }
  const info: SessionInfo = { id: newId() };
  try {
    const q = new URLSearchParams(window.location.search);
    info.us = clip(q.get("utm_source"));
    info.um = clip(q.get("utm_medium"));
    info.uc = clip(q.get("utm_campaign"));
  } catch {
    // 무시
  }
  try {
    if (document.referrer) {
      const h = new URL(document.referrer).hostname.toLowerCase();
      if (h && h !== window.location.hostname.toLowerCase()) info.r = h.slice(0, 100);
    }
  } catch {
    // 무시
  }
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(info));
  } catch {
    // 저장 막힘 — 이번 기록에는 그래도 붙인다
  }
  return info;
}

function visitorId(fallback: string): string {
  const v = lsGet(VISITOR_KEY);
  if (v && /^[A-Za-z0-9_-]{8,64}$/.test(v)) return v;
  const id = newId();
  lsSet(VISITOR_KEY, id);
  return lsGet(VISITOR_KEY) === id ? id : fallback;
}

let lastSent = { path: "", at: 0 };

/** 페이지 이동 한 번 기록. 실패해도 화면에 아무 일도 일으키지 않는다. */
export function trackPageView(path: string) {
  try {
    if (typeof window === "undefined" || !path) return;
    if (shouldSkip(path)) return;
    const now = Date.now();
    // 같은 경로가 1초 안에 두 번 오면(개발 모드 이중 실행 등) 한 번만
    if (lastSent.path === path && now - lastSent.at < 1000) return;
    lastSent = { path, at: now };

    const s = sessionInfo();
    const body = JSON.stringify({
      v: visitorId(s.id),
      s: s.id,
      p: path.slice(0, 300),
      r: s.r,
      us: s.us,
      um: s.um,
      uc: s.uc,
    });
    const url = "/api/track";
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      // 문자열을 넘기면 text/plain 으로 간다(사전 요청 없음). 서버는 본문을 JSON 으로 읽는다.
      if (navigator.sendBeacon(url, body)) return;
    }
    void fetch(url, {
      method: "POST",
      body,
      keepalive: true,
      headers: { "content-type": "text/plain;charset=UTF-8" },
    }).catch(() => undefined);
  } catch {
    // 조용히 무시
  }
}
