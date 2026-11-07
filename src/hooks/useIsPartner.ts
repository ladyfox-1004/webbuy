// 로그인한 사람이 파트너(계정 연결된 승인 파트너)인가 — 사이트 머리 메뉴의 「파트너 대시보드」 링크용.
// partners 표는 브라우저가 못 읽는다(RLS 정책 0개) → 서버 /api/partner/session 에 세션 토큰을 붙여 묻는다.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type SessionKind = { admin: boolean; partner: boolean };

/** /api/partner/session. 실패하면 둘 다 false(던지지 않는다) */
export async function fetchSessionKind(): Promise<SessionKind> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { admin: false, partner: false };
    const res = await fetch("/api/partner/session", { headers: { authorization: `Bearer ${token}` } });
    const b = (await res.json().catch(() => ({}))) as Partial<SessionKind>;
    return { admin: b.admin === true, partner: b.partner === true };
  } catch {
    return { admin: false, partner: false };
  }
}

export function useIsPartner(): boolean {
  const { user } = useAuth();
  const [isPartner, setIsPartner] = useState(false);
  useEffect(() => {
    if (!user) {
      setIsPartner(false);
      return;
    }
    let alive = true;
    fetchSessionKind().then((k) => alive && setIsPartner(k.partner));
    return () => {
      alive = false;
    };
  }, [user]);
  return isPartner;
}
