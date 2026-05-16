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
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Trash2, Play } from "lucide-react";
import { toast } from "sonner";
import { formatMinutes } from "@/lib/format";

export const Route = createFileRoute("/campanhas_/$id")({
  component: Page,
});

const PRIO_BADGE: Record<string, string> = {
  alta: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  media: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  normal: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};
const PRIO_LABEL: Record<string, string> = { alta: "🔴 Alta", media: "🟡 Média", normal: "🟢 Normal" };
const ESTADO_LABEL: Record<string, string> = { pendente: "Pendente", agendado: "Agendado", em_curso: "Em curso", concluido: "Concluído" };
const CAMP_ESTADO_LABEL: Record<string, string> = { ativa: "Activa", concluida: "Concluída", cancelada: "Cancelada" };

interface Campanha {
  id: string;
  titulo: string;
  descricao: string | null;
  prioridade: string;
  estado: string;
  prazo: string | null;
}
interface Tarefa { id: string; descricao: string; ordem: number; }
interface ClienteRow {
  id: string;
  client_id: string;
  estado: string;
  data_agendada: string | null;
  minutos: number;
  clients: { id: string; nome: string } | null;
  totalTar: number;
  concTar: number;
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
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [c, setC] = useState<Campanha | null>(null);
  const [editTit, setEditTit] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [allClients, setAllClients] = useState<{ id: string; nome: string }[]>([]);
  const [novoClient, setNovoClient] = useState("");

  const load = async () => {
    const { data, error } = await supabase
      .from("campanhas")
      .select("id, titulo, descricao, prioridade, estado, prazo")
      .eq("id", id).single();
    if (error || !data) { toast.error(error?.message ?? "Não encontrado"); return; }
    setC(data as Campanha);
    setTitulo(data.titulo); setDescricao(data.descricao ?? "");

    const { data: tar } = await supabase.from("campanha_tarefas").select("*").eq("campanha_id", id).order("ordem");
    setTarefas((tar ?? []) as Tarefa[]);

    const { data: cli } = await supabase
      .from("campanha_clientes")
      .select("id, client_id, estado, data_agendada, minutos, clients(id, nome)")
      .eq("campanha_id", id)
      .order("created_at");
    const rows = (cli ?? []) as unknown as Omit<ClienteRow, "totalTar" | "concTar">[];
    const ccIds = rows.map(r => r.id);
    const totals = new Map<string, { total: number; conc: number }>();
    if (ccIds.length > 0) {
      const { data: ck } = await supabase
        .from("campanha_checklist")
        .select("campanha_cliente_id, concluida")
        .in("campanha_cliente_id", ccIds);
      (ck ?? []).forEach(x => {
        const t = totals.get(x.campanha_cliente_id) ?? { total: 0, conc: 0 };
        t.total++; if (x.concluida) t.conc++;
        totals.set(x.campanha_cliente_id, t);
      });
    }
    setClientes(rows.map(r => ({ ...r, totalTar: totals.get(r.id)?.total ?? 0, concTar: totals.get(r.id)?.conc ?? 0 })));

    const { data: ac } = await supabase.from("clients").select("id, nome").order("nome");
    setAllClients(ac ?? []);
  };
  useEffect(() => { void load(); }, [id]);

  const update = async (patch: Partial<Campanha>) => {
    if (!c) return;
    setC({ ...c, ...patch });
    await supabase.from("campanhas").update(patch).eq("id", id);
  };

  // Tarefas (checklist da campanha)
  const addTarefa = async () => {
    const ordem = tarefas.length === 0 ? 0 : Math.max(...tarefas.map(t => t.ordem)) + 1;
    const { data: row, error } = await supabase.from("campanha_tarefas").insert({
      campanha_id: id, descricao: "", ordem,
    }).select("*").single();
    if (error || !row) return toast.error(error?.message ?? "Erro");
    setTarefas(prev => [...prev, row as Tarefa]);
    setTimeout(() => {
      document.querySelector<HTMLInputElement>(`input[data-tar="${row.id}"]`)?.focus();
    }, 30);
  };
  const updateTarefa = async (tid: string, descricao: string) => {
    setTarefas(prev => prev.map(t => t.id === tid ? { ...t, descricao } : t));
    await supabase.from("campanha_tarefas").update({ descricao }).eq("id", tid);
  };
  const delTarefa = async (tid: string) => {
    setTarefas(prev => prev.filter(t => t.id !== tid));
    await supabase.from("campanha_tarefas").delete().eq("id", tid);
  };

  // Clientes
  const addCliente = async () => {
    if (!novoClient) return toast.error("Escolhe um cliente");
    if (clientes.some(x => x.client_id === novoClient)) return toast.error("Cliente já adicionado");
    const { data: row, error } = await supabase.from("campanha_clientes").insert({
      campanha_id: id, client_id: novoClient,
    }).select("id, client_id, estado, data_agendada, minutos, clients(id, nome)").single();
    if (error || !row) return toast.error(error?.message ?? "Erro");
    // Copiar tarefas para checklist
    if (tarefas.length > 0) {
      const items = tarefas.map(t => ({
        campanha_cliente_id: (row as { id: string }).id,
        tarefa_id: t.id,
        descricao: t.descricao,
        ordem: t.ordem,
      }));
      await supabase.from("campanha_checklist").insert(items);
    }
    setNovoClient("");
    void load();
    toast.success("Cliente adicionado");
  };

  const setEstadoCliente = async (ccId: string, estado: string) => {
    setClientes(prev => prev.map(x => x.id === ccId ? { ...x, estado } : x));
    await supabase.from("campanha_clientes").update({ estado }).eq("id", ccId);
  };

  const delCliente = async (ccId: string) => {
    if (!confirm("Remover este cliente da campanha?")) return;
    await supabase.from("campanha_clientes").delete().eq("id", ccId);
    setClientes(prev => prev.filter(x => x.id !== ccId));
  };

  const disponiveis = useMemo(
    () => allClients.filter(a => !clientes.some(x => x.client_id === a.id)),
    [allClients, clientes]
  );

  const totalCli = clientes.length;
  const concCli = clientes.filter(x => x.estado === "concluido").length;
  const pctCli = totalCli === 0 ? 0 : Math.round((concCli / totalCli) * 100);

  if (!c) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/campanhas" })}>
        <ArrowLeft className="h-4 w-4 mr-1" />Voltar
      </Button>

      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            {editTit ? (
              <Input
                value={titulo}
                autoFocus
                onChange={e => setTitulo(e.target.value)}
                onBlur={() => { setEditTit(false); if (titulo.trim() && titulo !== c.titulo) void update({ titulo: titulo.trim() }); }}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="text-xl font-semibold"
              />
            ) : (
              <h1 className="text-xl font-semibold cursor-pointer hover:text-primary" onClick={() => setEditTit(true)}>
                {c.titulo}
              </h1>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-1 rounded text-xs ${PRIO_BADGE[c.prioridade]}`}>{PRIO_LABEL[c.prioridade]}</span>
            <Select value={c.prioridade} onValueChange={v => void update({ prioridade: v })}>
              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alta">🔴 Alta</SelectItem>
                <SelectItem value="media">🟡 Média</SelectItem>
                <SelectItem value="normal">🟢 Normal</SelectItem>
              </SelectContent>
            </Select>
            <Select value={c.estado} onValueChange={v => void update({ estado: v })}>
              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativa">{CAMP_ESTADO_LABEL.ativa}</SelectItem>
                <SelectItem value="concluida">{CAMP_ESTADO_LABEL.concluida}</SelectItem>
                <SelectItem value="cancelada">{CAMP_ESTADO_LABEL.cancelada}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={c.prazo ?? ""}
              onChange={e => void update({ prazo: e.target.value || null })}
              className="h-8 w-[150px] text-xs"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Descrição</Label>
          <Textarea
            rows={2}
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            onBlur={() => { if (descricao !== (c.descricao ?? "")) void update({ descricao: descricao || null }); }}
          />
        </div>
      </Card>

      {/* Checklist da campanha (passos a executar em cada cliente) */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Checklist de tarefas</h2>
            <p className="text-xs text-muted-foreground">Estas tarefas são copiadas para cada cliente quando adicionado.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void addTarefa()}><Plus className="h-3.5 w-3.5 mr-1" />Tarefa</Button>
        </div>
        <div className="space-y-1.5">
          {tarefas.map(t => (
            <div key={t.id} className="flex items-center gap-2">
              <Input
                data-tar={t.id}
                value={t.descricao}
                onChange={e => updateTarefa(t.id, e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void addTarefa(); } }}
                className="h-8"
                placeholder="Descrição da tarefa…"
              />
              <Button size="sm" variant="ghost" onClick={() => void delTarefa(t.id)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
          {tarefas.length === 0 && <p className="text-xs text-muted-foreground">Sem tarefas. Clica em "+ Tarefa" para adicionar.</p>}
        </div>
      </Card>

      {/* Clientes afectados */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold">Clientes afectados</h2>
          <div className="flex gap-2 items-center">
            <Select value={novoClient} onValueChange={setNovoClient}>
              <SelectTrigger className="h-9 w-[240px]"><SelectValue placeholder="Escolhe cliente…" /></SelectTrigger>
              <SelectContent>
                {disponiveis.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                {disponiveis.length === 0 && <div className="text-xs text-muted-foreground p-2">Todos adicionados</div>}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => void addCliente()}><Plus className="h-3.5 w-3.5 mr-1" />Adicionar</Button>
          </div>
        </div>

        {clientes.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Sem clientes adicionados.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="w-[140px]">Data agendada</TableHead>
                <TableHead className="w-[140px]">Estado</TableHead>
                <TableHead className="w-[130px]">Progresso</TableHead>
                <TableHead className="w-[80px]">Tempo</TableHead>
                <TableHead className="w-[160px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.clients?.nome ?? "—"}</TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      className="h-8"
                      value={r.data_agendada ?? ""}
                      onChange={async e => {
                        const v = e.target.value || null;
                        setClientes(prev => prev.map(x => x.id === r.id ? { ...x, data_agendada: v } : x));
                        await supabase.from("campanha_clientes").update({ data_agendada: v }).eq("id", r.id);
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Select value={r.estado} onValueChange={v => void setEstadoCliente(r.id, v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(["pendente", "agendado", "em_curso", "concluido"] as const).map(e => (
                          <SelectItem key={e} value={e}>{ESTADO_LABEL[e]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">{r.concTar}/{r.totalTar} ✅</TableCell>
                  <TableCell className="text-xs tabular-nums">{r.minutos > 0 ? formatMinutes(r.minutos) : "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/campanhas_/execucao/$clienteId" params={{ clienteId: r.id }}>
                          <Play className="h-3 w-3 mr-1" />Executar
                        </Link>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void delCliente(r.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {clientes.length > 0 && (
          <div className="space-y-1 border-t pt-3">
            <div className="flex justify-between text-xs"><span>{concCli} de {totalCli} clientes concluídos</span><span>{pctCli}%</span></div>
            <Progress value={pctCli} />
          </div>
        )}
      </Card>
    </div>
  );
}
