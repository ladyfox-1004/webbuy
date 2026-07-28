import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Paperclip, X } from "lucide-react";
import { submitInquiry } from "@/lib/inquiry.functions";
import { supabase } from "@/integrations/supabase/client";

const SERVICE_OPTIONS = [
  "제품광고 숏폼",
  "랜딩페이지",
  "홈페이지",
  "커스텀 웹 개발",
  "앱 개발",
  "웹 + 앱 통합",
  "AI 자동화",
  "기타",
];

const MAX_FILE_MB = 10;

export function InquiryModal({
  open,
  onOpenChange,
  defaultService,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultService?: string;
}) {
  const submit = useServerFn(submitInquiry);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [referenceLinks, setReferenceLinks] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && defaultService && !services.includes(defaultService)) {
      setServices((s) => [...s, defaultService]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultService]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  function toggleService(s: string) {
    setServices((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) {
      toast.error("개인정보 수집·이용에 동의해주세요.");
      return;
    }
    if (file && file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`파일 용량은 ${MAX_FILE_MB}MB 이하로 업로드해주세요.`);
      return;
    }
    setLoading(true);
    try {
      let fileStoragePath: string | null = null;
      let fileName: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `inquiries/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("inquiry-files").upload(path, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
        if (error) throw new Error(`파일 업로드 실패: ${error.message}`);
        fileStoragePath = path;
        fileName = file.name;
      }

      await submit({
        data: {
          name,
          contact,
          services,
          referenceLinks,
          notes,
          fileStoragePath,
          fileName,
          consent: true,
        },
      });

      toast.success("문의가 접수되었습니다. 빠르게 답변드릴게요!");
      onOpenChange(false);
      setName("");
      setContact("");
      setServices([]);
      setReferenceLinks("");
      setNotes("");
      setFile(null);
      setConsent(false);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "전송 실패");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onOpenChange(false)}
    >
      <div
        ref={dialogRef}
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-surface p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-background/50 hover:text-foreground"
          aria-label="닫기"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="font-display text-2xl font-bold">프로젝트 문의</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          간단히 남겨주시면 24시간 이내 회신드립니다.
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <Field label="이름 / 회사" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              className="input-base"
              placeholder="홍길동 / (주)회사명"
            />
          </Field>

          <Field label="연락처 (이메일 · 전화 · 카톡ID)" required>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              required
              maxLength={200}
              className="input-base"
              placeholder="example@email.com 또는 010-0000-0000"
            />
          </Field>

          <Field label="관심 서비스 (복수 선택)">
            <div className="flex flex-wrap gap-2">
              {SERVICE_OPTIONS.map((s) => {
                const active = services.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleService(s)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      active
                        ? "border-primary bg-primary/20 text-primary-foreground"
                        : "border-border bg-background/40 text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="참고 사이트 / 레퍼런스 링크">
            <textarea
              value={referenceLinks}
              onChange={(e) => setReferenceLinks(e.target.value)}
              maxLength={2000}
              rows={2}
              className="input-base resize-none"
              placeholder="https://... (여러 개는 줄바꿈으로 구분)"
            />
          </Field>

          <Field label="추가 메모 · 요청사항">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={5000}
              rows={4}
              className="input-base resize-none"
              placeholder="프로젝트 배경, 원하는 기능, 예산, 일정 등 자유롭게 적어주세요."
            />
          </Field>

          <Field label={`첨부 파일 (선택 · 최대 ${MAX_FILE_MB}MB)`}>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border bg-background/40 px-4 py-3 text-sm text-muted-foreground hover:border-primary/40">
              <Paperclip className="h-4 w-4" />
              <span className="truncate">{file ? file.name : "파일 선택 (기획서 · 이미지 등)"}</span>
              <input
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </Field>

          <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5"
              required
            />
            <span>
              (필수) 문의 응대를 위해 입력하신 개인정보의 수집·이용에 동의합니다. 문의 처리 완료 후
              90일간 보관 후 파기됩니다.
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            문의 보내기
          </button>
        </form>
      </div>

      <style>{`
        .input-base {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background) / 0.4);
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
          color: hsl(var(--foreground));
          outline: none;
        }
        .input-base:focus {
          border-color: hsl(var(--primary));
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-foreground/80">
        {label} {required && <span className="text-primary-glow">*</span>}
      </label>
      {children}
    </div>
  );
}
