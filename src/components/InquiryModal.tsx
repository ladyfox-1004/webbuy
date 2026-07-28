import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Paperclip, Sparkles, X } from "lucide-react";
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
      className="inquiry-scope fixed inset-0 z-[100] grid place-items-center p-4"
      onClick={(e) => e.target === e.currentTarget && onOpenChange(false)}
    >
      {/* Bright ambient backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-fuchsia-300/30 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-[28rem] w-[28rem] rounded-full bg-sky-300/30 blur-3xl" />
      </div>

      {/* Gradient border wrapper */}
      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-lg rounded-[28px] p-[1.5px]"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.9), rgba(217,180,255,0.7) 40%, rgba(147,197,253,0.7) 70%, rgba(255,255,255,0.9))",
          boxShadow:
            "0 30px 80px -20px rgba(76, 29, 149, 0.35), 0 10px 30px -10px rgba(2, 6, 23, 0.4)",
        }}
      >
        <div className="relative max-h-[90vh] overflow-y-auto rounded-[26px] bg-gradient-to-br from-white via-white to-violet-50/60 p-7 sm:p-8 inquiry-scroll">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="mb-6">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-100 to-sky-100 px-3 py-1 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200/60">
              <Sparkles className="h-3 w-3" />
              24시간 이내 회신
            </div>
            <h2
              className="mt-3 font-display text-[26px] font-bold leading-tight text-slate-900"
            >
              프로젝트 문의하기
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              간단히 남겨주시면 담당자가 직접 확인 후 회신드립니다.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <Field label="이름 / 회사" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                className="iq-input"
                placeholder="홍길동 / (주)회사명"
              />
            </Field>

            <Field label="연락처 (이메일 · 전화 · 카톡ID)" required>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                required
                maxLength={200}
                className="iq-input"
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
                      className={
                        active
                          ? "rounded-full border border-violet-400 bg-gradient-to-r from-violet-500 to-sky-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-violet-300/50 transition"
                          : "rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-violet-300 hover:text-violet-700"
                      }
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
                className="iq-input resize-none"
                placeholder="https://... (여러 개는 줄바꿈으로 구분)"
              />
            </Field>

            <Field label="추가 메모 · 요청사항">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={5000}
                rows={4}
                className="iq-input resize-none"
                placeholder="프로젝트 배경, 원하는 기능, 예산, 일정 등 자유롭게 적어주세요."
              />
            </Field>

            <Field label={`첨부 파일 (선택 · 최대 ${MAX_FILE_MB}MB)`}>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-3 text-sm text-slate-500 transition hover:border-violet-400 hover:bg-violet-50/60 hover:text-violet-700">
                <Paperclip className="h-4 w-4" />
                <span className="truncate">
                  {file ? file.name : "파일 선택 (기획서 · 이미지 등)"}
                </span>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </Field>

            <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-slate-50/70 px-3 py-2.5 text-xs text-slate-500 ring-1 ring-slate-100">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-violet-500"
                required
              />
              <span>
                <span className="font-semibold text-slate-700">(필수)</span> 문의 응대를 위해
                입력하신 개인정보의 수집·이용에 동의합니다. 문의 처리 완료 후 90일간 보관 후
                파기됩니다.
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-sky-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-400/40 transition hover:shadow-xl hover:shadow-violet-400/50 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              문의 보내기
              <span className="ml-1 opacity-80 transition group-hover:translate-x-0.5">→</span>
            </button>
          </form>
        </div>
      </div>

      <style>{`
        .inquiry-scope .iq-input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgb(226 232 240);
          background: rgba(255, 255, 255, 0.9);
          padding: 0.7rem 0.95rem;
          font-size: 0.875rem;
          color: rgb(15 23 42);
          outline: none;
          transition: border-color 150ms ease, box-shadow 150ms ease, background 150ms ease;
        }
        .inquiry-scope .iq-input::placeholder { color: rgb(148 163 184); }
        .inquiry-scope .iq-input:hover { border-color: rgb(203 213 225); }
        .inquiry-scope .iq-input:focus {
          border-color: rgb(139 92 246);
          background: #fff;
          box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.15);
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
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label} {required && <span className="text-fuchsia-500">*</span>}
      </label>
      {children}
    </div>
  );
}
