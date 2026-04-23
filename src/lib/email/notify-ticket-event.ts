import { supabase } from "@/integrations/supabase/client";
import { sendTransactionalEmail } from "./send";

const SITE_URL = "https://tickets.vrcf.info";

interface TicketLite {
  id: string;
  numero: number;
  titulo: string;
  client_id: string;
}

/**
 * Resolve email do dono do cliente associado ao ticket.
 * Usa o profiles.email (mantido em sync com auth.users via trigger handle_new_user).
 */
async function resolveClientEmail(clientId: string): Promise<{ email: string; nome: string | null } | null> {
  const { data: client } = await supabase
    .from("clients")
    .select("user_id, nome")
    .eq("id", clientId)
    .maybeSingle();
  if (!client?.user_id) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("user_id", client.user_id)
    .maybeSingle();
  if (!profile?.email) return null;
  return { email: profile.email, nome: client.nome };
}

export async function notifyTicketCriado(ticket: TicketLite, prioridade: string) {
  const r = await resolveClientEmail(ticket.client_id);
  if (!r) return;
  await sendTransactionalEmail({
    templateName: "ticket-criado",
    recipientEmail: r.email,
    idempotencyKey: `ticket-criado-${ticket.id}`,
    templateData: {
      clienteNome: r.nome,
      ticketNumero: ticket.numero,
      ticketTitulo: ticket.titulo,
      prioridade,
      ticketUrl: `${SITE_URL}/tickets/${ticket.id}`,
    },
  });
}

export async function notifyNovoComentario(
  ticket: TicketLite,
  mensagem: string,
  autor: string,
  commentId: string,
) {
  const r = await resolveClientEmail(ticket.client_id);
  if (!r) return;
  await sendTransactionalEmail({
    templateName: "ticket-novo-comentario",
    recipientEmail: r.email,
    idempotencyKey: `ticket-comentario-${commentId}`,
    templateData: {
      clienteNome: r.nome,
      ticketNumero: ticket.numero,
      ticketTitulo: ticket.titulo,
      autor,
      mensagem,
      ticketUrl: `${SITE_URL}/tickets/${ticket.id}`,
    },
  });
}

export async function notifyTicketFechado(
  ticket: TicketLite,
  motivoFecho: string,
  solucaoAplicada: string | null,
) {
  const r = await resolveClientEmail(ticket.client_id);
  if (!r) return;
  await sendTransactionalEmail({
    templateName: "ticket-fechado",
    recipientEmail: r.email,
    idempotencyKey: `ticket-fechado-${ticket.id}`,
    templateData: {
      clienteNome: r.nome,
      ticketNumero: ticket.numero,
      ticketTitulo: ticket.titulo,
      motivoFecho,
      solucaoAplicada,
      ticketUrl: `${SITE_URL}/tickets/${ticket.id}`,
    },
  });
}
