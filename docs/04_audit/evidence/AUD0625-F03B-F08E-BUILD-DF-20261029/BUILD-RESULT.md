# BUILD-RESULT — SPEC 0278 (F03b) e SPEC 0279 (F08e)

Task `AUD0625-F03B-F08E-SPECS-DF-20261029`, Claude DF (Opus), 29/10/2026.
Branch `claude/aud0625-f03b-f08e-df`, base `claude/aud0625-wave2` @ `e2a4d518`.
Implementação; a revisão independente fica com uma sessão não autora.
Produção `NO_GO`.

## Autorização

O Ricardo aprovou as duas SPECs por AskUserQuestion. O recibo é
[human-decisions-7](../USER-DECISIONS-20261028/human-decisions-7.json), sha256
`9c54c8e5…`, vinculado aos bytes das SPECs na fase 1 (`abbe84e0`):

- [0278](../../../02_spec/0278_fs_tools_hardlink_refusal.md), sha `b7a326f4…`:
  D1 = recusar todo arquivo com `nlink > 1`.
- [0279](../../../02_spec/0279_approval_expiry_never_rewrites_terminal.md), sha
  `c10ebb99…`: D1 = proteger todos os estados decididos e em voo.

As SPECs não foram alteradas depois da aprovação.

## Mudança

- `packages/sandbox/src/fs-tools.ts`: em `readBodyAt`, depois de `isFile()` e
  antes de ler qualquer byte, `nlink > 1` devolve `REJECTED`
  (`file has more than one hard link`). `fs.read` e `fs.edit` herdam a recusa,
  e no `fs.edit` ela vem antes do journal e do arquivo temporário.
- `packages/approval-engine/src/engine.ts`: `EXPIRABLE_STATUSES` (`REQUESTED`,
  `PENDING`, `APPROVED`) mais `EXECUTED` reutilizável, em `isExpirable`.
  `#assertNotExpired` retorna sem gravar nem emitir fora desse conjunto.
  `expireStale` usa a mesma lista.

## Provas (Node 22, `--maxWorkers=2`)

- Fase 1 → BUILD: os 3 `it.fails` da 0278 e os 10 da 0279 viraram `it` e
  passam. Os controles passam antes e depois.
- Teste novo de BUILD (0279): `EXECUTED` de uso único vencido continua
  `EXECUTED` (`submit` responde `invalid_state`, `verifyAndConsume` responde
  `already_executed`).
- `packages/approval-engine` e `packages/sandbox`: 16 arquivos, 227/227.
- Regressão dos consumidores (`apps/worker`, `agent-core`, `agent-runtime`,
  `chaos`, persistence unit, conformance, platform e `pare100`): 638 passam e
  44 pulados (PG).
- Mutações ([mutations.txt](mutations.txt)): 10/10 mortas. A M279-3 (`EXECUTED`
  de uso único expirável) sobreviveu na primeira rodada e morreu com o teste
  novo.
- PostgreSQL 16.15 em contêiner próprio (`claude-df-0279-pg`, removido
  depois): `runtime-approval-store-postgres` 13/13, com 2 testes novos
  ([saída](pg-runtime-approval-store.txt)):
  - `REJECTED` vencido continua `REJECTED` no banco, sem `expiredAt`;
  - `EXECUTING` vencido sobrevive a um `verifyAndConsume` perdido e confirma.

  Sem a correção, os 2 falham por `Approval expired`
  ([saída](pg-runtime-approval-store-without-fix.txt)).
- typecheck 0, eslint 0, prettier e docs:check-links OK.

## Limites e observações

- 0278: os limites aceitos estão na §6 da SPEC (nome de fora removido antes do
  `fstat`, bind mount, segundo link depois do `fstat`).
- 0279: registros que já viraram `EXPIRED` no banco continuam assim; a 0274
  recupera o evento de decisão deles.
