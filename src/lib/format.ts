// Helpers de formatação e cálculo

export function formatTicketNumber(numero: number): string {
  return `#${String(numero).padStart(4, "0")}`;
}

export function formatMinutes(min: number): string {
  if (!min) return "0min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}min`;
  if (h) return `${h}h`;
  return `${m}min`;
}

export function formatHours(min: number): string {
  return `${(min / 60).toFixed(2)}h`;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("pt-PT");
}

export function formatDateTime(d: string | Date): string {
  return new Date(d).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Arredonda os minutos consoante o tipo de intervenção:
 * - Remota: módulos de 5 minutos
 * - Presencial: mínimo 45 minutos, depois módulos de 15
 * - Crítica: usa o módulo do tipo subjacente (assumimos remota por defeito)
 */
export function roundMinutes(
  minutes: number,
  tipo: "remota" | "presencial" | "critica",
): number {
  if (minutes <= 0) return 0;
  if (tipo === "remota" || tipo === "critica") {
    return Math.ceil(minutes / 5) * 5;
  }
  // presencial
  if (minutes <= 45) return 45;
  const extra = minutes - 45;
  return 45 + Math.ceil(extra / 15) * 15;
}

export function calcValor(minutes: number, tarifaHora: number): number {
  return (minutes / 60) * tarifaHora;
}

// Status / prioridade / tipo labels
export const ESTADO_LABELS: Record<string, string> = {
  aberto: "Aberto",
  em_progresso: "Em Progresso",
  aguarda_cliente: "Aguarda Cliente",
  fechado: "Fechado",
};

export const PRIORIDADE_LABELS: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

export const TIPO_LABELS: Record<string, string> = {
  remota: "Remota / Telefónica",
  presencial: "Presencial",
  preventiva: "Preventiva",
  critica: "Crítica",
};

export const MOTIVO_FECHO_LABELS: Record<string, string> = {
  resolvido: "Resolvido",
  nao_reproduzivel: "Não Reproduzível",
  duplicado: "Duplicado",
  fechado_pelo_cliente: "Fechado pelo Cliente",
  inatividade: "Fechado por Inatividade",
};
