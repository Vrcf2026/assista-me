/**
 * Variáveis disponíveis nos templates de resposta.
 * Sintaxe: {{nome_variavel}}
 *
 * Usadas em admin.templates.tsx (edição) e Conversation.tsx (resolução).
 */

export interface TemplateVarContext {
  nome_cliente?: string;
  numero_ticket?: string | number;
  titulo_ticket?: string;
  tecnico?: string;
  data_hoje?: string;
  hora_atual?: string;
}

export const TEMPLATE_VARS: { key: string; label: string; exemplo: string }[] = [
  { key: "nome_cliente",   label: "Nome do cliente",    exemplo: "Bombeiros de Montijo" },
  { key: "numero_ticket",  label: "Número do ticket",   exemplo: "#00042" },
  { key: "titulo_ticket",  label: "Título do ticket",   exemplo: "Impressora não imprime" },
  { key: "tecnico",        label: "Nome do técnico",    exemplo: "Valter" },
  { key: "data_hoje",      label: "Data de hoje",       exemplo: new Date().toLocaleDateString("pt-PT") },
  { key: "hora_atual",     label: "Hora atual",         exemplo: new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) },
];

/**
 * Resolve as variáveis num texto de template.
 * Variáveis não encontradas no contexto ficam como estão.
 */
export function resolveTemplateVars(text: string, ctx: TemplateVarContext): string {
  const today = new Date();
  const fullCtx: Record<string, string> = {
    nome_cliente:  ctx.nome_cliente  ?? "{{nome_cliente}}",
    numero_ticket: ctx.numero_ticket != null
      ? `#${String(ctx.numero_ticket).padStart(5, "0")}`
      : "{{numero_ticket}}",
    titulo_ticket: ctx.titulo_ticket ?? "{{titulo_ticket}}",
    tecnico:       ctx.tecnico       ?? "{{tecnico}}",
    data_hoje:     today.toLocaleDateString("pt-PT"),
    hora_atual:    today.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
  };

  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => fullCtx[key] ?? `{{${key}}}`);
}
