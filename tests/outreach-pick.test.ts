// 영업 메일 후보 매일 고르기(워커 예약 실행) 시험 — DB·유튜브 전부 가짜. 실행: bun test ./tests
// 노트북 원본 시험(C:/shortsmaker/outreach/daily/tests/test_daily_pick.py, sampler/tests/test_sampler.py)의 사례를 옮겼다.
import { describe, expect, test } from "bun:test";
import { NICHES } from "../src/lib/outreach/niches";
import {
  MAX_CALLS_PER_RUN,
  PER_DAY,
  QUOTA_DAILY,
  RECHECK_MAX_PER_RUN,
  SEARCH_STOP_UNITS,
  candidateFromMeta,
  flatKeywords,
  inPickWindow,
  keywordAt,
  runPick,
  type CandidateRow,
  type DraftInsert,
  type DraftKey,
  type PickStore,
} from "../src/lib/outreach/pick";
import {
  BIZ_A_ANCHORED,
  BIZ_B_ANCHORED,
  BIZ_B_BARE,
  Exclusions,
  cleanTitle,
  countryProblem,
  emailProblem,
  evaluateVideos,
  findSite,
  keywordHit,
  maskEmail,
  nameProblem,
  parseIsoDuration,
  relevanceProblem,
  scoreBusiness,
  shortName,
  splitEmails,
  subsProblem,
} from "../src/lib/outreach/pick-rules";
import type { YtFetch } from "../src/lib/outreach/youtube";

// 2026-11-07(토) 10:00 KST = 01:00 UTC
const NOW = new Date("2026-11-07T01:00:00Z");
const TODAY = "2026-11-07";
const KEY = "yt-secret-key-abcdefghijklmnop";
const CONTRACT_COLS = ["batch_date", "channel_id", "channel_name", "channel_url", "subscribers", "niche", "top_title", "top_url", "email"].sort();

// ───────── 순수 규칙 ─────────

describe("제외 규칙(pick.py)", () => {
  const cases: [string, boolean][] = [
    ["ok@naver.com", false],
    ["Ok.Name+tag@Gmail.com", false],
    ["prof@snu.ac.kr", true],
    ["x@seoul.go.kr", true],
    ["x@kcf.or.kr", true],
    ["x@army.mil.kr", true],
    ["logo@2x.png", true],
    ["no-at-sign", true],
    ["a..b@naver.com", true],
    ["a@b", true],
    ["", true],
  ];
  for (const [email, bad] of cases) {
    test(`이메일 ${email || "(빈 값)"} → ${bad ? "뺌" : "통과"}`, () => {
      expect(Boolean(emailProblem(email))).toBe(bad);
    });
  }

  test("채널 이름 제외 단어 11개", () => {
    for (const w of ["대학교", "대학원", "학교", "교육청", "공단", "시청", "구청", "군청", "도청", "정부", "국회"]) {
      expect(nameProblem(`서울${w} 채널`)).not.toBe("");
    }
    expect(nameProblem("김세무사 절세TV")).toBe("");
  });

  test("「대학」「공사」 단순 포함은 빼지 않는다(11/7 고침)", () => {
    expect(nameProblem("더나은대학입시LAB")).toBe("");
    expect(nameProblem("인테리어 공사 이야기")).toBe("");
  });

  test("구독자 1천~10만, 비공개 뺌, 국가는 KR·빈 값만", () => {
    expect(subsProblem(999)).not.toBe("");
    expect(subsProblem(1000)).toBe("");
    expect(subsProblem(100000)).toBe("");
    expect(subsProblem(100001)).not.toBe("");
    expect(subsProblem(5000, true)).not.toBe("");
    expect(countryProblem("US")).not.toBe("");
    expect(countryProblem("KR")).toBe("");
    expect(countryProblem("")).toBe(""); // 미기재는 죽이지 않는다
  });

  test("이메일 가리기·나누기", () => {
    expect(maskEmail("abcdef@naver.com")).toBe("abc***");
    expect(splitEmails("RemoteNo@daum.net / other@gmail.com, x@y.com")).toEqual(["remoteno@daum.net", "other@gmail.com", "x@y.com"]);
  });

  test("빼기 명단: 채널ID·주소·이름(짧게 다듬은 이름 포함)", () => {
    const ex = new Exclusions();
    ex.addDraft({ email: "Had@X.com", channel_id: "UCold", channel_name: "셀파전산회계" });
    expect(ex.reason("UCold", "아무거나", [])).toContain("채널");
    expect(ex.reason("UCnew", "아무거나", ["had@x.com"])).toContain("주소");
    expect(ex.reason("UCnew", "셀파전산회계 | 구. 셀파컴퓨터회계학원", ["n@x.com"])).toContain("이름");
    expect(ex.reason("UCnew", "다른 채널", ["n@x.com"])).toBe("");
  });
});

describe("이름 다듬기(make_drafts.py + pick.py 영문 보호)", () => {
  test("short_name 사례", () => {
    expect(shortName("Jay Choi | 인디해커 라이프")).toBe("Jay Choi");
    expect(shortName("셀파전산회계 | 구. 셀파컴퓨터회계학원")).toBe("셀파전산회계");
    expect(shortName("돈재이 DONJAY")).toBe("돈재이");
    expect(shortName("소울시커 Soul Seeker")).toBe("소울시커");
    expect(shortName("김변호사 법률상담 | Law")).toBe("김변호사 법률상담");
    expect(shortName("시니어스마트폰 (든든한아들)")).toBe("시니어스마트폰");
  });

  test("clean_title 사례", () => {
    expect(cleanTitle("롱폼 강의 | 세무 |절세 |양도세")).toBe("롱폼 강의");
    expect(cleanTitle("1억 벌어도 양도세, 아는 사람은 안 냅니다 (해외주식 절세 4가지) |해외주식 |양도소득세")).toBe(
      "1억 벌어도 양도세, 아는 사람은 안 냅니다 (해외주식 절세 4가지)",
    );
    expect(cleanTitle("제목 #쇼츠 #태그")).toBe("제목");
    const long = "가나다라 ".repeat(15).trim();
    const out = cleanTitle(long);
    expect(out.endsWith("…")).toBe(true);
    expect(Array.from(out).length).toBeLessThanOrEqual(47);
  });
});

describe("본업 점수(select.py)", () => {
  test("직함뿐이면 낮게, 연락처가 있으면 높게", () => {
    expect(scoreBusiness("백세건강연구소", "시니어 건강 정보를 정리해 드립니다. 증상이 있으면 의료 전문가와 상담하세요.").score).toBe(BIZ_B_BARE);
    expect(scoreBusiness("실전 경매 연구소", "실전 경매 분석을 제공합니다. 문의 :010-5292-5461").score).toBe(BIZ_B_ANCHORED);
    expect(scoreBusiness("김변호사 법률상담", "법률사무소 대표 변호사입니다. 02-123-4567").score).toBe(BIZ_A_ANCHORED);
    expect(scoreBusiness("경제의세계", "복잡한 경제, 쉽고 재미있게 풀어드립니다.").score).toBe(0);
  });

  test("한국어 부분문자열 오탐을 막는다", () => {
    expect(keywordHit("수면과 뇌 건강의 객관적인 관계", "강의")).toBe(false);
    expect(keywordHit("유료 강의가 아니라", "강의")).toBe(true);
    expect(keywordHit("대학원 수업 자료입니다", "학원")).toBe(false);
    expect(keywordHit("대치동 입시학원", "학원")).toBe(true);
  });

  test("홈페이지는 스킴이 없어도 연락처로 친다", () => {
    expect(findSite("자료는 ekkorean.com에서 확인하세요")).toBe("ekkorean.com");
    expect(findSite("MomFlix.co.kr 입니다")).toBe("momflix.co.kr");
    expect(findSite("문의 syook123@daum.net")).toBe("");
    expect(findSite("https://www.youtube.com/@abc")).toBe("");
  });
});

describe("관련성·영상 판정(screener.py)", () => {
  test("선언 국가가 최우선, 미기재면 문자 비율, 드라마는 뺌", () => {
    expect(relevanceProblem({ title: "Some channel", country: "US" })).toContain("US");
    expect(relevanceProblem({ title: "KBS Docu", description: "english only description here", country: "KR" })).toBe("");
    expect(relevanceProblem({ title: "短剧 drama", description: "精彩短剧", country: "" })).not.toBe("");
    expect(relevanceProblem({ title: "세무 이야기", description: "hello english", country: "" })).toBe("");
    expect(relevanceProblem({ title: "막장 드라마 몰아보기", country: "KR" })).toContain("드라마");
  });

  test("ISO 기간", () => {
    expect(parseIsoDuration("PT1H2M10S")).toBe(3730);
    expect(parseIsoDuration("PT40S")).toBe(40);
    expect(parseIsoDuration("P0D")).toBe(0);
    expect(parseIsoDuration("이상")).toBe(-1);
  });

  test("최근 90일 쇼츠 3개↑·롱폼 0 은 뺀다, 180~240초는 안 센다", () => {
    const v = (id: string, sec: number, daysAgo: number, views = 1) => ({
      id,
      title: id,
      publishedAt: new Date(NOW.getTime() - daysAgo * 86400000).toISOString(),
      durationSec: sec,
      views,
    });
    expect(evaluateVideos([v("a", 1200, 5), v("s1", 40, 1), v("s2", 40, 1)], NOW).ok).toBe(true);
    const three = evaluateVideos([v("a", 1200, 5), v("s1", 40, 1), v("s2", 40, 1), v("s3", 40, 1)], NOW);
    expect(three.ok).toBe(false);
    if (!three.ok) expect(three.reason).toBe("최근 90일 쇼츠 3개");
    const idle = evaluateVideos([v("old", 1200, 200)], NOW);
    expect(idle.ok).toBe(false);
    if (!idle.ok) expect(idle.reason).toContain("롱폼 0");
    const gray = evaluateVideos([v("a", 1200, 5), v("g1", 200, 1), v("g2", 200, 1), v("g3", 200, 1)], NOW);
    expect(gray.ok).toBe(true);
    const top = evaluateVideos([v("a", 1200, 5, 10), v("b", 1300, 5, 99)], NOW);
    expect(top.ok && top.topUrl).toBe("https://www.youtube.com/watch?v=b");
  });
});

describe("시간 창·니치 순환", () => {
  test("한국 시간 05:00 이상 19:30 미만", () => {
    expect(inPickWindow(new Date("2026-11-06T19:59:00Z"))).toBe(false); // 04:59 KST
    expect(inPickWindow(new Date("2026-11-06T20:00:00Z"))).toBe(true); // 05:00
    expect(inPickWindow(new Date("2026-11-07T10:29:00Z"))).toBe(true); // 19:29
    expect(inPickWindow(new Date("2026-11-07T10:30:00Z"))).toBe(false); // 19:30
    expect(inPickWindow(new Date("2026-11-07T15:00:00Z"))).toBe(false); // 자정
  });

  test("키워드는 니치를 번갈아 돌고, 한 바퀴 돌면 처음으로", () => {
    const flat = flatKeywords(NICHES);
    expect(flat.length).toBe(NICHES.reduce((a, n) => a + n.keywords.length, 0));
    expect(new Set(flat.map((f) => `${f.niche}|${f.keyword}`)).size).toBe(flat.length);
    for (let i = 0; i + 1 < NICHES.length; i++) expect(flat[i].niche).not.toBe(flat[i + 1].niche);
    expect(keywordAt(NICHES, 0)).toEqual(flat[0]);
    expect(keywordAt(NICHES, flat.length)).toEqual(flat[0]);
    expect(keywordAt(NICHES, flat.length + 3)).toEqual(flat[3]);
    expect(keywordAt([], 0)).toBeNull();
  });
});

// ───────── 가짜 유튜브 ─────────

type Vid = [sec: number, daysAgo: number, title: string];
type ChanSpec = { title: string; desc?: string; subs?: number; country?: string; hidden?: boolean; handle?: string; videos?: Vid[] };

const LONG: Vid = [1200, 10, "롱폼 강의 | 세무 |절세 |양도세"];
const SHORT: Vid = [40, 5, "쇼츠"];

function fakeYouTube(
  channels: Record<string, ChanSpec>,
  opts: { search?: string[]; status?: number; reason?: string } = {},
) {
  const calls: string[] = [];
  const urls: string[] = [];
  const fetchFn: YtFetch = async (url) => {
    urls.push(url);
    const u = new URL(url);
    const ep = u.pathname.split("/").pop() as string;
    calls.push(ep);
    const p = u.searchParams;
    const ok = (body: unknown) => ({ status: 200, json: async () => body });
    if (opts.status) {
      return { status: opts.status, json: async () => ({ error: { errors: [{ reason: opts.reason ?? "backendError" }], message: `bad ${p.get("key")}` } }) };
    }
    if (ep === "search") {
      return ok({ items: (opts.search ?? []).map((cid) => ({ snippet: { channelId: cid } })) });
    }
    if (ep === "channels") {
      const items = (p.get("id") ?? "").split(",").flatMap((cid) => {
        const c = channels[cid];
        if (!c) return [];
        return [
          {
            id: cid,
            snippet: { title: c.title, description: c.desc ?? "", customUrl: c.handle ?? "", country: c.country ?? "KR" },
            statistics: { subscriberCount: String(c.subs ?? 5000), videoCount: "100", hiddenSubscriberCount: c.hidden ?? false },
            contentDetails: { relatedPlaylists: { uploads: "UU" + cid } },
          },
        ];
      });
      return ok({ items });
    }
    if (ep === "playlistItems") {
      const cid = (p.get("playlistId") ?? "").slice(2);
      const vids = channels[cid]?.videos ?? [];
      return ok({ items: vids.map((_, i) => ({ contentDetails: { videoId: `${cid}_${i}` } })) });
    }
    if (ep === "videos") {
      const items = (p.get("id") ?? "").split(",").map((vid) => {
        const at = vid.lastIndexOf("_");
        const cid = vid.slice(0, at);
        const i = Number(vid.slice(at + 1));
        const [sec, ago, title] = channels[cid].videos![i];
        return {
          id: vid,
          snippet: { title, publishedAt: new Date(NOW.getTime() - ago * 86400000).toISOString().replace(/\.\d{3}Z$/, "Z") },
          contentDetails: { duration: `PT${sec}S` },
          statistics: { viewCount: String(1000 - i) },
        };
      });
      return ok({ items });
    }
    throw new Error(`모르는 끝점 ${ep}`);
  };
  return { fetchFn, calls, urls };
}

// ───────── 가짜 DB ─────────

type Draft = DraftInsert & { status: string };

function fakeStore(init: {
  pool?: CandidateRow[];
  drafts?: Partial<Draft>[];
  suppression?: string[];
  autoPick?: boolean | Error;
  cursor?: number;
  quota?: number;
  addDraftsSkip?: string[];
}) {
  const cands = new Map<string, CandidateRow>((init.pool ?? []).map((c) => [c.channel_id, { ...c }]));
  const drafts: Partial<Draft>[] = [...(init.drafts ?? [])];
  const quota = new Map<string, number>([[TODAY, init.quota ?? 0]]);
  const state = { cursor: init.cursor ?? 0, calls: [] as string[], inserted: [] as DraftInsert[][], upserts: [] as CandidateRow[][] };
  const store: PickStore = {
    async getPickSettings() {
      state.calls.push("settings");
      if (init.autoPick instanceof Error) throw init.autoPick;
      return { autoPick: init.autoPick ?? true, cursor: state.cursor };
    },
    async countDraftsForDate(date) {
      state.calls.push("count");
      return drafts.filter((d) => d.batch_date === date).length;
    },
    async getQuotaUnits(day) {
      state.calls.push("quota");
      return quota.get(day) ?? 0;
    },
    async addQuotaUnits(day, units) {
      state.calls.push("quota_add");
      quota.set(day, (quota.get(day) ?? 0) + units);
      return quota.get(day)!;
    },
    async poolNew(limit) {
      state.calls.push("pool");
      return [...cands.values()]
        .filter((c) => c.status === "new" && c.email)
        .sort(
          (a, b) =>
            b.business_score - a.business_score ||
            (b.subscribers ?? -1) - (a.subscribers ?? -1) ||
            (a.channel_name < b.channel_name ? -1 : 1),
        )
        .slice(0, limit)
        .map((c) => ({ ...c }));
    },
    async draftKeysPage(offset, limit) {
      state.calls.push("drafts_page");
      return drafts.slice(offset, offset + limit).map((d) => ({ email: d.email ?? null, channel_id: d.channel_id ?? null, channel_name: d.channel_name ?? null }) as DraftKey);
    },
    async suppressionPage(offset, limit) {
      state.calls.push("suppression_page");
      return (init.suppression ?? []).slice(offset, offset + limit);
    },
    async addDrafts(rows) {
      state.calls.push("add_drafts");
      state.inserted.push(rows);
      const out: string[] = [];
      for (const r of rows) {
        if (init.addDraftsSkip?.includes(r.channel_id)) continue;
        if (drafts.some((d) => d.email === r.email.toLowerCase() || d.channel_id === r.channel_id)) continue;
        drafts.push({ ...r, email: r.email.toLowerCase(), status: "ready" });
        out.push(r.channel_id);
      }
      return out;
    },
    async upsertCandidates(rows) {
      state.calls.push("upsert_candidates");
      state.upserts.push(rows);
      for (const r of rows) cands.set(r.channel_id, { ...r });
    },
    async insertCandidates(rows) {
      state.calls.push("insert_candidates");
      let n = 0;
      for (const r of rows) {
        if (cands.has(r.channel_id)) continue;
        cands.set(r.channel_id, { ...r });
        n++;
      }
      return n;
    },
    async setCursor(n) {
      state.calls.push("cursor");
      state.cursor = n;
    },
  };
  return { store, state, cands, drafts, quota };
}

function cand(id: string, title: string, email: string | null, over: Partial<CandidateRow> = {}): CandidateRow {
  return {
    channel_id: id,
    channel_name: title,
    channel_url: `https://www.youtube.com/channel/${id}`,
    subscribers: 5000,
    country: null,
    niche: "세무·회계",
    top_title: "옛 제목",
    top_url: "https://youtu.be/old",
    email,
    description_summary: null,
    business_score: 0,
    status: "new",
    reject_reason: null,
    checked_at: null,
    ...over,
  };
}

// 원본 pick 시험(test_pick_end_to_end)과 같은 채널들
function channels(): Record<string, ChanSpec> {
  return {
    UCbiz: { title: "김변호사 법률상담 | Law", desc: "법률사무소 대표 변호사입니다. 02-123-4567", subs: 3000, videos: [LONG, LONG] },
    UCbig: { title: "그냥 정보채널", subs: 90000, videos: [LONG] },
    UCmid: { title: "중간 정보채널", subs: 20000, videos: [LONG] },
    UCshorts: { title: "쇼츠많은채널", subs: 50000, videos: [LONG, SHORT, SHORT, SHORT] },
    UCtwo: { title: "쇼츠둘채널", subs: 40000, videos: [LONG, SHORT, SHORT] },
    UCidle: { title: "쉬는채널", subs: 30000, videos: [[1200, 200, "옛날"]] },
    UCus: { title: "US channel", subs: 30000, country: "US", videos: [LONG] },
    UCnocountry: { title: "국가없음", desc: "hello english only description", subs: 10000, country: "", videos: [LONG] },
    UCtiny: { title: "작은채널", subs: 500, videos: [LONG] },
    UChuge: { title: "큰채널", subs: 200000, videos: [LONG] },
    UCuniv: { title: "한국대학교 홍보", subs: 5000, videos: [LONG] },
    UCsent: { title: "다른이름", subs: 5000, videos: [LONG] },
    UCsupp: { title: "거부채널", subs: 5000, videos: [LONG] },
    UCdraft: { title: "초안채널", subs: 5000, videos: [LONG] },
    UCold: { title: "옛초안채널", subs: 5000, videos: [LONG] },
    UCac: { title: "연구실", subs: 5000, videos: [LONG] },
  };
}

function pool(): CandidateRow[] {
  return [
    cand("UCbiz", "김변호사 법률상담 | Law", "biz@naver.com"),
    cand("UCbig", "그냥 정보채널", "big@gmail.com"),
    cand("UCmid", "중간 정보채널", "mid@gmail.com"),
    cand("UCshorts", "쇼츠많은채널", "shorts@gmail.com"),
    cand("UCtwo", "쇼츠둘채널", "two@gmail.com"),
    cand("UCidle", "쉬는채널", "idle@gmail.com"),
    cand("UCus", "US channel", "us@gmail.com"),
    cand("UCnocountry", "국가없음", "nc@gmail.com"),
    cand("UCtiny", "작은채널", "tiny@gmail.com"),
    cand("UChuge", "큰채널", "huge@gmail.com"),
    cand("UCuniv", "한국대학교 홍보", "univ@gmail.com"),
    cand("UCsent", "다른이름", "sent@naver.com"),
    cand("UCsupp", "거부채널", "remoteno@daum.net"),
    cand("UCdraft", "초안채널", "had@x.com"),
    cand("UCold", "옛초안채널", "fresh@x.com"),
    cand("UCac", "연구실", "prof@snu.ac.kr"),
  ];
}

const OLD_DRAFTS: Partial<Draft>[] = [
  { batch_date: "2026-08-11", email: "sent@naver.com", channel_id: "UCsentold", channel_name: "보낸채널", status: "sent" },
  { batch_date: "2026-11-06", email: "had@x.com", channel_id: "UCzz", channel_name: "어제채널", status: "ready" },
  { batch_date: "2026-11-05", email: "zz@x.com", channel_id: "UCold", channel_name: "그제채널", status: "sent" },
];

const quiet = () => {};

// ───────── 전체 흐름 ─────────

describe("runPick 전체 흐름", () => {
  test("본업이 맨 앞, 그다음 구독자 순 — 제외 규칙 전부 + insert 계약", async () => {
    const f = fakeStore({ pool: pool(), drafts: OLD_DRAFTS, suppression: ["remoteno@daum.net"] });
    const yt = fakeYouTube(channels());
    const logs: string[] = [];
    const r = await runPick({ store: f.store, youtubeKey: KEY, fetchFn: yt.fetchFn, now: () => NOW, log: (m) => logs.push(m) });

    expect(r.reason).toBe("picked");
    expect(r.inserted).toBe(5);
    const rows = f.state.inserted[0];
    expect(rows.map((x) => x.channel_id)).toEqual(["UCbiz", "UCbig", "UCtwo", "UCmid", "UCnocountry"]);
    // insert 본문 = 계약 열 그대로
    const first = rows[0];
    expect(Object.keys(first).sort()).toEqual(CONTRACT_COLS);
    expect(first.batch_date).toBe(TODAY);
    expect(first.email).toBe("biz@naver.com");
    expect(first.channel_name).toBe("김변호사 법률상담"); // short_name
    expect(first.top_title).toBe("롱폼 강의"); // clean_title + 새로 받은 제목
    expect(first.top_url?.startsWith("https://www.youtube.com/watch?v=UCbiz_")).toBe(true);
    expect(Number.isInteger(first.subscribers)).toBe(true);

    // 후보 상태: 고른 5곳 drafted, 나머지 rejected + 사유
    const st = (id: string) => f.cands.get(id)!;
    for (const id of ["UCbiz", "UCbig", "UCtwo", "UCmid", "UCnocountry"]) expect(st(id).status).toBe("drafted");
    const reasons: Record<string, string> = {};
    for (const id of ["UCshorts", "UCidle", "UCus", "UCtiny", "UChuge", "UCuniv", "UCsent", "UCsupp", "UCdraft", "UCold", "UCac"]) {
      expect(st(id).status).toBe("rejected");
      reasons[id] = st(id).reject_reason ?? "";
      expect(st(id).checked_at).toBe(NOW.toISOString());
    }
    expect(reasons.UCshorts).toContain("쇼츠 3개");
    expect(reasons.UCidle).toContain("롱폼 0");
    expect(reasons.UCus).toContain("country=US");
    expect(reasons.UCtiny).toContain("구독자");
    expect(reasons.UChuge).toContain("구독자");
    expect(reasons.UCuniv).toContain("대학교");
    expect(reasons.UCac).toContain("기관 도메인");
    expect(reasons.UCold).toContain("채널");
    expect(reasons.UCsupp).toContain("주소");

    // 호출 수·쿼터: 이 실행 50 미만, 유튜브 단위는 그대로 기록
    expect(r.calls).toBeLessThan(50);
    expect(r.calls).toBeLessThanOrEqual(MAX_CALLS_PER_RUN);
    expect(r.calls).toBe(f.state.calls.length + yt.calls.length);
    expect(r.units).toBe(yt.calls.length); // 검색이 없으면 모두 1단위
    expect(f.quota.get(TODAY)).toBe(r.units);
    // 로그에 이메일 전체가 없다
    expect(logs.join("\n")).not.toContain("biz@naver.com");
    expect(logs.join("\n")).toContain("biz***");
  });

  test("오늘 모자란 수만큼만 확인한다(이미 8곳 → 2곳)", async () => {
    const today8 = Array.from({ length: 8 }, (_, i) => ({ batch_date: TODAY, email: `t${i}@x.com`, channel_id: `UCt${i}`, channel_name: `t${i}`, status: "ready" }));
    const f = fakeStore({ pool: pool(), drafts: today8 });
    const yt = fakeYouTube(channels());
    const r = await runPick({ store: f.store, youtubeKey: KEY, fetchFn: yt.fetchFn, now: () => NOW, log: quiet });
    expect(r.before).toBe(8);
    expect(r.inserted).toBe(2);
    expect(f.state.inserted[0].map((x) => x.channel_id)).toEqual(["UCbiz", "UCbig"]);
    // 확인하지 않은 채널은 new 그대로(다음 날 다시 본다)
    expect(f.cands.get("UCmid")!.status).toBe("new");
  });

  test("하루 10곳 차면 그날은 더 안 한다(유튜브 0회)", async () => {
    const today10 = Array.from({ length: PER_DAY }, (_, i) => ({ batch_date: TODAY, email: `t${i}@x.com`, channel_id: `UCt${i}`, channel_name: `t${i}`, status: "sent" }));
    const f = fakeStore({ pool: pool(), drafts: today10 });
    const yt = fakeYouTube(channels());
    const r = await runPick({ store: f.store, youtubeKey: KEY, fetchFn: yt.fetchFn, now: () => NOW, log: quiet });
    expect(r.reason).toBe("day_full");
    expect(yt.calls.length).toBe(0);
    expect(f.state.inserted.length).toBe(0);
  });

  test("지난 날 묶음은 오늘 개수에 안 친다(몰아 채우지 않고 오늘만)", async () => {
    const yesterday10 = Array.from({ length: 10 }, (_, i) => ({ batch_date: "2026-11-06", email: `y${i}@x.com`, channel_id: `UCy${i}`, channel_name: `y${i}`, status: "ready" }));
    const f = fakeStore({ pool: pool(), drafts: yesterday10 });
    const r = await runPick({ store: f.store, youtubeKey: KEY, fetchFn: fakeYouTube(channels()).fetchFn, now: () => NOW, log: quiet });
    expect(r.before).toBe(0);
    expect(f.state.inserted[0].every((x) => x.batch_date === TODAY)).toBe(true);
  });

  test("시간 창 밖이면 아무 호출도 없다", async () => {
    const f = fakeStore({ pool: pool() });
    const yt = fakeYouTube(channels());
    const r = await runPick({ store: f.store, youtubeKey: KEY, fetchFn: yt.fetchFn, now: () => new Date("2026-11-07T11:00:00Z"), log: quiet });
    expect(r.reason).toBe("outside_window");
    expect(f.state.calls.length + yt.calls.length).toBe(0);
  });

  test("스위치가 꺼지면 고르지 않는다", async () => {
    const f = fakeStore({ pool: pool(), autoPick: false });
    const yt = fakeYouTube(channels());
    const r = await runPick({ store: f.store, youtubeKey: KEY, fetchFn: yt.fetchFn, now: () => NOW, log: quiet });
    expect(r.reason).toBe("auto_off");
    expect(f.state.calls).toEqual(["settings"]);
    expect(yt.calls.length).toBe(0);
  });

  test("설정을 못 읽으면 고르지 않는다 / 키가 없으면 고르지 않는다", async () => {
    const f1 = fakeStore({ pool: pool(), autoPick: new Error("relation does not exist") });
    expect((await runPick({ store: f1.store, youtubeKey: KEY, fetchFn: fakeYouTube({}).fetchFn, now: () => NOW, log: quiet })).reason).toBe("settings_error");
    const f2 = fakeStore({ pool: pool() });
    const yt = fakeYouTube(channels());
    expect((await runPick({ store: f2.store, youtubeKey: "", fetchFn: yt.fetchFn, now: () => NOW, log: quiet })).reason).toBe("no_api_key");
    expect(yt.calls.length).toBe(0);
  });

  test("초안 넣기에서 충돌로 빠진 줄은 drafted 가 아니라 rejected", async () => {
    const f = fakeStore({ pool: pool(), addDraftsSkip: ["UCbig"] });
    const r = await runPick({ store: f.store, youtubeKey: KEY, fetchFn: fakeYouTube(channels()).fetchFn, now: () => NOW, log: quiet });
    expect(r.inserted).toBe(f.state.inserted[0].length - 1);
    expect(f.cands.get("UCbig")!.status).toBe("rejected");
    expect(f.cands.get("UCbig")!.reject_reason).toContain("이미 초안");
    expect(f.cands.get("UCbiz")!.status).toBe("drafted");
  });

  test("유튜브 오류 글에 API 키가 없다", async () => {
    const f = fakeStore({ pool: pool() });
    const yt = fakeYouTube(channels(), { status: 500 });
    const logs: string[] = [];
    const r = await runPick({ store: f.store, youtubeKey: KEY, fetchFn: yt.fetchFn, now: () => NOW, log: (m) => logs.push(m) });
    expect(r.reason).toBe("error");
    expect(r.error ?? "").not.toContain(KEY);
    expect(logs.join("\n")).not.toContain(KEY);
    expect(yt.urls[0]).toContain(`key=${KEY}`); // 키는 요청 주소에만
  });
});

describe("호출 예산(실행 하나 50 미만)", () => {
  function manyGood(n: number, videos: Vid[]) {
    const chans: Record<string, ChanSpec> = {};
    const p: CandidateRow[] = [];
    for (let i = 0; i < n; i++) {
      const id = `UCg${String(i).padStart(2, "0")}`;
      chans[id] = { title: `채널${i}`, subs: 5000 + i, videos };
      p.push(cand(id, `채널${i}`, `g${i}@x.com`, { subscribers: 5000 + i }));
    }
    return { chans, p };
  }

  test("좋은 후보가 많으면 10곳 채우고 멈춘다", async () => {
    const { chans, p } = manyGood(40, [LONG]);
    const f = fakeStore({ pool: p });
    const yt = fakeYouTube(chans);
    const r = await runPick({ store: f.store, youtubeKey: KEY, fetchFn: yt.fetchFn, now: () => NOW, log: quiet });
    expect(r.inserted).toBe(PER_DAY);
    expect(r.calls).toBeLessThanOrEqual(MAX_CALLS_PER_RUN);
    expect(yt.calls.filter((c) => c === "playlistItems").length).toBe(PER_DAY);
  });

  test("전부 탈락하는 최악 + 명단 3쪽(3,000줄)이어도 45 이하, 끝내기 3개는 늘 한다", async () => {
    const { chans, p } = manyGood(40, [LONG, SHORT, SHORT, SHORT]);
    const big = Array.from({ length: 3000 }, (_, i) => ({ batch_date: "2026-10-01", email: `old${i}@x.com`, channel_id: `UCo${i}`, channel_name: `옛${i}`, status: "sent" }));
    const supp = Array.from({ length: 1500 }, (_, i) => `s${i}@x.com`);
    const f = fakeStore({ pool: p, drafts: big, suppression: supp });
    const yt = fakeYouTube(chans);
    const r = await runPick({ store: f.store, youtubeKey: KEY, fetchFn: yt.fetchFn, now: () => NOW, log: quiet });
    expect(r.inserted).toBe(0);
    expect(r.calls).toBeLessThanOrEqual(MAX_CALLS_PER_RUN);
    expect(r.calls).toBeLessThan(50);
    expect(f.state.calls.filter((c) => c === "drafts_page").length).toBe(3);
    expect(f.state.calls.filter((c) => c === "suppression_page").length).toBe(2);
    const checked = yt.calls.filter((c) => c === "playlistItems").length;
    expect(checked).toBeGreaterThan(0);
    expect(checked).toBeLessThanOrEqual(RECHECK_MAX_PER_RUN);
    expect(f.state.calls.at(-1)).toBe("quota_add");
    expect(f.state.calls).toContain("upsert_candidates");
    // 확인한 만큼만 rejected, 나머지는 new 그대로
    const rejected = [...f.cands.values()].filter((c) => c.status === "rejected").length;
    expect(rejected).toBe(checked);
  });

  test("명단이 없을 때(1쪽)는 15곳까지 확인한다", async () => {
    const { chans, p } = manyGood(40, [LONG, SHORT, SHORT, SHORT]);
    const f = fakeStore({ pool: p });
    const yt = fakeYouTube(chans);
    const r = await runPick({ store: f.store, youtubeKey: KEY, fetchFn: yt.fetchFn, now: () => NOW, log: quiet });
    expect(yt.calls.filter((c) => c === "playlistItems").length).toBe(RECHECK_MAX_PER_RUN);
    expect(r.calls).toBeLessThanOrEqual(MAX_CALLS_PER_RUN);
  });
});

describe("검색 단계·쿼터", () => {
  const searchChans: Record<string, ChanSpec> = {
    UCs1: { title: "이세무사 절세TV", desc: "세무사 사무소입니다. 문의 tax@semu.co.kr", subs: 8000, videos: [LONG] },
    UCs2: { title: "이메일없는 채널", desc: "그냥 정보", subs: 8000, videos: [LONG] },
    UCs3: { title: "Foreign", desc: "", subs: 8000, country: "US", videos: [LONG] },
    UCs4: { title: "막장 드라마 몰아보기", desc: "contact drama@x.com", subs: 8000, videos: [LONG] },
    UCs5: { title: "큰 채널", desc: "big@x.com", subs: 500000, videos: [LONG] },
    UCs6: { title: "학원 원장", desc: "logo@2x.png 문의 hakwon@naver.com", subs: 3000, videos: [LONG] },
  };

  test("풀이 비면 니치 키워드 하나로 검색해 풀에 넣고, 같은 실행에서 바로 확인까지", async () => {
    const f = fakeStore({ pool: [], cursor: 2 });
    const yt = fakeYouTube(searchChans, { search: ["UCs1", "UCs2", "UCs3", "UCs4", "UCs5", "UCs6", "UCgone"] });
    const r = await runPick({ store: f.store, youtubeKey: KEY, fetchFn: yt.fetchFn, now: () => NOW, log: quiet });
    const kw = keywordAt(NICHES, 2)!;
    expect(r.search?.keyword).toBe(kw.keyword);
    expect(r.search?.niche).toBe(kw.niche);
    expect(yt.calls.filter((c) => c === "search").length).toBe(1);
    expect(new URL(yt.urls[0]).searchParams.get("q")).toBe(kw.keyword);
    expect(f.state.cursor).toBe(3);
    expect(f.cands.get("UCs1")!.email).toBe("tax@semu.co.kr");
    expect(f.cands.get("UCs2")!.email).toBeNull(); // 이메일 없는 채널도 넣되 고르기 대상 아님
    expect(f.cands.get("UCs2")!.status).toBe("new");
    expect(f.cands.get("UCs3")!.status).toBe("rejected");
    expect(f.cands.get("UCs4")!.status).toBe("rejected");
    expect(f.cands.get("UCs5")!.status).toBe("rejected");
    expect(f.cands.get("UCs6")!.email).toBe("hakwon@naver.com"); // 이미지 파일명은 건너뜀
    expect(f.cands.get("UCgone")).toBeUndefined();
    expect(f.cands.get("UCs1")!.niche).toBe(kw.niche); // niche 는 참고로만
    // 같은 실행에서 확인 → 본업 점수 높은 학원·세무사 순
    expect(r.reason).toBe("picked");
    expect(f.state.inserted[0].map((x) => x.channel_id).sort()).toEqual(["UCs1", "UCs6"]);
    expect(r.units).toBe(100 + 1 + 1 + 2 * 2);
    expect(f.quota.get(TODAY)).toBe(r.units);
    expect(r.calls).toBeLessThanOrEqual(MAX_CALLS_PER_RUN);
  });

  test("다음 실행은 다음 키워드(니치 순환)", async () => {
    const f = fakeStore({ pool: [], cursor: 0 });
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const yt = fakeYouTube({}, { search: [] });
      const r = await runPick({ store: f.store, youtubeKey: KEY, fetchFn: yt.fetchFn, now: () => NOW, log: quiet });
      seen.push(r.search!.niche);
    }
    expect(f.state.cursor).toBe(3);
    expect(new Set(seen).size).toBe(3);
  });

  test(`하루 ${QUOTA_DAILY} 근처면 검색을 멈춘다(재확인 몫 남김)`, async () => {
    const f = fakeStore({ pool: [], quota: SEARCH_STOP_UNITS - 100 });
    const yt = fakeYouTube({}, { search: [] });
    const r = await runPick({ store: f.store, youtubeKey: KEY, fetchFn: yt.fetchFn, now: () => NOW, log: quiet });
    expect(r.reason).toBe("search_quota_stop");
    expect(yt.calls.length).toBe(0);

    const f2 = fakeStore({ pool: [], quota: SEARCH_STOP_UNITS - 101 });
    const yt2 = fakeYouTube({}, { search: [] });
    const r2 = await runPick({ store: f2.store, youtubeKey: KEY, fetchFn: yt2.fetchFn, now: () => NOW, log: quiet });
    expect(r2.reason).toBe("searched");
    expect(yt2.calls).toEqual(["search"]);
  });

  test("재확인도 하루 상한을 넘지 않는다", async () => {
    const f = fakeStore({ pool: pool(), quota: QUOTA_DAILY - 2 });
    const yt = fakeYouTube(channels());
    const r = await runPick({ store: f.store, youtubeKey: KEY, fetchFn: yt.fetchFn, now: () => NOW, log: quiet });
    expect(yt.calls).toEqual(["channels"]); // 1단위만 쓰고 영상 확인(2단위)은 못 함
    expect(r.inserted).toBe(0);
    expect(f.quota.get(TODAY)).toBeLessThanOrEqual(QUOTA_DAILY);
    expect(f.cands.get("UCbiz")!.status).toBe("new");
  });

  test("구글이 쿼터 초과를 돌려주면 오늘 몫을 다 쓴 것으로 적고 다음 키워드로", async () => {
    const f = fakeStore({ pool: [], quota: 500, cursor: 7 });
    const yt = fakeYouTube({}, { status: 403, reason: "quotaExceeded" });
    const r = await runPick({ store: f.store, youtubeKey: KEY, fetchFn: yt.fetchFn, now: () => NOW, log: quiet });
    expect(r.reason).toBe("error");
    expect(f.quota.get(TODAY)).toBe(QUOTA_DAILY);
    expect(f.state.cursor).toBe(8);
  });

  test("검색 결과 한 줄 만들기(candidateFromMeta)", () => {
    const row = candidateFromMeta(
      { id: "UCx", title: "김원장 치과", description: "치과 진료 예약 02-123-4567 / Doc@Clinic.kr", customUrl: "@kimdent", country: "", hiddenSubs: false, subscribers: 4000, uploadsPlaylist: "UUx" },
      "병원·의료",
    );
    expect(row.status).toBe("new");
    expect(row.email).toBe("doc@clinic.kr");
    expect(row.business_score).toBe(BIZ_A_ANCHORED);
    expect(row.channel_url).toBe("https://www.youtube.com/@kimdent");
    expect(row.country).toBeNull();
  });
});
