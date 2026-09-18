import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireRole } from "@/components/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Euro, Clock, Users, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/admin/rentabilidade" as any)({
  component: RentabilidadePage,
});

// ── Utilitários ────────────────────────────────────────────────────────────────
function formatEuro(v: number) {
  return v.toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}
function formatHoras(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}
function mesLabel(ym: string) {
  const [y, m] = ym.split("-");
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[parseInt(m) - 1]} ${y}`;
}
function last12Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

// ── Page ───────────────────────────────────────────────────────────────────────
function RentabilidadePage() {
  return (
    <RequireRole role="admin">
      <AppLayout><Inner /></AppLayout>
    </RequireRole>
  );
}

function Inner() {
  const [periodo, setPeriodo] = useState("12"); // meses

  // ── Query principal — todos os time_entries com cliente e tarifa ────────────
  const { data: raw, isLoading } = useQuery({
    queryKey: ["rentabilidade", periodo],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const mesesAtras = parseInt(periodo);
      const desde = new Date();
      desde.setMonth(desde.getMonth() - mesesAtras);
      const desdeStr = desde.toISOString().slice(0, 10);

      // Time entries com ticket e cliente
      const { data: entries } = await supabase
        .from("time_entries")
        .select(`
          id, minutos, tipo_intervencao, estado_faturacao,
          nao_contabilizar, data_trabalho,
          ticket:tickets(
            id, client_id,
            client:clients(id, nome, tarifa_hora, tipo_contrato, horas_pacote_anual)
          )
        `)
        .gte("data_trabalho", desdeStr)
        .eq("nao_contabilizar", false)
        .order("data_trabalho");

      // Contratos activos para receita de avença
      const { data: contratos } = await supabase
        .from("contratos" as any)
        .select("client_id, valor_mensal, tipo, data_inicio, data_fim, estado")
        .eq("estado", "activo")
        .in("tipo", ["avenca", "manutencao"]);

      return { entries: entries ?? [], contratos: contratos ?? [] };
    },
  });

  // ── Processamento ──────────────────────────────────────────────────────────
  const { porCliente, porTipo, porMes, totais } = useMemo(() => {
    if (!raw) return { porCliente: [], porTipo: [], porMes: [], totais: { receita: 0, horas: 0, clientes: 0 } };

    const { entries, contratos } = raw;
    const meses = last12Months().slice(-parseInt(periodo));

    // Mapa de contratos por cliente (valor mensal)
    const avencaMap = new Map<string, number>();
    (contratos as any[]).forEach((c: any) => {
      if (c.valor_mensal) avencaMap.set(c.client_id, (avencaMap.get(c.client_id) ?? 0) + c.valor_mensal);
    });

    // Agregar por cliente
    const clienteMap = new Map<string, {
      nome: string; client_id: string; tarifa: number;
      minutos: number; receita_tempo: number; tipo_contrato: string;
      avenca_mensal: number;
    }>();

    for (const e of entries) {
      const ticket = (e as any).ticket;
      const client = ticket?.client;
      if (!client) continue;

      const existing = clienteMap.get(client.id) ?? {
        nome: client.nome, client_id: client.id, tarifa: client.tarifa_hora ?? 0,
        minutos: 0, receita_tempo: 0, tipo_contrato: client.tipo_contrato ?? "pontual",
        avenca_mensal: avencaMap.get(client.id) ?? 0,
      };

      existing.minutos += (e as any).minutos;

      // Calcular receita: se estado faturado/para_faturar → tarifa × horas
      if (["para_faturar", "faturado"].includes((e as any).estado_faturacao)) {
        existing.receita_tempo += ((e as any).minutos / 60) * existing.tarifa;
      }

      clienteMap.set(client.id, existing);
    }

    // Receita total por cliente = avença × meses + tempo facturado extra
    const mesesPeriodo = parseInt(periodo);
    const porCliente = Array.from(clienteMap.values())
      .map(c => ({
        ...c,
        receita_avenca: c.avenca_mensal * mesesPeriodo,
        receita_total: c.avenca_mensal * mesesPeriodo + c.receita_tempo,
        custo_hora: c.tarifa * 0.35, // custo estimado (35% do valor hora)
        margem_pct: c.avenca_mensal > 0
          ? Math.round(((c.avenca_mensal * mesesPeriodo + c.receita_tempo - (c.minutos / 60) * (c.tarifa * 0.35)) / (c.avenca_mensal * mesesPeriodo + c.receita_tempo)) * 100)
          : c.receita_tempo > 0
          ? Math.round(((c.receita_tempo - (c.minutos / 60) * (c.tarifa * 0.35)) / c.receita_tempo) * 100)
          : 0,
      }))
      .sort((a, b) => b.receita_total - a.receita_total)
      .slice(0, 10);

    // Agregar por tipo de intervenção
    const tipoMap = new Map<string, { minutos: number; receita: number; tickets: Set<string> }>();
    for (const e of entries) {
      const ticket = (e as any).ticket;
      const client = ticket?.client;
      if (!client) continue;
      const tipo = (e as any).tipo_intervencao ?? "remota";
      const existing = tipoMap.get(tipo) ?? { minutos: 0, receita: 0, tickets: new Set() };
      existing.minutos += (e as any).minutos;
      if (["para_faturar", "faturado"].includes((e as any).estado_faturacao)) {
        existing.receita += ((e as any).minutos / 60) * (client.tarifa_hora ?? 0);
      }
      if (ticket?.id) existing.tickets.add(ticket.id);
      tipoMap.set(tipo, existing);
    }
    const TIPO_PT: Record<string, string> = { remota: "Remota", presencial: "Presencial", preventiva: "Preventiva", critica: "Crítica" };
    const porTipo = Array.from(tipoMap.entries()).map(([tipo, v]) => ({
      tipo, label: TIPO_PT[tipo] ?? tipo,
      horas: Math.round(v.minutos / 60 * 10) / 10,
      receita: Math.round(v.receita),
      tickets: v.tickets.size,
      valorHora: v.minutos > 0 ? Math.round(v.receita / (v.minutos / 60)) : 0,
    })).sort((a, b) => b.receita - a.receita);

    // Agregar por mês
    const mesMap = new Map<string, { receita: number; horas: number }>();
    meses.forEach(m => mesMap.set(m, { receita: 0, horas: 0 }));

    for (const e of entries) {
      const ticket = (e as any).ticket;
      const client = ticket?.client;
      if (!client) continue;
      const ym = (e as any).data_trabalho.slice(0, 7);
      if (!mesMap.has(ym)) continue;
      const m = mesMap.get(ym)!;
      m.horas += (e as any).minutos / 60;
      if (["para_faturar", "faturado"].includes((e as any).estado_faturacao)) {
        m.receita += ((e as any).minutos / 60) * (client.tarifa_hora ?? 0);
      }
      // Adicionar avença do mês
    }
    // Somar avença de cada contrato activo para cada mês
    (contratos as any[]).forEach((c: any) => {
      if (!c.valor_mensal) return;
      meses.forEach(ym => {
        const m = mesMap.get(ym);
        if (!m) return;
        const inicio = c.data_inicio ? c.data_inicio.slice(0, 7) : "0000-00";
        const fim = c.data_fim ? c.data_fim.slice(0, 7) : "9999-99";
        if (ym >= inicio && ym <= fim) m.receita += c.valor_mensal;
      });
    });

    const porMes = meses.map(ym => {
      const m = mesMap.get(ym) ?? { receita: 0, horas: 0 };
      return {
        mes: mesLabel(ym),
        receita: Math.round(m.receita),
        horas: Math.round(m.horas * 10) / 10,
      };
    });

    const totais = {
      receita: porCliente.reduce((s, c) => s + c.receita_total, 0),
      horas: Math.round(Array.from(tipoMap.values()).reduce((s, v) => s + v.minutos, 0) / 60),
      clientes: clienteMap.size,
    };

    return { porCliente, porTipo, porMes, totais };
  }, [raw, periodo]);

  const COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4"];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Rentabilidade</h1>
          <p className="text-sm text-muted-foreground">Receita, margens e horas por cliente e tipo de serviço</p>
        </div>
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Últimos 3 meses</SelectItem>
            <SelectItem value="6">Últimos 6 meses</SelectItem>
            <SelectItem value="12">Últimos 12 meses</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-28 rounded-xl bg-secondary animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-4">
            <KpiCard label="Receita total" value={formatEuro(totais.receita)} icon={Euro} color="text-emerald-600" />
            <KpiCard label="Horas trabalhadas" value={`${totais.horas}h`} icon={Clock} color="text-blue-600" />
            <KpiCard label="Clientes activos" value={totais.clientes.toString()} icon={Users} color="text-purple-600" />
          </div>

          {/* Evolução mensal */}
          <Card className="p-5">
            <h2 className="text-base font-semibold mb-4">Evolução mensal</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={porMes} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" tickFormatter={v => `${v}€`} />
                <Tooltip
                  formatter={(v: number) => [formatEuro(v), "Receita"]}
                  contentStyle={{ background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: "8px", fontSize: 12 }}
                />
                <Line type="monotone" dataKey="receita" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Top clientes */}
          <Card className="p-5">
            <h2 className="text-base font-semibold mb-4">Receita por cliente</h2>
            {porCliente.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sem dados no período</p>
            ) : (
              <div className="space-y-2">
                {porCliente.map((c, i) => {
                  const maxReceita = porCliente[0]?.receita_total ?? 1;
                  const pct = Math.round((c.receita_total / maxReceita) * 100);
                  const margem = c.margem_pct;
                  return (
                    <div key={c.client_id} className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                          <Link
                            to="/clientes/$id"
                            params={{ id: c.client_id }}
                            className="text-sm font-medium hover:text-primary hover:underline truncate"
                          >
                            {c.nome}
                          </Link>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-muted-foreground">{formatHoras(c.minutos)}</span>
                          <MargemBadge margem={margem} />
                          <span className="text-sm font-semibold tabular-nums w-24 text-right">
                            {formatEuro(c.receita_total)}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }}
                        />
                      </div>
                      {c.receita_avenca > 0 && c.receita_tempo > 0 && (
                        <div className="flex gap-2 text-xs text-muted-foreground pl-6">
                          <span>Avença: {formatEuro(c.receita_avenca)}</span>
                          <span>·</span>
                          <span>Extra: {formatEuro(c.receita_tempo)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Por tipo de intervenção */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5">
              <h2 className="text-base font-semibold mb-4">Receita por tipo</h2>
              {porTipo.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sem dados</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={porTipo} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" tickFormatter={v => `${v}€`} />
                    <Tooltip
                      formatter={(v: number) => [formatEuro(v), "Receita"]}
                      contentStyle={{ background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: "8px", fontSize: 12 }}
                    />
                    <Bar dataKey="receita" radius={[4, 4, 0, 0]}>
                      {porTipo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-base font-semibold mb-4">Eficiência por tipo</h2>
              {porTipo.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sem dados</p>
              ) : (
                <div className="space-y-3">
                  {porTipo.map((t, i) => (
                    <div key={t.tipo} className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{t.label}</span>
                          <span className="text-sm font-semibold tabular-nums">{t.valorHora > 0 ? `${t.valorHora}€/h` : "—"}</span>
                        </div>
                        <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>{t.horas}h trabalhadas</span>
                          <span>·</span>
                          <span>{t.tickets} tickets</span>
                          <span>·</span>
                          <span>{formatEuro(t.receita)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Insights automáticos */}
          <InsightsCard porCliente={porCliente} porTipo={porTipo} porMes={porMes} />
        </>
      )}
    </div>
  );
}

// ── Componentes auxiliares ─────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof Euro; color: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl bg-secondary flex items-center justify-center shrink-0`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function MargemBadge({ margem }: { margem: number }) {
  if (margem === 0) return <span className="text-xs text-muted-foreground w-12 text-right">—</span>;
  const cls = margem >= 50 ? "text-emerald-600 dark:text-emerald-400" : margem >= 25 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  const Icon = margem >= 50 ? TrendingUp : margem >= 25 ? Minus : TrendingDown;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${cls} w-14 justify-end`}>
      <Icon className="h-3 w-3" />{margem}%
    </span>
  );
}

function InsightsCard({ porCliente, porTipo, porMes }: {
  porCliente: { nome: string; receita_total: number; minutos: number; margem_pct: number; client_id: string }[];
  porTipo: { label: string; valorHora: number; horas: number }[];
  porMes: { mes: string; receita: number }[];
}) {
  const insights: { tipo: "positivo" | "negativo" | "neutro"; texto: string }[] = [];

  // Cliente mais rentável
  if (porCliente.length > 0) {
    const top = porCliente[0];
    insights.push({ tipo: "positivo", texto: `${top.nome} é o cliente mais rentável — ${formatEuro(top.receita_total)} no período` });
  }

  // Cliente com mais horas mas menos receita
  const menosEficiente = [...porCliente].sort((a, b) => (b.minutos / (b.receita_total || 1)) - (a.minutos / (a.receita_total || 1)))[0];
  if (menosEficiente && menosEficiente.minutos > 60 && menosEficiente.receita_total < (porCliente[0]?.receita_total ?? 0) * 0.3) {
    insights.push({ tipo: "negativo", texto: `${menosEficiente.nome} consome ${formatHoras(menosEficiente.minutos)} mas gera apenas ${formatEuro(menosEficiente.receita_total)} — rever contrato` });
  }

  // Tipo mais rentável por hora
  const melhorTipo = [...porTipo].sort((a, b) => b.valorHora - a.valorHora)[0];
  if (melhorTipo?.valorHora > 0) {
    insights.push({ tipo: "positivo", texto: `Intervenções ${melhorTipo.label} são as mais rentáveis — ${melhorTipo.valorHora}€/hora` });
  }

  // Tendência dos últimos 3 meses vs 3 anteriores
  if (porMes.length >= 6) {
    const recentes = porMes.slice(-3).reduce((s, m) => s + m.receita, 0);
    const anteriores = porMes.slice(-6, -3).reduce((s, m) => s + m.receita, 0);
    if (anteriores > 0) {
      const delta = Math.round(((recentes - anteriores) / anteriores) * 100);
      if (delta > 5) insights.push({ tipo: "positivo", texto: `Receita a crescer +${delta}% nos últimos 3 meses vs os 3 anteriores` });
      else if (delta < -5) insights.push({ tipo: "negativo", texto: `Receita a descer ${delta}% nos últimos 3 meses vs os 3 anteriores` });
    }
  }

  if (insights.length === 0) return null;

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold mb-3">Insights automáticos</h2>
      <div className="space-y-2">
        {insights.map((ins, i) => (
          <div key={i} className={`flex items-start gap-2.5 text-sm p-2.5 rounded-lg ${
            ins.tipo === "positivo" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : ins.tipo === "negativo" ? "bg-red-500/10 text-red-700 dark:text-red-300"
            : "bg-secondary text-foreground"
          }`}>
            {ins.tipo === "positivo" ? <TrendingUp className="h-4 w-4 shrink-0 mt-0.5" />
              : ins.tipo === "negativo" ? <TrendingDown className="h-4 w-4 shrink-0 mt-0.5" />
              : <Minus className="h-4 w-4 shrink-0 mt-0.5" />}
            {ins.texto}
          </div>
        ))}
      </div>
    </Card>
  );
}

