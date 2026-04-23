import type { ComponentType } from 'react'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

import { template as ticketAutoClosed } from "./ticket-auto-closed";
import { template as ticketCriado } from "./ticket-criado";
import { template as ticketNovoComentario } from "./ticket-novo-comentario";
import { template as ticketFechado } from "./ticket-fechado";

export const TEMPLATES: Record<string, TemplateEntry> = {
  "ticket-auto-closed": ticketAutoClosed,
  "ticket-criado": ticketCriado,
  "ticket-novo-comentario": ticketNovoComentario,
  "ticket-fechado": ticketFechado,
};
