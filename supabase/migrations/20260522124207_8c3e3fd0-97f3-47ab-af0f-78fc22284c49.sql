ALTER TYPE public.contract_type ADD VALUE IF NOT EXISTS 'nenhum';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS morada TEXT;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS email_geral TEXT;