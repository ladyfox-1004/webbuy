// 영업 메일 자동 발송(30분마다 예약 실행) 시험 — DB·지메일·카톡 전부 가짜. 실행: bun test ./tests
import { describe, expect, test } from "bun:test";
import { buildKakaoTextTemplate, sendKakaoTemplate } from "../src/lib/notify/kakao";
import {
  ADMIN_OUTREACH_URL,
  AUTO_MAX_PER_RUN,
  autoSendKakaoText,
  inAutoSendWindow,
  runAutoSend,
  type AutoSendStore,
} from "../src/lib/outreach/auto";
import { sendSelected, type DraftRow, type OutreachStore } from "../src/lib/outreach/service";

const ENV = { GMAIL_CLIENT_ID: "cid", GMAIL_CLIENT_SECRET: "csecret", GMAIL_REFRESH_TOKEN: "rtoken" };
// 2026-11-09(월) 10:00 KST = 01:00 UTC
const MON_10 = new Date("2026-11-09T01:00:00Z");
const TODAY = "2026-11-09";

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function row(n: number, over: Partial<DraftRow> = {}): DraftRow {
  return {
    id: uuid(n),
    batch_date: TODAY,
    channel_id: `UC_${n}`,
    channel_name: `채널${n}`,
    channel_url: `https://www.youtube.com/channel/UC_${n}`,
    subscribers: 1000 * n,
    niche: null,
    top_title: `영상 ${n}`,
    top_url: null,
    email: `owner${n}@example.com`,
    status: "ready",
    gmail_message_id: null,
    error: null,
    created_at: `2026-11-09T00:00:${String(n % 60).padStart(2, "0")}Z`,
    approved_at: null,
    sent_at: null,
    ...over,
  };
}

/** 메모리 DB — Supabase 와 같은 「조건부 update … returning」 뜻. 호출마다 한 번 쉬어서 동시 실행이 섞이게 한다. */
function fakeDb(rows: DraftRow[], opts: { autoSend?: boolean | Error; suppressed?: string[] } = {}) {
  const db = new Map(rows.map((r) => [r.id, { ...r }]));
  const sup = new Set(opts.suppressed ?? []);
  const calls: string[] = [];
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  const store: OutreachStore = {
    async getByIds(ids) {
      calls.push("getByIds");
      await tick();
      return ids.filter((id) => db.has(id)).map((id) => ({ ...db.get(id)! }));
    },
    async getById(id) {
      return db.has(id) ? { ...db.get(id)! } : null;
    },
    async suppressedAmong(emails) {
      calls.push("suppressedAmong");
      await tick();
      return new Set(emails.filter((e) => sup.has(e)));
    },
    async addSuppression(email) {
      sup.add(email);
    },
    async transition(ids, from, patch) {
      calls.push(`transition:${from.join("|")}->${patch.status}`);
      await tick();
      const out: DraftRow[] = [];
      for (const id of ids) {
        const r = db.get(id);
        if (r && from.includes(r.status)) {
          Object.assign(r, patch);
          out.push({ ...r });
        }
      }
      return out;
    },
    async skipRestOfBatch(dates, keep) {
      calls.push("skipRestOfBatch");
      let n = 0;
      for (const r of db.values()) {
        if (dates.includes(r.batch_date) && r.status === "ready" && !keep.includes(r.id)) {
          r.status = "skipped";
          n++;
        }
      }
      return n;
    },
    async markSent(id, mid, at) {
      const r = db.get(id)!;
      if (r.status === "sending") Object.assign(r, { status: "sent", gmail_message_id: mid, sent_at: at });
    },
    async markFailed(id, err) {
      const r = db.get(id)!;
      if (r.status === "sending") Object.assign(r, { status: "failed", error: err });
    },
  };
  const auto: AutoSendStore = {
    async getAutoSend() {
      calls.push("getAutoSend");
      if (opts.autoSend instanceof Error) throw opts.autoSend;
      return opts.autoSend ?? true;
    },
    async readyIdsForDate(date) {
      calls.push(`readyIdsForDate:${date}`);
      return [...db.values()]
        .filter((r) => r.batch_date === date && r.status === "ready")
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((r) => r.id);
    },
  };
  return { store, auto, db, calls, status: (n: number) => db.get(uuid(n))!.status };
}

/** 가짜 구글: 토큰 → AT, 보내기 → 받는 주소 기록 */
function fakeGoogle(failFor: string[] = []) {
  const to: string[] = [];
  const fetchFn = async (url: string, init?: RequestInit) => {
    if (url.startsWith("https://oauth2.googleapis.com/token"))
      return new Response(JSON.stringify({ access_token: "AT", expires_in: 3599 }), { status: 200 });
    if (url === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
      const raw = (JSON.parse(String(init?.body)) as { raw: string }).raw;
      const addr = /^To: <([^>]+)>/m.exec(Buffer.from(raw, "base64url").toString("utf8"))?.[1] ?? "";
      if (failFor.includes(addr)) return new Response(JSON.stringify({ error: { code: 400 } }), { status: 400 });
      to.push(addr);
      return new Response(JSON.stringify({ id: `m${to.length}` }), { status: 200 });
    }
    return new Response("nf", { status: 404 });
  };
  return { fetchFn, to };
}

function autoDeps(f: ReturnType<typeof fakeDb>, g: ReturnType<typeof fakeGoogle>, extra: { now?: Date; notify?: (t: string) => Promise<never> | Promise<"ok"> | Promise<`failed:${string}`>; texts?: string[] } = {}) {
  const texts = extra.texts ?? [];
  return {
    store: f.store,
    auto: f.auto,
    env: ENV,
    fetchFn: g.fetchFn,
    sleep: async () => {},
    now: () => extra.now ?? MON_10,
    log: () => {},
    notify:
      extra.notify ??
      (async (t: string) => {
        texts.push(t);
        return "ok" as const;
      }),
  };
}

describe("시간 창(한국 시간 매일 07:00~20:00)", () => {
  test("일요일 23:00 UTC = 월요일 08:00 KST → 보냄", () => {
    expect(inAutoSendWindow(new Date("2026-11-08T23:00:00Z"))).toBe(true);
  });
  test("토요일 08:00 KST(금 23:00 UTC) → 보냄(주말도 보냄)", () => {
    expect(inAutoSendWindow(new Date("2026-11-06T23:00:00Z"))).toBe(true);
  });
  test("일요일 낮 → 보냄", () => {
    expect(inAutoSendWindow(new Date("2026-11-08T03:00:00Z"))).toBe(true);
  });
  test("20:30 KST(11:30 UTC) → 안 보냄 — 평일·주말 모두", () => {
    for (const d of ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"])
      expect(inAutoSendWindow(new Date(`${d}T11:30:00Z`))).toBe(false);
  });
  test("06:30 KST(전날 21:30 UTC) → 안 보냄", () => {
    expect(inAutoSendWindow(new Date("2026-11-08T21:30:00Z"))).toBe(false);
    expect(inAutoSendWindow(new Date("2026-11-07T21:30:00Z"))).toBe(false);
  });
  test("경계: 07:00 보냄 · 19:59 보냄 · 20:00 안 보냄 · 06:59 안 보냄", () => {
    expect(inAutoSendWindow(new Date("2026-11-08T22:00:00Z"))).toBe(true);
    expect(inAutoSendWindow(new Date("2026-11-09T10:59:00Z"))).toBe(true);
    expect(inAutoSendWindow(new Date("2026-11-09T11:00:00Z"))).toBe(false);
    expect(inAutoSendWindow(new Date("2026-11-08T21:59:00Z"))).toBe(false);
  });
});

describe("runAutoSend", () => {
  test("시간 창 밖이면 DB 도 안 읽고 아무것도 안 보냄", async () => {
    const f = fakeDb([row(1)]);
    const g = fakeGoogle();
    const texts: string[] = [];
    const r = await runAutoSend(autoDeps(f, g, { now: new Date("2026-11-09T11:30:00Z"), texts }));
    expect(r.reason).toBe("outside_window");
    expect(f.calls).toEqual([]);
    expect(g.to).toEqual([]);
    expect(texts).toEqual([]);
    expect(f.status(1)).toBe("ready");
  });

  test("토요일 08:00 KST 에도 보낸다", async () => {
    const f = fakeDb([row(1, { batch_date: "2026-11-07" })]);
    const g = fakeGoogle();
    const r = await runAutoSend(autoDeps(f, g, { now: new Date("2026-11-06T23:00:00Z") }));
    expect(r.reason).toBe("done");
    expect(r.sent).toBe(1);
  });

  test("auto_send 꺼짐 → 후보도 안 읽고 안 보냄", async () => {
    const f = fakeDb([row(1), row(2)], { autoSend: false });
    const g = fakeGoogle();
    const texts: string[] = [];
    const r = await runAutoSend(autoDeps(f, g, { texts }));
    expect(r.reason).toBe("auto_off");
    expect(f.calls).toEqual(["getAutoSend"]);
    expect(g.to).toEqual([]);
    expect(texts).toEqual([]);
  });

  test("설정 읽기 실패(표 없음 등) → 안전하게 안 보냄", async () => {
    const f = fakeDb([row(1)], { autoSend: new Error("자동 발송 설정 읽기 실패 [42P01]") });
    const g = fakeGoogle();
    const r = await runAutoSend(autoDeps(f, g));
    expect(r.reason).toBe("settings_error");
    expect(g.to).toEqual([]);
    expect(f.status(1)).toBe("ready");
  });

  test("지메일 비밀값 없으면 안 보냄", async () => {
    const f = fakeDb([row(1)]);
    const g = fakeGoogle();
    const r = await runAutoSend({ ...autoDeps(f, g), env: {} });
    expect(r.reason).toBe("gmail_not_connected");
    expect(g.to).toEqual([]);
  });

  test("오늘(KST) 날짜 ready 만 — 어제 ready·오늘 skipped 는 손대지 않음", async () => {
    const f = fakeDb([
      row(1),
      row(2),
      row(3, { batch_date: "2026-11-08" }),
      row(4, { batch_date: "2026-11-06" }),
      row(5, { status: "skipped" }),
    ]);
    const g = fakeGoogle();
    const r = await runAutoSend(autoDeps(f, g));
    expect(r.date).toBe(TODAY);
    expect(r.sent).toBe(2);
    expect(g.to.sort()).toEqual(["owner1@example.com", "owner2@example.com"]);
    expect(f.status(3)).toBe("ready");
    expect(f.status(4)).toBe("ready");
    expect(f.status(5)).toBe("skipped");
    expect(f.calls).toContain(`readyIdsForDate:${TODAY}`);
  });

  test("KST 날짜 기준: UTC 로는 전날이어도 한국 날짜 묶음을 보냄", async () => {
    // 2026-11-08 23:30 UTC = 2026-11-09 08:30 KST
    const f = fakeDb([row(1), row(2, { batch_date: "2026-11-08" })]);
    const g = fakeGoogle();
    const r = await runAutoSend(autoDeps(f, g, { now: new Date("2026-11-08T23:30:00Z") }));
    expect(r.date).toBe("2026-11-09");
    expect(g.to).toEqual(["owner1@example.com"]);
    expect(f.status(2)).toBe("ready");
  });

  test("수신거부 주소는 자동으로도 안 보냄", async () => {
    const f = fakeDb([row(1), row(2)], { suppressed: ["owner2@example.com"] });
    const g = fakeGoogle();
    const r = await runAutoSend(autoDeps(f, g));
    expect(g.to).toEqual(["owner1@example.com"]);
    expect(r.suppressed).toBe(1);
    expect(f.status(2)).toBe("suppressed");
  });

  test(`한 실행 최대 ${AUTO_MAX_PER_RUN}통 — 나머지는 ready 그대로(건너뜀 아님), 다음 실행이 보냄`, async () => {
    const rows = Array.from({ length: 25 }, (_, i) => row(i + 1));
    const f = fakeDb(rows);
    const g = fakeGoogle();
    const r1 = await runAutoSend(autoDeps(f, g));
    expect(r1.sent).toBe(AUTO_MAX_PER_RUN);
    expect(r1.deferred).toBe(25 - AUTO_MAX_PER_RUN);
    expect([...f.db.values()].filter((x) => x.status === "ready").length).toBe(25 - AUTO_MAX_PER_RUN);
    expect([...f.db.values()].filter((x) => x.status === "skipped").length).toBe(0);
    const r2 = await runAutoSend(autoDeps(f, g));
    expect(r2.sent).toBe(25 - AUTO_MAX_PER_RUN);
    expect(new Set(g.to).size).toBe(25);
    expect(g.to.length).toBe(25);
  });

  test("수동 「보내기」와 동시에 돌아도 같은 주소에 두 번 안 나감(sending 선점)", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(i + 1));
    const f = fakeDb(rows);
    const g = fakeGoogle();
    const manualIds = rows.slice(0, 6).map((r) => r.id);
    const [auto, manual] = await Promise.all([
      runAutoSend(autoDeps(f, g)),
      sendSelected(manualIds, { store: f.store, env: ENV, fetchFn: g.fetchFn, sleep: async () => {}, log: () => {} }),
    ]);
    expect(g.to.length).toBe(new Set(g.to).size);
    expect(auto.sent + manual.sent).toBe(g.to.length);
    // 모든 줄은 보냈거나(sent) 수동이 건너뛴 것(skipped) 둘 중 하나 — sending 이나 두 번 보냄 없음
    for (const r of f.db.values()) expect(["sent", "skipped"]).toContain(r.status);
    const sentRows = [...f.db.values()].filter((r) => r.status === "sent").length;
    expect(sentRows).toBe(g.to.length);
  });

  test("이미 보낸 실행 뒤 다시 돌면 0통·카톡 안 보냄", async () => {
    const f = fakeDb([row(1)]);
    const g = fakeGoogle();
    const texts: string[] = [];
    await runAutoSend(autoDeps(f, g, { texts }));
    const r2 = await runAutoSend(autoDeps(f, g, { texts }));
    expect(r2.reason).toBe("no_ready");
    expect(g.to.length).toBe(1);
    expect(texts.length).toBe(1);
  });
});

describe("카톡 알림", () => {
  test("보낸 실행마다 한 번, 문구 그대로", async () => {
    const f = fakeDb([row(1), row(2), row(3)]);
    const g = fakeGoogle(["owner3@example.com"]);
    const texts: string[] = [];
    const r = await runAutoSend(autoDeps(f, g, { texts }));
    expect(r.sent).toBe(2);
    expect(r.failed).toBe(1);
    expect(texts).toEqual(["오늘 영업 메일 2통 보냈어요(실패 1). 확인: https://ai-solution.co.kr/admin/outreach"]);
    expect(r.kakao).toBe("ok");
  });

  test("문구에 이모지·마크다운 볼드 없음", () => {
    const t = autoSendKakaoText(10, 0);
    expect(t).toBe("오늘 영업 메일 10통 보냈어요(실패 0). 확인: https://ai-solution.co.kr/admin/outreach");
    expect(t).not.toMatch(/\*\*|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  test("0통이면 카톡 안 보냄(전부 실패해도)", async () => {
    const f = fakeDb([row(1)]);
    const g = fakeGoogle(["owner1@example.com"]);
    const texts: string[] = [];
    const r = await runAutoSend(autoDeps(f, g, { texts }));
    expect(r.sent).toBe(0);
    expect(r.failed).toBe(1);
    expect(texts).toEqual([]);
    expect(r.kakao).toBe("not_sent");
  });

  test("카톡이 던져도 발송 결과는 그대로", async () => {
    const f = fakeDb([row(1), row(2)]);
    const g = fakeGoogle();
    const r = await runAutoSend(
      autoDeps(f, g, {
        notify: async () => {
          throw new Error("memo_401");
        },
      }),
    );
    expect(r.reason).toBe("done");
    expect(r.sent).toBe(2);
    expect(r.kakao).toMatch(/^failed:/);
    expect(f.status(1)).toBe("sent");
    expect(f.status(2)).toBe("sent");
  });

  test("카톡이 failed 상태를 돌려줘도 발송 결과는 그대로", async () => {
    const f = fakeDb([row(1)]);
    const g = fakeGoogle();
    const r = await runAutoSend(autoDeps(f, g, { notify: async () => "failed:token_401_invalid_grant" as const }));
    expect(r.sent).toBe(1);
    expect(r.kakao).toBe("failed:token_401_invalid_grant");
  });

  test("sendKakaoTemplate: 연결된 토큰으로 「나에게 보내기」에 그 글을 보냄", async () => {
    const posted: { url: string; body: string }[] = [];
    const fetchFn = async (url: string, init?: RequestInit) => {
      posted.push({ url, body: String(init?.body ?? "") });
      if (url.includes("/oauth/token")) return new Response(JSON.stringify({ access_token: "KAT" }), { status: 200 });
      return new Response(JSON.stringify({ result_code: 0 }), { status: 200 });
    };
    const text = autoSendKakaoText(3, 0);
    const status = await sendKakaoTemplate(
      buildKakaoTextTemplate(text, ADMIN_OUTREACH_URL, "영업 메일 보기"),
      { restApiKey: "rest" },
      { load: async () => "RT", save: async () => {} },
      fetchFn,
    );
    expect(status).toBe("ok");
    const memo = posted.find((p) => p.url.endsWith("/v2/api/talk/memo/default/send"))!;
    const tpl = JSON.parse(new URLSearchParams(memo.body).get("template_object")!);
    expect(tpl.text).toBe(text);
    expect(tpl.link.web_url).toBe(ADMIN_OUTREACH_URL);
  });

  test("카톡 연결 안 됐으면 skipped(던지지 않음)", async () => {
    const status = await sendKakaoTemplate(buildKakaoTextTemplate("x", ADMIN_OUTREACH_URL, "보기"), { restApiKey: "rest" }, null);
    expect(status).toBe("skipped:not_connected");
  });
});
