// /reels/order/$orderNo?k=<열쇠> — 손님 주문 화면. 결제 완료 메일과 페이앱 returnurl 이 여기로 온다.
// 주의: 열쇠(k)가 있어야 열린다. 색인 금지(noindex), canonical 없음 — 주문 링크가 검색에 뜨면 안 된다.
// 주의: 결제 완료(paid)일 때만 자료를 올린다(서버도 막는다). 파일은 upload_url → 저장 공간 직접 업로드 → save_upload 순서.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, FileUp, Link2, Loader2, RefreshCw, StickyNote } from "lucide-react";
import {
  KakaoChannelPlaceholder,
  ReelsFooter,
  ReelsNav,
  ReelsStatusBadge,
} from "@/components/reels/ReelsParts";
import { MAX_REFERENCE_URLS, METHOD_LABEL, SELLER } from "@/lib/reels/constants";
import {
  orderSaveLinks,
  orderView,
  uploadOrderFile,
  type OrderView,
  type Upload,
} from "@/lib/reels/api";
import {
  formatBytes,
  isHttpUrl,
  kstDateTime,
  noteError,
  parseReferenceUrls,
  UPLOAD_KIND_LABEL,
  uploadFileError,
  won,
} from "@/lib/reels/format";

export const Route = createFileRoute("/reels/order/$orderNo")({
  validateSearch: (s: Record<string, unknown>): { k?: string } => ({
    k: typeof s.k === "string" && s.k ? s.k : undefined,
  }),
  component: OrderPage,
  head: () => ({
    meta: [
      { title: "주문 확인 | 에이아이솔루션 쇼츠 제작" },
      { name: "description", content: "문의 댓글 쇼츠 제작 주문 확인과 자료 올리기 화면입니다." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "주문 확인 | 에이아이솔루션 쇼츠 제작" },
      { property: "og:description", content: "문의 댓글 쇼츠 제작 주문 확인 화면입니다." },
    ],
  }),
});

function OrderPage() {
  const { orderNo } = Route.useParams();
  const { k } = Route.useSearch();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ReelsNav />
      <main className="mx-auto max-w-2xl px-4 pt-8 pb-4">
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">주문 확인</h1>
        {k ? (
          <OrderBody orderNo={orderNo} k={k} />
        ) : (
          <Notice>
            주문 화면 열쇠가 없는 주소입니다. 결제 완료 메일에 있는 링크로 다시 들어와 주세요. 메일을
            찾을 수 없으면 {SELLER.email} 로 주문번호({orderNo})와 함께 알려 주세요.
          </Notice>
        )}
      </main>
      <ReelsFooter />
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 rounded-2xl border border-border bg-surface/70 px-5 py-4 text-sm leading-relaxed text-foreground/90">
      {children}
    </p>
  );
}

function OrderBody({ orderNo, k }: { orderNo: string; k: string }) {
  const q = useQuery({
    queryKey: ["reels-order", orderNo, k],
    queryFn: async () => {
      const r = await orderView(orderNo, k);
      if (!r.ok) throw new Error(r.error);
      return r.order;
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (q.isLoading) return <Loader2 aria-hidden className="mt-8 h-6 w-6 animate-spin text-primary" />;
  if (q.error) return <Notice>{(q.error as Error).message}</Notice>;
  const o = q.data;
  if (!o) return null;

  return (
    <div className="mt-6 space-y-6">
      <Summary o={o} />
      {o.status === "pending" && (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-50 p-5">
          <p className="text-sm leading-relaxed text-amber-900">
            결제 확인 중입니다. 결제를 마치셨다면 잠시 뒤 새로 고침해 주세요.
          </p>
          <button
            type="button"
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-600/40 bg-card px-5 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
          >
            <RefreshCw aria-hidden className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} /> 새로 고침
          </button>
        </section>
      )}
      {o.status === "cancelled" && (
        <Notice>
          이 주문은 취소되었습니다. 궁금한 점은 {SELLER.email} 로 주문번호와 함께 알려 주세요.
        </Notice>
      )}
      {o.status === "expired" && (
        <Notice>
          결제가 끝나지 않아 이 주문은 만료되었습니다. 다시 주문하시려면{" "}
          <Link to="/reels" className="font-medium text-primary-glow underline underline-offset-2">
            쇼츠 제작 소개
          </Link>
          에서 상품을 새로 골라 주세요.
        </Notice>
      )}
      {o.status === "paid" && (
        <>
          <FilesUpload orderNo={orderNo} k={k} onDone={() => void q.refetch()} />
          <LinksForm orderNo={orderNo} k={k} onDone={() => void q.refetch()} />
        </>
      )}
      {o.uploads.length > 0 && <UploadedList uploads={o.uploads} />}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-base font-semibold">카카오톡으로 보내기</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          카카오톡으로 보내실 땐 주문번호를 함께 적어 주세요.
        </p>
        <div className="mt-3">
          <KakaoChannelPlaceholder className="w-full sm:w-auto" />
        </div>
      </section>
    </div>
  );
}

function Summary({ o }: { o: OrderView }) {
  const discounted = o.discount > 0;
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">주문번호</div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="font-display text-xl font-bold tracking-tight" data-testid="order-no">
              {o.order_no}
            </span>
            <button
              type="button"
              aria-label="주문번호 복사"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(o.order_no)
                  .then(() => toast.success("주문번호를 복사했습니다."))
                  .catch(() => toast.error("복사하지 못했습니다. 직접 적어 주세요."));
              }}
              className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
            >
              <Copy aria-hidden className="h-3.5 w-3.5" /> 복사
            </button>
          </div>
        </div>
        <ReelsStatusBadge status={o.status} />
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">상호</dt>
        <dd className="min-w-0 break-words">{o.shop_name}</dd>
        <dt className="text-muted-foreground">상품</dt>
        <dd>문의 댓글 쇼츠 {o.plan}편(30초 기준)</dd>
        <dt className="text-muted-foreground">제작 방식</dt>
        <dd>{METHOD_LABEL[o.method] ?? o.method}</dd>
        <dt className="text-muted-foreground">금액</dt>
        <dd>
          {discounted && <s className="mr-2 text-muted-foreground">{won(o.list_price)}</s>}
          <span className="font-semibold">{won(o.amount)}</span>
        </dd>
        <dt className="text-muted-foreground">주문 일시</dt>
        <dd>{kstDateTime(o.created_at)}</dd>
        {o.paid_at && (
          <>
            <dt className="text-muted-foreground">결제 일시</dt>
            <dd>{kstDateTime(o.paid_at)}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

type Pick = { file: File; error: string | null; progress: number; state: "ready" | "uploading" | "done" | "failed"; msg?: string };

function FilesUpload({ orderNo, k, onDone }: { orderNo: string; k: string; onDone: () => void }) {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function onPick(list: FileList | null) {
    const files = Array.from(list ?? []);
    setPicks(
      files.map((f) => ({ file: f, error: uploadFileError(f), progress: 0, state: "ready" as const })),
    );
  }

  async function onUpload() {
    setBusy(true);
    let okCount = 0;
    for (let i = 0; i < picks.length; i++) {
      const p = picks[i];
      if (p.error || p.state === "done") continue;
      setPicks((ps) => ps.map((x, j) => (j === i ? { ...x, state: "uploading", progress: 0.02 } : x)));
      const r = await uploadOrderFile(orderNo, k, p.file, (prog) =>
        setPicks((ps) => ps.map((x, j) => (j === i ? { ...x, progress: prog } : x))),
      );
      setPicks((ps) =>
        ps.map((x, j) =>
          j === i
            ? r.ok
              ? { ...x, state: "done", progress: 1 }
              : { ...x, state: "failed", msg: r.error }
            : x,
        ),
      );
      if (r.ok) okCount++;
    }
    setBusy(false);
    if (okCount) {
      toast.success(`${okCount}개 파일을 올렸습니다.`);
      onDone();
    }
  }

  const uploadable = picks.filter((p) => !p.error && p.state !== "done").length;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" data-testid="files-upload">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <FileUp aria-hidden className="h-4 w-4 text-primary-glow" /> 사진·영상 올리기
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        여러 개를 한 번에 고를 수 있습니다. 한 파일은 500MB까지 됩니다.
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="sr-only"
        data-testid="file-input"
        onChange={(e) => onPick(e.target.files)}
      />
      <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-60"
        >
          파일 고르기
        </button>
        <button
          type="button"
          onClick={() => void onUpload()}
          disabled={busy || uploadable === 0}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
          {uploadable ? `${uploadable}개 올리기` : "올리기"}
        </button>
      </div>
      {picks.length > 0 && (
        <ul className="mt-4 space-y-2">
          {picks.map((p, i) => (
            <li key={`${p.file.name}-${i}`} className="rounded-xl border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{p.file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(p.file.size)}</span>
              </div>
              {p.error ? (
                <div className="mt-1 text-xs text-rose-700">{p.error}</div>
              ) : (
                <>
                  <div
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(p.progress * 100)}
                    aria-label={`${p.file.name} 올리는 중`}
                  >
                    <div
                      className={`h-full rounded-full transition-all ${p.state === "failed" ? "bg-rose-500" : "bg-primary"}`}
                      style={{ width: `${Math.round(p.progress * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {p.state === "ready"
                      ? "올리기 전"
                      : p.state === "uploading"
                        ? "올리는 중"
                        : p.state === "done"
                          ? "올림"
                          : (p.msg ?? "실패")}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const fieldCls =
  "mt-1.5 block w-full rounded-xl border border-input bg-card px-4 py-3 text-base outline-none transition placeholder:text-muted-foreground/80 focus:border-primary focus:ring-2 focus:ring-primary/25";

function LinksForm({ orderNo, k, onDone }: { orderNo: string; k: string; onDone: () => void }) {
  const [homepage, setHomepage] = useState("");
  const [refs, setRefs] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSave() {
    setError(null);
    const hp = homepage.trim();
    if (hp && !isHttpUrl(hp)) return setError("홈페이지 주소는 http:// 또는 https:// 로 시작해야 합니다.");
    const r = parseReferenceUrls(refs);
    if (r.error) return setError(r.error);
    const ne = noteError(note);
    if (ne) return setError(ne);
    if (!hp && r.urls.length === 0 && !note.trim()) return setError("저장할 내용을 하나 이상 적어 주세요.");
    setBusy(true);
    const res = await orderSaveLinks(orderNo, k, {
      ...(hp ? { homepage_url: hp } : {}),
      ...(r.urls.length ? { reference_urls: r.urls } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setHomepage("");
    setRefs("");
    setNote("");
    toast.success("저장했습니다.");
    onDone();
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" data-testid="links-form">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <Link2 aria-hidden className="h-4 w-4 text-primary-glow" /> 주소·요청사항 적기
      </h2>
      <div className="mt-3 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">홈페이지 주소</span>
          <input
            className={fieldCls}
            value={homepage}
            onChange={(e) => setHomepage(e.target.value)}
            placeholder="https://"
            inputMode="url"
            autoCapitalize="none"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">참고 영상 주소</span>
          <span className="block text-xs text-muted-foreground">한 줄에 하나씩, {MAX_REFERENCE_URLS}개까지</span>
          <textarea
            className={`${fieldCls} min-h-28`}
            value={refs}
            onChange={(e) => setRefs(e.target.value)}
            placeholder={"https://www.instagram.com/reel/...\nhttps://www.instagram.com/reel/..."}
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">요청사항</span>
          <textarea
            className={`${fieldCls} min-h-28`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="강조하고 싶은 상품, 꼭 넣을 문구, 피하고 싶은 표현 등"
            maxLength={4000}
          />
        </label>
        {error && (
          <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={busy}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:w-auto"
        >
          {busy && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />} 저장
        </button>
      </div>
    </section>
  );
}

function UploadedList({ uploads }: { uploads: Upload[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" data-testid="uploaded-list">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <StickyNote aria-hidden className="h-4 w-4 text-primary-glow" /> 보내 주신 자료 ({uploads.length})
      </h2>
      <ul className="mt-3 divide-y divide-border">
        {uploads.map((u) => (
          <li key={u.id} className="py-2.5 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {UPLOAD_KIND_LABEL[u.kind] ?? u.kind}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{kstDateTime(u.created_at)}</span>
            </div>
            <div className="mt-1 min-w-0 break-all">
              {u.kind === "file"
                ? `${u.file_name ?? "파일"} ${u.size_bytes ? `(${formatBytes(u.size_bytes)})` : ""}`
                : u.kind === "note"
                  ? <span className="whitespace-pre-wrap break-words">{u.note}</span>
                  : u.url}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
