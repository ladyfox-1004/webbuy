const TONE: Record<string, string> = {
  PAID: "bg-primary-glow/15 text-primary-glow border-primary-glow/30",
  VIRTUAL_ACCOUNT_ISSUED: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  READY: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  FAILED: "bg-destructive/15 text-destructive border-destructive/30",
  CANCELLED: "bg-destructive/15 text-destructive border-destructive/30",
  PARTIAL_CANCELLED: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

const LABEL: Record<string, string> = {
  PAID: "완료",
  VIRTUAL_ACCOUNT_ISSUED: "가상계좌",
  READY: "대기",
  FAILED: "실패",
  CANCELLED: "취소",
  PARTIAL_CANCELLED: "부분취소",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = TONE[status] ?? "bg-muted/40 text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {LABEL[status] ?? status}
    </span>
  );
}
