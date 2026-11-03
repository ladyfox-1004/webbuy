// apps-script/Code.gs 시험 — 구글 서비스(SpreadsheetApp 등)를 가짜로 만들어 Node vm 에서 돌린다.
// 실행: bun test
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const CODE = readFileSync(join(import.meta.dir, "..", "apps-script", "Code.gs"), "utf8");

type Sheet = { rows: unknown[][] };

function makeSandbox(opts: { token?: string | null; existing?: unknown[][] } = {}) {
  const sheet: Sheet = { rows: opts.existing ? opts.existing.map((r) => [...r]) : [] };
  const mails: { to: string; subject: string; body: string }[] = [];
  const drafts: unknown[] = [];
  const props: Record<string, string | null> = {
    TOKEN: opts.token === undefined ? "SECRET" : opts.token,
  };

  const range = (row: number, col: number, nRows: number, nCols: number) => ({
    setFontWeight() {
      return this;
    },
    getValues() {
      return Array.from({ length: nRows }, (_, i) =>
        Array.from({ length: nCols }, (_, j) => sheet.rows[row - 1 + i]?.[col - 1 + j] ?? ""),
      );
    },
    setValues(vals: unknown[][]) {
      vals.forEach((r, i) =>
        r.forEach((v, j) => {
          const R = row - 1 + i;
          sheet.rows[R] = sheet.rows[R] ?? [];
          sheet.rows[R][col - 1 + j] = v;
        }),
      );
      return this;
    },
  });
  const sheetApi = {
    getLastRow: () => sheet.rows.length,
    getLastColumn: () => Math.max(0, ...sheet.rows.map((r) => r.length)),
    appendRow: (r: unknown[]) => sheet.rows.push([...r]),
    getRange: range,
    setFrozenRows() {},
  };
  const ctx = {
    console: { log() {}, error() {} },
    JSON,
    Date,
    Array,
    Object,
    String,
    Math,
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: () => (sheet.rows.length || opts.existing ? sheetApi : null),
        insertSheet: () => sheetApi,
        getUrl: () => "https://docs.google.com/spreadsheets/d/x",
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate: () => "2026-11-03 14:00:00" },
    ContentService: {
      MimeType: { JSON: "json", TEXT: "text" },
      createTextOutput: (s: string) => ({ setMimeType: () => ({ getContent: () => s }) }),
    },
    MailApp: { sendEmail: (m: { to: string; subject: string; body: string }) => mails.push(m) },
    GmailApp: { createDraft: (...a: unknown[]) => drafts.push(a) },
    Session: { getEffectiveUser: () => ({ getEmail: () => "owner@example.com" }) },
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  const g = ctx as unknown as {
    doPost: (e: unknown) => { getContent: () => string };
    safe_: (v: unknown) => string;
  };
  const post = (body: unknown) =>
    JSON.parse(g.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  return { g, post, sheet, mails, drafts };
}

const payload = {
  token: "SECRET",
  inquiryId: "abc-123",
  receivedAt: "2026-11-03T05:00:00Z",
  name: "홍길동",
  contact: "010-1234-5678",
  services: ["홈페이지·랜딩페이지 제작", "AI 업무 자동화"],
  topic: "",
  notes: "랜딩이 필요합니다",
  referenceLinks: "",
  hasAttachment: false,
  fileName: "",
  attachmentFailed: false,
  source: "homepage",
};

describe("수식 주입 막기(safe_)", () => {
  const { g } = makeSandbox();
  test.each([
    ['=IMPORTXML("http://x","//a")', '\'=IMPORTXML("http://x","//a")'],
    ["+82 10 1234", "'+82 10 1234"],
    ["-1+2", "'-1+2"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["  =1+1", "'  =1+1"],
    ["\t=1", "'\t=1"],
    ["\rhello", "'\rhello"],
  ])("%p 는 글자로 막는다", (input, out) => {
    expect(g.safe_(input)).toBe(out);
  });
  test.each([["홍길동"], ["010-1234-5678"], ["a=b"], ["name@company.com"], [""]])(
    "%p 는 그대로 둔다",
    (input) => {
      expect(g.safe_(input)).toBe(input);
    },
  );
  test("null·undefined 는 빈 글자", () => {
    expect(g.safe_(null)).toBe("");
    expect(g.safe_(undefined)).toBe("");
  });
});

describe("doPost", () => {
  test("토큰이 틀리면 아무것도 쓰지 않는다", () => {
    const s = makeSandbox();
    expect(s.post({ ...payload, token: "WRONG" })).toEqual({ ok: false, error: "unauthorized" });
    expect(s.sheet.rows.length).toBe(0);
    expect(s.mails.length).toBe(0);
  });

  test("스크립트 속성에 TOKEN 이 없으면 빈 토큰도 거절한다", () => {
    const s = makeSandbox({ token: null });
    expect(s.post({ ...payload, token: "" }).ok).toBe(false);
    expect(s.sheet.rows.length).toBe(0);
  });

  test("빈 시트면 머리글을 만들고 한 줄 추가, 수식은 막는다", () => {
    const s = makeSandbox();
    expect(s.post({ ...payload, name: '=HYPERLINK("x")', notes: "+선물" })).toEqual({ ok: true });
    const [head, row] = s.sheet.rows;
    expect(head).toEqual([
      "접수 시각",
      "이름/회사",
      "연락처",
      "필요 솔루션",
      "문의 주제",
      "내용",
      "참고 링크",
      "첨부 여부",
      "출처",
      "문의 번호",
    ]);
    expect(row[head.indexOf("이름/회사")]).toBe('\'=HYPERLINK("x")');
    expect(row[head.indexOf("내용")]).toBe("'+선물");
    expect(row[head.indexOf("연락처")]).toBe("010-1234-5678");
    expect(row[head.indexOf("필요 솔루션")]).toBe("홈페이지·랜딩페이지 제작, AI 업무 자동화");
    expect(row[head.indexOf("문의 번호")]).toBe("abc-123");
    expect(s.mails.length).toBe(1);
    expect(s.mails[0].body).not.toContain("예산");
    // 연락처가 전화번호면 답장 초안은 만들지 않는다
    expect(s.drafts.length).toBe(0);
  });

  test("예전 머리글(예산·희망 론칭일) 시트: 칸 이름으로 맞춰 쓰고, 없는 칸은 오른쪽에 붙인다", () => {
    const old = [
      "접수 시각",
      "이름/회사",
      "연락처",
      "예산",
      "희망 론칭일",
      "필요 솔루션",
      "문의 주제",
      "내용",
      "참고 링크",
      "첨부 여부",
      "출처",
    ];
    const s = makeSandbox({ existing: [old] });
    s.post(payload);
    const head = s.sheet.rows[0] as string[];
    expect(head).toEqual([...old, "문의 번호"]);
    const row = s.sheet.rows[1];
    expect(row[head.indexOf("예산")]).toBe("");
    expect(row[head.indexOf("희망 론칭일")]).toBe("");
    expect(row[head.indexOf("내용")]).toBe("랜딩이 필요합니다");
    expect(row[head.indexOf("문의 번호")]).toBe("abc-123");
  });

  test("예전 폼이 예산을 보내면 예전 시트의 예산 칸에 들어간다", () => {
    const s = makeSandbox({ existing: [["접수 시각", "이름/회사", "예산"]] });
    s.post({ ...payload, budget: "300만 원" });
    const head = s.sheet.rows[0] as string[];
    expect(s.sheet.rows[1][head.indexOf("예산")]).toBe("300만 원");
  });

  test("이메일 연락처면 답장 초안을 만든다(보내지는 않음)", () => {
    const s = makeSandbox();
    s.post({ ...payload, contact: "kim@company.com" });
    expect(s.drafts.length).toBe(1);
    expect((s.drafts[0] as unknown[])[0]).toBe("kim@company.com");
  });
});
