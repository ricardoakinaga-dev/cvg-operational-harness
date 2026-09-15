# PROD-20260913 — contrato das correções M1 (PROD-02/03/05/06)

- Programa: `PROD-20260913`; task-mãe: `PROD-01` (fechamento de mapa/contratos).
- Tasks cobertas: `PROD-02`, `PROD-03`, `PROD-05`, `PROD-06`. Gates: `G_SPEC` por task; autorização desta rodada: correções locais reversíveis, dados sintéticos, bancos descartáveis.
- Referências: [plano executivo](../PLANO_EXECUTIVO_PRODUCAO.md) §Governança; [auditoria 0560](../04_audit/0560_docs_implementation_audit_2026-09-13.md) achados D13-01/02/04/06; [backlog consolidado](../BACKLOG_PRODUCAO.md) seções PROD-02/03/05/06.
- Estado do candidato: working tree sobre `512bc11e80fbf7c7b8baf6263aacc811ff829309`; 2.525/2.531 arquivos idênticos ao manifesto da auditoria, 0 fontes de produto alteradas (`PROD-01/baseline-drift.json`). Os negativos abaixo foram reproduzidos nesta rodada antes de qualquer correção.

## Regras comuns

1. Nenhuma capacidade real nova: confirmação/cancelamento/reagendamento reais continuam negados; nenhum canal/provider/IdP/egress; nenhum dado real.
2. Mudanças pequenas e reversíveis; preservar alterações preexistentes de outros autores; não tocar em migrations existentes (`0012`/`0013`/`0014`), lockfile, certificados ou `server.ts` fora do escopo declarado.
3. Cada task entrega: negativo reproduzido antes, positivo depois, regressão da fronteira (HTTP/worker/SQL/UI), evidência sanitizada, diff, comandos/exit codes e rollback.
4. Builder não aprova o próprio trabalho; revisão independente julga o candidato e o integrador fecha.
5. `NOT_RUN`/`SKIP` obrigatório não satisfaz critério.

## PROD-02 — atomicidade entre mutação de jornada e auditoria

### Contrato (WHAT)

Toda mutação pública do `PostgresJourneyRepository` que grava estado e/ou evento de auditoria (`createOwnerDraft`, `createPatientDraft`, `linkPatient`, `createAppointmentDraft`, `createJourneyTask`, `recordHandoff`, e expirações lazy executadas em leituras) roda em uma transação curta na mesma conexão tenant-scoped. Falha de auditoria ou de qualquer passo reverte a mutação; retry com a mesma `idempotencyKey` produz exatamente uma mutação e um evento.

### Implementação (HOW)

- Novo helper `withTenantTransaction(pool, tenantId, operation)` em `packages/persistence/src/tenant-scoped-postgres.ts`, derivado de `withTenantContext`: `BEGIN` → contexto de tenant (`set_config('cvg.tenant_id', …, false)`) → operação → limpeza do contexto verificada → `COMMIT`; em erro: `ROLLBACK`, limpeza e destruição da conexão se a limpeza falhar (não devolver conexão com contexto sujo ao pool). `withTenantContext` permanece inalterado para os demais consumidores.
- `PostgresJourneyRepository` passa a usar `withTenantTransaction` nos métodos mutantes listados e nas leituras que expiram drafts lazy (para que expiração e retorno sejam atômicos); apenas `findAvailableSlots`, sem banco, permanece puro.
- Sem `BEGIN`/`COMMIT` em torno de I/O externo; nenhuma mudança de schema/migration.

### Negativo → positivo

- Negativo (reproduzido em `PROD-01/sql-atomicity-probe.ts`): trigger que rejeita `INSERT` em `audit_events` deixa `journey_owner_drafts = 1` e replay sem evento (`FAIL_PARTIAL_STATE`).
- Positivo exigido: com o mesmo trigger, contagem de drafts = 0, erro estável; removido o trigger, replay cria 1 draft e 1 evento de audit; concorrência com mesma chave continua única.

### Testes e fronteira

- `packages/persistence/src/__tests__/journeys-postgres.test.ts`: casos novos de rollback (falha injetada em audit), replay pós-falha e concorrência com duas conexões; paridade memória/PostgreSQL preservada.
- `apps/api/src/__tests__/journeys-api-postgres.test.ts`: rota HTTP autenticada → falha de audit → nenhum draft persistido; retry → um draft + um evento.
- Regressão: `TEST_DATABASE_URL=<descartável> npm run test:postgres`; `npm run typecheck`; `npm run lint`.

### Aceite

- Falha de audit deixa zero alteração parcial; retry produz uma mutação e um audit; TTL, tenant, idempotência, aprovação bloqueada e paridade HTTP preservados.

### Rollback

- Reverter somente o diff de PROD-02 (helper + chamadas + testes). Dados de teste vivem em banco descartável; nenhuma migration para reverter.

## PROD-03 — invalidação de continuações da UI por identidade/geração

### Contrato (WHAT)

`JourneysPanel` vincula cada operação assíncrona a uma geração de identidade (operador+role+tenant) e a uma sessão de transporte. Troca de identidade/sessão invalida resultados e erros atrasados: nenhum dado, `busy` ou mensagem da identidade anterior pode reaparecer sob a nova. A autorização backend não muda.

### Implementação (HOW)

- `apps/web/src/features/journeys/index.tsx`: contador de geração em `useRef`, incrementado no `useEffect` de identidade; `AbortController` por geração; cada operação captura a geração e só aplica `setState`/erro/`busy` se a geração atual for a mesma; erros de abort são ignorados.
- `apps/web/src/api/client.ts`: parâmetro opcional `signal?: AbortSignal` nas operações de jornada usadas pelo painel, encaminhado ao `fetch`; compatível com chamadas existentes.

### Negativo → positivo

- Negativo (preservado): `AUD-20260913-DOCS/ui/race.cjs` mostra candidato do tenant A visível sob tenant B após resposta atrasada.
- Positivo exigido: mesma interceptação com resposta atrasada mantém a tela sem dados de A; log/evidência do probe reexecutado; teste unitário equivalente em `apps/web/src/__tests__/journeys-identity-race.test.tsx` com promises controladas (sucesso e erro fora de ordem).

### Testes e fronteira

- Novo teste React (jsdom, Testing Library) A→B com resposta de sucesso e de erro resolvidas depois da troca.
- Reexecução do probe Chromium `ui/race.cjs` adaptado ao candidato corrigido (portas próprias) com resultado `staleTenantCandidateVisible=false`.
- Regressão: `npm test` nos paths de web; `npm run typecheck`; `npm run build:web`.

### Aceite

- A→B, logout e troca de sessão com respostas fora de ordem não repõem dados/estado/mensagens de A; nenhuma alteração de autorização backend.

### Rollback

- Reverter somente o diff de PROD-03 (painel, cliente, teste). Nenhum estado persistido.

## PROD-05 — validação de papel/políticas SQL no bootstrap do worker

### Contrato (WHAT)

Antes do primeiro claim do worker PostgreSQL, o processo consulta o banco e rejeita papel superuser/BYPASSRLS/createdb/createrole/replication, membro de outro papel, dono do banco, dono das tabelas monitoradas, schema ausente ou RLS/FORCE ausente. Flag de ambiente não substitui a consulta. Contexto de tenant não vaza entre erros e reutilização do pool.

### Implementação (HOW)

- Novo módulo `apps/worker/src/postgres-role-preflight.ts` exportando `assertPostgresWorkerPreflight(pool, options)`:
  - consulta `pg_roles` para o `current_user` (superuser/BYPASSRLS/createdb/createrole/replication), `pg_auth_members` (memberships) e `pg_database` (dono do banco);
  - consulta `current_schema()`, `pg_class`/`pg_namespace` para `outbox_events` e journal de efeito (RLS + FORCE, runtime não é owner) e `has_table_privilege` mínimo do worker (SELECT/INSERT/UPDATE; sem DELETE/TRUNCATE/TRIGGER/REFERENCES em `outbox_events`);
  - executa as consultas com contexto de tenant explícito na mesma conexão (`set_config`), verifica que `current_setting('cvg.tenant_id', true)` está vazio antes de devolver a conexão e destrói a conexão (`release(error)`) quando a limpeza falha ou não é verificada.
  - mensagens de erro sanitizadas e estáveis (sem URL, segredo ou payload).
- `apps/worker/src/main.ts` aguarda o preflight em `runPostgresControlledWorker` e `runPostgresContinuousWorker` antes de `drain`/`start`. Factories síncronas permanecem para compatibilidade; a composição de produção (D01/AAA-21) herdará o preflight.

### Negativo → positivo

- Negativos com roles reais em banco descartável: superuser → erro; `BYPASSRLS` → erro; dono do banco/tabela → erro; schema/tabela ausente → erro; contexto vazio após erro.
- Positivo: papel mínimo válido (sem privilégios extras, não owner, com RLS/FORCE e grants mínimos) inicia e o worker consome um evento sintético.

### Testes e fronteira

- `apps/worker/src/__tests__/postgres-role-preflight.test.ts` (PostgreSQL real descartável, roles criadas na hora) cobrindo a matriz acima e a limpeza de contexto.
- `npm run test:worker:startup`; `TEST_DATABASE_URL=… npm run test:postgres`; integração `continuous-worker-postgres.integration.test.ts` permanece verde.

### Aceite

- Superuser/BYPASSRLS/owner indevido/schema ausente impedem consumo; papel mínimo válido inicia; contexto limpo após erro e reutilização do pool.

### Rollback

- Reverter somente o diff de PROD-05 (módulo, chamadas em `main.ts`, teste). Nenhum schema/migration alterado.

## PROD-06 — ator e correlação reais na auditoria da jornada

### Contrato (WHAT)

Eventos de auditoria de jornada identificam o ator autenticado (tipo/id), o tenant e o `correlationId` da chamada HTTP original. Corpo da requisição não tem autoridade sobre ator/correlação. Chamadas internas sem identidade registram ator de sistema explícito (`system.journey-repository`), sem simular humano. A auditoria continua atômica com a mutação (PROD-02).

### Implementação (HOW)

- `packages/persistence/src/journeys.ts`: tipo `JourneyAuditContext = { actorType: 'Operator' | 'System'; actorId: string; correlationId?: string }`; campo opcional `auditContext` nos inputs mutantes (`OwnerDraftInput`, `PatientDraftInput`, `AppointmentDraftInput`, `LinkPatientInput`, `CreateJourneyTaskInput`, `RecordHandoffInput`). Sem contexto, usar `System`/`system.journey-repository` e correlação derivada estável (sem alegar chamada).
- `journeys-postgres.ts`: `appendJourneyAuditScoped` recebe o contexto e grava `actor_type`, `actor_id`, `correlation_id` do contexto (validando formato de correlation via `CorrelationIdSchema`); `actor_type` continua restrito a `'Operator' | 'System'` como hoje.
- `journeys.ts` (memória): mesma semântica para paridade.
- `apps/api/src/server.ts`: nas rotas mutantes de jornada, montar `auditContext` a partir da identidade resolvida (`identity.operatorId`, role→tipo) e do `correlationId` gerado, e sobrescrever qualquer campo vindo do body (`{...body, tenantId, auditContext}`). Rotas de leitura sem mutação não geram evento.
- `apps/api/src/__tests__/journeys-api-postgres.test.ts`: HTTP autenticado → linha de audit com ator/tenant/correlação exatos; body com `actorId`/`actorType`/`correlationId`/`auditContext` injetados não altera o ator gravado; paridade memória/PostgreSQL.

### Aceite

- Evento identifica ator autorizado, tenant e correlação originais; actor/body adulterado negado/ignorado; auditoria atômica sob erro; timeline/consulta de audit localiza a chamada pelo `correlationId`.

### Rollback

- Reverter somente o diff de PROD-06 (tipos, repositórios, rotas, testes). Sem migration: `audit_events` já possui as colunas.

## Ordem de execução e serialização

1. `PROD-02` primeiro (mesma superfície de `PROD-06`: `journeys-postgres.ts`); `PROD-06` depois.
2. `PROD-03` (frontend) e `PROD-05` (worker) são independentes entre si e do par acima; não compartilham arquivos.
3. `server.ts` é tocado apenas por `PROD-06`, em janela exclusiva.
4. Nenhum gate de produção é concedido por este contrato; D01–D05 permanecem pendentes.
