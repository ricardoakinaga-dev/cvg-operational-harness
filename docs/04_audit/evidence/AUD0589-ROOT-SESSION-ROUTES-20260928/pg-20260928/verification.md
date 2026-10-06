# AUD-0589-PG — verificação PostgreSQL da sessão — 28/09/2026

## Resultado

`PASS_LOCAL_SYNTHETIC / INDEPENDENT_CRITIQUE_NOT_RETURNED / PRODUCTION_NO_GO`. A suíte completa do patch local de AUD-0589 passou em Node 22 com PostgreSQL obrigatório, sem skips.

## Candidato e ambiente

- Base: root `eff8e0d8974f2c3222eb4602e4a37ff73c708245`, em worktree destacado e removido após a execução.
- Para a suíte completa no worktree, copiei somente `operator-session-hook.ts` e `operator-session-public-routes.test.ts`; seus SHA-256 coincidiram com os arquivos atuais do root. O foco 27/27 em Node 22 rodou contra a árvore root atual. `server.ts` ficou no SHA `76a588fbc40640638ede9a6c0f79b0926b7750557a06e9f36659150482fc38fa`.
- Node `v22.23.2`; PostgreSQL container `postgres:16-alpine`, image ID `sha256:3c5c8892d184f738f4fe282d14ddaa613a38f00f4189d2d94725ebe6f2909ddb`, loopback `127.0.0.1:55511`. Database, tenants, roles e mensagens sintéticos; sem serviços externos.

## Execuções

| Gate | Resultado | Log |
| --- | --- | --- |
| `npm run test:postgres -- --reporter=dot` | 35 arquivos, 258 testes PASS, zero skips; 90,96 s | [log](test-postgres.log) |
| `operator-session-postgres.test.ts` com `AUD19_PG_REQUIRED=1` | 1 arquivo, 18 testes PASS; 6,16 s | [log](operator-session-postgres.log) |
| `postgres-conversation.integration.test.ts` com `PHASE4A_DISPOSABLE_PG=1` e `PHASE4A_PG_REQUIRED=1` | 1/1 PASS; 2,97 s | [log](phase4a-postgres.log) |
| Suíte completa no worktree com patch AUD-0589 e todos os guards PG | 326 arquivos, 2.401 testes PASS, zero skips; 331,72 s | [log](full-suite-patched-postgres.log) |
| Foco de sessão/identity/hook, Node 22 | 4 arquivos, 27 testes PASS | [log](focused-node22.log) |
| `npm run typecheck`, Node 22 | PASS | [log](typecheck-node22.log) |
| `npm run lint`, Node 22 | PASS | [log](lint-node22.log) |

A execução inicial da suíte com PostgreSQL antes de habilitar o guard Phase 4A teve 324 arquivos e 2.392 testes PASS, com um teste condicional pulado. O teste identificado foi executado depois com o guard obrigatório e passou; a execução final no candidato com o patch repetiu tudo e terminou com zero skips.

## Limites e limpeza

O teste dedicado de sessão valida o store PostgreSQL, roles, RLS, acesso por dois pools e revogação concorrente. Os testes HTTP do patch usam Fastify in-memory. A composição final de `buildServerFromEnv` com store PostgreSQL no root não foi exercitada, pois `apps/api/src/server.ts` permanece reservado à PR-L04. Não houve OIDC corporativo, staging, CI remoto, certificação, browser E2E desse SHA, dados reais, provider/canal externo, push ou deploy.

O container foi parado e removido; a porta 55511 ficou sem listener. O worktree e `node_modules` temporários foram removidos. Produção permanece `NO_GO`.
