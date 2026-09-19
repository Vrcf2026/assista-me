import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireRole } from "@/components/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SlaBadge } from "@/components/SlaBadge";
import {
  AlertOctagon, Clock, CheckCircle2, ExternalLink,
  TrendingUp, AlertTriangle, Shield,
} from "lucide-react";

export const Route = createFileRoute("/incidentes")({
  component: IncidentesPage,
});

const SEV_CLS: Record<string, string> = {
  P1: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  P2: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  P3: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
};

function IncidentesPage() {
  return (
    <RequireRole role="admin">
      <AppLayout><Inner /></AppLayout>
    </RequireRole>
  );
}

function Inner() {
  // Tickets críticos em aberto
  const { data: abertos = [] } = useQuery({
    queryKey: ["incidentes-abertos"],
    refetchInterval: 60_000, // actualizar a cada minuto
    queryFn: async () => {
      const { data } = await supabase
        .from("tickets")
        .select("id, numero, titulo, estado, created_at, tecnico_responsavel, client:clients(nome)")
        .eq("tipo_intervencao", "critica")
        .neq("estado", "fechado")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Histórico de incidentes críticos fechados + post-mortem
  const { data: historico = [] } = useQuery({
    queryKey: ["incidentes-historico"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("tickets")
        .select(`
          id, numero, titulo, estado, created_at,
          client:clients(nome),
          ticket_postmortem(id, severidade, causa_raiz, acoes_preventivas, recorrente, duracao_minutos)
        `)
        .eq("tipo_intervencao", "critica")
        .eq("estado", "fechado")
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as any[];
    },
  });

  // Estatísticas
  const { data: stats } = useQuery({
    queryKey: ["incidentes-stats"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const trinta = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { data } = await supabase
        .from("tickets")
        .select("id, estado, ticket_postmortem(duracao_minutos, recorrente)")
        .eq("tipo_intervencao", "critica")
        .gte("created_at", trinta);

      const total = data?.length ?? 0;
      const resolvidos = data?.filter(t => t.estado === "fechado").length ?? 0;
      const comPostmortem = data?.filter(t => (t as any).ticket_postmortem?.length > 0).length ?? 0;
      const recorrentes = data?.filter(t => (t as any).ticket_postmortem?.[0]?.recorrente).length ?? 0;
      const duracaoMedia = data?.reduce((s, t) => s + ((t as any).ticket_postmortem?.[0]?.duracao_minutos ?? 0), 0) ?? 0;

      return { total, resolvidos, comPostmortem, recorrentes, duracaoMedia: total > 0 ? Math.round(duracaoMedia / total) : 0 };
    },
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <AlertOctagon className="h-6 w-6 text-red-500" /> Incidentes críticos
        </h1>
        <p className="text-sm text-muted-foreground">Monitorização de tickets críticos, SLA e post-mortem</p>
      </div>

      {/* KPIs últimos 30 dias */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Incidentes (30d)" value={stats.total} icon={AlertOctagon} color="text-red-500" />
          <StatCard label="Resolvidos" value={stats.resolvidos} icon={CheckCircle2} color="text-emerald-500" />
          <StatCard label="Com post-mortem" value={stats.comPostmortem} icon={Shield} color="text-blue-500" />
          <StatCard label="Duração média" value={stats.duracaoMedia > 0 ? `${Math.floor(stats.duracaoMedia / 60)}h${stats.duracaoMedia % 60 > 0 ? `${stats.duracaoMedia % 60}m` : ""}` : "—"} icon={Clock} color="text-amber-500" />
        </div>
      )}

      {/* Activos agora */}
      {abertos.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            Em curso ({abertos.length})
          </h2>
          {(abertos as any[]).map((t: any) => (
            <Card key={t.id} className="p-4 border-red-500/30 bg-red-500/5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">
                      #{String(t.numero).padStart(5, "0")}
                    </span>
                    <Badge className="text-xs bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30">
                      🚨 Crítico
                    </Badge>
                    {t.estado === "em_progresso" && (
                      <Badge variant="outline" className="text-xs">Em progresso</Badge>
                    )}
                  </div>
                  <p className="font-semibold text-sm">{t.titulo}</p>
                  <p className="text-xs text-muted-foreground">{t.client?.nome ?? "—"}</p>
                  {t.tecnico_responsavel && (
                    <p className="text-xs text-muted-foreground">Técnico: {t.tecnico_responsavel}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <SlaBadge openedAt={t.created_at} />
                  <Link
                    to="/tickets/$id"
                    params={{ id: t.id }}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Abrir <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {abertos.length === 0 && (
        <Card className="p-6 text-center border-emerald-500/20 bg-emerald-500/5">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Sem incidentes críticos activos
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Todos os sistemas operacionais</p>
        </Card>
      )}

      {/* Histórico com post-mortem */}
      {historico.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Histórico</h2>
          <div className="space-y-2">
            {historico.map((t: any) => {
              const pm = t.ticket_postmortem?.[0];
              return (
                <Card key={t.id} className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-muted-foreground">
                          #{String(t.numero).padStart(5, "0")}
                        </span>
                        {pm ? (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${SEV_CLS[pm.severidade] ?? SEV_CLS.P2}`}>
                            {pm.severidade}
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Sem post-mortem
                          </span>
                        )}
                        {pm?.recorrente && (
                          <span className="text-xs text-red-500">⚠ Recorrente</span>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {new Date(t.created_at).toLocaleDateString("pt-PT")}
                        </span>
                      </div>
                      <Link
                        to="/tickets/$id"
                        params={{ id: t.id }}
                        className="text-sm font-medium hover:text-primary hover:underline block"
                      >
                        {t.titulo}
                      </Link>
                      <p className="text-xs text-muted-foreground">{t.client?.nome ?? "—"}</p>
                      {pm?.causa_raiz && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          <span className="font-medium">Causa:</span> {pm.causa_raiz}
                        </p>
                      )}
                      {pm?.acoes_preventivas && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 line-clamp-1">
                          <span className="font-medium">Prevenção:</span> {pm.acoes_preventivas}
                        </p>
                      )}
                    </div>
                    {pm?.duracao_minutos && (
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">
                          {Math.floor(pm.duracao_minutos / 60)}h{pm.duracao_minutos % 60 > 0 ? `${pm.duracao_minutos % 60}m` : ""}
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: typeof AlertOctagon; color: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${color}`} />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </Card>
  );
}
