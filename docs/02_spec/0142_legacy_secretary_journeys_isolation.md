# 0142 — SPEC: isolar as jornadas tutor → pet → consulta da secretária

- ID: `SPEC-LEGACY-004`
- Estado: `SPEC_APPROVED_BY_USER` em 27/09/2026 ("aprovo pode seguir"); BUILD autorizado fatia a fatia
- Trilha: **T3** da [governança proporcional](../07_agents/AGENTS.md): muda a
  superfície pública de `@cvg/persistence` e a composição da API; exige revisão
  do usuário antes do BUILD.
- Task: PR-L04 de [0356](../03_build/0356_production_backlog_2026-09-26.md);
  frente FL, dona Claude Code ([coordenação](../08_runtime/agent_coordination.md)).
- Base: [inventário do legado](../../legacy/LEGACY_INVENTORY.md),
  [SPEC-LEGACY-001](0135_legacy_dead_packages_and_boundary.md) (fronteira de
  `legacy/`).

## Recon medido (27/09/2026, `d737b4a`)

| Camada                 | Onde                                                                                                                                                                                                                                                                               | Tamanho / uso                                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repositório em memória | `packages/persistence/src/journeys.ts`                                                                                                                                                                                                                                             | 998 linhas; `JourneyRepository`, `JourneyRepositoryPort`, tipos de draft, slots sintéticos                                                                            |
| Repositório PostgreSQL | `packages/persistence/src/journeys-postgres.ts`                                                                                                                                                                                                                                    | 1 148 linhas; `PostgresJourneyRepository` sobre `PostgresRuntimeRepository`                                                                                           |
| Exportação             | `packages/persistence/src/index.ts`                                                                                                                                                                                                                                                | `export *` dos dois módulos                                                                                                                                           |
| API                    | `apps/api/src/server.ts`                                                                                                                                                                                                                                                           | 10 rotas `/v1/journeys/*` (linhas 1687–2000), `journeyAuditContext`, opção `journeyRepository`, construção em `createPersistence` e `createPostgresJourneyRepository` |
| Web                    | `apps/web/src/features/journeys/`, 26 funções em `apps/web/src/api/client.ts`, `App.tsx`                                                                                                                                                                                           | Painel "Jornadas" no console                                                                                                                                          |
| Schema e inventários   | `migrations/0014_journeys.sql`, `db.ts` (coleções), `schema.ts`, `restore.ts`, `tenant-schema.ts`, `apps/api/src/tenant-preflight.ts`                                                                                                                                              | Tabelas `journey_owner_drafts`, `journey_patient_drafts`, `journey_appointment_drafts`                                                                                |
| Testes                 | `packages/persistence/src/__tests__/journeys*.test.ts`, `journey-task-atomicity.test.ts`; `apps/api/src/__tests__/journey*.test.ts`, `journeys-api-postgres.test.ts`; `apps/web/src/features/journeys/journeys.test.tsx`, `apps/web/src/__tests__/journeys-identity-race.test.tsx` | ~3 400 linhas                                                                                                                                                         |
| Gates e manifestos     | `package.json` (`test:postgres`), `scripts/skip-catalog.json`, `scripts/rem21-010-postgres-proof.ts`                                                                                                                                                                               | Caminhos de teste e nome da migration                                                                                                                                 |

Não fazem parte: a "journey" do Phase 4A (`tests/phase4a/service-desk-journey.test.ts`),
que é o fluxo de conversa neutro do harness.

## Decisão de desenho

O domínio vai para o pacote `@cvg/legacy-secretary-journeys`
(`legacy/packages/secretary-journeys`). A API o compõe só pelo ponto já
declarado, `apps/api/src/legacy-composition.ts`; a web, por um novo ponto
declarado, `apps/web/src/legacy-composition.tsx`.

**O schema fica.** A migration `0014` continua na cadeia, e os inventários que
validam o banco (`restore.ts`, `tenant-schema.ts`, `tenant-preflight.ts`,
`schema.ts`, coleções do `InMemoryDatabase`) continuam conhecendo as tabelas
enquanto elas existirem no banco. Removê-las exige migration de descarte,
backup e janela — isso é a PR-L11, depois da DL-05. Esses pontos ficam marcados
`LEGACY_SCHEMA_RESIDUE` no inventário.

## Fatias

### Fatia 1 — repositórios

1. Mover `journeys.ts` e `journeys-postgres.ts` (com `git mv`) para o pacote
   legado; os imports internos passam a vir de `@cvg/persistence` (tudo o que
   usam já é exportado).
2. `@cvg/persistence` deixa de exportá-los.
3. Mover os três testes de persistência de jornada; atualizar a lista do
   `test:postgres`, o `skip-catalog.json` e a exclusão de cobertura de
   `*postgres*.ts` para o novo caminho (mesmo denominador).
4. `createPersistence` da API passa a receber o repositório de jornadas pelo
   ponto de composição.

### Fatia 2 — rotas da API

1. As 10 rotas e `journeyAuditContext` viram um plugin
   (`registerSecretaryJourneyRoutes(app, deps)`) no pacote legado; `server.ts`
   chama o plugin uma vez, pelo ponto de composição.
2. URLs, códigos de erro, envelopes, RBAC, rate limit e auditoria idênticos: os
   testes de API de jornadas continuam em `apps/api` sem mudança de asserção.

### Fatia 3 — console web

1. Mover `features/journeys` e as funções de jornada do `client.ts` para o
   pacote legado (módulo React); `App.tsx` recebe o painel pelo ponto de
   composição da web, declarado em `LEGACY_COMPOSITION_POINTS`.
2. Ajustar resolução do Vite/vitest para o pacote legado; E2E e testes web sem
   mudança de asserção.

## Regras

1. R1 — comportamento idêntico: mesmas rotas, respostas, auditoria e
   persistência; nenhum SQL alterado; nenhuma migration nova.
2. R2 — o harness não importa o pacote legado (teste de fronteira); só os
   pontos de composição declarados.
3. R3 — cada fatia é um commit próprio com `typecheck`, `lint`,
   `format:check`, `npm test` com PostgreSQL, `test:postgres`, `test:e2e`
   (com claim, por regravar artefatos) e `build:runtime` + imagem verdes.
4. R4 — sem commit enquanto houver certificação do Codex em andamento com
   insumos congelados.

## Critério de pronto

`git grep` por `JourneyRepository|/v1/journeys|features/journeys` fora de
`legacy/` e dos pontos de composição retorna só os resíduos de schema
listados; testes, E2E, `test:postgres` e imagem verdes; inventário atualizado.
