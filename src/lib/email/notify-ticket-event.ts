import { supabase } from "@/integrations/supabase/client";
import { sendTransactionalEmail } from "./send";

const SITE_URL = "https://tickets.vrcf.info";

interface TicketLite {
  id: string;
  numero: number;
  titulo: string;
  client_id: string;
  created_by?: string | null;
}

/**
 * Resolve emails para notificar:
 * - O criador do ticket (se existir)
 * - Todos os admins do cliente (excluindo o próprio criador para evitar duplicados)
 */
async function resolveRecipients(
  clientId: string,
  createdBy: string | null | undefined,
): Promise<{ emails: { email: string; nome: string | null }[]; clienteNome: string | null; marca: string }> {
  const { data: client } = await supabase
    .from("clients").select("nome, marca").eq("id", clientId).maybeSingle();
  const clienteNome = client?.nome ?? null;
  const marca = (client as { marca?: string } | null)?.marca ?? "vrcf";

  // Buscar membership do cliente
  const { data: members } = await supabase
    .from("client_users")
    .select("user_id, is_client_admin")
    .eq("client_id", clientId);

  const ids = new Set<string>();
  if (createdBy) ids.add(createdBy);
  (members ?? []).forEach((m) => { if (m.is_client_admin) ids.add(m.user_id); });

  if (ids.size === 0) return { emails: [], clienteNome, marca };

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, email, nome")
    .in("user_id", Array.from(ids));

  const emails = (profiles ?? [])
    .filter((p) => !!p.email)
    .map((p) => ({ email: p.email, nome: p.nome ?? clienteNome }));

  return { emails, clienteNome, marca };
}

export async function notifyTicketCriado(ticket: TicketLite, prioridade: string) {
  const { emails, clienteNome, marca } = await resolveRecipients(ticket.client_id, ticket.created_by);
  for (const r of emails) {
    await sendTransactionalEmail({
      templateName: "ticket-criado",
      recipientEmail: r.email,
      idempotencyKey: `ticket-criado-${ticket.id}-${r.email}`,
      templateData: {
        clienteNome: r.nome ?? clienteNome,
        ticketNumero: ticket.numero,
        ticketTitulo: ticket.titulo,
        prioridade,
        ticketUrl: `${SITE_URL}/tickets/${ticket.id}`,
        marca,
      },
    });
  }
}

export async function notifyNovoComentario(
  ticket: TicketLite,
  mensagem: string,
  autor: string,
  commentId: string,
) {
  const { emails, clienteNome, marca } = await resolveRecipients(ticket.client_id, ticket.created_by);
  for (const r of emails) {
    await sendTransactionalEmail({
      templateName: "ticket-novo-comentario",
      recipientEmail: r.email,
      idempotencyKey: `ticket-comentario-${commentId}-${r.email}`,
      templateData: {
        clienteNome: r.nome ?? clienteNome,
        ticketNumero: ticket.numero,
        ticketTitulo: ticket.titulo,
        autor,
        mensagem,
        ticketUrl: `${SITE_URL}/tickets/${ticket.id}`,
        marca,
      },
    });
  }
}

export async function notifyTicketFechado(
  ticket: TicketLite,
  motivoFecho: string,
  solucaoAplicada: string | null,
) {
  const { emails, clienteNome, marca } = await resolveRecipients(ticket.client_id, ticket.created_by);
  for (const r of emails) {
    await sendTransactionalEmail({
      templateName: "ticket-fechado",
      recipientEmail: r.email,
      idempotencyKey: `ticket-fechado-${ticket.id}-${r.email}`,
      templateData: {
        clienteNome: r.nome ?? clienteNome,
        ticketNumero: ticket.numero,
        ticketTitulo: ticket.titulo,
        motivoFecho,
        solucaoAplicada,
        ticketUrl: `${SITE_URL}/tickets/${ticket.id}`,
        marca,
      },
    });
  }
}

/**
 * Cria registo de satisfação (token único) e envia email ao criador do ticket.
 */
export async function notifyTicketSatisfacao(ticket: TicketLite) {
  const { emails, clienteNome, marca } = await resolveRecipients(ticket.client_id, ticket.created_by);
  // Apenas ao criador, não a todos os admins do cliente
  const recipient = emails[0];
  if (!recipient) return;

  const { data: existing } = await supabase
    .from("ticket_satisfaction").select("token").eq("ticket_id", ticket.id).maybeSingle();
  let token = existing?.token;
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, "");
    const { error } = await supabase.from("ticket_satisfaction").insert({ ticket_id: ticket.id, token });
    if (error) { console.error("satisfacao insert failed", error); return; }
  }
  await sendTransactionalEmail({
    templateName: "ticket-satisfacao",
    recipientEmail: recipient.email,
    idempotencyKey: `ticket-satisfacao-${ticket.id}`,
    templateData: {
      clienteNome: recipient.nome ?? clienteNome,
      ticketNumero: ticket.numero,
      ticketTitulo: ticket.titulo,
      satisfacaoUrl: `${SITE_URL}/satisfacao/${token}`,
      marca,
    },
  });
}
