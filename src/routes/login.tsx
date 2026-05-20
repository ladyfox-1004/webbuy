import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "로그인 — Studio" }] }),
});

const schema = z.object({
  email: z.string().trim().email("올바른 이메일을 입력해주세요"),
  password: z.string().min(6, "비밀번호는 6자 이상").max(72),
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("로그인 성공");
    navigate({ to: "/" });
  }

  return (
    <AuthShell title="로그인" subtitle="다시 오신 것을 환영합니다.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="이메일" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field label="비밀번호" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3 font-medium text-primary-foreground transition hover:scale-[1.01] disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}로그인
        </button>
        <p className="text-center text-sm text-muted-foreground">
          계정이 없으신가요?{" "}
          <Link to="/signup" className="text-primary-glow hover:underline">회원가입</Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen px-4 py-20">
      <div className="mx-auto mt-16 max-w-md">
        <Link to="/" className="mb-8 inline-block text-sm text-muted-foreground hover:text-foreground">← Studio</Link>
        <div className="glass rounded-3xl p-8 md:p-10">
          <h1 className="font-display text-3xl font-bold">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Field({
  label, type, value, onChange, autoComplete,
}: {
  label: string; type: string; value: string; onChange: (v: string) => void; autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        className="w-full rounded-2xl border border-border bg-surface/40 px-4 py-3 text-foreground outline-none transition focus:border-primary-glow"
      />
    </label>
  );
}
