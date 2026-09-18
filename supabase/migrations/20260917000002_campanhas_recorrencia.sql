-- Evolução do modelo de campanhas
-- Adiciona: data_inicio, data_fim, recorrencia, dias de execução, tipo

-- Novos campos na tabela campanhas
ALTER TABLE campanhas
  ADD COLUMN IF NOT EXISTS data_inicio date NULL,
  ADD COLUMN IF NOT EXISTS data_fim date NULL,
  ADD COLUMN IF NOT EXISTS recorrencia text NULL
    CHECK (recorrencia IN ('mensal', 'trimestral', 'semestral', 'anual') OR recorrencia IS NULL),
  ADD COLUMN IF NOT EXISTS dia_inicio_recorrencia smallint NULL CHECK (dia_inicio_recorrencia BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS dia_fim_recorrencia smallint NULL CHECK (dia_fim_recorrencia BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS campanha_pai_id uuid NULL REFERENCES campanhas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'pontual'
    CHECK (tipo IN ('pontual', 'recorrente'));

-- Migrar campo prazo existente para data_fim onde existir
UPDATE campanhas SET data_fim = prazo::date WHERE prazo IS NOT NULL AND data_fim IS NULL;

-- Índice para queries de campanhas activas com prazo
CREATE INDEX IF NOT EXISTS idx_campanhas_data_fim
  ON campanhas (data_fim) WHERE data_fim IS NOT NULL AND estado = 'ativa';

CREATE INDEX IF NOT EXISTS idx_campanhas_recorrencia
  ON campanhas (recorrencia) WHERE recorrencia IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campanhas_pai
  ON campanhas (campanha_pai_id) WHERE campanha_pai_id IS NOT NULL;

-- Função pg_cron: criar instâncias mensais de campanhas recorrentes
-- Corre no dia 1 de cada mês às 07:00
-- Copia a campanha pai e associa os mesmos clientes

CREATE OR REPLACE FUNCTION criar_instancias_campanhas_recorrentes()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  camp RECORD;
  nova_id uuid;
  hoje date := CURRENT_DATE;
  mes_inicio date := date_trunc('month', hoje)::date;
  mes_fim date := (date_trunc('month', hoje) + interval '1 month - 1 day')::date;
BEGIN
  FOR camp IN
    SELECT * FROM campanhas
    WHERE tipo = 'recorrente'
      AND estado = 'ativa'
      AND recorrencia IS NOT NULL
      -- Não criar se já existe instância para este mês
      AND id NOT IN (
        SELECT campanha_pai_id FROM campanhas
        WHERE campanha_pai_id IS NOT NULL
          AND data_inicio >= mes_inicio
          AND data_inicio <= mes_fim
      )
  LOOP
    -- Verificar se toca neste mês pela recorrência
    IF camp.recorrencia = 'mensal'
      OR (camp.recorrencia = 'trimestral' AND EXTRACT(MONTH FROM hoje) IN (1,4,7,10))
      OR (camp.recorrencia = 'semestral' AND EXTRACT(MONTH FROM hoje) IN (1,7))
      OR (camp.recorrencia = 'anual' AND EXTRACT(MONTH FROM hoje) = EXTRACT(MONTH FROM camp.data_inicio))
    THEN
      -- Calcular datas da instância deste mês
      DECLARE
        inst_inicio date := make_date(
          EXTRACT(YEAR FROM hoje)::int,
          EXTRACT(MONTH FROM hoje)::int,
          LEAST(COALESCE(camp.dia_inicio_recorrencia, 1),
                EXTRACT(DAY FROM mes_fim)::int)
        );
        inst_fim date := make_date(
          EXTRACT(YEAR FROM hoje)::int,
          EXTRACT(MONTH FROM hoje)::int,
          LEAST(COALESCE(camp.dia_fim_recorrencia, 5),
                EXTRACT(DAY FROM mes_fim)::int)
        );
      BEGIN
        -- Criar instância
        INSERT INTO campanhas (
          titulo, descricao, prioridade, estado, tipo,
          data_inicio, data_fim, campanha_pai_id,
          created_by, created_at
        ) VALUES (
          camp.titulo || ' — ' || TO_CHAR(hoje, 'MM/YYYY'),
          camp.descricao,
          camp.prioridade,
          'ativa',
          'pontual',
          inst_inicio,
          inst_fim,
          camp.id,
          camp.created_by,
          NOW()
        ) RETURNING id INTO nova_id;

        -- Copiar clientes da campanha pai, resetar estado para pendente
        INSERT INTO campanha_clientes (campanha_id, client_id, estado, created_at)
        SELECT nova_id, cc.client_id, 'pendente', NOW()
        FROM campanha_clientes cc
        WHERE cc.campanha_id = camp.id
        ON CONFLICT DO NOTHING;
      END;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION criar_instancias_campanhas_recorrentes IS
  'Criada pelo pg_cron no dia 1 de cada mês — gera instâncias mensais de campanhas recorrentes';

-- ACTIVAR NO SUPABASE (colar no SQL editor):
-- SELECT cron.schedule(
--   'campanhas-recorrentes-mensal',
--   '0 7 1 * *',
--   $$ SELECT criar_instancias_campanhas_recorrentes(); $$
-- );
