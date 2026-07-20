// Tipos partilhados pelo ecrã de detalhe de ticket e componentes associados.
// Movidos de src/routes/tickets.$id.tsx como primeiro passo do refactor.

export interface Ticket {
  id: string;
  numero: number;
  client_id: string;
  titulo: string;
  descricao: string;
  prioridade: "baixa" | "media" | "alta";
  estado: "aberto" | "em_progresso" | "aguarda_cliente" | "fechado";
  tipo_intervencao: "remota" | "presencial" | "preventiva" | "critica";
  tecnico_responsavel: string | null;
  tempo_gasto_minutos: number;
  solucao_aplicada: string | null;
  motivo_fecho: string | null;
  equipamento: string | null;
  localizacao: string | null;
  contacto_local: string | null;
  pedido_por: string | null;
  num_ordem_oficina: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
  client?: { id: string; nome: string; tarifa_hora: number } | null;
}

export interface Comment {
  id: string;
  ticket_id: string;
  user_id: string;
  mensagem: string;
  is_internal: boolean;
  client_admin_only: boolean;
  visto_em: string | null;
  created_at: string;
}

export interface Escalation {
  id: string;
  tipo_anterior: string;
  tipo_novo: string;
  motivo: string;
  created_at: string;
}

export interface Attachment {
  id: string;
  file_url: string;
  file_name: string;
  is_internal: boolean;
  created_at: string;
  comment_id: string | null;
}
