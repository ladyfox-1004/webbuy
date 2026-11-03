// 상담 접수 처리 단위 시험 — 실행: bun test ./tests
// 🚨 핵심 보장: DB 저장이 되면 시트·카톡 알림이 실패하거나 던져도 접수는 성공이다.
// 네트워크·DB 에 나가지 않는다(insert·notify·fetch 를 가짜로 끼운다).
import { describe, expect, test } from "bun:test";
import {
  INQUIRY_FAILED_MESSAGE,
  InquirySchema,
  composeNotes,
  processInquiry,
  type InquiryRow,
} from "../src/lib/inquiry-submit";
import { runInquiryNotifications } from "../src/lib/notify";
import type { InquiryNotice } from "../src/lib/notify/types";

const input = InquirySchema.parse({
  name: "시험 / 가짜상호",
  contact: "010-0000-0000",
  services: ["랜딩페이지 제작"],
  notes: "단위 시험 — 실제 접수 아님",
  consent: true,
});

function deps(over: Partial<Parameters<typeof processInquiry>[1]> = {}) {
  const rows: InquiryRow[] = [];
  const notices: InquiryNotice[] = [];
  return {
    rows,
    notices,
    d: {
      insert: async (row: InquiryRow) => {
        rows.push(row);
        return { error: null };
      },
      notify: async (n: InquiryNotice) => {
        notices.push(n);
      },
      newId: () => "11111111-2222-3333-4444-555555555555",
      now: () => new Date("2026-11-04T01:00:00.000Z"),
      ...over,
    },
  };
}

describe("상담 접수 처리", () => {
  test("정상: 한 줄 저장하고 같은 id 로 알림을 부른다", async () => {
    const t = deps();
    expect(await processInquiry(input, t.d)).toEqual({ ok: true });
    expect(t.rows.length).toBe(1);
    expect(t.rows[0].id).toBe("11111111-2222-3333-4444-555555555555");
    expect(t.rows[0].notes).toBe(composeNotes(input));
    expect(t.notices.length).toBe(1);
    expect(t.notices[0].id).toBe(t.rows[0].id);
    expect(t.notices[0].receivedAt).toBe("2026-11-04T01:00:00.000Z");
  });

  test("알림이 예외를 던져도 저장됐으면 성공으로 답한다", async () => {
    const t = deps({
      notify: async () => {
        throw new Error("kakao exploded");
      },
    });
    expect(await processInquiry(input, t.d)).toEqual({ ok: true });
    expect(t.rows.length).toBe(1);
  });

  test("시트·카톡이 모두 실패(HTTP 오류·네트워크 끊김)해도 성공으로 답한다", async () => {
    const t = deps({
      notify: (n) =>
        runInquiryNotifications(n, {
          env: {
            INQUIRY_SHEET_WEBHOOK_URL: "https://script.google.com/macros/s/x/exec",
            INQUIRY_SHEET_TOKEN: "T",
            KAKAO_REST_API_KEY: "REST",
            KAKAO_REFRESH_TOKEN: "SEED",
          },
          db: null,
          fetchFn: async (url) => {
            if (url.startsWith("https://script")) return new Response("x", { status: 500 });
            throw new TypeError("network down");
          },
        }),
    });
    expect(await processInquiry(input, t.d)).toEqual({ ok: true });
    expect(t.rows.length).toBe(1);
  });

  test("시크릿이 하나도 없으면 알림은 조용히 건너뛰고 성공", async () => {
    let fetched = 0;
    let result: unknown;
    const t = deps({
      notify: async (n) => {
        result = await runInquiryNotifications(n, {
          env: {},
          db: null,
          fetchFn: async () => {
            fetched++;
            return new Response("{}");
          },
        });
      },
    });
    expect(await processInquiry(input, t.d)).toEqual({ ok: true });
    expect(fetched).toBe(0);
    expect(result).toEqual({ sheet: "skipped:no_url", kakao: "skipped:no_rest_api_key" });
  });

  test("DB 저장이 실패하면 오류를 던지고 알림은 보내지 않는다", async () => {
    const t = deps({ insert: async () => ({ error: { code: "42501", message: "rls" } }) });
    await expect(processInquiry(input, t.d)).rejects.toThrow(INQUIRY_FAILED_MESSAGE);
    expect(t.notices.length).toBe(0);
  });

  test("DB 저장이 예외로 끝나도 같은 오류 문구, 알림 없음", async () => {
    const t = deps({
      insert: async () => {
        throw new TypeError("fetch failed");
      },
    });
    await expect(processInquiry(input, t.d)).rejects.toThrow(INQUIRY_FAILED_MESSAGE);
    expect(t.notices.length).toBe(0);
  });

  test("숨김 칸(honeypot)이 차 있으면 저장·알림 없이 성공", async () => {
    const t = deps();
    const bot = InquirySchema.parse({ ...input, honeypot: "http://spam" });
    expect(await processInquiry(bot, t.d)).toEqual({ ok: true });
    expect(t.rows.length).toBe(0);
    expect(t.notices.length).toBe(0);
  });

  test("예산·론칭일 칸이 없어도 notes 머리말 형식은 유지된다", () => {
    expect(composeNotes(input)).toBe("[예산] 미입력 / [희망 론칭일] 미정\n\n단위 시험 — 실제 접수 아님");
  });
});

describe("알림 묶음은 결과 기록이 실패해도 던지지 않는다", () => {
  const notice: InquiryNotice = {
    id: "11111111-2222-3333-4444-555555555555",
    receivedAt: "2026-11-04T01:00:00.000Z",
    name: "시험",
    contact: "010-0000-0000",
    services: [],
    topic: "",
    notes: "",
    referenceLinks: "",
    hasAttachment: false,
    fileName: "",
    attachmentFailed: false,
    source: "test",
  };

  test("inquiries 결과 기록(update)이 예외를 던져도 상태를 돌려준다", async () => {
    const db = {
      from() {
        return {
          update() {
            return {
              eq: async () => {
                throw new TypeError("network down");
              },
            };
          },
        };
      },
    };
    const r = await runInquiryNotifications(notice, {
      env: {},
      db: db as never,
      fetchFn: async () => new Response("{}"),
    });
    expect(r).toEqual({ sheet: "skipped:no_url", kakao: "skipped:no_rest_api_key" });
  });
});
