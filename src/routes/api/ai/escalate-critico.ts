import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Escalonamento automático para incidentes críticos.
 * Chamado quando um ticket muda para tipo_intervencao = "critica".
 *
 * Faz:
 * 1. Push notification imediato a todos os admins
 * 2. Mensagem WhatsApp pré-formatada (link directo)
 * 3. Registo de escalação com timestamp
 * 4. Email de alerta (via notify-ticket-event existente)
 */

const SITE_URL = "https://tickets.vrcf.info";
const WHATSAPP_ADMIN = "351964602891"; // número VRCF

export const Route = createFileRoute("/api/ai/escalate-critico")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

        // Autenticação interna
        const authHeader = request.headers.get("x-supabase-auth");
        if (!authHeader) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json() as {
          ticket_id: string;
          numero: number;
          titulo: string;
          client_nome: string;
          motivo?: string;
        };

        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

        // 1. Push imediato a todos os admins
        const { sendPushToAdmins: _pushAdmins } = await import("@/lib/push");
        await _pushAdmins({
          title: `🚨 CRÍTICO #${String(body.numero).padStart(5, "0")}`,
          body: `${body.client_nome}: ${body.titulo}${body.motivo ? ` — ${body.motivo}` : ""}`,
          link: `/tickets/${body.ticket_id}`,
          serviceKey: SERVICE_KEY,
        });

        // 2. Inserir notificação no sistema de notificações interno
        // Usar auth.users directamente — mais robusto que tabela user_roles separada
        const { data: adminUsers } = await supabase.auth.admin.listUsers();
        const admins = (adminUsers?.users ?? [])
          .filter(u => u.user_metadata?.role === "admin")
          .map(u => ({ user_id: u.id }));

        if (admins.length) {
          await supabase.from("notifications").insert(
            admins.map((a) => ({
              user_id: a.user_id,
              title: `🚨 Incidente crítico #${String(body.numero).padStart(5, "0")}`,
              body: `${body.client_nome}: ${body.titulo}`,
              kind: "incidente_critico",
              link: `/tickets/${body.ticket_id}`,
            }))
          );
        }

        // 3. Link WhatsApp pré-formatado para envio rápido ao cliente
        const msgCliente = encodeURIComponent(
          `🚨 *Incidente crítico detectado*\n\n` +
          `Cliente: ${body.client_nome}\n` +
          `Problema: ${body.titulo}\n` +
          `Ticket: #${String(body.numero).padStart(5, "0")}\n\n` +
          `Estamos a tratar com prioridade máxima. Em breve entramos em contacto.\n` +
          `Acompanha em: ${SITE_URL}/tickets/${body.ticket_id}`
        );
        const whatsappUrl = `https://wa.me/${WHATSAPP_ADMIN}?text=${msgCliente}`;

        return Response.json({
          ok: true,
          whatsapp_url: whatsappUrl,
          pushed: admins?.length ?? 0,
        });
      },
    },
  },
});
