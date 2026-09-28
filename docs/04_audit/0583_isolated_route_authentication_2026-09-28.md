# AUD-0583 — inventário e negação de rotas sem sessão

- Data: 28/09/2026.
- Escopo: candidato isolado limpo `7ef74e7f4fd2b1141e416b85c7337f119e1333ab`,
  Node 22.23.2, `NODE_ENV=development`, OIDC local sintético e store de
  sessão em memória. Nenhum dado real, IdP externo, PostgreSQL, push ou deploy.
- Evidência reproduzível: [script, árvore de rotas, três resultados e hashes](evidence/AUD0583-ROUTES-20260928/summary.json).
- Revisões independentes: [estática I1](evidence/AUD0583-ROUTES-20260928/I1-static-review.md)
  sem bypass confirmado e [crítica I2](evidence/AUD0583-ROUTES-20260928/I2-review.md)
  `ACCEPT_SCOPE` após correção de três P2 de redação.
- Veredito: `LOCAL_NO_SESSION_ROUTE_BOUNDARY_PASS / I2_ACCEPT_SCOPE`;
  produção `NO_GO`.

## Procedimento

O script conferiu HEAD e worktree limpo, construiu o Fastify com
`identityMode='trusted'` e OIDC local, listou a árvore de rotas e confirmou
cada rota/método por `app.hasRoute`. O inventário tem 63 templates, sendo
55 protegidos, e 111 pares rota/método, incluindo 35 pares `HEAD`. Executou
os 111 pares em cada cenário: sem `Origin`, com `Origin` permitido e com
`Origin` mais headers
legados falsificados (`x-operator-id`, papel Admin, tenant, token e Bearer).
Não enviou cookie de sessão em nenhum caso. `POST`/`PATCH` receberam `{}`
sintético; parâmetros de caminho receberam valores sintéticos.

Como controle positivo em cada rodada, uma sessão sintética válida de papel
Admin recebeu 200 em `GET /v1/session`, `GET /v1/tasks` e
`GET /v1/admin/agents`. Assim, a negação observada não decorre de um
servidor que devolve 401 para toda requisição.

Em cada uma das três rodadas, os **98 pares classificados como protegidos**
responderam 401; zero retornaram 2xx, 3xx, 4xx alternativo ou 5xx. O
inventário total por rodada teve 101 respostas 401, incluindo callback OIDC
sem state e webhook com payload vazio. A distribuição sem `Origin` foi
8×200, 101×401 e 2×403; com `Origin` e com spoof foi 10×200 e 101×401.
As rotas públicas de saúde/liveness/readiness e métricas retornaram 200
no perfil `development` arquivado. O endpoint de webhook é isento de sessão
de operador; esta prova não adjudicou sua assinatura nem o processamento
de payload válido.

O `POST /v1/session/logout` retornou 200 sem cookie quando o `Origin` era
permitido. O handler é idempotente: sem ID de sessão, não chama `revoke`,
limpa o cookie do próprio cliente e não concede acesso. O contador do store
registrou **zero revogações** nos três cenários. A leitura independente de
código encontrou esse comportamento como observação de baixa severidade,
sem bypass confirmado de rota de operador ou administrador.

## Limites e próximo gate

Esta prova testa a **recusa de requisições sem sessão**, não o sucesso
funcional dos 98 pares rota/método protegidos (55 templates), os
claims/roles de sessões válidas, a integração corporativa
`NODE_ENV=production`, o webhook assinado nem a persistência
PostgreSQL. O root tem SHA diferente e PR-L04 ainda detém API/web; repetir
no SHA integrado e no mesmo digest de staging, com IdP/IAM corporativo e
CI remoto, antes de qualquer decisão de release. As SPECs T3 0157/0158
seguem aguardando aprovação humana; produção permanece `NO_GO`.
