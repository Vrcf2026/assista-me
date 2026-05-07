ALTER TABLE public.ticket_escalations ADD COLUMN IF NOT EXISTS escalado_por UUID REFERENCES auth.users(id);
ALTER TABLE public.ticket_escalations ALTER COLUMN motivo DROP NOT NULL;