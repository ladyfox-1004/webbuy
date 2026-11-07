// 파트너 지급 편의 — 매월 1일 자동 정산 판정·카톡, 은행 이름 정규화, 대량이체 CSV(BOM)·xlsx, 원천징수 지급 내역 시험.
// 실행: bun test ./tests  (네트워크·DB 에 나가지 않는다. DB 쪽 시험은 supabase/tests/partners_dashboard.test.sql)
import { describe, expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import {
  autoPayoutDue,
  autoPayoutKakaoText,
  runAutoPayouts,
  type AutoPayoutRpc,
} from "../src/lib/partner/auto-payout";
import { BANKS, accountDigits, normalizeBank } from "../src/lib/partner/bank";
import {
  PAID_HEADER,
  TRANSFER_HEADER,
  buildTransferCsv,
  buildTransferRows,
  buildTransferXlsx,
  buildWithholdingXlsx,
  contentDisposition,
  csvCell,
  formatPhone,
  kstDay,
  kstMonthRange,
  monthlyTotals,
  senderMemo,
  type PaidPayout,
  type TransferPayout,
} from "../src/lib/partner/export";
import { colName } from "../src/lib/partner/xlsx";
import { exportWarnings, fileNameFromDisposition } from "../src/lib/partner/download";

// ───────── xlsx 다시 읽기(시험용 아주 작은 읽개: inlineStr·숫자만) ─────────
function readXlsx(bytes: Uint8Array): { names: string[]; sheets: (string | number)[][][] } {
  const files = unzipSync(bytes);
  for (const need of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml"]) {
    if (!files[need]) throw new Error(`없는 부분: ${need}`);
  }
  const wb = strFromU8(files["xl/workbook.xml"]);
  const names = [...wb.matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  const sheets = names.map((_, i) => {
    const xml = strFromU8(files[`xl/worksheets/sheet${i + 1}.xml`]);
    return [...xml.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)].map((rm) => {
      const out: (string | number)[] = [];
      for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"[^>]*?(?: t="inlineStr")?>(.*?)<\/c>/g)) {
        const col = [...cm[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const inner = cm[2];
        const t = /<t[^>]*>(.*?)<\/t>/.exec(inner);
        const v = /<v>(.*?)<\/v>/.exec(inner);
        while (out.length < col) out.push("");
        out[col] = t
          ? t[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
          : Number(v?.[1]);
      }
      return out;
    });
  });
  return { names, sheets };
}

// ───────── 1) 매월 1일 자동 정산 ─────────
describe("자동 정산: 한국 시간 1일 09시 판정", () => {
  test("1일 09:00 KST(= 전날 아님, UTC 00:00) 부터 1일 23:59 까지만", () => {
    expect(autoPayoutDue(new Date("2026-12-01T00:00:00Z"))).toBe(true); // 12/1 09:00 KST
    expect(autoPayoutDue(new Date("2026-12-01T14:59:00Z"))).toBe(true); // 12/1 23:59 KST
    expect(autoPayoutDue(new Date("2026-11-30T23:59:00Z"))).toBe(false); // 12/1 08:59 KST
    expect(autoPayoutDue(new Date("2026-11-30T15:00:00Z"))).toBe(false); // 12/1 00:00 KST
    expect(autoPayoutDue(new Date("2026-12-01T15:00:00Z"))).toBe(false); // 12/2 00:00 KST
    expect(autoPayoutDue(new Date("2026-11-15T03:00:00Z"))).toBe(false);
    // UTC 로는 1일이지만 한국은 이미 2일 — 안 돎
    expect(autoPayoutDue(new Date("2027-01-01T16:00:00Z"))).toBe(false);
  });

  test("카톡 문구", () => {
    expect(autoPayoutKakaoText(3, 1234567)).toBe(
      "이번 달 파트너 정산 3명, 실지급 합계 1,234,567원. 확인: https://ai-solution.co.kr/admin/partners",
    );
  });

  type Call = { run: string[]; notify: string[]; record: [string, string][] };
  function deps(rpc: AutoPayoutRpc | (() => AutoPayoutRpc), now: string, notifyStatus = "ok") {
    const calls: Call = { run: [], notify: [], record: [] };
    return {
      calls,
      d: {
        now: new Date(now),
        run: async (iso: string) => {
          calls.run.push(iso);
          return typeof rpc === "function" ? rpc() : rpc;
        },
        notify: async (t: string) => {
          calls.notify.push(t);
          return notifyStatus as "ok";
        },
        recordNotify: async (m: string, s: string) => {
          calls.record.push([m, s]);
        },
      },
    };
  }
  const DUE = { ok: true, due: true, created: true, run_month: "2026-12", payout_month: "2026-11", partners: 2, net_total: 29010, notify: true } as const;

  test("때가 아니면 DB 도 안 부른다", async () => {
    const { calls, d } = deps(DUE, "2026-12-02T01:00:00Z");
    expect(await runAutoPayouts(d)).toEqual({ ran: false, reason: "not_due" });
    expect(calls.run.length + calls.notify.length).toBe(0);
  });

  test("첫 실행: 정산 만들고 카톡 1통 + 결과 기록", async () => {
    const { calls, d } = deps(DUE, "2026-12-01T00:00:00Z");
    const r = await runAutoPayouts(d);
    expect(r).toEqual({ ran: true, created: true, payoutMonth: "2026-11", partners: 2, netTotal: 29010, notify: "ok" });
    expect(calls.run).toEqual(["2026-12-01T00:00:00.000Z"]);
    expect(calls.notify).toEqual(["이번 달 파트너 정산 2명, 실지급 합계 29,010원. 확인: https://ai-solution.co.kr/admin/partners"]);
    expect(calls.record).toEqual([["2026-12", "ok"]]);
  });

  test("멱등: DB 가 이미 만들었고 카톡 차례가 아니면(notify=false) 아무것도 안 보낸다", async () => {
    const { calls, d } = deps({ ...DUE, created: false, notify: false }, "2026-12-01T01:30:00Z");
    const r = await runAutoPayouts(d);
    expect(r).toMatchObject({ ran: true, created: false, notify: "none" });
    expect(calls.notify.length).toBe(0);
    expect(calls.record.length).toBe(0);
  });

  test("0명이면 카톡 안 감(DB 가 notify=true 라고 해도)", async () => {
    const { calls, d } = deps({ ...DUE, partners: 0, net_total: 0, notify: true }, "2026-12-01T00:00:00Z");
    const r = await runAutoPayouts(d);
    expect(r).toMatchObject({ ran: true, partners: 0, notify: "none" });
    expect(calls.notify.length).toBe(0);
  });

  test("카톡 실패·던짐은 기록만(다음 실행에 DB 가 다시 차례를 준다)", async () => {
    const a = deps(DUE, "2026-12-01T00:00:00Z", "failed:http_500");
    expect((await runAutoPayouts(a.d)) as { notify: string }).toMatchObject({ notify: "failed:http_500" });
    expect(a.calls.record).toEqual([["2026-12", "failed:http_500"]]);
    const b = deps(DUE, "2026-12-01T00:00:00Z");
    b.d.notify = async () => {
      throw new TypeError("boom");
    };
    expect((await runAutoPayouts(b.d)) as { notify: string }).toMatchObject({ notify: "failed:TypeError" });
    expect(b.calls.record).toEqual([["2026-12", "failed:TypeError"]]);
  });

  test("DB 실패는 던지지 않고 사유만", async () => {
    const { d } = deps(DUE, "2026-12-01T00:00:00Z");
    d.run = async () => {
      throw new Error("rpc_42883");
    };
    expect(await runAutoPayouts(d)).toEqual({ ran: false, reason: "rpc_failed", error: "rpc_42883" });
  });
});

// ───────── 2) 은행 이름 정규화 ─────────
describe("은행 이름 → 코드", () => {
  const cases: [string, string][] = [
    ["국민", "004"], ["국민은행", "004"], ["KB국민은행", "004"], ["KB", "004"], ["kb 국민", "004"], ["KB국민", "004"],
    ["국민은행 강남지점", "004"],
    ["신한", "088"], ["신한은행", "088"], ["신한은행(주)", "088"],
    ["우리", "020"], ["우리은행", "020"],
    ["하나", "081"], ["하나은행", "081"], ["KEB하나은행", "081"],
    ["농협", "011"], ["농협은행", "011"], ["NH농협", "011"], ["NH농협은행", "011"], ["nh", "011"],
    ["기업", "003"], ["기업은행", "003"], ["IBK기업은행", "003"], ["IBK", "003"],
    ["카카오뱅크", "090"], ["카카오", "090"], ["카뱅", "090"],
    ["토스뱅크", "092"], ["토스", "092"],
    ["케이뱅크", "089"], ["K뱅크", "089"], ["kbank", "089"],
    ["새마을금고", "045"], ["MG새마을금고", "045"], ["새마을", "045"],
    ["우체국", "071"],
    ["수협", "007"], ["수협은행", "007"], ["Sh수협은행", "007"],
    ["부산은행", "032"], ["BNK부산은행", "032"],
    ["대구은행", "031"], ["iM뱅크", "031"], ["DGB대구은행", "031"],
    ["광주은행", "034"], ["전북은행", "037"], ["경남은행", "039"], ["제주은행", "035"],
    ["SC제일은행", "023"], ["제일은행", "023"], ["스탠다드차타드", "023"],
    ["씨티", "027"], ["한국씨티은행", "027"], ["시티은행", "027"],
    ["088", "088"],
  ];
  test.each(cases)("%s → %s", (input, code) => {
    expect(normalizeBank(input)?.code).toBe(code);
  });
  test("못 맞추면 null(억지로 고르지 않음)", () => {
    for (const bad of ["", "  ", "지역농협", "카카오페이", "모름", "999", "은행", null, undefined]) {
      expect(normalizeBank(bad as string)).toBeNull();
    }
  });
  test("표준 이름·코드 20개, 코드 3자리·겹침 없음", () => {
    expect(BANKS.length).toBe(20);
    expect(new Set(BANKS.map((b) => b.code)).size).toBe(20);
    for (const b of BANKS) {
      expect(b.code).toMatch(/^\d{3}$/);
      expect(normalizeBank(b.name)?.code).toBe(b.code);
    }
  });
  test("계좌는 숫자만", () => {
    expect(accountDigits("123-456 78-90")).toBe("1234567890");
  });
});

// ───────── 3) 대량이체 파일 ─────────
const T: TransferPayout[] = [
  { id: "1", month: "2026-11", code: "kimpart", partner_name: "김파트", gross: 130100, net: 125807, bank_name: "국민", bank_account: "004-123456-01-987", bank_holder: "김파트" },
  { id: "2", month: "2026-11", code: "leepart", partner_name: "이파트", gross: 20000, net: 19340, bank_name: "모르는은행", bank_account: "0012345678901", bank_holder: "이파트" },
  { id: "3", month: "2026-11", code: "zero", partner_name: "영원", gross: 0, net: 0, bank_name: "신한", bank_account: "110222333444", bank_holder: "영원" },
];

describe("대량이체 줄", () => {
  const { rows, warnings } = buildTransferRows(T);
  test("열 값: 표준 은행·코드·숫자만 계좌·예금주·실지급·통장 표시", () => {
    expect(rows[0]).toEqual({
      bank: "KB국민은행",
      bankCode: "004",
      account: "00412345601987",
      holder: "김파트",
      amount: 125807,
      receiverMemo: "에이아이솔루션",
      senderMemo: "파트너 11월 김파트",
    });
    expect(senderMemo("2027-01", " 박  파트 ")).toBe("파트너 1월 박 파트");
  });
  test("못 알아본 은행은 코드 빈칸 + 경고, 실지급 0 이하는 빼고 경고", () => {
    expect(rows.length).toBe(2);
    expect(rows[1].bankCode).toBe("");
    expect(rows[1].bank).toBe("모르는은행");
    expect(rows[1].account).toBe("0012345678901");
    expect(warnings.some((w) => w.includes("이파트") && w.includes("모르는은행"))).toBe(true);
    expect(warnings.some((w) => w.includes("영원") && w.includes("0원"))).toBe(true);
  });

  test("CSV: UTF-8 BOM·CRLF·머리글·앞자리 0 그대로", () => {
    const csv = buildTransferCsv(rows);
    const bytes = new TextEncoder().encode(csv);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(TRANSFER_HEADER.join(","));
    expect(lines[1]).toBe("KB국민은행,004,00412345601987,김파트,125807,에이아이솔루션,파트너 11월 김파트");
    expect(lines[2]).toBe("모르는은행,,0012345678901,이파트,19340,에이아이솔루션,파트너 11월 이파트");
    expect(lines[3]).toBe("");
    expect(csv.includes("\n") && !/[^\r]\n/.test(csv)).toBe(true);
  });
  test("CSV 칸: 쉼표·따옴표 감싸기, 수식 시작 글자 무력화", () => {
    expect(csvCell('김,"파트"')).toBe('"김,""파트"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-1+2")).toBe("'-1+2");
    expect(csvCell("@x")).toBe("'@x");
    expect(csvCell(12)).toBe("12");
    expect(csvCell("줄\n바꿈")).toBe("줄 바꿈");
  });

  test("xlsx: 다시 풀어 읽으면 같은 값(코드·계좌는 글자라 앞자리 0 유지, 금액은 숫자)", () => {
    const x = readXlsx(buildTransferXlsx(rows));
    expect(x.names).toEqual(["대량이체"]);
    const [head, r1, r2] = x.sheets[0];
    expect(head).toEqual([...TRANSFER_HEADER]);
    expect(r1).toEqual(["KB국민은행", "004", "00412345601987", "김파트", 125807, "에이아이솔루션", "파트너 11월 김파트"]);
    expect(r2).toEqual(["모르는은행", "", "0012345678901", "이파트", 19340, "에이아이솔루션", "파트너 11월 이파트"]);
    expect(x.sheets[0].length).toBe(3);
  });

  test("xlsx: 이상한 글자(<&\" 제어문자)도 깨지지 않음", () => {
    const x = readXlsx(
      buildTransferXlsx([{ bank: "A<B>&\"C\"", bankCode: "", account: "1", holder: "x\u0001y", amount: 1, receiverMemo: "", senderMemo: "" }]),
    );
    expect(x.sheets[0][1][0]).toBe('A<B>&"C"');
    expect(x.sheets[0][1][3]).toBe("xy");
  });
  test("열 이름", () => {
    expect([0, 25, 26, 27, 701, 702].map(colName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });
});

// ───────── 4) 원천징수 지급 내역 ─────────
const P: PaidPayout[] = [
  // 11/30 16:00 UTC = 12/1 01:00 KST → 12월 지급
  { id: "a", month: "2026-11", paid_at: "2026-11-30T16:00:00Z", partner_name: "김파트", phone: "01012345678", gross: 130100, income_tax: 3903, local_tax: 390, withholding: 4293, net: 125807, bank_name: "국민", bank_account: "123456-01-987654", bank_holder: "김파트" },
  { id: "b", month: "2026-10", paid_at: "2026-11-03T01:00:00Z", partner_name: "이파트", phone: "0101234567", gross: 40000, income_tax: 1200, local_tax: 120, withholding: 1320, net: 38680, bank_name: "신한은행", bank_account: "110-222-333444", bank_holder: "이파트" },
  { id: "c", month: "2026-11", paid_at: "2026-12-05T02:00:00Z", partner_name: "박파트", phone: "01099998888", gross: 20000, income_tax: 600, local_tax: 60, withholding: 660, net: 19340, bank_name: "카카오뱅크", bank_account: "3333-01-1234567", bank_holder: "박파트" },
];

describe("원천징수 지급 내역", () => {
  test("지급 월(한국 시간) 합계 + 전체 합계", () => {
    const { months, total } = monthlyTotals(P);
    expect(months).toEqual([
      { month: "2026-11", count: 1, gross: 40000, income_tax: 1200, local_tax: 120, withholding: 1320, net: 38680 },
      { month: "2026-12", count: 2, gross: 150100, income_tax: 4503, local_tax: 450, withholding: 4953, net: 145147 },
    ]);
    expect(total).toEqual({ month: "합계", count: 3, gross: 190100, income_tax: 5703, local_tax: 570, withholding: 6273, net: 183827 });
    expect(total.gross - total.withholding).toBe(total.net);
  });

  test("xlsx 두 시트: 지급 내역(주민번호 빈 열) + 월별 합계", () => {
    const x = readXlsx(buildWithholdingXlsx(P));
    expect(x.names).toEqual(["지급 내역", "월별 합계"]);
    const d = x.sheets[0];
    expect(d[0]).toEqual([...PAID_HEADER]);
    expect(d[0][11]).toBe("주민등록번호(세무 신고 시 별도 기재)");
    // 지급일 순
    expect(d[1]).toEqual(["2026-11-03", "2026-10", "이파트", "010-123-4567", 40000, 1200, 120, 38680, "신한은행", "110222333444", "이파트"]);
    expect(d[2]).toEqual(["2026-12-01", "2026-11", "김파트", "010-1234-5678", 130100, 3903, 390, 125807, "KB국민은행", "12345601987654", "김파트"]);
    expect(d[3][0]).toBe("2026-12-05");
    expect(d[4]).toEqual(["합계", "", "3건", "", 190100, 5703, 570, 183827]);
    const m = x.sheets[1];
    expect(m[1]).toEqual(["2026-11", 1, 40000, 1200, 120, 1320, 38680]);
    expect(m[2]).toEqual(["2026-12", 2, 150100, 4503, 450, 4953, 145147]);
    expect(m[3]).toEqual(["합계", 3, 190100, 5703, 570, 6273, 183827]);
  });

  test("한국 날짜·전화 모양", () => {
    expect(kstDay("2026-11-30T15:00:00Z")).toBe("2026-12-01");
    expect(kstDay("2026-11-30T14:59:59Z")).toBe("2026-11-30");
    expect(formatPhone("01012345678")).toBe("010-1234-5678");
    expect(formatPhone("0111234567")).toBe("011-123-4567");
  });

  test("기간: 한국 시간 달 경계, 최대 12달", () => {
    expect(kstMonthRange("2026-01", "2026-12")).toEqual({ from: "2025-12-31T15:00:00.000Z", to: "2026-12-31T15:00:00.000Z" });
    expect(kstMonthRange("2026-11", "2026-11")).toEqual({ from: "2026-10-31T15:00:00.000Z", to: "2026-11-30T15:00:00.000Z" });
    expect(kstMonthRange("2026-12", "2026-11")).toBeNull();
    expect(kstMonthRange("2026-01", "2027-01")).toBeNull();
    expect(kstMonthRange("2026-1", "2026-02")).toBeNull();
  });
});

// ───────── 5) 내려받기 머리 ─────────
describe("파일 이름(RFC 5987)·경고 머리", () => {
  test("한글 이름은 filename*, ASCII 대체는 filename", () => {
    const v = contentDisposition("파트너_대량이체_2026-11.xlsx", "partner-transfer-2026-11.xlsx");
    expect(v).toBe(
      `attachment; filename="partner-transfer-2026-11.xlsx"; filename*=UTF-8''${encodeURIComponent("파트너_대량이체_2026-11.xlsx")}`,
    );
    expect(fileNameFromDisposition(v, "x")).toBe("파트너_대량이체_2026-11.xlsx");
    expect(fileNameFromDisposition('attachment; filename="a.csv"', "x")).toBe("a.csv");
    expect(fileNameFromDisposition(null, "x")).toBe("x");
    // 따옴표·괄호도 안전하게
    expect(contentDisposition("a'(b).csv", 'a"b.csv')).toBe(`attachment; filename="a_b.csv"; filename*=UTF-8''a%27%28b%29.csv`);
  });
  test("경고 머리 읽기", () => {
    expect(exportWarnings(encodeURIComponent(JSON.stringify(["a", "b"])))).toEqual(["a", "b"]);
    expect(exportWarnings("%%bad")).toEqual([]);
    expect(exportWarnings(null)).toEqual([]);
  });
});
