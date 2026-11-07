// 브라우저에서 관리자 내려받기 API 응답을 파일로 저장하는 도우미(파일 이름 읽기는 순수 함수, 시험: tests/partner-payout.test.ts).
// 🚨 서버 전용 export.ts(fflate 포함)를 여기서 import 하지 마라 — 브라우저 묶음이 커진다.

/** Content-Disposition 에서 파일 이름: filename*=UTF-8''… 우선, 없으면 filename="…" */
export function fileNameFromDisposition(v: string | null, fallback: string): string {
  if (!v) return fallback;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(v);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // 아래로
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"/i.exec(v);
  return plain?.[1] || fallback;
}

/** x-export-warnings 머리(encodeURIComponent(JSON 배열)) → 문장 목록 */
export function exportWarnings(v: string | null): string[] {
  if (!v) return [];
  try {
    const a = JSON.parse(decodeURIComponent(v)) as unknown;
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Blob 을 파일로 저장(브라우저 전용) */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
