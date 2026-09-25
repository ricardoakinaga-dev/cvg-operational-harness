# REM21-010 — SPEC aprovada para BUILD local

## Identidade

- contrato: `rem21-010-v1`;
- task: `REM21-010` / achado `A21-F07`;
- autorização: `G21-1`, somente local, sintético e descartável;
- status inicial: `SPEC_APPROVED_CONTROLLED_BUILD`.

## Runner

Criar `scripts/rem21-010-postgres-proof.ts`, chamado por
`npm run test:postgres:proof`. O runner deve:

1. iniciar duas instâncias PostgreSQL 16 Alpine nomeadas de forma única, ou
   operar com conexão explicitamente fornecida apenas quando o modo controlado
   exigir isso;
2. aplicar migrations `0000`–`0025` na source, criar somente os roles
   sintéticos e grants necessários, executar o workload e capturar um dump
   custom pré-`0026`;
3. aplicar `0026` na source, capturar o dump pós-roll-forward e restaurá-lo na
   target com `pg_restore`;
4. executar novamente o migration runner na target para provar idempotência;
5. restaurar o dump pré-`0026` em um banco descartável de rollback, verificar
   `0025`, aplicar `0026` e verificar `0026`;
6. re-restaurar o dump pré-`0026` e reaplicar `0026`, registrando a operação como
   rollback por backup + roll-forward, não como down-migration;
7. escrever um report JSON validado por
   `scripts/rem21-010-postgres-proof-contract.mjs`.

## Dados e workload

Tenant IDs, event IDs, correlation IDs, keys, payloads e relógio de journal são
fixtures fixas. O caminho de aplicação é `TenantScopedPostgresRuntimeRepository`:
API sintética enfileira, workers controlados fazem claim/ack, e o report lê o
registro pelo mesmo adapter após restore. `PostgresEffectJournal` e
`PostgresChannelEffectJournal` executam suas transições reais em contexto de
tenant.

## Integridade

O report compara, em forma normalizada:

- número e digest de cada tabela do schema;
- `relrowsecurity`, `relforcerowsecurity` e expressões de policies;
- roles sintéticos e privilégios de schema/tabela;
- rows/digests de `outbox_events`, `outbox_attempts`, `outbox_effects`,
  `effect_journal` e `channel_effect_journal`;
- leitura do tenant proprietário e ausência de leitura para outro tenant;
- digest antes/depois da corrupção intencional.

## Fail-closed

O contrato rejeita report incompleto, versão de Node fora de 22, qualquer claim
de RPO/RTO medido, `production=true`, corrupção não detectada, divergência de
candidate/run e estados de migration ou integridade diferentes de `PASS`.

