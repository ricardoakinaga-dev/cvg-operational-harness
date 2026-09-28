# AUD-0583 — revisão estática independente

- Crítico: Euler, 28/09/2026, leitura somente do candidato `7ef74e7`.
- Escopo: `server.ts`, hook de sessão OIDC, handlers e testes de rotas;
  nenhuma execução da sonda dinâmica e nenhuma alteração de arquivo.
- Veredito: nenhum bypass confirmado de rota protegida de operador ou
  administrador. OIDC confiável usa a sessão de cookie; headers/token
  injetados não constituem autoridade alternativa nesse modo.

## Observação de baixa severidade

`POST /v1/session/logout` pode retornar 200 `{ loggedOut: true }` sem cookie
de sessão quando o `Origin` é permitido. Sem cookie, o handler não chama
`revoke` e apenas limpa o cookie do cliente. Não concede acesso nem revoga
sessão de terceiros. O teste dinâmico registrou zero chamadas a `revoke`
nos três cenários sem sessão. O comportamento é idempotente; não há defeito
de segurança demonstrado nesta observação.

Health e início/callback OIDC são entradas públicas por desenho; o webhook
é isento de sessão de operador e depende de controles de inbound próprios.
O crítico não avaliou o funcionamento do IdP corporativo ou assinatura do
webhook nesta revisão estática.
