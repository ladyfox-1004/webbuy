// 블로그 자동화 작업: 수집·AI 초안(collect), 예약 발행(publish).
// 예약 실행(src/server/blog-tasks/*)과 관리자 수동 실행(/api/admin/blog/run)이 같은 함수를 부른다.
// 🚨 어떤 경우에도 예외를 밖으로 던지지 않는다. 결과 객체에 오류를 담아 돌려주고 로그를 남긴다.
//    (예약 실행에서 던지면 Cloudflare 로그에 스택만 남고, 수동 실행에서는 500 이 된다.)

import { dedupeSlug, slugify, youtubeWatchUrl } from "../blog";
import {
  createServiceClient,
  dailyLimit,
  geminiModel,
  type AutomationEnv,
  type ServiceClient,
} from "./env";
import { GeminiQuotaError, generateDraft } from "./gemini";
import { fetchPlaylistVideoIds, fetchVideoMeta } from "./youtube";

const MAX_ATTEMPTS = 3;
const LOG = "[blog-automation]";

export type CollectResult = {
  job: "collect";
  skipped?: string;
  playlistFound: number;
  newSources: number;
  processed: { videoId: string; slug: string; status: "review" | "note" }[];
  failed: { videoId: string; error: string; attempts: number; gaveUp: boolean }[];
  quotaStopped: boolean;
  pendingLeft: number | null;
  errors: string[];
};

export type PublishResult = {
  job: "publish";
  skipped?: string;
  published: { id: string; slug: string; title: string } | null;
  errors: string[];
};

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ───────────────────────── 수집 + AI 초안 ─────────────────────────

export async function runCollectJob(env: AutomationEnv): Promise<CollectResult> {
  const result: CollectResult = {
    job: "collect",
    playlistFound: 0,
    newSources: 0,
    processed: [],
    failed: [],
    quotaStopped: false,
    pendingLeft: null,
    errors: [],
  };
  try {
    const db = createServiceClient(env);
    if (!db) {
      result.skipped = "키 없음(SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY)";
      console.error(`${LOG} collect: ${result.skipped} — 건너뜀`);
      return result;
    }

    await collectPlaylist(db, env, result);

    if (!env.GEMINI_API_KEY) {
      result.skipped = "키 없음(GEMINI_API_KEY) — 수집만 하고 초안은 건너뜀";
      console.error(`${LOG} collect: ${result.skipped}`);
    } else {
      await draftPending(db, env, result);
    }

    const { count } = await db
      .from("blog_sources")
      .select("video_id", { count: "exact", head: true })
      .eq("status", "pending");
    result.pendingLeft = count ?? null;
  } catch (e) {
    result.errors.push(errMsg(e));
    console.error(`${LOG} collect 예외`, e);
  }
  console.log(`${LOG} collect 결과 ${JSON.stringify(result)}`);
  return result;
}

/** 재생목록에서 새 영상만 blog_sources(pending)에 넣는다. 실패해도 기존 데이터는 건드리지 않는다. */
async function collectPlaylist(db: ServiceClient, env: AutomationEnv, result: CollectResult) {
  const playlistId = env.BLOG_PLAYLIST_ID;
  if (!playlistId) {
    result.errors.push("BLOG_PLAYLIST_ID 없음 — 재생목록 수집 건너뜀");
    return;
  }
  let ids: string[];
  try {
    ids = await fetchPlaylistVideoIds(playlistId);
  } catch (e) {
    result.errors.push(`재생목록 읽기 실패: ${errMsg(e)}`);
    return;
  }
  result.playlistFound = ids.length;
  if (ids.length === 0) {
    // 유튜브 화면 형식이 바뀌었거나 차단된 경우. 기존 대기열은 그대로 두고 오류만 남긴다.
    result.errors.push("재생목록에서 영상을 하나도 찾지 못함(페이지 형식 변경·차단 의심)");
    return;
  }

  const { data: existing, error } = await db
    .from("blog_sources")
    .select("video_id")
    .in("video_id", ids);
  if (error) {
    result.errors.push(`blog_sources 조회 실패: ${error.message}`);
    return;
  }
  const known = new Set((existing ?? []).map((r) => r.video_id));
  const fresh = ids.filter((id) => !known.has(id));
  if (fresh.length === 0) return;

  const rows = await Promise.all(
    fresh.map(async (video_id) => ({
      video_id,
      title: (await fetchVideoMeta(video_id)).title,
      status: "pending",
    })),
  );
  const { error: upErr } = await db
    .from("blog_sources")
    .upsert(rows, { onConflict: "video_id", ignoreDuplicates: true });
  if (upErr) {
    result.errors.push(`blog_sources 등록 실패: ${upErr.message}`);
    return;
  }
  result.newSources = rows.length;
}

/** pending 중 오래된 순으로 하루 한도만큼 Gemini 초안을 만든다. 한 영상의 실패가 나머지를 막지 않는다. */
async function draftPending(db: ServiceClient, env: AutomationEnv, result: CollectResult) {
  const { data: queue, error } = await db
    .from("blog_sources")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(dailyLimit(env));
  if (error) {
    result.errors.push(`대기열 조회 실패: ${error.message}`);
    return;
  }

  for (const src of queue ?? []) {
    try {
      // 같은 영상으로 이미 만든 글이 있으면 다시 만들지 않는다.
      const { data: dup, error: dupErr } = await db
        .from("blog_posts")
        .select("id")
        .eq("source_video_id", src.video_id)
        .limit(1);
      if (dupErr) throw new Error(`blog_posts 조회 실패: ${dupErr.message}`);
      if (dup && dup.length > 0) {
        await markDone(db, src.video_id);
        continue;
      }

      const meta = await fetchVideoMeta(src.video_id);
      const videoUrl = youtubeWatchUrl(src.video_id);
      const draft = await generateDraft({
        apiKey: env.GEMINI_API_KEY!,
        model: geminiModel(env),
        videoUrl,
        meta: { title: meta.title ?? src.title, channel: meta.channel },
      });

      // story(개인 성공담·동기부여)는 원칙적으로 공부 노트로만 남긴다(설계 문서).
      const status = draft.recommend && draft.category !== "story" ? "review" : "note";
      const slug = await insertPost(db, {
        title: draft.title,
        description: draft.description,
        body_md: draft.body_md,
        category: draft.category,
        status,
        source_video_id: src.video_id,
        source_url: videoUrl,
        source_title: meta.title ?? src.title,
        source_channel: meta.channel,
        ai_recommend: draft.recommend,
        ai_reason: draft.reason,
      });
      await markDone(db, src.video_id, meta.title ?? src.title);
      result.processed.push({ videoId: src.video_id, slug, status });
    } catch (e) {
      if (e instanceof GeminiQuotaError) {
        // 한도 초과: 이 영상 탓이 아니므로 attempts 를 올리지 않고 오늘 작업을 멈춘다(내일 재시도).
        result.quotaStopped = true;
        result.errors.push(e.message);
        console.warn(`${LOG} Gemini 한도 초과 — 오늘 작업 중단`);
        break;
      }
      const message = errMsg(e).slice(0, 1000);
      const attempts = (src.attempts ?? 0) + 1;
      const gaveUp = attempts >= MAX_ATTEMPTS;
      const { error: upErr } = await db
        .from("blog_sources")
        .update({ attempts, last_error: message, status: gaveUp ? "failed" : "pending" })
        .eq("video_id", src.video_id);
      if (upErr) result.errors.push(`실패 기록 저장 실패(${src.video_id}): ${upErr.message}`);
      result.failed.push({ videoId: src.video_id, error: message, attempts, gaveUp });
      console.error(`${LOG} 초안 실패 ${src.video_id} (${attempts}/${MAX_ATTEMPTS}): ${message}`);
    }
  }
}

async function markDone(db: ServiceClient, videoId: string, title?: string | null) {
  const { error } = await db
    .from("blog_sources")
    .update({
      status: "done",
      processed_at: new Date().toISOString(),
      last_error: null,
      ...(title ? { title } : {}),
    })
    .eq("video_id", videoId);
  if (error) throw new Error(`blog_sources 완료 표시 실패: ${error.message}`);
}

type PostInsert = {
  title: string;
  description: string;
  body_md: string;
  category: string;
  status: string;
  source_video_id: string;
  source_url: string;
  source_title: string | null;
  source_channel: string | null;
  ai_recommend: boolean;
  ai_reason: string;
};

/** blog.ts 의 slugify/dedupeSlug 로 주소를 정하고 넣는다. 동시에 같은 주소가 생기면(23505) 한 번 더 시도. */
async function insertPost(db: ServiceClient, row: PostInsert): Promise<string> {
  const base = slugify(row.title) || `post-${row.source_video_id.toLowerCase()}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: taken, error: qErr } = await db
      .from("blog_posts")
      .select("slug")
      .like("slug", `${base}%`);
    if (qErr) throw new Error(`slug 조회 실패: ${qErr.message}`);
    const slug = dedupeSlug(
      base,
      (taken ?? []).map((r) => r.slug),
    );
    const { error } = await db.from("blog_posts").insert({ ...row, slug });
    if (!error) return slug;
    if (error.code !== "23505") throw new Error(`blog_posts 저장 실패: ${error.message}`);
  }
  throw new Error("slug 중복으로 저장 실패");
}

// ───────────────────────── 예약 발행 ─────────────────────────

/** 승인(approved_at)이 가장 이른 scheduled 1편을 발행한다. 없으면 아무것도 안 한다. */
export async function runPublishJob(env: AutomationEnv): Promise<PublishResult> {
  const result: PublishResult = { job: "publish", published: null, errors: [] };
  try {
    const db = createServiceClient(env);
    if (!db) {
      result.skipped = "키 없음(SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY)";
      console.error(`${LOG} publish: ${result.skipped} — 건너뜀`);
      return result;
    }
    const { data: next, error } = await db
      .from("blog_posts")
      .select("id, slug, title")
      .eq("status", "scheduled")
      .order("approved_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`발행 대상 조회 실패: ${error.message}`);
    if (!next) {
      console.log(`${LOG} publish: 발행 예정 글 없음`);
      return result;
    }
    // status 조건을 다시 걸어, 그 사이 관리자가 바꾼 글은 건드리지 않는다.
    const { data: done, error: upErr } = await db
      .from("blog_posts")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", next.id)
      .eq("status", "scheduled")
      .select("id, slug, title")
      .maybeSingle();
    if (upErr) throw new Error(`발행 실패: ${upErr.message}`);
    result.published = done ?? null;
  } catch (e) {
    result.errors.push(errMsg(e));
    console.error(`${LOG} publish 예외`, e);
  }
  console.log(`${LOG} publish 결과 ${JSON.stringify(result)}`);
  return result;
}
