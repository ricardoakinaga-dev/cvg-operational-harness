# Handoff AAA-07 → AAA-09 (integração do runtime governado)

- Estado: `IMPLEMENTED_PENDING_INDEPENDENT_REVIEW`. Nada aqui autoriza BUILD de runtime/SQL; a migração é a próxima task.
- Pacote: `@cvg/approval-engine`. API legada `verifyAndConsume` continua existindo para consumidores atuais; o caminho governado deve usar a nova API até que AAA-09 remova o consumo precoce.

## Fluxo recomendado

```ts
// 1. solicitação (turno sem approvalId) — runtime cria a proposta e registra
const record = approvals.request({
  tenantId, operatorId, agentId, agentVersion,
  action, resource, payload: proposal.payload,
  policyVersion, promptVersion?, correlationId,
  proposalId, proposalHash, capability, dataClassification, proposalPayload
})

// 2. execução (turno com approvalId)
const reservation = approvals.reserve({
  tenantId, approvalId,
  action, resource, payload: proposal.payload, proposalHash,
  agentId, agentVersion, policyVersion, capability,
  reservationId?, ownerId?, ttlMs?
})
approvals.markExecuting({ tenantId, approvalId, reservationId: reservation.reservationId })

try {
  const effect = await effectJournal.reserve(operationKey)
  const result = await toolExecutor({ ...proposal.payload, operationKey })
  await effectJournal.confirmEffect(operationKey, executionRef)
  approvals.confirm({
    tenantId, approvalId, reservationId: reservation.reservationId,
    evidence: { outcome: 'effect_confirmed', executionRef, evidenceRef }
  })
} catch (error) {
  if (knownNoEffect(error)) {
    approvals.release({
      tenantId, approvalId, reservationId: reservation.reservationId,
      evidence: { outcome: 'no_effect', source: 'journal', evidenceRef }
    })
  } else {
    approvals.markUncertain({
      tenantId, approvalId, reservationId: reservation.reservationId,
      reason: 'ambiguous effect outcome'
    })
  }
}
```

## Recuperação

- Início de turno/varredura do worker: `approvals.releaseExpired({ tenantId, evidenceFor })` com `evidenceFor` lendo o journal durável. `no_effect` → `APPROVED`; ausente/ambíguo/erro → `UNCERTAIN`.
- Operador: `approvals.reconcile({ tenantId, approvalId, actorId, evidence })` — `effect_confirmed` → `EXECUTED`; `no_effect` → `FAILED`.
- Nunca chamar `verifyAndConsume` no runtime governado (condição `AAA03-R3-F02`); o `runtime.ts` atual faz isso e precisa migrar em AAA-09.

## Contratos de prova

- `EffectEvidence`: `no_effect {source, evidenceRef}`, `effect_confirmed {executionRef, evidenceRef}`, `effect_possibly_started {evidenceRef}`, `unknown {reason}`.
- Prova ausente/ambígua nunca libera retry; `release`/`fail` exigem `no_effect`; `confirm` exige `effect_confirmed`.

## Limites

- Store em memória + relógio injetável; durabilidade real é AAA-10/AAA-16.
- `executionCount` incrementa em `confirm`/`reconcile` confirmatório, não em `reserve`.
- `singleUse` continua sem nova reserva após `EXECUTED`/`FAILED`/`UNCERTAIN`.

## Geração/token e CAS (rework AAA07-C6)

- `ApprovalReservation.generation` identifica a geração da reserva. A mesma reserva ativa (mesmo token) retomada devolve a mesma geração; cada nova reserva incrementa a geração e recebe token novo.
- Todas as mutações (`markExecuting`, `confirm`, `release`, `fail`, `markUncertain`, `reconcile`) e o sweep fazem compare-and-set com **identidade + geração no ponto da mutação**; uma credencial de geração anterior nunca autoriza a geração atual.
- `reservationId` **não** é chave de idempotência: reutilizar explicitamente um token já gasto retorna `reservation_reused`. Para repetir a operação, faça nova reserva (token/geração novos).
- O sweep por TTL usa snapshot + CAS: se o callback `evidenceFor` liberar/confirmar a reserva e criar outra, o sweep não muta a nova reserva, não conta e não emite evento. Não execute o efeito dentro de `evidenceFor`; o callback deve apenas consultar o journal.
- Erros esperados no caminho governado: `already_reserved`, `reservation_expired`, `reservation_mismatch`, `reservation_reused`, `uncertain`, `invalid_proof`.
