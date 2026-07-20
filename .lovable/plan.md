## Fase 2 — Refactor de `src/routes/tickets.$id.tsx` (1934 linhas)

O ficheiro atual mistura carregamento de dados, UI, mutações e várias secções distintas. Vou dividi-lo em módulos coesos, mantendo comportamento **idêntico** ao atual — sem alterar SQL, RLS, emails ou fluxos.

### Estrutura alvo

```text
src/routes/tickets.$id.tsx           (~150 linhas: rota, layout, composição)
src/features/ticket/
  types.ts                            Interfaces (Ticket, Comment, Escalation, Attachment, ...)
  useTicket.ts                        Fetch ticket + client + realtime refresh
  useTicketComments.ts                Fetch/enviar/marcar-visto comentários
  useTicketAttachments.ts             Upload/listar/apagar anexos
  useTicketCredentials.ts             Pedir/fornecer/revelar credenciais
  useTicketPermissions.ts             isAdmin, isClientAdmin, canEdit
  components/
    TicketHeader.tsx                  Título, badges, ações (voltar, fechar, PDF)
    TicketMetaCard.tsx                Estado, prioridade, tipo, SLA, equipamento…
    TicketDescription.tsx             Descrição + editar
    TicketConversation.tsx            Feed de comentários + composer + credenciais
    CommentItem.tsx                   Bolha individual (interna/admin-only/normal)
    CommentComposer.tsx               Textarea + checkboxes + anexo + pedir credencial
    CredentialRequestDialog.tsx       Pedir credencial ao cliente
    CredentialProvideDialog.tsx       Cliente fornece credencial
    TicketCloseDialog.tsx             Fechar ticket (motivo, solução)
    TicketSidebar.tsx                 ClientInfoPanel + Tags + Tempo + Orçamentos
```

### Regras do refactor

- **Zero alterações de comportamento**: mesmos endpoints, mesmas queries, mesmos toasts, mesmos emails.
- **Zero alterações de base de dados**: nenhuma migração, nenhuma política nova.
- **Props explícitas** entre componentes; sem contexto novo salvo se estritamente necessário.
- Hooks encapsulam `useState` + `useEffect` + funções mutadoras da respetiva secção; devolvem `{ data, loading, actions }`.
- Ficheiros pequenos e focados (<300 linhas cada, salvo `TicketConversation`).
- Nomes/labels em português preservados tal como estão hoje.

### Ordem de execução (1 sessão, sequencial para reduzir risco)

1. Extrair `types.ts` e criar a pasta `src/features/ticket/`.
2. Extrair hooks (`useTicket`, `useTicketComments`, `useTicketAttachments`, `useTicketCredentials`, `useTicketPermissions`) — funções puras primeiro, sem tocar UI.
3. Extrair componentes de UI leves (Header, MetaCard, Description, Sidebar).
4. Extrair `TicketConversation` + `CommentItem` + `CommentComposer` + diálogos de credenciais.
5. Extrair `TicketCloseDialog`.
6. Reduzir `tickets.$id.tsx` a rota + composição.
7. Verificar build (`tsgo`) e clicar pelo ticket no preview para confirmar paridade.

### Riscos e mitigação

- **God component**: risco de partir estado partilhado. Mitigação: mapeio primeiro todos os `useState` e o consumidor de cada um antes de mover.
- **Realtime / refresh**: manter o mesmo `useEffect` de subscrição em `useTicket` para não perder listeners.
- **Emails**: preservar as chamadas `notify*` **exatamente** onde estão hoje (mesmo `if`, mesma ordem).

Se aprovares, arranco pelos passos 1–2 (types + hooks) numa primeira mensagem e depois os componentes numa segunda para conseguires validar por etapas.