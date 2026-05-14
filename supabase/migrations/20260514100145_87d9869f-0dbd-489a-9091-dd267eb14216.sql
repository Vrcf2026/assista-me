CREATE TABLE public.trabalhos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  data_agendada DATE,
  prioridade TEXT NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('alta','media','normal')),
  estado TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','agendado','em_curso','concluido')),
  minutos INTEGER NOT NULL DEFAULT 0,
  notas TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.trabalho_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabalho_id UUID NOT NULL REFERENCES public.trabalhos(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0,
  descricao TEXT NOT NULL,
  concluida BOOLEAN NOT NULL DEFAULT false,
  concluida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.trabalho_tempo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trabalho_id UUID NOT NULL REFERENCES public.trabalhos(id) ON DELETE CASCADE,
  user_id UUID,
  minutos INTEGER NOT NULL,
  modo TEXT NOT NULL DEFAULT 'manual' CHECK (modo IN ('manual','cronometro','intervalo')),
  data_trabalho DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trabalhos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trabalho_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trabalho_tempo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gere trabalhos" ON public.trabalhos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin gere trabalho checklist" ON public.trabalho_checklist FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin gere trabalho tempo" ON public.trabalho_tempo FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trabalhos_updated_at BEFORE UPDATE ON public.trabalhos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_trabalhos_estado ON public.trabalhos(estado);
CREATE INDEX idx_trabalhos_data ON public.trabalhos(data_agendada);
CREATE INDEX idx_trabalho_checklist_trabalho ON public.trabalho_checklist(trabalho_id);
CREATE INDEX idx_trabalho_tempo_trabalho ON public.trabalho_tempo(trabalho_id);