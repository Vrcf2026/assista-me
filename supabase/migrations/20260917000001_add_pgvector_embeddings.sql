-- Activar extensão pgvector para pesquisa semântica
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabela de embeddings dos tickets fechados
-- Cada ticket fechado gera um embedding do seu título + descrição + solução
CREATE TABLE IF NOT EXISTS ticket_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  embedding vector(1536),         -- dimensão do text-embedding-3-small da OpenAI
                                   -- (Claude não tem embeddings próprios ainda)
  conteudo text NOT NULL,          -- texto que gerou o embedding (para debug)
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ticket_id)
);

-- Índice HNSW para pesquisa ANN rápida
CREATE INDEX IF NOT EXISTS idx_ticket_embeddings_hnsw
  ON ticket_embeddings USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- RLS
ALTER TABLE ticket_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_ticket_embeddings" ON ticket_embeddings
  USING (
    auth.role() = 'service_role' OR
    EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = id AND raw_user_meta_data->>'role' = 'admin')
  );

-- Função de pesquisa semântica — devolve os N tickets mais semelhantes
CREATE OR REPLACE FUNCTION search_similar_tickets(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  min_similarity float DEFAULT 0.70
)
RETURNS TABLE (
  ticket_id uuid,
  similarity float,
  conteudo text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    te.ticket_id,
    1 - (te.embedding <=> query_embedding) AS similarity,
    te.conteudo
  FROM ticket_embeddings te
  WHERE 1 - (te.embedding <=> query_embedding) >= min_similarity
  ORDER BY te.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
