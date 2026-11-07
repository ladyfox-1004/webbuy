// GET /api/admin/partner-export — 관리자 파트너 화면(/admin/partners 「정산」 탭)의 내려받기.
// 인증: Bearer <관리자 access token> (checkAdmin). 화면은 adminFetch 로 받아 파일로 저장한다(주소 링크로는 못 받는다).
//   ?kind=transfer&month=YYYY-MM&format=xlsx|csv  → 그 달 지급 전 정산의 은행 대량이체 파일(계좌는 정산 만들 때 스냅샷)
//        경고(은행 못 알아봄 등)는 머리 x-export-warnings(encodeURIComponent(JSON 배열))로 준다. 파일 안에는 넣지 않는다(은행 업로드가 깨진다).
//   ?kind=withholding&from=YYYY-MM&to=YYYY-MM     → 지급일이 그 기간(한국 시간, 최대 12달)인 지급 완료 정산 + 월별 합계(.xlsx)
//   ?kind=list&period=7d|30d|month|all&status=…&q=…&sort=…&dir=… → 「파트너」 탭 목록(화면과 같은 검색·필터·정렬, 계좌 끝 4자리만)
// 🚨 파일에 계좌·연락처가 있다. cache-control: no-store, 로그에 내용을 찍지 마라.
import { createFileRoute } from "@tanstack/react-router";
import { checkAdmin, json } from "@/lib/notify/admin-auth";
import {
  buildTransferCsv,
  buildTransferRows,
  buildTransferXlsx,
  buildWithholdingXlsx,
  contentDisposition,
  isMonth,
  kstMonthRange,
  type PaidPayout,
  type TransferPayout,
} from "@/lib/partner/export";
import { XLSX_MIME } from "@/lib/partner/xlsx";
import { filterPartners, kstDay, parseListQuery, sortPartners, type ListResponse } from "@/lib/partner/admin-list";
import { buildPartnerListXlsx } from "@/lib/partner/admin-list-xlsx";
import { partnerDb } from "@/lib/partner/server";

const HINT = "마이그레이션 20261107180000_partners_dashboard.sql 적용 여부를 확인하세요.";

function fileResponse(body: Uint8Array | string, type: string, name: string, ascii: string, extra: Record<string, string> = {}) {
  return new Response(body as BodyInit, {
    status: 200,
    headers: {
      "content-type": type,
      "content-disposition": contentDisposition(name, ascii),
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
      ...extra,
    },
  });
}

export const Route = createFileRoute("/api/admin/partner-export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const db = partnerDb();
        if (!db) return json({ error: "서버 설정 누락(SUPABASE_SERVICE_ROLE_KEY)" }, 500);
        const denied = await checkAdmin(request, db);
        if (denied) return denied;
        const q = new URL(request.url).searchParams;
        const kind = q.get("kind");

        if (kind === "transfer") {
          const month = q.get("month");
          const format = q.get("format") === "csv" ? "csv" : "xlsx";
          if (!isMonth(month)) return json({ error: "정산 달이 틀렸습니다(YYYY-MM)." }, 400);
          const { data, error } = await db.rpc("partner_transfer_list", { _month: month });
          if (error) {
            console.error(`[admin/partner-export] 대량이체 목록 실패 [${error.code ?? "?"}]`);
            return json({ error: `목록을 읽지 못했습니다 [${error.code ?? "?"}] — ${HINT}` }, 500);
          }
          const { rows, warnings } = buildTransferRows((data ?? []) as unknown as TransferPayout[]);
          if (rows.length === 0) return json({ error: `${month} 에 지급 전 정산이 없습니다.`, warnings }, 404);
          const extra = { "x-export-warnings": encodeURIComponent(JSON.stringify(warnings)), "x-export-rows": String(rows.length) };
          const base = `파트너_대량이체_${month}`;
          if (format === "csv") {
            return fileResponse(buildTransferCsv(rows), "text/csv; charset=utf-8", `${base}.csv`, `partner-transfer-${month}.csv`, extra);
          }
          return fileResponse(buildTransferXlsx(rows), XLSX_MIME, `${base}.xlsx`, `partner-transfer-${month}.xlsx`, extra);
        }

        if (kind === "withholding") {
          const from = q.get("from") ?? "";
          const to = q.get("to") ?? "";
          const range = kstMonthRange(from, to);
          if (!range) return json({ error: "기간이 틀렸습니다(시작 달 ≤ 끝 달, 최대 12달)." }, 400);
          const { data, error } = await db.rpc("partner_paid_list", { _from: range.from, _to: range.to });
          if (error) {
            console.error(`[admin/partner-export] 지급 내역 실패 [${error.code ?? "?"}]`);
            return json({ error: `지급 내역을 읽지 못했습니다 [${error.code ?? "?"}] — ${HINT}` }, 500);
          }
          const list = (data ?? []) as unknown as PaidPayout[];
          if (list.length === 0) return json({ error: `${from} ~ ${to} 에 지급 완료된 정산이 없습니다.` }, 404);
          return fileResponse(
            buildWithholdingXlsx(list),
            XLSX_MIME,
            `파트너_원천징수_지급내역_${from}_${to}.xlsx`,
            `partner-withholding-${from}_${to}.xlsx`,
            { "x-export-rows": String(list.length) },
          );
        }

        if (kind === "list") {
          const opt = parseListQuery(q);
          const { data, error } = await db.rpc("partner_admin_list", { _period: opt.period });
          if (error) {
            console.error(`[admin/partner-export] 파트너 목록 실패 [${error.code ?? "?"}]`);
            return json({ error: `목록을 읽지 못했습니다 [${error.code ?? "?"}] — 마이그레이션 20261107190000_partners_admin_list.sql 적용 여부를 확인하세요.` }, 500);
          }
          const all = ((data ?? {}) as unknown as ListResponse).partners ?? [];
          const list = sortPartners(filterPartners(all, opt), opt.sort, opt.dir);
          if (list.length === 0) return json({ error: "조건에 맞는 파트너가 없습니다." }, 404);
          const day = kstDay(new Date().toISOString());
          return fileResponse(
            buildPartnerListXlsx(list, opt.period),
            XLSX_MIME,
            `파트너_목록_${day}.xlsx`,
            `partner-list-${day}.xlsx`,
            { "x-export-rows": String(list.length) },
          );
        }

        return json({ error: "모르는 내려받기입니다." }, 400);
      },
    },
  },
});
