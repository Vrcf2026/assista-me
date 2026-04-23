import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { SlaBadge } from "@/components/SlaBadge";
import { formatTicketNumber, formatDateTime } from "@/lib/format";
import { getCriticalSla } from "@/lib/sla";
import { AlertTriangle, Clock, Inbox, Star, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface Row {
  id: string;
  numero: number;
  titulo: string;
  estado: string;
  prioridade: string;
  tipo_intervencao: string;
  created_at: string;
  updated_at: string;
  client: { id: string; nome: string; dias_fecho_automatico: number | null } | null;
}

interface SatisfactionAvg {
  count: number;
  avg: number;
}

export function AdminDashboard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [sat, setSat] = useState<SatisfactionAvg>({ count: 0, avg: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("tickets")
      .select(
        "id, numero, titulo, estado, prioridade, tipo_intervencao, created_at, updated_at, client:clients(id, nome, dias_fecho_automatico)",
      )
      .neq("estado", "fechado")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data ?? []) as unknown as Row[]);

    const { data: ratings } = await supabase
      .from("ticket_satisfaction")
      .select("rating")
      .not("rating", "is", null);
    if (ratings && ratings.length > 0) {
      const vals = (ratings as { rating: number }[]).map((r) => r.rating);
      setSat({ count: vals.length, avg: vals.reduce((a, b) => a + b, 0) / vals.length });
    }
    setLoading(false);
  }

  const stats = useMemo(() => {
    const abertos = rows.filter((r) => r.estado === "aberto").length;
    const emProgresso = rows.filter((r) => r.estado === "em_progresso").length;
    const aguardaCliente = rows.filter((r) => r.estado === "aguarda_cliente").length;
    const altaPrio = rows.filter((r) => r.prioridade === "alta").length;
    return { abertos, emProgresso, aguardaCliente, altaPrio, total: rows.length };
  }, [rows]);

  // SLAs críticos a vencer ou vencidos
  const slaAlerts = useMemo(() => {
    const now = new Date();
    return rows
      .filter((r) => r.tipo_intervencao === "critica")
      .map((r) => ({ ...r, sla: getCriticalSla(new Date(r.created_at), now) }))
      .filter((r) => r.sla.status !== "ok")
      .sort((a, b) => a.sla.remainingMinutes - b.sla.remainingMinutes);
  }, [rows]);

  // Sem resposta há +24h (com base em updated_at)
  const semResposta = useMemo(() => {
    const now = Date.now();
    const limit = 24 * 60 * 60 * 1000;
    return rows
      .filter((r) => r.estado !== "aguarda_cliente" && now - new Date(r.updated_at).getTime() > limit)
      .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
      .slice(0, 5);
  }, [rows]);

  // Aguarda cliente prestes a auto-fechar (faltam <= 2 dias)
  const prestesAutoFechar = useMemo(() => {
    const now = Date.now();
    return rows
      .filter((r) => r.estado === "aguarda_cliente")
      .map((r) => {
        const dias = r.client?.dias_fecho_automatico ?? 7;
        const dueAt = new Date(r.updated_at).getTime() + dias * 86400_000;
        const diasRestantes = (dueAt - now) / 86400_000;
        return { ...r, diasRestantes };
      })
      .filter((r) => r.diasRestantes <= 2)
      .sort((a, b) => a.diasRestantes - b.diasRestantes);
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão operacional em tempo real</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/tickets">Ver lista completa</Link>
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={<Inbox className="h-4 w-4" />} label="Abertos" value={stats.abertos} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Em progresso" value={stats.emProgresso} />
        <StatCard icon={<Clock className="h-4 w-4" />} label="Aguarda cliente" value={stats.aguardaCliente} />
        <StatCard icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label="Prioridade alta" value={stats.altaPrio} />
        <StatCard
          icon={<Star className="h-4 w-4 text-amber-500" />}
          label="Satisfação"
          value={sat.count > 0 ? `${sat.avg.toFixed(1)}/5` : "—"}
          sub={sat.count > 0 ? `${sat.count} avaliações` : "sem dados"}
        />
      </div>

      {/* SLA Alerts */}
      {slaAlerts.length > 0 && (
        <Card className="p-4 border-destructive/40">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" /> SLA crítico
          </h2>
          <div className="space-y-2">
            {slaAlerts.map((r) => (
              <TicketRow key={r.id} r={r} extra={<SlaBadge openedAt={r.created_at} />} />
            ))}
          </div>
        </Card>
      )}

      {/* Sem resposta */}
      {semResposta.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">Sem resposta há mais de 24h</h2>
          <div className="space-y-2">
            {semResposta.map((r) => (
              <TicketRow
                key={r.id}
                r={r}
                extra={
                  <span className="text-xs text-muted-foreground">
                    Atualizado {formatDateTime(r.updated_at)}
                  </span>
                }
              />
            ))}
          </div>
        </Card>
      )}

      {/* Aguarda cliente prestes a fechar */}
      {prestesAutoFechar.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">Auto-fecho iminente (≤ 2 dias)</h2>
          <div className="space-y-2">
            {prestesAutoFechar.map((r) => (
              <TicketRow
                key={r.id}
                r={r}
                extra={
                  <span className={`text-xs ${r.diasRestantes < 0 ? "text-destructive" : "text-amber-600"}`}>
                    {r.diasRestantes < 0
                      ? `Vencido há ${Math.abs(Math.floor(r.diasRestantes))}d`
                      : `Faltam ${r.diasRestantes.toFixed(1)}d`}
                  </span>
                }
              />
            ))}
          </div>
        </Card>
      )}

      {loading && (
        <Card className="p-8 text-center text-sm text-muted-foreground">A carregar…</Card>
      )}

      {!loading && rows.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Sem tickets abertos. 🎉
        </Card>
      )}

      {!loading && rows.length > 0 && slaAlerts.length === 0 && semResposta.length === 0 && prestesAutoFechar.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Sem alertas urgentes. Tudo sob controlo.
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
        {icon} {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function TicketRow({ r, extra }: { r: Row; extra?: React.ReactNode }) {
  return (
    <Link
      to="/tickets/$id"
      params={{ id: r.id }}
      className="flex items-center gap-3 flex-wrap p-2 -mx-2 rounded hover:bg-secondary/50 transition-colors"
    >
      <span className="font-mono text-sm text-primary">{formatTicketNumber(r.numero)}</span>
      <span className="text-sm flex-1 min-w-[200px]">{r.titulo}</span>
      <span className="text-xs text-muted-foreground">{r.client?.nome ?? "—"}</span>
      <StatusBadge estado={r.estado} />
      <PriorityBadge prioridade={r.prioridade} />
      {extra}
    </Link>
  );
}
