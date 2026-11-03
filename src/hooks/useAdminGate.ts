// 화면이 뜬 뒤 관리자인지 확인한다(user_roles.role='admin'). 아니면 /login 또는 / 로 보낸다.
// 🚨 beforeLoad 에 두지 않는 이유는 src/routes/admin_.blog.tsx 머리 주석 참고(세션이 브라우저에만 있다).
//    실제 보호는 서버 API 의 checkAdmin 과 RLS 가 한다. 이 훅은 화면을 가리는 용도다.
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useAdminGate(): boolean {
  const navigate = useNavigate();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return void navigate({ to: "/login", replace: true });
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!role) return void navigate({ to: "/", replace: true });
      if (alive) setOk(true);
    })();
    return () => {
      alive = false;
    };
  }, [navigate]);
  return ok;
}

/** 로그인한 관리자의 access token 을 붙여 관리자 API 를 부른다. */
export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? "";
  return fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
      authorization: `Bearer ${token}`,
    },
  });
}
