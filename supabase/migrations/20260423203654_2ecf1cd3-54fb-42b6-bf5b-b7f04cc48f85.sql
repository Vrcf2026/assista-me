
-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'client');
CREATE TYPE public.contract_type AS ENUM ('avenca', 'pontual');
CREATE TYPE public.ticket_priority AS ENUM ('baixa', 'media', 'alta');
CREATE TYPE public.ticket_status AS ENUM ('aberto', 'em_progresso', 'aguarda_cliente', 'fechado');
CREATE TYPE public.intervention_type AS ENUM ('remota', 'presencial', 'critica');
CREATE TYPE public.close_reason AS ENUM ('resolvido', 'nao_reproduzivel', 'duplicado', 'fechado_pelo_cliente', 'inatividade');

-- =========================================================
-- updated_at trigger function
-- =========================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- USER_ROLES (separate table for security)
-- =========================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- =========================================================
-- CLIENTS
-- =========================================================
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  nif TEXT,
  tipo_contrato contract_type NOT NULL DEFAULT 'pontual',
  tarifa_hora NUMERIC(10,2) NOT NULL DEFAULT 25.00,
  horas_pacote NUMERIC(6,2),
  dias_fecho_automatico INTEGER DEFAULT 7,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- TICKETS (with sequential numero)
-- =========================================================
CREATE SEQUENCE public.tickets_numero_seq START 1;

CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero INTEGER NOT NULL UNIQUE DEFAULT nextval('public.tickets_numero_seq'),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  prioridade ticket_priority NOT NULL DEFAULT 'media',
  estado ticket_status NOT NULL DEFAULT 'aberto',
  tipo_intervencao intervention_type NOT NULL DEFAULT 'remota',
  tecnico_responsavel TEXT,
  tempo_gasto_minutos INTEGER NOT NULL DEFAULT 0,
  solucao_aplicada TEXT,
  motivo_fecho close_reason,
  fechado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER SEQUENCE public.tickets_numero_seq OWNED BY public.tickets.numero;

CREATE TRIGGER trg_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_tickets_client ON public.tickets(client_id);
CREATE INDEX idx_tickets_estado ON public.tickets(estado);

-- =========================================================
-- TICKET ESCALATIONS
-- =========================================================
CREATE TABLE public.ticket_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  tipo_anterior intervention_type NOT NULL,
  tipo_novo intervention_type NOT NULL,
  motivo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ticket_escalations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_escalations_ticket ON public.ticket_escalations(ticket_id);

-- =========================================================
-- COMMENTS
-- =========================================================
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mensagem TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  visto_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_comments_ticket ON public.comments(ticket_id);

-- =========================================================
-- ATTACHMENTS
-- =========================================================
CREATE TABLE public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_attachments_ticket ON public.attachments(ticket_id);

-- =========================================================
-- HELPER: get client_id of current user
-- =========================================================
CREATE OR REPLACE FUNCTION public.current_user_client_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.clients WHERE user_id = auth.uid() LIMIT 1
$$;

-- =========================================================
-- RLS POLICIES
-- =========================================================

-- profiles
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage profiles" ON public.profiles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- user_roles
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- clients
CREATE POLICY "Clients view own data" ON public.clients
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage clients" ON public.clients
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- tickets
CREATE POLICY "Clients view own tickets" ON public.tickets
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin')
    OR client_id = public.current_user_client_id()
  );
CREATE POLICY "Clients create own tickets" ON public.tickets
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR client_id = public.current_user_client_id()
  );
CREATE POLICY "Admins update tickets" ON public.tickets
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete tickets" ON public.tickets
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- ticket_escalations (admins only)
CREATE POLICY "Admins manage escalations" ON public.ticket_escalations
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- comments
CREATE POLICY "View comments on accessible tickets" ON public.comments
  FOR SELECT USING (
    (
      public.has_role(auth.uid(), 'admin')
      OR (
        is_internal = false
        AND ticket_id IN (SELECT id FROM public.tickets WHERE client_id = public.current_user_client_id())
      )
    )
  );
CREATE POLICY "Users insert comments on accessible tickets" ON public.comments
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (
        is_internal = false
        AND ticket_id IN (SELECT id FROM public.tickets WHERE client_id = public.current_user_client_id())
      )
    )
  );
CREATE POLICY "Update own comments (visto_em)" ON public.comments
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'admin')
    OR ticket_id IN (SELECT id FROM public.tickets WHERE client_id = public.current_user_client_id())
  );

-- attachments
CREATE POLICY "View attachments on accessible tickets" ON public.attachments
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      is_internal = false
      AND ticket_id IN (SELECT id FROM public.tickets WHERE client_id = public.current_user_client_id())
    )
  );
CREATE POLICY "Insert attachments on accessible tickets" ON public.attachments
  FOR INSERT WITH CHECK (
    auth.uid() = uploaded_by
    AND (
      public.has_role(auth.uid(), 'admin')
      OR (
        is_internal = false
        AND ticket_id IN (SELECT id FROM public.tickets WHERE client_id = public.current_user_client_id())
      )
    )
  );
CREATE POLICY "Admins delete attachments" ON public.attachments
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, nome)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- STORAGE BUCKET FOR ATTACHMENTS
-- =========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated read ticket attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ticket-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated upload ticket attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'ticket-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Admins delete ticket attachments"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'ticket-attachments' AND public.has_role(auth.uid(), 'admin'));
