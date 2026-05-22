import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, ArrowRight, FileText, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/format";

export const Route = createFileRoute("/orcamentos")({
  component: Page,
});

interface OrcamentoRow {
  id: string;
  numero: number;
  tipo_cliente: "particular" | "empresa";
  client_id: string | null;
  cliente_nome: string | null;
  estado: "rascunho" | "enviado" | "aprovado" | "recusado" | "expirado";
  validade: string;
  created_at: string;
  clients: { id: string; nome: string } | null;
  itens: { quantidade: number; valor_unitario: number }[];
}

const ESTADOS = ["rascunho", "enviado", "aprovado", "recusado", "expirado"] as const;
type Estado = (typeof ESTADOS)[number];

const ESTADO_LABEL: Record<Estado, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  aprovado: "Aprovado",
  recusado: "Recusado",
  expirado: "Expirado",
};

function estadoBadge(estado: Estado) {
  const map: Record<Estado, string> = {
    rascunho: "bg-secondary text-secondary-foreground",
    enviado: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300",
    aprovado: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300",
    recusado: "bg-destructive/15 text-destructive border-destructive/30",
    expirado: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-300",
  };
  return <Badge variant="outline" className={`border ${map[estado]}`}>{ESTADO_LABEL[estado]}</Badge>;
}

function totalDe(itens: { quantidade: number; valor_unitario: number }[]) {
  return itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valor_unitario), 0);
}

function Page() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && (!user || role !== "admin")) navigate({ to: "/" });
  }, [user, role, loading, navigate]);
  if (loading || role !== "admin") return null;
  return <AppLayout><Inner /></AppLayout>;
}

function Inner() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<OrcamentoRow[]>([]);
  const [busca, setBusca] = useState("");
  const [estados, setEstados] = useState<Estado[]>(["rascunho", "enviado"]);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("orcamentos")
      .select("id, numero, tipo_cliente, client_id, cliente_nome, estado, validade, created_at, clients(id, nome), itens:orcamento_itens(quantidade, valor_unitario)")
      .order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setRows((data ?? []) as unknown as OrcamentoRow[]);
  };
  useEffect(() => { void load(); }, []);

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (!estados.includes(r.estado)) return false;
      if (q) {
        const nome = (r.clients?.nome ?? r.cliente_nome ?? "").toLowerCase();
        if (!nome.includes(q) && !String(r.numero).includes(q)) return false;
      }
      return true;
    });
  }, [rows, busca, estados]);

  const stats = useMemo(() => {
    const activos = rows.filter((r) => r.estado === "rascunho" || r.estado === "enviado");
    const pendentes = rows.filter((r) => r.estado === "enviado");
    const valorPendente = pendentes.reduce((s, r) => s + totalDe(r.itens ?? []), 0);
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
    const aprovadosMes = rows.filter((r) => r.estado === "aprovado" && new Date(r.created_at) >= inicioMes);
    const expirados = rows.filter((r) => {
      if (r.estado === "expirado") return true;
      if ((r.estado === "rascunho" || r.estado === "enviado") && new Date(r.validade) < today) return true;
      return false;
    });
    return { activos: activos.length, valorPendente, aprovadosMes: aprovadosMes.length, expirados: expirados.length };
  }, [rows, today]);

  const toggleEstado = (e: Estado) =>
    setEstados((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]);

  const novo = async () => {
    setCreating(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("orcamentos").insert({
      created_by: u.user?.id ?? null,
    }).select("id").single();
    setCreating(false);
    if (error || !data) return toast.error(error?.message ?? "Erro");
    navigate({ to: "/orcamentos/$id", params: { id: data.id } });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Orçamentos</h1>
          <p className="text-sm text-muted-foreground">Propostas comerciais a clientes</p>
        </div>
        <Button onClick={() => void novo()} disabled={creating}>
          <Plus className="h-4 w-4 mr-1" />Novo orçamento
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<FileText className="h-5 w-5 text-blue-500" />} label="Activos" value={stats.activos} sub="Rascunho + enviado" />
        <KpiCard icon={<Clock className="h-5 w-5 text-amber-500" />} label="Pendentes de aprovação" value={formatCurrency(stats.valorPendente)} sub="Valor total" />
        <KpiCard icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} label="Aprovados este mês" value={stats.aprovadosMes} />
        <KpiCard
          icon={<AlertCircle className={`h-5 w-5 ${stats.expirados > 0 ? "text-destructive" : "text-muted-foreground"}`} />}
          label="Expirados"
          value={<span className={stats.expirados > 0 ? "text-destructive" : ""}>{stats.expirados}</span>}
        />
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Pesquisar</Label>
            <Input placeholder="Nome do cliente ou nº…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Estado</Label>
            <div className="flex gap-1 flex-wrap">
              {ESTADOS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => toggleEstado(e)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition ${estados.includes(e) ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-secondary"}`}
                >
                  {ESTADO_LABEL[e]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground p-8 text-center">Sem orçamentos.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[70px]">#</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="w-[110px]">Tipo</TableHead>
                <TableHead className="w-[110px]">Data</TableHead>
                <TableHead className="w-[110px]">Validade</TableHead>
                <TableHead className="w-[110px]">Total</TableHead>
                <TableHead className="w-[120px]">Estado</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const nome = r.clients?.nome ?? r.cliente_nome ?? "—";
                const total = totalDe(r.itens ?? []);
                const expirado = new Date(r.validade) < today && (r.estado === "rascunho" || r.estado === "enviado");
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">#{r.numero}</TableCell>
                    <TableCell className="text-sm">{nome}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {r.tipo_cliente === "particular" ? "Particular" : "Empresa"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(r.created_at)}</TableCell>
                    <TableCell className={`text-xs ${expirado ? "text-destructive font-medium" : ""}`}>
                      {formatDate(r.validade)}
                    </TableCell>
                    <TableCell className="text-sm font-mono font-semibold">{formatCurrency(total)}</TableCell>
                    <TableCell>{estadoBadge(r.estado)}</TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/orcamentos/$id" params={{ id: r.id }}>Abrir <ArrowRight className="h-3 w-3 ml-1" /></Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold mt-1">{value}</div>
          {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
        </div>
        {icon}
      </div>
    </Card>
  );
}
