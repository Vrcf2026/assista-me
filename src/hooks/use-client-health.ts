import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calcHealthScore, type HealthScore } from "@/lib/health-score";

export function useClientHealth(clientId: string): {
  health: HealthScore | null;
  loading: boolean;
} {
  const { data: health = null, isLoading: loading } = useQuery({
    queryKey: ["client-health", clientId],
    staleTime: 5 * 60 * 1000, // 5 minutos
    queryFn: async (): Promise<HealthScore> => {
      const now = new Date();
      const days90ago = new Date(now.getTime() - 90 * 86400_000);
      const days30ago = new Date(now.getTime() - 30 * 86400_000);

      // Buscar dados em paralelo
      const [ticketsRes, satisfacaoRes, timeEntriesRes, clientRes] = await Promise.all([
        // Tickets dos últimos 90 dias
        supabase
          .from("tickets")
          .select("id, estado, created_at")
          .eq("client_id", clientId)
          .gte("created_at", days90ago.toISOString()),

        // Satisfação dos últimos 90 dias
        supabase
          .from("ticket_satisfaction")
          .select("rating, ticket_id")
          .not("rating", "is", null)
          .gte("submitted_at", days90ago.toISOString())
          .in(
            "ticket_id",
            await supabase
              .from("tickets")
              .select("id")
              .eq("client_id", clientId)
              .then(({ data }) => (data ?? []).map((t) => t.id)),
          ),

        // Horas usadas no último mês
        supabase
          .from("time_entries")
          .select("minutos")
          .eq("nao_contabilizar", false)
          .gte("data_trabalho", days30ago.toISOString().slice(0, 10))
          .in(
            "ticket_id",
            await supabase
              .from("tickets")
              .select("id")
              .eq("client_id", clientId)
              .then(({ data }) => (data ?? []).map((t) => t.id)),
          ),

        // Dados do cliente (contrato de horas)
        supabase
          .from("clients")
          .select("horas_contrato_mes")
          .eq("id", clientId)
          .single(),
      ]);

      const tickets = ticketsRes.data ?? [];
      const totalMinutosUlt30 =
        (timeEntriesRes.data ?? []).reduce((s, e) => s + (e.minutos ?? 0), 0) / 60;

      // Tempo médio de resposta: primeiro comentário admin em cada ticket
      let tempoMedioRespostaMin: number | null = null;
      if (tickets.length > 0) {
        const ticketIds = tickets.map((t) => t.id);
        const { data: comments } = await supabase
          .from("comments")
          .select("ticket_id, created_at, is_internal")
          .in("ticket_id", ticketIds)
          .eq("is_internal", false)
          .order("created_at", { ascending: true });

        const primeiraResposta: Record<string, number> = {};
        for (const c of comments ?? []) {
          if (primeiraResposta[c.ticket_id] === undefined) {
            primeiraResposta[c.ticket_id] = new Date(c.created_at).getTime();
          }
        }
        const tempos: number[] = [];
        for (const t of tickets) {
          const primeira = primeiraResposta[t.id];
          if (primeira) {
            const diff = (primeira - new Date(t.created_at).getTime()) / 60000;
            if (diff > 0) tempos.push(diff);
          }
        }
        if (tempos.length > 0) {
          tempoMedioRespostaMin = tempos.reduce((a, b) => a + b, 0) / tempos.length;
        }
      }

      // Satisfação
      const ratings = (satisfacaoRes.data ?? [])
        .map((r) => (r as { rating: number }).rating)
        .filter((r) => r > 0);
      const satisfacaoMedia =
        ratings.length > 0
          ? ratings.reduce((a, b) => a + b, 0) / ratings.length
          : null;

      return calcHealthScore({
        ticketsTotal: tickets.length,
        ticketsFechados: tickets.filter((t) => t.estado === "fechado").length,
        ticketsAbertos: tickets.filter((t) => t.estado !== "fechado").length,
        satisfacaoMedia,
        satisfacaoCount: ratings.length,
        tempoMedioRespostaMin,
        horasContratoMes: (clientRes.data as any)?.horas_contrato_mes ?? null,
        horasUsadasUlt30: totalMinutosUlt30,
      });
    },
  });

  return { health, loading };
}
