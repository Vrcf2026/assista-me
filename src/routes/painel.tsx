import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { getCriticalSla, formatRemaining } from "@/lib/sla";

export const Route = createFileRoute("/painel")({
  component: PainelPage,
});

function PainelPage() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && (!user || role !== "admin")) navigate({ to: "/login" });
  }, [user, role, loading, navigate]);
  if (loading || role !== "admin") return null;
  return <Painel />;
}

interface TicketRow {
  id: string; numero: number; titulo: string; prioridade: string;
  estado: string; tipo_intervencao: string; created_at: string;
  tecnico_responsavel: string | null;
  client: { nome: string } | null;
}
interface TrabalhoRow {
  id: string; titulo: string; data_agendada: string | null; estado: string;
  client: { nome: string } | null;
}
interface CampanhaRow {
  id: string; titulo: string; prazo: string | null; estado: string;
  clientes: { estado: string }[];
}
interface PreventivaRow {
  id: string; proxima_data: string; ativo: boolean;
  client: { nome: string } | null;
  template: { nome: string } | null;
}

function Painel() {
  const [now, setNow] = useState(new Date());
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [trabalhos, setTrabalhos] = useState<TrabalhoRow[]>([]);
  const [campanhas, setCampanhas] = useState<CampanhaRow[]>([]);
  const [preventivas, setPreventivas] = useState<PreventivaRow[]>([]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    const [t, w, c, p] = await Promise.all([
      supabase.from("tickets")
        .select("id, numero, titulo, prioridade, estado, tipo_intervencao, created_at, tecnico_responsavel, client:clients(nome)")
        .in("estado", ["aberto", "em_progresso"])
        .order("created_at"),
      supabase.from("trabalhos")
        .select("id, titulo, data_agendada, estado, client:clients(nome)")
        .in("estado", ["pendente", "agendado", "em_curso"])
        .order("data_agendada"),
      supabase.from("campanhas")
        .select("id, titulo, prazo, estado, clientes:campanha_clientes(estado)")
        .eq("estado", "ativa"),
      supabase.from("preventiva_agendamentos")
        .select("id, proxima_data, ativo, client:clients(nome), template:preventiva_templates(nome)")
        .eq("ativo", true)
        .order("proxima_data"),
    ]);
    setTickets((t.data ?? []) as any);
    setTrabalhos((w.data ?? []) as any);
    setCampanhas((c.data ?? []) as any);
    setPreventivas((p.data ?? []) as any);
  }, []);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("painel-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "trabalhos" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "campanhas" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "campanha_clientes" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "preventiva_agendamentos" }, () => void load())
      .subscribe();
    const refresh = setInterval(load, 60_000);
    return () => { supabase.removeChannel(ch); clearInterval(refresh); };
  }, [load]);

  const alertas = useMemo(() => {
    const out: { id: string; numero: number; cliente: string; remaining: number }[] = [];
    for (const t of tickets) {
      if (t.tipo_intervencao !== "critica") continue;
      const sla = getCriticalSla(new Date(t.created_at), now);
      if (sla.remainingMinutes < 60) {
        out.push({ id: t.id, numero: t.numero, cliente: t.client?.nome ?? "—", remaining: sla.remainingMinutes });
      }
    }
    return out;
  }, [tickets, now]);

  const ticketsOrdenados = useMemo(() => {
    return [...tickets].sort((a, b) => {
      const pa = a.prioridade === "alta" ? 0 : 1;
      const pb = b.prioridade === "alta" ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [tickets]);

  function ticketColor(t: TicketRow): string {
    const minutos = (now.getTime() - new Date(t.created_at).getTime()) / 60000;
    if (t.prioridade === "alta" || minutos > 120) return "border-red-500";
    if (minutos > 30) return "border-amber-500";
    return "border-emerald-500";
  }
  function dateColor(d: string | null): string {
    if (!d) return "border-slate-500";
    const dt = new Date(d); dt.setHours(0, 0, 0, 0);
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const diff = (dt.getTime() - today.getTime()) / 86_400_000;
    if (diff < 0) return "border-red-500";
    if (diff <= 1) return "border-amber-500";
    return "border-emerald-500";
  }
  function weekColor(d: string | null): string {
    if (!d) return "border-slate-500";
    const dt = new Date(d); dt.setHours(0, 0, 0, 0);
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const diff = (dt.getTime() - today.getTime()) / 86_400_000;
    if (diff < 0) return "border-red-500";
    if (diff <= 7) return "border-amber-500";
    return "border-emerald-500";
  }
  function tempoAberto(created: string): string {
    const m = Math.floor((now.getTime() - new Date(created).getTime()) / 60000);
    const h = Math.floor(m / 60); const min = m % 60;
    if (h === 0) return `${min}min`;
    return `${h}h ${min}min`;
  }
  function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + "…" : s; }

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-orange-500 flex items-center justify-center font-bold text-white">V</div>
          <div>
            <div className="font-bold text-orange-500">VRCF — PAINEL OPERACIONAL</div>
            <div className="text-xs text-slate-400">Tempo real</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-mono tabular-nums">{now.toLocaleTimeString("pt-PT")}</div>
          <div className="text-xs text-slate-400">{now.toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</div>
        </div>
      </header>

      {alertas.length > 0 && (
        <div className="bg-red-600 text-white px-6 py-3 font-semibold animate-pulse flex flex-wrap gap-x-6 gap-y-1">
          {alertas.map((a) => (
            <span key={a.id}>
              ⚠️ SLA CRÍTICO: #{String(a.numero).padStart(4, "0")} {a.cliente} —{" "}
              {a.remaining <= 0 ? "VENCIDO" : `vence em ${formatRemaining(a.remaining)}`}
            </span>
          ))}
        </div>
      )}

      <div className="flex-1 grid grid-cols-4 gap-4 p-4 overflow-hidden">
        {/* Tickets */}
        <Column title={`🎫 TICKETS (${ticketsOrdenados.length})`} empty={ticketsOrdenados.length === 0}>
          {ticketsOrdenados.map((t) => (
            <div key={t.id} className={`border-l-4 ${ticketColor(t)} bg-slate-900/60 rounded px-3 py-2`}>
              <div className="flex items-center gap-2 text-sm font-mono">
                <span className="text-orange-400 font-bold">#{String(t.numero).padStart(4, "0")}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${t.prioridade === "alta" ? "bg-red-500/20 text-red-300" : t.prioridade === "media" ? "bg-amber-500/20 text-amber-300" : "bg-slate-500/20 text-slate-300"}`}>{t.prioridade}</span>
                <span className="text-slate-400 ml-auto text-xs">⏱ {tempoAberto(t.created_at)}</span>
              </div>
              <div className="text-sm font-medium">{t.client?.nome ?? "—"}</div>
              <div className="text-xs text-slate-300">{truncate(t.titulo, 28)}</div>
              {t.tecnico_responsavel && <div className="text-xs text-slate-400">👤 {t.tecnico_responsavel}</div>}
            </div>
          ))}
        </Column>

        {/* Trabalhos */}
        <Column title={`📋 TRABALHOS (${trabalhos.length})`} empty={trabalhos.length === 0}>
          {trabalhos.map((w) => (
            <div key={w.id} className={`border-l-4 ${dateColor(w.data_agendada)} bg-slate-900/60 rounded px-3 py-2`}>
              <div className="text-sm font-medium">{w.titulo}</div>
              <div className="text-xs text-slate-300">{w.client?.nome ?? "—"}</div>
              <div className="text-xs text-slate-400">{w.data_agendada ? new Date(w.data_agendada).toLocaleDateString("pt-PT") : "Sem data"}</div>
            </div>
          ))}
        </Column>

        {/* Campanhas */}
        <Column title={`📣 CAMPANHAS (${campanhas.length})`} empty={campanhas.length === 0}>
          {campanhas.map((c) => {
            const total = c.clientes.length;
            const done = c.clientes.filter((x) => x.estado === "concluido").length;
            const pct = total ? Math.round((done / total) * 100) : 0;
            return (
              <div key={c.id} className={`border-l-4 ${weekColor(c.prazo)} bg-slate-900/60 rounded px-3 py-2`}>
                <div className="text-sm font-medium">{c.titulo}</div>
                <div className="text-xs text-slate-300">{done}/{total} clientes</div>
                <div className="w-full h-1.5 bg-slate-700 rounded mt-1 overflow-hidden">
                  <div className="h-full bg-orange-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-xs text-slate-400 mt-1">{c.prazo ? `Prazo: ${new Date(c.prazo).toLocaleDateString("pt-PT")}` : "Sem prazo"}</div>
              </div>
            );
          })}
        </Column>

        {/* Preventiva */}
        <Column title={`🛡️ PREVENTIVA (${preventivas.length})`} empty={preventivas.length === 0}>
          {preventivas.map((p) => (
            <div key={p.id} className={`border-l-4 ${weekColor(p.proxima_data)} bg-slate-900/60 rounded px-3 py-2`}>
              <div className="text-sm font-medium">{p.client?.nome ?? "—"}</div>
              <div className="text-xs text-slate-300">{p.template?.nome ?? "—"}</div>
              <div className="text-xs text-slate-400">📅 {new Date(p.proxima_data).toLocaleDateString("pt-PT")}</div>
            </div>
          ))}
        </Column>
      </div>
    </div>
  );
}

function Column({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <section className="flex flex-col min-h-0 bg-slate-950/40 rounded-lg border border-slate-800">
      <h2 className="px-3 py-2 border-b border-slate-800 font-bold text-orange-500 text-sm">{title}</h2>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {empty ? <div className="text-emerald-400 text-center text-sm py-4">✅ Sem pendentes</div> : children}
      </div>
    </section>
  );
}
