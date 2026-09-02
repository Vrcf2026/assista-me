import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { sendEmailResend } from "@/lib/resend";

const SITE_URL = "https://tickets.vrcf.info";

/**
 * Cron job (chamado diariamente pelo pg_cron):
 * Fecha tickets em "aguarda_cliente" cuja inatividade ultrapassou
 * `dias_fecho_automatico` (configurado por cliente, padrão 7) e envia
 * email ao cliente.
 */
export const Route = createFileRoute("/api/public/hooks/auto-close-tickets")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const ANON_KEY =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

        if (!SUPABASE_URL || !SERVICE_KEY) {
          return Response.json(
            { error: "Server configuration error" },
            { status: 500 },
          );
        }

        // Autorização: aceita o anon key como Bearer (vindo do pg_cron) ou o service role key.
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "");
        if (!token || (token !== ANON_KEY && token !== SERVICE_KEY)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

        // 1. Buscar candidatos
        const { data: tickets, error: qErr } = await supabase
          .from("tickets")
          .select(
            "id, numero, titulo, client_id, updated_at, clients:client_id (id, nome, dias_fecho_automatico, user_id)",
          )
          .eq("estado", "aguarda_cliente")
          .limit(500);

        if (qErr) {
          console.error("auto-close: query failed", qErr);
          return Response.json({ error: qErr.message }, { status: 500 });
        }

        const now = Date.now();
        let closed = 0;
        let emailed = 0;

        for (const t of tickets ?? []) {
          const client = (t as any).clients;
          const dias = Number(client?.dias_fecho_automatico ?? 7);
          if (!dias || dias <= 0) continue;
          const ageMs = now - new Date(t.updated_at).getTime();
          if (ageMs < dias * 24 * 60 * 60 * 1000) continue;

          // Fechar
          const { error: updErr } = await supabase
            .from("tickets")
            .update({
              estado: "fechado",
              motivo_fecho: "inatividade",
              fechado_em: new Date().toISOString(),
            })
            .eq("id", t.id)
            .eq("estado", "aguarda_cliente"); // guard race

          if (updErr) {
            console.error("auto-close: update failed", { id: t.id, updErr });
            continue;
          }
          closed++;

          // Email para o cliente via Resend
          if (!client?.user_id) continue;
          const { data: userData, error: userErr } =
            await supabase.auth.admin.getUserById(client.user_id);
          if (userErr || !userData?.user?.email) continue;
          const recipient = userData.user.email;

          const result = await sendEmailResend({
            to: recipient,
            templateName: "ticket-auto-closed",
            templateData: {
              clienteNome: client?.nome,
              ticketNumero: t.numero,
              ticketTitulo: t.titulo,
              diasInatividade: dias,
              ticketUrl: `${SITE_URL}/tickets/${t.id}`,
            },
            idempotencyKey: `auto-close-${t.id}`,
          });

          if (result.success) {
            emailed++;
          } else {
            console.error("auto-close: envio falhou", result.error);
          }
        }

        return Response.json({ ok: true, closed, emailed });
      },
    },
  },
});
