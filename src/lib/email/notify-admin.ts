import { supabase } from "@/integrations/supabase/client";

/**
 * Notificações de admin — via /api/notify (Resend server-side).
 * Substitui o sistema Lovable para notificações de tickets.
 */

async function callNotify(event: string, ticketId: string, data?: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return;

  fetch("/api/notify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ event, ticketId, data }),
  }).catch((e) => console.error("notify-admin failed", e));
}

interface TicketLite {
  id: string;
  numero: number;
  titulo: string;
}

export async function notifyAdminNovoTicket(
  ticket: TicketLite,
  clienteNome: string,
  prioridade: string,
) {
  // Já incluído no evento "ticket-criado" do notify-ticket-event
  // Esta função fica aqui por compatibilidade com os callers existentes
  void callNotify("ticket-criado", ticket.id, { prioridade });
}

export async function notifyAdminNovoComentarioCliente(
  ticket: TicketLite,
  clienteNome: string,
  mensagem: string,
  commentId: string,
) {
  void callNotify("ticket-comentario", ticket.id, {
    mensagem,
    autor: clienteNome,
    commentId,
    isAdminComment: false, // veio do cliente → notificar admin
  });
}

export async function notifyAdminCredencialFornecida(
  ticket: TicketLite,
  clienteNome: string,
  tipo: string,
  requestId: string,
) {
  void callNotify("admin-credencial", ticket.id, { tipo, requestId });
}
