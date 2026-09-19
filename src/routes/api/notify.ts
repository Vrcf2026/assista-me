import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { sendEmailResend } from "@/lib/resend";

/**
 * Proxy server-side para notificações de tickets via Resend.
 * Substitui o sistema do Lovable (/lovable/email/transactional/send)
 * para notificações de tickets — os emails de auth do Lovable ficam intactos.
 *
 * O browser chama este endpoint com sessão Supabase.
 * O servidor resolve destinatários e envia via Resend com RESEND_API_KEY.
 *
 * Eventos suportados:
 *   ticket-criado, ticket-comentario, ticket-fechado,
 *   ticket-satisfacao, admin-novo-ticket, admin-comentario,
 *   admin-credencial
 */

const SITE_URL = "https://tickets.vrcf.info";
const ADMIN_EMAIL = "vrcf.loja@gmail.com";

interface NotifyBody {
  event: string;
  ticketId: string;
  data?: Record<string, unknown>;
}

export const Route = createFileRoute("/api/notify" as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

        // Autenticar via sessão Supabase
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json() as NotifyBody;
        if (!body.event || !body.ticketId) {
          return Response.json({ error: "event e ticketId obrigatórios" }, { status: 400 });
        }

        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

        // Buscar dados do ticket
        const { data: ticket } = await supabase
          .from("tickets")
          .select("id, numero, titulo, client_id, created_by, tipo_intervencao")
          .eq("id", body.ticketId)
          .single();

        if (!ticket) return Response.json({ error: "Ticket não encontrado" }, { status: 404 });

        // Buscar nome do cliente e marca
        const { data: client } = await supabase
          .from("clients")
          .select("nome, marca")
          .eq("id", ticket.client_id)
          .single();

        const clienteNome = (client as any)?.nome ?? "Cliente";
        const marca = (client as any)?.marca ?? "vrcf";
        const ticketUrl = `${SITE_URL}/tickets/${ticket.id}`;
        const ticketNumero = (ticket as any).numero;
        const ticketTitulo = (ticket as any).titulo;

        // Resolver destinatários do cliente
        const recipients = await resolveRecipients(
          supabase, ticket.client_id, (ticket as any).created_by
        );

        const sent: string[] = [];
        const errors: string[] = [];

        const send = async (to: string, templateName: string, data: Record<string, unknown>, key?: string) => {
          const result = await sendEmailResend({
            to,
            templateName,
            templateData: data,
            idempotencyKey: key,
          });
          if (result.success) sent.push(to);
          else errors.push(`${to}: ${result.error}`);
        };

        // ── Eventos ──────────────────────────────────────────────────────────
        switch (body.event) {
          case "ticket-criado": {
            for (const r of recipients) {
              await send(r.email, "ticket-criado", {
                clienteNome: r.nome ?? clienteNome,
                ticketNumero, ticketTitulo,
                prioridade: body.data?.prioridade ?? "media",
                ticketUrl, marca,
              }, `ticket-criado-${ticket.id}-${r.email}`);
            }
            // Notificar admin
            await send(ADMIN_EMAIL, "admin-novo-ticket", {
              clienteNome, ticketNumero, ticketTitulo,
              prioridade: body.data?.prioridade ?? "media",
              ticketUrl,
            }, `admin-novo-ticket-${ticket.id}`);
            break;
          }

          case "ticket-comentario": {
            const { mensagem, autor, commentId, isAdminComment } = body.data ?? {};
            for (const r of recipients) {
              await send(r.email, "ticket-novo-comentario", {
                clienteNome: r.nome ?? clienteNome,
                ticketNumero, ticketTitulo,
                mensagem, autor, ticketUrl, marca,
              }, `ticket-comentario-${commentId}-${r.email}`);
            }
            // Notificar admin apenas se o comentário foi do cliente
            if (!isAdminComment) {
              await send(ADMIN_EMAIL, "admin-novo-comentario", {
                clienteNome, ticketNumero, ticketTitulo,
                mensagem, ticketUrl,
              }, `admin-comentario-${commentId}`);
            }
            break;
          }

          case "ticket-fechado": {
            const { motivoFecho, solucaoAplicada } = body.data ?? {};
            for (const r of recipients) {
              await send(r.email, "ticket-fechado", {
                clienteNome: r.nome ?? clienteNome,
                ticketNumero, ticketTitulo,
                motivoFecho, solucaoAplicada, ticketUrl, marca,
              }, `ticket-fechado-${ticket.id}-${r.email}`);
            }
            break;
          }

          case "ticket-satisfacao": {
            // Só para o criador, não todos os admins
            const recipient = recipients[0];
            if (!recipient) break;

            // Criar ou reutilizar token de satisfação
            const { data: existing } = await supabase
              .from("ticket_satisfaction")
              .select("token")
              .eq("ticket_id", ticket.id)
              .maybeSingle();

            let token = (existing as any)?.token;
            if (!token) {
              token = crypto.randomUUID().replace(/-/g, "");
              await supabase.from("ticket_satisfaction").insert({
                ticket_id: ticket.id, token,
              });
            }

            await send(recipient.email, "ticket-satisfacao", {
              clienteNome: recipient.nome ?? clienteNome,
              ticketNumero, ticketTitulo,
              satisfacaoUrl: `${SITE_URL}/satisfacao/${token}`,
              marca,
            }, `ticket-satisfacao-${ticket.id}`);
            break;
          }

          case "admin-credencial": {
            const { tipo, requestId } = body.data ?? {};
            await send(ADMIN_EMAIL, "admin-credencial-fornecida", {
              clienteNome, ticketNumero, ticketTitulo,
              tipo, ticketUrl,
            }, `admin-credencial-${requestId}`);
            break;
          }

          default:
            return Response.json({ error: `Evento desconhecido: ${body.event}` }, { status: 400 });
        }

        return Response.json({ ok: true, sent: sent.length, errors });
      },
    },
  },
});

// ── Helper: resolver destinatários ───────────────────────────────────────────
async function resolveRecipients(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  clientId: string,
  createdBy: string | null,
): Promise<{ email: string; nome: string | null }[]> {
  const { data: members } = await supabase
    .from("client_users")
    .select("user_id, is_client_admin")
    .eq("client_id", clientId);

  const ids = new Set<string>();
  if (createdBy) ids.add(createdBy);
  (members ?? []).forEach((m: any) => { if (m.is_client_admin) ids.add(m.user_id); });
  if (ids.size === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, email, nome")
    .in("user_id", Array.from(ids));

  return (profiles ?? [])
    .filter((p: any) => !!p.email)
    .map((p: any) => ({ email: p.email, nome: p.nome ?? null }));
}
