import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RequireRole } from "@/components/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Plus, Trash2, Check, Clock, Circle,
  GripVertical, LayoutGrid, List, Repeat, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/campanhas_/$id")({
  component: Page,
});

// ── Tipos ──────────────────────────────────────────────────────────────────────
interface Campanha {
  id: string; titulo: string; descricao: string | null;
  prioridade: string; estado: string; prazo: string | null;
  data_inicio: string | null; data_fim: string | null;
  recorrencia: string | null; tipo: string;
  dia_inicio_recorrencia: number | null; dia_fim_recorrencia: number | null;
}

interface Tarefa { id: string; descricao: string; ordem: number; }

interface ClienteRow {
  id: string; client_id: string; estado: string;
  data_agendada: string | null; minutos: number; notas: string | null;
  client: { id: string; nome: string } | null;
  checklist: { tarefa_id: string; concluida: boolean; observacao: string | null }[];
}

const PRIO_BADGE: Record<string, string> = {
  alta: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  media: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  normal: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};
const PRIO_LABEL: Record<string, string> = { alta: "🔴 Alta", media: "🟡 Média", normal: "🟢 Normal" };
const ESTADO_CLI: Record<string, { label: string; cls: string }> = {
  pendente: { label: "Pendente", cls: "text-muted-foreground" },
  agendado: { label: "Agendado", cls: "text-blue-600 dark:text-blue-400" },
  em_curso: { label: "Em curso", cls: "text-amber-600 dark:text-amber-400" },
  concluido: { label: "Concluído", cls: "text-emerald-600 dark:text-emerald-400" },
};
const REC_LABEL: Record<string, string> = { mensal: "Mensal", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual" };

function today() { return new Date().toISOString().slice(0, 10); }

function diasLabel(fim: string | null) {
  if (!fim) return null;
  const d = Math.floor((new Date(fim).getTime() - Date.now()) / 86400_000);
  if (d < 0) return `${Math.abs(d)}d em atraso`;
  if (d === 0) return "Hoje!";
  if (d === 1) return "Amanhã";
  return `${d} dias`;
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
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<"auto" | "grid" | "list">("auto");
  const [novoClient, setNovoClient] = useState("");
  const [editTit, setEditTit] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: campanha, isLoading: loadingC } = useQuery<Campanha | null>({
    queryKey: ["campanha", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campanhas" as any)
        .select("id, titulo, descricao, prioridade, estado, prazo, data_inicio, data_fim, recorrencia, tipo, dia_inicio_recorrencia, dia_fim_recorrencia")
        .eq("id", id).single();
      if (error) { toast.error(error.message); return null; }
      setTitulo((data as any).titulo);
      setDescricao((data as any).descricao ?? "");
      return data as unknown as Campanha;
    },
  });

  const { data: tarefas = [] } = useQuery<Tarefa[]>({
    queryKey: ["campanha-tarefas", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("campanha_tarefas")
        .select("id, descricao, ordem")
        .eq("campanha_id", id)
        .order("ordem");
      return (data ?? []) as Tarefa[];
    },
  });

  const { data: clientes = [], refetch: refetchCli } = useQuery<ClienteRow[]>({
    queryKey: ["campanha-clientes", id],
    queryFn: async () => {
      const { data: cli } = await supabase
        .from("campanha_clientes")
        .select("id, client_id, estado, data_agendada, minutos, notas, client:clients(id, nome)")
        .eq("campanha_id", id)
        .order("created_at");

      if (!cli?.length) return [];

      const ccIds = cli.map(c => c.id);
      const { data: ck } = await supabase
        .from("campanha_checklist")
        .select("campanha_cliente_id, tarefa_id: tarefa_id, concluida, observacao")
        .in("campanha_cliente_id", ccIds);

      return cli.map(c => ({
        ...c,
        client: c.client as any,
        checklist: ((ck ?? []) as any[])
          .filter((x: any) => x.campanha_cliente_id === c.id)
          .map((x: any) => ({ tarefa_id: x.tarefa_id, concluida: x.concluida, observacao: x.observacao })),
      })) as unknown as ClienteRow[];
    },
  });

  const { data: allClients = [] } = useQuery({
    queryKey: ["clients-select"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, nome").order("nome");
      return data ?? [];
    },
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const update = async (patch: Record<string, unknown>) => {
    await supabase.from("campanhas" as any).update(patch).eq("id", id);
    qc.invalidateQueries({ queryKey: ["campanha", id] });
  };

  const addTarefa = async () => {
    const ordem = tarefas.length;
    const { data } = await supabase
      .from("campanha_tarefas")
      .insert({ campanha_id: id, descricao: "", ordem })
      .select("id, descricao, ordem").single();
    if (data) {
      qc.invalidateQueries({ queryKey: ["campanha-tarefas", id] });
      // Criar checklist item para cada cliente existente
      if (clientes.length > 0) {
        await supabase.from("campanha_checklist").insert(
          clientes.map(c => ({
            campanha_cliente_id: c.id,
            tarefa_id: (data as any).id,
            descricao: "",
            concluida: false,
            minutos: 0,
          }))
        );
      }
    }
  };

  const updateTarefa = async (tarefaId: string, descricao: string) => {
    await supabase.from("campanha_tarefas").update({ descricao }).eq("id", tarefaId);
    qc.invalidateQueries({ queryKey: ["campanha-tarefas", id] });
  };

  const delTarefa = async (tarefaId: string) => {
    if (!confirm("Eliminar esta fase? Remove o progresso de todos os clientes.")) return;
    await supabase.from("campanha_tarefas").delete().eq("id", tarefaId);
    qc.invalidateQueries({ queryKey: ["campanha-tarefas", id] });
    qc.invalidateQueries({ queryKey: ["campanha-clientes", id] });
  };

  const addCliente = async () => {
    if (!novoClient) return;
    const { data: cc, error } = await supabase
      .from("campanha_clientes")
      .insert({ campanha_id: id, client_id: novoClient, estado: "pendente", minutos: 0 })
      .select("id").single();
    if (error) { toast.error(error.message); return; }
    // Criar checklist items para as tarefas existentes
    if (tarefas.length > 0 && cc) {
      await supabase.from("campanha_checklist").insert(
        tarefas.map(t => ({
          campanha_cliente_id: (cc as any).id,
          tarefa_id: t.id,
          descricao: t.descricao,
          concluida: false,
          minutos: 0,
        }))
      );
    }
    setNovoClient("");
    qc.invalidateQueries({ queryKey: ["campanha-clientes", id] });
  };

  const delCliente = async (ccId: string) => {
    if (!confirm("Remover este cliente da campanha?")) return;
    await supabase.from("campanha_clientes").delete().eq("id", ccId);
    qc.invalidateQueries({ queryKey: ["campanha-clientes", id] });
  };

  const setEstadoCli = async (ccId: string, estado: string) => {
    const patch: Record<string, unknown> = { estado };
    if (estado === "concluido") patch.concluido_em = new Date().toISOString();
    await supabase.from("campanha_clientes").update(patch as any).eq("id", ccId);
    qc.invalidateQueries({ queryKey: ["campanha-clientes", id] });
  };

  const toggleFase = async (ccId: string, tarefaId: string, atual: boolean) => {
    // Encontrar o item de checklist
    const { data: existing } = await supabase
      .from("campanha_checklist")
      .select("id")
      .eq("campanha_cliente_id", ccId)
      .eq("tarefa_id", tarefaId)
      .maybeSingle();

    if (existing) {
      await supabase.from("campanha_checklist")
        .update({ concluida: !atual, concluida_em: !atual ? new Date().toISOString() : (null as string | null) })
        .eq("id", (existing as any).id);
    } else {
      // Criar se não existir
      await supabase.from("campanha_checklist").insert({
        campanha_cliente_id: ccId,
        tarefa_id: tarefaId,
        descricao: tarefas.find(t => t.id === tarefaId)?.descricao ?? "",
        concluida: true,
        concluida_em: new Date().toISOString(),
        minutos: 0,
      });
    }
    qc.invalidateQueries({ queryKey: ["campanha-clientes", id] });
  };

  // ── Computed ─────────────────────────────────────────────────────────────────
  const disponiveis = useMemo(
    () => allClients.filter(a => !clientes.some(x => x.client_id === a.id)),
    [allClients, clientes]
  );

  const totalCli = clientes.length;
  const concCli = clientes.filter(x => x.estado === "concluido").length;
  const pctCli = totalCli === 0 ? 0 : Math.round((concCli / totalCli) * 100);

  // Vista automática: grelha se ≤6 fases, lista se >6
  const efectiveView = viewMode === "auto"
    ? (tarefas.length > 0 && tarefas.length <= 6 ? "grid" : "list")
    : viewMode;

  const fim: string | null = campanha?.data_fim ?? campanha?.prazo ?? null;
  const diasR = diasLabel(fim);
  const emAtraso = fim && fim < today() && campanha?.estado === "ativa";

  if (loadingC || !campanha) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/campanhas" })}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
      </Button>

      {/* Header da campanha */}
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            {editTit ? (
              <Input
                value={titulo} autoFocus
                onChange={e => setTitulo(e.target.value)}
                onBlur={() => {
                  setEditTit(false);
                  if (titulo.trim() && titulo !== campanha.titulo) void update({ titulo: titulo.trim() });
                }}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="text-xl font-semibold h-auto py-0"
              />
            ) : (
              <h1 className="text-xl font-semibold cursor-pointer hover:text-primary" onClick={() => setEditTit(true)}>
                {campanha.titulo}
              </h1>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full ${PRIO_BADGE[campanha.prioridade]}`}>
                {PRIO_LABEL[campanha.prioridade]}
              </span>
              {campanha.recorrencia && (
                <span className="text-xs flex items-center gap-1 text-muted-foreground">
                  <Repeat className="h-3 w-3" /> {REC_LABEL[campanha.recorrencia]}
                  {campanha.dia_inicio_recorrencia && ` · dias ${campanha.dia_inicio_recorrencia}${campanha.dia_fim_recorrencia ? `–${campanha.dia_fim_recorrencia}` : ""}`}
                </span>
              )}
              {fim && (
                <span className={`text-xs font-medium ${emAtraso ? "text-red-500" : "text-amber-600 dark:text-amber-400"}`}>
                  {emAtraso ? <><AlertTriangle className="inline h-3 w-3 mr-0.5" />Em atraso</> : diasR}
                  {fim && ` (${new Date(fim).toLocaleDateString("pt-PT")})`}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={campanha.prioridade} onValueChange={v => void update({ prioridade: v })}>
              <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alta">🔴 Alta</SelectItem>
                <SelectItem value="media">🟡 Média</SelectItem>
                <SelectItem value="normal">🟢 Normal</SelectItem>
              </SelectContent>
            </Select>
            <Select value={campanha.estado} onValueChange={v => void update({ estado: v })}>
              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativa">Activa</SelectItem>
                <SelectItem value="concluida">Concluída</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date" value={campanha.data_fim ?? campanha.prazo ?? ""}
              onChange={e => void update({ data_fim: e.target.value || null, prazo: e.target.value || null })}
              className="h-8 w-[145px] text-xs"
            />
          </div>
        </div>

        <Textarea
          rows={2} value={descricao}
          onChange={e => setDescricao(e.target.value)}
          onBlur={() => { if (descricao !== (campanha.descricao ?? "")) void update({ descricao: descricao || null }); }}
          placeholder="Descrição opcional…"
          className="text-sm resize-none"
        />

        {/* Progresso global */}
        {totalCli > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{concCli} de {totalCli} clientes concluídos</span>
              <span className="font-medium">{pctCli}%</span>
            </div>
            <Progress value={pctCli} className="h-2" />
          </div>
        )}
      </Card>

      {/* Fases (tarefas) */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm">Fases por cliente</h2>
            <p className="text-xs text-muted-foreground">
              {tarefas.length === 0
                ? "Sem fases — os clientes serão marcados directamente como concluídos"
                : `${tarefas.length} fase${tarefas.length > 1 ? "s" : ""} · cada cliente passa por todas`}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void addTarefa()}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Fase
          </Button>
        </div>
        {tarefas.length > 0 && (
          <div className="space-y-1.5">
            {tarefas.map((t, i) => (
              <div key={t.id} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{i + 1}.</span>
                <Input
                  value={t.descricao}
                  onChange={e => updateTarefa(t.id, e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void addTarefa(); } }}
                  className="h-8 flex-1 text-sm"
                  placeholder={`Fase ${i + 1}…`}
                />
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => void delTarefa(t.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Clientes */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold text-sm">
            Clientes afectados ({totalCli})
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Toggle vista */}
            {tarefas.length > 0 && (
              <div className="flex border rounded-lg overflow-hidden text-xs">
                {(["auto", "grid", "list"] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setViewMode(v)}
                    className={`px-2.5 py-1.5 transition-colors ${viewMode === v ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
                  >
                    {v === "auto" ? "Auto" : v === "grid" ? <LayoutGrid className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </div>
            )}
            <Select value={novoClient} onValueChange={setNovoClient}>
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue placeholder="Adicionar cliente…" />
              </SelectTrigger>
              <SelectContent>
                {disponiveis.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                {disponiveis.length === 0 && <div className="text-xs text-muted-foreground p-2">Todos adicionados</div>}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => void addCliente()} disabled={!novoClient}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
            </Button>
          </div>
        </div>

        {clientes.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            Sem clientes. Adiciona acima.
          </p>
        ) : tarefas.length === 0 ? (
          // Vista simples — sem fases
          <VistaSimples clientes={clientes} onEstado={setEstadoCli} onDel={delCliente} />
        ) : efectiveView === "grid" ? (
          // Vista grelha — cliente × fase
          <VistaGrelha clientes={clientes} tarefas={tarefas} onToggle={toggleFase} onEstado={setEstadoCli} onDel={delCliente} />
        ) : (
          // Vista lista — expandível por cliente
          <VistaLista clientes={clientes} tarefas={tarefas} onToggle={toggleFase} onEstado={setEstadoCli} onDel={delCliente} />
        )}
      </Card>
    </div>
  );
}

// ── Vista Simples — sem fases ─────────────────────────────────────────────────
function VistaSimples({ clientes, onEstado, onDel }: {
  clientes: ClienteRow[];
  onEstado: (id: string, estado: string) => void;
  onDel: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {clientes.map(c => {
        const est = ESTADO_CLI[c.estado] ?? ESTADO_CLI.pendente;
        return (
          <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg border hover:bg-secondary/20 group">
            <button
              onClick={() => onEstado(c.id, c.estado === "concluido" ? "pendente" : "concluido")}
              className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                c.estado === "concluido"
                  ? "bg-emerald-500 border-emerald-500"
                  : "border-border hover:border-emerald-400"
              }`}
            >
              {c.estado === "concluido" && <Check className="h-3.5 w-3.5 text-white" />}
            </button>
            <span className="text-sm font-medium flex-1 truncate">{c.client?.nome ?? "—"}</span>
            <Select value={c.estado} onValueChange={v => onEstado(c.id, v)}>
              <SelectTrigger className="h-7 w-[120px] text-xs border-0 bg-transparent focus:ring-0 p-0">
                <span className={`text-xs font-medium ${est.cls}`}>{est.label}</span>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ESTADO_CLI).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={() => onDel(c.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Vista Grelha — cliente × fase ────────────────────────────────────────────
function VistaGrelha({ clientes, tarefas, onToggle, onEstado, onDel }: {
  clientes: ClienteRow[];
  tarefas: Tarefa[];
  onToggle: (ccId: string, tarefaId: string, atual: boolean) => void;
  onEstado: (id: string, estado: string) => void;
  onDel: (id: string) => void;
}) {
  const sorted = [...tarefas].sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-4 font-medium text-xs text-muted-foreground min-w-[160px]">
              Cliente
            </th>
            {sorted.map((t, i) => (
              <th key={t.id} className="text-center py-2 px-3 font-medium text-xs text-muted-foreground min-w-[90px] max-w-[120px]">
                <span className="block text-[10px] text-muted-foreground/60 mb-0.5">{i + 1}</span>
                <span className="line-clamp-2 leading-tight">{t.descricao || `Fase ${i + 1}`}</span>
              </th>
            ))}
            <th className="text-center py-2 px-3 font-medium text-xs text-muted-foreground min-w-[90px]">
              Estado
            </th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {clientes.map(c => {
            const done = sorted.filter(t =>
              c.checklist.find(x => x.tarefa_id === t.id)?.concluida
            ).length;
            const total = sorted.length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;

            return (
              <tr key={c.id} className="border-b hover:bg-secondary/20 group">
                {/* Nome + progresso */}
                <td className="py-2 pr-4">
                  <p className="font-medium text-sm truncate max-w-[180px]">{c.client?.nome ?? "—"}</p>
                  {total > 0 && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="h-1 flex-1 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums">{done}/{total}</span>
                    </div>
                  )}
                </td>

                {/* Células por fase */}
                {sorted.map(t => {
                  const item = c.checklist.find(x => x.tarefa_id === t.id);
                  const done = item?.concluida ?? false;
                  return (
                    <td key={t.id} className="text-center py-2 px-3">
                      <button
                        onClick={() => onToggle(c.id, t.id, done)}
                        className={`h-8 w-8 rounded-full border-2 flex items-center justify-center mx-auto transition-all hover:scale-110 ${
                          done
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : "border-border hover:border-emerald-400"
                        }`}
                        title={done ? "Marcar como pendente" : "Marcar como concluído"}
                      >
                        {done && <Check className="h-4 w-4" />}
                      </button>
                    </td>
                  );
                })}

                {/* Estado global */}
                <td className="text-center py-2 px-3">
                  <Select value={c.estado} onValueChange={v => onEstado(c.id, v)}>
                    <SelectTrigger className="h-7 w-[100px] text-xs mx-auto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ESTADO_CLI).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>

                {/* Eliminar */}
                <td className="py-2 pl-1">
                  <button
                    onClick={() => onDel(c.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>

        {/* Rodapé com % por fase */}
        <tfoot>
          <tr className="border-t">
            <td className="py-2 text-xs text-muted-foreground">Conclusão por fase</td>
            {sorted.map(t => {
              const done = clientes.filter(c =>
                c.checklist.find(x => x.tarefa_id === t.id)?.concluida
              ).length;
              const pct = clientes.length > 0 ? Math.round((done / clientes.length) * 100) : 0;
              return (
                <td key={t.id} className="text-center py-2 px-3">
                  <span className={`text-xs font-medium ${pct === 100 ? "text-emerald-600 dark:text-emerald-400" : pct > 50 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                    {pct}%
                  </span>
                </td>
              );
            })}
            <td /><td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Vista Lista — expandível por cliente ──────────────────────────────────────
function VistaLista({ clientes, tarefas, onToggle, onEstado, onDel }: {
  clientes: ClienteRow[];
  tarefas: Tarefa[];
  onToggle: (ccId: string, tarefaId: string, atual: boolean) => void;
  onEstado: (id: string, estado: string) => void;
  onDel: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const sorted = [...tarefas].sort((a, b) => a.ordem - b.ordem);

  const toggle = (id: string) => setExpanded(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  return (
    <div className="space-y-2">
      {clientes.map(c => {
        const done = sorted.filter(t => c.checklist.find(x => x.tarefa_id === t.id)?.concluida).length;
        const total = sorted.length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const isExpanded = expanded.has(c.id);

        return (
          <div key={c.id} className="border rounded-xl overflow-hidden">
            {/* Header do cliente */}
            <div
              className="flex items-center gap-3 p-3 cursor-pointer hover:bg-secondary/20 transition-colors group"
              onClick={() => toggle(c.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{c.client?.nome ?? "—"}</span>
                  <span className={`text-xs font-medium ${ESTADO_CLI[c.estado]?.cls ?? ""}`}>
                    {ESTADO_CLI[c.estado]?.label}
                  </span>
                </div>
                {total > 0 && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="h-1.5 flex-1 bg-secondary rounded-full overflow-hidden max-w-[200px]">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{done}/{total} fases</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Select
                  value={c.estado}
                  onValueChange={v => { onEstado(c.id, v); }}
                >
                  <SelectTrigger className="h-7 w-[110px] text-xs" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ESTADO_CLI).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  onClick={e => { e.stopPropagation(); onDel(c.id); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <span className="text-muted-foreground text-xs">{isExpanded ? "▲" : "▼"}</span>
              </div>
            </div>

            {/* Fases expandidas */}
            {isExpanded && (
              <div className="border-t divide-y bg-secondary/10">
                {sorted.map((t, i) => {
                  const item = c.checklist.find(x => x.tarefa_id === t.id);
                  const isDone = item?.concluida ?? false;
                  return (
                    <button
                      key={t.id}
                      onClick={() => onToggle(c.id, t.id, isDone)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/30 transition-colors text-left"
                    >
                      <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                      <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isDone ? "bg-emerald-500 border-emerald-500" : "border-border"
                      }`}>
                        {isDone && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <span className={`text-sm flex-1 ${isDone ? "line-through text-muted-foreground" : ""}`}>
                        {t.descricao || `Fase ${i + 1}`}
                      </span>
                      {item?.observacao && (
                        <span className="text-xs text-muted-foreground truncate max-w-[150px]">{item.observacao}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
