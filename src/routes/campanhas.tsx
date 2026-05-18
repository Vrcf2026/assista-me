import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ArrowRight, Megaphone } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/campanhas")({
  component: Page,
});

const PRIO_LABEL: Record<string, string> = { alta: "🔴 Alta", media: "🟡 Média", normal: "🟢 Normal" };
const PRIO_BADGE: Record<string, string> = {
  alta: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  media: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  normal: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};
const ESTADO_LABEL: Record<string, string> = { ativa: "Activa", concluida: "Concluída", cancelada: "Cancelada" };

interface Campanha {
  id: string;
  titulo: string;
  prioridade: string;
  estado: string;
  prazo: string | null;
  total: number;
  concluidos: number;
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
  const [rows, setRows] = useState<Campanha[]>([]);
  const [stats, setStats] = useState({ ativas: 0, pendentes: 0, mes: 0 });
  const [openNovo, setOpenNovo] = useState(false);

  const load = async () => {
    const { data: camps, error } = await supabase
      .from("campanhas")
      .select("id, titulo, prioridade, estado, prazo, created_at")
      .order("created_at", { ascending: false });
    if (error) return toast.error(error.message);

    const ids = (camps ?? []).map(c => c.id);
    let progresso = new Map<string, { total: number; concluidos: number }>();
    if (ids.length > 0) {
      const { data: cli } = await supabase
        .from("campanha_clientes")
        .select("campanha_id, estado")
        .in("campanha_id", ids);
      (cli ?? []).forEach(c => {
        const p = progresso.get(c.campanha_id) ?? { total: 0, concluidos: 0 };
        p.total++;
        if (c.estado === "concluido") p.concluidos++;
        progresso.set(c.campanha_id, p);
      });
    }

    const list: Campanha[] = (camps ?? []).map(c => {
      const p = progresso.get(c.id) ?? { total: 0, concluidos: 0 };
      return { ...c, total: p.total, concluidos: p.concluidos } as Campanha;
    });
    setRows(list);

    // Stats
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const ativas = list.filter(c => c.estado === "ativa").length;
    let pendentes = 0;
    list.filter(c => c.estado === "ativa").forEach(c => { pendentes += c.total - c.concluidos; });
    const mes = list.filter(c => c.estado === "concluida").length; // simplificado
    setStats({ ativas, pendentes, mes });
  };

  useEffect(() => { void load(); }, []);

  const today = new Date(); today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Megaphone className="h-6 w-6" /> Campanhas
          </h1>
          <p className="text-sm text-muted-foreground">Tarefas pontuais que afectam múltiplos clientes.</p>
        </div>
        <Button onClick={() => setOpenNovo(true)}><Plus className="h-4 w-4 mr-1" />Nova campanha</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Campanhas activas" value={stats.ativas} />
        <Stat label="Clientes pendentes" value={stats.pendentes} tone="amber" />
        <Stat label="Concluídas" value={stats.mes} tone="green" />
      </div>

      <Card className="p-0 overflow-hidden">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground p-8 text-center">Sem campanhas. Cria a primeira ↑</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead className="w-[110px]">Prioridade</TableHead>
                <TableHead className="w-[110px]">Prazo</TableHead>
                <TableHead className="w-[200px]">Progresso</TableHead>
                <TableHead className="w-[120px]">Estado</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => {
                const prazo = r.prazo ? new Date(r.prazo) : null;
                const atraso = prazo && prazo < today && r.estado === "ativa";
                const pct = r.total === 0 ? 0 : Math.round((r.concluidos / r.total) * 100);
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link to="/campanhas/$id" params={{ id: r.id }} className="text-sm hover:underline text-primary font-medium">
                        {r.titulo}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded text-xs ${PRIO_BADGE[r.prioridade]}`}>{PRIO_LABEL[r.prioridade]}</span>
                    </TableCell>
                    <TableCell className={`text-xs ${atraso ? "text-destructive font-medium" : ""}`}>
                      {prazo ? prazo.toLocaleDateString("pt-PT") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Progress value={pct} className="h-2" />
                        <div className="text-xs text-muted-foreground tabular-nums">{r.concluidos}/{r.total} clientes · {pct}%</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          r.estado === "ativa" ? "bg-blue-600 text-white" :
                          r.estado === "concluida" ? "bg-emerald-600 text-white" :
                          "bg-muted text-muted-foreground"
                        }
                      >
                        {ESTADO_LABEL[r.estado]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/campanhas/$id" params={{ id: r.id }}>Abrir <ArrowRight className="h-3 w-3 ml-1" /></Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <NovaCampDialog open={openNovo} onClose={() => setOpenNovo(false)} onCreated={(id) => { setOpenNovo(false); navigate({ to: "/campanhas/$id", params: { id } }); }} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" | "red" }) {
  const cls = tone === "green" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : tone === "red" ? "text-destructive" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-3xl font-semibold mt-1 ${cls}`}>{value}</div>
    </Card>
  );
}

function NovaCampDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prio, setPrio] = useState("media");
  const [prazo, setPrazo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitulo(""); setDescricao(""); setPrio("media"); setPrazo("");
  }, [open]);

  const guardar = async () => {
    if (!titulo.trim()) return toast.error("Título é obrigatório");
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: row, error } = await supabase.from("campanhas").insert({
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      prioridade: prio,
      prazo: prazo || null,
      created_by: u.user?.id ?? null,
    }).select("id").single();
    setBusy(false);
    if (error || !row) return toast.error(error?.message ?? "Erro");
    toast.success("Campanha criada");
    onCreated(row.id);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova campanha</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Título *</Label>
            <Input value={titulo} onChange={e => setTitulo(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} />
          </div>
          <div>
            <Label>Prioridade</Label>
            <Select value={prio} onValueChange={setPrio}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alta">🔴 Alta</SelectItem>
                <SelectItem value="media">🟡 Média</SelectItem>
                <SelectItem value="normal">🟢 Normal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Prazo</Label>
            <Input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} />
          </div>
          <Button className="w-full" onClick={() => void guardar()} disabled={busy}>Criar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
