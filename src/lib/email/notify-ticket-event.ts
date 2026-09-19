import { supabase } from "@/integrations/supabase/client";

/**
 * Notificações de eventos de ticket — via /api/notify (Resend server-side).
 * Substitui o sistema Lovable (/lovable/email/transactional/send).
 * Os emails de auth do Lovable ficam intactos.
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
  }).catch((e) => console.error("notify failed", e));
  // best-effort — não bloqueia a UI
}

interface TicketLite {
  id: string;
  numero: number;
  titulo: string;
  client_id: string;
  created_by?: string | null;
}

export async function notifyTicketCriado(ticket: TicketLite, prioridade: string) {
  void callNotify("ticket-criado", ticket.id, { prioridade });
}

export async function notifyNovoComentario(
  ticket: TicketLite,
  mensagem: string,
  autor: string,
  commentId: string,
  isAdminComment = true,
) {
  void callNotify("ticket-comentario", ticket.id, {
    mensagem, autor, commentId, isAdminComment,
  });
}

export async function notifyTicketFechado(
  ticket: TicketLite,
  motivoFecho: string,
  solucaoAplicada: string | null,
) {
  void callNotify("ticket-fechado", ticket.id, { motivoFecho, solucaoAplicada });
}

export async function notifyTicketSatisfacao(ticket: TicketLite) {
  void callNotify("ticket-satisfacao", ticket.id);
}
