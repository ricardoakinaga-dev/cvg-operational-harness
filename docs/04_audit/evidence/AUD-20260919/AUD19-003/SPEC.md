# SPEC — AUD19-003 — Atomicidade causal de aprovação

- programa: `AUD-20260919-REMEDIATION`; onda: `W1`; gate de entrada: `G1` ✅ +
  `AUD19-002` ✅.
- aprovação técnica: prompt humano de 2026-09-19 (autoriza PRD/SPEC/BUILD/AUDIT
  de `AUD19-001`–`016` em escopo local/sintético). Nenhuma decisão externa
  adicional: sem transação distribuída nova, sem serviço externo, sem dado real.

## Diagnóstico (F-05)

Rota `POST /v1/executions/:executionId/approvals/:approvalId/decision`
(`apps/api/src/server.ts:847-931`): autoridade decide → execução retoma →
auditoria anexa, em 3 chamadas distintas, sem unidade transacional. Falhas
caracterizadas (provas RED nesta task):

1. retry após `approve` → `invalid_state` (decisão não é idempotente);
2. retry após `resolve` → evento `approval_decision` duplicado ou perdido
   (o `append` é condicional ao estado obsoleto lido antes do `resolve`);
3. concorrência idêntica → dois eventos de auditoria (PG sempre INSERT).

## Decisão de desenho (ADR embutida)

Transação distribuída entre as 3 autoridades é impossível (stores memory sem
tx, pools distintos, multiprocesso). Alternativa escolhida: **convergent
idempotent unit** — cada passo idempotente sob retry + reconciliador dirigido:

1. `ApprovalEngine.approve/reject` (memory; PG delega ao mesmo engine sob
   `SELECT FOR UPDATE` + CAS): repetição do veredicto registrado pelo mesmo
   aprovador → no-op com sucesso, ANTES do relógio de expiração (nota é
   anotação e não bloqueia convergência); veredicto oposto ou aprovador
   diferente → `invalid_state` fail-closed, sem re-emitir evento.
2. `resolveApproval` memory + PG: já idempotentes (retornam current) — sem
   mudança, cobertos por teste.
3. Auditoria `approval_decision` exatamente-uma por
   (tenant, approvalId, decision): dedupe em `append` (memory: scan; PG:
   SELECT-then-INSERT) + migration `0021` com índice único parcial
   (transacional, `IF NOT EXISTS`, DO-block com NOTICE se legado duplicado) +
   handler de `unique_violation` → re-SELECT. Rota passa a anexar
   incondicionalmente (dedupe garante exatamente-um).
   Nível de convergência da rota: veredicto (contrato existente — repetição
   do mesmo veredicto retorna 202 sem mutação/duplicata, mesmo com outro
   atribuidor); veredicto oposto após decisão → `conflict`. Divergência de
   autor/motivo no `approve()` direto da autoridade → `invalid_state`
   fail-closed (protege o caminho CAS/FOR UPDATE).
4. `reconcileApprovalDecision({approvals, executions, audit, tenantId,
executionId, approvalId, actorId, decision, reason?})` em
   `packages/agent-core/src/approval-reconciliation.ts`: completa estados
   parciais via passos idempotentes; reporta `{reconciled, steps}`.
   Wiring em sweep periódica → `AUD19-008` (registrado, fora desta task).

## Critérios de aceite (congelados)

1. RED→GREEN: testes de caracterização falham antes, passam depois.
2. Fault injection em cada fronteira (pós-approve, pós-resolve, pré-audit):
   retry/route converge; exatamente-um evento; sem estado efetivo sem evento.
3. Concorrência idêntica (memory + PG descartável): um vencedor, um evento.
4. Repetição divergente → `conflict`, sem mutação silenciosa.
5. Propriedade de tenant no PG (defeito pré-existente encontrado pelos
   testes desta task: a rota nunca gravava auditoria no PG —
   `audit_events_tenant_id_not_null`): payload da rota passa a incluir
   `tenantId`; wrapper `createPersistence` (kind postgres) repassa o tenant;
   `appendAudit` não-isolado grava a coluna quando há escopo (ramo legado
   sem a coluna preservado para schema 0000). Caminho pool (`postgres-pool`)
   inalterado (já exigia claim de tenant).
6. Migration `0021` transacional, checksum-guard compatível, forward-fix por
   re-SELECT; ensaio de rollback = reverter compose (índice droppável) sem
   perda (índice não guarda dados).
7. `typecheck`, `lint`, `format:check`, `git diff --check` PASS.

## Arquivos (congelados)

- editados: `packages/approval-engine/src/engine.ts`,
  `packages/persistence/src/repositories/audit-repository.ts`,
  `packages/persistence/src/postgres.ts`,
  `packages/persistence/migrations/0021_approval_decision_audit_dedupe.sql` (novo),
  `packages/persistence/src/postgres.ts` (registro `0021`),
  `apps/api/src/server.ts` (anexo incondicional + comentário),
  `package.json` (`test:postgres` += novo arquivo PG);
- novos: `packages/agent-core/src/approval-reconciliation.ts`,
  `apps/api/src/__tests__/approval-decision-atomicity.test.ts`,
  `apps/api/src/__tests__/approval-decision-atomicity-postgres.test.ts`,
  `packages/approval-engine/src/__tests__/approval-idempotent-decision.test.ts`.

## Evidência

- `docs/04_audit/evidence/AUD-20260919/AUD19-003/`
