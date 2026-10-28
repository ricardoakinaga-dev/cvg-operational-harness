# SPEC0274 — Recuperar o evento de decisão de aprovações que terminaram em FAILED ou EXPIRED

R1, 28/10/2026. Task `AUD0625-F08B-DF-20261028`, follow-up AUD0625-F08b
(dono Claude DF) da [SPEC0272](0272_approval_decision_event_recovery.md),
achado F08 da [auditoria 0625](../04_audit/0625_repository_score_audit_2026-10-28.md).
Estado `PROPOSED_FOR_HUMAN_T3_REVIEW`. T3: recuperação de evidência de
decisão (auditoria) e seletor do worker. **Sem BUILD até revisão humana
explícita deste documento.**

## 1. Evidência atual

Base: branch `candidate/aud0625-wave-20261028` @ `a69030d3` (PR #32), que já
contém a 0272.

- A 0272 recupera o evento `approval_decision` de aprovações em `APPROVED`,
  `RESERVED`, `EXECUTING`, `EXECUTED` e `REJECTED`
  (`packages/agent-core/src/approval-reconciliation.ts:29–34` e
  `apps/worker/src/homolog-worker.ts:178–195`). A decisão é deduzida do
  status: `REJECTED` vira `rejected`, e o resto vira `approved` (`:194` e `:210`).
- Estados terminais que podem vir depois de uma decisão ficam de fora:
  - **FAILED** vem de `RESERVED`/`EXECUTING`, quando a execução falha
    (`packages/approval-engine/src/engine.ts`, `fail()`). Toda aprovação
    FAILED foi APPROVED antes.
  - **EXPIRED** vem de `expireStale()` (`engine.ts:1207–1234`), que expira
    também aprovações `APPROVED`, e da guarda `#assertNotExpired`
    (`engine.ts:1282–1301`). Em `verifyAndConsume` (`engine.ts:399–409`), essa
    guarda roda antes de conferir o status, então uma aprovação `REJECTED`
    vencida também pode virar `EXPIRED`. Pelo status, uma EXPIRED pode ter
    sido aprovada, rejeitada ou nunca decidida.
  - **CANCELLED** só sai de `REQUESTED`/`PENDING` (`engine.ts:340–388`). Nunca
    vem depois de uma decisão e fica fora desta SPEC.
- O registro guarda a decisão independentemente do status:
  `approvedAt`/`rejectedAt` (`approval-engine/src/contracts.ts:188–190`,
  colunas `approved_at`/`rejected_at` da migration 0015), gravados por
  `approve()`/`reject()` e preservados pelas transições seguintes
  (`...current`).
- Se o processo cair entre a decisão e o evento, e a aprovação terminar em
  FAILED ou EXPIRED, o evento de decisão fica ausente para sempre. É a lacuna
  que a 0272 registrou na §3 item 3.

## 2. Invariantes

1. Toda decisão persistida tem, ao final, exatamente um evento
   `approval_decision` por (tenant, approvalId, decision), inclusive quando a
   aprovação terminou em FAILED ou EXPIRED.
2. Para FAILED e EXPIRED, a decisão vem de `approvedAt`/`rejectedAt`, nunca
   do status. Sem nenhum dos dois, a aprovação nunca foi decidida e não há o
   que recuperar (erro de dado, isolado por linha). Com os dois, o registro
   é incoerente e também é erro de dado.
3. A recuperação nesses estados nunca retoma nem altera a execução: só lê e
   faz o append deduplicado, como nos estados avançados da 0272.
4. O pedido nunca autoriza a decisão contrária à registrada.
5. O evento recuperado mantém `recovered: true` e
   `observedApprovalStatus: <status>`, e usa o ator, a correlação e a política
   do envelope persistido.

## 3. Mudança proposta

### 3.1 Reconciliador (`approval-reconciliation.ts`)

- `ReconciliationApproval` ganha `approvedAt?: string` e `rejectedAt?: string`.
  O worker já entrega o registro inteiro (`homolog-worker.ts:319`), então não
  muda a porta.
- Novo conjunto `TERMINAL_DECIDED_STATUSES = { FAILED, EXPIRED }`. Nesses
  estados:
  - a decisão registrada é `APPROVED` se só `approvedAt` existir e `REJECTED`
    se só `rejectedAt` existir;
  - nenhum dos dois, ou os dois, dá `ApprovalReconciliationDataError`;
  - se o pedido divergir da decisão registrada, também é
    `ApprovalReconciliationDataError`;
  - não há `resolveExecution`: o passo registra `execution:skipped_terminal`
    e só faz o append.
- Os outros estados ficam exatamente como na 0272.

### 3.2 Seletor do worker (`homolog-worker.ts`)

- `status IN (...)` passa a incluir `FAILED` e `EXPIRED`.
- A decisão do seletor, no `SELECT` e no `NOT EXISTS`, passa a ser:
  `CASE WHEN a.status = 'REJECTED' OR (a.status IN ('FAILED','EXPIRED') AND
a.rejected_at IS NOT NULL AND a.approved_at IS NULL) THEN 'rejected' ELSE
'approved' END`.
- Uma condição exclui do lote as linhas FAILED/EXPIRED sem decisão coerente
  (nenhum timestamp ou os dois): `NOT (a.status IN ('FAILED','EXPIRED') AND
(a.approved_at IS NULL) = (a.rejected_at IS NULL))`. Elas também são
  contadas, como as de envelope incompleto (N1 da 0272), num log próprio
  `worker.homolog_reconcile_undecided_terminal`.
- Piso, teto, `COALESCE` do índice, `ORDER BY` e `LIMIT` ficam iguais.

## 4. Critérios de pronto

- [ ] FAILED com `approvedAt`: evento `approved` gravado uma vez, sem
      `resolveExecution` e com `recovered: true`.
- [ ] EXPIRED com `approvedAt`: evento `approved`. EXPIRED com `rejectedAt`:
      evento `rejected`.
- [ ] EXPIRED sem timestamps, ou com os dois: erro de dado isolado, e a linha
      seguinte é recuperada.
- [ ] Pedido divergente da decisão registrada: erro de dado.
- [ ] O seletor inclui FAILED/EXPIRED decididos, exclui e conta os não
      decididos, e não duplica quando o evento já existe. O pool
      interpretador da 0272 é estendido para o novo `CASE`.
- [ ] Passada PG com contêiner próprio: FAILED e EXPIRED reais, retry e
      worker concorrentes dão 1 evento, mais `EXPLAIN` do seletor.
- [ ] Gates com Node 22: typecheck, lint, vitest focado (agent-core,
      worker) e PG focado.

## 5. Testes

- Fase 1:
  `packages/agent-core/src/__tests__/aud0625-f08b-terminal-decision-recovery.test.ts`,
  com `it.fails` para FAILED e EXPIRED decididos, mais controles (EXPIRED não
  decidido e decisão divergente continuam sendo erro de dado).
- BUILD: o teste do seletor com o pool interpretador e a passada PG.

## 6. Fora de escopo e observação

- CANCELLED: nunca vem depois de uma decisão.
- **Observação, sem correção aqui:** `verifyAndConsume` expira uma aprovação
  `REJECTED` vencida (`engine.ts:399–409`), e a decisão terminal muda de
  status depois de tomada. Vale um cartão próprio, AUD0625-F08e, para decidir
  se REJECTED deve ser imune à expiração.

## 7. Decisões pedidas ao Ricardo

- **D1.** Derivar a decisão de FAILED/EXPIRED por `approvedAt`/`rejectedAt`.
  Recomendado: sim.
- **D2.** Incluir EXPIRED que veio de REJECTED, gerando um evento `rejected`
  recuperado. Recomendado: sim, porque a rejeição também é evidência humana.
