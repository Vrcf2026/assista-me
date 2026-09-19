import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Gera embedding para um ticket fechado e guarda no pgvector.
 * Chamada quando um ticket é fechado.
 *
 * Usa a API de embeddings do Anthropic (voyage-3) ou OpenAI como fallback.
 * Requer: ANTHROPIC_API_KEY (usa voyage via Anthropic) ou OPENAI_API_KEY
 */

export const Route = createFileRoute("/api/ai/embed-ticket")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

        if (!OPENAI_API_KEY && !ANTHROPIC_API_KEY) {
          return Response.json({ ok: false, reason: "no_embedding_key" });
        }

        const authHeader = request.headers.get("x-internal-secret");
        if (authHeader !== SERVICE_KEY.slice(0, 32)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { ticket_id } = await request.json() as { ticket_id: string };
        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

        // Buscar ticket com solução
        const { data: ticket } = await supabase
          .from("tickets")
          .select("id, titulo, descricao, solucao_aplicada, tipo_intervencao, equipamento")
          .eq("id", ticket_id)
          .single();

        if (!ticket) return Response.json({ ok: false, reason: "ticket_not_found" });

        // Construir texto rico para o embedding
        const conteudo = [
          `Problema: ${ticket.titulo}`,
          ticket.descricao ? `Descrição: ${ticket.descricao}` : null,
          ticket.equipamento ? `Equipamento: ${ticket.equipamento}` : null,
          ticket.tipo_intervencao ? `Tipo: ${ticket.tipo_intervencao}` : null,
          ticket.solucao_aplicada ? `Solução aplicada: ${ticket.solucao_aplicada}` : null,
        ].filter(Boolean).join("\n");

        let embedding: number[];

        if (OPENAI_API_KEY) {
          // OpenAI text-embedding-3-small (1536 dims, barato)
          const res = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: "text-embedding-3-small",
              input: conteudo,
            }),
          });
          const data = await res.json() as { data?: { embedding: number[] }[] };
          embedding = data.data?.[0]?.embedding ?? [];
        } else {
          // Voyage via Anthropic (voyage-3, 1024 dims) — adaptar se necessário
          const res = await fetch("https://api.voyageai.com/v1/embeddings", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${ANTHROPIC_API_KEY}`,
            },
            body: JSON.stringify({
              model: "voyage-3",
              input: conteudo,
            }),
          });
          const data = await res.json() as { data?: { embedding: number[] }[] };
          embedding = data.data?.[0]?.embedding ?? [];
        }

        if (!embedding.length) {
          return Response.json({ ok: false, reason: "embedding_empty" });
        }

        // Guardar no pgvector (upsert — pode re-gerar ao actualizar solução)
        const { error } = await supabase.from("ticket_embeddings" as any).upsert({
          ticket_id,
          embedding: `[${embedding.join(",")}]`,
          conteudo,
        }, { onConflict: "ticket_id" });

        if (error) return Response.json({ ok: false, error: error.message });

        return Response.json({ ok: true, dims: embedding.length });
      },
    },
  },
});
