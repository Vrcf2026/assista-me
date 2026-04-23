import { supabase } from "@/integrations/supabase/client";

interface SendTransactionalEmailParams {
  templateName: string;
  recipientEmail: string;
  idempotencyKey?: string;
  templateData?: Record<string, any>;
}

/**
 * Dispara um email transacional. Falhas são silenciadas (apenas console)
 * para não bloquear a UI — o utilizador não tem de saber se o email falhou.
 */
export async function sendTransactionalEmail(params: SendTransactionalEmailParams) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { success: false, reason: "no_session" };
    const response = await fetch("/lovable/email/transactional/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const txt = await response.text().catch(() => "");
      console.error("sendTransactionalEmail failed", response.status, txt);
      return { success: false, reason: `http_${response.status}` };
    }
    return await response.json();
  } catch (err) {
    console.error("sendTransactionalEmail threw", err);
    return { success: false, reason: "exception" };
  }
}
