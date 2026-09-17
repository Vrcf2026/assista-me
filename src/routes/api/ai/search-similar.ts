import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Pesquisa semântica de tickets semelhantes.
 * Recebe um texto (título + descrição do ticket actual) e devolve
 * os N tickets fechados mais semelhantes com a solução que foi aplicada.
 */

export const Route = createFileRoute("/api/ai/search-similar" as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

        // Autenticação — sessão Supabase
        const authHeader = request.headers.get("x-supabase-auth");
        if (!authHeader) return Response.json({ error: "Unauthorized" }, { status: 401 });

        if (!OPENAI_API_KEY && !ANTHROPIC_API_KEY) {
          return Response.json({ results: [], reason: "no_embedding_key" });
        }

        const { query, limit = 3 } = await request.json() as { query: string; limit?: number };
        if (!query?.trim()) return Response.json({ results: [] });

        // Gerar embedding da query
        let embedding: number[];

        if (OPENAI_API_KEY) {
          const res = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({ model: "text-embedding-3-small", input: query }),
          });
          const data = await res.json() as { data?: { embedding: number[] }[] };
          embedding = data.data?.[0]?.embedding ?? [];
        } else {
          const res = await fetch("https://api.voyageai.com/v1/embeddings", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${ANTHROPIC_API_KEY}`,
            },
            body: JSON.stringify({ model: "voyage-3", input: query }),
          });
          const data = await res.json() as { data?: { embedding: number[] }[] };
          embedding = data.data?.[0]?.embedding ?? [];
        }

        if (!embedding.length) return Response.json({ results: [] });

        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

        // Pesquisa pgvector
        const { data: similar } = await supabase.rpc("search_similar_tickets" as any, {
          query_embedding: `[${embedding.join(",")}]`,
          match_count: limit,
          min_similarity: 0.70,
        });

        if (!similar?.length) return Response.json({ results: [] });

        // Buscar detalhes dos tickets
        const ticketIds = similar.map((s: any) => s.ticket_id);
        const { data: tickets } = await supabase
          .from("tickets")
          .select("id, numero, titulo, solucao_aplicada, client:clients(nome)")
          .in("id", ticketIds)
          .eq("estado", "fechado");

        const results = (similar as any[]).map((s: any) => {
          const ticket = tickets?.find((t) => t.id === s.ticket_id);
          return {
            ticket_id: s.ticket_id,
            similarity: Math.round(s.similarity * 100),
            numero: ticket?.numero,
            titulo: ticket?.titulo,
            cliente: (ticket?.client as any)?.nome ?? "—",
            solucao: ticket?.solucao_aplicada,
          };
        }).filter((r) => r.numero);

        return Response.json({ results });
      },
    },
  },
});
