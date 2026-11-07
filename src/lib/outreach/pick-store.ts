// 영업 메일 후보 고르기 DB 연결(Supabase service_role). 판단은 ./pick.ts, 여기서는 읽고 쓰기만.
// 표: public.outreach_candidates(후보 풀)·outreach_quota(하루 유튜브 단위)·outreach_settings(auto_pick·pick_cursor)
//     — 마이그레이션 20261107140000_outreach_candidates.sql
// 함수: outreach_add_drafts(초안 넣기, on conflict do nothing — email·channel_id 둘 다)·outreach_quota_add(원자적 더하기)
// 🚨 service_role 전용(RLS 켬·정책 없음). 브라우저에서 import 하지 마라.
// 🚨 메서드 하나 = 외부 호출 하나(pick.ts 가 호출 수를 센다). 호출을 늘리지 마라.
import type { Json } from "../../integrations/supabase/types";
import type { ServiceDb } from "../notify/token-store";
import type { CandidateRow, CandidateStatus, DraftKey, PickStore } from "./pick";
import { kstDate } from "./service";

export const CANDIDATE_COLS =
  "channel_id, channel_name, channel_url, subscribers, country, niche, top_title, top_url, email, description_summary, business_score, status, reject_reason, checked_at";

function fail(what: string, error: { code?: string | null } | null): never {
  throw new Error(`${what} 실패 [${error?.code ?? "?"}]`);
}

type RawCandidate = Omit<CandidateRow, "status"> & { status: string };

export function supabasePickStore(db: ServiceDb): PickStore {
  return {
    async getPickSettings() {
      const { data, error } = await db.from("outreach_settings").select("auto_pick, pick_cursor").eq("id", 1).maybeSingle();
      if (error) fail("자동 고르기 설정 읽기", error);
      return { autoPick: data ? data.auto_pick === true : true, cursor: data?.pick_cursor ?? 0 };
    },
    async countDraftsForDate(date) {
      const { count, error } = await db
        .from("outreach_drafts")
        .select("id", { count: "exact", head: true })
        .eq("batch_date", date);
      if (error) fail("오늘 후보 수 세기", error);
      return count ?? 0;
    },
    async getQuotaUnits(day) {
      const { data, error } = await db.from("outreach_quota").select("units").eq("day", day).maybeSingle();
      if (error) fail("유튜브 쿼터 읽기", error);
      return data?.units ?? 0;
    },
    async addQuotaUnits(day, units) {
      const { data, error } = await db.rpc("outreach_quota_add", { p_day: day, p_units: Math.max(0, Math.trunc(units)) });
      if (error) fail("유튜브 쿼터 기록", error);
      return typeof data === "number" ? data : 0;
    },
    async poolNew(limit) {
      const { data, error } = await db
        .from("outreach_candidates")
        .select(CANDIDATE_COLS)
        .eq("status", "new")
        .not("email", "is", null)
        .order("business_score", { ascending: false })
        .order("subscribers", { ascending: false, nullsFirst: false })
        .order("channel_name", { ascending: true })
        .limit(limit);
      if (error) fail("후보 풀 읽기", error);
      return ((data ?? []) as RawCandidate[]).map((r) => ({ ...r, status: r.status as CandidateStatus }));
    },
    async draftKeysPage(offset, limit) {
      const { data, error } = await db
        .from("outreach_drafts")
        .select("email, channel_id, channel_name")
        .order("created_at", { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) fail("보낸·준비된 명단 읽기", error);
      return (data ?? []) as DraftKey[];
    },
    async suppressionPage(offset, limit) {
      const { data, error } = await db
        .from("outreach_suppression")
        .select("email")
        .order("email", { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) fail("수신거부 명단 읽기", error);
      return (data ?? []).map((r) => r.email);
    },
    async addDrafts(rows) {
      if (!rows.length) return [];
      const { data, error } = await db.rpc("outreach_add_drafts", { p_rows: rows as unknown as Json });
      if (error) fail("초안 넣기", error);
      return (data ?? []).map((r) => r.channel_id);
    },
    async upsertCandidates(rows) {
      if (!rows.length) return;
      const { error } = await db.from("outreach_candidates").upsert(rows, { onConflict: "channel_id" });
      if (error) fail("후보 풀 고치기", error);
    },
    async insertCandidates(rows) {
      if (!rows.length) return 0;
      const { data, error } = await db
        .from("outreach_candidates")
        .upsert(rows, { onConflict: "channel_id", ignoreDuplicates: true })
        .select("channel_id");
      if (error) fail("후보 풀 넣기", error);
      return (data ?? []).length;
    },
    async setCursor(n) {
      const { error } = await db
        .from("outreach_settings")
        .update({ pick_cursor: Math.max(0, Math.trunc(n)) % 1_000_000 })
        .eq("id", 1);
      if (error) fail("검색 진행 위치 저장", error);
    },
  };
}

// ───────── 관리자 화면(/admin/outreach)용 ─────────

/** 자동 고르기 켜짐 여부. 행이 없으면 true. 읽기 실패는 던진다. */
export async function readAutoPick(db: ServiceDb): Promise<boolean> {
  const { data, error } = await db.from("outreach_settings").select("auto_pick").eq("id", 1).maybeSingle();
  if (error) fail("자동 고르기 설정 읽기", error);
  return data ? data.auto_pick === true : true;
}

export async function writeAutoPick(db: ServiceDb, on: boolean, now: Date = new Date()): Promise<boolean> {
  const { data, error } = await db
    .from("outreach_settings")
    .update({ auto_pick: on, updated_at: now.toISOString() })
    .eq("id", 1)
    .select("auto_pick")
    .single();
  if (error) fail("자동 고르기 설정 저장", error);
  return data.auto_pick === true;
}

/** 화면 한 줄: 이메일 있는 미확인 후보 수 · 오늘 유튜브 단위 */
export async function readPickStats(db: ServiceDb, now: Date = new Date()): Promise<{ poolNew: number; quotaToday: number }> {
  const [pool, quota] = await Promise.all([
    db
      .from("outreach_candidates")
      .select("channel_id", { count: "exact", head: true })
      .eq("status", "new")
      .not("email", "is", null),
    db.from("outreach_quota").select("units").eq("day", kstDate(now)).maybeSingle(),
  ]);
  if (pool.error) fail("후보 풀 세기", pool.error);
  if (quota.error) fail("유튜브 쿼터 읽기", quota.error);
  return { poolNew: pool.count ?? 0, quotaToday: quota.data?.units ?? 0 };
}
