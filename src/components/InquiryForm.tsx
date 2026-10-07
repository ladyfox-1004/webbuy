import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  Paperclip,
  Tag,
  TriangleAlert,
  X,
} from "lucide-react";
import { submitInquiry } from "@/lib/inquiry.functions";
import { supabase } from "@/integrations/supabase/client";

// 필요 솔루션 선택지. 다른 곳(홈 섹션 등)에서 같은 라벨을 쓰려면 이걸 import 한다.
export const INQUIRY_SERVICE_OPTIONS = [
  "Web/App 플랫폼 구축",
  "디지털 통합 마케팅(CRM·Meta Ads)",
  "디지털 사이니지(DOOH) 통합 운영",
  "AI 업무 자동화",
  "홈페이지·랜딩",
  "기타",
] as const;

const MAX_FILE_MB = 10;
const CONTACT_EMAIL = "contact@ai-solution.co.kr";

type FieldKey = "name" | "contact" | "consent" | "file";
type Errors = Partial<Record<FieldKey, string>>;

type Summary = {
  name: string;
  contact: string;
  budget: string;
  launchDate: string;
  services: string[];
  attachmentFailed: boolean;
};

/** 숫자(쉼표 허용)만 입력했으면 "3,000만 원" 형태로, 아니면 그대로. 비면 "미입력". */
function formatBudget(raw: string): { value: string; numeric: boolean } {
  const t = raw.trim();
  if (!t) return { value: "미입력", numeric: false };
  if (/^[\d,]+$/.test(t)) {
    const digits = t.replace(/,/g, "");
    if (digits) {
      const n = Number(digits);
      if (Number.isFinite(n)) return { value: `${n.toLocaleString("ko-KR")}만 원`, numeric: true };
    }
  }
  return { value: t, numeric: false };
}

function validateContact(v: string): string | undefined {
  const t = v.trim();
  if (!t) return "연락처를 입력해주세요.";
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  const digitCount = (t.match(/\d/g) ?? []).length;
  if (!isEmail && digitCount < 9)
    return "이메일 주소 또는 전화번호(숫자 9자리 이상)를 입력해주세요.";
  return undefined;
}

export function InquiryForm({
  topic,
  variant = "section",
  onDone,
}: {
  topic?: string;
  variant?: "section" | "modal";
  onDone?: () => void;
}) {
  const submit = useServerFn(submitInquiry);
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;

  const topicIsService = !!topic && (INQUIRY_SERVICE_OPTIONS as readonly string[]).includes(topic);

  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [budget, setBudget] = useState("");
  const [launchDate, setLaunchDate] = useState("");
  const [launchUndecided, setLaunchUndecided] = useState(false);
  const [services, setServices] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [referenceLinks, setReferenceLinks] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [topicBadge, setTopicBadge] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [done, setDone] = useState<Summary | null>(null);

  // topic 이 바뀌면(모달 재오픈 포함) 선택 상태를 다시 맞춘다.
  useEffect(() => {
    if (topicIsService && topic) {
      setServices([topic]);
      setTopicBadge("");
    } else {
      setServices([]);
      setTopicBadge(topic?.trim() ?? "");
    }
  }, [topic, topicIsService]);

  const budgetPreview = useMemo(() => formatBudget(budget), [budget]);

  function resetAll() {
    setName("");
    setContact("");
    setBudget("");
    setLaunchDate("");
    setLaunchUndecided(false);
    setServices(topicIsService && topic ? [topic] : []);
    setNotes("");
    setReferenceLinks("");
    setFile(null);
    setConsent(false);
    setHoneypot("");
    setTopicBadge(topicIsService ? "" : (topic?.trim() ?? ""));
    setErrors({});
    setDone(null);
  }

  function toggleService(s: string) {
    setServices((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function clearError(k: FieldKey) {
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const next: Errors = {};
    if (!name.trim()) next.name = "이름 또는 회사명을 입력해주세요.";
    const contactErr = validateContact(contact);
    if (contactErr) next.contact = contactErr;
    if (file && file.size > MAX_FILE_MB * 1024 * 1024)
      next.file = `파일 용량은 ${MAX_FILE_MB}MB 이하로 올려주세요.`;
    if (!consent) next.consent = "개인정보 수집·이용에 동의해주세요.";
    setErrors(next);
    if (Object.keys(next).length > 0) {
      toast.error(Object.values(next)[0] ?? "입력 내용을 확인해주세요.");
      return;
    }

    setLoading(true);
    const budgetValue = budgetPreview.value;
    const launchValue = launchUndecided || !launchDate ? "미정" : launchDate;

    // 1) 첨부 업로드 — 실패해도 문의 자체는 보낸다(버킷이 없을 수도 있다).
    let fileStoragePath: string | null = null;
    let fileName: string | null = null;
    let attachmentFailed = false;
    if (file) {
      fileName = file.name.slice(0, 200);
      try {
        const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
        const path = `inquiries/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("inquiry-files").upload(path, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
        if (error) throw error;
        fileStoragePath = path;
      } catch (err) {
        console.error("inquiry file upload failed", err);
        attachmentFailed = true;
      }
    }

    // 2) 서버 함수 호출
    try {
      await submit({
        data: {
          name: name.trim(),
          contact: contact.trim(),
          services,
          referenceLinks,
          notes,
          fileStoragePath,
          fileName,
          consent: true,
          budget: budgetValue,
          launchDate: launchValue,
          topic: topicBadge,
          honeypot,
          attachmentFailed,
        },
      });
      setDone({
        name: name.trim(),
        contact: contact.trim(),
        budget: budgetValue,
        launchDate: launchValue,
        services,
        attachmentFailed,
      });
    } catch (err) {
      console.error(err);
      const msg =
        err instanceof Error && /[가-힣]/.test(err.message)
          ? err.message
          : "네트워크 오류로 전송하지 못했습니다. 잠시 후 다시 시도해주세요.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return <SuccessView summary={done} variant={variant} onReset={resetAll} onClose={onDone} />;
  }

  const inputCls =
    "block w-full min-h-11 rounded-xl border bg-background/60 px-4 py-2.5 text-[15px] text-foreground placeholder:text-muted-foreground/60 outline-none transition focus:border-primary-glow/70 focus:bg-background/80 focus:ring-4 focus:ring-primary-glow/15 disabled:cursor-not-allowed disabled:opacity-50";
  const okBorder = "border-border hover:border-foreground/20";
  const errBorder = "border-rose-400/70";

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      data-testid="inquiry-form"
      className="iqf relative w-full min-w-0 space-y-9"
    >
      {/* 스팸 봇 함정: 화면 밖으로 보낸 입력칸. 사람은 보거나 포커스할 수 없다. */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
      >
        <label htmlFor={id("hp")}>회사 웹사이트</label>
        <input
          id={id("hp")}
          type="text"
          name="company_website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      {topicBadge && (
        <div className="flex">
          <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary-glow/30 bg-primary/10 py-1.5 pl-3 pr-1.5 text-[13px] text-foreground">
            <Tag className="h-3.5 w-3.5 shrink-0 text-primary-glow" />
            <span className="truncate">
              <span className="text-muted-foreground">문의 주제:</span> {topicBadge}
            </span>
            <button
              type="button"
              onClick={() => setTopicBadge("")}
              aria-label="문의 주제 지우기"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      )}

      {/* 01 기본 정보 */}
      <Step no="01" title="기본 정보">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="이름 / 회사" htmlFor={id("name")} required error={errors.name}>
            <input
              id={id("name")}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearError("name");
              }}
              maxLength={100}
              autoComplete="name"
              aria-invalid={!!errors.name}
              className={`${inputCls} ${errors.name ? errBorder : okBorder}`}
              placeholder="홍길동 / 회사명"
            />
          </Field>
          <Field
            label="연락처"
            hint="전화 또는 이메일"
            htmlFor={id("contact")}
            required
            error={errors.contact}
          >
            <input
              id={id("contact")}
              value={contact}
              onChange={(e) => {
                setContact(e.target.value);
                clearError("contact");
              }}
              onBlur={() =>
                contact.trim() && setErrors((x) => ({ ...x, contact: validateContact(contact) }))
              }
              maxLength={200}
              autoComplete="email"
              aria-invalid={!!errors.contact}
              className={`${inputCls} ${errors.contact ? errBorder : okBorder}`}
              placeholder="010-0000-0000 또는 name@company.com"
            />
          </Field>
        </div>
      </Step>

      {/* 02 프로젝트 개요 */}
      <Step no="02" title="프로젝트 개요">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="프로젝트 예산" htmlFor={id("budget")}>
            <div className="relative">
              <input
                id={id("budget")}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                maxLength={100}
                inputMode="text"
                className={`${inputCls} ${okBorder} pr-20`}
                placeholder="예: 3000 또는 협의 필요"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-foreground/5 px-2 py-0.5 text-[11px] text-muted-foreground">
                단위: 만 원
              </span>
            </div>
            <p className="mt-2 min-h-[1.25rem] text-[12.5px]" aria-live="polite">
              {budgetPreview.numeric ? (
                <span className="text-primary-glow">
                  <span className="font-semibold">{budgetPreview.value}</span>으로 접수됩니다
                </span>
              ) : budget.trim() ? (
                <span className="text-muted-foreground">입력하신 그대로 접수됩니다</span>
              ) : (
                <span className="text-muted-foreground/70">
                  숫자만 쓰면 만 원 단위로 접수됩니다
                </span>
              )}
            </p>
          </Field>

          <Field label="희망 론칭일" htmlFor={id("launch")}>
            <div className="flex gap-2">
              <input
                id={id("launch")}
                type="date"
                value={launchUndecided ? "" : launchDate}
                onChange={(e) => setLaunchDate(e.target.value)}
                disabled={launchUndecided}
                className={`${inputCls} ${okBorder} iqf-date min-w-0 flex-1`}
              />
              <button
                type="button"
                role="switch"
                aria-checked={launchUndecided}
                onClick={() => setLaunchUndecided((v) => !v)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-4 text-sm font-medium transition ${
                  launchUndecided
                    ? "border-transparent bg-gradient-to-r from-primary to-primary-glow text-white shadow-lg shadow-primary/25"
                    : "border-border bg-background/40 text-muted-foreground hover:border-foreground/25 hover:text-foreground"
                }`}
              >
                {launchUndecided && <Check className="h-3.5 w-3.5" />}
                미정
              </button>
            </div>
            <p className="mt-2 text-[12.5px] text-muted-foreground/70">
              {launchUndecided ? "일정은 상담하며 함께 정해요" : "대략적인 날짜여도 괜찮습니다"}
            </p>
          </Field>
        </div>

        <fieldset className="mt-6 min-w-0">
          <legend className="mb-2.5 text-[13px] font-medium text-muted-foreground">
            필요 솔루션 <span className="text-muted-foreground/60">(복수 선택)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {INQUIRY_SERVICE_OPTIONS.map((s) => {
              const active = services.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleService(s)}
                  className={`inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full border px-4 py-2 text-left text-[13.5px] transition ${
                    active
                      ? "border-transparent bg-gradient-to-r from-primary to-primary-glow font-semibold text-white shadow-lg shadow-primary/25"
                      : "border-border bg-background/40 text-muted-foreground hover:border-primary-glow/50 hover:text-foreground"
                  }`}
                >
                  {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                  <span className="break-keep">{s}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </Step>

      {/* 03 상세 내용 */}
      <Step no="03" title="상세 내용">
        <div className="space-y-5">
          <Field label="프로젝트 내용" htmlFor={id("notes")}>
            <textarea
              id={id("notes")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={5000}
              rows={5}
              className={`${inputCls} ${okBorder} resize-y leading-relaxed`}
              placeholder={
                "프로젝트 배경과 목표, 필요한 기능, 현재 쓰고 있는 시스템을 적어주세요.\n예) 오프라인 매장 예약을 온라인으로 옮기고, 기존 고객 DB와 연동하고 싶습니다."
              }
            />
            <div className="mt-1.5 text-right text-[11.5px] text-muted-foreground/60">
              {notes.length.toLocaleString("ko-KR")} / 5,000
            </div>
          </Field>

          <Field label="참고 링크" hint="여러 개는 줄바꿈으로 구분" htmlFor={id("links")}>
            <textarea
              id={id("links")}
              value={referenceLinks}
              onChange={(e) => setReferenceLinks(e.target.value)}
              maxLength={2000}
              rows={2}
              className={`${inputCls} ${okBorder} resize-none`}
              placeholder="https://..."
            />
          </Field>

          <Field
            label="첨부 파일"
            hint={`선택 · 최대 ${MAX_FILE_MB}MB`}
            htmlFor={id("file")}
            error={errors.file}
          >
            <div
              className={`flex min-h-12 items-center gap-3 rounded-xl border border-dashed bg-background/40 px-4 py-2.5 transition ${
                errors.file ? errBorder : "border-border hover:border-primary-glow/50"
              }`}
            >
              <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
              <label
                htmlFor={id("file")}
                className="min-w-0 flex-1 cursor-pointer truncate text-sm text-muted-foreground hover:text-foreground"
              >
                {file ? (
                  <span className="text-foreground">
                    {file.name}{" "}
                    <span className="text-muted-foreground">
                      ({(file.size / 1024 / 1024).toFixed(1)}MB)
                    </span>
                  </span>
                ) : (
                  "기획서 · 이미지 등 파일 선택"
                )}
              </label>
              {file && (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    clearError("file");
                  }}
                  aria-label="첨부 파일 제거"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <input
                id={id("file")}
                type="file"
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  clearError("file");
                  e.target.value = "";
                }}
              />
            </div>
          </Field>
        </div>
      </Step>

      {/* 동의 + 제출 */}
      <div className="space-y-5">
        <div>
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border bg-background/40 px-4 py-3.5 text-[13px] leading-relaxed text-muted-foreground transition ${
              errors.consent ? errBorder : "border-border"
            }`}
          >
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                clearError("consent");
              }}
              aria-invalid={!!errors.consent}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--primary-glow)]"
            />
            <span>
              <span className="font-semibold text-foreground">(필수)</span> 문의 응대를 위해
              입력하신 개인정보의 수집·이용에 동의합니다. 문의 처리 완료 후 90일간 보관 후
              파기됩니다.
            </span>
          </label>
          {errors.consent && <ErrorText>{errors.consent}</ErrorText>}
        </div>

        <button
          type="submit"
          disabled={loading}
          data-testid="inquiry-submit"
          className="group inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-primary-glow px-6 text-[15px] font-semibold text-white shadow-xl shadow-primary/30 transition hover:shadow-2xl hover:shadow-primary/40 hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              전송 중…
            </>
          ) : (
            <>
              상담 신청하기
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </>
          )}
        </button>
        <p className="text-center text-[12.5px] text-muted-foreground/70">
          담당자가 확인 후 24시간 이내에 회신드립니다.
        </p>
      </div>

      <style>{`
        .iqf .iqf-date { color-scheme: dark; }
        .iqf .iqf-date::-webkit-calendar-picker-indicator {
          filter: invert(0.8);
          opacity: 0.7;
          cursor: pointer;
        }
        .iqf .iqf-date:not(:disabled)::-webkit-calendar-picker-indicator:hover { opacity: 1; }
      `}</style>
    </form>
  );
}

function Step({ no, title, children }: { no: string; title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-5 flex items-center gap-3">
        <span className="font-mono text-xs font-semibold tracking-wider text-primary-glow">
          {no}
        </span>
        <h3 className="shrink-0 font-display text-[15px] font-semibold text-foreground">{title}</h3>
        <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={htmlFor}
        className="mb-2 flex flex-wrap items-baseline gap-x-1.5 text-[13px] font-medium text-muted-foreground"
      >
        <span>{label}</span>
        {required && (
          <span className="text-primary-glow" aria-label="필수">
            *
          </span>
        )}
        {hint && <span className="text-[12px] font-normal text-muted-foreground/60">· {hint}</span>}
      </label>
      {children}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-rose-300">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function SuccessView({
  summary,
  variant,
  onReset,
  onClose,
}: {
  summary: Summary;
  variant: "section" | "modal";
  onReset: () => void;
  onClose?: () => void;
}) {
  const rows: [string, string][] = [
    ["이름 / 회사", summary.name],
    ["연락처", summary.contact],
    ["예산", summary.budget],
    ["희망 론칭일", summary.launchDate],
    ["필요 솔루션", summary.services.length ? summary.services.join(", ") : "선택 안 함"],
  ];
  return (
    <div data-testid="inquiry-success" className="w-full min-w-0 py-2 text-center" role="status">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow shadow-xl shadow-primary/30">
        <CheckCircle2 className="h-8 w-8 text-white" />
      </div>
      <h3 className="mt-5 font-display text-2xl font-bold text-foreground">
        문의가 접수되었습니다
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        담당자가 내용을 확인한 뒤 24시간 이내에 연락드리겠습니다.
      </p>

      <dl className="mx-auto mt-7 max-w-md divide-y divide-border rounded-2xl border border-border bg-background/50 text-left text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-4 px-4 py-3">
            <dt className="w-24 shrink-0 text-muted-foreground">{k}</dt>
            <dd className="min-w-0 flex-1 break-words text-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      {summary.attachmentFailed && (
        <div className="mx-auto mt-4 flex max-w-md items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-left text-[13px] leading-relaxed text-amber-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            첨부 파일은 전송되지 않았습니다.{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-semibold underline underline-offset-2"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            로 보내주세요.
          </span>
        </div>
      )}

      <div className="mt-7 flex flex-col-reverse justify-center gap-2.5 sm:flex-row">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-background/40 px-6 text-sm font-medium text-foreground transition hover:border-foreground/30"
        >
          새 문의 작성
        </button>
        {variant === "modal" && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-gradient-to-r from-primary to-primary-glow px-7 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition hover:brightness-110"
          >
            닫기
          </button>
        )}
      </div>
    </div>
  );
}
