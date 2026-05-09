ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS equipamento TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS localizacao TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS contacto_local TEXT;