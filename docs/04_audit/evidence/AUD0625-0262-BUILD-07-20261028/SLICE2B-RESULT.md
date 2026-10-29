# 0262 BUILD — fatia 2b (runtime approval como unidade PG)

Commits (branch claude/aud0625-0257-07): d51a9456 (unidade), testes e91…/seguintes, rebind do skip-catalog.

- `PostgresRuntimeApprovalDecision` (persistence): autorização (FOR SHARE) → execução FOR UPDATE → approval FOR UPDATE → fase do engine em store destacado → CAS → `resolveApprovalInTransaction` → audit `approval_decision` (dedupe nativo) → COMMIT. Dono único: `runTenantMutationTransaction`.
- Fase de decisão com outcome OK / COMMIT_EXPIRED / rollback (`applyDecisionPhaseInTransaction`): expiração confirma só EXPIRED + expiredAt e relança o ApprovalError original depois do COMMIT; submit intermediário descartado; eventos coletados, não emitidos.
- Matriz de convergência §4.2 na unidade: sem chamar o engine, sem novo CAS/evento; causalidade ausente → 409 (uma coluna por vez); pares incompatíveis → 409; gap legado completa só o que falta com a decisão original.
- Rota: `runAuthorizedCaseMutation` com alvo `execution` (política na snapshot da unidade); memória roda toda a sequência dentro da fila; composição PG sem a unidade → 503; cliente compartilhado → 503 também para Supervisor (SPEC §4.1).
- Testes: `runtime-approval-unit-postgres.test.ts` 18/18 (R13/R15); migração de `approval-decision-atomicity-postgres` (pool; gaps legados criados por `leaveCrashedDecision`; novo teste de rollback total), `homolog-correlation`, `case-scope-tasks-approvals(-postgres)`, `postgres-persistence-mode` ajustados ao 503 do cliente compartilhado.
- Mutantes (mutations-0262-s2b.json): R1 R2 R3 R4 R5 R6 R9 mortos; R8 sobreviveu e foi morto depois (um teste por coluna de causalidade); R7 (reaplicar o engine em decisão convergida) é equivalente — a fase é no-op fora de REQUESTED/PENDING.
- Rebind skip-catalog: 14 entradas (hash + SKIP-PG-001 8→17); `npm run skip:governance` PASS; skip-inventory.json restaurado. mutation-manifest: nenhuma fonte coberta alterada.
- NÃO coberto em 2b: journey task (`createAuthorizedJourneyTask`, R06) fica para 2c; U04.

## 2c — journey task (R06)
- `PostgresJourneyRepository.createJourneyTask(input, { authorize })` roda a política na transação de criação (`runTenantMutationTransaction`); sem hook mantém `withTenantTransaction`. Rota `/v1/journeys/tasks` ganha `runAuthorizedTaskWrite` (API injeta `runAuthorizedCaseMutation`); memória roda na fila da autoridade.
- Testes: `journey-task-unit-postgres.test.ts` 2/2 (concedido cria; revogado nega sem task/audit; revogação durante a política espera), spy de memória em `case-mutation-unit-memory.test.ts`. Mutantes J1 (repo ignora authorize) e J2 (rota pula a unidade) mortos.
- Gates: typecheck 0, eslint 0, focado apps/api + packages/persistence + legacy journeys: 1061 passando / 260 pulados (sem banco); PG: 18+2+11+15 dos arquivos novos, mais os migrados (approval-decision-atomicity, homolog-correlation, case-scope-*-postgres, postgres-persistence-mode, production-bootstrap-postgres-own, case-assignment-authorization-postgres) passando com carga ≤10 (timeouts de 60 s em alguns arquivos só sob carga >13).
- Pendente para o fechamento da fatia 2: nenhum bloqueio de produto; a matriz 5xx do engine em memória segue o handler (sem tx única, SPEC §7).
