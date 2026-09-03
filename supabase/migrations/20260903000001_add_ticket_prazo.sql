-- Adicionar campo prazo (data limite) aos tickets
-- Usado pelo calendário de tickets para visualização por data

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS prazo date NULL;

-- Índice para queries de calendário (filtrar por intervalo de datas)
CREATE INDEX IF NOT EXISTS idx_tickets_prazo ON tickets (prazo) WHERE prazo IS NOT NULL;

-- Comentário descritivo
COMMENT ON COLUMN tickets.prazo IS 'Data limite prevista para resolução do ticket (opcional)';
