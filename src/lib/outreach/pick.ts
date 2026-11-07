// 영업 메일 후보 매일 고르기 — 워커 예약 실행(크론 "15,45 * * * *")이 부르는 판단 한 곳.
// 노트북 C:/shortsmaker/outreach/daily/pick.py 를 옮긴 것. 규칙은 ./pick-rules.ts, 유튜브는 ./youtube.ts,
// DB 는 밖에서 받는다(실제 연결 ./pick-store.ts, 시험 tests/outreach-pick.test.ts 는 전부 가짜).
// 예약 실행 진입점: src/server/outreach-tasks/pick-task.ts. 고른 줄은 auto.ts(발송 크론)가 보낸다.
//
// 한 실행이 하는 일(조금씩 — 무료 요금제는 실행 하나에 외부 호출 50개 상한)
//   0) 한국 시간 05:00 ≤ 시각 < 19:30, outreach_settings.auto_pick = true, YOUTUBE_API_KEY 있음
//   1) 오늘(한국 날짜) batch_date 로 들어간 초안이 PER_DAY(10) 이상이면 끝. 🚨 지난 날 몫을 몰아 채우지 않는다.
//   2) 후보 풀(outreach_candidates)에서 status='new' 이고 email 있는 것을 「본업 점수 → 구독자」 순으로 꺼낸다.
//      - 있으면: 빼기 명단(초안 전체 email·channel_id·이름, 수신거부)으로 거르고, 앞에서부터 유튜브로 새로 확인
//        (channels.list 1회 + 채널마다 playlistItems 1 + videos 1) → 통과하면 outreach_drafts 에 바로 넣고 'drafted',
//        탈락이면 'rejected' + 사유. 오늘 모자란 수만큼만 확인한다.
//      - 없으면: 스크리너 검색 한 단계(니치 키워드 하나: search.list 1회 + channels.list 1회)만 하고
//        결과를 풀에 넣는다(이메일 없는 채널도 email=null 로 — 고르기 대상은 아님). 키워드는 진행 위치(pick_cursor)로 돈다.
//   3) 유튜브 단위는 outreach_quota(한국 날짜별)에 더한다. 하루 SEARCH_STOP_UNITS 를 넘기면 그날 검색 멈춤
//      (재확인용 RECHECK_RESERVE 를 남긴다). 재확인도 하루 QUOTA_DAILY 를 넘지 않는다.
//
// 🚨 한 실행의 외부 호출 수(Supabase + 유튜브) — 최대 MAX_CALLS_PER_RUN(45), 50 미만 보장:
//    설정 1 + 오늘 개수 1 + 쿼터 읽기 1 + 풀 1 [+ 검색 단계: search 1 + channels 1 + 풀 넣기 1 + 위치 저장 1 + 풀 다시 1]
//    + 초안 명단 1~3쪽 + 수신거부 1~2쪽 + channels 1 + 채널마다 2 × K + 끝내기 3(초안 넣기·풀 고치기·쿼터 더하기)
//    → K 는 남은 호출 수로 계산한다(최대 RECHECK_MAX_PER_RUN=15). 끝내기 3개는 늘 남겨 둔다.
// 🚨 로그에 이메일은 앞 3글자 + *** 만.
import { NICHES, type Niche } from "./niches";
import {
  Exclusions,
  channelUrl,
  cleanTitle,
  countryProblem,
  emailProblem,
  evaluateVideos,
  extractEmails,
  firstUsableEmail,
  maskEmail,
  nameProblem,
  normEmail,
  relevanceProblem,
  scoreBusiness,
  shortName,
  subsProblem,
  summarizeDescription,
} from "./pick-rules";
import { kstDate } from "./service";
import {
  BudgetStop,
  COST_CHANNELS,
  COST_PLAYLIST_ITEMS,
  COST_SEARCH,
  COST_VIDEOS,
  YouTubeQuotaExceeded,
  createYouTubeClient,
  type ChannelMeta,
  type Meter,
  type YtFetch,
} from "./youtube";

export const PER_DAY = 10;
/** 고르기 시간 창(한국 시간). 05:00 이상 19:30 미만 — 발송 창(07~20시) 안에 다 보낼 수 있게. */
export const PICK_START_MIN = 5 * 60;
export const PICK_END_MIN = 19 * 60 + 30;
/** 무료 요금제 실행당 외부 호출 50개 — 여유 5개를 둔 이 작업의 상한 */
export const MAX_CALLS_PER_RUN = 45;
/** 끝내기(초안 넣기·풀 고치기·쿼터 더하기)용으로 늘 남겨 두는 호출 수 */
export const TAIL_CALLS = 3;
/** 한 실행에서 유튜브로 다시 확인하는 최대 채널 수 */
export const RECHECK_MAX_PER_RUN = 15;
/** 풀에서 한 번에 꺼내는 수(빼기 명단·이름으로 거르는 건 호출이 안 든다) */
export const POOL_FETCH = 30;
export const PAGE_SIZE = 1000;
export const DRAFT_PAGES_MAX = 3;
export const SUPPRESSION_PAGES_MAX = 2;
/** 하루 유튜브 단위 상한(이 작업 몫). 구글 무료 한도는 10,000. */
export const QUOTA_DAILY = 3000;
/** 검색이 다 먹지 못하게 재확인 몫을 남긴다 */
export const RECHECK_RESERVE = 100;
/** 검색은 하루 사용량이 이 값을 넘게 되면 하지 않는다 */
export const SEARCH_STOP_UNITS = QUOTA_DAILY - RECHECK_RESERVE;

export type CandidateStatus = "new" | "checked_ok" | "rejected" | "drafted";

/** public.outreach_candidates 한 줄(created_at 빼고) */
export type CandidateRow = {
  channel_id: string;
  channel_name: string;
  channel_url: string;
  subscribers: number | null;
  country: string | null;
  niche: string | null;
  top_title: string | null;
  top_url: string | null;
  email: string | null;
  description_summary: string | null;
  business_score: number;
  status: CandidateStatus;
  reject_reason: string | null;
  checked_at: string | null;
};

/** public.outreach_drafts 에 넣는 열 — 노트북 pick.py build_row 와 같은 계약. 나머지 열은 기본값. */
export type DraftInsert = {
  batch_date: string;
  channel_id: string;
  channel_name: string;
  channel_url: string;
  subscribers: number;
  niche: string;
  top_title: string | null;
  top_url: string | null;
  email: string;
};

export type DraftKey = { email: string | null; channel_id: string | null; channel_name: string | null };

/** 고르기가 DB 에 하는 일. 메서드 하나 = 외부 호출 하나. 실패는 던진다. */
export interface PickStore {
  getPickSettings(): Promise<{ autoPick: boolean; cursor: number }>;
  countDraftsForDate(date: string): Promise<number>;
  getQuotaUnits(day: string): Promise<number>;
  /** 원자적으로 더하고 더한 뒤 값 */
  addQuotaUnits(day: string, units: number): Promise<number>;
  /** status='new' 이고 email 있는 것, 본업 점수 → 구독자 → 이름 순 */
  poolNew(limit: number): Promise<CandidateRow[]>;
  draftKeysPage(offset: number, limit: number): Promise<DraftKey[]>;
  suppressionPage(offset: number, limit: number): Promise<string[]>;
  /** insert … on conflict do nothing(email·channel_id 둘 다). 실제로 들어간 channel_id 들 */
  addDrafts(rows: DraftInsert[]): Promise<string[]>;
  /** 이미 있는 후보 고치기(channel_id 기준 upsert) */
  upsertCandidates(rows: CandidateRow[]): Promise<void>;
  /** 검색 결과 넣기 — 이미 있는 channel_id 는 그대로 둔다 */
  insertCandidates(rows: CandidateRow[]): Promise<number>;
  setCursor(n: number): Promise<void>;
}

export type PickDeps = {
  store: PickStore;
  youtubeKey?: string;
  fetchFn: YtFetch;
  now?: () => Date;
  log?: (msg: string) => void;
  perDay?: number;
  niches?: Niche[];
};

export type PickReason =
  | "outside_window"
  | "settings_error"
  | "auto_off"
  | "no_api_key"
  | "day_full"
  | "picked"
  | "searched"
  | "search_quota_stop"
  | "nothing"
  | "error";

export type PickResult = {
  reason: PickReason;
  date: string;
  /** 오늘 이미 있던 초안 수 */
  before: number;
  inserted: number;
  rejected: number;
  search?: { niche: string; keyword: string; found: number; added: number; withEmail: number };
  calls: number;
  units: number;
  quotaToday: number;
  error?: string;
};

/** 한국 시간 05:00 ≤ 시각 < 19:30 */
export function inPickWindow(d: Date): boolean {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const m = k.getUTCHours() * 60 + k.getUTCMinutes();
  return m >= PICK_START_MIN && m < PICK_END_MIN;
}

/** 니치를 번갈아 가며 키워드를 한 줄로(니치1 키워드1, 니치2 키워드1, … 니치1 키워드2 …). 이어서 검색해도 니치가 바뀐다. */
export function flatKeywords(niches: Niche[]): { niche: string; keyword: string }[] {
  const out: { niche: string; keyword: string }[] = [];
  const longest = Math.max(0, ...niches.map((n) => n.keywords.length));
  for (let i = 0; i < longest; i++) {
    for (const n of niches) if (i < n.keywords.length) out.push({ niche: n.name, keyword: n.keywords[i] });
  }
  return out;
}

/** 진행 위치(pick_cursor) → 이번에 검색할 키워드. 위치는 날을 넘어 이어진다(어제 멈춘 다음 키워드부터). */
export function keywordAt(niches: Niche[], cursor: number): { niche: string; keyword: string } | null {
  const flat = flatKeywords(niches);
  if (!flat.length) return null;
  const c = Number.isFinite(cursor) ? Math.trunc(cursor) : 0;
  return flat[((c % flat.length) + flat.length) % flat.length];
}

/** 유튜브 단위 + 외부 호출 수를 세는 계량기. reserve 만큼은 끝내기용으로 남긴다. */
export class RunMeter implements Meter {
  calls = 0;
  units = 0;
  reserve = TAIL_CALLS;
  /** 이번 실행에서 더 쓸 수 있는 유튜브 단위 */
  unitCap = Number.POSITIVE_INFINITY;
  constructor(readonly maxCalls = MAX_CALLS_PER_RUN) {}
  check(cost: number): string {
    if (this.calls + 1 + this.reserve > this.maxCalls) return `호출 한도(${this.maxCalls})`;
    if (cost > 0 && this.units + cost > this.unitCap) return `하루 유튜브 쿼터(${QUOTA_DAILY})`;
    return "";
  }
  /** n번 더 불러도(끝내기 몫 빼고) 되는가 */
  canAfford(n: number, units = 0): boolean {
    return this.calls + n + this.reserve <= this.maxCalls && this.units + units <= this.unitCap;
  }
}

function shortError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.replace(/\s+/g, " ").slice(0, 200) || "알 수 없는 오류";
}

function rejectRow(c: CandidateRow, reason: string, at: string): CandidateRow {
  return { ...c, status: "rejected", reject_reason: reason.slice(0, 200), checked_at: at };
}

function rfc3339(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** 검색 결과 채널 하나 → 풀 한 줄. 국가·문자·장르·구독자·이름이 안 맞으면 rejected 로 넣어 다시 안 본다. */
export function candidateFromMeta(m: ChannelMeta, niche: string): CandidateRow {
  const why =
    relevanceProblem(m) ||
    subsProblem(m.subscribers, m.hiddenSubs) ||
    nameProblem(m.title) ||
    (m.uploadsPlaylist ? "" : "업로드 목록 없음");
  const { email } = firstUsableEmail(extractEmails(m.description).map(normEmail));
  return {
    channel_id: m.id,
    channel_name: m.title || m.id,
    channel_url: channelUrl(m.id, m.customUrl),
    subscribers: m.subscribers,
    country: m.country || null,
    niche,
    top_title: null,
    top_url: null,
    email: email || null,
    description_summary: summarizeDescription(m.description) || null,
    business_score: scoreBusiness(m.title, m.description).score,
    status: why ? "rejected" : "new",
    reject_reason: why || null,
    checked_at: null,
  };
}

/** 예약 실행 한 번. 예외를 밖으로 던지지 않는다. */
export async function runPick(deps: PickDeps): Promise<PickResult> {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((m: string) => console.log(m));
  const perDay = deps.perDay ?? PER_DAY;
  const niches = deps.niches ?? NICHES;
  const at = now();
  const atIso = at.toISOString();
  const date = kstDate(at);
  const meter = new RunMeter();
  const res: PickResult = { reason: "nothing", date, before: 0, inserted: 0, rejected: 0, calls: 0, units: 0, quotaToday: 0 };
  const done = (r: Partial<PickResult>): PickResult => ({ ...res, ...r, calls: meter.calls, units: meter.units });

  /** Supabase 호출 하나. tail=true 면 끝내기 몫을 쓴다. */
  async function db<T>(fn: () => Promise<T>, tail = false): Promise<T> {
    if (!tail && meter.check(0)) throw new BudgetStop(meter.check(0));
    if (tail && meter.calls + 1 > meter.maxCalls) throw new BudgetStop(`호출 한도(${meter.maxCalls})`);
    meter.calls += 1;
    return fn();
  }

  if (!inPickWindow(at)) return done({ reason: "outside_window" });

  let settings: { autoPick: boolean; cursor: number };
  try {
    settings = await db(() => deps.store.getPickSettings());
  } catch (e) {
    log(`[outreach:pick] 설정 읽기 실패 — 안 고름: ${shortError(e)}`);
    return done({ reason: "settings_error", error: shortError(e) });
  }
  if (!settings.autoPick) return done({ reason: "auto_off" });
  if (!deps.youtubeKey) {
    log("[outreach:pick] YOUTUBE_API_KEY 가 없습니다(워커 비밀값) — 안 고름");
    return done({ reason: "no_api_key" });
  }

  let usedToday = 0;
  let quotaHit = false;
  const updates: CandidateRow[] = [];
  const drafts: DraftInsert[] = [];
  let reason: PickReason = "nothing";
  let error: string | undefined;

  try {
    const before = await db(() => deps.store.countDraftsForDate(date));
    res.before = before;
    if (before >= perDay) return done({ reason: "day_full" });
    const need = perDay - before;
    usedToday = await db(() => deps.store.getQuotaUnits(date));
    res.quotaToday = usedToday;
    meter.unitCap = Math.max(0, QUOTA_DAILY - usedToday);
    const yt = createYouTubeClient(deps.youtubeKey, deps.fetchFn, meter);

    let pool = await db(() => deps.store.poolNew(POOL_FETCH));

    // ── 풀이 비었다 → 검색 한 단계 ──
    if (!pool.length) {
      if (usedToday + COST_SEARCH + COST_CHANNELS > SEARCH_STOP_UNITS) {
        log(`[outreach:pick] 오늘 유튜브 ${usedToday}단위 — 검색 멈춤(상한 ${SEARCH_STOP_UNITS})`);
        return done({ reason: "search_quota_stop" });
      }
      const kw = keywordAt(niches, settings.cursor);
      if (!kw) return done({ reason: "nothing", error: "니치 키워드가 없습니다" });
      try {
        const publishedAfter = rfc3339(new Date(at.getTime() - 90 * 86400 * 1000));
        const ids = await yt.searchChannelIds(kw.keyword, publishedAfter);
        const metas = ids.length ? await yt.fetchChannels(ids) : new Map<string, ChannelMeta>();
        const rows = ids.flatMap((id) => {
          const m = metas.get(id);
          return m ? [candidateFromMeta(m, kw.niche)] : [];
        });
        const added = rows.length ? await db(() => deps.store.insertCandidates(rows)) : 0;
        const withEmail = rows.filter((r) => r.status === "new" && r.email).length;
        res.search = { niche: kw.niche, keyword: kw.keyword, found: ids.length, added, withEmail };
        reason = "searched";
        log(`[outreach:pick] 검색 '${kw.keyword}'(${kw.niche}): 채널 ${ids.length} · 새로 넣음 ${added} · 이메일 있는 후보 ${withEmail}`);
      } finally {
        // 실패해도 다음 키워드로 넘어간다(같은 키워드에서 계속 막히지 않게)
        await db(() => deps.store.setCursor(settings.cursor + 1)).catch((e) =>
          log(`[outreach:pick] 진행 위치 저장 실패: ${shortError(e)}`),
        );
      }
      if (meter.canAfford(1 + 1 + 1 + 1 + 2)) pool = await db(() => deps.store.poolNew(POOL_FETCH));
    }

    // ── 풀에서 고르기 ──
    if (pool.length && meter.canAfford(1 + 1 + 1 + 2)) {
      const ex = new Exclusions();
      for (let p = 0; p < DRAFT_PAGES_MAX; p++) {
        const rows = await db(() => deps.store.draftKeysPage(p * PAGE_SIZE, PAGE_SIZE));
        for (const r of rows) ex.addDraft(r);
        if (rows.length < PAGE_SIZE) break;
      }
      for (let p = 0; p < SUPPRESSION_PAGES_MAX; p++) {
        const rows = await db(() => deps.store.suppressionPage(p * PAGE_SIZE, PAGE_SIZE));
        for (const e of rows) if (normEmail(e)) ex.emails.add(normEmail(e));
        if (rows.length < PAGE_SIZE) break;
      }

      // 호출 없이 거를 수 있는 것(명단·이름·이메일)
      const survivors: CandidateRow[] = [];
      for (const c of pool) {
        const email = normEmail(c.email);
        const why = ex.reason(c.channel_id, c.channel_name, email ? [email] : []) || nameProblem(c.channel_name) || emailProblem(email);
        if (why) updates.push(rejectRow(c, why, atIso));
        else survivors.push({ ...c, email });
      }

      // 남은 호출로 확인할 수 있는 채널 수: channels 1 + 채널마다 2
      const room = Math.floor((meter.maxCalls - meter.calls - meter.reserve - COST_CHANNELS) / 2);
      const k = Math.max(0, Math.min(RECHECK_MAX_PER_RUN, survivors.length, room));
      const batch = survivors.slice(0, k);
      if (batch.length) {
        const metas = await yt.fetchChannels(batch.map((c) => c.channel_id));
        type Entry = { c: CandidateRow; m: ChannelMeta; title: string; biz: number };
        const entries: Entry[] = [];
        for (const c of batch) {
          const m = metas.get(c.channel_id);
          if (!m) {
            updates.push(rejectRow(c, "채널을 찾지 못함(삭제·비공개)", atIso));
            continue;
          }
          const title = m.title || c.channel_name;
          const why =
            countryProblem(m.country) ||
            subsProblem(m.subscribers, m.hiddenSubs) ||
            nameProblem(title) ||
            ex.reason(c.channel_id, title, [c.email as string]);
          const refreshed: CandidateRow = {
            ...c,
            channel_name: title,
            channel_url: channelUrl(m.id, m.customUrl),
            subscribers: m.subscribers,
            country: m.country || null,
            description_summary: summarizeDescription(m.description) || c.description_summary,
            business_score: scoreBusiness(title, m.description).score,
          };
          if (why) {
            updates.push(rejectRow(refreshed, why, atIso));
            continue;
          }
          entries.push({ c: refreshed, m, title, biz: refreshed.business_score });
        }
        // 본업 신호가 앞, 그다음 구독자 수. 동점은 채널명으로 고정.
        entries.sort((a, b) => b.biz - a.biz || b.m.subscribers - a.m.subscribers || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));

        const taken = new Set<string>();
        for (const e of entries) {
          if (drafts.length >= need) break;
          const email = e.c.email as string;
          if (taken.has(email)) continue;
          if (!e.m.uploadsPlaylist) {
            updates.push(rejectRow(e.c, "업로드 목록 없음", atIso));
            continue;
          }
          if (!meter.canAfford(2, COST_PLAYLIST_ITEMS + COST_VIDEOS)) {
            log(`[outreach:pick] 이번 실행 한도(호출 ${meter.calls}/${meter.maxCalls}·단위 ${meter.units}) — 나머지는 다음 실행`);
            break;
          }
          const vids = await yt.recentVideoIds(e.m.uploadsPlaylist);
          if (!vids.length) {
            updates.push(rejectRow(e.c, "최근 영상 없음", atIso));
            continue;
          }
          const v = evaluateVideos(await yt.fetchVideos(vids), at);
          if (!v.ok) {
            updates.push(rejectRow(e.c, v.reason, atIso));
            continue;
          }
          const row: DraftInsert = {
            batch_date: date,
            channel_id: e.m.id,
            channel_name: shortName(e.title) || e.title,
            channel_url: channelUrl(e.m.id, e.m.customUrl),
            subscribers: Math.trunc(e.m.subscribers),
            niche: e.c.niche || "",
            top_title: cleanTitle(v.topTitle || e.c.top_title) || null,
            top_url: v.topUrl || e.c.top_url || null,
            email,
          };
          drafts.push(row);
          taken.add(email);
          updates.push({ ...e.c, top_title: v.topTitle || e.c.top_title, top_url: row.top_url, status: "drafted", reject_reason: null, checked_at: atIso });
          log(`[outreach:pick] + ${row.channel_name} | 구독 ${row.subscribers} | ${maskEmail(email)} | 본업 ${e.biz}`);
        }
      }
      reason = drafts.length ? "picked" : reason === "searched" ? "searched" : "nothing";
    }
  } catch (e) {
    if (e instanceof YouTubeQuotaExceeded) quotaHit = true;
    if (!(e instanceof BudgetStop)) {
      error = shortError(e);
      reason = "error";
      log(`[outreach:pick] 오류: ${error}`);
    }
  }

  // ── 끝내기: 초안 넣기 → 풀 고치기 → 쿼터 더하기(끝내기 몫 3개) ──
  meter.reserve = 0;
  try {
    if (drafts.length) {
      const ins = new Set(await db(() => deps.store.addDrafts(drafts), true));
      res.inserted = ins.size;
      for (const u of updates) {
        if (u.status === "drafted" && !ins.has(u.channel_id)) {
          u.status = "rejected";
          u.reject_reason = "이미 초안에 있는 주소·채널";
        }
      }
    }
  } catch (e) {
    error = error ?? shortError(e);
    reason = "error";
    log(`[outreach:pick] 초안 넣기 실패: ${shortError(e)}`);
    // 못 넣었으면 다음 실행이 다시 보게 'drafted' 표시를 하지 않는다
    for (let i = updates.length - 1; i >= 0; i--) if (updates[i].status === "drafted") updates.splice(i, 1);
  }
  res.rejected = updates.filter((u) => u.status === "rejected").length;
  try {
    if (updates.length) await db(() => deps.store.upsertCandidates(updates), true);
  } catch (e) {
    error = error ?? shortError(e);
    log(`[outreach:pick] 후보 풀 고치기 실패: ${shortError(e)}`);
  }
  const add = quotaHit ? Math.max(meter.units, QUOTA_DAILY - usedToday) : meter.units;
  if (add > 0) {
    try {
      res.quotaToday = await db(() => deps.store.addQuotaUnits(date, add), true);
    } catch (e) {
      log(`[outreach:pick] 쿼터 기록 실패: ${shortError(e)}`);
      res.quotaToday = usedToday + add;
    }
  }
  if (quotaHit) log("[outreach:pick] 구글이 쿼터 초과를 돌려줬습니다 — 오늘은 그만");
  log(`[outreach:pick] ${date} 넣음 ${res.inserted} · 뺌 ${res.rejected} · 호출 ${meter.calls} · 유튜브 ${meter.units}단위(오늘 ${res.quotaToday})`);
  return done({ reason, error });
}
