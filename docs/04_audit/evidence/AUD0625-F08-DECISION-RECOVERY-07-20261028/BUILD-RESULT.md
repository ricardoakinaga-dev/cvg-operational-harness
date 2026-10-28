# AUD0625-F08-BUILD-07-20261028 — resultado

Estado da SPEC 0272: **IMPLEMENTED_LOCAL** (opção A, BUILD T3 local e sintético; recibo `USER-DECISIONS-20261028/human-decisions-3.json`). A SPEC não foi alterada (sha256 `78b43491…`); o estado fica aqui.

Mudança
- `packages/agent-core/src/approval-reconciliation.ts`: aceita `RESERVED/EXECUTING/EXECUTED` (`ADVANCED_APPROVED_STATUSES`) só para a decisão `APPROVED`; nesses estados não chama `resolveExecution` (passo `execution:skipped_advanced`); estado posterior com `REJECTED` continua recusado ("decision mismatch").
- `apps/worker/src/homolog-worker.ts` (`reconcileStuckApprovalDecisions`): seletor inclui `APPROVED, RESERVED, EXECUTING, EXECUTED, REJECTED`; `decision` = `REJECTED` só para REJECTED, senão `APPROVED`; `NOT EXISTS` por approvalId+decision inalterado.
- Marcador do payload recuperado (risco 1 da SPEC): `recovered: true` e `observedApprovalStatus: <status>`. A API segue escrevendo `previousState/nextState`; o evento recuperado não os conhece. A dedupe do índice 0021 não olha o payload, então o marcador não afeta o unique.
- Testes: os 4 `it.fails` viraram `it`; a caracterização "decision mismatch" foi trocada por teste de "não retoma e marca recuperado"; o controle do seletor foi ajustado ao novo SQL; 3 testes PG novos em `apps/api/src/__tests__/approval-decision-atomicity-postgres.test.ts` (crash do append + avanço para cada estado + dois ticks concorrentes do worker => 1 evento, estado da execução inalterado).

Campanha PG (PostgreSQL 16.15 descartável, contêiner `claude-07-f08-pg`, 127.0.0.1:55985, removido ao fim): arquivo inteiro 11/11 (`pg-campaign.txt`); sem a correção os 3 testes novos falham, 8 pulados pelo filtro (`pg-red-without-fix.txt`).

Gates (Node v22.23.2): typecheck 0; lint 0; vitest agent-core + apps/worker + apps/api 115 arquivos ok, 1006 testes ok; `npm test` completo (`build-npm-test.txt`): 495 arquivos ok, 28 pulados, 7109 testes ok, 251 pulados, **1 falha** em `tests/claude100/reference-port/controller.test.js` ("blocks configuration mismatch…", timeout de 15 s sob carga). Arquivo e dependências não tocados; reexecutado 2 vezes isolado: 50/50 ok. Tratado como flake de tempo; não é do escopo.
Não rodados: E2E.
