
CREATE TABLE public.ticket_orcamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  versao INTEGER NOT NULL DEFAULT 1,
  estado TEXT NOT NULL DEFAULT 'pendente' CHECK (estado IN ('pendente','aprovado','recusado')),
  validade DATE,
  notas TEXT,
  observacao_resposta TEXT,
  respondido_por UUID REFERENCES auth.users(id),
  respondido_em TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ticket_orcamento_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID NOT NULL REFERENCES public.ticket_orcamentos(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0,
  descricao TEXT NOT NULL,
  quantidade NUMERIC(8,2) NOT NULL DEFAULT 1,
  valor_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_orcamentos_ticket ON public.ticket_orcamentos(ticket_id);
CREATE INDEX idx_ticket_orcamento_itens_orc ON public.ticket_orcamento_itens(orcamento_id);

ALTER TABLE public.ticket_orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_orcamento_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin VRCF gere orcamentos" ON public.ticket_orcamentos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin cliente ve orcamentos" ON public.ticket_orcamentos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_users cu
      JOIN public.tickets t ON t.client_id = cu.client_id
      WHERE t.id = ticket_orcamentos.ticket_id
        AND cu.user_id = auth.uid()
        AND cu.is_client_admin = true
    )
  );

CREATE POLICY "Admin cliente responde orcamento" ON public.ticket_orcamentos
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_users cu
      JOIN public.tickets t ON t.client_id = cu.client_id
      WHERE t.id = ticket_orcamentos.ticket_id
        AND cu.user_id = auth.uid()
        AND cu.is_client_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.client_users cu
      JOIN public.tickets t ON t.client_id = cu.client_id
      WHERE t.id = ticket_orcamentos.ticket_id
        AND cu.user_id = auth.uid()
        AND cu.is_client_admin = true
    )
  );

CREATE POLICY "Admin VRCF gere itens" ON public.ticket_orcamento_itens
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin cliente ve itens" ON public.ticket_orcamento_itens
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ticket_orcamentos o
      JOIN public.tickets t ON t.id = o.ticket_id
      JOIN public.client_users cu ON cu.client_id = t.client_id
      WHERE o.id = ticket_orcamento_itens.orcamento_id
        AND cu.user_id = auth.uid()
        AND cu.is_client_admin = true
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trabalhos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campanhas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campanha_clientes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.preventiva_agendamentos;
