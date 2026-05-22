CREATE TABLE public.orcamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero SERIAL,
  tipo_cliente TEXT NOT NULL DEFAULT 'empresa' CHECK (tipo_cliente IN ('particular','empresa')),
  client_id UUID REFERENCES public.clients(id),
  cliente_nome TEXT,
  cliente_contacto TEXT,
  cliente_nif TEXT,
  estado TEXT NOT NULL DEFAULT 'rascunho' CHECK (estado IN ('rascunho','enviado','aprovado','recusado','expirado')),
  validade DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '15 days'),
  condicao_pagamento TEXT NOT NULL DEFAULT '50_50' CHECK (condicao_pagamento IN ('pronto','50_50')),
  notas TEXT,
  trabalho_id UUID REFERENCES public.trabalhos(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.orcamento_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID NOT NULL REFERENCES public.orcamentos(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0,
  descricao TEXT NOT NULL,
  quantidade NUMERIC(8,2) NOT NULL DEFAULT 1,
  valor_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gere orcamentos independentes"
  ON public.orcamentos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin gere itens orcamentos independentes"
  ON public.orcamento_itens FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_orcamentos_estado ON public.orcamentos(estado);
CREATE INDEX idx_orcamentos_client_id ON public.orcamentos(client_id);
CREATE INDEX idx_orcamento_itens_orcamento_id ON public.orcamento_itens(orcamento_id);