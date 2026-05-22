import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PriorityBadge, StatusBadge, TipoBadge } from "@/components/StatusBadge";
import { formatTicketNumber } from "@/lib/format";
import { getCriticalSla, formatRemaining } from "@/lib/sla";
import {
  AlertTriangle, Clock, Inbox, Star, Flame, ArrowRight, ClipboardList, Megaphone, Receipt,
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

const PRIO_ORDER: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };

function timeAgo(date: Date, now: Date): string {
  const ms = now.getTime() - date.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) {
    const m = min % 60;
    return m > 0 ? `há ${h}h ${m}min` : `há ${h}h`;
  }
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}

export function AdminDashboard() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [satAvg, setSatAvg] = useState<{ count: number; avg: number }>({ count: 0, avg: 0 });
  const [trabalhosStats, setTrabalhosStats] = useState<{ ativos: number; atrasados: number }>({ ativos: 0, atrasados: 0 });
  const [campanhasStats, setCampanhasStats] = useState<{ ativas: number; pendentes: number }>({ ativas: 0, pendentes: 0 });
  const [orcamentosPendentes, setOrcamentosPendentes] = useState(0);
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

    const today = new Date().toISOString().slice(0, 10);
    const { data: trab } = await supabase
      .from("trabalhos")
      .select("estado, data_agendada")
      .in("estado", ["pendente", "agendado", "em_curso"]);
    if (trab) {
      const ativos = trab.length;
      const atrasados = trab.filter((r) => r.data_agendada && r.data_agendada < today).length;
      setTrabalhosStats({ ativos, atrasados });
    }

    const { data: campAtivas } = await supabase
      .from("campanhas")
      .select("id")
      .eq("estado", "ativa");
    const ativasIds = (campAtivas ?? []).map((c) => c.id);
    let pendentes = 0;
    if (ativasIds.length > 0) {
      const { count } = await supabase
        .from("campanha_clientes")
        .select("id", { count: "exact", head: true })
        .in("campanha_id", ativasIds)
        .in("estado", ["pendente", "agendado", "em_curso"]);
      pendentes = count ?? 0;
    }
    setCampanhasStats({ ativas: ativasIds.length, pendentes });

    const { count: orcCount } = await supabase
      .from("orcamentos")
      .select("id", { count: "exact", head: true })
      .eq("estado", "enviado");
    setOrcamentosPendentes(orcCount ?? 0);

    setLoading(false);
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000);

  const abertos = tickets.filter((t) => t.estado === "aberto").length;
  const totalAbertosOuProgresso = tickets.filter((t) => t.estado === "aberto" || t.estado === "em_progresso").length;

  const fechadosUlt30 = tickets.filter((t) => t.fechado_em && new Date(t.fechado_em) >= thirtyDaysAgo);
  const tempoMedioMin = fechadosUlt30.length > 0
    ? Math.round(fechadosUlt30.reduce((s, t) => s + (t.tempo_gasto_minutos || 0), 0) / fechadosUlt30.length)
    : 0;
  const tempoMedioStr = tempoMedioMin > 0
    ? `${Math.floor(tempoMedioMin / 60)}h ${tempoMedioMin % 60}min`
    : "—";

  // Tickets em aberto, ordenados por prioridade + idade
  const ticketsAbertos = useMemo(() => {
    return tickets
      .filter((t) => t.estado === "aberto" || t.estado === "em_progresso")
      .map((t) => ({
        ...t,
        sla: t.tipo_intervencao === "critica" ? getCriticalSla(new Date(t.created_at), now) : null,
      }))
      .sort((a, b) => {
        const pa = PRIO_ORDER[a.prioridade] ?? 99;
        const pb = PRIO_ORDER[b.prioridade] ?? 99;
        if (pa !== pb) return pa - pb;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets]);

  const slaCriticos = useMemo(() => {
    return ticketsAbertos
      .filter((t) => t.sla && t.sla.status !== "ok")
      .sort((a, b) => (a.sla!.remainingMinutes - b.sla!.remainingMinutes));
  }, [ticketsAbertos]);

  // Fila urgente: SLA crítico vencido / <60min, OU urgente aberto há >2h
  const filaUrgente = useMemo(() => {
    const seen = new Set<string>();
    const out: typeof ticketsAbertos = [];
    ticketsAbertos.forEach((t) => {
      const slaUrg = t.sla && (t.sla.status === "breached" || t.sla.remainingMinutes < 60);
      const ageH = (now.getTime() - new Date(t.created_at).getTime()) / 3600_000;
      const prioUrg = t.prioridade === "urgente" && t.estado === "aberto" && ageH > 2;
      if ((slaUrg || prioUrg) && !seen.has(t.id)) {
        seen.add(t.id);
        out.push(t);
      }
    });
    return out.sort((a, b) => {
      const sa = a.sla?.remainingMinutes ?? Infinity;
      const sb = b.sla?.remainingMinutes ?? Infinity;
      return sa - sb;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketsAbertos]);

  // Charts
  const weekData = useMemo(() => {
    const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const start = new Date(now);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
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

  const tipoData = useMemo(() => {
    const counts: Record<string, number> = {};
    tickets.forEach((t) => { counts[t.tipo_intervencao] = (counts[t.tipo_intervencao] ?? 0) + 1; });
    return Object.entries(counts).map(([k, v]) => ({ name: TIPO_LABEL[k] ?? k, key: k, value: v }));
  }, [tickets]);
  const tipoTotal = tipoData.reduce((s, t) => s + t.value, 0);

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

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="p-6 h-40 animate-pulse bg-secondary/40" />
        <Card className="p-6 h-96 animate-pulse bg-secondary/40" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Card key={i} className="p-6 h-28 animate-pulse bg-secondary/40" />)}
        </div>
      </div>
    );
  }

  const ticketsToShow = ticketsAbertos.slice(0, 20);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Fila de trabalho operacional</p>
        </div>
        <Button asChild variant="outline" size="sm"><Link to="/tickets">Ver todos os tickets</Link></Button>
      </div>

      {/* SECÇÃO 1 — Fila urgente */}
      {filaUrgente.length > 0 && (
        <Card className="p-5 shadow-sm border-destructive/40 bg-destructive/5">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2 text-destructive">
            <Flame className="h-5 w-5" /> Requer atenção imediata ({filaUrgente.length})
          </h2>
          <div className="space-y-2">
            {filaUrgente.map((t) => {
              const breached = t.sla?.status === "breached";
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 p-3 rounded-md bg-background border border-destructive/30"
                >
                  <div className="flex flex-col gap-1 shrink-0">
                    <PriorityBadge prioridade={t.prioridade} />
                    <TipoBadge tipo={t.tipo_intervencao} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.titulo}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {formatTicketNumber(t.numero)} · {t.client?.nome ?? "—"} · aberto {timeAgo(new Date(t.created_at), now)}
                    </div>
                  </div>
                  {t.sla && (
                    <span className={`text-[11px] font-semibold px-2 py-1 rounded whitespace-nowrap ${breached ? "bg-destructive text-destructive-foreground" : "bg-amber-500 text-white"}`}>
                      {breached ? "VENCIDO" : `${formatRemaining(t.sla.remainingMinutes)} restantes`}
                    </span>
                  )}
                  <Button asChild size="sm" variant="default">
                    <Link to="/tickets/$id" params={{ id: t.id }}>Abrir <ArrowRight className="h-3 w-3 ml-1" /></Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* SECÇÃO 2 — Tabela tickets em aberto */}
      <Card className="p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Tickets em aberto ({ticketsAbertos.length})</h2>
          {ticketsAbertos.length > 20 && (
            <Link to="/tickets" className="text-sm text-primary hover:underline">Ver todos →</Link>
          )}
        </div>
        {ticketsAbertos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhum ticket em aberto. ✨</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">#</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Criado</TableHead>
                <TableHead>Sem resposta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ticketsToShow.map((t) => {
                const updMs = now.getTime() - new Date(t.updated_at).getTime();
                const updH = Math.floor(updMs / 3600_000);
                const stale = updH > 24;
                const titulo = t.titulo.length > 40 ? `${t.titulo.slice(0, 40)}…` : t.titulo;
                return (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Link to="/tickets/$id" params={{ id: t.id }} className="text-primary hover:underline font-mono text-xs">
                        {formatTicketNumber(t.numero)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm truncate max-w-[160px]">{t.client?.nome ?? "—"}</TableCell>
                    <TableCell>
                      <Link to="/tickets/$id" params={{ id: t.id }} className="text-sm hover:underline">
                        {titulo}
                      </Link>
                    </TableCell>
                    <TableCell><TipoBadge tipo={t.tipo_intervencao} /></TableCell>
                    <TableCell><PriorityBadge prioridade={t.prioridade} /></TableCell>
                    <TableCell><StatusBadge estado={t.estado} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo(new Date(t.created_at), now)}
                    </TableCell>
                    <TableCell className={`text-xs whitespace-nowrap ${stale ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                      {timeAgo(new Date(t.updated_at), now)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* SECÇÃO 3 — KPIs */}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/trabalhos" className="block">
          <Card className="p-5 shadow-sm hover:shadow-md transition cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ClipboardList className="h-5 w-5 text-purple-500" />
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Trabalhos pendentes</div>
                  <div className="text-2xl font-bold mt-1">
                    {trabalhosStats.ativos}
                    {trabalhosStats.atrasados > 0 && (
                      <span className="text-destructive text-base font-medium ml-2">({trabalhosStats.atrasados} atrasados)</span>
                    )}
                  </div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Card>
        </Link>

        <Link to="/campanhas" className="block">
          <Card className="p-5 shadow-sm hover:shadow-md transition cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Megaphone className="h-5 w-5 text-blue-500" />
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Campanhas activas</div>
                  <div className="text-2xl font-bold mt-1">
                    {campanhasStats.ativas}
                    {campanhasStats.pendentes > 0 && (
                      <span className="text-muted-foreground text-base font-medium ml-2">({campanhasStats.pendentes} pendentes)</span>
                    )}
                  </div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Card>
        </Link>
      </div>

      {/* SECÇÃO 4 — Gráficos em tabs */}
      <Card className="p-5 shadow-sm">
        <Tabs defaultValue="semana">
          <TabsList>
            <TabsTrigger value="semana">Esta semana</TabsTrigger>
            <TabsTrigger value="mensal">Mensal</TabsTrigger>
            <TabsTrigger value="distribuicao">Distribuição</TabsTrigger>
          </TabsList>

          <TabsContent value="semana" className="mt-4">
            <ResponsiveContainer width="100%" height={280}>
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
          </TabsContent>

          <TabsContent value="mensal" className="mt-4">
            <ResponsiveContainer width="100%" height={280}>
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
          </TabsContent>

          <TabsContent value="distribuicao" className="mt-4">
            {tipoTotal === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">Sem dados</div>
            ) : (
              <div className="grid md:grid-cols-2 gap-6 items-center">
                <div className="relative">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={tipoData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={100} paddingAngle={2}>
                        {tipoData.map((d) => <Cell key={d.key} fill={TIPO_COLORS[d.key] ?? "hsl(var(--muted-foreground))"} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                        formatter={(v: number, n) => [`${v} (${((v / tipoTotal) * 100).toFixed(0)}%)`, n]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <div className="text-3xl font-bold">{tipoTotal}</div>
                    <div className="text-xs text-muted-foreground">tickets</div>
                  </div>
                </div>
                <div className="space-y-2">
                  {tipoData.map((d) => (
                    <div key={d.key} className="flex items-center gap-2 text-sm">
                      <span className="h-3 w-3 rounded-sm" style={{ background: TIPO_COLORS[d.key] }} />
                      <span className="text-muted-foreground">{d.name}</span>
                      <span className="ml-auto font-medium">{d.value} · {tipoTotal > 0 ? ((d.value / tipoTotal) * 100).toFixed(0) : 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>
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
