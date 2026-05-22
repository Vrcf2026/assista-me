-- Encrypt helper
CREATE OR REPLACE FUNCTION public.encrypt_password(_password text, _key text)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT extensions.pgp_sym_encrypt(_password, _key);
$$;

REVOKE ALL ON FUNCTION public.encrypt_password(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_password(text, text) TO service_role;

-- Decrypt + list helper
CREATE OR REPLACE FUNCTION public.decrypt_ticket_credentials(_ticket_id uuid, _key text)
RETURNS TABLE (
  id uuid,
  ticket_id uuid,
  tipo text,
  utilizador text,
  password text,
  notas text,
  created_at timestamptz,
  created_by uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    c.id, c.ticket_id, c.tipo, c.utilizador,
    extensions.pgp_sym_decrypt(c.password_encrypted, _key) AS password,
    c.notas, c.created_at, c.created_by
  FROM public.ticket_credenciais c
  WHERE c.ticket_id = _ticket_id
  ORDER BY c.created_at;
$$;

REVOKE ALL ON FUNCTION public.decrypt_ticket_credentials(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_ticket_credentials(uuid, text) TO service_role;