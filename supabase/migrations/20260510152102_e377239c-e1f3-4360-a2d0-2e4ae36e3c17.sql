
CREATE TABLE public.preventiva_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  periodicidade TEXT NOT NULL CHECK (periodicidade IN ('mensal','trimestral','semestral','anual')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.preventiva_tarefas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.preventiva_templates(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0,
  descricao TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.preventiva_agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.preventiva_templates(id),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  proxima_data DATE NOT NULL,
  ultima_data DATE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.preventiva_execucoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id UUID NOT NULL REFERENCES public.preventiva_agendamentos(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  template_id UUID NOT NULL REFERENCES public.preventiva_templates(id),
  tecnico_id UUID,
  data_execucao DATE NOT NULL DEFAULT CURRENT_DATE,
  observacoes TEXT,
  minutos INTEGER NOT NULL DEFAULT 0,
  tipo_intervencao TEXT NOT NULL DEFAULT 'preventiva',
  estado TEXT NOT NULL DEFAULT 'em_curso' CHECK (estado IN ('em_curso','concluida')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.preventiva_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execucao_id UUID NOT NULL REFERENCES public.preventiva_execucoes(id) ON DELETE CASCADE,
  tarefa_id UUID NOT NULL REFERENCES public.preventiva_tarefas(id),
  descricao TEXT NOT NULL,
  concluida BOOLEAN NOT NULL DEFAULT false,
  foto_url TEXT,
  observacao TEXT,
  concluida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.preventiva_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preventiva_tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preventiva_agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preventiva_execucoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preventiva_checklist ENABLE ROW LEVEL SECURITY;

-- Templates
CREATE POLICY "Admin gere templates" ON public.preventiva_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated ve templates" ON public.preventiva_templates
  FOR SELECT TO authenticated USING (true);

-- Tarefas
CREATE POLICY "Admin gere tarefas" ON public.preventiva_tarefas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated ve tarefas" ON public.preventiva_tarefas
  FOR SELECT TO authenticated USING (true);

-- Agendamentos
CREATE POLICY "Admin gere agendamentos" ON public.preventiva_agendamentos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Clientes veem proprios agendamentos" ON public.preventiva_agendamentos
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT public.user_client_ids(auth.uid())));

-- Execucoes
CREATE POLICY "Admin gere execucoes" ON public.preventiva_execucoes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Clientes veem proprias execucoes" ON public.preventiva_execucoes
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT public.user_client_ids(auth.uid())));

-- Checklist
CREATE POLICY "Admin gere checklist" ON public.preventiva_checklist
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Clientes veem proprio checklist" ON public.preventiva_checklist
  FOR SELECT TO authenticated
  USING (execucao_id IN (
    SELECT id FROM public.preventiva_execucoes
    WHERE client_id IN (SELECT public.user_client_ids(auth.uid()))
  ));

-- Indexes
CREATE INDEX idx_preventiva_tarefas_template ON public.preventiva_tarefas(template_id, ordem);
CREATE INDEX idx_preventiva_agendamentos_proxima ON public.preventiva_agendamentos(proxima_data) WHERE ativo = true;
CREATE INDEX idx_preventiva_agendamentos_client ON public.preventiva_agendamentos(client_id);
CREATE INDEX idx_preventiva_execucoes_agendamento ON public.preventiva_execucoes(agendamento_id);
CREATE INDEX idx_preventiva_checklist_execucao ON public.preventiva_checklist(execucao_id);

-- Templates base
INSERT INTO public.preventiva_templates (nome, descricao, periodicidade) VALUES
  ('Manutenção Mensal Básica', 'Verificações mensais de rotina', 'mensal'),
  ('Manutenção Trimestral', 'Verificações trimestrais aprofundadas', 'trimestral'),
  ('Manutenção Semestral', 'Revisão semestral completa', 'semestral'),
  ('Manutenção Anual', 'Revisão anual completa do sistema', 'anual');

-- Tarefas para o template mensal
INSERT INTO public.preventiva_tarefas (template_id, ordem, descricao)
SELECT t.id, v.ordem, v.descricao
FROM public.preventiva_templates t,
LATERAL (VALUES
  (1, 'Verificar e actualizar antivírus — confirmar que as definições estão actualizadas'),
  (2, 'Verificar backups — confirmar que os últimos 3 backups foram bem sucedidos'),
  (3, 'Actualizações do sistema — instalar actualizações pendentes de Windows/software'),
  (4, 'Verificar espaço em disco — alertar se < 20% livre'),
  (5, 'Verificar logs de eventos — identificar erros críticos nos últimos 30 dias'),
  (6, 'Verificar estado da rede — testar conectividade e velocidade'),
  (7, 'Verificar UPS — estado da bateria e autonomia'),
  (8, 'Limpeza física — remover pó de equipamentos e verificar cabos')
) AS v(ordem, descricao)
WHERE t.nome = 'Manutenção Mensal Básica';

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('preventiva-fotos', 'preventiva-fotos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read preventiva fotos" ON storage.objects
  FOR SELECT USING (bucket_id = 'preventiva-fotos');
CREATE POLICY "Admin upload preventiva fotos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'preventiva-fotos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update preventiva fotos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'preventiva-fotos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete preventiva fotos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'preventiva-fotos' AND public.has_role(auth.uid(), 'admin'));
