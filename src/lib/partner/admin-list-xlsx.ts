// 관리자 파트너 목록 엑셀(.xlsx) — 서버 전용(fflate). 열은 admin-list.ts 의 LIST_COLUMNS(화면 표와 같은 순서).
// 🚨 계좌는 은행·끝 4자리만(목록 자료에 전체 번호가 없다). 연락처가 들어 있으니 로그에 내용을 찍지 마라.
// 시험: tests/partner-admin-list.test.ts. bun test 에서도 읽으므로 "@/..." 를 쓰지 마라.
import { LIST_COLUMNS, periodLabel, type ListPartner, type ListPeriod } from "./admin-list";
import { buildXlsx, type Cell } from "./xlsx";

export function partnerListHeader(period: ListPeriod): string[] {
  const pl = periodLabel(period);
  return LIST_COLUMNS.map((c) => (c.periodic ? `${c.label}(${pl})` : c.label));
}

export function partnerListRows(list: ListPartner[], now = new Date()): Cell[][] {
  return list.map((p) => LIST_COLUMNS.map((c) => c.value(p, now)));
}

export function buildPartnerListXlsx(list: ListPartner[], period: ListPeriod, now = new Date()): Uint8Array {
  return buildXlsx([
    {
      name: "파트너 목록",
      rows: [partnerListHeader(period), ...partnerListRows(list, now)],
      widths: LIST_COLUMNS.map((c) => c.width),
    },
  ]);
}
