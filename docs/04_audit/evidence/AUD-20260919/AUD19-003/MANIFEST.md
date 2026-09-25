# Manifesto de verificação — AUD19-003

- task: `AUD19-003`; onda: `W1`; status: `VERIFIED`.
- runtime: Node `v22.23.2`; PostgreSQL descartável `postgres:16-alpine`
  (container `aud19-pg`, porta 5434, sintético).
- autorização: prompt humano de 2026-09-19 (gate `G0`); sem commit/push,
  sem produção.

## Diagnóstico confirmado (RED)

`engine-red.txt`: repetição idêntica de `approve`/`reject` lançava
`invalid_state` (2/4 testes falham antes do reparo; 2 fail-closed já passam).

## Reparos (causas estruturais)

1. `ApprovalEngine.approve/reject`: replay do veredicto pelo mesmo aprovador
   → no-op (antes da expiração); divergência → `invalid_state` fail-closed.
   Cobre memory e PG (adapter delega ao engine sob `SELECT FOR UPDATE`+CAS).
2. Auditoria exatamente-uma por (tenant, approvalId, decision): dedupe em
   `append` (memory + PG com handler de `unique_violation` → re-SELECT);
   migration `0021_approval_decision_audit_dedupe.sql` (transacional, índice
   único parcial, DO-block com NOTICE se legado duplicado; rollback = DROP
   INDEX sem perda).
3. Rota passa a anexar incondicionalmente (antes: gate em estado obsoleto
   perdia o evento no retry).
4. Defeito pré-existente encontrado e corrigido: a rota nunca gravava
   auditoria no PG (`audit_events_tenant_id_not_null`) — payload inclui
   `tenantId`, wrapper repassa escopo, INSERT não-isolado grava a coluna
   (ramo legado 0000 preservado).
5. `reconcileApprovalDecision` (`@cvg/agent-core`): convergência dirigida de
   estados parciais; sweep periódica → `AUD19-008`.

## Provas

| Prova                                                                                                                                                  | Resultado                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| engine idempotência (4 testes)                                                                                                                         | 4/4 PASS (era 2/4 RED)         |
| rota memory: crash pós-approve, pós-resolve, concorrência idêntica, veredicto oposto→409, reconciliador (7 testes)                                     | 7/7 PASS                       |
| store memory dedupe (3 testes)                                                                                                                         | 3/3 PASS                       |
| PG: migration 0021 + retry com 1 evento + concorrência com 1 evento                                                                                    | 3/3 PASS, `COUNT(*)=1` via SQL |
| PG sem env + `AUD19_PG_REQUIRED=1`                                                                                                                     | FAIL fechado (sem skip)        |
| regressão: approval-engine (109), agent-core (17), api approval/execution (24), persistence audit (12), PG migration/approval/execution/isolation (36) | todas PASS                     |
| `typecheck` / `lint` / `format:check` / `git diff --check`                                                                                             | PASS                           |

## Arquivos desta evidência

`SPEC.md`, `MANIFEST.md` (este), `engine-red.txt`, `memory-green.txt`,
`pg-green.txt`, `typecheck.txt`, `lint.txt`, `format-after.txt`,
`diffcheck.txt`, `node-version.txt`.

## Limitações declaradas

- Sweep periódica do reconciliador → `AUD19-008` (núcleo testado aqui).
- RLS/tenant-isolado (`postgres-pool`) não exercitado nesta task → `AUD19-005`.
- Produção `NO_GO`.
