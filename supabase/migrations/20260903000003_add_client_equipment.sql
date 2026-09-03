-- Tabela de equipamentos registados por cliente
-- Com alertas automáticos de garantia a expirar

CREATE TABLE IF NOT EXISTS client_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'PC',  -- PC, NAS, Router, Switch, CCTV, Servidor, Outro
  marca text NOT NULL,
  modelo text NOT NULL DEFAULT '',
  numero_serie text NULL,
  data_instalacao date NULL,
  fim_garantia date NULL,
  notas text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índice para queries de garantia
CREATE INDEX IF NOT EXISTS idx_client_equipment_fim_garantia
  ON client_equipment (fim_garantia) WHERE fim_garantia IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_equipment_client_id
  ON client_equipment (client_id);

-- RLS
ALTER TABLE client_equipment ENABLE ROW LEVEL SECURITY;

-- Admins: acesso total
CREATE POLICY "admins_all_client_equipment" ON client_equipment
  FOR ALL USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.uid() = id AND raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Clientes: só vêem os seus próprios equipamentos
CREATE POLICY "clients_view_own_equipment" ON client_equipment
  FOR SELECT USING (
    client_id IN (
      SELECT client_id FROM client_users WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE client_equipment IS 'Equipamentos registados por cliente com controlo de garantia';
COMMENT ON COLUMN client_equipment.fim_garantia IS 'Data de fim de garantia — alerta gerado 90 dias antes';
