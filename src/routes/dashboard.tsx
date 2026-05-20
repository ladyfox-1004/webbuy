import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Pencil, Trash2, Upload, Store, TrendingUp, Package, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getMySellerProfile,
  listMyProducts,
  upsertMyProduct,
  deleteMyProduct,
  listMySales,
  mySalesSummary,
} from "@/lib/seller.functions";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: DashboardPage,
  head: () => ({ meta: [{ title: "판매자 대시보드 — Studio" }] }),
});

type Tab = "overview" | "products" | "sales";
type ProductForm = {
  id?: string;
  title: string;
  tag: string;
  description: string;
  amount: number;
  thumbnail_url: string;
  product_type: "web" | "app" | "file" | "license";
  delivery_url: string;
  delivery_file_path: string;
  status: "draft" | "review" | "live";
  category: string;
  tags: string[];
};

function DashboardPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const fetchProfile = useServerFn(getMySellerProfile);
  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-seller-profile"],
    queryFn: () => fetchProfile(),
  });

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen px-4 py-20">
        <div className="mx-auto mt-12 max-w-xl rounded-3xl border border-border bg-surface/60 p-10 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
            <Store className="h-7 w-7" />
          </div>
          <h1 className="font-display text-2xl font-bold">판매자로 등록되어 있지 않아요</h1>
          <p className="mt-2 text-sm text-muted-foreground">먼저 판매자 프로필을 만들어 주세요.</p>
          <Link
            to="/sell"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-6 py-2.5 text-sm font-medium text-primary-foreground"
          >
            판매자 시작하기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-20">
      <div className="mx-auto mt-12 max-w-6xl">
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 홈으로
        </Link>

        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold md:text-4xl">{profile.business_name}</h1>
            <p className="text-sm text-muted-foreground">/u/{profile.slug}</p>
          </div>
          <Link to="/sell" className="text-sm text-muted-foreground hover:text-foreground">프로필 수정 →</Link>
        </div>

        <div className="mb-6 flex gap-2 overflow-x-auto rounded-full border border-border bg-surface/40 p-1">
          {(["overview", "products", "sales"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
                tab === t ? "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "overview" ? "개요" : t === "products" ? "내 제품" : "판매 내역"}
            </button>
          ))}
        </div>

        {tab === "overview" && <Overview />}
        {tab === "products" && <Products />}
        {tab === "sales" && <Sales />}
      </div>
    </div>
  );
}

function Overview() {
  const fetchSummary = useServerFn(mySalesSummary);
  const { data, isLoading } = useQuery({ queryKey: ["my-sales-summary"], queryFn: () => fetchSummary() });

  if (isLoading || !data) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const cards = [
    { icon: Package, label: "총 주문", value: `${data.orderCount}건` },
    { icon: TrendingUp, label: "총 매출", value: `₩${data.gross.toLocaleString("ko-KR")}` },
    { icon: Wallet, label: "수수료 (10%)", value: `₩${data.fee.toLocaleString("ko-KR")}` },
    { icon: Wallet, label: "정산 예정", value: `₩${data.net.toLocaleString("ko-KR")}` },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-2xl border border-border bg-surface/60 p-5">
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <c.icon className="h-4 w-4 text-primary-glow" /> {c.label}
          </div>
          <div className="font-display text-2xl font-bold">{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function Products() {
  const fetchList = useServerFn(listMyProducts);
  const upsert = useServerFn(upsertMyProduct);
  const remove = useServerFn(deleteMyProduct);
  const qc = useQueryClient();
  const { data: products, isLoading } = useQuery({ queryKey: ["my-products"], queryFn: () => fetchList() });

  const [editing, setEditing] = useState<ProductForm | null>(null);

  const saveMut = useMutation({
    mutationFn: (f: ProductForm) =>
      upsert({
        data: {
          id: f.id,
          title: f.title,
          tag: f.tag,
          description: f.description,
          amount: Number(f.amount) || 0,
          thumbnail_url: f.thumbnail_url || null,
          product_type: f.product_type,
          delivery_url: f.delivery_url || null,
          delivery_file_path: f.delivery_file_path || null,
          status: f.status,
          category: f.category || null,
          tags: f.tags,
        },
      }),
    onSuccess: () => {
      toast.success("저장됨");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["my-products"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "저장 실패"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("삭제됨"); qc.invalidateQueries({ queryKey: ["my-products"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "삭제 실패"),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{products?.length ?? 0}개 등록됨</div>
        <button
          onClick={() => setEditing(emptyForm())}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary-glow px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> 새 제품
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (products?.length ?? 0) === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-surface/30 p-12 text-center text-sm text-muted-foreground">
          아직 등록한 제품이 없어요. <button className="text-foreground underline" onClick={() => setEditing(emptyForm())}>첫 제품을 등록해 보세요</button>.
        </div>
      ) : (
        <div className="grid gap-3">
          {products!.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-surface/60 p-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-background/50">
                {p.thumbnail_url ? <img src={p.thumbnail_url} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate font-medium">{p.title}</div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                    p.status === "live" ? "bg-emerald-500/15 text-emerald-300" : "bg-foreground/10 text-muted-foreground"
                  }`}>{p.status}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">{p.tag} · ₩{p.amount.toLocaleString("ko-KR")}</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing({
                    id: p.id, title: p.title, tag: p.tag, description: p.description, amount: p.amount,
                    thumbnail_url: p.thumbnail_url ?? "", product_type: (p.product_type as ProductForm["product_type"]) ?? "web",
                    delivery_url: p.delivery_url ?? "", delivery_file_path: p.delivery_file_path ?? "",
                    status: (p.status as "draft" | "live") ?? "draft",
                    category: (p as any).category ?? "", tags: (p as any).tags ?? [],
                  })}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs hover:bg-surface"
                ><Pencil className="h-3.5 w-3.5" /> 수정</button>
                <button
                  onClick={() => { if (confirm("정말 삭제할까요?")) delMut.mutate(p.id); }}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                ><Trash2 className="h-3.5 w-3.5" /> 삭제</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ProductEditor
          value={editing}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={() => saveMut.mutate(editing)}
          saving={saveMut.isPending}
        />
      )}
    </div>
  );
}

function emptyForm(): ProductForm {
  return {
    title: "", tag: "Web", description: "", amount: 9900,
    thumbnail_url: "", product_type: "web",
    delivery_url: "", delivery_file_path: "", status: "draft",
  };
}

function ProductEditor({
  value, onChange, onCancel, onSave, saving,
}: {
  value: ProductForm;
  onChange: (v: ProductForm) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  async function handleThumbnail(file: File) {
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const ext = file.name.split(".").pop() || "png";
      const path = `${u.user.id}/thumb-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("product-thumbnails").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("product-thumbnails").getPublicUrl(path);
      onChange({ ...value, thumbnail_url: data.publicUrl });
      toast.success("썸네일 업로드됨");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeliveryFile(file: File) {
    setUploadingFile(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${u.user.id}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("product-files").upload(path, file, { upsert: false });
      if (error) throw error;
      onChange({ ...value, delivery_file_path: path });
      toast.success("파일 업로드됨 (비공개)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploadingFile(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur">
      <div className="w-full max-w-xl rounded-3xl border border-border bg-surface p-6 md:p-8">
        <h2 className="mb-5 font-display text-xl font-bold">{value.id ? "제품 수정" : "새 제품"}</h2>

        <div className="space-y-4">
          <Row label="제목 *">
            <input
              required maxLength={120}
              value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })}
              className="w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-sm"
            />
          </Row>

          <div className="grid grid-cols-2 gap-3">
            <Row label="태그 *">
              <input
                required maxLength={40}
                value={value.tag} onChange={(e) => onChange({ ...value, tag: e.target.value })}
                className="w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-sm"
                placeholder="Web · SaaS · iOS"
              />
            </Row>
            <Row label="가격 (KRW) *">
              <input
                required type="number" min={0}
                value={value.amount} onChange={(e) => onChange({ ...value, amount: Number(e.target.value) })}
                className="w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-sm"
              />
            </Row>
          </div>

          <Row label="설명 *">
            <textarea
              required maxLength={500} rows={3}
              value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })}
              className="w-full resize-none rounded-xl border border-border bg-background/50 px-3 py-2 text-sm"
            />
          </Row>

          <Row label="썸네일">
            <div className="flex items-center gap-3">
              {value.thumbnail_url && <img src={value.thumbnail_url} alt="" className="h-14 w-14 rounded-lg object-cover" />}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2 text-sm">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                업로드
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleThumbnail(f); }} />
              </label>
            </div>
          </Row>

          <div className="grid grid-cols-2 gap-3">
            <Row label="제품 유형">
              <select
                value={value.product_type}
                onChange={(e) => onChange({ ...value, product_type: e.target.value as ProductForm["product_type"] })}
                className="w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-sm"
              >
                <option value="web">웹 접속</option>
                <option value="app">앱 다운로드</option>
                <option value="file">파일</option>
                <option value="license">라이선스 키</option>
              </select>
            </Row>
            <Row label="상태">
              <select
                value={value.status}
                onChange={(e) => onChange({ ...value, status: e.target.value as "draft" | "live" })}
                className="w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-sm"
              >
                <option value="draft">초안 (비공개)</option>
                <option value="live">판매중 (공개)</option>
              </select>
            </Row>
          </div>

          <Row label="전달 URL (선택)" hint="구매자에게 보여줄 접속 주소 또는 다운로드 링크">
            <input
              type="url" maxLength={500}
              value={value.delivery_url} onChange={(e) => onChange({ ...value, delivery_url: e.target.value })}
              className="w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-sm"
              placeholder="https://"
            />
          </Row>

          <Row label="전달 파일 (비공개)" hint="구매자만 서명 URL로 다운로드 가능합니다 (product-files 버킷)">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2 text-sm">
                {uploadingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {value.delivery_file_path ? "파일 교체" : "파일 업로드"}
                <input type="file" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDeliveryFile(f); }} />
              </label>
              {value.delivery_file_path && (
                <>
                  <span className="truncate max-w-[260px] text-xs text-muted-foreground" title={value.delivery_file_path}>
                    {value.delivery_file_path.split("/").pop()}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...value, delivery_file_path: "" })}
                    className="text-xs text-red-400 hover:underline"
                  >제거</button>
                </>
              )}
            </div>
          </Row>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="rounded-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground">취소</button>
          <button
            onClick={onSave} disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-primary-glow px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} 저장
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-foreground">{label}</label>
      {hint && <div className="mb-1.5 text-[11px] text-muted-foreground">{hint}</div>}
      {children}
    </div>
  );
}

function Sales() {
  const fetchSales = useServerFn(listMySales);
  const { data, isLoading } = useQuery({ queryKey: ["my-sales"], queryFn: () => fetchSales() });

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data || data.length === 0) {
    return <div className="rounded-3xl border border-dashed border-border bg-surface/30 p-12 text-center text-sm text-muted-foreground">아직 판매 내역이 없어요.</div>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-surface/60 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left">일시</th>
            <th className="px-4 py-3 text-left">상품</th>
            <th className="px-4 py-3 text-left">구매자</th>
            <th className="px-4 py-3 text-right">금액</th>
            <th className="px-4 py-3 text-left">상태</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((s) => (
            <tr key={s.payment_id}>
              <td className="px-4 py-3 text-muted-foreground">{new Date(s.created_at).toLocaleString("ko-KR")}</td>
              <td className="px-4 py-3">{s.product_title}</td>
              <td className="px-4 py-3 text-muted-foreground">{s.customer_email ?? "-"}</td>
              <td className="px-4 py-3 text-right">₩{s.amount.toLocaleString("ko-KR")}</td>
              <td className="px-4 py-3">{s.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
