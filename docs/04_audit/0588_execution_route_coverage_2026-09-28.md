# AUD-0588 — cobertura HTTP das rotas de execução — 28/09/2026

- Veredito: `STATIC_SOURCE_REFERENCE_MATCHES_63_OF_63 / NEW_ROUTE_TESTS_2_OF_2 / I1_REVISE_RESPONDED / I2_ACCEPT_SCOPE / PRODUCTION_NO_GO`.
- Escopo: handlers explícitos em `apps/api/src/server.ts` no HEAD `eff8e0d8974f2c3222eb4602e4a37ff73c708245`; dados sintéticos em memória. O arquivo de handlers não foi alterado.
- [Inventário reproduzível e hashes](evidence/AUD0588-EXECUTION-ROUTES-20260928/route-inventory.json), gerados pelo [scanner](evidence/AUD0588-EXECUTION-ROUTES-20260928/route-inventory-scan.mjs).
- Revisão independente: [I1](evidence/AUD0588-EXECUTION-ROUTES-20260928/I1-independent-review.md) pediu estreitar a alegação do scanner; a [resposta](evidence/AUD0588-EXECUTION-ROUTES-20260928/I1-response.md) separa referências estáticas de testes executados.
- I2 [aceitou o escopo](evidence/AUD0588-EXECUTION-ROUTES-20260928/I2-independent-review.md) e pediu uma asserção mais estrita de redação; a [resposta](evidence/AUD0588-EXECUTION-ROUTES-20260928/I2-response.md) registra a correção e o reteste.
- [Prova resumida](evidence/AUD0588-EXECUTION-ROUTES-20260928/proof.json), [suíte root](evidence/AUD0588-EXECUTION-ROUTES-20260928/full-unit-suite.log), [snapshot das entradas](evidence/AUD0588-EXECUTION-ROUTES-20260928/full-suite-inputs.txt), teste focado e logs de typecheck/lint/formato.

## Inventário e achado

O scanner contou 60 declarações com path literal e três handlers de health cujos paths vêm de constantes, totalizando 63 pares explícitos método/rota. Encontrou 586 trechos fonte com chamadas `app.inject` e método/URL parseáveis. A correspondência normaliza parâmetros de rota, interpolação de template e query string. É um inventário **estático de referências**: não prova que a chamada é executada, que usa o servidor correspondente ou que cobre os ramos da rota. Antes deste claim, 61/63 handlers tinham referência estática correspondente; faltavam:

- `POST /v1/executions/:executionId/input`
- `GET /v1/executions/:executionId/trajectory`

O inventário atual encontra referências estáticas para 63/63. I1 observou o risco de falso positivo se uma chamada estiver em teste não executado ou usar outra instância; não encontrou um falso positivo concreto neste mapa. Somente os dois novos cenários têm execução diretamente demonstrada aqui: o arquivo focado passou 2/2. As 61 referências preexistentes não foram vinculadas a execuções nesta fatia.

## Regressões adicionadas

O novo [teste HTTP](../../apps/api/src/__tests__/execution-input-trajectory-api.test.ts), executado pelo Vitest, cobre:

- `POST .../input`: execução sintética em `WAITING_USER` retomada com `202`, estado `QUEUED` e mensagem persistida; tentativa do tenant divergente retorna `404` sem alterar o input aceito.
- `GET .../trajectory`: resposta contém apenas metadados estruturados e não inclui `observationRefs`; tenant divergente recebe `404`.

A leitura dos handlers confirmou que essas rotas exigem identidade/permissão e resolvem o tenant antes da consulta à store. Os testes usam `identityMode: simulation`, stores em memória e um sentinel para conferir a redação da trajetória; não validam OIDC, PostgreSQL ou toda a matriz de autorização. Nenhum defeito funcional foi reproduzido nesta fatia; o achado era ausência de teste HTTP direto para estes dois caminhos. A alteração ficou restrita ao arquivo de testes e às evidências.

## Verificação e limites

- Teste focado: 1 arquivo, 2/2 testes PASS.
- `npm test` no root: 306 arquivos/2.233 testes PASS, 20 arquivos/162 testes skipped por ausência de PostgreSQL. Essa execução começou antes de a asserção mais estrita da trajetória ser adicionada; hashes de `server.ts`, `package.json` e `vitest.config.mts` permaneceram iguais. O teste focado 2/2 foi repetido após a edição final.
- `npm run typecheck`: PASS.
- Prettier e ESLint no arquivo novo: PASS.
- `npm run format:check`, `npm run docs:check-links` (0 links quebrados e hygiene PASS) e `git diff --check`: PASS.
- A suíte completa executada não incluiu PostgreSQL nem E2E; os 162 skips limitam a conclusão. O scanner é estático e não substitui testes de branches ou auditoria de autorização em todas as combinações.
- Não houve PostgreSQL, IdP, provider ou canal externo nesta fatia. Sem push, deploy ou dados reais. Produção permanece `NO_GO` até os gates de integração, segurança, CI/atestação e staging descritos no plano de produção.
