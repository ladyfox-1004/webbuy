// /api/partner/signup — 파트너 계정 만들기(화면: src/routes/partner.signup.tsx). 처리: src/lib/partner/account.ts
//   GET  ?k=<view_key>                  → {ok, name, email, has_account}  (이메일은 신청 때 것으로 고정)
//   POST {k, password}                  → 서버가 service role admin.createUser(email_confirm:true) → partner_link_user 로 연결
//                                          (인증 메일 없이 바로 로그인. 연결이 실패하면 방금 만든 계정을 지운다)
//   POST {k, mode:'link'} + Bearer      → 이미 사이트 계정이 있는 사람: 지금 로그인한 계정(이메일이 신청 이메일과 같을 때)과 연결
// 🚨 로그·응답에 비밀번호·view_key 를 넣지 마라.
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/notify/admin-auth";
import {
  MAX_ACCOUNT_BODY_BYTES,
  bearerToken,
  processSignup,
  processSignupInfo,
  type AccountTarget,
  type SignupDeps,
} from "@/lib/partner/account";
import { parseJson, partnerDb, readLimitedText, sameOrigin, userFromToken } from "@/lib/partner/server";
import type { ServiceDb } from "@/lib/notify/token-store";

function deps(db: ServiceDb): SignupDeps {
  return {
    target: async (k) => {
      const { data, error } = await db.rpc("partner_account_target", { _view_key: k });
      if (error) throw new Error(`rpc_${error.code ?? "?"}`);
      return data as unknown as AccountTarget;
    },
    createUser: async (email, password) => {
      const { data, error } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { partner: true },
      });
      if (error || !data.user) {
        const code = (error as { code?: string } | null)?.code ?? "";
        const msg = error?.message ?? "";
        if (code === "email_exists" || /already.*(registered|exists)/i.test(msg)) return { ok: false, reason: "email_exists" };
        if (code === "weak_password") return { ok: false, reason: "weak_password" };
        console.error(`[partner/signup] 계정 만들기 실패 [${code || error?.status || "?"}]`);
        return { ok: false, reason: "failed" };
      }
      return { ok: true, id: data.user.id };
    },
    deleteUser: async (id) => {
      const { error } = await db.auth.admin.deleteUser(id);
      if (error) throw new Error("delete_failed");
    },
    link: async (k, userId, email) => {
      const { data, error } = await db.rpc("partner_link_user", { _view_key: k, _user_id: userId, _email: email });
      if (error) throw new Error(`rpc_${error.code ?? "?"}`);
      return data as unknown as { ok: true } | { ok: false; reason: string };
    },
    getUser: (token) => userFromToken(db, token),
  };
}

export const Route = createFileRoute("/api/partner/signup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const k = new URL(request.url).searchParams.get("k") ?? "";
        const db = partnerDb();
        if (!db) return json({ ok: false, error: "잠시 뒤 다시 열어 주세요." }, 503);
        const r = await processSignupInfo(k, deps(db));
        return json(r.body, r.status);
      },
      POST: async ({ request }) => {
        if (!sameOrigin(request)) return json({ ok: false, reason: "invalid", error: "잘못된 요청입니다." }, 403);
        const raw = await readLimitedText(request, MAX_ACCOUNT_BODY_BYTES);
        if (raw === null) return json({ ok: false, reason: "invalid", error: "입력이 너무 깁니다." }, 413);
        const db = partnerDb();
        if (!db) return json({ ok: false, reason: "server", error: "잠시 뒤 다시 시도해 주세요." }, 503);
        const r = await processSignup(parseJson(raw), bearerToken(request.headers.get("authorization")), deps(db));
        return json(r.body, r.status);
      },
    },
  },
});
