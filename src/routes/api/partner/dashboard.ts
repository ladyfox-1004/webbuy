// /api/partner/dashboard — 파트너 로그인 대시보드(화면: src/routes/partner.dashboard.tsx). 처리: src/lib/partner/account.ts
// 인증: Authorization: Bearer <Supabase access token> → 서버가 user → partners.user_id 를 service role 로 확인(RLS 정책은 열지 않는다).
//   GET  ?period=7d|30d|month                                   → public.partner_dashboard (계좌는 끝 4자리만)
//   POST {action:'profile', phone, channels}                    → public.partner_update_profile
//   POST {action:'account', bank_name, bank_account, bank_holder, password}
//        → 비밀번호 다시 확인(일회용 클라이언트 signInWithPassword → 그 세션만 바로 로그아웃) → public.partner_change_account
//        → 대표님 카톡 「파트너 계좌 변경: 이름 / 은행 / 끝 4자리 / 시각」. 이미 만든 정산은 만들 때 계좌 그대로.
// 🚨 로그·응답에 계좌 전체 번호·비밀번호를 넣지 마라.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { json } from "@/lib/notify/admin-auth";
import { readNotifyEnv } from "@/lib/notify/env";
import {
  MAX_ACCOUNT_BODY_BYTES,
  bearerToken,
  parsePeriod,
  processDashboardGet,
  processDashboardPost,
  type DashboardDeps,
} from "@/lib/partner/account";
import { ADMIN_PARTNERS_URL } from "@/lib/partner/apply";
import { notifyOwner, parseJson, partnerDb, readLimitedText, sameOrigin, userFromToken } from "@/lib/partner/server";
import type { ServiceDb } from "@/lib/notify/token-store";

function deps(db: ServiceDb): DashboardDeps {
  return {
    getUser: (token) => userFromToken(db, token),
    dashboard: async (userId, period) => {
      const { data, error } = await db.rpc("partner_dashboard", { _user_id: userId, _period: period });
      if (error) {
        console.error(`[partner/dashboard] rpc 실패 [${error.code ?? "?"}]`);
        throw new Error("rpc");
      }
      return (data ?? null) as Record<string, unknown> | null;
    },
    updateProfile: async (userId, phone, channels) => {
      const { data, error } = await db.rpc("partner_update_profile", { _user_id: userId, _phone: phone, _channels: channels });
      if (error) throw new Error(`rpc_${error.code ?? "?"}`);
      return data as unknown as { ok: boolean; reason?: string };
    },
    changeAccount: async (userId, bankName, bankAccount, bankHolder, userAgent) => {
      const { data, error } = await db.rpc("partner_change_account", {
        _user_id: userId,
        _bank_name: bankName,
        _bank_account: bankAccount,
        _bank_holder: bankHolder,
        _user_agent: userAgent,
      });
      if (error) throw new Error(`rpc_${error.code ?? "?"}`);
      return data as unknown as Awaited<ReturnType<DashboardDeps["changeAccount"]>>;
    },
    verifyPassword: async (email, password) => {
      const env = readNotifyEnv();
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return false;
      // 일회용 클라이언트(저장 안 함). 확인만 하고 방금 만든 세션은 바로 끝낸다(scope local = 그 세션만).
      const tmp = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { storage: undefined, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data, error } = await tmp.auth.signInWithPassword({ email, password });
      if (error || !data.session) return false;
      await tmp.auth.signOut({ scope: "local" }).catch(() => undefined);
      return true;
    },
    notify: (text) => notifyOwner(db, text, ADMIN_PARTNERS_URL, "파트너 보기"),
  };
}

export const Route = createFileRoute("/api/partner/dashboard")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const db = partnerDb();
        if (!db) return json({ ok: false, error: "잠시 뒤 다시 열어 주세요." }, 503);
        const period = parsePeriod(new URL(request.url).searchParams.get("period"));
        const r = await processDashboardGet(bearerToken(request.headers.get("authorization")), period, deps(db));
        return json(r.body, r.status);
      },
      POST: async ({ request }) => {
        if (!sameOrigin(request)) return json({ ok: false, reason: "invalid", error: "잘못된 요청입니다." }, 403);
        const raw = await readLimitedText(request, MAX_ACCOUNT_BODY_BYTES);
        if (raw === null) return json({ ok: false, reason: "invalid", error: "입력이 너무 깁니다." }, 413);
        const db = partnerDb();
        if (!db) return json({ ok: false, reason: "server", error: "잠시 뒤 다시 시도해 주세요." }, 503);
        const r = await processDashboardPost(
          parseJson(raw),
          bearerToken(request.headers.get("authorization")),
          request.headers.get("user-agent"),
          deps(db),
        );
        return json(r.body, r.status);
      },
    },
  },
});
