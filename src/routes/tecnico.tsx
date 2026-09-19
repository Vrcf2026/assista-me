import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RequireRole } from "@/components/RequireRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Ticket, Clock, CheckSquare, Building2, Camera,
  Play, Pause, Save, ArrowLeft, AlertTriangle,
  ChevronRight, Plus, Check, Zap, RefreshCw,
  Megaphone, Wrench, ShieldCheck, Repeat,
} from "lucide-react";
import { useTicketChecklists, useChecklistTemplates, useApplyChecklistTemplate, useToggleChecklistItem } from "@/hooks/use-ticket-checklists";

export const Route = createFileRoute("/tecnico")({
  component: TecnicoPage,
});

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Tab = "tickets" | "timer" | "checklist" | "cliente" | "campo";
type RiscoC = "risco" | "atencao" | "ok" | "sem_prazo";

interface TicketLite {
  id: string; numero: number; titulo: string;
  prioridade: "baixa" | "media" | "alta";
  estado: string; tipo_intervencao: string;
  prazo: string | null;
  client: { id: string; nome: string } | null;
}

interface TrabalhoLite {
  id: string; titulo: string;
  data_agendada: string | null;
  estado: string;
  client: { nome: string } | null;
}

interface PreventivaLite {
  id: string; titulo: string;
  proxima_data: string | null;
  client: { nome: string } | null;
  agendamento_id: string;
}

interface CampanhaLite {
  id: string; titulo: string; estado: string;
  data_fim: string | null; prazo: string | null;
  tipo: string; recorrencia: string | null;
  total: number; concluidos: number;
}

function calcRiscoCampanha(c: CampanhaLite): RiscoC {
  const fim = c.data_fim ?? c.prazo;
  if (!fim) return "sem_prazo";
  const dias = Math.floor((new Date(fim).getTime() - Date.now()) / 86400_000);
  const pendentes = c.total - c.concluidos;
  if (dias < 0 && pendentes > 0) return "risco";
  if (dias <= 2 && pendentes > 0) return "risco";
  if (dias <= 5 && pendentes > 0) return "atencao";
  return "ok";
}

// ── Utilitários ───────────────────────────────────────────────────────────────

const PRIO_COLOR: Record<string, string> = {
  alta: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  media: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  baixa: "bg-secondary text-muted-foreground border-border",
};

const PRIO_DOT: Record<string, string> = {
  alta: "bg-red-500",
  media: "bg-amber-500",
  baixa: "bg-muted-foreground",
};

function formatTimer(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function today() { return new Date().toISOString().slice(0, 10); }

// ── Componente principal ───────────────────────────────────────────────────────

function TecnicoPage() {
  return (
    <RequireRole role="admin">
      <TecnicoInner />
    </RequireRole>
  );
}

function TecnicoInner() {
  const [tab, setTab] = useState<Tab>("tickets");
  const [selectedTicket, setSelectedTicket] = useState<TicketLite | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">Técnico</span>
        </div>
        <Button variant="ghost" size="sm" asChild className="text-xs text-muted-foreground">
          <Link to="/">← App completa</Link>
        </Button>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto pb-20">
        {tab === "tickets" && (
          <TabTickets
            onOpenTicket={(t) => { setSelectedTicket(t); setTab("checklist"); }}
            onStartTimer={(t) => { setSelectedTicket(t); setTab("timer"); }}
            onOpenCliente={(id) => { setSelectedClientId(id); setTab("cliente"); }}
          />
        )}
        {tab === "timer" && <TabTimer ticket={selectedTicket} onBack={() => setTab("tickets")} />}
        {tab === "checklist" && <TabChecklist ticket={selectedTicket} onBack={() => setTab("tickets")} />}
        {tab === "cliente" && <TabCliente clientId={selectedClientId} onBack={() => setTab("tickets")} />}
        {tab === "campo" && <TabCampo onGoTickets={() => setTab("tickets")} />}
      </div>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md border-t bg-background/95 backdrop-blur grid grid-cols-5 z-10">
        {([
          { id: "tickets", icon: Ticket, label: "Tickets" },
          { id: "timer", icon: Clock, label: "Timer" },
          { id: "checklist", icon: CheckSquare, label: "Checklist" },
          { id: "cliente", icon: Building2, label: "Cliente" },
          { id: "campo", icon: Camera, label: "Campo" },
        ] as { id: Tab; icon: typeof Ticket; label: string }[]).map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
              tab === id ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Icon className={`h-5 w-5 ${tab === id ? "text-primary" : ""}`} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ── Componente TrabalhoCard — com botões de mudança de estado ─────────────────

function TrabalhoCard({ trabalho }: { trabalho: TrabalhoLite }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const changeEstado = async (novoEstado: string) => {
    setBusy(true);
    const { error } = await supabase.from("trabalhos").update({ estado: novoEstado }).eq("id", trabalho.id);
    if (error) toast.error(error.message);
    else { toast.success("Estado actualizado"); qc.invalidateQueries({ queryKey: ["tecnico-trabalhos-hoje"] }); }
    setBusy(false);
  };

  const ESTADOS = [
    { value: "pendente", label: "Pendente", next: "em_progresso", nextLabel: "Iniciar", cls: "text-muted-foreground" },
    { value: "em_progresso", label: "Em progresso", next: "concluido", nextLabel: "Concluir", cls: "text-primary" },
    { value: "concluido", label: "Concluído", next: null, nextLabel: null, cls: "text-emerald-600" },
  ];
  const est = ESTADOS.find(e => e.value === trabalho.estado) ?? ESTADOS[0];

  return (
    <div className="rounded-xl border bg-card mb-2 overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{trabalho.titulo}</p>
          <p className="text-xs text-muted-foreground">{(trabalho.client as any)?.nome ?? "—"}</p>
        </div>
        <span className={`text-xs font-medium shrink-0 ${est.cls}`}>{est.label}</span>
      </div>
      <div className={`border-t grid ${est.next ? "grid-cols-2" : "grid-cols-1"}`}>
        <Link
          to="/trabalhos/$id"
          params={{ id: trabalho.id } as any}
          className="flex items-center justify-center gap-1 py-2.5 text-xs text-muted-foreground hover:bg-secondary transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" /> Ver
        </Link>
        {est.next && (
          <button
            onClick={() => void changeEstado(est.next!)}
            disabled={busy}
            className="flex items-center justify-center gap-1 py-2.5 text-xs text-primary hover:bg-primary/5 border-l transition-colors font-medium"
          >
            <Play className="h-3.5 w-3.5" /> {est.nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Componente IniciarPreventivaBtn ────────────────────────────────────────────

function IniciarPreventivaBtn({ agendamentoId, clientId }: { agendamentoId: string; clientId: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const iniciar = async () => {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: ag } = await supabase
        .from("preventiva_agendamentos")
        .select("template_id")
        .eq("id", agendamentoId)
        .single();

      if (!ag) throw new Error("Agendamento não encontrado");

      // Criar execução
      const { data: exec, error } = await supabase.from("preventiva_execucoes").insert({
        agendamento_id: agendamentoId,
        client_id: clientId,
        template_id: (ag as any).template_id,
        data_execucao: today(),
        estado: "em_curso",
        tecnico_id: user?.id ?? null,
        minutos: 0,
      }).select("id").single();

      if (error) throw error;

      // Copiar tarefas do agendamento para o checklist da execução
      const { data: tarefas } = await supabase
        .from("preventiva_agendamento_tarefas")
        .select("id, descricao, ordem")
        .eq("agendamento_id", agendamentoId)
        .eq("ativo", true)
        .order("ordem");

      if (tarefas && tarefas.length > 0 && exec) {
        await supabase.from("preventiva_checklist").insert(
          tarefas.map((t: any) => ({
            execucao_id: (exec as any).id,
            tarefa_id: t.id,
            descricao: t.descricao,
            concluida: false,
            minutos: 0,
          }))
        );
      }

      toast.success("Preventiva iniciada!");
      navigate({ to: "/preventiva_/execucao/$id" as any, params: { id: (exec as any).id } as any });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao iniciar preventiva");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={() => void iniciar()}
      disabled={busy}
      className="flex items-center justify-center gap-1 py-2.5 text-xs text-primary hover:bg-primary/5 border-l transition-colors font-medium"
    >
      <Play className="h-3.5 w-3.5" /> {busy ? "A iniciar…" : "Executar"}
    </button>
  );
}

// ── Tab: Tickets ───────────────────────────────────────────────────────────────

function TabTickets({ onOpenTicket, onStartTimer, onOpenCliente }: {
  onOpenTicket: (t: TicketLite) => void;
  onStartTimer: (t: TicketLite) => void;
  onOpenCliente: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"aberto" | "tudo">("aberto");

  const { data: tickets = [], isLoading, refetch } = useQuery<TicketLite[]>({
    queryKey: ["tecnico-tickets", filter],
    queryFn: async () => {
      let q = supabase
        .from("tickets")
        .select("id, numero, titulo, prioridade, estado, tipo_intervencao, prazo, client:clients(id, nome)")
        .order("prioridade", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (filter === "aberto") q = q.neq("estado", "fechado");
      const { data } = await q;
      return (data ?? []) as unknown as TicketLite[];
    },
  });

  const { data: trabalhos = [] } = useQuery<TrabalhoLite[]>({
    queryKey: ["tecnico-trabalhos-hoje"],
    queryFn: async () => {
      const { data } = await supabase
        .from("trabalhos")
        .select("id, titulo, data_agendada, estado, client:clients(nome)")
        .eq("data_agendada", today())
        .neq("estado", "concluido")
        .order("data_agendada");
      return (data ?? []) as unknown as TrabalhoLite[];
    },
  });

  const { data: preventivas = [] } = useQuery<PreventivaLite[]>({
    queryKey: ["tecnico-preventivas-hoje"],
    queryFn: async () => {
      const { data } = await supabase
        .from("preventiva_agendamentos")
        .select("id, proxima_data, client:clients(nome), preventiva_templates(nome)")
        .eq("ativo", true)
        .lte("proxima_data", today())
        .order("proxima_data")
        .limit(5);
      return ((data ?? []) as any[]).map((p: any) => ({
        id: p.id,
        agendamento_id: p.id,
        titulo: p.preventiva_templates?.nome ?? "Preventiva",
        proxima_data: p.proxima_data,
        client: p.client,
      })) as PreventivaLite[];
    },
  });

  const { data: campanhas = [] } = useQuery<CampanhaLite[]>({
    queryKey: ["tecnico-campanhas"],
    queryFn: async () => {
      const { data: camps } = await supabase
        .from("campanhas" as any)
        .select("id, titulo, estado, data_fim, prazo, tipo, recorrencia")
        .eq("estado", "ativa")
        .order("created_at", { ascending: false })
        .limit(10);

      if (!camps?.length) return [];
      const ids = (camps as any[]).map((c: any) => c.id);
      const { data: cli } = await supabase
        .from("campanha_clientes" as any)
        .select("campanha_id, estado")
        .in("campanha_id", ids);

      const prog = new Map<string, { total: number; concluidos: number }>();
      ((cli ?? []) as any[]).forEach((c: any) => {
        const p = prog.get(c.campanha_id) ?? { total: 0, concluidos: 0 };
        p.total++;
        if (c.estado === "concluido") p.concluidos++;
        prog.set(c.campanha_id, p);
      });

      return (camps as any[]).map((c: any) => ({
        ...c,
        total: prog.get(c.id)?.total ?? 0,
        concluidos: prog.get(c.id)?.concluidos ?? 0,
      })) as CampanhaLite[];
    },
  });

  return (
    <div className="p-3 space-y-4">
      {/* Trabalhos agendados hoje */}
      {trabalhos.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5" /> Trabalhos hoje
          </h2>
          {trabalhos.map((t) => (
            <TrabalhoCard key={t.id} trabalho={t} />
          ))}
        </section>
      )}

      {/* Preventivas pendentes */}
      {preventivas.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Preventivas pendentes
          </h2>
          {preventivas.map((p) => (
            <div key={p.id} className="rounded-xl border bg-amber-500/5 border-amber-500/20 mb-2 overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.titulo}</p>
                  <p className="text-xs text-muted-foreground">{(p.client as any)?.nome ?? "—"} · {(p as any).proxima_data}</p>
                </div>
              </div>
              <div className="border-t grid grid-cols-2">
                <Link
                  to="/preventiva"
                  className="flex items-center justify-center gap-1 py-2.5 text-xs text-muted-foreground hover:bg-secondary transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" /> Ver
                </Link>
                <IniciarPreventivaBtn agendamentoId={p.agendamento_id} clientId={(p.client as any)?.id ?? ""} />
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Campanhas activas */}
      {campanhas.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Megaphone className="h-3.5 w-3.5" /> Campanhas activas
          </h2>
          {campanhas.map((c) => {
            const risco = calcRiscoCampanha(c);
            const pct = c.total > 0 ? Math.round((c.concluidos / c.total) * 100) : 0;
            const fim = c.data_fim ?? c.prazo;
            const dias = fim ? Math.floor((new Date(fim).getTime() - Date.now()) / 86400_000) : null;
            const iconCls = risco === "risco" ? "text-red-500" : risco === "atencao" ? "text-amber-500" : "text-primary";
            const borderCls = risco === "risco" ? "border-red-500/30 bg-red-500/5" : risco === "atencao" ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-card";
            return (
              <Link key={c.id} to="/campanhas/$id" params={{ id: c.id } as any} className="block mb-2">
                <div className={`p-3 rounded-xl border ${borderCls}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    {risco === "risco" ? <AlertTriangle className={`h-4 w-4 shrink-0 ${iconCls}`} /> : <Megaphone className={`h-4 w-4 shrink-0 ${iconCls}`} />}
                    <p className="text-sm font-medium flex-1 truncate">{c.titulo}</p>
                    {c.recorrencia && <Repeat className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                  {c.total > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{c.concluidos}/{c.total} clientes</span>
                        <span className={risco === "risco" ? "text-red-500 font-medium" : risco === "atencao" ? "text-amber-500 font-medium" : ""}>
                          {dias !== null ? (dias < 0 ? `${Math.abs(dias)}d em atraso` : dias === 0 ? "Hoje!" : `${dias}d`) : ""}
                        </span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </section>
      )}

      {/* Tickets */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Ticket className="h-3.5 w-3.5" /> Tickets
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilter(filter === "aberto" ? "tudo" : "aberto")}
              className="text-xs text-muted-foreground border rounded-full px-2.5 py-0.5 hover:bg-secondary transition-colors"
            >
              {filter === "aberto" ? "Em aberto" : "Todos"}
            </button>
            <button onClick={() => refetch()} className="text-muted-foreground hover:text-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-secondary animate-pulse" />)}
          </div>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Sem tickets.</p>
        ) : (
          <div className="space-y-2">
            {tickets.map((t) => (
              <div key={t.id} className="rounded-xl border bg-card overflow-hidden">
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      #{String(t.numero).padStart(5, "0")}
                    </span>
                    <div className="flex items-center gap-1">
                      {t.prazo && t.prazo < today() && (
                        <span className="text-[10px] text-red-500 font-medium">ATRASADO</span>
                      )}
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${PRIO_COLOR[t.prioridade]}`}>
                        {t.prioridade}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm font-medium leading-snug mb-1">{t.titulo}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onOpenCliente(t.client?.id ?? "")}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors truncate"
                    >
                      {t.client?.nome ?? "—"}
                    </button>
                    {t.prazo && (
                      <span className="text-[10px] text-muted-foreground shrink-0">· prazo {t.prazo}</span>
                    )}
                  </div>
                </div>
                <div className="border-t grid grid-cols-3">
                  <Link
                    to="/tickets/$id"
                    params={{ id: t.id }}
                    className="flex items-center justify-center gap-1 py-2.5 text-xs text-muted-foreground hover:bg-secondary transition-colors"
                  >
                    <ChevronRight className="h-3.5 w-3.5" /> Abrir
                  </Link>
                  <button
                    onClick={() => onStartTimer(t)}
                    className="flex items-center justify-center gap-1 py-2.5 text-xs text-primary hover:bg-primary/5 transition-colors border-x"
                  >
                    <Play className="h-3.5 w-3.5" /> Timer
                  </button>
                  <button
                    onClick={() => onOpenTicket(t)}
                    className="flex items-center justify-center gap-1 py-2.5 text-xs text-muted-foreground hover:bg-secondary transition-colors"
                  >
                    <CheckSquare className="h-3.5 w-3.5" /> Checklist
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Tab: Timer ─────────────────────────────────────────────────────────────────

const TIMER_KEY = (id: string) => `tecnico-timer:${id}`;

function TabTimer({ ticket, onBack }: { ticket: TicketLite | null; onBack: () => void }) {
  const qc = useQueryClient();
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);
  const startRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Restaurar do localStorage
  useEffect(() => {
    if (!ticket) return;
    const stored = localStorage.getItem(TIMER_KEY(ticket.id));
    if (stored) {
      try {
        const { startedAt, accumulated, paused } = JSON.parse(stored);
        if (!paused && startedAt) {
          const sec = Math.floor((Date.now() - startedAt) / 1000);
          setElapsed(accumulated + sec);
          startRef.current = startedAt;
          setRunning(true);
        } else {
          setElapsed(accumulated);
        }
      } catch { /* ignorar */ }
    }
  }, [ticket]);

  useEffect(() => {
    if (running && startRef.current) {
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current!) / 1000));
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const start = () => {
    if (!ticket) return;
    const now = Date.now();
    startRef.current = now;
    setRunning(true);
    localStorage.setItem(TIMER_KEY(ticket.id), JSON.stringify({ startedAt: now, accumulated: 0, paused: false }));
  };

  const pause = () => {
    if (!ticket) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
    localStorage.setItem(TIMER_KEY(ticket.id), JSON.stringify({ startedAt: 0, accumulated: elapsed, paused: true }));
  };

  const save = async () => {
    if (!ticket) return;
    const mins = Math.round(elapsed / 60);
    if (mins < 1) { toast.error("Mínimo 1 minuto"); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sem sessão");
      const { error } = await supabase.from("time_entries").insert({
        ticket_id: ticket.id,
        user_id: user.id,
        minutos: mins,
        descricao: descricao.trim() || null,
        data_trabalho: today(),
        tipo_intervencao: ticket.tipo_intervencao as "remota" | "presencial" | "preventiva" | "critica",
        estado_faturacao: "pendente",
        nao_contabilizar: false,
      });
      if (error) throw error;

      localStorage.removeItem(TIMER_KEY(ticket.id));
      toast.success(`${mins} min registados!`);
      setElapsed(0);
      setRunning(false);
      setDescricao("");
      qc.invalidateQueries({ queryKey: ["time_entries"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {ticket ? (
        <>
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-mono">#{String(ticket.numero).padStart(5,"0")}</p>
              <p className="text-sm font-medium truncate">{ticket.titulo}</p>
              <p className="text-xs text-muted-foreground">{ticket.client?.nome}</p>
            </div>
          </div>

          {/* Display do timer */}
          <div className="bg-secondary/40 rounded-2xl p-6 text-center space-y-4">
            <div className={`text-5xl font-mono font-bold tracking-wider ${running ? "text-primary" : "text-foreground"}`}>
              {formatTimer(elapsed)}
            </div>
            {running && (
              <div className="flex items-center justify-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-muted-foreground">a registar…</span>
              </div>
            )}
            <div className="flex gap-3 justify-center">
              {!running ? (
                <Button onClick={start} className="gap-2 px-6">
                  <Play className="h-4 w-4" /> Iniciar
                </Button>
              ) : (
                <Button variant="outline" onClick={pause} className="gap-2 px-6">
                  <Pause className="h-4 w-4" /> Pausar
                </Button>
              )}
            </div>
          </div>

          {/* Guardar */}
          {elapsed > 0 && (
            <div className="space-y-2">
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descrição do trabalho (opcional)…"
                rows={2}
                className="text-sm resize-none"
              />
              <Button
                onClick={save}
                disabled={saving || elapsed < 60}
                className="w-full gap-2"
              >
                <Save className="h-4 w-4" />
                {saving ? "A guardar…" : `Guardar ${Math.round(elapsed/60)} min`}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12 space-y-3">
          <Clock className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Selecciona um ticket na tab Tickets e clica em Timer</p>
          <Button variant="outline" size="sm" onClick={onBack}>Ver tickets</Button>
        </div>
      )}
    </div>
  );
}

// ── Tab: Checklist ─────────────────────────────────────────────────────────────

function TabChecklist({ ticket, onBack }: { ticket: TicketLite | null; onBack: () => void }) {
  const { data: checklists = [] } = useTicketChecklists(ticket?.id);
  const { data: templates = [] } = useChecklistTemplates();
  const applyTemplate = useApplyChecklistTemplate();
  const toggleItem = useToggleChecklistItem();
  const [selectedTemplate, setSelectedTemplate] = useState("");

  const totalItems = checklists.reduce((s, cl) => s + cl.ticket_checklist_items.length, 0);
  const doneItems = checklists.reduce((s, cl) => s + cl.ticket_checklist_items.filter(i => i.checked).length, 0);
  const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  const handleApply = async () => {
    if (!ticket || !selectedTemplate) return;
    try {
      await applyTemplate.mutateAsync({ ticketId: ticket.id, templateId: selectedTemplate });
      setSelectedTemplate("");
      toast.success("Checklist aplicada!");
    } catch { toast.error("Erro ao aplicar checklist"); }
  };

  if (!ticket) return (
    <div className="text-center py-12 space-y-3">
      <CheckSquare className="h-10 w-10 text-muted-foreground mx-auto" />
      <p className="text-sm text-muted-foreground">Selecciona um ticket na tab Tickets</p>
      <Button variant="outline" size="sm" onClick={onBack}>Ver tickets</Button>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground font-mono">#{String(ticket.numero).padStart(5,"0")}</p>
          <p className="text-sm font-medium truncate">{ticket.titulo}</p>
        </div>
        {totalItems > 0 && (
          <span className="text-sm font-semibold text-primary shrink-0">{pct}%</span>
        )}
      </div>

      {/* Progresso */}
      {totalItems > 0 && (
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}

      {/* Aplicar template */}
      {templates.length > 0 && (
        <div className="flex gap-2">
          <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <SelectTrigger className="flex-1 text-sm h-9">
              <SelectValue placeholder="Aplicar template…" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-9 px-3" onClick={handleApply} disabled={!selectedTemplate || applyTemplate.isPending}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Checklists */}
      {checklists.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Sem checklists. Aplica um template acima.</p>
      ) : (
        checklists.map((cl) => {
          const items = [...cl.ticket_checklist_items].sort((a, b) => a.sort_order - b.sort_order);
          const done = items.filter(i => i.checked).length;
          return (
            <div key={cl.id} className="border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-secondary/40 flex items-center justify-between">
                <p className="text-sm font-medium">{cl.name}</p>
                <span className="text-xs text-muted-foreground font-mono">{done}/{items.length}</span>
              </div>
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => toggleItem.mutate({ id: item.id, checked: !item.checked })}
                  className="w-full flex items-center gap-3 px-4 py-3 border-t first:border-t-0 hover:bg-secondary/30 transition-colors text-left"
                >
                  <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    item.checked ? "bg-primary border-primary" : "border-border"
                  }`}>
                    {item.checked && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                  </div>
                  <span className={`text-sm ${item.checked ? "line-through text-muted-foreground" : ""}`}>
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Tab: Cliente ───────────────────────────────────────────────────────────────

function TabCliente({ clientId, onBack }: { clientId: string | null; onBack: () => void }) {
  const [search, setSearch] = useState("");

  const { data: clientes = [] } = useQuery({
    queryKey: ["tecnico-clientes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, nome, email_geral, morada")
        .order("nome");
      return data ?? [];
    },
  });

  const { data: cliente } = useQuery({
    queryKey: ["tecnico-cliente", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, nome, email_geral, morada, horas_pacote, marca")
        .eq("id", clientId!)
        .single();
      return data;
    },
  });

  const { data: equipamentos = [] } = useQuery({
    queryKey: ["tecnico-equipamentos", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("client_equipment" as any)
        .select("*")
        .eq("client_id", clientId!)
        .order("tipo");
      return (data ?? []) as any[];
    },
  });

  const { data: ticketsCliente = [] } = useQuery({
    queryKey: ["tecnico-tickets-cliente", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tickets")
        .select("id, numero, titulo, estado, prioridade")
        .eq("client_id", clientId!)
        .neq("estado", "fechado")
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  if (!clientId || !cliente) {
    const filtered = clientes.filter(c =>
      c.nome.toLowerCase().includes(search.toLowerCase())
    );
    return (
      <div className="p-4 space-y-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar cliente…"
          className="h-10"
        />
        <div className="space-y-2">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => onBack()}
              className="w-full flex items-center gap-3 p-3 rounded-xl border bg-card text-left hover:bg-secondary/40 transition-colors"
            >
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-primary">
                  {c.nome.slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.nome}</p>
                {c.email_geral && <p className="text-xs text-muted-foreground">{c.email_geral}</p>}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  const alertasGarantia = equipamentos.filter(e => {
    if (!e.fim_garantia) return false;
    return new Date(e.fim_garantia) < new Date(Date.now() + 90 * 86400_000);
  });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="font-semibold">{cliente.nome}</p>
          {cliente.email_geral && (
            <a href={`tel:${cliente.email_geral}`} className="text-xs text-primary">
              {cliente.email_geral}
            </a>
          )}
        </div>
      </div>

      {/* Alertas garantia */}
      {alertasGarantia.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-1">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Garantias a verificar
          </p>
          {alertasGarantia.map((e: any) => (
            <p key={e.id} className="text-xs text-amber-600 dark:text-amber-300">
              {e.marca} {e.modelo} — {new Date(e.fim_garantia) < new Date() ? "expirada" : `expira ${e.fim_garantia}`}
            </p>
          ))}
        </div>
      )}

      {/* Tickets abertos */}
      {ticketsCliente.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tickets em aberto</p>
          {ticketsCliente.map((t) => (
            <Link key={t.id} to="/tickets/$id" params={{ id: t.id }} className="block">
              <div className="flex items-center gap-2 p-3 rounded-xl border bg-card">
                <span className={`h-2 w-2 rounded-full shrink-0 ${PRIO_DOT[t.prioridade]}`} />
                <span className="text-xs font-mono text-muted-foreground">#{String(t.numero).padStart(5,"0")}</span>
                <span className="text-sm truncate flex-1">{t.titulo}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Equipamentos */}
      {equipamentos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Equipamentos</p>
          {equipamentos.map((e: any) => (
            <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{e.marca} {e.modelo}</p>
                <p className="text-xs text-muted-foreground">{e.tipo}{e.numero_serie ? ` · ${e.numero_serie}` : ""}</p>
              </div>
              {e.fim_garantia && new Date(e.fim_garantia) < new Date() && (
                <span className="text-[10px] text-red-500 font-medium shrink-0">EXPIRADA</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* WhatsApp */}
      {cliente.email_geral && (
        <a
          href={`https://wa.me/351962000000?text=${encodeURIComponent(`Olá ${cliente.nome}, sou o técnico da VRCF. `)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-green-500 text-white font-medium text-sm"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.553 4.112 1.524 5.84L.057 23.448c-.073.28.013.577.225.773.166.153.382.232.6.232.063 0 .127-.007.188-.022l5.768-1.504A11.948 11.948 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.8 9.8 0 01-5.102-1.43l-.364-.218-3.774.985 1.003-3.67-.238-.377A9.786 9.786 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
          </svg>
          WhatsApp ao cliente
        </a>
      )}
    </div>
  );
}

// ── Tab: Campo ─────────────────────────────────────────────────────────────────

function TabCampo({ onGoTickets }: { onGoTickets: () => void }) {
  const [ticketId, setTicketId] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: tickets = [] } = useQuery({
    queryKey: ["tecnico-tickets-campo"],
    queryFn: async () => {
      const { data } = await supabase
        .from("tickets")
        .select("id, numero, titulo")
        .neq("estado", "fechado")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const handlePhoto = async (file: File) => {
    if (!ticketId) { toast.error("Selecciona um ticket primeiro"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${ticketId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("ticket-attachments")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage
        .from("ticket-attachments")
        .getPublicUrl(path);
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("ticket_attachments" as any).insert({
        ticket_id: ticketId,
        user_id: user?.id,
        filename: file.name,
        url: publicUrl,
        content_type: file.type,
        size_bytes: file.size,
      });
      toast.success("Foto anexada ao ticket!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar foto");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-sm font-semibold">Trabalho de campo</h2>

      {/* Seleccionar ticket */}
      <Select value={ticketId} onValueChange={setTicketId}>
        <SelectTrigger className="h-10">
          <SelectValue placeholder="Seleccionar ticket…" />
        </SelectTrigger>
        <SelectContent>
          {tickets.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              #{String(t.numero).padStart(5,"0")} {t.titulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Tirar/anexar foto */}
      <div
        className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:bg-secondary/30 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <Camera className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium">Tirar foto / Anexar ficheiro</p>
        <p className="text-xs text-muted-foreground mt-1">Clica para abrir a câmara ou escolher ficheiro</p>
        {uploading && <p className="text-xs text-primary mt-2 animate-pulse">A enviar…</p>}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhoto(f); }}
      />

      {/* Criar ticket rápido */}
      <div className="border rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" /> Ticket rápido de campo
        </p>
        <QuickTicketForm onCreated={onGoTickets} />
      </div>
    </div>
  );
}

function QuickTicketForm({ onCreated }: { onCreated: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: clientes = [] } = useQuery({
    queryKey: ["tecnico-clientes-form"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, nome").order("nome");
      return data ?? [];
    },
  });

  const create = async () => {
    if (!titulo.trim() || !clientId) { toast.error("Título e cliente obrigatórios"); return; }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("tickets").insert({
        titulo: titulo.trim(),
        client_id: clientId,
        prioridade: "media",
        estado: "aberto",
        tipo_intervencao: "presencial" as const,
        pedido_por: user?.id ?? null,
        descricao: "Ticket criado em campo via PWA técnico",
      });
      if (error) throw error;
      toast.success("Ticket criado!");
      setTitulo(""); setClientId("");
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Select value={clientId} onValueChange={setClientId}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Cliente…" />
        </SelectTrigger>
        <SelectContent>
          {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Problema observado…"
        className="h-9 text-sm"
        onKeyDown={(e) => e.key === "Enter" && create()}
      />
      <Button onClick={create} disabled={busy} className="w-full h-9 text-sm gap-1.5">
        <Plus className="h-4 w-4" /> {busy ? "A criar…" : "Criar ticket"}
      </Button>
    </div>
  );
}
