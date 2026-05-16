
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS pedido_por UUID;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS num_ordem_oficina TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS internal_notes TEXT;

CREATE TABLE IF NOT EXISTS public.ticket_credenciais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'outro' CHECK (tipo IN ('email','vpn','windows','router','outro')),
  utilizador TEXT,
  password TEXT NOT NULL,
  notas TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ticket_credenciais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin VRCF gere credenciais" ON public.ticket_credenciais
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.ticket_notas_partilhadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  concluida BOOLEAN NOT NULL DEFAULT false,
  concluida_em TIMESTAMPTZ,
  concluida_por UUID,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ticket_notas_partilhadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin VRCF gere notas partilhadas" ON public.ticket_notas_partilhadas
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin cliente ve notas partilhadas" ON public.ticket_notas_partilhadas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_users cu
      JOIN public.tickets t ON t.client_id = cu.client_id
      WHERE t.id = ticket_notas_partilhadas.ticket_id
        AND cu.user_id = auth.uid()
        AND cu.is_client_admin = true
    )
  );

CREATE POLICY "Admin cliente marca notas partilhadas" ON public.ticket_notas_partilhadas
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_users cu
      JOIN public.tickets t ON t.client_id = cu.client_id
      WHERE t.id = ticket_notas_partilhadas.ticket_id
        AND cu.user_id = auth.uid()
        AND cu.is_client_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.client_users cu
      JOIN public.tickets t ON t.client_id = cu.client_id
      WHERE t.id = ticket_notas_partilhadas.ticket_id
        AND cu.user_id = auth.uid()
        AND cu.is_client_admin = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_ticket_credenciais_ticket ON public.ticket_credenciais(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_notas_partilhadas_ticket ON public.ticket_notas_partilhadas(ticket_id);
