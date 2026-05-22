ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS marca text NOT NULL DEFAULT 'vrcf';

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_marca_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_marca_check CHECK (marca IN ('vrcf', 'spacedata'));