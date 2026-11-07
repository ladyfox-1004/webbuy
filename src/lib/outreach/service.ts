// 영업 메일 보내기·건너뛰기·다시 시도·수신거부 — 상태 전이 판단을 한 곳에.
// DB 와 지메일은 밖에서 받는다(시험: tests/outreach-service.test.ts 는 가짜 store·fetch 를 쓴다).
// 실제 Supabase 연결은 ./store.ts.
//
// 상태: ready → sending → sent | failed,  ready → skipped,  아무 상태 → suppressed,  failed → ready(다시 시도)
// 🚨 보내기 전에 반드시 ready → sending 으로 「조건부」 바꾸고(update … where status='ready' returning),
//    돌려받은 줄에만 보낸다. 그래야 단추를 두 번 눌러도(또는 두 휴대폰에서 동시에) 한 통만 나간다.
// 🚨 수신거부(outreach_suppression) 주소는 무슨 일이 있어도 보내지 않는다.
// 🚨 로그에는 이메일 앞 3글자만(maskEmail).
import { buildRawMessage, maskEmail, renderOutreachMail } from "./mail";
import { GMAIL_NOT_CONNECTED, gmailAccessToken, gmailConnected, gmailSendRaw, type FetchFn, type GmailCreds } from "./gmail";

export const OUTREACH_STATUSES = ["ready", "skipped", "sending", "sent", "failed", "suppressed"] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

/** 한 번에 보내는 최대 통수 */
export const MAX_SEND_PER_REQUEST = 20;
/** 한 통 보내고 다음 통까지 쉬는 시간(ms) */
export const SEND_GAP_MS = 1500;

export type DraftRow = {
  id: string;
  batch_date: string;
  channel_id: string;
  channel_name: string;
  channel_url: string;
  subscribers: number | null;
  niche: string | null;
  top_title: string | null;
  top_url: string | null;
  email: string;
  status: OutreachStatus;
  gmail_message_id: string | null;
  error: string | null;
  created_at: string;
  approved_at: string | null;
  sent_at: string | null;
};

/** DB 가 해 줘야 하는 일. 모든 상태 바꾸기는 「지금 상태가 from 인 줄만」 바꾸고 바뀐 줄을 돌려준다. */
export interface OutreachStore {
  getByIds(ids: string[]): Promise<DraftRow[]>;
  getById(id: string): Promise<DraftRow | null>;
  suppressedAmong(emails: string[]): Promise<Set<string>>;
  addSuppression(email: string, reason: string): Promise<void>;
  /** where id in ids and status in from → set patch, returning 바뀐 줄 */
  transition(
    ids: string[],
    from: OutreachStatus[],
    patch: Partial<Pick<DraftRow, "status" | "approved_at" | "error" | "gmail_message_id" | "sent_at">>,
  ): Promise<DraftRow[]>;
  /** 그날 묶음 중 keepIds 밖의 ready 줄을 skipped 로. 바뀐 개수 */
  skipRestOfBatch(batchDates: string[], keepIds: string[]): Promise<number>;
  markSent(id: string, gmailMessageId: string, sentAt: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}

export type SendDeps = {
  store: OutreachStore;
  env: GmailCreds;
  fetchFn?: FetchFn;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  log?: (msg: string) => void;
  /** 이번에 보낼 최대 통수(기본 MAX_SEND_PER_REQUEST). 넘는 줄은 ready 그대로 남는다(deferred). */
  maxPerRun?: number;
};

export type SendItem = { id: string; status: OutreachStatus | "not_ready"; error?: string };
export type SendResult = {
  ok: boolean;
  error?: string;
  sent: number;
  failed: number;
  suppressed: number;
  /** 이미 보내는 중이거나 ready 가 아니라서 손대지 않은 줄 */
  notReady: number;
  /** 20통 상한을 넘어서 이번에 안 보낸(ready 그대로) 줄 */
  deferred: number;
  skipped: number;
  items: SendItem[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** 요청 ids 정리: uuid 만, 소문자, 중복 제거, 순서 유지. 이상한 값이 섞이면 null. */
export function cleanIds(v: unknown, max = 200): string[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > max) return null;
  const out: string[] = [];
  for (const x of v) {
    if (!isUuid(x)) return null;
    const id = x.toLowerCase();
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** 한국 날짜 YYYY-MM-DD */
export function kstDate(d: Date = new Date()): string {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** YYYY-MM-DD 에서 n 일 뺀 날짜 */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function isYmd(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function shortError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/\s+/g, " ").slice(0, 300) || "알 수 없는 오류";
}

/**
 * 고른 줄 보내기.
 * 1) ids 중 그날 묶음 날짜를 알아 둔다  2) 수신거부 주소는 suppressed 로(보내지 않음)
 * 3) 지메일 로그인(실패하면 아무 상태도 바꾸지 않고 끝)  4) 앞 20개를 ready→sending 으로 조건부 변경
 * 5) 그날 묶음에서 ids 에 없는 ready 는 skipped  6) 한 통씩 보내고 사이 1.5초 쉼 → sent / failed
 */
export async function sendSelected(rawIds: string[], deps: SendDeps): Promise<SendResult> {
  const { store, env } = deps;
  const fetchFn = deps.fetchFn ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((m: string) => console.log(m));
  const result: SendResult = {
    ok: true,
    sent: 0,
    failed: 0,
    suppressed: 0,
    notReady: 0,
    deferred: 0,
    skipped: 0,
    items: [],
  };

  if (!gmailConnected(env)) return { ...result, ok: false, error: GMAIL_NOT_CONNECTED };

  const rows = await store.getByIds(rawIds);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ids = rawIds.filter((id) => byId.has(id));
  const batchDates = [...new Set(rows.map((r) => r.batch_date))];

  // 2) 수신거부
  const blocked = await store.suppressedAmong([...new Set(rows.map((r) => r.email))]);
  const blockedIds = ids.filter((id) => blocked.has(byId.get(id)!.email));
  if (blockedIds.length) {
    const changed = await store.transition(blockedIds, ["ready", "failed", "skipped"], { status: "suppressed" });
    result.suppressed = changed.length;
    for (const id of blockedIds) result.items.push({ id, status: "suppressed" });
  }

  const candidates = ids.filter((id) => !blocked.has(byId.get(id)!.email) && byId.get(id)!.status === "ready");
  const notReadyIds = ids.filter((id) => !blocked.has(byId.get(id)!.email) && byId.get(id)!.status !== "ready");
  const thisRound = candidates.slice(0, Math.max(0, Math.min(deps.maxPerRun ?? MAX_SEND_PER_REQUEST, MAX_SEND_PER_REQUEST)));
  result.deferred = candidates.length - thisRound.length;

  // 3) 지메일 로그인 — 실패하면 아무 줄도 sending 으로 만들지 않는다
  let accessToken = "";
  if (thisRound.length) {
    try {
      accessToken = await gmailAccessToken(env, fetchFn);
    } catch (e) {
      return { ...result, ok: false, error: shortError(e) };
    }
  }

  // 4) 조건부로 sending — 돌려받은 줄에만 보낸다(중복 클릭 방어)
  const claimed = thisRound.length
    ? await store.transition(thisRound, ["ready"], { status: "sending", approved_at: now().toISOString() })
    : [];
  const claimedIds = new Set(claimed.map((r) => r.id));
  for (const id of [...thisRound.filter((x) => !claimedIds.has(x)), ...notReadyIds]) {
    result.notReady++;
    result.items.push({ id, status: "not_ready" });
  }

  // 5) 그날 묶음에서 고르지 않은 ready 는 건너뜀
  if (batchDates.length) result.skipped = await store.skipRestOfBatch(batchDates, rawIds);

  // 6) 한 통씩
  const queue = thisRound.filter((id) => claimedIds.has(id));
  for (let i = 0; i < queue.length; i++) {
    const row = claimed.find((r) => r.id === queue[i])!;
    if (i > 0) await sleep(SEND_GAP_MS);
    try {
      const raw = buildRawMessage(renderOutreachMail(row));
      const msgId = await gmailSendRaw(raw, accessToken, fetchFn);
      await store.markSent(row.id, msgId, now().toISOString());
      result.sent++;
      result.items.push({ id: row.id, status: "sent" });
      log(`[outreach] 보냄 ${maskEmail(row.email)}`);
    } catch (e) {
      const err = shortError(e);
      try {
        await store.markFailed(row.id, err);
      } catch {
        // 기록 실패 — sending 으로 남는다(관리 화면에 그대로 보인다)
      }
      result.failed++;
      result.items.push({ id: row.id, status: "failed", error: err });
      log(`[outreach] 실패 ${maskEmail(row.email)}: ${err}`);
    }
  }
  return result;
}

/** 건너뛰기: ready → skipped. 바뀐 개수 */
export async function skipSelected(ids: string[], store: OutreachStore): Promise<number> {
  return (await store.transition(ids, ["ready"], { status: "skipped" })).length;
}

/** 다시 시도: failed → ready(오류 글 지움). 수신거부 주소는 다시 시도하지 않는다. 바뀐 개수 */
export async function retrySelected(ids: string[], store: OutreachStore): Promise<number> {
  const rows = await store.getByIds(ids);
  const blocked = await store.suppressedAmong([...new Set(rows.map((r) => r.email))]);
  const ok = rows.filter((r) => r.status === "failed" && !blocked.has(r.email)).map((r) => r.id);
  if (!ok.length) return 0;
  return (await store.transition(ok, ["failed"], { status: "ready", error: null })).length;
}

/**
 * 수신거부: 그 id 의 주소를 outreach_suppression 에 넣고 그 줄을 suppressed 로.
 * 없는 id·형식 틀린 id 도 조용히 끝낸다(존재 여부를 밖에 알리지 않는다).
 */
export async function unsubscribeById(id: unknown, store: OutreachStore, log: (m: string) => void = console.log) {
  if (!isUuid(id)) return;
  const row = await store.getById(id.toLowerCase());
  if (!row) return;
  await store.addSuppression(row.email, "unsubscribe");
  await store.transition([row.id], ["ready", "skipped", "sending", "sent", "failed"], { status: "suppressed" });
  log(`[outreach] 수신거부 ${maskEmail(row.email)}`);
}

export type DayCounts = Record<OutreachStatus, number>;

export function emptyCounts(): DayCounts {
  return { ready: 0, skipped: 0, sending: 0, sent: 0, failed: 0, suppressed: 0 };
}

/** 최근 n 일(오늘 포함) 날짜별 상태 개수. 최신 날짜 먼저, 빈 날도 0 으로. */
export function countByDay(
  rows: { batch_date: string; status: string }[],
  today: string,
  days = 14,
): { date: string; counts: DayCounts }[] {
  const out = Array.from({ length: days }, (_, i) => ({ date: addDays(today, -i), counts: emptyCounts() }));
  const idx = new Map(out.map((d, i) => [d.date, i]));
  for (const r of rows) {
    const i = idx.get(r.batch_date);
    if (i === undefined) continue;
    if ((OUTREACH_STATUSES as readonly string[]).includes(r.status)) out[i].counts[r.status as OutreachStatus]++;
  }
  return out;
}
