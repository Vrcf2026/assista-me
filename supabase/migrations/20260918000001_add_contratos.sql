-- Tabela de contratos por cliente
-- Complementa os campos básicos já existentes em clients (tipo_contrato, horas_pacote, etc.)
-- com o contrato formal completo

CREATE TABLE IF NOT EXISTS contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Identificação
  numero text NOT NULL, -- ex: CONT-2026-001
  tipo text NOT NULL DEFAULT 'avenca'
    CHECK (tipo IN ('avenca', 'pontual', 'projeto', 'manutencao')),

  -- Datas
  data_inicio date NOT NULL,
  data_fim date NULL,           -- null = indeterminado
  renovacao_automatica boolean NOT NULL DEFAULT true,
  aviso_renovacao_dias int NOT NULL DEFAULT 30, -- alertar X dias antes do fim

  -- Valores
  valor_mensal numeric(10,2) NULL,   -- para avença mensal
  valor_total numeric(10,2) NULL,    -- para projeto/pontual
  horas_incluidas int NULL,          -- horas incluídas na avença/mês
  tarifa_hora_extra numeric(10,2) NULL, -- tarifa se ultrapassar

  -- O que inclui / não inclui (texto livre)
  inclui text NULL,
  nao_inclui text NULL,
  condicoes text NULL,               -- condições gerais, SLA, etc.

  -- Assinatura
  assinado_em date NULL,
  assinado_por_cliente text NULL,    -- nome de quem assinou
  estado text NOT NULL DEFAULT 'activo'
    CHECK (estado IN ('rascunho', 'activo', 'suspenso', 'terminado')),

  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_contratos_client_id ON contratos(client_id);
CREATE INDEX IF NOT EXISTS idx_contratos_data_fim ON contratos(data_fim) WHERE data_fim IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contratos_estado ON contratos(estado);

-- Sequência automática para número do contrato
CREATE SEQUENCE IF NOT EXISTS contratos_numero_seq START 1;

-- Trigger para número automático
CREATE OR REPLACE FUNCTION set_contrato_numero()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero = '' OR NEW.numero IS NULL THEN
    NEW.numero := 'CONT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('contratos_numero_seq')::text, 3, '0');
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_contrato_numero
  BEFORE INSERT OR UPDATE ON contratos
  FOR EACH ROW EXECUTE FUNCTION set_contrato_numero();

-- RLS
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_contratos" ON contratos
  FOR ALL USING (
    auth.role() = 'service_role' OR
    EXISTS (SELECT 1 FROM auth.users WHERE auth.uid() = id AND raw_user_meta_data->>'role' = 'admin')
  );

COMMENT ON TABLE contratos IS 'Contratos formais por cliente — inclui o que está coberto, valores, datas e condições';
