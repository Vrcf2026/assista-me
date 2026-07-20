
-- 1) Create clients_internal table for staff-only sensitive fields
CREATE TABLE public.clients_internal (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  notas_internas text,
  anydesk_id text,
  teamviewer_id text,
  contacto_tecnico_nome text,
  contacto_tecnico_telefone text,
  horario_assistencia text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients_internal TO authenticated;
GRANT ALL ON public.clients_internal TO service_role;

ALTER TABLE public.clients_internal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage clients_internal"
  ON public.clients_internal
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER update_clients_internal_updated_at
  BEFORE UPDATE ON public.clients_internal
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Copy data over from clients
INSERT INTO public.clients_internal
  (client_id, notas_internas, anydesk_id, teamviewer_id,
   contacto_tecnico_nome, contacto_tecnico_telefone, horario_assistencia)
SELECT id, notas_internas, anydesk_id, teamviewer_id,
       contacto_tecnico_nome, contacto_tecnico_telefone, horario_assistencia
FROM public.clients;

-- 3) Drop the sensitive columns from clients
ALTER TABLE public.clients
  DROP COLUMN notas_internas,
  DROP COLUMN anydesk_id,
  DROP COLUMN teamviewer_id,
  DROP COLUMN contacto_tecnico_nome,
  DROP COLUMN contacto_tecnico_telefone,
  DROP COLUMN horario_assistencia;

-- 4) Lock down SECURITY DEFINER functions that must not be directly callable
--    from the app (triggers / cron / server-side-only via service role).
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_credentials_on_ticket_close() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_password(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_ticket_credentials(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
