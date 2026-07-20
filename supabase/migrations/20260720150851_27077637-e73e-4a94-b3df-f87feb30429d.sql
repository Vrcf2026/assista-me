
-- Helper: cria notificação sem falhar em erro
CREATE OR REPLACE FUNCTION public.notify(_user_id uuid, _title text, _body text, _link text, _kind text DEFAULT 'info')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, title, body, link, kind)
  VALUES (_user_id, _title, _body, _link, _kind);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify failed: %', SQLERRM;
END;
$$;
REVOKE ALL ON FUNCTION public.notify(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;

-- ============= COMENTÁRIOS =============
CREATE OR REPLACE FUNCTION public.tg_notify_new_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket record;
  _link text;
  _title text;
  _admin record;
BEGIN
  SELECT id, numero, created_by, tecnico_responsavel_id, client_id, descricao
    INTO _ticket FROM public.tickets WHERE id = NEW.ticket_id;
  IF _ticket IS NULL THEN RETURN NEW; END IF;

  _link := '/tickets/' || _ticket.id;

  -- Nota interna (só VRCF) — não notifica cliente
  IF NEW.is_internal THEN
    IF _ticket.tecnico_responsavel_id IS NOT NULL AND _ticket.tecnico_responsavel_id <> NEW.user_id THEN
      PERFORM public.notify(_ticket.tecnico_responsavel_id,
        'Nova nota interna no ticket #' || _ticket.numero,
        left(NEW.mensagem, 140), _link, 'internal');
    END IF;
    RETURN NEW;
  END IF;

  _title := 'Nova mensagem no ticket #' || _ticket.numero;

  -- Partilhado só com admin do cliente + VRCF
  IF NEW.is_shared_admin_only THEN
    IF _ticket.tecnico_responsavel_id IS NOT NULL AND _ticket.tecnico_responsavel_id <> NEW.user_id THEN
      PERFORM public.notify(_ticket.tecnico_responsavel_id, _title, left(NEW.mensagem, 140), _link, 'shared');
    END IF;
    FOR _admin IN
      SELECT user_id FROM public.client_users
      WHERE client_id = _ticket.client_id AND is_client_admin = true AND user_id <> NEW.user_id
    LOOP
      PERFORM public.notify(_admin.user_id, _title, left(NEW.mensagem, 140), _link, 'shared');
    END LOOP;
    RETURN NEW;
  END IF;

  -- Comentário público normal
  IF _ticket.created_by IS NOT NULL AND _ticket.created_by <> NEW.user_id THEN
    PERFORM public.notify(_ticket.created_by, _title, left(NEW.mensagem, 140), _link, 'comment');
  END IF;
  IF _ticket.tecnico_responsavel_id IS NOT NULL
     AND _ticket.tecnico_responsavel_id <> NEW.user_id
     AND _ticket.tecnico_responsavel_id <> _ticket.created_by THEN
    PERFORM public.notify(_ticket.tecnico_responsavel_id, _title, left(NEW.mensagem, 140), _link, 'comment');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_comment ON public.comments;
CREATE TRIGGER trg_notify_new_comment
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_new_comment();

-- ============= MUDANÇA DE ESTADO DO TICKET =============
CREATE OR REPLACE FUNCTION public.tg_notify_ticket_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _link text;
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    _link := '/tickets/' || NEW.id;
    IF NEW.created_by IS NOT NULL AND NEW.created_by <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
      PERFORM public.notify(NEW.created_by,
        'Ticket #' || NEW.numero || ' agora está: ' || NEW.estado,
        left(NEW.descricao, 140), _link, 'state');
    END IF;
  END IF;

  -- Atribuição de técnico
  IF NEW.tecnico_responsavel_id IS DISTINCT FROM OLD.tecnico_responsavel_id
     AND NEW.tecnico_responsavel_id IS NOT NULL
     AND NEW.tecnico_responsavel_id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
    PERFORM public.notify(NEW.tecnico_responsavel_id,
      'Foi-lhe atribuído o ticket #' || NEW.numero,
      left(NEW.descricao, 140), '/tickets/' || NEW.id, 'assign');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ticket_state ON public.tickets;
CREATE TRIGGER trg_notify_ticket_state
AFTER UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_ticket_state();

-- ============= ORÇAMENTOS DE TICKET (aguardar aprovação) =============
CREATE OR REPLACE FUNCTION public.tg_notify_ticket_orcamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket record;
  _admin record;
BEGIN
  IF NEW.estado <> 'pendente' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado = 'pendente' THEN RETURN NEW; END IF;

  SELECT id, numero, client_id INTO _ticket FROM public.tickets WHERE id = NEW.ticket_id;
  IF _ticket IS NULL THEN RETURN NEW; END IF;

  FOR _admin IN
    SELECT user_id FROM public.client_users
    WHERE client_id = _ticket.client_id AND is_client_admin = true
  LOOP
    PERFORM public.notify(_admin.user_id,
      'Orçamento aguarda aprovação (ticket #' || _ticket.numero || ')',
      NULL, '/tickets/' || _ticket.id, 'orcamento');
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ticket_orcamento ON public.ticket_orcamentos;
CREATE TRIGGER trg_notify_ticket_orcamento
AFTER INSERT OR UPDATE OF estado ON public.ticket_orcamentos
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_ticket_orcamento();

-- ============= ORÇAMENTOS INDEPENDENTES =============
CREATE OR REPLACE FUNCTION public.tg_notify_orcamento_independente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _admin record;
BEGIN
  IF NEW.estado NOT IN ('aprovado','recusado') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado = NEW.estado THEN RETURN NEW; END IF;

  -- Notificar admins VRCF quando o cliente responde
  FOR _admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    PERFORM public.notify(_admin.user_id,
      'Orçamento ' || COALESCE(NEW.numero::text, '') || ' — ' || NEW.estado,
      NULL, '/orcamentos/' || NEW.id, 'orcamento');
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_orc_indep ON public.orcamentos;
CREATE TRIGGER trg_notify_orc_indep
AFTER UPDATE OF estado ON public.orcamentos
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_orcamento_independente();

-- ============= PEDIDOS DE CREDENCIAIS =============
CREATE OR REPLACE FUNCTION public.tg_notify_credential_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket record;
  _admin record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT id, numero, client_id INTO _ticket FROM public.tickets WHERE id = NEW.ticket_id;
    IF _ticket IS NULL THEN RETURN NEW; END IF;
    FOR _admin IN
      SELECT user_id FROM public.client_users
      WHERE client_id = _ticket.client_id AND is_client_admin = true
    LOOP
      PERFORM public.notify(_admin.user_id,
        'Pedido de credencial no ticket #' || _ticket.numero,
        NEW.tipo, '/tickets/' || _ticket.id, 'credential');
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_credential_request ON public.ticket_credential_requests;
CREATE TRIGGER trg_notify_credential_request
AFTER INSERT ON public.ticket_credential_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_credential_request();

-- Revogar execução pública das novas funções de trigger
REVOKE ALL ON FUNCTION public.tg_notify_new_comment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_ticket_state() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_ticket_orcamento() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_orcamento_independente() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_notify_credential_request() FROM PUBLIC, anon, authenticated;
