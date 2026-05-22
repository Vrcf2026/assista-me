import { sendTransactionalEmail } from "./send";

const SITE_URL = "https://tickets.vrcf.info";
const ADMIN_EMAIL = "vrcf.loja@gmail.com";

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
  await sendTransactionalEmail({
    templateName: "admin-novo-ticket",
    recipientEmail: ADMIN_EMAIL,
    idempotencyKey: `admin-novo-ticket-${ticket.id}`,
    templateData: {
      clienteNome,
      ticketNumero: ticket.numero,
      ticketTitulo: ticket.titulo,
      prioridade,
      ticketUrl: `${SITE_URL}/tickets/${ticket.id}`,
    },
  });
}

export async function notifyAdminNovoComentarioCliente(
  ticket: TicketLite,
  clienteNome: string,
  mensagem: string,
  commentId: string,
) {
  await sendTransactionalEmail({
    templateName: "admin-novo-comentario",
    recipientEmail: ADMIN_EMAIL,
    idempotencyKey: `admin-comentario-${commentId}`,
    templateData: {
      clienteNome,
      ticketNumero: ticket.numero,
      ticketTitulo: ticket.titulo,
      mensagem,
      ticketUrl: `${SITE_URL}/tickets/${ticket.id}`,
    },
  });
}

export async function notifyAdminCredencialFornecida(
  ticket: TicketLite,
  clienteNome: string,
  tipo: string,
  requestId: string,
) {
  await sendTransactionalEmail({
    templateName: "admin-credencial-fornecida",
    recipientEmail: ADMIN_EMAIL,
    idempotencyKey: `admin-credencial-${requestId}`,
    templateData: {
      clienteNome,
      ticketNumero: ticket.numero,
      ticketTitulo: ticket.titulo,
      tipo,
      ticketUrl: `${SITE_URL}/tickets/${ticket.id}`,
    },
  });
}
