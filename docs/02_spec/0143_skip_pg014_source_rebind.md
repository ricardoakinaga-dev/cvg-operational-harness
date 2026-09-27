# SPEC-PR003-003 — reconciliar SKIP-PG-014

- Trilha: T2, vínculo de evidência sem mudança de contrato ou runtime.
- Task: PR-003, fatia `AUD-0579-SKIP-014`, no [backlog 0356](../03_build/0356_production_backlog_2026-09-26.md).
- Estado: `SPEC_READY / BUILD_WAITING_FOR_PATH_CLAIM`. `scripts/skip-catalog.json` está no claim ativo PR-L04 de Claude Code. Esta SPEC não libera edição concorrente nem certificação.

## Recon

`npm run skip:governance` falhou em 27/09/2026 com `skip_catalog_source_drift:apps/worker/src/__tests__/operational-harness-homolog.integration.test.ts`. O catálogo guarda `sourceSha256=207335c6a6f3d7e4f016283c31ac8c46d66f4d9bce6edb8d3ac7eb86e53c9617`; o arquivo no commit `5c0b791` tem SHA-256 `a27d2fdafecdc5510d91ae6dfbec7123f8bfe795a1621528852b21533421140e`.

O commit `a67726b` trocou uma espera fixa de 1,5 s pela observação de `worker.homolog_health` antes do SIGTERM. O gate condicional continua `describeWithPostgres` e `expectedSkippedTests` continua 3. A suíte PostgreSQL passou nesta rodada: 35 arquivos/258 testes, incluindo o arquivo afetado. O catálogo rejeita a nova fonte pelo hash, corretamente.

## Regra e critério de pronto

1. Depois da liberação de `scripts/skip-catalog.json` pela PR-L04, verificar o SHA-256 corrente do teste e inspecionar novamente a diferença para confirmar que a condição de skip e os três testes não mudaram.
2. Atualizar **somente** `sourceSha256` de `SKIP-PG-014` para o hash corrente. Se PR-L04 alterar o teste ou os skips, reavaliar a SPEC e o catálogo antes do BUILD.
3. Verificar `skip:governance` exit 0, `typecheck`, `lint`, `npm test`, `test:postgres` e E2E em Node 22 com PostgreSQL descartável, conforme T2. Registrar os resultados no backlog e nos ledgers. Reemitir certificação apenas no candidato integrado e congelado.

Nenhum threshold, skip ou teste deve ser removido para obter verde. O hash antigo e a falha observada permanecem em [AUD-0579](../04_audit/0579_current_candidate_deep_audit_2026-09-27.md).
