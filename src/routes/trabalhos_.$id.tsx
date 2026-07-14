import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { RequireRole } from "@/components/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Trash2, Plus, Play, Square, Check } from "lucide-react";
import { toast } from "sonner";
import { formatMinutes } from "@/lib/format";

export const Route = createFileRoute("/trabalhos_/$id")({
  component: Page,
});

const ESTADO_LABEL: Record<string, string> = {
  pendente: "Pendente",
  agendado: "Agendado",
  em_curso: "Em curso",
  concluido: "Concluído",
};
const PRIO_LABEL: Record<string, string> = { alta: "🔴 Alta", media: "🟡 Média", normal: "🟢 Normal" };
const PRIO_BADGE: Record<string, string> = {
  alta: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  media: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  normal: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};

interface Trabalho {
  id: string;
  client_id: string | null;
  titulo: string;
  descricao: string | null;
  notas: string | null;
  data_agendada: string | null;
  prioridade: string;
  estado: string;
  minutos: number;
  clients: { id: string; nome: string } | null;
}

interface ChecklistItem {
  id: string;
  ordem: number;
  descricao: string;
  concluida: boolean;
  concluida_em: string | null;
}

interface TempoRow {
  id: string;
  minutos: number;
  modo: string;
  data_trabalho: string;
  created_at: string;
}

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
  const [t, setT] = useState<Trabalho | null>(null);
  const [editTitulo, setEditTitulo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [notas, setNotas] = useState("");
  const [data, setData] = useState("");
  const [check, setCheck] = useState<ChecklistItem[]>([]);
  const [tempos, setTempos] = useState<TempoRow[]>([]);

  const load = async () => {
    const { data: row, error } = await supabase
      .from("trabalhos")
      .select("id, client_id, titulo, descricao, notas, data_agendada, prioridade, estado, minutos, clients(id, nome)")
      .eq("id", id).single();
    if (error || !row) { toast.error(error?.message ?? "Não encontrado"); return; }
    const tr = row as unknown as Trabalho;
    setT(tr); setTitulo(tr.titulo); setDescricao(tr.descricao ?? ""); setNotas(tr.notas ?? ""); setData(tr.data_agendada ?? "");

    const { data: ck } = await supabase.from("trabalho_checklist").select("*").eq("trabalho_id", id).order("ordem");
    setCheck((ck ?? []) as ChecklistItem[]);

    const { data: tp } = await supabase.from("trabalho_tempo").select("*").eq("trabalho_id", id).order("created_at", { ascending: false });
    setTempos((tp ?? []) as TempoRow[]);
  };
  useEffect(() => { void load(); }, [id]);

  const update = async (patch: Partial<Omit<Trabalho, "clients">>) => {
    if (!t) return;
    setT({ ...t, ...patch });
    await supabase.from("trabalhos").update(patch).eq("id", id);
  };

  const guardarTexto = async () => {
    await supabase.from("trabalhos").update({ descricao: descricao || null, notas: notas || null }).eq("id", id);
    toast.success("Guardado");
  };

  // Checklist
  const addCk = async (descAtPos?: { afterId: string }) => {
    const ordem = check.length === 0 ? 0 : Math.max(...check.map(c => c.ordem)) + 1;
    const { data: row, error } = await supabase.from("trabalho_checklist").insert({
      trabalho_id: id, descricao: "", ordem,
    }).select("*").single();
    if (error || !row) return toast.error(error?.message ?? "Erro");
    setCheck(prev => [...prev, row as ChecklistItem]);
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(`input[data-ck="${row.id}"]`);
      el?.focus();
    }, 30);
  };
  const updateCk = async (cid: string, patch: Partial<ChecklistItem>) => {
    setCheck(prev => prev.map(c => c.id === cid ? { ...c, ...patch } : c));
    await supabase.from("trabalho_checklist").update(patch).eq("id", cid);
  };
  const toggleCk = async (it: ChecklistItem) => {
    const next = !it.concluida;
    await updateCk(it.id, { concluida: next, concluida_em: next ? new Date().toISOString() : null });
  };
  const delCk = async (cid: string) => {
    setCheck(prev => prev.filter(c => c.id !== cid));
    await supabase.from("trabalho_checklist").delete().eq("id", cid);
  };
  const ckDone = check.filter(c => c.concluida).length;
  const ckPct = check.length === 0 ? 0 : Math.round((ckDone / check.length) * 100);

  useEffect(() => {
    if (check.length > 0 && ckDone === check.length && t && t.estado !== "concluido") {
      // sugere mudança
      const ask = setTimeout(() => {
        if (confirm("Todas as tarefas concluídas. Marcar trabalho como Concluído?")) {
          void update({ estado: "concluido" });
        }
      }, 300);
      return () => clearTimeout(ask);
    }
  }, [ckDone, check.length]);

  // Timer
  const [timeMode, setTimeMode] = useState<"manual" | "chrono" | "range">("manual");
  const [tManual, setTManual] = useState<number>(0);
  const [chronoStart, setChronoStart] = useState<number | null>(null);
  const [chronoElapsed, setChronoElapsed] = useState(0);
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFim, setHoraFim] = useState("");

  useEffect(() => {
    if (chronoStart == null) return;
    setChronoElapsed(Date.now() - chronoStart);
    const itv = window.setInterval(() => setChronoElapsed(Date.now() - chronoStart), 1000);
    return () => window.clearInterval(itv);
  }, [chronoStart]);

  const pad = (n: number) => String(n).padStart(2, "0");
  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  };
  const nowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  const computeMin = (): number => {
    if (timeMode === "manual") return tManual || 0;
    if (timeMode === "chrono") {
      if (chronoStart != null) return Math.max(1, Math.round((Date.now() - chronoStart) / 60000));
      return 0;
    }
    if (timeMode === "range") {
      if (!horaInicio || !horaFim) return 0;
      const [h1, m1] = horaInicio.split(":").map(Number);
      const [h2, m2] = horaFim.split(":").map(Number);
      let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (mins <= 0) mins += 24 * 60;
      return mins;
    }
    return 0;
  };

  const stopChrono = () => {
    if (chronoStart == null) return;
    const mins = Math.max(1, Math.round((Date.now() - chronoStart) / 60000));
    setChronoStart(null); setChronoElapsed(0); setTManual(mins); setTimeMode("manual");
    toast.success(`${mins} min preenchidos`);
  };

  const registarTempo = async () => {
    const mins = computeMin();
    if (mins <= 0) return toast.error("Sem minutos para registar");
    const { data: u } = await supabase.auth.getUser();
    const modo = timeMode === "manual" ? "manual" : timeMode === "chrono" ? "cronometro" : "intervalo";
    const { data: row, error } = await supabase.from("trabalho_tempo").insert({
      trabalho_id: id, minutos: mins, modo, user_id: u.user?.id ?? null,
    }).select("*").single();
    if (error || !row) return toast.error(error?.message ?? "Erro");
    const novoTotal = (t?.minutos ?? 0) + mins;
    await supabase.from("trabalhos").update({ minutos: novoTotal }).eq("id", id);
    setT(prev => prev ? { ...prev, minutos: novoTotal } : prev);
    setTempos(prev => [row as TempoRow, ...prev]);
    setTManual(0); setHoraInicio(""); setHoraFim("");
    toast.success(`${mins} min registados`);
  };

  const apagarTempo = async (rid: string, mins: number) => {
    if (!confirm("Apagar este registo de tempo?")) return;
    await supabase.from("trabalho_tempo").delete().eq("id", rid);
    setTempos(prev => prev.filter(x => x.id !== rid));
    const novoTotal = Math.max(0, (t?.minutos ?? 0) - mins);
    await supabase.from("trabalhos").update({ minutos: novoTotal }).eq("id", id);
    setT(prev => prev ? { ...prev, minutos: novoTotal } : prev);
  };

  if (!t) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/trabalhos" })}>
        <ArrowLeft className="h-4 w-4 mr-1" />Voltar
      </Button>

      {/* Cabeçalho */}
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            {editTitulo ? (
              <Input
                value={titulo}
                autoFocus
                onChange={e => setTitulo(e.target.value)}
                onBlur={() => { setEditTitulo(false); if (titulo.trim() && titulo !== t.titulo) void update({ titulo: titulo.trim() }); }}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="text-xl font-semibold"
              />
            ) : (
              <h1 className="text-xl font-semibold cursor-pointer hover:text-primary" onClick={() => setEditTitulo(true)}>
                {t.titulo}
              </h1>
            )}
            {t.clients && (
              <Link to="/clientes/$id" params={{ id: t.clients.id }} className="text-xs text-muted-foreground hover:underline">
                {t.clients.nome}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-1 rounded text-xs ${PRIO_BADGE[t.prioridade]}`}>{PRIO_LABEL[t.prioridade]}</span>
            <Select value={t.prioridade} onValueChange={v => void update({ prioridade: v })}>
              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alta">🔴 Alta</SelectItem>
                <SelectItem value="media">🟡 Média</SelectItem>
                <SelectItem value="normal">🟢 Normal</SelectItem>
              </SelectContent>
            </Select>
            <Select value={t.estado} onValueChange={v => void update({ estado: v })}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["pendente", "agendado", "em_curso", "concluido"] as const).map(e => (
                  <SelectItem key={e} value={e}>{ESTADO_LABEL[e]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Label className="text-xs">Data agendada</Label>
          <Input type="date" value={data} onChange={e => { setData(e.target.value); void update({ data_agendada: e.target.value || null }); }} className="w-[160px] h-8" />
        </div>
      </Card>

      {/* Descrição/notas */}
      <Card className="p-4 space-y-3">
        <div>
          <Label>Descrição</Label>
          <Textarea rows={3} value={descricao} onChange={e => setDescricao(e.target.value)} />
        </div>
        <div>
          <Label>Notas internas</Label>
          <Textarea rows={3} value={notas} onChange={e => setNotas(e.target.value)} />
        </div>
        <Button size="sm" variant="outline" onClick={() => void guardarTexto()}>Guardar</Button>
      </Card>

      {/* Checklist */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Checklist</h2>
          <Button size="sm" variant="outline" onClick={() => void addCk()}><Plus className="h-3.5 w-3.5 mr-1" />Tarefa</Button>
        </div>
        {check.length > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs"><span>{ckDone} de {check.length} concluídas</span><span>{ckPct}%</span></div>
            <Progress value={ckPct} />
          </div>
        )}
        <div className="space-y-1.5">
          {check.map(it => (
            <div key={it.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void toggleCk(it)}
                className={`flex-shrink-0 h-6 w-6 rounded border-2 flex items-center justify-center ${it.concluida ? "bg-emerald-600 border-emerald-600 text-white" : "border-border"}`}
              >
                {it.concluida && <Check className="h-4 w-4" />}
              </button>
              <Input
                data-ck={it.id}
                value={it.descricao}
                onChange={e => updateCk(it.id, { descricao: e.target.value })}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void addCk(); } }}
                className={`h-8 ${it.concluida ? "line-through text-muted-foreground" : ""}`}
                placeholder="Descrição da tarefa…"
              />
              <Button size="sm" variant="ghost" onClick={() => void delCk(it.id)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
          {check.length === 0 && <p className="text-xs text-muted-foreground">Sem tarefas. Clica em "+ Tarefa" para adicionar.</p>}
        </div>
      </Card>

      {/* Tempo */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Tempo registado</h2>
          <span className="text-sm tabular-nums">Total: <span className="font-semibold">{formatMinutes(t.minutos)}</span></span>
        </div>

        <div className="flex gap-1 border rounded p-0.5 bg-background w-fit">
          {(["manual", "chrono", "range"] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setTimeMode(m)}
              className={`px-3 py-1 text-xs rounded ${timeMode === m ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
            >
              {m === "manual" ? "Manual" : m === "chrono" ? "Cronómetro" : "Início/Fim"}
            </button>
          ))}
        </div>

        {timeMode === "manual" && (
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-xs">Minutos</Label>
              <Input type="number" min={0} className="w-32" value={tManual || ""} onChange={e => setTManual(parseInt(e.target.value) || 0)} />
            </div>
            <Button size="sm" onClick={() => void registarTempo()}>Registar</Button>
          </div>
        )}
        {timeMode === "chrono" && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="font-mono text-2xl tabular-nums">{formatElapsed(chronoElapsed)}</div>
            {chronoStart == null ? (
              <Button size="sm" onClick={() => setChronoStart(Date.now())}><Play className="h-3.5 w-3.5 mr-1" />Iniciar</Button>
            ) : (
              <>
                <Button size="sm" variant="destructive" onClick={stopChrono}><Square className="h-3.5 w-3.5 mr-1" />Parar</Button>
              </>
            )}
            {tManual > 0 && chronoStart == null && <Button size="sm" onClick={() => void registarTempo()}>Registar {tManual} min</Button>}
          </div>
        )}
        {timeMode === "range" && (
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <Label className="text-xs">Início</Label>
              <div className="flex gap-1">
                <Input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} className="w-28" />
                <Button type="button" size="sm" variant="ghost" onClick={() => setHoraInicio(nowHHMM())}>Agora</Button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Fim</Label>
              <div className="flex gap-1">
                <Input type="time" value={horaFim} onChange={e => setHoraFim(e.target.value)} className="w-28" />
                <Button type="button" size="sm" variant="ghost" onClick={() => setHoraFim(nowHHMM())}>Agora</Button>
              </div>
            </div>
            {horaInicio && horaFim && <div className="text-xs text-muted-foreground">= {computeMin()} min</div>}
            <Button size="sm" onClick={() => void registarTempo()}>Registar</Button>
          </div>
        )}

        {tempos.length > 0 && (
          <div className="border-t pt-2">
            <div className="text-xs text-muted-foreground mb-1">Histórico</div>
            <div className="space-y-1">
              {tempos.map(r => (
                <div key={r.id} className="flex items-center gap-2 text-xs py-1 border-b last:border-0">
                  <span className="tabular-nums w-24">{new Date(r.created_at).toLocaleString("pt-PT")}</span>
                  <span className="capitalize text-muted-foreground w-20">{r.modo}</span>
                  <span className="font-medium tabular-nums">{formatMinutes(r.minutos)}</span>
                  <Button size="sm" variant="ghost" className="ml-auto h-7 px-2" onClick={() => void apagarTempo(r.id, r.minutos)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
