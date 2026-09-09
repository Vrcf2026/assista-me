# Correção definitiva do erro recorrente ao abrir o projeto

## Objetivo
Impedir que pedidos cancelados pelo preview sejam tratados como falhas da aplicação, sem esconder erros reais.

## Alterações
1. Ligar explicitamente a entrada personalizada do servidor na configuração do projeto; atualmente o ficheiro de proteção existe, mas não é executado.
2. Substituir essa entrada por um invólucro compatível com a versão atual, carregado de forma segura e capaz de distinguir cancelamentos (`aborted`/`ECONNRESET`) de falhas reais.
3. Adicionar tratamento global de pedidos e uma página de recuperação independente para erros verdadeiros, mantendo o registo completo do erro.
4. Integrar a recuperação na raiz da aplicação, em português, sem alterar páginas, dados ou aparência normal.

## Verificação
- Reiniciar o servidor várias vezes e testar `/`, `/login` e a árvore de rotas.
- Simular ligações interrompidas e confirmar que não geram erro 500 nem ecrã branco.
- Confirmar que erros reais continuam visíveis e recuperáveis.
- Executar os testes existentes e verificar o login no navegador.
