import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PriorityBadge } from "@/components/StatusBadge";
import { formatTicketNumber } from "@/lib/format";
import { getCriticalSla, formatRemaining } from "@/lib/sla";
import {
  AlertTriangle, Clock, Inbox, Star, MessageSquareWarning, Activity,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";

interface TicketRow {
  id: string;
  numero: number;
  titulo: string;
  estado: string;
  prioridade: string;
  tipo_intervencao: string;
  tempo_gasto_minutos: number;
  created_at: string;
  updated_at: string;
  fechado_em: string | null;
  client: { id: string; nome: string } | null;
}

const TIPO_COLORS: Record<string, string> = {
  remota: "hsl(217 91% 60%)",
  presencial: "hsl(142 76% 36%)",
  preventiva: "hsl(271 81% 56%)",
  critica: "hsl(0 84% 60%)",
};
const TIPO_LABEL: Record<string, string> = {
  remota: "Remota", presencial: "Presencial", preventiva: "Preventiva", critica: "Crítica",
};

export function AdminDashboard() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [satAvg, setSatAvg] = useState<{ count: number; avg: number }>({ count: 0, avg: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const { data } = await supabase
      .from("tickets")
      .select("id, numero, titulo, estado, prioridade, tipo_intervencao, tempo_gasto_minutos, created_at, updated_at, fechado_em, client:clients(id, nome)")
      .gte("created_at", sixMonthsAgo.toISOString())
      .order("created_at", { ascending: false });
    setTickets((data ?? []) as unknown as TicketRow[]);

    const thirtyDays = new Date(); thirtyDays.setDate(thirtyDays.getDate() - 30);
    const { data: ratings } = await supabase
      .from("ticket_satisfaction")
      .select("rating, submitted_at")
      .not("rating", "is", null)
      .gte("submitted_at", thirtyDays.toISOString());
    if (ratings && ratings.length > 0) {
      const vals = (ratings as { rating: number }[]).map((r) => r.rating);
      setSatAvg({ count: vals.length, avg: vals.reduce((a, b) => a + b, 0) / vals.length });
    } else {
      setSatAvg({ count: 0, avg: 0 });
    }

    setLoading(false);
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000);

  // KPIs
  const abertos = tickets.filter((t) => t.estado === "aberto").length;
  const totalAbertosOuProgresso = tickets.filter((t) => t.estado === "aberto" || t.estado === "em_progresso").length;

  const fechadosUlt30 = tickets.filter((t) => t.fechado_em && new Date(t.fechado_em) >= thirtyDaysAgo);
  const tempoMedioMin = fechadosUlt30.length > 0
    ? Math.round(fechadosUlt30.reduce((s, t) => s + (t.tempo_gasto_minutos || 0), 0) / fechadosUlt30.length)
    : 0;
  const tempoMedioStr = tempoMedioMin > 0
    ? `${Math.floor(tempoMedioMin / 60)}h ${tempoMedioMin % 60}min`
    : "—";

  const slaCriticos = useMemo(() => {
    return tickets
      .filter((t) => t.tipo_intervencao === "critica" && t.estado !== "fechado")
      .map((t) => ({ ...t, sla: getCriticalSla(new Date(t.created_at), now) }))
      .filter((t) => t.sla.status !== "ok")
      .sort((a, b) => a.sla.remainingMinutes - b.sla.remainingMinutes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets]);

  // Gráfico semanal — tickets criados por dia da semana corrente (Seg-Dom)
  const weekData = useMemo(() => {
    const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const start = new Date(now);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day; // segunda
    start.setDate(start.getDate() + diff);
    start.setHours(0, 0, 0, 0);
    const out = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i);
      return { dia: dias[d.getDay()], aberto: 0, em_progresso: 0, fechado: 0, _date: d };
    });
    tickets.forEach((t) => {
      const created = new Date(t.created_at);
      const idx = out.findIndex((o) => o._date.toDateString() === created.toDateString());
      if (idx === -1) return;
      const key = t.estado === "aberto" ? "aberto"
        : t.estado === "em_progresso" ? "em_progresso"
        : t.estado === "fechado" ? "fechado" : null;
      if (key) out[idx][key]++;
    });
    return out.map(({ _date, ...rest }) => rest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets]);

  // Donut por tipo
  const tipoData = useMemo(() => {
    const counts: Record<string, number> = {};
    tickets.forEach((t) => { counts[t.tipo_intervencao] = (counts[t.tipo_intervencao] ?? 0) + 1; });
    return Object.entries(counts).map(([k, v]) => ({ name: TIPO_LABEL[k] ?? k, key: k, value: v }));
  }, [tickets]);
  const tipoTotal = tipoData.reduce((s, t) => s + t.value, 0);

  // Evolução mensal — últimos 6 meses
  const monthlyData = useMemo(() => {
    const months: { label: string; key: string; criados: number; fechados: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-PT", { month: "short" });
      months.push({ label: label.charAt(0).toUpperCase() + label.slice(1, 3), key, criados: 0, fechados: 0 });
    }
    tickets.forEach((t) => {
      const c = new Date(t.created_at);
      const ck = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}`;
      const m1 = months.find((m) => m.key === ck);
      if (m1) m1.criados++;
      if (t.fechado_em) {
        const f = new Date(t.fechado_em);
        const fk = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}`;
        const m2 = months.find((m) => m.key === fk);
        if (m2) m2.fechados++;
      }
    });
    return months;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets]);

  // Sem resposta há +24h
  const semResposta = useMemo(() => {
    const limit = 24 * 60 * 60 * 1000;
    return tickets
      .filter((t) => t.estado !== "fechado" && now.getTime() - new Date(t.updated_at).getTime() > limit)
      .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Card key={i} className="p-6 h-28 animate-pulse bg-secondary/40" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-6 h-72 animate-pulse bg-secondary/40" />
          <Card className="p-6 h-72 animate-pulse bg-secondary/40" />
        </div>
        <Card className="p-6 h-72 animate-pulse bg-secondary/40" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão operacional em tempo real</p>
        </div>
        <Button asChild variant="outline" size="sm"><Link to="/tickets">Ver todos os tickets</Link></Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Inbox className="h-5 w-5 text-blue-500" />}
          label="Tickets abertos"
          value={totalAbertosOuProgresso}
          sub={`${abertos} aguardam resposta`}
        />
        <KpiCard
          icon={<Clock className="h-5 w-5 text-emerald-500" />}
          label="Tempo médio resolução"
          value={tempoMedioStr}
          sub={`${fechadosUlt30.length} fechados (30d)`}
        />
        <KpiCard
          icon={<AlertTriangle className={`h-5 w-5 ${slaCriticos.length > 0 ? "text-destructive" : "text-muted-foreground"}`} />}
          label="SLA críticos em risco"
          value={<span className={slaCriticos.length > 0 ? "text-destructive" : ""}>{slaCriticos.length}</span>}
          sub={slaCriticos.length > 0 ? "Requer atenção" : "Tudo no prazo"}
        />
        <KpiCard
          icon={<Star className="h-5 w-5 text-amber-500 fill-amber-500" />}
          label="Satisfação média"
          value={satAvg.count > 0 ? `⭐ ${satAvg.avg.toFixed(1)} / 5` : "—"}
          sub={satAvg.count > 0 ? `${satAvg.count} avaliações (30d)` : "Sem dados"}
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 shadow-sm">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4" /> Tickets por estado — esta semana
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={weekData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="dia" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="aberto" name="Aberto" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="em_progresso" name="Em progresso" fill="hsl(45 93% 58%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="fechado" name="Fechado" fill="hsl(142 76% 36%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5 shadow-sm">
          <h3 className="text-sm font-semibold mb-4">Distribuição por tipo de intervenção</h3>
          {tipoTotal === 0 ? (
            <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">Sem dados</div>
          ) : (
            <div className="relative">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={tipoData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
                    {tipoData.map((d) => <Cell key={d.key} fill={TIPO_COLORS[d.key] ?? "hsl(var(--muted-foreground))"} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                    formatter={(v: number, n) => [`${v} (${((v / tipoTotal) * 100).toFixed(0)}%)`, n]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-2xl font-bold">{tipoTotal}</div>
                <div className="text-xs text-muted-foreground">tickets</div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 mt-3">
            {tipoData.map((d) => (
              <div key={d.key} className="flex items-center gap-2 text-xs">
                <span className="h-3 w-3 rounded-sm" style={{ background: TIPO_COLORS[d.key] }} />
                <span className="text-muted-foreground">{d.name}</span>
                <span className="ml-auto font-medium">{d.value} · {tipoTotal > 0 ? ((d.value / tipoTotal) * 100).toFixed(0) : 0}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Monthly evolution */}
      <Card className="p-5 shadow-sm">
        <h3 className="text-sm font-semibold mb-4">Tickets criados vs resolvidos — últimos 6 meses</h3>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={monthlyData}>
            <defs>
              <linearGradient id="colCriados" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(217 91% 60%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colFechados" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(142 76% 36%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(142 76% 36%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
            <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="criados" name="Criados" stroke="hsl(217 91% 60%)" strokeWidth={2} fill="url(#colCriados)" />
            <Area type="monotone" dataKey="fechados" name="Resolvidos" stroke="hsl(142 76% 36%)" strokeWidth={2} fill="url(#colFechados)" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Lists */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <MessageSquareWarning className="h-4 w-4 text-amber-500" /> Sem resposta há +24h
            </h3>
            {semResposta.length > 5 && (
              <Link to="/tickets" className="text-xs text-primary hover:underline">Ver todos ({semResposta.length})</Link>
            )}
          </div>
          {semResposta.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Tudo respondido. ✨</p>
          ) : (
            <div className="space-y-2">
              {semResposta.slice(0, 5).map((t) => {
                const horas = Math.floor((now.getTime() - new Date(t.updated_at).getTime()) / 3600_000);
                const ago = horas >= 48 ? `há ${Math.floor(horas / 24)} dias` : `há ${horas}h`;
                return (
                  <Link
                    key={t.id}
                    to="/tickets/$id"
                    params={{ id: t.id }}
                    className="flex items-center gap-3 p-2 rounded hover:bg-secondary/50 transition-colors"
                  >
                    <PriorityBadge prioridade={t.prioridade} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{t.titulo}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {formatTicketNumber(t.numero)} · {t.client?.nome ?? "—"}
                      </div>
                    </div>
                    <span className="text-xs text-amber-600 whitespace-nowrap">{ago}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5 shadow-sm">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" /> SLA críticos a vencer
          </h3>
          {slaCriticos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum ticket crítico em risco. 🎯</p>
          ) : (
            <div className="space-y-2">
              {slaCriticos.map((t) => {
                const breached = t.sla.status === "breached";
                return (
                  <Link
                    key={t.id}
                    to="/tickets/$id"
                    params={{ id: t.id }}
                    className="flex items-center gap-3 p-2 rounded hover:bg-secondary/50 transition-colors"
                  >
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded whitespace-nowrap ${breached
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-amber-500 text-white"}`}>
                      {breached ? "VENCIDO" : `${formatRemaining(t.sla.remainingMinutes)} restantes`}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{t.titulo}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {formatTicketNumber(t.numero)} · {t.client?.nome ?? "—"}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className="text-3xl font-bold mt-2">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}
