# SPEC — AUD19-005 — Preflight RLS do schema tenant-scoped completo

- programa: `AUD-20260919-REMEDIATION`; onda: `W1`; gate: `G1` ✅ + `AUD19-002` ✅.
- aprovação técnica: prompt humano de 2026-09-19; escopo local/sintético,
  reversível, fail-closed. Uma migration aditiva pequena (`0022`); sem dado
  real, sem serviço externo.

## Diagnóstico (F-07)

`tenantIsolationTables` (`server.ts:4412`) cobre 28 tabelas; o schema
(migrações `0000`–`0021`) contém 12 tabelas tenant-scoped sem cobertura
(mais `outbox_quarantine`, quarentena com ramo próprio — fora do inventário
de dados por desenho).
`channel_effect_journal`, `effect_journal`, `journey_owner_drafts`,
`journey_patient_drafts`, `journey_appointment_drafts`,
`operational_execution_steps`, `operational_execution_checkpoints`,
`cvg_conversation_sessions/messages/turns/execution_claims/deliveries`.
Agravantes: políticas `cvg_*` usam o nome fora do padrão (`*_tenant_policy`
vs `*_tenant_isolation` exigido pelo preflight); versões param em `0019`.

## Decisão de desenho

Inventário canônico + mundo fechado (sem parser SQL frágil):

1. `TENANT_SCHEMA_INVENTORY` em `packages/persistence/src/tenant-schema.ts`
   (novo, exportado): `{table, policy, expression: 'quarantined' |
'tenant-only'}` por tabela tenant-scoped. `server.ts` consome o
   inventário (substitui a lista hardcoded e a exceção de 4 tabelas por
   lookup de `expression`).
2. Migration `0022_conversation_policy_standardization.sql` (novo,
   transacional): `ALTER POLICY ... RENAME TO *_tenant_isolation` nas 5
   `cvg_*`; registrado em `defaultPostgresMigrations` e
   `tenantIsolationMigrationVersions` (+`0020`, `0021`, `0022`).
3. Estender constraints e indexes exigidos com os nomes exatos das novas
   tabelas (extraídos do catálogo vivo, nunca chutados).
4. Teste de mundo fechado (PG descartável): toda tabela com `tenant_id` no
   catálogo ∈ inventário; toda tabela do inventário tem RLS+FORCE+1
   policy exata+colunas; sem `BYPASSRLS`/superuser no papel de teste.
5. Negativos: schema sem `0014` → preflight falha; versão `0022` ausente →
   falha; papel sem SELECT numa tabela nova → falha de privilégio.
6. Compatibilidade: `appendAudit` não-isolado sonda a coluna `tenant_id`
   (cache por instância) — schema 0000-only legado preservado; composição
   server+schema-completo para writes além de auditoria (ex.: sessions) é
   gap conhecido → W2 (bootstrap/composição), registrado sem mascaramento.

## Critérios de aceite (congelados)

1. Remover qualquer tabela/policy/grant esperado faz o preflight falhar
   (prova por mutação de fixture, sem tocar migrações).
2. Catálogo PG completo passa sem skips (`AUD19_PG_REQUIRED`-gated).
3. `postgres-role-preflight` existente continua PASS.
4. `typecheck`, `lint`, `format:check`, `git diff --check` PASS.

## Arquivos (congelados)

- novos: `packages/persistence/src/tenant-schema.ts`,
  `packages/persistence/migrations/0022_conversation_policy_standardization.sql`,
  `packages/persistence/src/__tests__/tenant-schema-inventory-postgres.test.ts`;
- editados: `packages/persistence/src/postgres.ts` (registro `0022`),
  `packages/persistence/src/index.ts` (export),
  `apps/api/src/server.ts` (inventário + versões + constraints + indexes),
  `package.json` (`test:postgres` += novo arquivo).

## Evidência

- `docs/04_audit/evidence/AUD-20260919/AUD19-005/`
