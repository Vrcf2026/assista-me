
CREATE TABLE public.campanhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descricao TEXT,
  prioridade TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('alta','media','normal')),
  estado TEXT NOT NULL DEFAULT 'ativa' CHECK (estado IN ('ativa','concluida','cancelada')),
  prazo DATE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.campanha_tarefas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id UUID NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0,
  descricao TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.campanha_clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id UUID NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  estado TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','agendado','em_curso','concluido')),
  data_agendada DATE,
  minutos INTEGER NOT NULL DEFAULT 0,
  notas TEXT,
  concluido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.campanha_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_cliente_id UUID NOT NULL REFERENCES public.campanha_clientes(id) ON DELETE CASCADE,
  tarefa_id UUID REFERENCES public.campanha_tarefas(id) ON DELETE SET NULL,
  descricao TEXT NOT NULL,
  concluida BOOLEAN NOT NULL DEFAULT false,
  concluida_em TIMESTAMPTZ,
  minutos INTEGER,
  observacao TEXT,
  foto_url TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanha_tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanha_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanha_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gere campanhas" ON public.campanhas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin gere campanha_tarefas" ON public.campanha_tarefas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin gere campanha_clientes" ON public.campanha_clientes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin gere campanha_checklist" ON public.campanha_checklist FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_campanha_tarefas_camp ON public.campanha_tarefas(campanha_id);
CREATE INDEX idx_campanha_clientes_camp ON public.campanha_clientes(campanha_id);
CREATE INDEX idx_campanha_checklist_cc ON public.campanha_checklist(campanha_cliente_id);

INSERT INTO storage.buckets (id, name, public) VALUES ('campanhas-fotos','campanhas-fotos', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admin lê fotos campanhas" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'campanhas-fotos' AND public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admin envia fotos campanhas" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'campanhas-fotos' AND public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admin actualiza fotos campanhas" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'campanhas-fotos' AND public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Admin apaga fotos campanhas" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'campanhas-fotos' AND public.has_role(auth.uid(),'admin'::app_role));
