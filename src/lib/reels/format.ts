// 릴스 판매 화면 — 순수 함수(표시·입력 안내). 서버 검사를 대신하지 않는다(서버가 다시 검사한다).
// 이 파일은 bun test 에서 읽는다 — import.meta.env 나 "@/..." 를 쓰지 마라.
import {
  MAX_NOTE_CHARS,
  MAX_REFERENCE_URLS,
  MAX_UPLOAD_BYTES,
  type ReelsPlan,
  type ReelsStatus,
} from "./constants";

/** 200000 → "200,000원" */
export function won(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

/** 200000 → "200,000" (원 없이) */
export function num(n: number): string {
  return Math.round(n).toLocaleString("ko-KR");
}

export const STATUS_LABEL: Record<ReelsStatus, string> = {
  pending: "결제 대기",
  paid: "결제 완료",
  cancelled: "취소",
  expired: "만료",
};

export function statusLabel(s: string): string {
  return (STATUS_LABEL as Record<string, string>)[s] ?? s;
}

/** 검색 주소 ?plan= 정리. 1·5·10 이 아니면 1 */
export function parsePlan(v: unknown): ReelsPlan {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  return n === 5 || n === 10 ? n : 1;
}

/** 인스타 아이디 정리 미리보기(서버 normalizeInsta 와 같은 규칙). 무효면 null */
export function normalizeInstaPreview(raw: string): string | null {
  let s = (raw ?? "").trim();
  const m = s.match(/^https?:\/\/(?:www\.)?instagram\.com\/([^/?#]+)/i);
  if (m) s = m[1];
  s = s.replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(s) ? s : null;
}

/** 휴대폰 번호 정리 미리보기(숫자만). 휴대폰 형식이 아니면 null */
export function normalizePhonePreview(raw: string): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  return /^01[016789]\d{7,8}$/.test(d) ? d : null;
}

/** 01012345678 → 010-1234-5678 */
export function prettyPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
}

export function isEmail(raw: string): boolean {
  const s = (raw ?? "").trim();
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export type CheckoutInput = {
  shopName: string;
  insta: string;
  phone: string;
  email: string;
};

/** 칸별 안내 문장. 문제 없으면 빈 객체 */
export function checkoutFieldErrors(v: CheckoutInput): Partial<Record<keyof CheckoutInput, string>> {
  const e: Partial<Record<keyof CheckoutInput, string>> = {};
  if (!v.shopName.trim()) e.shopName = "상호를 적어 주세요.";
  else if (v.shopName.trim().length > 100) e.shopName = "상호는 100자 안으로 적어 주세요.";
  if (!normalizeInstaPreview(v.insta))
    e.insta = "인스타 아이디를 확인해 주세요. 영문 소문자·숫자·마침표·밑줄만 됩니다(예: myshop.seoul).";
  if (!normalizePhonePreview(v.phone))
    e.phone = "휴대폰 번호를 확인해 주세요(예: 010-1234-5678). 결제 안내가 이 번호로 갑니다.";
  if (!isEmail(v.email)) e.email = "이메일 주소를 확인해 주세요(예: shop@example.com).";
  return e;
}

export function isHttpUrl(raw: string): boolean {
  const s = (raw ?? "").trim();
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
  } catch {
    return false;
  }
}

/** 참고 릴스 주소 칸(여러 줄) → 주소 목록 + 안내 */
export function parseReferenceUrls(text: string): { urls: string[]; error: string | null } {
  const lines = (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const bad = lines.filter((l) => !isHttpUrl(l));
  if (bad.length) return { urls: [], error: `주소는 http:// 또는 https:// 로 시작해야 합니다: ${bad[0]}` };
  const urls = [...new Set(lines)];
  if (urls.length > MAX_REFERENCE_URLS)
    return { urls: [], error: `참고 릴스 주소는 ${MAX_REFERENCE_URLS}개까지 적어 주세요.` };
  return { urls, error: null };
}

export function noteError(note: string): string | null {
  return (note ?? "").length > MAX_NOTE_CHARS ? `요청사항은 ${MAX_NOTE_CHARS}자 안으로 적어 주세요.` : null;
}

/** 올릴 파일 검사. 문제가 있으면 안내 문장 */
export function uploadFileError(f: { name: string; type: string; size: number }): string | null {
  if (!/^(image|video)\//.test(f.type)) return `${f.name}: 사진·영상 파일만 올릴 수 있습니다.`;
  if (f.size <= 0) return `${f.name}: 빈 파일입니다.`;
  if (f.size > MAX_UPLOAD_BYTES) return `${f.name}: 한 파일은 500MB까지 올릴 수 있습니다.`;
  return null;
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

/** ISO 시각 → 한국 시간 "2026. 11. 6. 14:03" */
export function kstDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function isOrderNo(s: string): boolean {
  return /^R[0-9]{6}-[0-9]{4,}$/.test(s);
}

export function isViewKey(s: string | undefined | null): boolean {
  return !!s && /^[A-Za-z0-9_-]{43}$/.test(s);
}

export const UPLOAD_KIND_LABEL: Record<string, string> = {
  file: "파일",
  homepage: "홈페이지",
  reference: "참고 릴스",
  note: "요청사항",
};

/** 관리 화면 메일 상태 */
export function mailStatusLabel(s: string | null | undefined): string {
  if (!s) return "보내기 전";
  if (s === "sent") return "보냄";
  if (s === "sending") return "보내는 중";
  if (s.startsWith("skipped")) return `건너뜀(${s.split(":").slice(1).join(":") || "사유 없음"})`;
  if (s.startsWith("failed")) return `실패(${s.split(":").slice(1).join(":") || "사유 없음"})`;
  return s;
}
