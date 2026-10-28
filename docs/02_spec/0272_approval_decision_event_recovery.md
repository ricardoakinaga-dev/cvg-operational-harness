# 0272 — SPEC: recuperação do evento de decisão de aprovação depois que a execução avança (AUD0625 F08)

Status: `PROPOSED_FOR_HUMAN_T3_REVIEW`. Trilha T3: muda recuperação de evidência de decisão (auditoria) e o seletor do worker. Sem implementação, sem PG nesta rodada. Não duplica a SPEC 0257 (criação atômica de recurso de caso): 0257 §6 preserva o evento `approval_decision` de atendimento (`approvalRequestId`/`status`) e declara que ele **não** é o evento de decisão com `payload.approvalId/decision`, que é o tratado aqui.

## Recon (origin/main 8429019b)

- `apps/api/src/server.ts:1492-1531`: a rota de decisão chama `operationalExecution.resolveApproval` (libera a execução) **antes** de `audit.append` do evento `approval_decision` (comentário AUD19-003: o append é incondicional e deduplicado por tenant+approvalId+decision).
- `apps/api/src/server.ts:1446`: um retry do cliente aceita aprovação em `APPROVED|RESERVED|EXECUTING|EXECUTED` e refaz resume+append — a recuperação por retry existe, mas depende de o cliente voltar.
- `packages/agent-core/src/approval-reconciliation.ts:~90-95`: `if (approval.status !== input.decision) throw 'decision mismatch'`. Depois de a execução avançar, o status da aprovação deixa de ser `APPROVED` (vira `RESERVED/EXECUTING/EXECUTED`, `packages/approval-engine/src/engine.ts:402-442,691`), e a reconciliação recusa **antes** do `resolveExecution` e do `appendAudit`.
- `apps/worker/src/homolog-worker.ts:~133-160` (`reconcileStuckApprovalDecisions`): o seletor tem `a.status IN ('APPROVED','REJECTED')` e `NOT EXISTS` de evento por approvalId+decision. Uma aprovação que já avançou nunca é selecionada.
- Dedupe: migration 0021 (`uq_audit_approval_decision`, índice por tenant+approvalId+decision) torna o append idempotente.
- O envelope da decisão (`approverId`, `decisionActorType`, `decisionCorrelationId`, `decisionCommandKey`, `decisionReason`, `policyVersion`, `payloadHash`, `operationKey`) persiste na aprovação e não muda com o avanço da execução.

Sequência com defeito: decisão gravada → `resolveApproval` → **crash** → worker/execução avança (aprovação sai de `APPROVED`) → nenhum caminho automático grava o evento; ele fica ausente para sempre se o cliente não repetir.

## Invariantes

1. Toda decisão persistida (`APPROVED` ou `REJECTED`) acaba com exatamente um evento `approval_decision` por (tenant, approvalId, decision), qualquer que seja o estado posterior da execução.
2. Estado posterior nunca autoriza a decisão contrária: `RESERVED/EXECUTING/EXECUTED` só implicam `approved`; pedido de recuperar `rejected` nesses estados continua recusado.
3. A recuperação não produz efeito externo nem segundo resume de execução já avançada; replay do envelope é só leitura + append deduplicado.
4. Falha fechada se o envelope estiver incompleto ou a aprovação ainda for `PENDING/REQUESTED`.
5. O evento recuperado usa o ator, a correlação e a política do envelope persistido, nunca os do worker.

## Mudança proposta (opção A, recomendada)

1. `reconcileApprovalDecision`: aceitar `status ∈ {APPROVED, RESERVED, EXECUTING, EXECUTED}` quando `decision = APPROVED` e `status = REJECTED` quando `decision = REJECTED`. Chamar `resolveExecution` apenas quando `status === 'APPROVED'` (execução ainda pode estar esperando); nos estados posteriores só fazer o append, com `nextState` omitido ou lido da execução.
2. `reconcileStuckApprovalDecisions`: ampliar o filtro para `IN ('APPROVED','RESERVED','EXECUTING','EXECUTED','REJECTED')` e mapear a decisão com `CASE WHEN a.status = 'REJECTED' THEN 'REJECTED' ELSE 'APPROVED' END`; manter o `NOT EXISTS` por approvalId+decision e o `LIMIT`.
3. Questão aberta para a revisão: aprovações `FAILED/CANCELLED/EXPIRED` que tenham passado por `APPROVED` (a decisão existiu, mas o status final não a revela); propor derivar a decisão do envelope persistido (`approverId` presente + `decisionCommandKey`) em vez do status, em campanha própria.

Opção B (alternativa, maior): gravar decisão e evento na mesma transação PG. Elimina a janela, mas altera o contrato de persistência/ordem do `server.ts` e exige campanha PG de crash; não recomendada como primeiro passo.

## Critérios de pronto

- Testes de alvo, hoje `it.fails`, passam sem o marcador: `packages/agent-core/src/__tests__/aud0625-f08-decision-event-recovery.test.ts` (3 estados × crash/avanço/reconciliação) e `apps/worker/src/__tests__/aud0625-f08-stuck-selection.test.ts` (seletor inclui estados avançados); o teste de caracterização "decision mismatch" é removido/invertido.
- Controles continuam verdes: crash com status `APPROVED` converge; worker+retry concorrentes deixam 1 evento; `REJECTED`; estado posterior não autoriza decisão contrária; `PENDING` e envelope incompleto falham fechados.
- Campanha PG (fora desta rodada, com claim próprio): crash entre resume e append + avanço da execução + tick do worker → 1 evento; corrida worker × retry da API → 1 evento (índice 0021); sem evento duplicado em `REJECTED`.
- `npm run typecheck`, `npm run lint`, vitest de agent-core e apps/worker (Node 22).

## Riscos

- O evento recuperado pode divergir do emitido pela API (`previousState/nextState`); definir se o payload de recuperação marca `recovered` e como o hash/cadeia de auditoria trata isso.
- Ampliar o seletor aumenta o conjunto varrido a cada tick (`LIMIT 25`): avaliar índice/custo e ordenar por `updated_at`.
- A migration 0021 precisa estar aplicada para a dedupe; ver a SPEC 0271 (F15) sobre o pré-check.
- Estados terminais fora da lista (item 3) ficam sem recuperação até decisão.

## Testes e limites

Somente testes em memória (modelo com a mesma chave de dedupe da 0021) e um seletor verificado pelo SQL enviado a um pool falso; **nenhum PG foi executado**. Os testes de alvo não provam durabilidade nem a ordem real de commits.
