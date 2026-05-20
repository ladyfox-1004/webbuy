import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, Field } from "./login";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  head: () => ({ meta: [{ title: "회원가입 — Studio" }] }),
});

const schema = z.object({
  email: z.string().trim().email("올바른 이메일을 입력해주세요").max(255),
  password: z.string().min(6, "비밀번호는 6자 이상").max(72),
  displayName: z.string().trim().min(1, "닉네임을 입력해주세요").max(40),
});

function SignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password, displayName });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { display_name: parsed.data.displayName },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("가입 완료! 로그인되었어요.");
    navigate({ to: "/" });
  }

  return (
    <AuthShell title="회원가입" subtitle="몇 초면 끝납니다.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="닉네임" type="text" value={displayName} onChange={setDisplayName} />
        <Field label="이메일" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <Field label="비밀번호 (6자 이상)" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-3 font-medium text-primary-foreground transition hover:scale-[1.01] disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}회원가입
        </button>
        <p className="text-center text-sm text-muted-foreground">
          이미 계정이 있나요?{" "}
          <Link to="/login" className="text-primary-glow hover:underline">로그인</Link>
        </p>
      </form>
    </AuthShell>
  );
}
