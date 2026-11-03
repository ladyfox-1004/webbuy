// /admin/kakao-connect — 상담 접수 카톡 알림("나에게 보내기")을 대표님 카카오 계정에 연결하는 1회용 화면.
// 흐름: [카카오로 연결] → 카카오 로그인·동의(카카오톡 메시지 전송) → /api/kakao/callback 이 리프레시 토큰 저장
//       → 이 화면으로 돌아와 결과 표시 → [시험 메시지 보내기]로 확인.
// 🚨 반드시 알림을 받을 대표님 카카오 계정으로 로그인해야 한다("나에게 보내기"는 로그인한 사람에게 간다).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, MessageCircle, Send } from "lucide-react";
import { adminFetch, useAdminGate } from "@/hooks/useAdminGate";

export const Route = createFileRoute("/admin_/kakao-connect")({
  component: KakaoConnectPage,
  validateSearch: (s: Record<string, unknown>): { result?: string } => ({
    result: typeof s.result === "string" ? s.result : undefined,
  }),
  head: () => ({
    meta: [
      { title: "카카오톡 알림 연결 — 에이아이솔루션 관리자" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Status = {
  connected: boolean;
  refreshTokenExpiresAt: string | null;
  connectedAt: string | null;
  tableMissing: boolean;
  hasRestApiKey: boolean;
  hasClientSecret: boolean;
  hasSeedRefreshToken: boolean;
  redirectUri: string;
  error?: string;
};

const RESULT_TEXT: Record<string, string> = {
  ok: "연결했습니다. 아래 [시험 메시지 보내기]로 카톡이 오는지 확인하세요.",
  bad_state: "연결 요청이 오래됐거나 이 화면에서 시작한 요청이 아닙니다. 다시 눌러 주세요.",
  missing_code: "카카오가 인가 코드를 돌려주지 않았습니다. 다시 시도해 주세요.",
  no_table: "kakao_oauth_tokens 표가 없습니다. 마이그레이션을 먼저 적용하세요.",
  no_service_key: "서버에 SUPABASE_SERVICE_ROLE_KEY 가 없습니다.",
  no_rest_api_key: "서버에 KAKAO_REST_API_KEY 가 없습니다.",
};

function fmt(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })
    : "-";
}

function KakaoConnectPage() {
  const ok = useAdminGate();
  if (!ok) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  return <KakaoConnect />;
}

function KakaoConnect() {
  const { result } = Route.useSearch();
  const [busy, setBusy] = useState<"start" | "test" | null>(null);
  const status = useQuery({
    queryKey: ["admin-kakao-status"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/kakao");
      const body = (await res.json()) as Status;
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body;
    },
  });

  async function post(action: "start" | "test") {
    setBusy(action);
    try {
      const res = await adminFetch("/api/admin/kakao", {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      const body = (await res.json()) as { url?: string; status?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      if (action === "start" && body.url) {
        window.location.href = body.url;
        return;
      }
      if (body.status === "ok")
        toast.success("시험 메시지를 보냈습니다. 카카오톡 「나와의 채팅」을 확인하세요.");
      else toast.error(`보내지 못했습니다: ${body.status}`);
      status.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const s = status.data;
  const resultText = result ? (RESULT_TEXT[result] ?? `연결 실패: ${result}`) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link
        to="/admin/inquiries"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> 상담 접수
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold">카카오톡 알림 연결</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        홈페이지로 상담이 접수되면 대표님 카카오톡 「나와의 채팅」으로 요약이 옵니다. 처음 한 번만
        연결하면 됩니다. <b className="text-foreground">알림을 받을 카카오 계정으로 로그인</b>해
        주세요.
      </p>

      {resultText && (
        <div
          className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
            result === "ok"
              ? "border-emerald-600/30 bg-emerald-50 text-emerald-900"
              : "border-rose-600/30 bg-rose-50 text-rose-900"
          }`}
        >
          {resultText}
        </div>
      )}

      {status.isLoading && <Loader2 className="mt-6 h-5 w-5 animate-spin text-primary" />}
      {status.error && (
        <p className="mt-6 text-sm text-rose-700">{(status.error as Error).message}</p>
      )}

      {s && (
        <dl className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card text-sm">
          <Row
            k="연결 상태"
            v={s.connected ? "연결됨" : s.hasSeedRefreshToken ? "시크릿 토큰만 있음" : "연결 안 됨"}
          />
          <Row k="연결한 때" v={fmt(s.connectedAt)} />
          <Row k="리프레시 토큰 만료" v={fmt(s.refreshTokenExpiresAt)} />
          <Row k="REST API 키" v={s.hasRestApiKey ? "설정됨" : "없음 — KAKAO_REST_API_KEY"} />
          <Row
            k="Client Secret"
            v={s.hasClientSecret ? "설정됨" : "없음(카카오 앱에서 끈 경우 정상)"}
          />
          <Row k="카카오에 등록할 Redirect URI" v={s.redirectUri} mono />
          {s.tableMissing && <Row k="저장 표" v="kakao_oauth_tokens 없음 — 마이그레이션 필요" />}
        </dl>
      )}

      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
        <button
          type="button"
          disabled={!!busy || !s?.hasRestApiKey}
          onClick={() => post("start")}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#FEE500] px-6 font-semibold text-[#191919] disabled:opacity-50"
        >
          {busy === "start" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MessageCircle className="h-4 w-4" />
          )}
          {s?.connected ? "카카오 다시 연결" : "카카오로 연결"}
        </button>
        <button
          type="button"
          disabled={!!busy || !(s?.connected || s?.hasSeedRefreshToken)}
          onClick={() => post("test")}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-border px-6 font-medium disabled:opacity-50"
        >
          {busy === "test" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          시험 메시지 보내기
        </button>
      </div>
      {s?.connected && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> 토큰은 접수 때마다 자동으로 갱신·저장됩니다.
        </p>
      )}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
      <dt className="w-44 shrink-0 text-muted-foreground">{k}</dt>
      <dd className={`min-w-0 break-all text-foreground ${mono ? "font-mono text-xs" : ""}`}>
        {v}
      </dd>
    </div>
  );
}
