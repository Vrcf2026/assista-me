import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { renderAsync } from "@react-email/components";
import { TEMPLATES } from "@/lib/email-templates/registry";

const SITE_NAME = "VRCF — Suporte Técnico";
const SENDER_DOMAIN = "notify.tickets.vrcf.info";
const FROM_DOMAIN = "tickets.vrcf.info";
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

        const entry = TEMPLATES["ticket-auto-closed"];
        if (!entry) {
          return Response.json(
            { error: "Template ticket-auto-closed not registered" },
            { status: 500 },
          );
        }

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

          // Email para o cliente (lookup do email no auth.users via admin API)
          if (!client?.user_id) continue;
          const { data: userData, error: userErr } =
            await supabase.auth.admin.getUserById(client.user_id);
          if (userErr || !userData?.user?.email) continue;
          const recipient = userData.user.email;

          const props = {
            clienteNome: client?.nome,
            ticketNumero: t.numero,
            ticketTitulo: t.titulo,
            diasInatividade: dias,
            ticketUrl: `${SITE_URL}/tickets/${t.id}`,
          };

          try {
            const element = React.createElement(entry.component, props);
            const html = await renderAsync(element);
            const text = await renderAsync(element, { plainText: true });
            const subject =
              typeof entry.subject === "function"
                ? entry.subject(props)
                : entry.subject;

            const messageId = crypto.randomUUID();
            await supabase.from("email_send_log").insert({
              message_id: messageId,
              template_name: "ticket-auto-closed",
              recipient_email: recipient,
              status: "pending",
            });
            const { error: enqErr } = await supabase.rpc("enqueue_email", {
              queue_name: "transactional_emails",
              payload: {
                message_id: messageId,
                to: recipient,
                from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
                sender_domain: SENDER_DOMAIN,
                subject,
                html,
                text,
                purpose: "transactional",
                label: "ticket-auto-closed",
                idempotency_key: `auto-close-${t.id}`,
                queued_at: new Date().toISOString(),
              },
            });
            if (enqErr) {
              console.error("auto-close: enqueue failed", enqErr);
            } else {
              emailed++;
            }
          } catch (err) {
            console.error("auto-close: email render failed", err);
          }
        }

        return Response.json({ ok: true, closed, emailed });
      },
    },
  },
});
