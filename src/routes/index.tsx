import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, ExternalLink, Sparkles, Code2, Zap, Mail, CreditCard } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Studio — 만든 웹앱을 한자리에" },
      { name: "description", content: "내가 만든 웹앱들을 한자리에서 보고, 포트원 결제로 바로 이용할 수 있는 스튜디오." },
      { property: "og:title", content: "Studio — 만든 웹앱을 한자리에" },
      { property: "og:description", content: "포트원 결제를 통해 바로 이용 가능한 웹앱 컬렉션." },
    ],
  }),
  component: Index,
});

type Project = {
  title: string;
  tag: string;
  description: string;
  span: string; // tailwind classes for masonry sizing
  accent: string;
  price?: string;
  url?: string;
};

const projects: Project[] = [
  {
    title: "노션 자동화 봇",
    tag: "Productivity",
    description: "노션 워크스페이스에 일정·할일·메모를 자동 정리해주는 AI 에이전트.",
    span: "md:col-span-2 md:row-span-2 min-h-[420px]",
    accent: "from-primary/40 to-primary-glow/10",
    price: "₩9,900 / 월",
  },
  {
    title: "AI 카피라이터",
    tag: "Marketing",
    description: "브랜드 톤에 맞춘 인스타·블로그 카피를 한 번에.",
    span: "min-h-[220px]",
    accent: "from-primary-glow/30 to-transparent",
    price: "₩4,900",
  },
  {
    title: "포트원 결제 데모",
    tag: "Payments",
    description: "실제 결제 흐름을 체험할 수 있는 라이브 데모.",
    span: "min-h-[220px]",
    accent: "from-accent/30 to-transparent",
    price: "Free",
  },
  {
    title: "수익 대시보드",
    tag: "Analytics",
    description: "여러 SaaS의 매출·구독을 한 화면에서.",
    span: "md:col-span-2 min-h-[260px]",
    accent: "from-primary/30 to-primary-glow/20",
    price: "₩19,000 / 월",
  },
  {
    title: "PDF 요약기",
    tag: "AI Tool",
    description: "긴 문서를 한 페이지 인사이트로.",
    span: "min-h-[240px]",
    accent: "from-primary-glow/25 to-transparent",
    price: "₩2,900",
  },
  {
    title: "이력서 빌더",
    tag: "Career",
    description: "AI가 직무에 맞춰 다듬어주는 이력서 에디터.",
    span: "md:col-span-2 min-h-[240px]",
    accent: "from-primary/35 to-transparent",
    price: "₩7,900",
  },
];

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
  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="mx-auto mt-4 max-w-6xl px-4">
        <nav className="glass flex items-center justify-between rounded-full px-5 py-3">
          <a href="#top" className="flex items-center gap-2 font-display font-bold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground text-xs">
              ◆
            </span>
            Studio
          </a>
          <div className="hidden gap-7 text-sm text-muted-foreground md:flex">
            <a href="#projects" className="transition hover:text-foreground">Projects</a>
            <a href="#about" className="transition hover:text-foreground">About</a>
            <a href="#contact" className="transition hover:text-foreground">Contact</a>
          </div>
          <a
            href="#projects"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            둘러보기 <ArrowUpRight className="h-4 w-4" />
          </a>
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

        <div className="mt-20 grid grid-cols-3 gap-6 border-t border-border/50 pt-10 md:gap-12">
          {[
            { n: "12+", l: "출시한 웹앱" },
            { n: "3.4k", l: "월간 사용자" },
            { n: "99.9%", l: "결제 성공률" },
          ].map((s) => (
            <div key={s.l}>
              <div className="font-display text-3xl font-bold text-foreground md:text-4xl">{s.n}</div>
              <div className="mt-1 text-sm text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Projects() {
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

        <div className="grid auto-rows-[minmax(0,auto)] grid-cols-1 gap-4 md:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.title} project={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProjectCard({ project }: { project: Project }) {
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
          {project.price && (
            <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
              <span className="font-display text-lg font-semibold">{project.price}</span>
              <button className="inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-3 py-1.5 text-xs font-medium text-foreground transition group-hover:bg-gradient-to-br group-hover:from-primary group-hover:to-primary-glow group-hover:text-primary-foreground">
                <CreditCard className="h-3.5 w-3.5" /> 결제
              </button>
            </div>
          )}
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
              { i: Sparkles, t: "AI Native" },
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
              href="mailto:hello@example.com"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3 font-medium text-primary-foreground transition hover:scale-[1.02]"
            >
              <Mail className="h-4 w-4" /> hello@example.com
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/40 px-4 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
        <div>© {new Date().getFullYear()} Studio. All rights reserved.</div>
        <div className="flex items-center gap-2">
          Powered by <span className="text-foreground">PortOne</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </div>
      </div>
    </footer>
  );
}
