# AUD0625-F08B-BUILD-D9 — SPEC 0274 (F08b): decisão de aprovações FAILED/EXPIRED

Branch `claude/aud0625-f08b-df` (base `a69030d3f`), SPEC 0274 sha256 `69503d8a…` (não alterada). Aprovada pelo Ricardo ("como está", `human-decisions-5.json`). BUILD T3 local e sintético, Node 22.23.2, sem push, produção `NO_GO`.

## Mudança (§3)

- `packages/agent-core/src/approval-reconciliation.ts`: `ReconciliationApproval` ganha `approvedAt`/`rejectedAt`; novo `TERMINAL_DECIDED_STATUSES` (`FAILED`, `EXPIRED`). Nesses estados a decisão registrada vem dos timestamps (só `approvedAt` = APPROVED, só `rejectedAt` = REJECTED); nenhum ou os dois, ou pedido divergente, é `ApprovalReconciliationDataError`. Não há `resolveExecution`: o passo é `execution:skipped_terminal` e só o append deduplicado, com `recovered: true` e `observedApprovalStatus`.
- `apps/worker/src/homolog-worker.ts`: o seletor inclui `FAILED`/`EXPIRED`; a decisão (no `SELECT` e no `NOT EXISTS`) usa o `CASE` por timestamps (`REJECTED_DECISION`); `TERMINAL_UNDECIDED` exclui do lote (e da contagem de envelope incompleto) as linhas sem decisão coerente; nova `UNDECIDED_TERMINAL_COUNT_SQL` e o log `worker.homolog_reconcile_undecided_terminal` (`onUndecidedTerminal`). Piso, teto, `COALESCE` do índice, `ORDER BY` e `LIMIT` ficam iguais.
- `docs/runbooks/homolog-observability.md`: o novo log e que uma `EXPIRED` nunca decidida é comum.

## Provas

- **Fase 1 virou verde:** os 4 `it.fails` viraram `it` e passam, com os 3 controles; mais 8 testes novos do reconciliador (passos, ator/correlação/política do envelope, `rejectedAt` com pedido APPROVED, `FAILED` com `rejectedAt`, sem timestamp, envelope incompleto, estados antigos intactos). 15 testes no arquivo.
- **Pool interpretador estendido** (`aud0625-f08-stuck-selection.test.ts`): o interpretador lê o `CASE`, a exclusão e as duas contagens do SQL (somente a cláusula `NOT EXISTS` conta para o `CASE` da anti-junção). 7 testes novos; 45 no arquivo.
- **Mutações** ([mutations.txt](proofs/mutations.txt)): 15 de 15 mortas — reconciliador (conjunto vazio, aceitar ambos/nenhum, sem checagem de divergência, decisão invertida, retomar terminal, decisão pelo status) e SQL (lista de status, sem exclusão no lote, `CASE` só por status, `CASE` ignorando `approved_at`, janela da contagem, contagem de envelope incluindo não decididas, `=` virando `AND`, sem log, anti-junção só por status).
- **PostgreSQL 16.15 em contêiner próprio** (`claude-d9-f08b-pg`, carga ~8–13): 6 testes novos e o arquivo inteiro 22/22 ([pg-approval-decision-atomicity.txt](proofs/pg-approval-decision-atomicity.txt)):
  - `FAILED`/`approved`, `EXPIRED`/`approved` e `EXPIRED`/`rejected` com a decisão pela rota HTTP real (que grava `approved_at`/`rejected_at`), falha do audit, status movido para o terminal, dois ticks do worker e um retry da rota em paralelo: **1 evento** com `recovered: true`, execução não retomada e terceiro tick 0.
  - `EXPIRED` sem timestamp e com os dois: fora do lote, contada (`[1]`), sem falha de linha e a próxima linha (`FAILED` decidida) recuperada com `limit: 1`.
  - `EXPLAIN` do seletor em ~10 mil linhas (1/3 `FAILED`, 1/3 `EXPIRED`, 1/7 rejeitadas, 1/13 sem decisão): o plano continua usando `uq_audit_approval_decision` (22,6 ms natural, 10,1 ms com `enable_seqscan = off`) ([explain-f08b.txt](proofs/explain-f08b.txt)). Testes pesados com `180_000` ms explícitos.
- Gates (Node 22, `--maxWorkers=1/2`): ver `gates.txt`.

## Observações

- O teste de EXPLAIN da 0272 desta base não tem timeout explícito; a correção `63fc9862` (já na candidata do PR #32) dá 180 s a ele. Aqui ele passou na rodada completa com `--testTimeout=180000`.
- Uma `EXPIRED` nunca decidida é comum (pedido vencido sem resposta); o log `undecided_terminal` aparece a cada tick (5 s) enquanto houver alguma na janela de 24 h. O mesmo acontece com o de envelope incompleto. Se o ruído incomodar, reduzir para uma vez por mudança de contagem numa rodada própria.
- A fatia não corrige o F08e (REJECTED vencida vira EXPIRED), conforme a SPEC.
