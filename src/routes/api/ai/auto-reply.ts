import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Analisa um ticket novo com IA e:
 *  - Se for simples → responde automaticamente ao cliente e notifica o admin
 *  - Se for complexo → apenas notifica o admin com sugestão de resposta
 *
 * Chamada pelo email-inbound após criar o ticket.
 *
 * Requer: ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY
 */

const CATEGORIAS_SIMPLES = [
  "password", "palavra-passe", "esqueci", "reset", "acesso", "login", "entrar",
  "impressora", "imprimir", "não imprime",
  "internet", "wifi", "sem internet", "ligação", "lento",
  "email", "outlook", "gmail", "não abre",
  "windows update", "atualização", "reiniciar",
  "ficheiro", "pasta", "não encontro",
];

const SITE_URL = "https://tickets.vrcf.info";
const ADMIN_EMAIL = "vrcf.loja@gmail.com";

export const Route = createFileRoute("/api/ai/auto-reply" as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

        if (!ANTHROPIC_API_KEY) {
          return Response.json({ ok: false, reason: "no_api_key" });
        }

        // Autenticação interna
        const authHeader = request.headers.get("x-internal-secret");
        if (authHeader !== SERVICE_KEY.slice(0, 32)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json() as {
          ticket_id: string;
          client_email: string;
          client_nome: string;
        };

        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

        // Buscar ticket
        const { data: ticket } = await supabase
          .from("tickets")
          .select("id, numero, titulo, descricao, estado, client_id")
          .eq("id", body.ticket_id)
          .single();

        if (!ticket || ticket.estado !== "aberto") {
          return Response.json({ ok: false, reason: "ticket_not_found_or_closed" });
        }

        // Verificar se parece simples pela descrição
        const textoCompleto = `${ticket.titulo} ${ticket.descricao}`.toLowerCase();
        const pareceSimples = CATEGORIAS_SIMPLES.some((kw) => textoCompleto.includes(kw));

        // Chamar IA para analisar e gerar resposta
        const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 600,
            system: `És um técnico de suporte informático sénior da VRCF – Informática & Segurança, a dar suporte a PMEs em Portugal.
Analisa pedidos de suporte e decide se podes responder automaticamente ou se requer intervenção humana.

Responde APENAS com JSON no formato:
{
  "complexidade": "simples" | "media" | "complexa",
  "responder_automaticamente": true | false,
  "resposta_cliente": "texto da resposta ao cliente (em português europeu informal, máximo 120 palavras) OU null se não responder automaticamente",
  "nota_admin": "resumo de 1 linha para o admin sobre este ticket"
}

Responde automaticamente apenas se:
- O problema tem solução documentada e comum (reset de password, configuração básica, orientação de uso)
- Não requer acesso remoto ou presença física
- A solução pode ser explicada por escrito em 2-3 passos
- Tens confiança ≥ 90% na solução

Nunca respondas automaticamente a: hardware fisicamente danificado, configurações de rede complexas, problemas de segurança críticos, instalações novas.`,
            messages: [{
              role: "user",
              content: `Ticket #${String(ticket.numero).padStart(5, "0")}
Título: ${ticket.titulo}
Descrição: ${ticket.descricao}
Cliente: ${body.client_nome}`,
            }],
          }),
        });

        const aiData = await aiResponse.json() as { content?: { type: string; text: string }[] };
        const rawText = aiData.content?.find((b) => b.type === "text")?.text ?? "{}";

        let analysis: {
          complexidade: string;
          responder_automaticamente: boolean;
          resposta_cliente: string | null;
          nota_admin: string;
        };

        try {
          analysis = JSON.parse(rawText.replace(/```json|```/g, "").trim());
        } catch {
          return Response.json({ ok: false, reason: "ai_parse_error", raw: rawText });
        }

        // Se a IA decidiu responder automaticamente
        if (analysis.responder_automaticamente && analysis.resposta_cliente) {
          // Inserir comentário no ticket como resposta automática
          await supabase.from("comments").insert({
            ticket_id: ticket.id,
            user_id: "00000000-0000-0000-0000-000000000000", // sistema
            mensagem: `🤖 *Resposta automática:*\n\n${analysis.resposta_cliente}\n\n---\n*Esta resposta foi gerada automaticamente pela IA da VRCF. Se precisar de mais ajuda, responda a este email ou aguarde contacto do nosso técnico.*`,
            is_internal: false,
            client_admin_only: false,
          });

          // Actualizar estado para aguarda_cliente
          await supabase.from("tickets")
            .update({ estado: "aguarda_cliente" })
            .eq("id", ticket.id);

          // Enviar email ao cliente com a resposta
          const { sendEmailResend: _sendEmail } = await import("@/lib/resend");
          await _sendEmail({
            to: body.client_email,
            templateName: "ticket-novo-comentario",
            templateData: {
              clienteNome: body.client_nome,
              ticketNumero: ticket.numero,
              ticketTitulo: ticket.titulo,
              mensagem: analysis.resposta_cliente,
              ticketUrl: `${SITE_URL}/tickets/${ticket.id}`,
              isAutoReply: true,
            },
            idempotencyKey: `auto-reply-${ticket.id}`,
          });

          // Notificar admin que a IA respondeu
          const { sendPushToAdmins: _pushAdmins } = await import("@/lib/push");
        await _pushAdmins({
            title: `🤖 IA respondeu ao #${String(ticket.numero).padStart(5, "0")}`,
            body: analysis.nota_admin,
            link: `/tickets/${ticket.id}`,
            serviceKey: SERVICE_KEY,
          });

          return Response.json({
            ok: true,
            auto_replied: true,
            complexidade: analysis.complexidade,
            nota_admin: analysis.nota_admin,
          });
        }

        // Ticket complexo — apenas notificar admin com sugestão
        const { sendPushToAdmins: _pushAdmins } = await import("@/lib/push");
        await _pushAdmins({
          title: `🎫 Ticket #${String(ticket.numero).padStart(5, "0")} precisa de ti`,
          body: `${body.client_nome}: ${analysis.nota_admin}`,
          link: `/tickets/${ticket.id}`,
          serviceKey: SERVICE_KEY,
        });

        return Response.json({
          ok: true,
          auto_replied: false,
          complexidade: analysis.complexidade,
          nota_admin: analysis.nota_admin,
        });
      },
    },
  },
});
