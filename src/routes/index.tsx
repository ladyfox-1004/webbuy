import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight,
  ExternalLink,
  Sparkles,
  Code2,
  Zap,
  Mail,
  CreditCard,
  Loader2,
  Smartphone,
  LogIn,
  LogOut,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import { PORTONE_CONFIG } from "@/lib/portone-config";
import { verifyPayment } from "@/lib/payments.functions";
import { listProducts } from "@/lib/products.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Studio — 내가 만든 웹앱들" },
      { name: "description", content: "내가 만든 사이드 프로젝트와 SaaS를 한자리에서. 포트원으로 즉시 결제." },
    ],
  }),
});

type Product = {
  id: string;
  title: string;
  tag: string;
  description: string;
  amount: number;
  span: string;
  accent: string;
  slug?: string | null;
};

function Index() {
  return (
    <div className="min-h-screen text-foreground">
      <Nav />
      <Hero />
      <Projects />
      <About />
      <Contact />
      <Footer />
    </div>
  );
}

function Nav() {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="mx-auto mt-4 max-w-6xl px-4">
        <nav className="glass flex items-center justify-between rounded-full px-5 py-3">
          <Link to="/" className="flex items-center gap-2 font-display font-bold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground text-xs">
              ◆
            </span>
            Studio
          </Link>
          <div className="hidden gap-7 text-sm text-muted-foreground md:flex">
            <a href="#projects" className="transition hover:text-foreground">Projects</a>
            <Link to="/sell" className="transition hover:text-foreground">판매하기</Link>
            {user && (
              <>
                <Link to="/dashboard" className="transition hover:text-foreground">대시보드</Link>
                <Link to="/me" className="transition hover:text-foreground">보관함</Link>
              </>
            )}
            {isAdmin && (
              <Link to="/admin" className="inline-flex items-center gap-1 text-primary-glow transition hover:text-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />Admin
              </Link>
            )}
          </div>
          {user ? (
            <button
              onClick={() => supabase.auth.signOut()}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/40 px-4 py-2 text-sm text-foreground transition hover:bg-surface"
            >
              <LogOut className="h-4 w-4" />로그아웃
            </button>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              <LogIn className="h-4 w-4" />로그인
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative px-4 pt-40 pb-24 md:pt-48 md:pb-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/40 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-primary-glow" />
          포트원 결제 연동 · 라이브
        </div>
        <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl lg:text-8xl">
          내가 만든 웹앱들,
          <br />
          <span className="text-gradient">한자리에서.</span>
        </h1>
        <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
          작업한 사이드 프로젝트와 SaaS를 모아 보여주고, 포트원으로 즉시 결제까지.
          하나의 스튜디오, 무한한 실험.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href="#projects"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3 font-medium text-primary-foreground shadow-[var(--shadow-glow)] transition hover:scale-[1.02]"
          >
            프로젝트 보기 <ArrowUpRight className="h-4 w-4" />
          </a>
          <a
            href="#contact"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/40 px-6 py-3 font-medium text-foreground backdrop-blur transition hover:bg-surface"
          >
            문의하기
          </a>
        </div>
      </div>
    </section>
  );
}

function Projects() {
  const fetchProducts = useServerFn(listProducts);
  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => fetchProducts(),
  });

  return (
    <section id="projects" className="px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 flex items-end justify-between">
          <div>
            <div className="mb-3 text-sm font-medium text-primary-glow">— Projects</div>
            <h2 className="font-display text-4xl font-bold md:text-5xl">컬렉션</h2>
          </div>
          <div className="hidden text-sm text-muted-foreground md:block">
            클릭해서 바로 결제하고 사용하기
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid auto-rows-[minmax(0,auto)] grid-cols-1 gap-4 md:grid-cols-3">
            {(products ?? []).map((p) => (
              <ProjectCard key={p.id} project={p as Product} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ProjectCard({ project }: { project: Product }) {
  const [loading, setLoading] = useState(false);
  const verify = useServerFn(verifyPayment);
  const navigate = useNavigate();

  async function pay(method: "CARD" | "EASY_PAY") {
    const channelKey = method === "CARD" ? PORTONE_CONFIG.channelKeyCard : PORTONE_CONFIG.channelKeyEasyPay;
    if (!channelKey) {
      toast.error("카드 결제 채널이 아직 설정되지 않았습니다. 간편결제를 이용해 주세요.");
      return;
    }
    setLoading(true);
    try {
      const PortOne = (await import("@portone/browser-sdk/v2")).default;
      const paymentId = `pay-${crypto.randomUUID()}`;
      const result = await PortOne.requestPayment({
        storeId: PORTONE_CONFIG.storeId,
        channelKey,
        paymentId,
        orderName: project.title,
        totalAmount: project.amount,
        currency: "CURRENCY_KRW",
        payMethod: method,
      });

      if (result?.code !== undefined) {
        toast.error(result.message ?? "결제가 취소되었습니다.");
        return;
      }

      toast.loading("결제 검증 중…", { id: paymentId });
      const verification = await verify({
        data: {
          paymentId,
          expectedAmount: project.amount,
          productTitle: project.title,
          productId: project.id,
        },
      });
      toast.dismiss(paymentId);
      navigate({ to: "/payment/result", search: { paymentId, ok: verification.ok ? 1 : 0 } });
    } catch (err) {
      console.error(err);
      toast.error("결제 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <article
      className={`glow-hover group relative overflow-hidden rounded-3xl border border-border bg-surface/60 p-6 ${project.span}`}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${project.accent} opacity-60`}
      />
      <div className="relative flex h-full flex-col justify-between gap-8">
        <div className="flex items-start justify-between">
          <span className="rounded-full border border-border/80 bg-background/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            {project.tag}
          </span>
          <ArrowUpRight className="h-5 w-5 text-muted-foreground transition group-hover:rotate-45 group-hover:text-primary-glow" />
        </div>
        <div>
          <h3 className="font-display text-2xl font-semibold text-foreground md:text-3xl">
            {project.title}
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
            {project.description}
          </p>
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
            <span className="font-display text-lg font-semibold whitespace-nowrap">
              ₩{project.amount.toLocaleString("ko-KR")}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => pay("CARD")}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-gradient-to-br hover:from-primary hover:to-primary-glow hover:text-primary-foreground disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                카드
              </button>
              <button
                onClick={() => pay("EASY_PAY")}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-gradient-to-br hover:from-primary hover:to-primary-glow hover:text-primary-foreground disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Smartphone className="h-3.5 w-3.5" />}
                간편결제
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function About() {
  return (
    <section id="about" className="px-4 py-24">
      <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-2 md:gap-20">
        <div>
          <div className="mb-3 text-sm font-medium text-primary-glow">— About</div>
          <h2 className="font-display text-4xl font-bold leading-tight md:text-5xl">
            혼자 만드는 작은 스튜디오.
          </h2>
        </div>
        <div className="space-y-6 text-muted-foreground">
          <p className="text-lg leading-relaxed">
            아이디어가 떠오르면 주말에 만들고, 다음 주말에 출시합니다. 빠르게 만들고,
            진짜 쓰는 사람들에게서 배웁니다.
          </p>
          <div className="grid grid-cols-2 gap-4 pt-4">
            {[
              { i: Code2, t: "Full-stack" },
              { i: Zap, t: "Ship Fast" },
              { i: CreditCard, t: "PortOne" },
              { i: UserIcon, t: "AI Native" },
            ].map(({ i: Icon, t }) => (
              <div key={t} className="flex items-center gap-3 rounded-2xl border border-border bg-surface/40 px-4 py-3">
                <Icon className="h-4 w-4 text-primary-glow" />
                <span className="text-sm text-foreground">{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contact" className="px-4 py-24">
      <div className="mx-auto max-w-4xl">
        <div className="glass relative overflow-hidden rounded-3xl p-10 md:p-16">
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/30 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-primary-glow/20 blur-3xl" />
          <div className="relative">
            <div className="mb-3 text-sm font-medium text-primary-glow">— Contact</div>
            <h2 className="font-display text-4xl font-bold md:text-5xl">함께 만들어요.</h2>
            <p className="mt-4 max-w-lg text-muted-foreground md:text-lg">
              협업, 외주, 혹은 그냥 인사. 무엇이든 환영합니다.
            </p>
            <a
              href="mailto:nancoco0705@gmail.com"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3 font-medium text-primary-foreground transition hover:scale-[1.02]"
            >
              <Mail className="h-4 w-4" /><span>nancoco0705@gmail.com</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/40 px-4 py-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Link to="/terms" className="text-muted-foreground transition hover:text-foreground">이용약관</Link>
          <Link to="/privacy" className="font-medium text-foreground transition hover:text-primary-glow">개인정보처리방침</Link>
          <Link to="/refund" className="text-muted-foreground transition hover:text-foreground">환불 정책</Link>
        </div>

        <div className="rounded-2xl border border-border/60 bg-surface/40 p-5 text-xs leading-relaxed text-muted-foreground md:text-sm">
          <div className="mb-2 font-display text-sm font-semibold text-foreground md:text-base">핑크폭스 (PINKFOX)</div>
          <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
            <div><span className="text-foreground/70">대표</span> · 이서연</div>
            <div><span className="text-foreground/70">사업자등록번호</span> · 215-28-82229</div>
            <div className="md:col-span-2"><span className="text-foreground/70">주소</span> · 서울특별시 서초구 서초중앙로29길 16-6, 대림빌라 B-303</div>
            <div><span className="text-foreground/70">고객센터</span> · 02-533-1134</div>
            <div><span className="text-foreground/70">이메일</span> · nancoco0705@gmail.com</div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground md:flex-row">
          <div>© {new Date().getFullYear()} PINKFOX. All rights reserved.</div>
          <div className="flex items-center gap-2">
            Powered by <span className="text-foreground">PortOne</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </footer>
  );
}

