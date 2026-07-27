import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Plus, Trash2, Pencil, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminListPayments, adminListUsers, adminStats } from "@/lib/admin.functions";
import { listProducts, upsertProduct, deleteProduct } from "@/lib/products.functions";
import { StatusBadge } from "@/components/StatusBadge";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/login" });
    const { data: role } = await supabase
      .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!role) throw redirect({ to: "/" });
  },
  component: AdminPage,
  head: () => ({ meta: [{ title: "관리자 — 에이아이솔루션(AISOLITION)" }] }),
});

type Tab = "stats" | "payments" | "products" | "users";

function AdminPage() {
  const [tab, setTab] = useState<Tab>("stats");
  return (
    <div className="min-h-screen px-4 py-20">
      <div className="mx-auto mt-12 max-w-6xl">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />홈
        </Link>
        <div className="mb-8 flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-primary-glow" />
          <h1 className="font-display text-4xl font-bold">관리자</h1>
        </div>

        <div className="mb-8 flex gap-1 rounded-full border border-border bg-surface/40 p-1">
          {([
            ["stats", "대시보드"],
            ["payments", "결제내역"],
            ["products", "상품"],
            ["users", "회원"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 rounded-full px-4 py-2 text-sm transition ${
                tab === k ? "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "stats" && <StatsPanel />}
        {tab === "payments" && <PaymentsPanel />}
        {tab === "products" && <ProductsPanel />}
        {tab === "users" && <UsersPanel />}
      </div>
    </div>
  );
}

function StatsPanel() {
  const fn = useServerFn(adminStats);
  const { data, isLoading } = useQuery({ queryKey: ["admin-stats"], queryFn: () => fn() });
  if (isLoading || !data) return <Spinner />;
  const max = Math.max(1, ...data.series.map((d) => d.revenue));
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="총 매출" value={`₩${data.totalRevenue.toLocaleString("ko-KR")}`} />
        <Stat label="결제 건수" value={`${data.paidCount} / ${data.totalCount}`} />
        <Stat label="성공률" value={`${(data.successRate * 100).toFixed(1)}%`} />
      </div>
      <div className="rounded-3xl border border-border bg-surface/40 p-6">
        <div className="mb-4 text-sm text-muted-foreground">최근 14일 매출</div>
        <div className="flex h-40 items-end gap-1">
          {data.series.map((d) => (
            <div key={d.date} className="group relative flex flex-1 flex-col items-center">
              <div
                className="w-full rounded-t bg-gradient-to-t from-primary to-primary-glow transition"
                style={{ height: `${(d.revenue / max) * 100}%`, minHeight: d.revenue > 0 ? 4 : 1 }}
                title={`${d.date}: ₩${d.revenue.toLocaleString("ko-KR")}`}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          <span>{data.series[0]?.date.slice(5)}</span>
          <span>{data.series[data.series.length - 1]?.date.slice(5)}</span>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-border bg-surface/40 p-6">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-3xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function PaymentsPanel() {
  const fn = useServerFn(adminListPayments);
  const { data, isLoading } = useQuery({ queryKey: ["admin-payments"], queryFn: () => fn() });
  if (isLoading) return <Spinner />;
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface/40">
      <table className="w-full text-sm">
        <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-5 py-3">상품</th>
            <th className="px-5 py-3">금액</th>
            <th className="px-5 py-3">상태</th>
            <th className="px-5 py-3">구매자</th>
            <th className="px-5 py-3">일시</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((p) => (
            <tr key={p.payment_id} className="border-b border-border/30 last:border-0">
              <td className="px-5 py-3 font-medium">{p.product_title}</td>
              <td className="px-5 py-3">₩{p.amount.toLocaleString("ko-KR")}</td>
              <td className="px-5 py-3"><StatusBadge status={p.status} /></td>
              <td className="px-5 py-3 text-muted-foreground">{p.customer_email ?? "게스트"}</td>
              <td className="px-5 py-3 text-muted-foreground">{new Date(p.created_at).toLocaleString("ko-KR")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(data?.length ?? 0) === 0 && <p className="py-10 text-center text-muted-foreground">결제 내역이 없습니다.</p>}
    </div>
  );
}

function ProductsPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listProducts);
  const upsertFn = useServerFn(upsertProduct);
  const deleteFn = useServerFn(deleteProduct);
  const { data, isLoading } = useQuery({ queryKey: ["admin-products"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);

  const save = useMutation({
    mutationFn: (input: Record<string, unknown>) => upsertFn({ data: input as never }),
    onSuccess: () => {
      toast.success("저장됨");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("삭제됨");
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-4">
      <button
        onClick={() => setEditing({ title: "", tag: "", description: "", amount: 0, span: "min-h-[220px]", accent: "from-primary/30 to-transparent", sort_order: (data?.length ?? 0) + 1, active: true })}
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-5 py-2.5 text-sm font-medium text-primary-foreground"
      >
        <Plus className="h-4 w-4" />상품 추가
      </button>

      <div className="overflow-hidden rounded-3xl border border-border bg-surface/40">
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-5 py-3">제목</th><th className="px-5 py-3">태그</th><th className="px-5 py-3">금액</th><th className="px-5 py-3"></th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((p) => (
              <tr key={p.id} className="border-b border-border/30 last:border-0">
                <td className="px-5 py-3 font-medium">{p.title}</td>
                <td className="px-5 py-3 text-muted-foreground">{p.tag}</td>
                <td className="px-5 py-3">₩{p.amount.toLocaleString("ko-KR")}</td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => setEditing(p as Record<string, unknown>)} className="rounded-full p-2 text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => confirm("삭제하시겠어요?") && remove.mutate(p.id as string)} className="rounded-full p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <ProductEditor initial={editing} onCancel={() => setEditing(null)} onSave={(v) => save.mutate(v)} saving={save.isPending} />}
    </div>
  );
}

function ProductEditor({ initial, onSave, onCancel, saving }: {
  initial: Record<string, unknown>;
  onSave: (v: Record<string, unknown>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [f, setF] = useState(initial);
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="glass w-full max-w-lg rounded-3xl p-6">
        <h3 className="mb-4 font-display text-xl font-bold">{f.id ? "상품 수정" : "상품 추가"}</h3>
        <div className="space-y-3">
          <Input label="제목" value={f.title as string} onChange={(v) => set("title", v)} />
          <Input label="태그" value={f.tag as string} onChange={(v) => set("tag", v)} />
          <Input label="설명" value={f.description as string} onChange={(v) => set("description", v)} />
          <Input label="금액 (KRW)" type="number" value={String(f.amount)} onChange={(v) => set("amount", Number(v))} />
          <Input label="정렬순서" type="number" value={String(f.sort_order)} onChange={(v) => set("sort_order", Number(v))} />
          <Input label="카드 크기 (Tailwind)" value={f.span as string} onChange={(v) => set("span", v)} />
          <Input label="액센트 (Tailwind gradient)" value={f.accent as string} onChange={(v) => set("accent", v)} />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-full border border-border bg-surface/40 px-4 py-2 text-sm">취소</button>
          <button
            onClick={() => onSave(f)}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}저장
          </button>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-border bg-background/40 px-3 py-2 text-sm outline-none focus:border-primary-glow" />
    </label>
  );
}

function UsersPanel() {
  const fn = useServerFn(adminListUsers);
  const { data, isLoading } = useQuery({ queryKey: ["admin-users"], queryFn: () => fn() });
  if (isLoading) return <Spinner />;
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface/40">
      <table className="w-full text-sm">
        <thead className="border-b border-border/60 text-left text-xs uppercase text-muted-foreground">
          <tr><th className="px-5 py-3">이메일</th><th className="px-5 py-3">닉네임</th><th className="px-5 py-3">권한</th><th className="px-5 py-3">가입일</th></tr>
        </thead>
        <tbody>
          {(data ?? []).map((u) => (
            <tr key={u.id} className="border-b border-border/30 last:border-0">
              <td className="px-5 py-3">{u.email}</td>
              <td className="px-5 py-3 text-muted-foreground">{u.display_name}</td>
              <td className="px-5 py-3">
                {u.roles.map((r) => (
                  <span key={r} className={`mr-1 rounded-full border px-2 py-0.5 text-xs ${r === "admin" ? "border-primary-glow/30 bg-primary-glow/15 text-primary-glow" : "border-border text-muted-foreground"}`}>{r}</span>
                ))}
              </td>
              <td className="px-5 py-3 text-muted-foreground">{new Date(u.created_at).toLocaleDateString("ko-KR")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Spinner() {
  return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
}
