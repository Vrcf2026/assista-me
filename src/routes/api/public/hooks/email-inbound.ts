import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { sendEmailResend } from "@/lib/resend";

/**
 * Webhook email-to-ticket via Resend Inbound.
 *
 * CONFIGURAÇÃO no Resend:
 * ─────────────────────────────────────────────
 * 1. Resend Dashboard → Domains → vrcf.pt → verificar domínio
 * 2. Resend Dashboard → Inbound → Add Endpoint
 *    URL: https://tickets.vrcf.info/api/public/hooks/email-inbound
 *    Email to catch: geral@vrcf.pt
 * 3. Adicionar ao .env:
 *    RESEND_API_KEY=re_8rtW3FrW_...
 *    RESEND_WEBHOOK_SECRET=<gerado pelo Resend no passo 2>
 *
 * PAYLOAD do Resend Inbound (formato nativo):
 * https://resend.com/docs/api-reference/inbound/receive-emails
 */

interface ResendInboundPayload {
  from: string;             // "João Silva <joao@empresa.pt>"
  to: string[];             // ["geral@vrcf.pt"]
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  message_id?: string;
}

export const Route = createFileRoute("/api/public/hooks/email-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;
        const SITE_URL = "https://tickets.vrcf.info";
        const ADMIN_EMAIL = "vrcf.loja@gmail.com";

        if (!SUPABASE_URL || !SERVICE_KEY) {
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        // Validar secret do Resend
        if (WEBHOOK_SECRET) {
          const sig = request.headers.get("svix-signature") ??
                      request.headers.get("x-resend-signature") ??
                      request.headers.get("x-webhook-secret");
          if (sig !== WEBHOOK_SECRET) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
        }

        let payload: ResendInboundPayload;
        try {
          payload = await request.json() as ResendInboundPayload;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        // Extrair email do remetente ("Nome <email>" ou só "email")
        const fromRaw = payload.from ?? "";
        const fromMatch = fromRaw.match(/<([^>]+)>/) ?? fromRaw.match(/(\S+@\S+)/);
        const fromEmail = (fromMatch?.[1] ?? fromRaw).toLowerCase().trim();
        const fromName = fromRaw.replace(/<[^>]+>/, "").trim().replace(/^"|"$/g, "");

        if (!fromEmail) {
          return Response.json({ error: "Missing from email" }, { status: 400 });
        }

        // Ignorar emails do próprio sistema (evitar loops)
        if (fromEmail.includes("tickets.vrcf.info") || fromEmail.includes("noreply@")) {
          return Response.json({ ok: true, skipped: true, reason: "self_email" });
        }

        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

        // Idempotência pelo message_id
        const messageId = payload.message_id ??
          payload.headers?.["message-id"] ??
          payload.headers?.["Message-ID"];

        if (messageId) {
          const { data: existing } = await supabase
            .from("tickets")
            .select("id, numero")
            .eq("email_message_id", messageId)
            .maybeSingle();
          if (existing) {
            return Response.json({ ok: true, skipped: true, reason: "duplicate", ticket: existing.numero });
          }
        }

        // Identificar utilizador e cliente pelo email
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const matchedUser = users.find((u) => u.email?.toLowerCase() === fromEmail);

        let clientId: string | null = null;
        let userId: string | null = null;
        let clienteNome: string | null = null;

        if (matchedUser) {
          userId = matchedUser.id;
          const { data: link } = await supabase
            .from("client_users")
            .select("client_id, clients(nome)")
            .eq("user_id", matchedUser.id)
            .limit(1)
            .maybeSingle();
          clientId = link?.client_id ?? null;
          clienteNome = (link as any)?.clients?.nome ?? null;
        }

        if (!clientId) {
          // Remetente desconhecido — notificar admin para tratar manualmente
          await sendEmailResend({
            to: ADMIN_EMAIL,
            templateName: "admin-novo-ticket",
            templateData: {
              clienteNome: fromName || fromEmail,
              ticketNumero: 0,
              ticketTitulo: `[EMAIL NÃO RECONHECIDO] ${cleanSubject(payload.subject)}`,
              prioridade: "media",
              ticketUrl: SITE_URL,
            },
            idempotencyKey: `unknown-sender-${fromEmail}-${Date.now()}`,
          });
          return Response.json({ ok: false, reason: "unknown_sender", from: fromEmail });
        }

        // Criar ticket
        const titulo = cleanSubject(payload.subject ?? "Pedido de suporte via email");
        const descricao = extractTextBody(payload.text, payload.html);

        const insertData: Record<string, unknown> = {
          client_id: clientId,
          titulo,
          descricao: descricao || "(email sem corpo)",
          prioridade: "media",
          estado: "aberto",
          tipo_intervencao: "remota",
          pedido_por: userId,
        };
        if (messageId) insertData.email_message_id = messageId;

        let ticket: { id: string; numero: number; titulo: string } | null = null;

        const { data: t1, error: e1 } = await supabase
          .from("tickets").insert(insertData).select("id, numero, titulo").single();

        if (e1?.message?.includes("email_message_id")) {
          // Campo ainda não existe — inserir sem ele
          delete insertData.email_message_id;
          const { data: t2, error: e2 } = await supabase
            .from("tickets").insert(insertData).select("id, numero, titulo").single();
          if (e2) return Response.json({ error: e2.message }, { status: 500 });
          ticket = t2;
        } else if (e1) {
          return Response.json({ error: e1.message }, { status: 500 });
        } else {
          ticket = t1;
        }

        if (!ticket) return Response.json({ error: "No ticket returned" }, { status: 500 });

        // Notificar admin via Resend
        await sendEmailResend({
          to: ADMIN_EMAIL,
          templateName: "admin-novo-ticket",
          templateData: {
            clienteNome: clienteNome ?? fromEmail,
            ticketNumero: ticket.numero,
            ticketTitulo: ticket.titulo,
            prioridade: "media",
            ticketUrl: `${SITE_URL}/tickets/${ticket.id}`,
          },
          idempotencyKey: `email-inbound-admin-${ticket.id}`,
        });

        // Confirmar ao cliente via Resend (reply-to para resposta directa)
        await sendEmailResend({
          to: fromEmail,
          templateName: "ticket-criado",
          templateData: {
            clienteNome: clienteNome ?? fromName ?? fromEmail,
            ticketNumero: ticket.numero,
            ticketTitulo: ticket.titulo,
            ticketUrl: `${SITE_URL}/tickets/${ticket.id}`,
          },
          idempotencyKey: `email-inbound-cliente-${ticket.id}`,
          replyTo: ADMIN_EMAIL,
        });

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

function cleanSubject(subject: string): string {
  return subject
    .replace(/^(re|fw|fwd|res|enc):\s*/gi, "")
    .trim()
    .slice(0, 200) || "Pedido de suporte via email";
}

function extractTextBody(text?: string, html?: string): string {
  if (text?.trim()) {
    return text.replace(/^--\s*$.*/ms, "").trim().slice(0, 4000);
  }
  if (html?.trim()) {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);
  }
  return "";
}
