// 후보 풀 시드 SQL 만들기(scripts/build-outreach-seed.ts) 시험 — 가짜 JSON 만 쓴다. 실행: bun test ./tests
import { describe, expect, test } from "bun:test";
import { buildSeedSql, mergeCandidates, sqlLit, type CandidateFile } from "../scripts/build-outreach-seed";

const files: CandidateFile[] = [
  {
    name: "candidates_20260804_105218.json",
    items: [
      { channel_id: "UCa", title: "옛 이름", url: "https://www.youtube.com/@a", subscribers: 1000, contact_email: "Old@A.com" },
      { channel_id: "UCnone", title: "연락처 없음", contact_email: "" },
    ],
  },
  {
    name: "candidates_20260918_164542.json",
    items: [
      {
        channel_id: "UCa",
        title: "김변호사's 법률 | Law",
        url: "https://www.youtube.com/@a",
        subscribers: 3000,
        niche: "법률",
        top_title: "전세 사기 | 대처 |방법",
        top_url: "https://www.youtube.com/watch?v=1",
        description_summary: "법률사무소 대표 변호사 02-123-4567",
        contact_email: "Law@A.com / second@a.com",
      },
      { channel_id: "UCac", title: "연구실", contact_email: "prof@snu.ac.kr" },
      { channel_id: "UCsent", title: "셀파전산회계 | 구. 셀파컴퓨터회계학원", url: "https://www.youtube.com/@selpa", subscribers: 9000, contact_hint: "selpa@naver.com" },
    ],
  },
];

const outbox = [
  { email: "Selpa@Naver.com", name: "셀파전산회계 | 구. 셀파컴퓨터회계학원", status: "sent", sent_at: "2026-08-11T11:09:54+09:00", message_id: "19fee955" },
  { email: "unknown@x.com", name: "모르는 채널", status: "sent", sent_at: "2026-08-11T11:20:00+09:00", message_id: "abc" },
  { email: "failed@x.com", name: "실패", status: "failed", sent_at: "", message_id: "" },
];

describe("시드 SQL", () => {
  test("같은 채널은 최신 파일 것", () => {
    const m = mergeCandidates(files);
    expect(m.get("UCa")?.title).toBe("김변호사's 법률 | Law");
    expect(m.size).toBe(4);
  });

  test("작은따옴표·NULL·숫자", () => {
    expect(sqlLit("a'b")).toBe("'a''b'");
    expect(sqlLit(null)).toBe("NULL");
    expect(sqlLit(12.7)).toBe("12");
  });

  test("모양: 후보 insert(이메일 있는 것만) + 보낸 기록 insert, 둘 다 do nothing", () => {
    const r = buildSeedSql(files, outbox);
    expect(r.candidates).toBe(3); // UCnone 은 이메일이 없어 뺌
    expect(r.candidatesNew).toBe(2);
    expect(r.candidatesRejected).toBe(1); // 기관 도메인
    expect(r.sent).toBe(2); // failed 는 넣지 않는다
    expect(r.sentUnmatched).toBe(1);
    const sql = r.sql;
    expect(sql.startsWith("-- ")).toBe(true);
    expect(sql).toContain("begin;");
    expect(sql.trim().endsWith("commit;")).toBe(true);
    expect(sql).toContain("insert into public.outreach_candidates (channel_id, channel_name, channel_url, subscribers, country, niche, top_title, top_url, email, description_summary, business_score, status, reject_reason) values");
    expect(sql).toContain("on conflict (channel_id) do nothing;");
    expect(sql).toContain("insert into public.outreach_drafts (batch_date, channel_id, channel_name, channel_url, subscribers, niche, top_title, top_url, email, status, gmail_message_id, sent_at) values");
    expect(sql).toContain("on conflict do nothing;");
    // 첫 쓸 수 있는 주소·소문자·작은따옴표 이스케이프·본업 점수 40
    expect(sql).toContain("('UCa', '김변호사''s 법률 | Law', 'https://www.youtube.com/@a', 3000, NULL, '법률', '전세 사기 | 대처 |방법', 'https://www.youtube.com/watch?v=1', 'law@a.com', '법률사무소 대표 변호사 02-123-4567', 40, 'new', NULL)");
    expect(sql).toContain("'UCac', '연구실'");
    expect(sql).toContain("NULL, NULL, NULL, 0, 'rejected', '기관 도메인(.ac.kr)')");
    expect(sql).not.toContain("UCnone");
    // 보낸 기록: 채널을 이메일로 찾아 짧은 이름·sent·원래 시각
    expect(sql).toContain("('2026-08-11', 'UCsent', '셀파전산회계', 'https://www.youtube.com/@selpa', 9000, NULL, NULL, NULL, 'selpa@naver.com', 'sent', '19fee955', '2026-08-11T11:09:54+09:00')");
    expect(sql).toContain("('2026-08-11', 'outbox-sent-2', '모르는 채널', 'https://www.youtube.com/', NULL, NULL, NULL, NULL, 'unknown@x.com', 'sent', 'abc', '2026-08-11T11:20:00+09:00')");
    expect(sql).not.toContain("failed@x.com");
  });

  test("빈 입력이면 insert 없이 begin/commit 만", () => {
    const r = buildSeedSql([], []);
    expect(r.sql).not.toContain("insert");
    expect(r.candidates + r.sent).toBe(0);
  });
});
