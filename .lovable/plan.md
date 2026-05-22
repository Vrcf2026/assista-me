# Formulário de tickets e partilha segura de credenciais

## 1. Formulário de abertura (cliente)

Remover título como campo separado. Substituir por:

- **Sistema / equipamento afetado*** — input com sugestões (autocomplete) dos `equipamento` já usados em tickets anteriores deste cliente
- **Descrição do problema*** — textarea
- **Impacto no trabalho** — radio: bloqueia tudo / parcial / sem impacto urgente (mapeia para alta/média/baixa)
- **Quando começou** — opcional: hoje / ontem / há mais tempo
- **Precisa de deslocação?** — checkbox; se sim, mostra campo Localização
- **🔒 Credenciais de acesso (opcional)** — painel colapsado: tipo, utilizador, password, notas
- **Anexos** — igual

Título do ticket é gerado automaticamente: `[Sistema] descrição-truncada`.

## 2. Formulário admin (em nome do cliente)

Adicionar o mesmo painel colapsado de credenciais. Resto fica como está.

## 3. Encriptação de credenciais

- Adicionar extensão `pgcrypto`
- Pedir secret `CREDENTIALS_ENCRYPTION_KEY`
- Migrar `ticket_credenciais.password` para guardar valor encriptado
- Server function `getTicketCredentials(ticketId)` (com `requireSupabaseAuth` + check de role admin) desencripta e devolve
- Server function `addTicketCredential(...)` encripta antes de gravar
- Painel de credenciais existente passa a usar estas server functions em vez de query direta

## 4. Trigger: apagar credenciais ao fechar ticket

Trigger em `tickets` `AFTER UPDATE`: quando `estado` muda para `fechado`, apagar todas as `ticket_credenciais` desse ticket e inserir um comentário do sistema *"🔒 Credenciais apagadas ao fechar"*.

## 5. Pedido seguro de credencial na conversa

Nova tabela `ticket_credential_requests`:
- `id`, `ticket_id`, `tipo` (vpn/rdp/web/email/outro), `nota` (texto curto), `created_by`, `created_at`, `fulfilled_at`, `fulfilled_credential_id` (FK para `ticket_credenciais`)

RLS: admin gere tudo; admin do cliente vê + atualiza (fulfill) só os do seu cliente.

UI no `tickets.$id`:
- **Admin**: botão *"🔒 Pedir credencial"* abre dialog (tipo + nota) → insert em `ticket_credential_requests`
- **Cliente admin**: vê cartão na timeline com estado pendente e botão *"Fornecer com segurança"* → modal com formulário de credencial → server function cria a credencial (encriptada) e marca request como fulfilled
- **Ambos**: cartão muda para "✅ fornecida em [data]"

## 6. Emails

- Notificação ao admin quando credencial é fornecida: *"Cliente forneceu a credencial pedida no ticket #X"* — nunca incluir o valor
- Notificações de novo comentário continuam normais (cartões de credencial não geram email de comentário)

## Técnico

**Migrações**:
- `ALTER TABLE ticket_credenciais` — substituir `password TEXT` por `password_encrypted BYTEA`
- `CREATE EXTENSION pgcrypto`
- `CREATE TABLE ticket_credential_requests (...)` + RLS
- Trigger `trigger_delete_credentials_on_close` em `tickets`

**Secret**: `CREDENTIALS_ENCRYPTION_KEY` (pedir ao user)

**Server functions** (novos `src/lib/credentials.functions.ts`):
- `addTicketCredential({ ticketId, tipo, utilizador, password, notas })`
- `getTicketCredentials(ticketId)` — devolve com password desencriptada
- `deleteTicketCredential(id)`
- `requestCredential({ ticketId, tipo, nota })`
- `fulfillCredentialRequest({ requestId, utilizador, password, notas })`

**Componentes**:
- `CredentialsCollapsible.tsx` (reutilizado nos dois formulários de criação)
- `CredentialRequestCard.tsx` (cartão da timeline)
- `RequestCredentialDialog.tsx` (admin)
- `FulfillCredentialDialog.tsx` (cliente)
- Atualizar `src/routes/tickets.novo.tsx` (ambos os forms)
- Atualizar painel de credenciais existente em `tickets.$id` para usar server functions

**Ficheiros principais alterados**:
- `src/routes/tickets.novo.tsx`
- `src/routes/tickets.$id.tsx`
- `src/lib/credentials.functions.ts` (novo)
- `src/components/CredentialsCollapsible.tsx` (novo)
- `src/components/CredentialRequestCard.tsx` (novo)
- 2 migrações SQL

## Ordem de implementação

1. Pedir secret `CREDENTIALS_ENCRYPTION_KEY`
2. Migração 1: pgcrypto + alterar `ticket_credenciais` + trigger de auto-apagar
3. Migração 2: criar `ticket_credential_requests` + RLS
4. Server functions de credenciais
5. Componente `CredentialsCollapsible` + integrar nos dois formulários
6. Refatorar formulário do cliente (sistema/impacto/título auto)
7. Cartão de pedido + dialogs no `tickets.$id`
8. Email de notificação de fulfilment