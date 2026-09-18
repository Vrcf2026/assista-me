-- Post-mortem de incidentes críticos
-- Preenchido após resolução de qualquer ticket do tipo "critica"

CREATE TABLE IF NOT EXISTS ticket_postmortem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE UNIQUE,

  -- Análise do incidente
  resumo text NOT NULL,                    -- o que aconteceu em 1-2 frases
  causa_raiz text NOT NULL,                -- por que aconteceu
  impacto text NULL,                       -- sistemas/utilizadores afectados
  duracao_minutos int NULL,                -- duração total do incidente

  -- Resposta
  primeira_resposta_em timestamptz NULL,   -- quando foi o primeiro contacto
  resolucao_em timestamptz NULL,           -- quando foi resolvido

  -- Acções
  acoes_imediatas text NULL,               -- o que foi feito para resolver
  acoes_preventivas text NULL,             -- para não voltar a acontecer
  mudancas_necessarias text NULL,          -- infraestrutura, processos, etc.

  -- Classificação
  severidade text NOT NULL DEFAULT 'P2'
    CHECK (severidade IN ('P1', 'P2', 'P3')),
  recorrente boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_postmortem_ticket_id ON ticket_postmortem(ticket_id);

ALTER TABLE ticket_postmortem ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_all_postmortem" ON ticket_postmortem
  FOR ALL USING (
    auth.role() = 'service_role' OR
    EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = id AND raw_user_meta_data->>'role' = 'admin')
  );

COMMENT ON TABLE ticket_postmortem IS 'Post-mortem estruturado para incidentes críticos — causa raiz, impacto e acções preventivas';
