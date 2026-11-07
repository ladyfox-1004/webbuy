// 관리자 내려받기 파일 만들기(순수 함수) — 은행 대량이체(.xlsx·CSV)와 원천징수 지급 내역(.xlsx).
// 자료: public.partner_transfer_list(_month)·partner_paid_list(_from, _to). 계좌는 정산 만들 때의 스냅샷이다.
// 내려받기 API: src/routes/api/admin/partner-export.ts. 시험: tests/partner-payout.test.ts
// 🚨 이 파일들에는 계좌·연락처가 들어 있다. 로그에 내용을 찍지 마라.
// bun test 에서도 읽으므로 "@/..." 를 쓰지 마라(상대 경로만).
import { accountDigits, normalizeBank } from "./bank";
import { buildXlsx, type Cell } from "./xlsx";

export const RECEIVER_MEMO = "에이아이솔루션";
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type TransferPayout = {
  id: string;
  month: string;
  code: string;
  partner_name: string;
  gross: number;
  net: number;
  bank_name: string;
  bank_account: string;
  bank_holder: string;
};

export type PaidPayout = {
  id: string;
  month: string;
  paid_at: string;
  partner_name: string;
  phone: string;
  gross: number;
  income_tax: number;
  local_tax: number;
  withholding: number;
  net: number;
  bank_name: string;
  bank_account: string;
  bank_holder: string;
};

export const TRANSFER_HEADER = ["받는 은행", "은행 코드", "계좌번호", "예금주", "이체 금액", "받는 분 통장 표시", "내 통장 표시"] as const;

export type TransferRow = {
  bank: string;
  bankCode: string;
  account: string;
  holder: string;
  amount: number;
  receiverMemo: string;
  senderMemo: string;
};

/** 「파트너 11월 김파트」 */
export function senderMemo(month: string, name: string): string {
  const m = Number(month.slice(5, 7));
  return `파트너 ${m}월 ${name.replace(/\s+/g, " ").trim()}`;
}

/** 대량이체 줄 + 경고(은행 못 알아봄·계좌 자릿수 이상·금액 0 이하) */
export function buildTransferRows(list: TransferPayout[]): { rows: TransferRow[]; warnings: string[] } {
  const rows: TransferRow[] = [];
  const warnings: string[] = [];
  for (const y of list) {
    const name = y.partner_name.trim();
    if (!(y.net > 0)) {
      warnings.push(`${name}님: 실지급이 0원 이하라 뺐습니다.`);
      continue;
    }
    const bank = normalizeBank(y.bank_name);
    const account = accountDigits(y.bank_account);
    if (!bank) warnings.push(`${name}님: 은행 이름 「${y.bank_name}」을 알아보지 못했습니다. 은행 코드를 직접 넣어 주세요.`);
    if (account.length < 10 || account.length > 16) warnings.push(`${name}님: 계좌번호 자릿수(${account.length}자리)를 확인해 주세요.`);
    rows.push({
      bank: bank?.name ?? y.bank_name.trim(),
      bankCode: bank?.code ?? "",
      account,
      holder: y.bank_holder.trim(),
      amount: y.net,
      receiverMemo: RECEIVER_MEMO,
      senderMemo: senderMemo(y.month, name),
    });
  }
  return { rows, warnings };
}

function transferCells(r: TransferRow): Cell[] {
  return [r.bank, r.bankCode, r.account, r.holder, r.amount, r.receiverMemo, r.senderMemo];
}

/** CSV 칸 하나. 엑셀에서 열 때 수식으로 실행되지 않게 =,+,-,@ 로 시작하는 글자는 앞에 ' 를 붙인다. */
export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  let s = v.replace(/\r\n?|\n/g, " ");
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`;
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 BOM + CRLF. 첫 줄은 머리글. */
export function buildTransferCsv(rows: TransferRow[]): string {
  const lines = [TRANSFER_HEADER.map(csvCell).join(","), ...rows.map((r) => transferCells(r).map(csvCell).join(","))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function buildTransferXlsx(rows: TransferRow[]): Uint8Array {
  return buildXlsx([
    { name: "대량이체", rows: [[...TRANSFER_HEADER], ...rows.map(transferCells)], widths: [18, 10, 18, 12, 12, 16, 20] },
  ]);
}

// ───────── 원천징수 지급 내역 ─────────

export const PAID_HEADER = [
  "지급일",
  "정산 월",
  "이름",
  "연락처",
  "총액",
  "소득세(3%)",
  "지방소득세(0.3%)",
  "실지급",
  "은행",
  "계좌번호",
  "예금주",
  "주민등록번호(세무 신고 시 별도 기재)",
] as const;

export const MONTHLY_HEADER = ["지급 월", "건수", "총액", "소득세(3%)", "지방소득세(0.3%)", "원천징수 합계", "실지급"] as const;

/** ISO → 한국 날짜 'YYYY-MM-DD' */
export function kstDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 01012345678 → 010-1234-5678 */
export function formatPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}

export type MonthlyTotal = { month: string; count: number; gross: number; income_tax: number; local_tax: number; withholding: number; net: number };

/** 지급일(한국 시간) 달별 합계 + 전체 합계 */
export function monthlyTotals(list: PaidPayout[]): { months: MonthlyTotal[]; total: MonthlyTotal } {
  const by = new Map<string, MonthlyTotal>();
  const total: MonthlyTotal = { month: "합계", count: 0, gross: 0, income_tax: 0, local_tax: 0, withholding: 0, net: 0 };
  for (const y of list) {
    const m = kstDay(y.paid_at).slice(0, 7);
    const t = by.get(m) ?? { month: m, count: 0, gross: 0, income_tax: 0, local_tax: 0, withholding: 0, net: 0 };
    for (const acc of [t, total]) {
      acc.count += 1;
      acc.gross += y.gross;
      acc.income_tax += y.income_tax;
      acc.local_tax += y.local_tax;
      acc.withholding += y.income_tax + y.local_tax;
      acc.net += y.net;
    }
    by.set(m, t);
  }
  return { months: [...by.values()].sort((a, b) => a.month.localeCompare(b.month)), total };
}

export function buildWithholdingXlsx(list: PaidPayout[]): Uint8Array {
  const sorted = [...list].sort((a, b) => a.paid_at.localeCompare(b.paid_at) || a.partner_name.localeCompare(b.partner_name));
  const { months, total } = monthlyTotals(sorted);
  const detail: Cell[][] = [
    [...PAID_HEADER],
    ...sorted.map((y) => [
      kstDay(y.paid_at),
      y.month,
      y.partner_name,
      formatPhone(y.phone),
      y.gross,
      y.income_tax,
      y.local_tax,
      y.net,
      normalizeBank(y.bank_name)?.name ?? y.bank_name,
      accountDigits(y.bank_account),
      y.bank_holder,
      "",
    ]),
    ["합계", "", `${total.count}건`, "", total.gross, total.income_tax, total.local_tax, total.net, "", "", "", ""],
  ];
  const monthly: Cell[][] = [
    [...MONTHLY_HEADER],
    ...[...months, total].map((t) => [t.month, t.count, t.gross, t.income_tax, t.local_tax, t.withholding, t.net]),
  ];
  return buildXlsx([
    { name: "지급 내역", rows: detail, widths: [12, 10, 10, 15, 12, 12, 15, 12, 16, 18, 10, 30] },
    { name: "월별 합계", rows: monthly, widths: [10, 8, 12, 12, 15, 14, 12] },
  ]);
}

// ───────── 기간·파일 이름 ─────────

/** 'YYYY-MM' 두 개(포함) → 한국 시간 [시작 달 1일 00:00, 끝 달 다음 달 1일 00:00) 의 ISO. 12달 넘으면 null */
export function kstMonthRange(from: string, to: string): { from: string; to: string } | null {
  if (!MONTH_RE.test(from) || !MONTH_RE.test(to) || from > to) return null;
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  if ((ty - fy) * 12 + (tm - fm) + 1 > 12) return null;
  const start = Date.UTC(fy, fm - 1, 1) - 9 * 3600_000;
  const end = Date.UTC(ty, tm, 1) - 9 * 3600_000;
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}

/** RFC 6266/5987: ASCII 대체 이름 + UTF-8 한글 이름 */
export function contentDisposition(fileName: string, asciiFallback: string): string {
  const enc = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const ascii = asciiFallback.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${enc}`;
}

export function isMonth(s: unknown): s is string {
  return typeof s === "string" && MONTH_RE.test(s);
}
