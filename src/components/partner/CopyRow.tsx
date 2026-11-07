// 주소 한 줄 + 복사 단추(파트너 화면·관리자 파트너 화면 공용)
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-sm">{value}</code>
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border border-border px-3 text-sm hover:bg-muted"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "복사됨" : "복사"}
        </button>
      </div>
    </div>
  );
}
