CREATE OR REPLACE FUNCTION public.tg_comments_restrict_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  -- Clientes só podem marcar como visto; tudo o resto fica inalterado
  NEW.id := OLD.id;
  NEW.ticket_id := OLD.ticket_id;
  NEW.user_id := OLD.user_id;
  NEW.mensagem := OLD.mensagem;
  NEW.is_internal := OLD.is_internal;
  NEW.client_admin_only := OLD.client_admin_only;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tg_comments_restrict_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_comments_restrict_update ON public.comments;
CREATE TRIGGER trg_comments_restrict_update
BEFORE UPDATE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.tg_comments_restrict_update();