import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { sendEmailResend } from "@/lib/resend";

/**
 * Cron job chamado pelo pg_cron no dia 1 de cada mês às 08:00.
 *
 * Para cada cliente activo:
 *  1. Agrega tickets e tempo do mês anterior
 *  2. Calcula saldo de horas de contrato (se aplicável)
 *  3. Envia email de digest com o resumo
 *
 * pg_cron SQL (colar no editor SQL do Supabase):
 * ─────────────────────────────────────────────
 * SELECT cron.schedule(
 *   'digest-mensal',
 *   '0 8 1 * *',
 *   $$
 *     SELECT net.http_post(
 *       url := 'https://tickets.vrcf.info/api/public/hooks/digest-mensal',
 *       headers := jsonb_build_object(
 *         'Content-Type', 'application/json',
 *         'Authorization', 'Bearer ' || current_setting('app.service_role_key')
 *       ),
 *       body := '{}'::jsonb
 *     )
 *   $$
 * );
 * ─────────────────────────────────────────────
 */
export const Route = createFileRoute("/api/public/hooks/digest-mensal" as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const ANON_KEY =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        const SITE_URL = "https://tickets.vrcf.info";

        if (!SUPABASE_URL || !SERVICE_KEY) {
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        // Autorização: anon key ou service role key via Bearer
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "");
        if (!token || (token !== ANON_KEY && token !== SERVICE_KEY)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

        // Calcular intervalo do mês anterior
        const now = new Date();
        const mesAtual = now.getMonth(); // 0-based
        const anoAtual = now.getFullYear();
        const inicioMes = new Date(
          mesAtual === 0 ? anoAtual - 1 : anoAtual,
          mesAtual === 0 ? 11 : mesAtual - 1,
          1,
        );
        const fimMes = new Date(anoAtual, mesAtual, 1); // início do mês atual (exclusive)

        const MESES_PT = [
          "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
          "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
        ];
        const mesAno = `${MESES_PT[inicioMes.getMonth()]} ${inicioMes.getFullYear()}`;

        const inicioISO = inicioMes.toISOString();
        const fimISO = fimMes.toISOString();

        // Buscar clientes activos com email
        const { data: clientes, error: clientErr } = await supabase
          .from("clients")
          .select("id, nome, marca, digest_mensal_ativo, horas_contrato_mes")
          .eq("ativo", true);

        if (clientErr) {
          console.error("digest-mensal: erro ao buscar clientes", clientErr);
          return Response.json({ error: clientErr.message }, { status: 500 });
        }

        let enviados = 0;
        let erros = 0;

        for (const cliente of clientes ?? []) {
          // Respeitar opt-out (campo digest_mensal_ativo, null = activo por defeito)
          if (cliente.digest_mensal_ativo === false) continue;

          try {
            // Buscar tickets do mês anterior para este cliente
            const { data: tickets } = await supabase
              .from("tickets")
              .select("id, numero, titulo, estado, tempo_gasto_minutos, created_at, fechado_em")
              .eq("client_id", cliente.id)
              .gte("created_at", inicioISO)
              .lt("created_at", fimISO)
              .order("numero", { ascending: false })
              .limit(20);

            // Buscar tempo registado no mês (pode incluir tickets criados antes)
            const { data: timeEntries } = await supabase
              .from("time_entries")
              .select("minutos, ticket_id")
              .gte("data_trabalho", inicioMes.toISOString().slice(0, 10))
              .lt("data_trabalho", fimMes.toISOString().slice(0, 10))
              .eq("nao_contabilizar", false)
              .in(
                "ticket_id",
                // todos os tickets do cliente (não só do mês)
                await supabase
                  .from("tickets")
                  .select("id")
                  .eq("client_id", cliente.id)
                  .then(({ data }) => (data ?? []).map((t) => t.id)),
              );

            const totalMinutos = (timeEntries ?? []).reduce(
              (sum, e) => sum + (e.minutos ?? 0),
              0,
            );

            const ticketsArr = tickets ?? [];
            const totalTickets = ticketsArr.length;
            const ticketsResolvidos = ticketsArr.filter((t) =>
              t.estado === "fechado",
            ).length;
            const ticketsAbertos = ticketsArr.filter((t) =>
              t.estado !== "fechado",
            ).length;

            // Tempo médio de resolução (tickets fechados com tempo > 0)
            const fechados = ticketsArr.filter(
              (t) => t.estado === "fechado" && t.tempo_gasto_minutos > 0,
            );
            const tempoMedioResolucaoHoras =
              fechados.length > 0
                ? fechados.reduce((s, t) => s + t.tempo_gasto_minutos, 0) /
                  fechados.length /
                  60
                : undefined;

            // Saldo de contrato de horas
            let saldoHorasContrato: number | null = null;
            const horasContratoTotal: number | null = cliente.horas_contrato_mes ?? null;
            if (horasContratoTotal && horasContratoTotal > 0) {
              const horasUsadas = totalMinutos / 60;
              saldoHorasContrato = Math.max(0, horasContratoTotal - horasUsadas);
            }

            // Não enviar se não houve actividade e não há contrato
            if (totalTickets === 0 && !horasContratoTotal) continue;

            // Buscar email(s) dos admins do cliente
            const { data: adminLinks } = await supabase
              .from("client_users")
              .select("user_id")
              .eq("client_id", cliente.id)
              .eq("is_client_admin", true);

            const adminUserIds = (adminLinks ?? []).map((l) => l.user_id);
            if (adminUserIds.length === 0) continue;

            for (const userId of adminUserIds) {
              const { data: userData } = await supabase.auth.admin.getUserById(userId);
              const email = userData?.user?.email;
              if (!email) continue;

              const props = {
                clienteNome: cliente.nome,
                mesAno,
                totalTickets,
                ticketsResolvidos,
                ticketsAbertos,
                totalMinutos,
                tempoMedioResolucaoHoras,
                saldoHorasContrato,
                horasContratoTotal,
                ticketsDestaque: ticketsArr.slice(0, 5).map((t) => ({
                  numero: t.numero,
                  titulo: t.titulo,
                  estado: t.estado,
                  minutos: t.tempo_gasto_minutos ?? 0,
                })),
                siteUrl: SITE_URL,
                marca: cliente.marca ?? "vrcf",
              };

              const result = await sendEmailResend({
                to: email,
                templateName: "digest-mensal",
                templateData: props,
                idempotencyKey: `digest-${cliente.id}-${inicioMes.toISOString().slice(0, 7)}`,
              });

              if (!result.success) {
                console.error("digest-mensal: envio falhou", { cliente: cliente.id, error: result.error });
                erros++;
              } else {
                enviados++;
              }
            }
          } catch (err) {
            console.error("digest-mensal: erro para cliente", cliente.id, err);
            erros++;
          }
        }

        return Response.json({
          ok: true,
          mesAno,
          enviados,
          erros,
          clientes: (clientes ?? []).length,
        });
      },
    },
  },
});
