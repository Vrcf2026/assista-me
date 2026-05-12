CREATE TABLE public.preventiva_agendamento_tarefas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id UUID NOT NULL REFERENCES public.preventiva_agendamentos(id) ON DELETE CASCADE,
  tarefa_id UUID REFERENCES public.preventiva_tarefas(id),
  ordem INTEGER NOT NULL DEFAULT 0,
  descricao TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.preventiva_agendamento_tarefas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gere agendamento tarefas"
ON public.preventiva_agendamento_tarefas
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clientes veem proprias tarefas agendamento"
ON public.preventiva_agendamento_tarefas
FOR SELECT TO authenticated
USING (agendamento_id IN (
  SELECT id FROM public.preventiva_agendamentos
  WHERE client_id IN (SELECT public.user_client_ids(auth.uid()))
));

CREATE INDEX idx_pat_agendamento ON public.preventiva_agendamento_tarefas(agendamento_id);

ALTER TABLE public.preventiva_checklist ADD COLUMN IF NOT EXISTS minutos INTEGER;