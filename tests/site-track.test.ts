// 방문 기록 — 로봇 거르기·유입 경로 판별·기기·입력 검사·Cloudflare 응답 읽기 시험. 실행: bun test ./tests
import { describe, expect, test } from "bun:test";
import {
  MAX_TRACK_BODY_BYTES,
  VISIT_SOURCES,
  classifySource,
  deviceOf,
  isBot,
  isUntrackedPath,
  parseTrackBody,
} from "../src/lib/analytics/track";
import { fetchCfDaily, parseCfResponse } from "../src/lib/analytics/cloudflare";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const WIN_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const KAKAOTALK_INAPP = `${ANDROID_CHROME} KAKAOTALK 10.8.1`;
const DAANGN_INAPP = `${IPHONE} DaangnApp/24.40.0`;
const KARROT_INAPP = `${ANDROID_CHROME} karrotmarket/24.40`;
const NAVER_INAPP = `${ANDROID_CHROME} NAVER(inapp; search; 2000; 12.10.3)`;
const INSTA_INAPP = `${IPHONE} Instagram 350.0.0.0 (iPhone15,2; iOS 18_0; ko_KR)`;

describe("로봇 거르기", () => {
  test.each([
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)",
    "Mozilla/5.0 (compatible; Daum/4.1; +http://cs.daum.net/faq/15/4118.html) Daumoa",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 Chrome-Lighthouse",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)",
    "kakaotalk-scrap/1.0; +https://devtalk.kakao.com/",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
    "Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537.36 (Spider)",
    "curl/8.4.0",
    "python-requests/2.31.0",
    "",
    "Mozilla",
  ])("로봇: %s", (ua) => {
    expect(isBot(ua)).toBe(true);
  });

  test.each([IPHONE, ANDROID_CHROME, WIN_CHROME, KAKAOTALK_INAPP, DAANGN_INAPP, NAVER_INAPP, INSTA_INAPP])(
    "사람: %s",
    (ua) => {
      expect(isBot(ua)).toBe(false);
    },
  );

  test("null·undefined 는 로봇", () => {
    expect(isBot(null)).toBe(true);
    expect(isBot(undefined)).toBe(true);
  });
});

describe("기기", () => {
  test("휴대폰·태블릿은 mobile, 윈도 크롬은 desktop", () => {
    expect(deviceOf(IPHONE)).toBe("mobile");
    expect(deviceOf(ANDROID_CHROME)).toBe("mobile");
    expect(deviceOf("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15")).toBe("mobile");
    expect(deviceOf(WIN_CHROME)).toBe("desktop");
    expect(deviceOf(null)).toBe("desktop");
  });
});

describe("유입 경로 판별", () => {
  test("당근: utm_source daangn·karrot·당근", () => {
    expect(classifySource({ utmSource: "daangn", userAgent: WIN_CHROME })).toBe("daangn");
    expect(classifySource({ utmSource: "Karrot", userAgent: WIN_CHROME })).toBe("daangn");
    expect(classifySource({ utmSource: "당근마켓", userAgent: WIN_CHROME })).toBe("daangn");
  });
  test("당근: referrer daangn.com·karrotmarket", () => {
    expect(classifySource({ referrerHost: "www.daangn.com", userAgent: WIN_CHROME })).toBe("daangn");
    expect(classifySource({ referrerHost: "daangn.com", userAgent: WIN_CHROME })).toBe("daangn");
    expect(classifySource({ referrerHost: "link.karrotmarket.com", userAgent: WIN_CHROME })).toBe(
      "daangn",
    );
  });
  test("당근: 당근 앱 안 브라우저(사용자 에이전트)", () => {
    expect(classifySource({ userAgent: DAANGN_INAPP })).toBe("daangn");
    expect(classifySource({ userAgent: KARROT_INAPP })).toBe("daangn");
  });
  test("당근 utm 이 다른 referrer 보다 앞선다", () => {
    expect(
      classifySource({ utmSource: "daangn", referrerHost: "search.naver.com", userAgent: WIN_CHROME }),
    ).toBe("daangn");
  });
  test("referrer 로 네이버·구글·인스타그램·카카오", () => {
    expect(classifySource({ referrerHost: "search.naver.com", userAgent: WIN_CHROME })).toBe("naver");
    expect(classifySource({ referrerHost: "m.blog.naver.com", userAgent: WIN_CHROME })).toBe("naver");
    expect(classifySource({ referrerHost: "naver.me", userAgent: WIN_CHROME })).toBe("naver");
    expect(classifySource({ referrerHost: "www.google.com", userAgent: WIN_CHROME })).toBe("google");
    expect(classifySource({ referrerHost: "www.google.co.kr", userAgent: WIN_CHROME })).toBe("google");
    expect(classifySource({ referrerHost: "l.instagram.com", userAgent: IPHONE })).toBe("instagram");
    expect(classifySource({ referrerHost: "pf.kakao.com", userAgent: IPHONE })).toBe("kakao");
  });
  test("utm_source 이름으로도", () => {
    expect(classifySource({ utmSource: "naver_blog", userAgent: WIN_CHROME })).toBe("naver");
    expect(classifySource({ utmSource: "instagram", userAgent: WIN_CHROME })).toBe("instagram");
    expect(classifySource({ utmSource: "kakao", userAgent: WIN_CHROME })).toBe("kakao");
  });
  test("앱 안 브라우저(referrer 없음)", () => {
    expect(classifySource({ userAgent: NAVER_INAPP })).toBe("naver");
    expect(classifySource({ userAgent: INSTA_INAPP })).toBe("instagram");
    expect(classifySource({ userAgent: KAKAOTALK_INAPP })).toBe("kakao");
  });
  test("모르는 referrer·모르는 utm 은 other, 아무것도 없으면 direct", () => {
    expect(classifySource({ referrerHost: "example.com", userAgent: WIN_CHROME })).toBe("other");
    expect(classifySource({ utmSource: "newsletter", userAgent: WIN_CHROME })).toBe("other");
    expect(classifySource({ userAgent: WIN_CHROME })).toBe("direct");
    expect(classifySource({})).toBe("direct");
  });
  test("우리 사이트 referrer 는 없는 것으로 친다", () => {
    expect(classifySource({ referrerHost: "ai-solution.co.kr", userAgent: WIN_CHROME })).toBe("direct");
    expect(classifySource({ referrerHost: "www.ai-solution.co.kr", userAgent: WIN_CHROME })).toBe(
      "direct",
    );
  });
  test("영업 메일: utm_source=email 은 email(지메일 referrer·앱 안 브라우저보다 앞선다)", () => {
    expect(classifySource({ utmSource: "email", userAgent: WIN_CHROME })).toBe("email");
    expect(classifySource({ utmSource: "Email", userAgent: WIN_CHROME })).toBe("email");
    expect(classifySource({ utmSource: "e-mail", userAgent: WIN_CHROME })).toBe("email");
    expect(
      classifySource({ utmSource: "email", referrerHost: "mail.google.com", userAgent: WIN_CHROME }),
    ).toBe("email");
    expect(classifySource({ utmSource: "email", userAgent: NAVER_INAPP })).toBe("email");
    expect(VISIT_SOURCES).toContain("email");
    // 「email」 이 들어간 다른 이름(newsletter_email 등)은 그대로 other
    expect(classifySource({ utmSource: "newsletter_email", userAgent: WIN_CHROME })).toBe("other");
  });
  test("가짜 당근 호스트(daangn.com.evil.kr)는 당근이 아니다", () => {
    expect(classifySource({ referrerHost: "daangn.com.evil.kr", userAgent: WIN_CHROME })).toBe("other");
  });
});

describe("기록 안 하는 경로", () => {
  test.each(["/admin", "/admin/visits", "/admin_/visits", "/login", "/login/"])("%s 제외", (p) => {
    expect(isUntrackedPath(p)).toBe(true);
  });
  test.each(["/", "/reels", "/solutions/hospital", "/blog/admin-tips", "/loginhelp-x"])("%s 기록", (p) => {
    expect(isUntrackedPath(p)).toBe(false);
  });
});

describe("입력 검사", () => {
  const ok = {
    v: "0f8fad5b-d9cb-469f-a165-70867728950e",
    s: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    p: "/reels",
  };
  const body = (o: Record<string, unknown>) => JSON.stringify(o);

  test("정상 본문", () => {
    expect(parseTrackBody(body({ ...ok, r: "WWW.DAANGN.COM", us: " daangn ", um: "profile", uc: "nov" }))).toEqual({
      visitorId: ok.v,
      sessionId: ok.s,
      path: "/reels",
      referrerHost: "www.daangn.com",
      utmSource: "daangn",
      utmMedium: "profile",
      utmCampaign: "nov",
      refCode: null,
    });
  });
  test("선택 칸이 없거나 빈 값이면 null", () => {
    expect(parseTrackBody(body(ok))).toMatchObject({ referrerHost: null, utmSource: null, utmMedium: null });
    expect(parseTrackBody(body({ ...ok, r: "", us: "" }))).toMatchObject({ referrerHost: null, utmSource: null });
  });
  test("JSON 이 아니거나 배열·숫자면 거절", () => {
    expect(parseTrackBody("")).toBeNull();
    expect(parseTrackBody("not json")).toBeNull();
    expect(parseTrackBody("[1,2]")).toBeNull();
    expect(parseTrackBody("42")).toBeNull();
    expect(parseTrackBody("null")).toBeNull();
  });
  test("아이디 형식", () => {
    expect(parseTrackBody(body({ ...ok, v: "short" }))).toBeNull();
    expect(parseTrackBody(body({ ...ok, v: "a".repeat(65) }))).toBeNull();
    expect(parseTrackBody(body({ ...ok, s: "has space here" }))).toBeNull();
    expect(parseTrackBody(body({ ...ok, v: 12345678 }))).toBeNull();
    expect(parseTrackBody(body({ ...ok, s: undefined }))).toBeNull();
  });
  test("경로: / 로 시작, 300자 이하, 제어 문자 없음", () => {
    expect(parseTrackBody(body({ ...ok, p: "/" + "a".repeat(299) }))).not.toBeNull();
    expect(parseTrackBody(body({ ...ok, p: "/" + "a".repeat(300) }))).toBeNull();
    expect(parseTrackBody(body({ ...ok, p: "reels" }))).toBeNull();
    expect(parseTrackBody(body({ ...ok, p: "//evil.com" }))).toBeNull();
    expect(parseTrackBody(body({ ...ok, p: "/a\nb" }))).toBeNull();
    expect(parseTrackBody(body({ ...ok, p: "https://x.kr/" }))).toBeNull();
  });
  test("referrer 호스트 형식", () => {
    expect(parseTrackBody(body({ ...ok, r: "https://daangn.com/x" }))).toBeNull();
    expect(parseTrackBody(body({ ...ok, r: "a".repeat(101) }))).toBeNull();
    expect(parseTrackBody(body({ ...ok, r: 5 }))).toBeNull();
  });
  test("utm 100자 상한·문자열만", () => {
    expect(parseTrackBody(body({ ...ok, us: "a".repeat(100) }))).not.toBeNull();
    expect(parseTrackBody(body({ ...ok, us: "a".repeat(101) }))).toBeNull();
    expect(parseTrackBody(body({ ...ok, uc: "x".repeat(101) }))).toBeNull();
    expect(parseTrackBody(body({ ...ok, um: { a: 1 } }))).toBeNull();
    expect(parseTrackBody(body({ ...ok, us: "a\u0000b" }))).toBeNull();
  });
  test("본문 크기 상한", () => {
    const big = body({ ...ok, junk: "x".repeat(MAX_TRACK_BODY_BYTES) });
    expect(big.length).toBeGreaterThan(MAX_TRACK_BODY_BYTES);
    expect(parseTrackBody(big)).toBeNull();
  });
});

describe("Cloudflare 숫자", () => {
  const sample = {
    data: {
      viewer: {
        zones: [
          {
            httpRequests1dGroups: [
              { dimensions: { date: "2026-11-05" }, sum: { pageViews: 30, requests: 400 }, uniq: { uniques: 12 } },
              { dimensions: { date: "2026-11-06" }, sum: { pageViews: 50, requests: 600 }, uniq: { uniques: 20 } },
            ],
          },
        ],
      },
    },
    errors: null,
  };

  test("응답을 날짜별로 최신 먼저", () => {
    expect(parseCfResponse(sample)).toEqual([
      { date: "2026-11-06", pageViews: 50, requests: 600, uniques: 20 },
      { date: "2026-11-05", pageViews: 30, requests: 400, uniques: 12 },
    ]);
    expect(parseCfResponse({ data: null })).toBeNull();
  });

  test("토큰이 없으면 부르지 않고 connected:false", async () => {
    let called = false;
    const r = await fetchCfDaily({
      token: undefined,
      zoneTag: "z",
      fetchImpl: (async () => {
        called = true;
        return new Response("{}");
      }) as unknown as typeof fetch,
    });
    expect(r).toEqual({ connected: false });
    expect(called).toBe(false);
  });

  test("토큰은 머리에만, 결과에는 없다", async () => {
    const token = "SECRET-TOKEN-123";
    let sentAuth = "";
    let sentBody = "";
    const r = await fetchCfDaily({
      token,
      zoneTag: "6f84749cf40269bd78a999d53c7fc3e4",
      now: new Date("2026-11-07T01:00:00Z"),
      fetchImpl: (async (_url: string, init: RequestInit) => {
        sentAuth = String((init.headers as Record<string, string>).authorization);
        sentBody = String(init.body);
        return new Response(JSON.stringify(sample), { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(sentAuth).toBe(`Bearer ${token}`);
    const vars = JSON.parse(sentBody).variables;
    expect(vars).toEqual({ zoneTag: "6f84749cf40269bd78a999d53c7fc3e4", since: "2026-10-09", until: "2026-11-07" });
    expect(JSON.stringify(r)).not.toContain(token);
    expect(r).toMatchObject({ connected: true, days: [{ date: "2026-11-06" }, { date: "2026-11-05" }] });
  });

  test("오류 응답·네트워크 실패는 error 문구(토큰 없음)", async () => {
    const token = "SECRET-TOKEN-456";
    const r1 = await fetchCfDaily({
      token,
      zoneTag: "z",
      fetchImpl: (async () =>
        new Response(JSON.stringify({ data: null, errors: [{ message: "not authorized" }] }), {
          status: 200,
        })) as unknown as typeof fetch,
    });
    expect(r1).toEqual({ connected: true, error: "Cloudflare 오류: not authorized" });
    const r2 = await fetchCfDaily({
      token,
      zoneTag: "z",
      fetchImpl: (async () => {
        throw new Error(`boom ${token}`);
      }) as unknown as typeof fetch,
    });
    expect(r2).toMatchObject({ connected: true });
    expect(JSON.stringify(r2)).not.toContain(token);
    const r3 = await fetchCfDaily({
      token,
      zoneTag: "z",
      fetchImpl: (async () => new Response("nope", { status: 403 })) as unknown as typeof fetch,
    });
    expect(r3).toEqual({ connected: true, error: "Cloudflare 응답 오류 HTTP 403" });
  });
});
