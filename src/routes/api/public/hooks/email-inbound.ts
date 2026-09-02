import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { renderAsync } from "@react-email/components";
import { TEMPLATES } from "@/lib/email-templates/registry";

/**
 * Webhook email-to-ticket.
 *
 * Recebe um email de entrada (via Postmark Inbound, SendGrid Inbound Parse,
 * ou qualquer serviço compatível com JSON webhook) e cria um ticket
 * automaticamente se o remetente for reconhecido como utilizador do sistema.
 *
 * CONFIGURAÇÃO no painel do serviço de email:
 * ─────────────────────────────────────────────
 * URL: https://tickets.vrcf.info/api/public/hooks/email-inbound
 * Method: POST
 * Secret header: X-Webhook-Secret: <valor em WEBHOOK_EMAIL_SECRET no .env>
 *
 * PAYLOAD esperado (formato normalizado — adaptar ao serviço escolhido):
 * {
 *   "from_email": "cliente@empresa.pt",
 *   "from_name":  "João Silva",
 *   "subject":    "Impressora não funciona",
 *   "text_body":  "Desde esta manhã a impressora...",
 *   "html_body":  "<p>Desde esta manhã...</p>",      // opcional
 *   "message_id": "<abc123@mail.empresa.pt>"         // para idempotência
 * }
 *
 * Postmark Inbound — adicionar este mapeamento no webhook do Postmark:
 * from_email = From (email only)
 * from_name  = FromName
 * subject    = Subject
 * text_body  = TextBody
 * html_body  = HtmlBody
 * message_id = MessageID
 */

interface InboundPayload {
  from_email: string;
  from_name?: string;
  subject?: string;
  text_body?: string;
  html_body?: string;
  message_id?: string;
}

export const Route = createFileRoute("/api/public/hooks/email-inbound" as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const WEBHOOK_SECRET = process.env.WEBHOOK_EMAIL_SECRET;
        const SITE_URL = "https://tickets.vrcf.info";
        const SITE_NAME = "VRCF — Suporte Técnico";
        const FROM_DOMAIN = "tickets.vrcf.info";
        const SENDER_DOMAIN = "notify.tickets.vrcf.info";
        const ADMIN_EMAIL = "vrcf.loja@gmail.com";

        if (!SUPABASE_URL || !SERVICE_KEY) {
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        // Validar secret se configurado
        if (WEBHOOK_SECRET) {
          const incomingSecret =
            request.headers.get("x-webhook-secret") ??
            request.headers.get("x-postmark-secret");
          if (incomingSecret !== WEBHOOK_SECRET) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
        }

        let payload: InboundPayload;
        try {
          payload = await request.json() as InboundPayload;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const fromEmail = payload.from_email?.toLowerCase().trim();
        if (!fromEmail) {
          return Response.json({ error: "Missing from_email" }, { status: 400 });
        }

        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

        // 1. Idempotência: verificar se já processámos este message_id
        if (payload.message_id) {
          const { data: existing } = await supabase
            .from("tickets")
            .select("id")
            .eq("email_message_id", payload.message_id)
            .maybeSingle();
          if (existing) {
            return Response.json({ ok: true, skipped: true, reason: "duplicate" });
          }
        }

        // 2. Identificar o utilizador pelo email
        const { data: { users }, error: userErr } = await supabase.auth.admin.listUsers();
        if (userErr) {
          return Response.json({ error: userErr.message }, { status: 500 });
        }

        const matchedUser = users.find(
          (u) => u.email?.toLowerCase() === fromEmail,
        );

        // 3. Se utilizador não existe → criar ticket genérico no cliente padrão
        //    (ou rejeitar — depende da política configurada)
        let clientId: string | null = null;
        let userId: string | null = null;

        if (matchedUser) {
          userId = matchedUser.id;
          // Encontrar o cliente associado ao utilizador
          const { data: clientLink } = await supabase
            .from("client_users")
            .select("client_id")
            .eq("user_id", matchedUser.id)
            .limit(1)
            .maybeSingle();
          clientId = clientLink?.client_id ?? null;
        }

        if (!clientId) {
          // Remetente desconhecido — não criamos ticket automaticamente
          // Podemos enviar email de "não reconhecido" no futuro
          return Response.json({
            ok: false,
            reason: "unknown_sender",
            from: fromEmail,
          });
        }

        // 4. Construir título e descrição a partir do email
        const titulo = cleanSubject(payload.subject ?? "Pedido de suporte via email");
        const corpo = extractTextBody(payload.text_body, payload.html_body);

        // 5. Criar o ticket
        const { data: ticket, error: ticketErr } = await supabase
          .from("tickets")
          .insert({
            client_id: clientId,
            titulo,
            descricao: corpo || "(email sem corpo)",
            prioridade: "media",
            estado: "aberto",
            tipo_intervencao: "remota",
            pedido_por: userId,
            // Campo extra para idempotência — adicionar migração se não existir
            ...(payload.message_id ? { email_message_id: payload.message_id } : {}),
          })
          .select("id, numero, titulo")
          .single();

        if (ticketErr) {
          // Se o campo email_message_id não existir ainda, tentar sem ele
          if (ticketErr.message?.includes("email_message_id")) {
            const { data: t2, error: e2 } = await supabase
              .from("tickets")
              .insert({
                client_id: clientId,
                titulo,
                descricao: corpo || "(email sem corpo)",
                prioridade: "media",
                estado: "aberto",
                tipo_intervencao: "remota",
                pedido_por: userId,
              })
              .select("id, numero, titulo")
              .single();
            if (e2) return Response.json({ error: e2.message }, { status: 500 });
            if (!t2) return Response.json({ error: "No ticket returned" }, { status: 500 });
            Object.assign(ticket ?? {}, t2);
          } else {
            return Response.json({ error: ticketErr.message }, { status: 500 });
          }
        }

        if (!ticket) return Response.json({ error: "No ticket returned" }, { status: 500 });

        // 6. Notificar admin via email
        const adminEntry = TEMPLATES["admin-novo-ticket"];
        const { data: clientData } = await supabase
          .from("clients")
          .select("nome")
          .eq("id", clientId)
          .single();

        if (adminEntry) {
          try {
            const props = {
              clienteNome: clientData?.nome ?? fromEmail,
              ticketNumero: ticket.numero,
              ticketTitulo: ticket.titulo,
              prioridade: "media",
              ticketUrl: `${SITE_URL}/tickets/${ticket.id}`,
            };
            const element = React.createElement(adminEntry.component, props);
            const html = await renderAsync(element);
            const text = await renderAsync(element, { plainText: true });
            const subject = typeof adminEntry.subject === "function"
              ? adminEntry.subject(props)
              : adminEntry.subject;

            const messageId = crypto.randomUUID();
            await supabase.from("email_send_log").insert({
              message_id: messageId,
              template_name: "admin-novo-ticket",
              recipient_email: ADMIN_EMAIL,
              status: "pending",
            });
            await supabase.rpc("enqueue_email", {
              queue_name: "transactional_emails",
              payload: {
                message_id: messageId,
                to: ADMIN_EMAIL,
                from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
                sender_domain: SENDER_DOMAIN,
                subject,
                html,
                text,
                purpose: "transactional",
                label: "admin-novo-ticket",
                idempotency_key: `email-inbound-admin-${ticket.id}`,
                queued_at: new Date().toISOString(),
              },
            });
          } catch (e) {
            console.error("email-inbound: notificação admin falhou", e);
          }
        }

        // 7. Notificar o cliente (confirmação de recepção)
        const clienteEntry = TEMPLATES["ticket-criado"];
        if (clienteEntry) {
          try {
            const props = {
              clienteNome: clientData?.nome ?? payload.from_name ?? fromEmail,
              ticketNumero: ticket.numero,
              ticketTitulo: ticket.titulo,
              ticketUrl: `${SITE_URL}/tickets/${ticket.id}`,
            };
            const element = React.createElement(clienteEntry.component, props);
            const html = await renderAsync(element);
            const text = await renderAsync(element, { plainText: true });
            const subject = typeof clienteEntry.subject === "function"
              ? clienteEntry.subject(props)
              : clienteEntry.subject;

            const messageId = crypto.randomUUID();
            await supabase.from("email_send_log").insert({
              message_id: messageId,
              template_name: "ticket-criado",
              recipient_email: fromEmail,
              status: "pending",
            });
            await supabase.rpc("enqueue_email", {
              queue_name: "transactional_emails",
              payload: {
                message_id: messageId,
                to: fromEmail,
                from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
                sender_domain: SENDER_DOMAIN,
                subject,
                html,
                text,
                purpose: "transactional",
                label: "ticket-criado",
                idempotency_key: `email-inbound-cliente-${ticket.id}`,
                queued_at: new Date().toISOString(),
              },
            });
          } catch (e) {
            console.error("email-inbound: confirmação cliente falhou", e);
          }
        }

        return Response.json({
          ok: true,
          ticket_id: ticket.id,
          ticket_numero: ticket.numero,
          titulo: ticket.titulo,
        });
      },
    },
  },
});

// ── Helpers ────────────────────────────────────────────────────────────────

/** Remove prefixos RE:/FW:/RES: do assunto */
function cleanSubject(subject: string): string {
  return subject
    .replace(/^(re|fw|fwd|res|enc):\s*/gi, "")
    .trim()
    .slice(0, 200) || "Pedido de suporte via email";
}

/** Extrai texto legível — prefere text_body, limpa HTML se necessário */
function extractTextBody(text?: string, html?: string): string {
  if (text?.trim()) {
    // Limitar a 4000 chars e remover assinaturas comuns
    return text
      .replace(/^--\s*$.*/ms, "") // remove assinatura após "-- "
      .trim()
      .slice(0, 4000);
  }
  if (html?.trim()) {
    // Strip HTML básico
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);
  }
  return "";
}
