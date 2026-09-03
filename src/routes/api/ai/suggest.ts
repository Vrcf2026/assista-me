import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxy server-side para a API do Claude.
 * A ANTHROPIC_API_KEY fica no servidor — nunca exposta ao browser.
 *
 * Requer em .env (Lovable / Cloudflare Workers):
 *   ANTHROPIC_API_KEY=sk-ant-...
 *
 * Chamada do cliente:
 *   POST /api/ai/suggest
 *   Body: { messages: [...], system?: string, max_tokens?: number }
 */
export const Route = createFileRoute("/api/ai/suggest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

        if (!ANTHROPIC_API_KEY) {
          return Response.json(
            { error: "ANTHROPIC_API_KEY não configurada no servidor" },
            { status: 500 },
          );
        }

        // Autenticar — apenas sessões autenticadas podem usar a IA
        // O Supabase session token vem no header Authorization
        const authHeader = request.headers.get("x-supabase-auth");
        if (!authHeader) {
          return Response.json({ error: "Não autenticado" }, { status: 401 });
        }

        let body: {
          messages: Array<{ role: string; content: string }>;
          system?: string;
          max_tokens?: number;
        };

        try {
          body = await request.json() as typeof body;
        } catch {
          return Response.json({ error: "Body inválido" }, { status: 400 });
        }

        if (!body.messages?.length) {
          return Response.json({ error: "messages obrigatório" }, { status: 400 });
        }

        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: body.max_tokens ?? 500,
            system: body.system,
            messages: body.messages,
          }),
        });

        const data = await response.json() as unknown;

        if (!response.ok) {
          return Response.json(
            { error: "Erro da API Claude", detail: data },
            { status: response.status },
          );
        }

        return Response.json(data);
      },
    },
  },
});
