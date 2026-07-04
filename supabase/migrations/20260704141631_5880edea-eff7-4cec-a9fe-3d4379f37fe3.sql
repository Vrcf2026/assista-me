CREATE TABLE public.client_info_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_info_items TO authenticated;
GRANT ALL ON public.client_info_items TO service_role;

ALTER TABLE public.client_info_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage client info items"
  ON public.client_info_items FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_client_info_items_client ON public.client_info_items(client_id, sort_order);

CREATE TRIGGER trg_client_info_items_updated
  BEFORE UPDATE ON public.client_info_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();