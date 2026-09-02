/**
 * Camada de envio de email via Resend SDK.
 * Usada pelas rotas server-side (hooks, email-inbound, digest-mensal, etc).
 *
 * O sistema Lovable (lovable/email/*) continua activo para o frontend —
 * esta camada é mais simples e directa para os workers server-side.
 *
 * Variável de ambiente necessária: RESEND_API_KEY
 */

import { Resend } from "resend";
import * as React from "react";
import { renderAsync } from "@react-email/components";
import { TEMPLATES } from "@/lib/email-templates/registry";

const FROM_NAME = "VRCF — Suporte Técnico";
const FROM_ADDRESS = "noreply@tickets.vrcf.info";
const FROM = `${FROM_NAME} <${FROM_ADDRESS}>`;

export function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY não configurada");
  return new Resend(key);
}

export interface SendEmailParams {
  to: string | string[];
  templateName: string;
  templateData: Record<string, unknown>;
  idempotencyKey?: string;
  replyTo?: string;
}

/**
 * Envia um email transacional via Resend usando os templates React existentes.
 * Retorna { success: true, id } ou { success: false, error }.
 */
export async function sendEmailResend(params: SendEmailParams): Promise<
  { success: true; id: string } | { success: false; error: string }
> {
  try {
    const entry = TEMPLATES[params.templateName];
    if (!entry) {
      return { success: false, error: `Template '${params.templateName}' não encontrado` };
    }

    const resend = getResend();
    const element = React.createElement(entry.component, params.templateData);
    const html = await renderAsync(element);
    const subject =
      typeof entry.subject === "function"
        ? entry.subject(params.templateData)
        : entry.subject;

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject,
      html,
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      ...(params.idempotencyKey
        ? { headers: { "X-Idempotency-Key": params.idempotencyKey } }
        : {}),
    });

    if (error) return { success: false, error: error.message };
    return { success: true, id: data?.id ?? "" };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro desconhecido",
    };
  }
}

/**
 * Envia email com HTML custom (sem template registado).
 */
export async function sendRawEmailResend(params: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  try {
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
    });
    if (error) return { success: false, error: error.message };
    return { success: true, id: data?.id ?? "" };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro desconhecido",
    };
  }
}
