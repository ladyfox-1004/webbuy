// 관리자 「파트너」 탭 목록(표) — 자료 모양·검색·상태 필터·정렬·엑셀 열(순수 함수, 브라우저·서버 공용).
// 자료: public.partner_admin_list(_period, _now) (supabase/migrations/20261107190000_partners_admin_list.sql)
// 화면: src/routes/admin_.partners.tsx 「파트너」 탭 · 엑셀: src/lib/partner/admin-list-xlsx.ts(서버 전용)
// 시험: tests/partner-admin-list.test.ts
// 🚨 목록에는 계좌 끝 4자리만 있다. 전체 번호는 /api/admin/partner-account(관리자 「전체 보기」)로만.
// bun test 에서도 읽으므로 "@/..." 를 쓰지 마라(상대 경로만). fflate(xlsx.ts)를 여기서 import 하지 마라(브라우저 묶음).

export type PartnerStatus = "applied" | "approved" | "rejected" | "paused";
export type ListPeriod = "7d" | "30d" | "month" | "all";

export type ListPartner = {
  id: string;
  code: string;
  status: PartnerStatus;
  name: string;
  phone: string;
  email: string;
  channels: string;
  memo: string | null;
  created_at: string;
  approved_at: string | null;
  view_key: string | null;
  approval_mail_sent_at: string | null;
  approval_mail_error: string | null;
  user_linked: boolean;
  account_mail_sent_at: string | null;
  account_mail_error: string | null;
  bank_name: string;
  bank_last4: string;
  bank_holder: string;
  account_changed_at: string | null;
  /** 기간 안 고유 방문자 */
  visits: number;
  /** 기간 안 상담 접수 */
  inquiries: number;
  /** 기간 안 결제 건수(취소·차감 줄 제외) */
  paid_count: number;
  /** 기간 안 결제 금액 합계(원) */
  paid_amount: number;
  /** 한국 시간 이번 달 수수료(취소 제외, 차감 포함) */
  month_commission: number;
  sum_pending: number;
  sum_payable: number;
  sum_paid: number;
  /** 누적 차감(0 이하) */
  sum_reversed: number;
  last_activity_at: string | null;
};

export type ListTotals = {
  partners: number;
  by_status: Record<PartnerStatus, number>;
  month_paid_amount: number;
  payable_total: number;
  paid_total: number;
};

export type ListResponse = {
  period: ListPeriod;
  since: string | null;
  month_start: string;
  totals: ListTotals;
  partners: ListPartner[];
};

export const PERIODS: { id: ListPeriod; label: string }[] = [
  { id: "7d", label: "7일" },
  { id: "30d", label: "30일" },
  { id: "month", label: "이번 달" },
  { id: "all", label: "전체" },
];

export const STATUS_LABEL: Record<PartnerStatus, string> = {
  applied: "신청",
  approved: "승인",
  paused: "일시정지",
  rejected: "거절",
};

export function isPeriod(v: unknown): v is ListPeriod {
  return v === "7d" || v === "30d" || v === "month" || v === "all";
}

export type StatusFilter = "all" | PartnerStatus;
export function isStatusFilter(v: unknown): v is StatusFilter {
  return v === "all" || v === "applied" || v === "approved" || v === "paused" || v === "rejected";
}

/** 계좌를 최근(기본 14일 안)에 바꿨나 — 목록의 「바뀜」 표시 */
export function recentlyChanged(iso: string | null | undefined, now = new Date(), days = 14): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t < days * 86400_000;
}

/** 「KB국민은행 ·7654」 — 끝 4자리만 */
export function maskedAccount(p: Pick<ListPartner, "bank_name" | "bank_last4">): string {
  return `${p.bank_name} ·${p.bank_last4 || "????"}`;
}

/** 검색: 이름·코드·이메일(대소문자 무시) 또는 휴대폰(하이픈·공백 무시) */
export function matchesSearch(p: Pick<ListPartner, "name" | "code" | "phone" | "email">, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  if (p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s) || p.email.toLowerCase().includes(s)) return true;
  const digits = s.replace(/[\s-]/g, "");
  return /^\d{3,}$/.test(digits) && p.phone.replace(/\D/g, "").includes(digits);
}

export function filterPartners(rows: ListPartner[], opt: { q?: string; status?: StatusFilter }): ListPartner[] {
  const st = opt.status ?? "all";
  return rows.filter((p) => (st === "all" || p.status === st) && matchesSearch(p, opt.q ?? ""));
}

export type SortKey =
  | "name"
  | "code"
  | "status"
  | "phone"
  | "email"
  | "user_linked"
  | "bank"
  | "approved_at"
  | "visits"
  | "inquiries"
  | "paid_count"
  | "paid_amount"
  | "sum_pending"
  | "sum_payable"
  | "sum_paid"
  | "sum_reversed"
  | "month_commission"
  | "last_activity_at";
export type SortDir = "asc" | "desc";

export const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: "sum_payable", dir: "desc" };

const STATUS_ORDER: Record<PartnerStatus, number> = { applied: 0, approved: 1, paused: 2, rejected: 3 };
const SORT_KEYS: SortKey[] = [
  "name", "code", "status", "phone", "email", "user_linked", "bank", "approved_at", "visits", "inquiries", "paid_count",
  "paid_amount", "sum_pending", "sum_payable", "sum_paid", "sum_reversed", "month_commission", "last_activity_at",
];
export function isSortKey(v: unknown): v is SortKey {
  return typeof v === "string" && (SORT_KEYS as string[]).includes(v);
}

function sortValue(p: ListPartner, key: SortKey): string | number | null {
  switch (key) {
    case "status":
      return STATUS_ORDER[p.status];
    case "user_linked":
      return p.user_linked ? 1 : 0;
    case "bank":
      return `${p.bank_name} ${p.bank_last4}`;
    case "approved_at":
    case "last_activity_at": {
      const v = p[key];
      return v ? new Date(v).getTime() : null;
    }
    default: {
      const v = p[key];
      return typeof v === "number" ? v : typeof v === "string" ? v : null;
    }
  }
}

/** 정렬(새 배열). 빈 값(날짜 없음)은 방향과 상관없이 맨 뒤, 같으면 이름 순 */
export function sortPartners(rows: ListPartner[], key: SortKey, dir: SortDir): ListPartner[] {
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null && vb !== null) return 1;
    if (vb === null && va !== null) return -1;
    if (va !== null && vb !== null && va !== vb) {
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * m;
      return String(va).localeCompare(String(vb), "ko") * m;
    }
    return a.name.localeCompare(b.name, "ko") || a.code.localeCompare(b.code);
  });
}

/** 같은 열을 다시 누르면 방향을 바꾸고, 새 열은 숫자·날짜는 큰 순, 글자는 가나다 순부터 */
export function nextSort(cur: { key: SortKey; dir: SortDir }, key: SortKey): { key: SortKey; dir: SortDir } {
  if (cur.key === key) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
  const textual = key === "name" || key === "code" || key === "email" || key === "phone" || key === "bank" || key === "status";
  return { key, dir: textual ? "asc" : "desc" };
}

/** 한국 시간 「2026-11-07」 */
export function kstDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 010-1234-5678 */
export function formatPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}

// ───────── 엑셀 열(화면 표와 같은 순서) ─────────
export type ListCell = string | number | null;
/** periodic: 기간(7일·30일·이번 달·전체)이 적용되는 열 — 엑셀 머리에 기간을 붙인다 */
export const LIST_COLUMNS: { label: string; width: number; periodic?: boolean; value: (p: ListPartner, now: Date) => ListCell }[] = [
  { label: "이름", width: 12, value: (p) => p.name },
  { label: "코드", width: 12, value: (p) => p.code },
  { label: "상태", width: 9, value: (p) => STATUS_LABEL[p.status] },
  { label: "휴대폰", width: 15, value: (p) => formatPhone(p.phone) },
  { label: "이메일", width: 26, value: (p) => p.email },
  { label: "로그인 계정", width: 11, value: (p) => (p.user_linked ? "연결됨" : "없음") },
  { label: "은행", width: 14, value: (p) => p.bank_name },
  { label: "계좌 끝 4자리", width: 12, value: (p) => p.bank_last4 },
  { label: "계좌 바뀐 날", width: 13, value: (p) => kstDay(p.account_changed_at) },
  { label: "계좌 최근 바뀜", width: 13, value: (p, now) => (recentlyChanged(p.account_changed_at, now) ? "바뀜" : "") },
  { label: "승인일", width: 12, value: (p) => kstDay(p.approved_at) },
  { label: "방문", width: 8, periodic: true, value: (p) => p.visits },
  { label: "상담 접수", width: 9, periodic: true, value: (p) => p.inquiries },
  { label: "결제 건수", width: 9, periodic: true, value: (p) => p.paid_count },
  { label: "결제 금액 합계", width: 14, periodic: true, value: (p) => p.paid_amount },
  { label: "이번 달 수수료", width: 13, value: (p) => p.month_commission },
  { label: "수수료 대기", width: 12, value: (p) => p.sum_pending },
  { label: "지급 가능", width: 12, value: (p) => p.sum_payable },
  { label: "지급 완료(누적)", width: 14, value: (p) => p.sum_paid },
  { label: "차감(누적)", width: 12, value: (p) => p.sum_reversed },
  { label: "마지막 활동일", width: 13, value: (p) => kstDay(p.last_activity_at) },
];

export function periodLabel(p: ListPeriod): string {
  return PERIODS.find((x) => x.id === p)?.label ?? p;
}

/** 엑셀·화면 공용: 검색·필터·정렬 조건(주소 쿼리) 읽기. 틀린 값은 기본값 */
export function parseListQuery(q: URLSearchParams): {
  period: ListPeriod;
  q: string;
  status: StatusFilter;
  sort: SortKey;
  dir: SortDir;
} {
  const period = q.get("period");
  const status = q.get("status");
  const sort = q.get("sort");
  const dir = q.get("dir");
  return {
    period: isPeriod(period) ? period : "30d",
    q: (q.get("q") ?? "").slice(0, 100),
    status: isStatusFilter(status) ? status : "all",
    sort: isSortKey(sort) ? sort : DEFAULT_SORT.key,
    dir: dir === "asc" || dir === "desc" ? dir : DEFAULT_SORT.dir,
  };
}

/** 관리자 첫 화면 「파트너」 카드 설명: 「승인 12명 · 지급 가능 340,000원 · 새 신청 2」. 숫자가 없으면 null */
export function partnerSummaryText(s: { approved?: unknown; applied?: unknown; payable_total?: unknown }): string | null {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);
  const approved = n(s.approved);
  const payable = n(s.payable_total);
  const applied = n(s.applied);
  if (Number.isNaN(approved) || Number.isNaN(payable)) return null;
  let t = `승인 ${approved}명 · 지급 가능 ${payable.toLocaleString("ko-KR")}원`;
  if (applied > 0) t += ` · 새 신청 ${applied}`;
  return t;
}
