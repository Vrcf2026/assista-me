-- ========== time_entries ==========
CREATE TABLE public.time_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  minutos integer NOT NULL CHECK (minutos > 0),
  descricao text,
  data_trabalho date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_time_entries_ticket ON public.time_entries(ticket_id);
CREATE INDEX idx_time_entries_data ON public.time_entries(data_trabalho);
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage time entries"
  ON public.time_entries FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients view time entries on own tickets"
  ON public.time_entries FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR ticket_id IN (SELECT id FROM public.tickets WHERE client_id = current_user_client_id())
  );

CREATE TRIGGER trg_time_entries_updated
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== ticket_tags ==========
CREATE TABLE public.ticket_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  cor text NOT NULL DEFAULT '#F97316',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ticket_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tags"
  ON public.ticket_tags FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone authenticated can view tags"
  ON public.ticket_tags FOR SELECT
  TO authenticated USING (true);

-- ========== ticket_tag_assignments ==========
CREATE TABLE public.ticket_tag_assignments (
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.ticket_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, tag_id)
);
ALTER TABLE public.ticket_tag_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tag assignments"
  ON public.ticket_tag_assignments FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients view tag assignments on own tickets"
  ON public.ticket_tag_assignments FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR ticket_id IN (SELECT id FROM public.tickets WHERE client_id = current_user_client_id())
  );

-- ========== response_templates ==========
CREATE TABLE public.response_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo text NOT NULL,
  mensagem text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.response_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage response templates"
  ON public.response_templates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_response_templates_updated
  BEFORE UPDATE ON public.response_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========== ticket_satisfaction ==========
CREATE TABLE public.ticket_satisfaction (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id uuid NOT NULL UNIQUE REFERENCES public.tickets(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  rating integer CHECK (rating BETWEEN 1 AND 5),
  comentario text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_satisfaction_token ON public.ticket_satisfaction(token);
ALTER TABLE public.ticket_satisfaction ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all satisfaction"
  ON public.ticket_satisfaction FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Clients view own ticket satisfaction"
  ON public.ticket_satisfaction FOR SELECT
  USING (ticket_id IN (SELECT id FROM public.tickets WHERE client_id = current_user_client_id()));

-- (insert/update feito pela rota pública via service role)

-- ========== tickets.tecnico_responsavel_id ==========
ALTER TABLE public.tickets
  ADD COLUMN tecnico_responsavel_id uuid;

-- ========== função: horas consumidas no mês ==========
CREATE OR REPLACE FUNCTION public.client_horas_consumidas_mes(
  _client_id uuid, _ano integer, _mes integer
) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(te.minutos), 0)::integer
  FROM public.time_entries te
  JOIN public.tickets t ON t.id = te.ticket_id
  WHERE t.client_id = _client_id
    AND EXTRACT(YEAR FROM te.data_trabalho) = _ano
    AND EXTRACT(MONTH FROM te.data_trabalho) = _mes;
$$;