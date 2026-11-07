// 영업 메일 보내기 상태 전이 시험 — DB 와 지메일은 가짜. 실행: bun test ./tests
import { describe, expect, test } from "bun:test";
import { GMAIL_NOT_CONNECTED } from "../src/lib/outreach/gmail";
import {
  MAX_SEND_PER_REQUEST,
  SEND_GAP_MS,
  cleanIds,
  countByDay,
  isYmd,
  kstDate,
  retrySelected,
  sendSelected,
  skipSelected,
  unsubscribeById,
  type DraftRow,
  type OutreachStatus,
  type OutreachStore,
} from "../src/lib/outreach/service";

const ENV = { GMAIL_CLIENT_ID: "cid", GMAIL_CLIENT_SECRET: "csecret", GMAIL_REFRESH_TOKEN: "rtoken-SECRET" };

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function row(n: number, over: Partial<DraftRow> = {}): DraftRow {
  return {
    id: uuid(n),
    batch_date: "2026-11-07",
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
    created_at: "2026-11-07T00:00:00Z",
    approved_at: null,
    sent_at: null,
    ...over,
  };
}

/** 메모리 store — Supabase 와 같은 「조건부 update … returning」 뜻 */
function fakeStore(rows: DraftRow[], suppressed: string[] = []) {
  const db = new Map(rows.map((r) => [r.id, { ...r }]));
  const sup = new Set(suppressed);
  const calls: string[] = [];
  const store: OutreachStore = {
    async getByIds(ids) {
      calls.push("getByIds");
      return ids.filter((id) => db.has(id)).map((id) => ({ ...db.get(id)! }));
    },
    async getById(id) {
      calls.push("getById");
      return db.has(id) ? { ...db.get(id)! } : null;
    },
    async suppressedAmong(emails) {
      calls.push("suppressedAmong");
      return new Set(emails.filter((e) => sup.has(e)));
    },
    async addSuppression(email) {
      calls.push("addSuppression");
      sup.add(email);
    },
    async transition(ids, from, patch) {
      calls.push(`transition:${from.join("|")}->${patch.status}`);
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
  return { store, db, sup, calls, status: (n: number) => db.get(uuid(n))!.status as OutreachStatus };
}

type Call = { url: string; body: string; auth: string };

/** 가짜 구글: 토큰 → "AT", 보내기 → id. failFor 에 든 주소는 400 */
function fakeGoogle(opts: { failFor?: string[]; tokenStatus?: number } = {}) {
  const calls: Call[] = [];
  let n = 0;
  const fetchFn = async (url: string, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    const auth = String((init?.headers as Record<string, string> | undefined)?.authorization ?? "");
    calls.push({ url, body, auth });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      if (opts.tokenStatus && opts.tokenStatus !== 200)
        return new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }), { status: opts.tokenStatus });
      return new Response(JSON.stringify({ access_token: "AT-SECRET", expires_in: 3599 }), { status: 200 });
    }
    if (url === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
      const raw = (JSON.parse(body) as { raw: string }).raw;
      const mime = Buffer.from(raw, "base64url").toString("utf8");
      const to = /^To: <([^>]+)>/m.exec(mime)?.[1] ?? "";
      if (opts.failFor?.includes(to))
        return new Response(JSON.stringify({ error: { code: 400, message: "Invalid To header" } }), { status: 400 });
      n++;
      return new Response(JSON.stringify({ id: `msg${n}`, threadId: `t${n}` }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
  const sends = () => calls.filter((c) => c.url.includes("/messages/send"));
  return { fetchFn, calls, sends };
}

const NOW = () => new Date("2026-11-07T01:00:00Z");

function deps(store: OutreachStore, fetchFn: ReturnType<typeof fakeGoogle>["fetchFn"], extra: { sleeps?: number[]; logs?: string[] } = {}) {
  return {
    store,
    env: ENV,
    fetchFn,
    now: NOW,
    sleep: async (ms: number) => {
      extra.sleeps?.push(ms);
    },
    log: (m: string) => {
      extra.logs?.push(m);
    },
  };
}

describe("보내기", () => {
  test("고른 것만 sent, 그날 묶음의 나머지 ready 는 skipped, 다른 날은 그대로", async () => {
    const f = fakeStore([row(1), row(2), row(3), row(4, { batch_date: "2026-11-06" })]);
    const g = fakeGoogle();
    const sleeps: number[] = [];
    const r = await sendSelected([uuid(1), uuid(2)], deps(f.store, g.fetchFn, { sleeps }));
    expect(r.ok).toBe(true);
    expect(r.sent).toBe(2);
    expect(r.skipped).toBe(1);
    expect(f.status(1)).toBe("sent");
    expect(f.status(2)).toBe("sent");
    expect(f.status(3)).toBe("skipped");
    expect(f.status(4)).toBe("ready");
    expect(f.db.get(uuid(1))!.gmail_message_id).toBe("msg1");
    expect(f.db.get(uuid(1))!.sent_at).toBe("2026-11-07T01:00:00.000Z");
    expect(f.db.get(uuid(1))!.approved_at).toBe("2026-11-07T01:00:00.000Z");
    // 사이에만 1.5초 쉼(2통 → 1번)
    expect(sleeps).toEqual([SEND_GAP_MS]);
    expect(SEND_GAP_MS).toBe(1500);
    // 토큰은 한 번만 받고 access token 으로 보낸다
    expect(g.calls.filter((c) => c.url.includes("oauth2")).length).toBe(1);
    expect(g.sends().every((c) => c.auth === "Bearer AT-SECRET")).toBe(true);
  });

  test("보내기 전에 ready → sending 으로 조건부 변경(보내는 순간 상태는 sending)", async () => {
    const f = fakeStore([row(1)]);
    const seen: string[] = [];
    const g = fakeGoogle();
    const wrapped = async (url: string, init?: RequestInit) => {
      if (url.includes("/messages/send")) seen.push(f.status(1));
      return g.fetchFn(url, init);
    };
    await sendSelected([uuid(1)], deps(f.store, wrapped));
    expect(seen).toEqual(["sending"]);
    expect(f.calls).toContain("transition:ready->sending");
  });

  test("수신거부 주소는 보내지 않고 suppressed", async () => {
    const f = fakeStore([row(1), row(2)], ["owner2@example.com"]);
    const g = fakeGoogle();
    const r = await sendSelected([uuid(1), uuid(2)], deps(f.store, g.fetchFn));
    expect(r.sent).toBe(1);
    expect(r.suppressed).toBe(1);
    expect(f.status(2)).toBe("suppressed");
    expect(g.sends().length).toBe(1);
    const mime = Buffer.from((JSON.parse(g.sends()[0].body) as { raw: string }).raw, "base64url").toString("utf8");
    expect(mime).toContain("To: <owner1@example.com>");
  });

  test("한 번에 20통 상한: 넘는 것은 ready 그대로(건너뜀으로 바꾸지 않음)", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => row(i + 1));
    const f = fakeStore(rows);
    const g = fakeGoogle();
    const sleeps: number[] = [];
    const r = await sendSelected(rows.map((x) => x.id), deps(f.store, g.fetchFn, { sleeps }));
    expect(MAX_SEND_PER_REQUEST).toBe(20);
    expect(r.sent).toBe(20);
    expect(r.deferred).toBe(5);
    expect(r.skipped).toBe(0);
    expect(g.sends().length).toBe(20);
    expect(sleeps.length).toBe(19);
    for (let i = 21; i <= 25; i++) expect(f.status(i)).toBe("ready");
  });

  test("중복 클릭: 이미 sending/sent 인 줄은 다시 보내지 않는다", async () => {
    const f = fakeStore([row(1, { status: "sending" }), row(2, { status: "sent" }), row(3)]);
    const g = fakeGoogle();
    const r = await sendSelected([uuid(1), uuid(2), uuid(3)], deps(f.store, g.fetchFn));
    expect(r.sent).toBe(1);
    expect(r.notReady).toBe(2);
    expect(g.sends().length).toBe(1);
    expect(f.status(1)).toBe("sending");
    expect(f.status(2)).toBe("sent");
  });

  test("중복 클릭: 두 요청이 동시에 와도 한 통만", async () => {
    const f = fakeStore([row(1)]);
    const g = fakeGoogle();
    const [a, b] = await Promise.all([
      sendSelected([uuid(1)], deps(f.store, g.fetchFn)),
      sendSelected([uuid(1)], deps(f.store, g.fetchFn)),
    ]);
    expect(a.sent + b.sent).toBe(1);
    expect(g.sends().length).toBe(1);
    expect(f.status(1)).toBe("sent");
  });

  test("지메일 실패: 그 줄만 failed + 오류, 나머지는 계속 보냄. 토큰은 오류·로그에 없음", async () => {
    const f = fakeStore([row(1), row(2), row(3)]);
    const g = fakeGoogle({ failFor: ["owner2@example.com"] });
    const logs: string[] = [];
    const r = await sendSelected([uuid(1), uuid(2), uuid(3)], deps(f.store, g.fetchFn, { logs }));
    expect(r.sent).toBe(2);
    expect(r.failed).toBe(1);
    expect(f.status(2)).toBe("failed");
    expect(f.db.get(uuid(2))!.error).toContain("HTTP 400");
    expect(f.db.get(uuid(2))!.error).toContain("Invalid To header");
    expect(f.status(3)).toBe("sent");
    const all = JSON.stringify(r) + logs.join("\n") + f.db.get(uuid(2))!.error;
    for (const secret of ["AT-SECRET", "rtoken-SECRET", "csecret"]) expect(all).not.toContain(secret);
    // 로그에 이메일 전체가 나오지 않는다
    expect(logs.join("\n")).not.toContain("owner2@example.com");
    expect(logs.join("\n")).toContain("own***");
  });

  test("지메일 로그인 실패: 아무 줄도 sending/skipped 로 바꾸지 않는다", async () => {
    const f = fakeStore([row(1), row(2)]);
    const g = fakeGoogle({ tokenStatus: 400 });
    const r = await sendSelected([uuid(1)], deps(f.store, g.fetchFn));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("지메일 로그인 실패");
    expect(r.error).toContain("invalid_grant");
    expect(r.error).not.toContain("rtoken-SECRET");
    expect(f.status(1)).toBe("ready");
    expect(f.status(2)).toBe("ready");
    expect(g.sends().length).toBe(0);
  });

  test("비밀값이 없으면 「지메일 연결 안 됨」, 아무것도 안 바꿈", async () => {
    const f = fakeStore([row(1)]);
    const g = fakeGoogle();
    const r = await sendSelected([uuid(1)], { ...deps(f.store, g.fetchFn), env: { GMAIL_CLIENT_ID: "x" } });
    expect(r.ok).toBe(false);
    expect(r.error).toBe(GMAIL_NOT_CONNECTED);
    expect(r.error).toContain("지메일 연결 안 됨");
    expect(f.status(1)).toBe("ready");
    expect(g.calls.length).toBe(0);
  });

  test("없는 id 는 무시", async () => {
    const f = fakeStore([row(1)]);
    const g = fakeGoogle();
    const r = await sendSelected([uuid(1), uuid(99)], deps(f.store, g.fetchFn));
    expect(r.sent).toBe(1);
  });
});

describe("건너뛰기·다시 시도·수신거부", () => {
  test("skip: ready 만 skipped", async () => {
    const f = fakeStore([row(1), row(2, { status: "sent" })]);
    expect(await skipSelected([uuid(1), uuid(2)], f.store)).toBe(1);
    expect(f.status(1)).toBe("skipped");
    expect(f.status(2)).toBe("sent");
  });

  test("retry: failed → ready(오류 지움), 수신거부 주소·다른 상태는 그대로", async () => {
    const f = fakeStore(
      [row(1, { status: "failed", error: "x" }), row(2, { status: "failed" }), row(3, { status: "sent" })],
      ["owner2@example.com"],
    );
    expect(await retrySelected([uuid(1), uuid(2), uuid(3)], f.store)).toBe(1);
    expect(f.status(1)).toBe("ready");
    expect(f.db.get(uuid(1))!.error).toBeNull();
    expect(f.status(2)).toBe("failed");
    expect(f.status(3)).toBe("sent");
  });

  test("수신거부: 주소를 막고 그 줄은 suppressed, 이후 보내기에서 빠짐", async () => {
    const f = fakeStore([row(1, { status: "sent" }), row(2)]);
    await unsubscribeById(uuid(1), f.store, () => undefined);
    expect(f.sup.has("owner1@example.com")).toBe(true);
    expect(f.status(1)).toBe("suppressed");
    // 대문자 id 도 같다
    await unsubscribeById(uuid(2).toUpperCase(), f.store, () => undefined);
    expect(f.status(2)).toBe("suppressed");
  });

  test("수신거부: 없는 id·형식 틀린 id 는 조용히 끝", async () => {
    const f = fakeStore([row(1)]);
    await unsubscribeById(uuid(42), f.store, () => undefined);
    await unsubscribeById("'; drop table x;--", f.store, () => undefined);
    await unsubscribeById(undefined, f.store, () => undefined);
    expect(f.sup.size).toBe(0);
    expect(f.status(1)).toBe("ready");
  });
});

describe("도우미", () => {
  test("cleanIds: uuid 만·중복 제거·빈 목록/이상한 값은 null", () => {
    expect(cleanIds([uuid(1), uuid(1).toUpperCase(), uuid(2)])).toEqual([uuid(1), uuid(2)]);
    expect(cleanIds([])).toBeNull();
    expect(cleanIds("x")).toBeNull();
    expect(cleanIds([uuid(1), "1); drop"])).toBeNull();
  });

  test("한국 날짜·날짜 검사", () => {
    expect(kstDate(new Date("2026-11-06T15:30:00Z"))).toBe("2026-11-07");
    expect(kstDate(new Date("2026-11-06T14:59:00Z"))).toBe("2026-11-06");
    expect(isYmd("2026-11-07")).toBe(true);
    expect(isYmd("2026-02-30")).toBe(false);
    expect(isYmd("2026-11-7")).toBe(false);
  });

  test("countByDay: 14일, 최신 먼저, 빈 날 0", () => {
    const d = countByDay(
      [
        { batch_date: "2026-11-07", status: "sent" },
        { batch_date: "2026-11-07", status: "ready" },
        { batch_date: "2026-11-06", status: "failed" },
        { batch_date: "2026-10-01", status: "sent" },
      ],
      "2026-11-07",
    );
    expect(d.length).toBe(14);
    expect(d[0].date).toBe("2026-11-07");
    expect(d[13].date).toBe("2026-10-25");
    expect(d[0].counts.sent).toBe(1);
    expect(d[0].counts.ready).toBe(1);
    expect(d[1].counts.failed).toBe(1);
    expect(d[2].counts).toEqual({ ready: 0, skipped: 0, sending: 0, sent: 0, failed: 0, suppressed: 0 });
  });
});
