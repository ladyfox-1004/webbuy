// 페이지 이동마다 방문 기록 한 번(src/lib/analytics/client-track.ts). 화면에는 아무것도 그리지 않는다.
// 서버에서 그릴 때는 useEffect 가 돌지 않으므로 브라우저에서만 보낸다.
import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { trackPageView } from "@/lib/analytics/client-track";

export function VisitTracker() {
  const pathname = useLocation({ select: (l) => l.pathname });
  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);
  return null;
}
