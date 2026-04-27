-- 1. Limpar dados
DELETE FROM public.ticket_satisfaction;
DELETE FROM public.ticket_escalations;
DELETE FROM public.ticket_tag_assignments;
DELETE FROM public.time_entries;
DELETE FROM public.attachments;
DELETE FROM public.comments;
DELETE FROM public.tickets;
DELETE FROM public.clients;
DELETE FROM public.user_roles WHERE role <> 'admin';
DELETE FROM public.profiles WHERE user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin');
DELETE FROM auth.users WHERE id NOT IN (SELECT user_id FROM public.user_roles WHERE role = 'admin');

-- 2. Drop policies que dependem de clients.user_id e tickets antigas
DROP POLICY IF EXISTS "Clients view own data" ON public.clients;
DROP POLICY IF EXISTS "Members view own clients" ON public.clients;
DROP POLICY IF EXISTS "Clients view own tickets" ON public.tickets;
DROP POLICY IF EXISTS "Clients create own tickets" ON public.tickets;
DROP POLICY IF EXISTS "View comments on accessible tickets" ON public.comments;
DROP POLICY IF EXISTS "Users insert comments on accessible tickets" ON public.comments;
DROP POLICY IF EXISTS "Update own comments (visto_em)" ON public.comments;
DROP POLICY IF EXISTS "View attachments on accessible tickets" ON public.attachments;
DROP POLICY IF EXISTS "Insert attachments on accessible tickets" ON public.attachments;
DROP POLICY IF EXISTS "Clients view time entries on own tickets" ON public.time_entries;
DROP POLICY IF EXISTS "View time entries on accessible tickets" ON public.time_entries;
DROP POLICY IF EXISTS "Clients view own ticket satisfaction" ON public.ticket_satisfaction;
DROP POLICY IF EXISTS "View satisfaction on accessible tickets" ON public.ticket_satisfaction;
DROP POLICY IF EXISTS "Clients view tag assignments on own tickets" ON public.ticket_tag_assignments;
DROP POLICY IF EXISTS "View tag assignments on accessible tickets" ON public.ticket_tag_assignments;

-- Função antiga depende de clients.user_id
DROP FUNCTION IF EXISTS public.current_user_client_id() CASCADE;

-- 3. Remover coluna user_id de clients
ALTER TABLE public.clients DROP COLUMN IF EXISTS user_id;

-- 4. Tabela client_users
CREATE TABLE IF NOT EXISTS public.client_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  is_client_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_client_users_user ON public.client_users(user_id);
CREATE INDEX IF NOT EXISTS idx_client_users_client ON public.client_users(client_id);
ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;

-- 5. Funções auxiliares
CREATE OR REPLACE FUNCTION public.user_client_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT client_id FROM public.client_users WHERE user_id = _user_id $$;

CREATE OR REPLACE FUNCTION public.is_client_admin(_user_id uuid, _client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.client_users WHERE user_id = _user_id AND client_id = _client_id AND is_client_admin = true) $$;

-- 6. tickets.created_by
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS created_by UUID;
CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON public.tickets(created_by);

-- 7. RLS client_users
CREATE POLICY "Admins manage client users" ON public.client_users
FOR ALL USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Users view own membership" ON public.client_users
FOR SELECT USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'::app_role));

-- 8. RLS clients
CREATE POLICY "Members view own clients" ON public.clients
FOR SELECT USING (
  has_role(auth.uid(),'admin'::app_role)
  OR id IN (SELECT public.user_client_ids(auth.uid()))
);

-- 9. RLS tickets
CREATE POLICY "View tickets by membership" ON public.tickets
FOR SELECT USING (
  has_role(auth.uid(),'admin'::app_role)
  OR (
    client_id IN (SELECT public.user_client_ids(auth.uid()))
    AND (public.is_client_admin(auth.uid(), client_id) OR created_by = auth.uid())
  )
);

CREATE POLICY "Create tickets in own client" ON public.tickets
FOR INSERT WITH CHECK (
  has_role(auth.uid(),'admin'::app_role)
  OR (client_id IN (SELECT public.user_client_ids(auth.uid())) AND created_by = auth.uid())
);

-- 10. RLS comments
CREATE POLICY "View comments on accessible tickets" ON public.comments
FOR SELECT USING (
  has_role(auth.uid(),'admin'::app_role)
  OR (is_internal = false AND ticket_id IN (
    SELECT t.id FROM public.tickets t
    WHERE t.client_id IN (SELECT public.user_client_ids(auth.uid()))
      AND (public.is_client_admin(auth.uid(), t.client_id) OR t.created_by = auth.uid())
  ))
);

CREATE POLICY "Insert comments on accessible tickets" ON public.comments
FOR INSERT WITH CHECK (
  auth.uid() = user_id AND (
    has_role(auth.uid(),'admin'::app_role)
    OR (is_internal = false AND ticket_id IN (
      SELECT t.id FROM public.tickets t
      WHERE t.client_id IN (SELECT public.user_client_ids(auth.uid()))
        AND (public.is_client_admin(auth.uid(), t.client_id) OR t.created_by = auth.uid())
    ))
  )
);

CREATE POLICY "Update own comments (visto_em)" ON public.comments
FOR UPDATE USING (
  has_role(auth.uid(),'admin'::app_role)
  OR ticket_id IN (
    SELECT t.id FROM public.tickets t
    WHERE t.client_id IN (SELECT public.user_client_ids(auth.uid()))
      AND (public.is_client_admin(auth.uid(), t.client_id) OR t.created_by = auth.uid())
  )
);

-- 11. RLS attachments
CREATE POLICY "View attachments on accessible tickets" ON public.attachments
FOR SELECT USING (
  has_role(auth.uid(),'admin'::app_role)
  OR (is_internal = false AND ticket_id IN (
    SELECT t.id FROM public.tickets t
    WHERE t.client_id IN (SELECT public.user_client_ids(auth.uid()))
      AND (public.is_client_admin(auth.uid(), t.client_id) OR t.created_by = auth.uid())
  ))
);

CREATE POLICY "Insert attachments on accessible tickets" ON public.attachments
FOR INSERT WITH CHECK (
  auth.uid() = uploaded_by AND (
    has_role(auth.uid(),'admin'::app_role)
    OR (is_internal = false AND ticket_id IN (
      SELECT t.id FROM public.tickets t
      WHERE t.client_id IN (SELECT public.user_client_ids(auth.uid()))
        AND (public.is_client_admin(auth.uid(), t.client_id) OR t.created_by = auth.uid())
    ))
  )
);

-- 12. RLS time_entries
CREATE POLICY "View time entries on accessible tickets" ON public.time_entries
FOR SELECT USING (
  has_role(auth.uid(),'admin'::app_role)
  OR ticket_id IN (
    SELECT t.id FROM public.tickets t
    WHERE t.client_id IN (SELECT public.user_client_ids(auth.uid()))
      AND (public.is_client_admin(auth.uid(), t.client_id) OR t.created_by = auth.uid())
  )
);

-- 13. RLS satisfaction
CREATE POLICY "View satisfaction on accessible tickets" ON public.ticket_satisfaction
FOR SELECT USING (
  has_role(auth.uid(),'admin'::app_role)
  OR ticket_id IN (
    SELECT t.id FROM public.tickets t
    WHERE t.client_id IN (SELECT public.user_client_ids(auth.uid()))
      AND (public.is_client_admin(auth.uid(), t.client_id) OR t.created_by = auth.uid())
  )
);

-- 14. RLS tag assignments
CREATE POLICY "View tag assignments on accessible tickets" ON public.ticket_tag_assignments
FOR SELECT USING (
  has_role(auth.uid(),'admin'::app_role)
  OR ticket_id IN (
    SELECT t.id FROM public.tickets t
    WHERE t.client_id IN (SELECT public.user_client_ids(auth.uid()))
      AND (public.is_client_admin(auth.uid(), t.client_id) OR t.created_by = auth.uid())
  )
);

-- 15. handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, nome)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email))
  ON CONFLICT DO NOTHING;
  IF NEW.email = 'vrcf.loja@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();