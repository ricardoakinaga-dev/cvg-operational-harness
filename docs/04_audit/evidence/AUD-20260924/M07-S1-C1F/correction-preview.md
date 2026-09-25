# Preview do gate corretivo M07-S1-R1-C1F

O preview altera quatro paths: os três paths de policy/scanner/teste do scanner já incluídos no candidato C1E e o teste sintético conversacional. Os únicos paths de código/configuração editáveis no gate são:

1. `config/workspace-dependency-policy.json`: vincular `candidateBinding.npmVersionFilePath` a `docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/npm-version.txt`.
2. `scripts/workspace-dependency-audit.mjs`: vincular validação de candidate ao path npm C1F e permitir somente o diretório exato `M07-S1-C1F` como novo diretório de output, preservando os diretórios históricos e C1E; manter rejeição de caminho absoluto, traversal e symlink.
3. `tests/workspace-dependency-audit.test.js`: esperar o path npm C1F e provar aceitação de C1F, rejeição de nome parecido não aprovado, e as proteções existentes contra traversal/symlink; manter cobertura positiva de C1E e dos diretórios históricos.
4. `packages/conversation/src/__tests__/postgres-store.unit.test.ts`: no caso negativo `approvalId: 'different-approval'`, esperar rejeição `STATE_CONFLICT`; manter inalterado o resume autenticado com `approvalId: 'approval-synthetic'` que retorna `EXECUTE`.

O quarto item corrige somente a expectativa do teste. `assertExecutionClaimFresh` já rejeita um approval ID que não corresponde ao estado pendente. Nenhum código de produção ou contrato runtime será alterado.

Resultado textual esperado no teste conversacional:

```ts
await expect(waiting.store.claimExecution({
  scope, proposal: waitingProposal, turnId, executionId, expectedStateVersion: 0,
  approvalResume: {
    authenticated: true,
    approvalId: 'different-approval',
    proposalHash: waitingProposal.proposalHash,
    operationKey: waitingProposal.operationKey,
    executionId
  }
})).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
```

Este preview não autoriza qualquer outro path, alteração de implementação, manifesto, CI, thresholds, configuração Vitest, serviço, banco, rede, dado real, ação sensível ou produção.
