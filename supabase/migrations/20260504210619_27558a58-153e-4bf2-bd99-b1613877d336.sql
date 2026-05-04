-- Add 'preventiva' to intervention_type enum
ALTER TYPE intervention_type ADD VALUE IF NOT EXISTS 'preventiva';

-- time_entries new columns
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS tipo_intervencao intervention_type NOT NULL DEFAULT 'remota',
  ADD COLUMN IF NOT EXISTS nao_contabilizar BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS estado_faturacao TEXT NOT NULL DEFAULT 'pendente'
    CHECK (estado_faturacao IN ('pendente','incluido_avenca','para_faturar','faturado'));

-- clients new columns
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS horas_pacote_anual NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS contrato_inicio DATE,
  ADD COLUMN IF NOT EXISTS contrato_fim DATE;

-- Function: horas consumidas anual (within active contract period)
CREATE OR REPLACE FUNCTION public.client_horas_consumidas_anual(_client_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(te.minutos), 0)::integer
  FROM public.time_entries te
  JOIN public.tickets t ON t.id = te.ticket_id
  JOIN public.clients c ON c.id = t.client_id
  WHERE t.client_id = _client_id
    AND te.nao_contabilizar = false
    AND te.estado_faturacao <> 'para_faturar'
    AND c.contrato_inicio IS NOT NULL
    AND c.contrato_fim IS NOT NULL
    AND te.data_trabalho BETWEEN c.contrato_inicio AND c.contrato_fim;
$$;

-- Function: calcular estado_faturacao for a new entry
CREATE OR REPLACE FUNCTION public.calcular_estado_faturacao(
  _client_id UUID,
  _minutos INTEGER,
  _nao_contabilizar BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _client RECORD;
  _consumidos INTEGER;
  _pacote_min INTEGER;
BEGIN
  IF _nao_contabilizar THEN
    RETURN 'pendente';
  END IF;

  SELECT tipo_contrato, horas_pacote_anual, contrato_inicio, contrato_fim
    INTO _client
  FROM public.clients WHERE id = _client_id;

  IF _client.tipo_contrato = 'pontual' THEN
    RETURN 'para_faturar';
  END IF;

  -- avenca
  IF _client.horas_pacote_anual IS NULL
     OR _client.contrato_inicio IS NULL OR _client.contrato_fim IS NULL
     OR CURRENT_DATE NOT BETWEEN _client.contrato_inicio AND _client.contrato_fim THEN
    RETURN 'para_faturar';
  END IF;

  _consumidos := public.client_horas_consumidas_anual(_client_id);
  _pacote_min := (_client.horas_pacote_anual * 60)::INTEGER;

  IF (_consumidos + COALESCE(_minutos, 0)) <= _pacote_min THEN
    RETURN 'incluido_avenca';
  ELSE
    RETURN 'para_faturar';
  END IF;
END;
$$;