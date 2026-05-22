-- 1. pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Alterar ticket_credenciais: substituir password por password_encrypted
ALTER TABLE public.ticket_credenciais
  ADD COLUMN IF NOT EXISTS password_encrypted bytea;

-- Para dados existentes (se houver), apagar (começamos do zero como acordado)
DELETE FROM public.ticket_credenciais WHERE password_encrypted IS NULL;

ALTER TABLE public.ticket_credenciais DROP COLUMN IF EXISTS password;
ALTER TABLE public.ticket_credenciais ALTER COLUMN password_encrypted SET NOT NULL;

-- 3. Tabela de pedidos de credencial
CREATE TABLE IF NOT EXISTS public.ticket_credential_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  tipo text NOT NULL DEFAULT 'outro',
  nota text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,
  fulfilled_credential_id uuid REFERENCES public.ticket_credenciais(id) ON DELETE SET NULL,
  cancelled_at timestamptz
);

ALTER TABLE public.ticket_credential_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin VRCF gere credential requests"
  ON public.ticket_credential_requests
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin cliente vê credential requests"
  ON public.ticket_credential_requests
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_users cu
    JOIN public.tickets t ON t.client_id = cu.client_id
    WHERE t.id = ticket_credential_requests.ticket_id
      AND cu.user_id = auth.uid()
      AND cu.is_client_admin = true
  ));

CREATE POLICY "Admin cliente atualiza credential requests"
  ON public.ticket_credential_requests
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_users cu
    JOIN public.tickets t ON t.client_id = cu.client_id
    WHERE t.id = ticket_credential_requests.ticket_id
      AND cu.user_id = auth.uid()
      AND cu.is_client_admin = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.client_users cu
    JOIN public.tickets t ON t.client_id = cu.client_id
    WHERE t.id = ticket_credential_requests.ticket_id
      AND cu.user_id = auth.uid()
      AND cu.is_client_admin = true
  ));

CREATE INDEX IF NOT EXISTS idx_credential_requests_ticket ON public.ticket_credential_requests(ticket_id);

-- 4. Trigger: apagar credenciais quando ticket é fechado
CREATE OR REPLACE FUNCTION public.delete_credentials_on_ticket_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted int;
BEGIN
  IF NEW.estado = 'fechado' AND OLD.estado IS DISTINCT FROM 'fechado' THEN
    DELETE FROM public.ticket_credenciais WHERE ticket_id = NEW.id;
    GET DIAGNOSTICS _deleted = ROW_COUNT;
    IF _deleted > 0 THEN
      INSERT INTO public.comments (ticket_id, user_id, mensagem, is_internal)
      VALUES (NEW.id, COALESCE(auth.uid(), NEW.created_by),
        '🔒 ' || _deleted || ' credencial(is) apagada(s) automaticamente ao fechar o ticket.',
        true);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_credentials_on_close ON public.tickets;
CREATE TRIGGER trg_delete_credentials_on_close
AFTER UPDATE ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.delete_credentials_on_ticket_close();