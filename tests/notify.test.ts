// 상담 접수 알림 단위 시험 — 실행: bun test
// 네트워크·DB 에 나가지 않는다(fetch 와 저장소를 가짜로 바꿔 끼운다).
import { describe, expect, test } from "bun:test";
import { buildSheetPayload, postToSheet } from "../src/lib/notify/sheet";
import {
  KAKAO_MEMO_URL,
  KAKAO_TEXT_MAX,
  KAKAO_TOKEN_URL,
  buildAuthorizeUrl,
  buildKakaoTemplate,
  buildKakaoText,
  sendKakaoNotice,
  type KakaoTokenStore,
} from "../src/lib/notify/kakao";
import { runInquiryNotifications } from "../src/lib/notify";
import type { InquiryNotice } from "../src/lib/notify/types";

const base: InquiryNotice = {
  id: "11111111-2222-3333-4444-555555555555",
  receivedAt: "2026-11-03T05:00:00.000Z",
  name: "홍길동 / 길동치과",
  contact: "010-1234-5678",
  services: ["홈페이지·랜딩페이지 제작", "상담 접수 자동 알림(시트·카톡)"],
  topic: "",
  notes: "치과 임플란트 상담 랜딩이 필요합니다.",
  referenceLinks: "https://example.com",
  hasAttachment: false,
  fileName: "",
  attachmentFailed: false,
  source: "homepage",
};

type Call = { url: string; init?: RequestInit };

function fakeFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: Call[] = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { fn, calls };
}

function memStore(initial: string | null) {
  const saved: { token: string; exp?: number }[] = [];
  let cur = initial;
  const store: KakaoTokenStore = {
    async load() {
      return cur;
    },
    async save(t, exp) {
      cur = t;
      saved.push({ token: t, exp });
    },
  };
  return {
    store,
    saved,
    get current() {
      return cur;
    },
  };
}

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// ── 시트 본문 ──────────────────────────────────────────────────────
describe("시트 본문 만들기", () => {
  test("토큰·문의 번호·필드를 담고 예산·론칭일은 없으면 뺀다", () => {
    const p = buildSheetPayload(base, "TOKEN123");
    expect(p.token).toBe("TOKEN123");
    expect(p.inquiryId).toBe(base.id);
    expect(p.services).toEqual(base.services);
    expect(p.source).toBe("homepage");
    expect("budget" in p).toBe(false);
    expect("launchDate" in p).toBe(false);
  });

  test("예전 폼이 보낸 예산·론칭일은 그대로 싣는다", () => {
    const p = buildSheetPayload({ ...base, budget: " 300만 원 ", launchDate: "미정" }, "t");
    expect(p.budget).toBe("300만 원");
    expect(p.launchDate).toBe("미정");
  });

  test("주소가 없으면 건너뛰고 fetch 하지 않는다", async () => {
    const f = fakeFetch(() => jsonRes({ ok: true }));
    expect(await postToSheet(base, {}, f.fn)).toBe("skipped:no_url");
    expect(f.calls.length).toBe(0);
  });

  test("성공·토큰 불일치·HTTP 오류·네트워크 오류를 상태로 돌려준다", async () => {
    const ok = fakeFetch(() => jsonRes({ ok: true }));
    expect(await postToSheet(base, { url: "https://s/exec", token: "t" }, ok.fn)).toBe("ok");
    const sent = JSON.parse(String(ok.calls[0].init?.body));
    expect(sent.token).toBe("t");
    expect(sent.name).toBe(base.name);

    const bad = fakeFetch(() => jsonRes({ ok: false, error: "unauthorized" }));
    expect(await postToSheet(base, { url: "https://s/exec", token: "x" }, bad.fn)).toBe(
      "failed:unauthorized",
    );
    const http = fakeFetch(() => new Response("nope", { status: 500 }));
    expect(await postToSheet(base, { url: "https://s/exec" }, http.fn)).toBe("failed:http_500");
    const boom = await postToSheet(base, { url: "https://s/exec" }, async () => {
      throw new TypeError("network down");
    });
    expect(boom).toBe("failed:TypeError: network down");
  });
});

// ── 카톡 메시지 ────────────────────────────────────────────────────
describe("카톡 메시지 만들기", () => {
  test("이름·연락처·관심·내용이 들어가고 200자를 넘지 않는다", () => {
    const t = buildKakaoText(base);
    expect(t.startsWith("[홈페이지 상담 접수]")).toBe(true);
    expect(t).toContain("이름: 홍길동 / 길동치과");
    expect(t).toContain("연락처: 010-1234-5678");
    expect(t).toContain("관심: 홈페이지·랜딩페이지 제작");
    expect(t).toContain("내용: 치과 임플란트");
    expect(Array.from(t).length).toBeLessThanOrEqual(KAKAO_TEXT_MAX);
  });

  test("아주 긴 입력도 200자 안으로 자르고 줄바꿈은 한 줄로 편다", () => {
    const long = {
      ...base,
      name: "가".repeat(300),
      notes: "첫 줄\n둘째 줄\n" + "나".repeat(1000),
      services: Array.from({ length: 10 }, (_, i) => `서비스${i}`),
      topic: "주제".repeat(50),
    };
    const t = buildKakaoText(long);
    expect(Array.from(t).length).toBeLessThanOrEqual(KAKAO_TEXT_MAX);
    expect(t).not.toContain("첫 줄\n둘째");
  });

  test("텍스트 템플릿 모양: 링크는 관리자 문의 화면, 단추 이름", () => {
    const tpl = buildKakaoTemplate(base, "https://ai-solution.co.kr/admin/inquiries");
    expect(tpl.object_type).toBe("text");
    expect(tpl.link.web_url).toBe("https://ai-solution.co.kr/admin/inquiries");
    expect(tpl.link.mobile_web_url).toBe("https://ai-solution.co.kr/admin/inquiries");
    expect(tpl.button_title).toBe("문의 보기");
  });

  test("첨부 실패·시험 표시", () => {
    const t = buildKakaoText({ ...base, attachmentFailed: true, source: "test" });
    expect(t).toContain("시험");
    expect(t).toContain("첨부: 업로드 실패");
  });

  test("카카오 로그인 주소에 talk_message 동의와 state 가 붙는다", () => {
    const u = new URL(
      buildAuthorizeUrl({
        restApiKey: "KEY",
        redirectUri: "https://a.kr/api/kakao/callback",
        state: "S",
      }),
    );
    expect(u.origin + u.pathname).toBe("https://kauth.kakao.com/oauth/authorize");
    expect(u.searchParams.get("scope")).toBe("talk_message");
    expect(u.searchParams.get("state")).toBe("S");
    expect(u.searchParams.get("response_type")).toBe("code");
  });
});

// ── 토큰 갱신·저장 ────────────────────────────────────────────────
describe("카톡 토큰 갱신과 저장", () => {
  const cfg = { restApiKey: "REST", clientSecret: "SEC" };
  const adminUrl = "https://ai-solution.co.kr/admin/inquiries";

  test("REST 키가 없으면 건너뛴다", async () => {
    const f = fakeFetch(() => jsonRes({}));
    expect(await sendKakaoNotice(base, {}, memStore("R").store, adminUrl, f.fn)).toBe(
      "skipped:no_rest_api_key",
    );
    expect(f.calls.length).toBe(0);
  });

  test("저장소·시크릿 모두 토큰이 없으면 '연결 안 됨'으로 건너뛴다", async () => {
    const f = fakeFetch(() => jsonRes({}));
    expect(await sendKakaoNotice(base, cfg, memStore(null).store, adminUrl, f.fn)).toBe(
      "skipped:not_connected",
    );
  });

  test("새 리프레시 토큰이 오면 저장하고, 메시지는 새 액세스 토큰으로 보낸다", async () => {
    const m = memStore("OLD_REFRESH");
    const f = fakeFetch((url) => {
      if (url === KAKAO_TOKEN_URL)
        return jsonRes({
          access_token: "ACCESS1",
          refresh_token: "NEW_REFRESH",
          refresh_token_expires_in: 5184000,
        });
      if (url === KAKAO_MEMO_URL) return jsonRes({ result_code: 0 });
      return new Response("?", { status: 404 });
    });
    expect(await sendKakaoNotice(base, cfg, m.store, adminUrl, f.fn)).toBe("ok");
    expect(m.saved).toEqual([{ token: "NEW_REFRESH", exp: 5184000 }]);
    expect(m.current).toBe("NEW_REFRESH");

    // 토큰 요청 본문
    const tokenBody = new URLSearchParams(String(f.calls[0].init?.body));
    expect(tokenBody.get("grant_type")).toBe("refresh_token");
    expect(tokenBody.get("client_id")).toBe("REST");
    expect(tokenBody.get("client_secret")).toBe("SEC");
    expect(tokenBody.get("refresh_token")).toBe("OLD_REFRESH");

    // 메시지 요청
    const memo = f.calls[1];
    expect(memo.url).toBe(KAKAO_MEMO_URL);
    expect((memo.init?.headers as Record<string, string>).Authorization).toBe("Bearer ACCESS1");
    const tpl = JSON.parse(new URLSearchParams(String(memo.init?.body)).get("template_object")!);
    expect(tpl.object_type).toBe("text");
    expect(tpl.link.web_url).toBe(adminUrl);
  });

  test("새 리프레시 토큰이 없으면 저장하지 않는다", async () => {
    const m = memStore("KEEP");
    const f = fakeFetch((url) =>
      url === KAKAO_TOKEN_URL ? jsonRes({ access_token: "A" }) : jsonRes({ result_code: 0 }),
    );
    expect(await sendKakaoNotice(base, cfg, m.store, adminUrl, f.fn)).toBe("ok");
    expect(m.saved.length).toBe(0);
  });

  test("저장소가 비면 시크릿 KAKAO_REFRESH_TOKEN 으로 시작하고, 새 토큰은 저장소에 넣는다", async () => {
    const m = memStore(null);
    const f = fakeFetch((url) =>
      url === KAKAO_TOKEN_URL
        ? jsonRes({ access_token: "A", refresh_token: "FROM_KAKAO", refresh_token_expires_in: 100 })
        : jsonRes({ result_code: 0 }),
    );
    const st = await sendKakaoNotice(
      base,
      { ...cfg, seedRefreshToken: "SEED" },
      m.store,
      adminUrl,
      f.fn,
    );
    expect(st).toBe("ok");
    expect(new URLSearchParams(String(f.calls[0].init?.body)).get("refresh_token")).toBe("SEED");
    expect(m.current).toBe("FROM_KAKAO");
  });

  test("새 토큰 저장이 실패하면 메시지는 보내고 상태에 남긴다", async () => {
    const store: KakaoTokenStore = {
      load: async () => "OLD",
      save: async () => {
        throw new Error("db down");
      },
    };
    const f = fakeFetch((url) =>
      url === KAKAO_TOKEN_URL
        ? jsonRes({ access_token: "A", refresh_token: "NEW" })
        : jsonRes({ result_code: 0 }),
    );
    expect(await sendKakaoNotice(base, cfg, store, adminUrl, f.fn)).toBe(
      "failed:sent_but_store_save",
    );
    expect(f.calls.map((c) => c.url)).toEqual([KAKAO_TOKEN_URL, KAKAO_MEMO_URL]);
  });

  test("토큰 갱신 실패(만료 등)면 메시지를 보내지 않고 오류 종류만 남긴다", async () => {
    const f = fakeFetch(() =>
      jsonRes({ error: "invalid_grant", error_description: "secret" }, 401),
    );
    const st = await sendKakaoNotice(base, cfg, memStore("R").store, adminUrl, f.fn);
    expect(st).toBe("failed:Error: token_401_invalid_grant");
    expect(st).not.toContain("R");
    expect(f.calls.length).toBe(1);
  });

  test("메시지 전송 실패(권한 동의 없음 -402)를 상태로 남긴다", async () => {
    const f = fakeFetch((url) =>
      url === KAKAO_TOKEN_URL ? jsonRes({ access_token: "A" }) : jsonRes({ code: -402 }, 403),
    );
    expect(await sendKakaoNotice(base, cfg, memStore("R").store, adminUrl, f.fn)).toBe(
      "failed:Error: memo_403_-402",
    );
  });
});

// ── 묶음 실행 ─────────────────────────────────────────────────────
describe("접수 알림 묶음", () => {
  test("설정이 하나도 없어도 던지지 않고 둘 다 건너뛴다", async () => {
    const f = fakeFetch(() => jsonRes({}));
    const r = await runInquiryNotifications(base, { env: {}, db: null, fetchFn: f.fn });
    expect(r).toEqual({ sheet: "skipped:no_url", kakao: "skipped:no_rest_api_key" });
    expect(f.calls.length).toBe(0);
  });

  test("시트가 실패해도 카톡은 간다", async () => {
    const f = fakeFetch((url) => {
      if (url.startsWith("https://script")) return new Response("x", { status: 502 });
      if (url === KAKAO_TOKEN_URL) return jsonRes({ access_token: "A" });
      return jsonRes({ result_code: 0 });
    });
    const r = await runInquiryNotifications(base, {
      env: {
        INQUIRY_SHEET_WEBHOOK_URL: "https://script.google.com/macros/s/x/exec",
        KAKAO_REST_API_KEY: "REST",
        KAKAO_REFRESH_TOKEN: "SEED",
      },
      db: null,
      fetchFn: f.fn,
    });
    expect(r.sheet).toBe("failed:http_502");
    expect(r.kakao).toBe("ok");
  });
});
