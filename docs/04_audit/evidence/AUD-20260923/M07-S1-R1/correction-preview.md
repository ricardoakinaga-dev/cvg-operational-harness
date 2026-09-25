# Preview da correção — fixture de retomada de aprovação

Este é um preview revisável do ajuste no único path proposto. Não foi aplicado, compilado nem executado.

No teste `reports in-flight, expired, raced, approval-waiting and conflicting claims`, substituir a preparação de `waitingClaim`/`waiting` e usar `waitingProposal` nos três claims da seção de approval:

```ts
const waitingProposal = proposal({ status: 'PENDING_APPROVAL', requiresApproval: true })
const waitingApproval = {
  approvalId: 'approval-synthetic',
  proposalHash: waitingProposal.proposalHash,
  operationKey: waitingProposal.operationKey,
  executionId,
  requestedAt: now
}
const waitingMemory = {
  ...initialMemory,
  pendingProposal: waitingProposal,
  pendingApproval: waitingApproval
}
const waitingClaim = executionRow({
  status: 'WAITING_APPROVAL',
  approval_id: 'approval-synthetic'
})
const waiting = makeStoreFixture({
  session: sessionRow({ working_memory: waitingMemory }),
  turns: [turnRow()],
  claims: [waitingClaim]
})
```

Nas chamadas `waitingResult`, `mismatchedResume` e `resumed`, passar `proposal: waitingProposal`. Nos dois objetos `approvalResume`, usar `waitingProposal.proposalHash` e `waitingProposal.operationKey`; manter o resume autenticado positivo com `approvalId: 'approval-synthetic'`, `executionId` e sem `requestedAt`. Preservar o caso negativo com `approvalId: 'different-approval'` e a expectativa `WAITING_APPROVAL`; o caso válido deve continuar esperando `EXECUTE`.

A leitura de `assertExecutionClaimFresh` em `packages/conversation/src/state.ts` confirma que o resume exige `pendingProposal.status === 'PENDING_APPROVAL'` e igualdade de approval ID, proposal hash, operation key e execution ID entre a memória ativa e o resume autenticado. Esse estado faltava no fixture que gerou o `STATE_CONFLICT` registrado em R1. Esta correção prepara o double para o contrato existente; não relaxa nem altera código de produção.
