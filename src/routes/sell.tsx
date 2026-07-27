import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Upload, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMySellerProfile, upsertMySellerProfile } from "@/lib/seller.functions";

export const Route = createFileRoute("/sell")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: SellPage,
  head: () => ({
    meta: [
      { title: "판매자 시작하기 — 에이아이솔루션(AISOLITION)" },
      { name: "description", content: "내 웹/앱을 등록하고 바로 판매하세요." },
    ],
  }),
});

function SellPage() {
  const fetchProfile = useServerFn(getMySellerProfile);
  const upsert = useServerFn(upsertMySellerProfile);
  const navigate = useNavigate();

  const { data: profile, isLoading, refetch } = useQuery({
    queryKey: ["my-seller-profile"],
    queryFn: () => fetchProfile(),
  });

  const [form, setForm] = useState({
    business_name: "",
    slug: "",
    bio: "",
    avatar_url: "",
    website_url: "",
    payout_bank: "",
    payout_account: "",
    payout_holder: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        business_name: profile.business_name ?? "",
        slug: profile.slug ?? "",
        bio: profile.bio ?? "",
        avatar_url: profile.avatar_url ?? "",
        website_url: profile.website_url ?? "",
        payout_bank: profile.payout_bank ?? "",
        payout_account: profile.payout_account ?? "",
        payout_holder: profile.payout_holder ?? "",
      });
    }
  }, [profile]);

  async function handleAvatar(file: File) {
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const ext = file.name.split(".").pop() || "png";
      const path = `${u.user.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("seller-avatars").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("seller-avatars").getPublicUrl(path);
      setForm((f) => ({ ...f, avatar_url: data.publicUrl }));
      toast.success("아바타 업로드 완료");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await upsert({
        data: {
          business_name: form.business_name,
          slug: form.slug,
          bio: form.bio || null,
          avatar_url: form.avatar_url || null,
          website_url: form.website_url || null,
          payout_bank: form.payout_bank || null,
          payout_account: form.payout_account || null,
          payout_holder: form.payout_holder || null,
        },
      });
      toast.success(profile ? "프로필 저장됨" : "판매자 등록 완료! 대시보드로 이동합니다.");
      await refetch();
      if (!profile) navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-20">
      <div className="mx-auto mt-12 max-w-2xl">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 홈으로
        </Link>

        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
            <Store className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold">
              {profile ? "판매자 프로필" : "판매자로 시작하기"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {profile ? "스토어 정보를 업데이트하세요." : "내 웹/앱을 등록하고 바로 판매할 수 있어요."}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <form onSubmit={submit} className="space-y-5 rounded-3xl border border-border bg-surface/60 p-6 md:p-8">
            <Field label="스토어 이름 *" hint="구매자에게 보이는 브랜드명">
              <input
                required maxLength={80}
                value={form.business_name}
                onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                className="w-full rounded-xl border border-border bg-background/50 px-4 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="예: 에이아이솔루션 스튜디오"
              />
            </Field>

            <Field label="스토어 주소 *" hint="webbuy.lovable.app/u/{이값} — 영문 소문자·숫자·하이픈, 2~40자">
              <input
                required maxLength={40}
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                className="w-full rounded-xl border border-border bg-background/50 px-4 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="pinkfox"
              />
            </Field>

            <Field label="소개" hint="500자 이내">
              <textarea
                maxLength={500} rows={3}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                className="w-full resize-none rounded-xl border border-border bg-background/50 px-4 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="스토어를 한 줄로 소개해 주세요."
              />
            </Field>

            <Field label="아바타">
              <div className="flex items-center gap-3">
                {form.avatar_url && (
                  <img src={form.avatar_url} alt="" className="h-14 w-14 rounded-full object-cover" />
                )}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-background/50 px-4 py-2 text-sm hover:bg-surface">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  업로드
                  <input
                    type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatar(f); }}
                  />
                </label>
              </div>
            </Field>

            <Field label="웹사이트 (선택)">
              <input
                type="url" maxLength={500}
                value={form.website_url}
                onChange={(e) => setForm({ ...form, website_url: e.target.value })}
                className="w-full rounded-xl border border-border bg-background/50 px-4 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="https://"
              />
            </Field>

            <div className="rounded-2xl border border-border/60 bg-background/30 p-4">
              <div className="mb-3 text-sm font-medium">정산 계좌 (선택, 매출 발생 후 입력 가능)</div>
              <div className="grid gap-3 md:grid-cols-3">
                <input
                  maxLength={40} value={form.payout_bank}
                  onChange={(e) => setForm({ ...form, payout_bank: e.target.value })}
                  placeholder="은행"
                  className="rounded-xl border border-border bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <input
                  maxLength={40} value={form.payout_account}
                  onChange={(e) => setForm({ ...form, payout_account: e.target.value })}
                  placeholder="계좌번호"
                  className="rounded-xl border border-border bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <input
                  maxLength={40} value={form.payout_holder}
                  onChange={(e) => setForm({ ...form, payout_holder: e.target.value })}
                  placeholder="예금주"
                  className="rounded-xl border border-border bg-background/50 px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              {profile && (
                <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
                  대시보드로 →
                </Link>
              )}
              <button
                type="submit" disabled={saving}
                className="ml-auto inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:scale-[1.02] disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {profile ? "저장" : "판매자 시작하기"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
      {hint && <div className="mb-2 text-xs text-muted-foreground">{hint}</div>}
      {children}
    </div>
  );
}
