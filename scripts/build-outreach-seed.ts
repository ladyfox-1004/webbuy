// 노트북에 쌓인 영업 후보를 서버 후보 풀로 옮기는 SQL 만들기(한 번만 쓰는 도구).
//
//   bun scripts/build-outreach-seed.ts [--in 폴더] [--outbox 파일] [--out 파일]
//     --in      스크리너 결과 폴더(기본 C:/shortsmaker/outreach/screener/out, candidates_*.json 전부)
//     --outbox  8/11 발송 기록(기본 C:/shortsmaker/outreach/mailer/outbox.json)
//     --out     만들 SQL 파일(🚨 저장소 밖에 둬라 — 이메일이 들어 있다. 이 저장소는 공개다)
//
// 만드는 것(둘 다 on conflict do nothing 이라 여러 번 돌려도 안전)
//   1) public.outreach_candidates — candidates_*.json 의 채널(같은 channel_id 는 최신 파일 것), 이메일 있는 것만.
//      쓸 수 있는 주소가 하나도 없으면(기관 도메인·이미지 파일명 등) status='rejected' + 사유로 넣는다.
//   2) public.outreach_drafts — outbox.json 의 보낸 기록(status='sent')을 status='sent' 로.
//      그래야 「이미 보냄」 판단 근거가 서버 한 곳(outreach_drafts)이 된다(수신거부 명단에 넣는 게 아니다).
// 🚨 화면·로그에는 이메일을 찍지 않는다(개수만).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  channelUrl,
  cleanTitle,
  firstUsableEmail,
  normEmail,
  scoreBusiness,
  shortName,
  splitEmails,
} from "../src/lib/outreach/pick-rules";

export type ScreenerCandidate = {
  channel_id?: string;
  title?: string;
  url?: string;
  subscribers?: number | string;
  niche?: string;
  top_title?: string;
  top_url?: string;
  description_summary?: string;
  contact_email?: string;
  contact_hint?: string;
};
export type OutboxRow = { email?: string; name?: string; status?: string; sent_at?: string; message_id?: string };
export type CandidateFile = { name: string; items: ScreenerCandidate[] };

export const SENT_BATCH_DATE = "2026-08-11";

export function sqlLit(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.trunc(v)) : "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}

function toInt(v: unknown): number | null {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

/** 같은 채널은 최신 파일 것(파일 이름에 시각이 있어 이름순 = 시간순) */
export function mergeCandidates(files: CandidateFile[]): Map<string, ScreenerCandidate> {
  const byId = new Map<string, ScreenerCandidate>();
  for (const f of [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    for (const c of Array.isArray(f.items) ? f.items : []) {
      if (c && c.channel_id) byId.set(c.channel_id, c);
    }
  }
  return byId;
}

function kstDay(iso: string | undefined): string {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return SENT_BATCH_DATE;
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export type SeedResult = { sql: string; candidates: number; candidatesNew: number; candidatesRejected: number; sent: number; sentUnmatched: number };

export function buildSeedSql(files: CandidateFile[], outbox: OutboxRow[]): SeedResult {
  const byId = mergeCandidates(files);
  const candRows: string[] = [];
  let nNew = 0;
  let nRej = 0;
  const byEmail = new Map<string, ScreenerCandidate>();
  for (const c of byId.values()) {
    const emails = splitEmails(c.contact_email || c.contact_hint);
    for (const e of emails) byEmail.set(e, c);
    if (!emails.length) continue; // 보낼 곳이 없다
    const { email, problem } = firstUsableEmail(emails);
    const title = String(c.title ?? "").trim() || String(c.channel_id);
    const status = email ? "new" : "rejected";
    if (email) nNew++;
    else nRej++;
    candRows.push(
      `(${[
        sqlLit(c.channel_id),
        sqlLit(title),
        sqlLit(c.url || channelUrl(String(c.channel_id))),
        sqlLit(toInt(c.subscribers)),
        "NULL",
        sqlLit(c.niche || null),
        sqlLit(c.top_title || null),
        sqlLit(c.top_url || null),
        sqlLit(email || null),
        sqlLit(c.description_summary || null),
        sqlLit(scoreBusiness(title, c.description_summary ?? "").score),
        sqlLit(status),
        sqlLit(email ? null : problem),
      ].join(", ")})`,
    );
  }

  const sentRows: string[] = [];
  let unmatched = 0;
  outbox
    .filter((r) => r && r.status === "sent" && normEmail(r.email))
    .forEach((r, i) => {
      const email = normEmail(r.email);
      const c = byEmail.get(email);
      if (!c) unmatched++;
      const id = c?.channel_id ?? `outbox-sent-${i + 1}`;
      const name = String(r.name ?? c?.title ?? "").trim() || id;
      sentRows.push(
        `(${[
          sqlLit(kstDay(r.sent_at)),
          sqlLit(id),
          sqlLit(shortName(name) || name),
          sqlLit(c ? c.url || channelUrl(id) : "https://www.youtube.com/"),
          sqlLit(c ? toInt(c.subscribers) : null),
          sqlLit(c?.niche || null),
          sqlLit(c?.top_title ? cleanTitle(c.top_title) || null : null),
          sqlLit(c?.top_url || null),
          sqlLit(email),
          "'sent'",
          sqlLit(r.message_id || null),
          sqlLit(r.sent_at || null),
        ].join(", ")})`,
      );
    });

  const parts = [
    "-- 영업 후보 풀 시드 + 8/11 보낸 기록(scripts/build-outreach-seed.ts 가 만듦)",
    "-- 🚨 이메일이 들어 있다. 저장소에 커밋하지 마라. 운영 DB 에 한 번 실행(여러 번 돌려도 do nothing).",
    "begin;",
  ];
  if (candRows.length) {
    parts.push(
      "insert into public.outreach_candidates (channel_id, channel_name, channel_url, subscribers, country, niche, top_title, top_url, email, description_summary, business_score, status, reject_reason) values",
      candRows.join(",\n"),
      "on conflict (channel_id) do nothing;",
    );
  }
  if (sentRows.length) {
    parts.push(
      "insert into public.outreach_drafts (batch_date, channel_id, channel_name, channel_url, subscribers, niche, top_title, top_url, email, status, gmail_message_id, sent_at) values",
      sentRows.join(",\n"),
      "on conflict do nothing;",
    );
  }
  parts.push("commit;", "");
  return {
    sql: parts.join("\n"),
    candidates: candRows.length,
    candidatesNew: nNew,
    candidatesRejected: nRej,
    sent: sentRows.length,
    sentUnmatched: unmatched,
  };
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

if (import.meta.main) {
  const inDir = arg("--in", "C:/shortsmaker/outreach/screener/out");
  const outboxPath = arg("--outbox", "C:/shortsmaker/outreach/mailer/outbox.json");
  const outPath = arg("--out", "");
  if (!outPath) {
    console.error("--out 파일을 주세요(저장소 밖 경로).");
    process.exit(2);
  }
  const files: CandidateFile[] = readdirSync(inDir)
    .filter((f) => /^candidates_.*\.json$/.test(f))
    .map((f) => ({ name: f, items: JSON.parse(readFileSync(join(inDir, f), "utf8")) as ScreenerCandidate[] }));
  const outbox = (JSON.parse(readFileSync(outboxPath, "utf8")) as { sent?: OutboxRow[] }).sent;
  if (!Array.isArray(outbox)) throw new Error("발송 기록 형식이 올바르지 않습니다(sent 배열 없음)");
  const r = buildSeedSql(files, outbox);
  writeFileSync(outPath, r.sql, "utf8");
  console.log(
    `파일 ${files.length}개 → 후보 ${r.candidates}줄(new ${r.candidatesNew} · rejected ${r.candidatesRejected}) · 보낸 기록 ${r.sent}줄(채널 못 찾음 ${r.sentUnmatched}) → ${outPath}`,
  );
}
