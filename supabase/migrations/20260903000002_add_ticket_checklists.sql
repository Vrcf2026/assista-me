-- Tabelas de checklist para tickets
-- Migradas do portu-gestor-pro para o assista-me

-- Templates de checklist reutilizáveis
CREATE TABLE IF NOT EXISTS checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'geral',
  equipment_type text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Itens dos templates
CREATE TABLE IF NOT EXISTS checklist_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

-- Checklists aplicadas a tickets
CREATE TABLE IF NOT EXISTS ticket_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  template_id uuid NULL REFERENCES checklist_templates(id) ON DELETE SET NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Itens das checklists por ticket
CREATE TABLE IF NOT EXISTS ticket_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES ticket_checklists(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  checked boolean NOT NULL DEFAULT false,
  checked_at timestamptz NULL,
  notes text NULL
);

-- RLS
ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_checklist_items ENABLE ROW LEVEL SECURITY;

-- Políticas — apenas admins (service role ou is_admin)
CREATE POLICY "admins_all_checklist_templates" ON checklist_templates
  USING (auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM auth.users WHERE auth.uid() = id AND raw_user_meta_data->>'role' = 'admin'
  ));

CREATE POLICY "admins_all_checklist_template_items" ON checklist_template_items
  USING (auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM auth.users WHERE auth.uid() = id AND raw_user_meta_data->>'role' = 'admin'
  ));

CREATE POLICY "admins_all_ticket_checklists" ON ticket_checklists
  USING (auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM auth.users WHERE auth.uid() = id AND raw_user_meta_data->>'role' = 'admin'
  ));

CREATE POLICY "admins_all_ticket_checklist_items" ON ticket_checklist_items
  USING (auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM auth.users WHERE auth.uid() = id AND raw_user_meta_data->>'role' = 'admin'
  ));

-- Templates iniciais úteis para um MSP
INSERT INTO checklist_templates (name, category) VALUES
  ('Manutenção preventiva PC', 'manutenção'),
  ('Instalação de equipamento', 'instalação'),
  ('Verificação de backup', 'backup'),
  ('Diagnóstico de rede', 'rede'),
  ('Instalação de câmaras CCTV', 'segurança')
ON CONFLICT DO NOTHING;
