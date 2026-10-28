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

## Correções do REVISE da D9 (AUD0625-F08-FIX-07-20261028)

Revisão: `AUD0625-REVIEW-0272-D9-20261028` (5fee567b). A SPEC 0272 não mudou; as correções cabem na opção A (a SPEC já listava o custo do seletor como risco).

- **P2-1 (linha irrecuperável trava as demais):** `reconcileStuckApprovalDecisions` isola cada linha em `try/catch`; registra `worker.homolog_reconcile_row_failed` (`approvalId`, `reason`) e continua. Teste com duas linhas, a primeira sem envelope completo e a segunda recuperada (retorno 1).
- **P2-2 + P3-3 (custo do seletor e corrida com API lenta):** o seletor ganhou piso de espera `e.updated_at < now() - 30 s` e teto padrão de 24 h (`CVG_HOMOLOG_RECONCILE_MAX_AGE_HOURS`, `0` = sem teto para backfill avulso, documentado em `docs/runbooks/homolog-observability.md`). O `NOT EXISTS` passou a usar `COALESCE(audit.tenant_id,'') = COALESCE(e.tenant_id,'')`, a mesma expressão do índice `uq_audit_approval_decision`. A função recebe `{ limit, window, appendAudit, onRowFailed }` (as duas últimas, para teste); o tick usa a janela da configuração. Não medi o plano: a prova de custo da D9 (249 ms a 100 mil linhas; ~90 ms com janela de 1 h) vale, e a janela de 24 h só reduz o conjunto; sem PG nesta rodada.
- **P3-4 (testes do seletor):** o teste deixou de conferir trechos de SQL; um pool falso interpreta lista de status, piso, teto, condições do `NOT EXISTS`, `ORDER BY` e `LIMIT` sobre linhas em memória. Mutações no SQL de produção: decisão no `NOT EXISTS`, `ORDER BY`, `LIMIT` (as 3 sobreviventes da D9) mais approvalId, piso, teto, `EXECUTED`, `try/catch` e mapeamento REJECTED morrem (9/10). Sobrevive só a retirada do `COALESCE` de tenant: o interpretador não simula tenant (o isolamento vem de `e.tenant_id` + RLS); coberto pela campanha PG.
- **P3-5:** não implementado. Follow-up **AUD0625-F08b**: aprovações `FAILED`/`CANCELLED`/`EXPIRED` depois de `APPROVED`; dono DF.

PG: os testes de `approval-decision-atomicity-postgres.test.ts` passaram a chamar o worker com `{ window: { minAgeSeconds: 0, maxAgeSeconds: null } }` (sem piso, senão não recuperariam na hora). **Não foram reexecutados** nesta rodada (regra de carga: sem PostgreSQL/contêiner); a campanha 11/11 anterior (65cb22f0) vale para a lógica, e a nova assinatura/SQL precisa de uma passada PG quando a carga permitir.
