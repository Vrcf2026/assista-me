import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RequireRole } from "@/components/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/calendario" as any)({
  component: CalendarioPage,
});

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

type ViewMode = "month" | "week" | "day";

type TicketCalendario = {
  id: string;
  numero: number;
  titulo: string;
  estado: string;
  prioridade: string;
  prazo: string | null;
  created_at: string;
  client: { nome: string } | null;
};

const ESTADO_LABELS: Record<string, string> = {
  aberto: "Aberto",
  em_progresso: "Em progresso",
  aguarda_cliente: "Aguarda cliente",
  fechado: "Fechado",
};

function priorityDot(p: string) {
  if (p === "alta") return "bg-destructive";
  if (p === "media") return "bg-amber-500";
  return "bg-muted-foreground";
}

function formatNum(n: number) {
  return `#${String(n).padStart(5, "0")}`;
}

function CalendarioPage() {
  return (
    <RequireRole role="admin">
      <AppLayout><CalendarioInner /></AppLayout>
    </RequireRole>
  );
}

function CalendarioInner() {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>("month");
  const today = new Date().toISOString().slice(0, 10);

  // Buscar tickets com prazo ou criados no mês visível
  const { year, month } = useMemo(() => ({
    year: currentDate.getFullYear(),
    month: currentDate.getMonth(),
  }), [currentDate]);

  const inicioMes = useMemo(() => new Date(year, month - 1, 1).toISOString().slice(0, 10), [year, month]);
  const fimMes = useMemo(() => new Date(year, month + 2, 0).toISOString().slice(0, 10), [year, month]);

  const { data: tickets = [] } = useQuery<TicketCalendario[]>({
    queryKey: ["calendario-tickets", inicioMes, fimMes],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, numero, titulo, estado, prioridade, prazo, created_at, client:clients(nome)")
        .or(`prazo.gte.${inicioMes},created_at.gte.${inicioMes}`)
        .lte("created_at", fimMes)
        .order("numero", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TicketCalendario[];
    },
  });

  // Tickets por data (prazo se tiver, senão created_at)
  const ticketsByDate = useMemo(() => {
    const map: Record<string, TicketCalendario[]> = {};
    for (const t of tickets) {
      const date = t.prazo ?? t.created_at.slice(0, 10);
      if (!map[date]) map[date] = [];
      map[date].push(t);
    }
    return map;
  }, [tickets]);

  const getTicketsForDate = (date: Date) => {
    const dateStr = date.toISOString().slice(0, 10);
    return ticketsByDate[dateStr] ?? [];
  };

  const isOverdue = (t: TicketCalendario) =>
    t.prazo && t.prazo < today && t.estado !== "fechado";

  // Dias do mês para vista mensal
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;
    const days: { date: Date; isCurrentMonth: boolean }[] = [];
    for (let i = startDay - 1; i >= 0; i--)
      days.push({ date: new Date(year, month, -i), isCurrentMonth: false });
    for (let i = 1; i <= lastDay.getDate(); i++)
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    while (days.length % 7 !== 0)
      days.push({ date: new Date(year, month + 1, days.length - lastDay.getDate()), isCurrentMonth: false });
    return days;
  }, [year, month]);

  // Dias da semana actual
  const weekDays = useMemo(() => {
    const d = new Date(currentDate);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(d);
      date.setDate(date.getDate() + i);
      return date;
    });
  }, [currentDate]);

  const navigate_ = (dir: number) => {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    setCurrentDate(d);
  };

  const headerLabel = () => {
    if (view === "month") return `${MESES[month]} ${year}`;
    if (view === "week") {
      const s = weekDays[0];
      const e = weekDays[6];
      return `${s.getDate()} ${MESES[s.getMonth()].slice(0, 3)} — ${e.getDate()} ${MESES[e.getMonth()].slice(0, 3)} ${e.getFullYear()}`;
    }
    return currentDate.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };

  const openTicket = (id: string) => navigate({ to: "/tickets/$id", params: { id } });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-semibold">Calendário</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Selector de vista */}
          <div className="flex border rounded-lg overflow-hidden text-xs">
            {(["month", "week", "day"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 font-medium transition-colors ${view === v ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted text-muted-foreground"}`}
              >
                {v === "month" ? "Mês" : v === "week" ? "Semana" : "Dia"}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={() => navigate_(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Hoje</Button>
          <span className="text-sm font-semibold min-w-[160px] text-center">{headerLabel()}</span>
          <Button variant="outline" size="icon" onClick={() => navigate_(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => navigate({ to: "/tickets/novo" as any })}>
            <Plus className="h-4 w-4 mr-1" /> Novo ticket
          </Button>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive inline-block" /> Alta prioridade</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Média</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground inline-block" /> Baixa</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> Prazo definido</span>
      </div>

      {/* Vista — Mês */}
      {view === "month" && (
        <Card className="border overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-7 border-b bg-muted/30">
              {DIAS_SEMANA.map((d) => (
                <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground uppercase">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calendarDays.map((day, i) => {
                const dateStr = day.date.toISOString().slice(0, 10);
                const isToday = dateStr === today;
                const dayTickets = getTicketsForDate(day.date);
                return (
                  <div
                    key={i}
                    className={`min-h-[90px] border-b border-r p-1 ${!day.isCurrentMonth ? "bg-muted/20" : ""} ${isToday ? "bg-primary/5" : ""}`}
                  >
                    <div className={`text-xs font-medium mb-1 px-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-primary text-primary-foreground" : !day.isCurrentMonth ? "text-muted-foreground/40" : ""}`}>
                      {day.date.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {dayTickets.slice(0, 3).map((t) => (
                        <button
                          key={t.id}
                          onClick={() => openTicket(t.id)}
                          className="w-full text-left"
                        >
                          <div className={`flex items-center gap-1 px-1 py-0.5 rounded text-xs truncate hover:bg-muted transition-colors ${isOverdue(t) ? "text-destructive font-medium" : ""}`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.prazo ? "bg-orange-400" : priorityDot(t.prioridade)}`} />
                            <span className="truncate">{formatNum(t.numero)} {t.titulo}</span>
                          </div>
                        </button>
                      ))}
                      {dayTickets.length > 3 && (
                        <p className="text-xs text-muted-foreground px-1">+{dayTickets.length - 3} mais</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vista — Semana */}
      {view === "week" && (
        <Card className="border overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-7 divide-x">
              {weekDays.map((day, i) => {
                const dateStr = day.toISOString().slice(0, 10);
                const isToday = dateStr === today;
                const dayTickets = getTicketsForDate(day);
                return (
                  <div key={i} className={`min-h-[280px] p-2 ${isToday ? "bg-primary/5" : ""}`}>
                    <div className="text-center mb-3">
                      <p className="text-xs text-muted-foreground uppercase">{DIAS_SEMANA[i]}</p>
                      <p className={`text-lg font-bold ${isToday ? "text-primary" : ""}`}>{day.getDate()}</p>
                    </div>
                    <div className="space-y-1.5">
                      {dayTickets.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => openTicket(t.id)}
                          className={`w-full text-left p-2 rounded-lg text-xs border transition-colors hover:shadow-sm ${isOverdue(t) ? "border-destructive/50 bg-destructive/5" : t.prazo ? "border-orange-300 bg-orange-50 dark:bg-orange-950/20" : "border-border bg-card"}`}
                        >
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${t.prazo ? "bg-orange-400" : priorityDot(t.prioridade)}`} />
                            <span className="font-medium truncate">{formatNum(t.numero)}</span>
                          </div>
                          <p className="truncate text-muted-foreground">{t.titulo}</p>
                          <p className="truncate text-muted-foreground/70">{t.client?.nome ?? "—"}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vista — Dia */}
      {view === "day" && (
        <Card className="border">
          <CardContent className="p-4 space-y-2">
            {getTicketsForDate(currentDate).length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Sem tickets para este dia.</p>
            ) : (
              getTicketsForDate(currentDate).map((t) => (
                <div
                  key={t.id}
                  onClick={() => openTicket(t.id)}
                  className={`flex items-start justify-between gap-3 p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow ${isOverdue(t) ? "border-l-4 border-l-destructive" : t.prazo ? "border-l-4 border-l-orange-400" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs text-muted-foreground">{formatNum(t.numero)}</span>
                      {t.prazo && <span className="text-xs text-orange-600 dark:text-orange-400">prazo {t.prazo}</span>}
                      {isOverdue(t) && <span className="text-xs text-destructive font-medium">em atraso</span>}
                    </div>
                    <p className="font-medium text-sm truncate">{t.titulo}</p>
                    <p className="text-xs text-muted-foreground">{t.client?.nome ?? "—"}</p>
                  </div>
                  <div className="flex gap-2 shrink-0 flex-col items-end">
                    <Badge variant="outline" className="text-xs">{t.prioridade}</Badge>
                    <Badge variant="secondary" className="text-xs">{ESTADO_LABELS[t.estado] ?? t.estado}</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
