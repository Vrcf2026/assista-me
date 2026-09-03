-- Adicionar email_message_id para idempotência do email-inbound
-- Evita criar tickets duplicados quando o mesmo email é recebido duas vezes

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS email_message_id text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_email_message_id
  ON tickets (email_message_id) WHERE email_message_id IS NOT NULL;

COMMENT ON COLUMN tickets.email_message_id IS 'Message-ID do email de entrada que originou este ticket (para idempotência)';
