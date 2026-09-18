import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Plus, ArrowRight, Megaphone, AlertTriangle, Clock, CheckCircle2, RefreshCw, Repeat } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/campanhas")({
  component: Page,
});

// ── Tipos ──────────────────────────────────────────────────────────────────────
interface Campanha {
  id: string;
  titulo: string;
  prioridade: string;
  estado: string;
  tipo: string;
  prazo: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  recorrencia: string | null;
  dia_inicio_recorrencia: number | null;
  dia_fim_recorrencia: number | null;
  campanha_pai_id: string | null;
  created_at: string;
  total: number;
  concluidos: number;
}

type Risco = "risco" | "atencao" | "ok" | "concluida" | "sem_prazo";

// ── Utilitários ────────────────────────────────────────────────────────────────
const PRIO_BADGE: Record<string, string> = {
  alta: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  media: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  normal: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};
const PRIO_LABEL: Record<string, string> = { alta: "🔴 Alta", media: "🟡 Média", normal: "🟢 Normal" };
const REC_LABEL: Record<string, string> = { mensal: "Mensal", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual" };

function calcRisco(c: Campanha): Risco {
  if (c.estado !== "ativa") return "concluida";
  const pct = c.total > 0 ? c.concluidos / c.total : 0;
  if (pct === 1 && c.total > 0) return "concluida";
  const fim = c.data_fim ?? c.prazo;
  if (!fim) return "sem_prazo";
  const diasRestantes = Math.floor((new Date(fim).getTime() - Date.now()) / 86400_000);
  const pendentes = c.total - c.concluidos;
  if (diasRestantes < 0) return "risco"; // passou o prazo
  if (diasRestantes <= 2 && pendentes > 0) return "risco";
  if (diasRestantes <= 5 && pendentes > 0) return "atencao";
  return "ok";
}

const RISCO_CONFIG: Record<Risco, { label: string; icon: typeof AlertTriangle; cls: string; border: string }> = {
  risco: { label: "Em risco", icon: AlertTriangle, cls: "text-red-600 dark:text-red-400", border: "border-red-500/30 bg-red-500/5" },
  atencao: { label: "Atenção", icon: Clock, cls: "text-amber-600 dark:text-amber-400", border: "border-amber-500/30 bg-amber-500/5" },
  ok: { label: "No prazo", icon: CheckCircle2, cls: "text-emerald-600 dark:text-emerald-400", border: "" },
  concluida: { label: "Concluída", icon: CheckCircle2, cls: "text-muted-foreground", border: "" },
  sem_prazo: { label: "Sem prazo", icon: Megaphone, cls: "text-muted-foreground", border: "" },
};

function diasRestantesLabel(c: Campanha): string {
  const fim = c.data_fim ?? c.prazo;
  if (!fim) return "";
  const dias = Math.floor((new Date(fim).getTime() - Date.now()) / 86400_000);
  if (dias < 0) return `${Math.abs(dias)}d em atraso`;
  if (dias === 0) return "Hoje!";
  if (dias === 1) return "Amanhã";
  return `${dias} dias`;
}

// ── Page ───────────────────────────────────────────────────────────────────────
function Page() {
  return (
    <RequireRole role="admin">
      <AppLayout><Inner /></AppLayout>
    </RequireRole>
  );
}

function Inner() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Campanha[]>([]);
  const [openNovo, setOpenNovo] = useState(false);
  const [tabFilter, setTabFilter] = useState<"ativas" | "recorrentes" | "concluidas">("ativas");

  const load = async () => {
    const { data: camps, error } = await supabase
      .from("campanhas" as any)
      .select("id, titulo, prioridade, estado, tipo, prazo, data_inicio, data_fim, recorrencia, dia_inicio_recorrencia, dia_fim_recorrencia, campanha_pai_id, created_at")
      .order("created_at", { ascending: false });
    if (error) return toast.error(error.message);

    const ids = ((camps ?? []) as any[]).map((c: any) => c.id);
    const progressoMap = new Map<string, { total: number; concluidos: number }>();
    if (ids.length > 0) {
      const { data: cli } = await supabase
        .from("campanha_clientes" as any)
        .select("campanha_id, estado")
        .in("campanha_id", ids);
      ((cli ?? []) as any[]).forEach((c: any) => {
        const p = progressoMap.get(c.campanha_id) ?? { total: 0, concluidos: 0 };
        p.total++;
        if (c.estado === "concluido") p.concluidos++;
        progressoMap.set(c.campanha_id, p);
      });
    }

    setRows(((camps ?? []) as any[]).map((c: any) => {
      const p = progressoMap.get(c.id) ?? { total: 0, concluidos: 0 };
      return {
        ...c,
        tipo: (c as any).tipo ?? "pontual",
        data_inicio: (c as any).data_inicio ?? null,
        data_fim: (c as any).data_fim ?? null,
        recorrencia: (c as any).recorrencia ?? null,
        dia_inicio_recorrencia: (c as any).dia_inicio_recorrencia ?? null,
        dia_fim_recorrencia: (c as any).dia_fim_recorrencia ?? null,
        campanha_pai_id: (c as any).campanha_pai_id ?? null,
        total: p.total,
        concluidos: p.concluidos,
      } as Campanha;
    }));
  };

  useEffect(() => { void load(); }, []);

  const { ativas, recorrentes, concluidas, emRisco, emAtencao } = useMemo(() => {
    const ativas = rows.filter(r => r.estado === "ativa" && r.tipo !== "recorrente" && !r.recorrencia);
    const recorrentes = rows.filter(r => r.tipo === "recorrente" || r.recorrencia);
    const concluidas = rows.filter(r => r.estado !== "ativa");
    const emRisco = ativas.filter(r => calcRisco(r) === "risco");
    const emAtencao = ativas.filter(r => calcRisco(r) === "atencao");
    return { ativas, recorrentes, concluidas, emRisco, emAtencao };
  }, [rows]);

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Campanhas</h1>
          <p className="text-sm text-muted-foreground">Acções que afectam múltiplos clientes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setOpenNovo(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nova campanha
          </Button>
        </div>
      </div>

      {/* Alertas de risco */}
      {(emRisco.length > 0 || emAtencao.length > 0) && (
        <div className="space-y-2">
          {emRisco.map(c => (
            <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-red-500/30 bg-red-500/5">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-700 dark:text-red-300">
                  {c.titulo} — {c.concluidos}/{c.total} clientes · {diasRestantesLabel(c)}
                </p>
              </div>
              <Button asChild size="sm" variant="destructive" className="shrink-0">
                <Link to="/campanhas/$id" params={{ id: c.id }}>Resolver</Link>
              </Button>
            </div>
          ))}
          {emAtencao.map(c => (
            <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <Clock className="h-5 w-5 text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  {c.titulo} — {c.concluidos}/{c.total} clientes · {diasRestantesLabel(c)}
                </p>
              </div>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link to="/campanhas/$id" params={{ id: c.id }}>Ver</Link>
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tabFilter} onValueChange={v => setTabFilter(v as typeof tabFilter)}>
        <TabsList>
          <TabsTrigger value="ativas">
            Activas {ativas.length > 0 && <span className="ml-1.5 text-xs bg-primary/10 text-primary px-1.5 rounded-full">{ativas.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="recorrentes">
            Recorrentes {recorrentes.length > 0 && <span className="ml-1.5 text-xs bg-primary/10 text-primary px-1.5 rounded-full">{recorrentes.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="concluidas">Concluídas</TabsTrigger>
        </TabsList>

        <TabsContent value="ativas" className="mt-4">
          <CampanhaGrid rows={ativas} />
        </TabsContent>
        <TabsContent value="recorrentes" className="mt-4">
          <CampanhaGrid rows={recorrentes} isRecorrentes />
        </TabsContent>
        <TabsContent value="concluidas" className="mt-4">
          <CampanhaGrid rows={concluidas} />
        </TabsContent>
      </Tabs>

      <NovaCampDialog
        open={openNovo}
        onClose={() => setOpenNovo(false)}
        onCreated={(id) => { setOpenNovo(false); void load(); navigate({ to: "/campanhas/$id", params: { id } }); }}
      />
    </div>
  );
}

function CampanhaGrid({ rows, isRecorrentes }: { rows: Campanha[]; isRecorrentes?: boolean }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-10">Sem campanhas.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map(c => <CampanhaCard key={c.id} c={c} isRecorrente={isRecorrentes} />)}
    </div>
  );
}

function CampanhaCard({ c, isRecorrente }: { c: Campanha; isRecorrente?: boolean }) {
  const risco = calcRisco(c);
  const cfg = RISCO_CONFIG[risco];
  const pct = c.total > 0 ? Math.round((c.concluidos / c.total) * 100) : 0;
  const fim = c.data_fim ?? c.prazo;
  const diasLabel = diasRestantesLabel(c);

  return (
    <Card className={`p-4 space-y-3 ${cfg.border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            {isRecorrente && <Repeat className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            <h3 className="text-sm font-semibold truncate">{c.titulo}</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className={`text-xs px-2 py-0.5 rounded-full ${PRIO_BADGE[c.prioridade]}`}>
              {PRIO_LABEL[c.prioridade]}
            </span>
            {c.recorrencia && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                {REC_LABEL[c.recorrencia]}
              </span>
            )}
          </div>
        </div>
        <div className={`flex items-center gap-1 text-xs font-medium shrink-0 ${cfg.cls}`}>
          <cfg.icon className="h-3.5 w-3.5" />
          {cfg.label}
        </div>
      </div>

      {/* Datas */}
      {(c.data_inicio || fim) && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          {c.data_inicio && <span>De {new Date(c.data_inicio).toLocaleDateString("pt-PT")}</span>}
          {fim && <span>→ {new Date(fim).toLocaleDateString("pt-PT")}</span>}
          {diasLabel && <span className={`font-medium ${cfg.cls}`}>· {diasLabel}</span>}
        </div>
      )}
      {c.recorrencia && c.dia_inicio_recorrencia && (
        <div className="text-xs text-muted-foreground">
          Dias {c.dia_inicio_recorrencia}{c.dia_fim_recorrencia ? `–${c.dia_fim_recorrencia}` : ""} de cada mês
        </div>
      )}

      {/* Progresso */}
      {c.total > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{c.concluidos}/{c.total} clientes</span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>
      )}

      <Button asChild size="sm" variant="outline" className="w-full">
        <Link to="/campanhas/$id" params={{ id: c.id }}>
          Ver detalhes <ArrowRight className="h-3 w-3 ml-1" />
        </Link>
      </Button>
    </Card>
  );
}

// ── Diálogo nova campanha ──────────────────────────────────────────────────────
function NovaCampDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prio, setPrio] = useState("media");
  const [isRecorrente, setIsRecorrente] = useState(false);
  const [recorrencia, setRecorrencia] = useState("mensal");
  const [diaInicio, setDiaInicio] = useState("1");
  const [diaFim, setDiaFim] = useState("5");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitulo(""); setDescricao(""); setPrio("media");
    setIsRecorrente(false); setRecorrencia("mensal");
    setDiaInicio("1"); setDiaFim("5");
    setDataInicio(""); setDataFim("");
  }, [open]);

  const guardar = async () => {
    if (!titulo.trim()) return toast.error("Título obrigatório");
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const payload: Record<string, unknown> = {
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        prioridade: prio,
        estado: "ativa",
        tipo: isRecorrente ? "recorrente" : "pontual",
        created_by: u.user?.id ?? null,
      };
      if (isRecorrente) {
        payload.recorrencia = recorrencia;
        payload.dia_inicio_recorrencia = parseInt(diaInicio) || 1;
        payload.dia_fim_recorrencia = parseInt(diaFim) || 5;
      } else {
        payload.data_inicio = dataInicio || null;
        payload.data_fim = dataFim || null;
        payload.prazo = dataFim || null;
      }
      const { data: row, error } = await supabase
        .from("campanhas" as any).insert(payload as any).select("id").single();
      if (error || !row) return toast.error(error?.message ?? "Erro");
      toast.success("Campanha criada!");
      onCreated((row as any).id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova campanha</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={titulo} onChange={e => setTitulo(e.target.value)} autoFocus placeholder="ex: Entrega SAFT, Nova regra fiscal…" />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
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

          {/* Toggle recorrente */}
          <div className="flex items-center justify-between py-1 border-t border-b">
            <div>
              <p className="text-sm font-medium">Campanha recorrente</p>
              <p className="text-xs text-muted-foreground">Repete automaticamente (ex: SAFT mensal)</p>
            </div>
            <Switch checked={isRecorrente} onCheckedChange={setIsRecorrente} />
          </div>

          {isRecorrente ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Frequência</Label>
                <Select value={recorrencia} onValueChange={setRecorrencia}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="trimestral">Trimestral</SelectItem>
                    <SelectItem value="semestral">Semestral</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Dia de início</Label>
                  <Input type="number" min="1" max="31" value={diaInicio} onChange={e => setDiaInicio(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Dia de fim</Label>
                  <Input type="number" min="1" max="31" value={diaFim} onChange={e => setDiaFim(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                No dia {diaInicio} de cada mês cria automaticamente a instância com todos os clientes associados.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data início</Label>
                <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Data fim / prazo</Label>
                <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
              </div>
            </div>
          )}

          <Button className="w-full" onClick={() => void guardar()} disabled={busy}>
            {busy ? "A criar…" : "Criar campanha"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
