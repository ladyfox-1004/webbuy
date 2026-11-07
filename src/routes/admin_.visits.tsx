// /admin/visits — 홈페이지 방문 기록(관리자 전용). 당근마켓 광고 → 홈페이지 유입과 상담 접수를 한눈에.
// 🚨 파일 이름이 admin_.visits 인 이유는 admin_.blog.tsx 머리 주석과 같다(/admin 에 <Outlet/> 이 없다).
// 🚨 head 에는 title·robots 만. canonical 넣지 마라(루트 head 와 합쳐진다).
// 자료: GET /api/admin/visits (src/routes/api/admin/visits.ts) — 우리 기록(site_visit_stats) + Cloudflare 숫자.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { adminFetch, useAdminGate } from "@/hooks/useAdminGate";

export const Route = createFileRoute("/admin_/visits")({
  component: AdminVisitsPage,
  head: () => ({
    meta: [{ title: "방문 기록 — 에이아이솔루션 관리자" }, { name: "robots", content: "noindex" }],
  }),
});

type Summary = {
  window: "today" | "7d" | "30d";
  days: number;
  visitors: number;
  pageviews: number;
  daangn_visitors: number;
  inquiries: number;
};
type Daily = {
  day: string;
  visitors: number;
  pageviews: number;
  daangn_visitors: number;
  inquiries: number;
};
type Stats = {
  today: string;
  summary: Summary[];
  daily: Daily[];
  sources: { source: string; visitors: number }[];
  top_pages: { path: string; views: number; visitors: number }[];
};
type CfDay = { date: string; pageViews: number; uniques: number; requests: number };
type Cloudflare = { connected: false } | { connected: true; days?: CfDay[]; error?: string };
type Resp = { stats?: Stats; cloudflare?: Cloudflare; error?: string };

const WINDOW_LABEL: Record<Summary["window"], string> = {
  today: "오늘",
  "7d": "최근 7일",
  "30d": "최근 30일",
};

const SOURCE_LABEL: Record<string, string> = {
  daangn: "당근",
  naver: "네이버",
  google: "구글",
  instagram: "인스타그램",
  kakao: "카카오톡",
  email: "영업 메일",
  direct: "바로 들어옴(주소 입력·즐겨찾기 등)",
  other: "그 밖의 사이트",
};

const n = (v: number) => v.toLocaleString("ko-KR");

/** '2026-11-07' → '11월 7일 (토)' */
function dayLabel(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const w = ["일", "월", "화", "수", "목", "금", "토"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일 (${w})`;
}

function AdminVisitsPage() {
  const ok = useAdminGate();
  if (!ok) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  return <AdminVisits />;
}

function AdminVisits() {
  const q = useQuery({
    queryKey: ["admin-visits"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/visits");
      const body = (await res.json()) as Resp;
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body;
    },
  });
  const stats = q.data?.stats;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> 관리자
          </Link>
          <h1 className="font-display text-2xl font-bold">방문 기록</h1>
        </div>
        <button
          type="button"
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} /> 새로고침
        </button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        방문자는 같은 휴대폰·컴퓨터를 한 명으로 셉니다. 날짜는 한국 시간 기준입니다. 관리자 본인과
        검색 로봇은 빼고 셉니다. 이 기록은 기능을 켠 날부터 쌓입니다.
      </p>

      {q.isLoading && <Loader2 className="mt-10 h-6 w-6 animate-spin text-primary" />}
      {q.error && <p className="mt-6 text-sm text-rose-700">{(q.error as Error).message}</p>}

      {stats && (
        <>
          <section className="mt-6 grid gap-3 sm:grid-cols-3">
            {stats.summary.map((s) => (
              <div key={s.window} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="text-sm text-muted-foreground">{WINDOW_LABEL[s.window]} 방문자</div>
                <div className="mt-1 font-display text-3xl font-bold text-foreground">
                  {n(s.visitors)}
                  <span className="ml-1 text-base font-normal text-muted-foreground">명</span>
                </div>
                <dl className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">그중 당근에서 온 사람</dt>
                    <dd className="font-semibold text-foreground">{n(s.daangn_visitors)}명</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">상담 접수</dt>
                    <dd className="font-semibold text-foreground">{n(s.inquiries)}건</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">본 페이지 수</dt>
                    <dd className="text-foreground">{n(s.pageviews)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </section>
          <p className="mt-2 text-xs text-muted-foreground">
            상담 접수는 이름에 「테스트」가 들어간 시험 건을 빼고 셉니다.
          </p>

          <section className="mt-8 grid gap-6 md:grid-cols-2">
            <SourceList sources={stats.sources} />
            <TopPages pages={stats.top_pages} />
          </section>

          <DailyTable daily={stats.daily} />
        </>
      )}

      {q.data?.cloudflare && <CloudflareBox cf={q.data.cloudflare} />}
    </div>
  );
}

function SourceList({ sources }: { sources: Stats["sources"] }) {
  const max = Math.max(1, ...sources.map((s) => s.visitors));
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold">어디서 왔나 (최근 30일 방문자)</h2>
      {sources.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">아직 기록이 없습니다.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {sources.map((s) => (
            <li key={s.source} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="min-w-0 truncate">{SOURCE_LABEL[s.source] ?? s.source}</span>
                <span className="shrink-0 font-semibold">{n(s.visitors)}명</span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                <div
                  className={`h-1.5 rounded-full ${s.source === "daangn" ? "bg-orange-500" : "bg-primary"}`}
                  style={{ width: `${(s.visitors / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TopPages({ pages }: { pages: Stats["top_pages"] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold">많이 본 페이지 (최근 30일, 상위 10개)</h2>
      {pages.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">아직 기록이 없습니다.</p>
      ) : (
        <ol className="mt-3 space-y-1.5 text-sm">
          {pages.map((p, i) => (
            <li key={p.path} className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 break-all">
                <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
                {p.path === "/" ? "/ (첫 화면)" : p.path}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {n(p.views)}회 · {n(p.visitors)}명
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function DailyTable({ daily }: { daily: Daily[] }) {
  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold">날짜별 (최근 30일, 한국 날짜)</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2 pr-2 font-medium">날짜</th>
              <th className="px-2 py-2 text-right font-medium">방문자</th>
              <th className="px-2 py-2 text-right font-medium">본 페이지</th>
              <th className="px-2 py-2 text-right font-medium">당근 방문자</th>
              <th className="py-2 pl-2 text-right font-medium">상담 접수</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => {
              const empty = d.visitors === 0 && d.inquiries === 0;
              return (
                <tr
                  key={d.day}
                  className={`border-b border-border/50 last:border-0 ${empty ? "text-muted-foreground" : ""}`}
                >
                  <td className="py-1.5 pr-2 whitespace-nowrap">{dayLabel(d.day)}</td>
                  <td className="px-2 py-1.5 text-right">{n(d.visitors)}</td>
                  <td className="px-2 py-1.5 text-right">{n(d.pageviews)}</td>
                  <td className="px-2 py-1.5 text-right">{n(d.daangn_visitors)}</td>
                  <td className="py-1.5 pl-2 text-right">{n(d.inquiries)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CloudflareBox({ cf }: { cf: Cloudflare }) {
  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold">Cloudflare 숫자 (참고용)</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        로봇이 섞인 숫자라 위의 우리 기록보다 많게 나옵니다. 날짜는 Cloudflare 기준(한국보다 9시간
        늦은 세계 표준시)입니다.
      </p>
      {!cf.connected ? (
        <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Cloudflare 연결 안 됨 — 읽기 전용 토큰을 넣으면 오늘 이전 기록도 보여요.
        </p>
      ) : cf.error ? (
        <p className="mt-3 rounded-xl border border-rose-500/40 bg-rose-50 px-4 py-2 text-sm text-rose-800">
          {cf.error}
        </p>
      ) : (cf.days ?? []).length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Cloudflare 기록이 없습니다.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-2 font-medium">날짜</th>
                <th className="px-2 py-2 text-right font-medium">고유 방문자</th>
                <th className="py-2 pl-2 text-right font-medium">페이지뷰</th>
              </tr>
            </thead>
            <tbody>
              {(cf.days ?? []).map((d) => (
                <tr key={d.date} className="border-b border-border/50 last:border-0">
                  <td className="py-1.5 pr-2 whitespace-nowrap">{dayLabel(d.date)}</td>
                  <td className="px-2 py-1.5 text-right">{n(d.uniques)}</td>
                  <td className="py-1.5 pl-2 text-right">{n(d.pageViews)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
