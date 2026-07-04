ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS anydesk_id TEXT,
  ADD COLUMN IF NOT EXISTS teamviewer_id TEXT,
  ADD COLUMN IF NOT EXISTS contacto_tecnico_nome TEXT,
  ADD COLUMN IF NOT EXISTS contacto_tecnico_telefone TEXT,
  ADD COLUMN IF NOT EXISTS horario_assistencia TEXT,
  ADD COLUMN IF NOT EXISTS notas_internas TEXT;