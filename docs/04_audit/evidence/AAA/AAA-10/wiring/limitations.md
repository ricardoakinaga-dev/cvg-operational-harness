# AAA-10 wiring — limitations

- Escopo estrito: apenas `packages/agent-runtime/src/runtime.ts`,
  `contracts.ts` (opção/tipos) e testes. Nenhum arquivo de
  `packages/approval-engine`, `packages/persistence`, `packages/channel-gateway`,
  `effect-journal.ts`, `proposal.ts`, `index.ts` ou `package.json` foi alterado.
- O runtime consome `EffectJournalPort` injetado. A variante PostgreSQL
  (`PostgresEffectJournal`, migration `0013_runtime_effect_journal`) existe na
  lane `ports`/Agent 2; os testes de crash desta lane usam `FileEffectJournal`
  (host único) e `InMemoryEffectJournal` (efêmero). Não há prova cross-host aqui.
- `durability_required` é aplicado a `HIGH_RISK_WRITE`/`ADMIN` ou
  `effectScope: real_authorized` mesmo quando o cenário é `controlled_fake`
  declarado (ex.: `appointment.cancel`). Para executar sem journal apenas
  `MEDIUM_RISK_WRITE` controlado/falso é aceito, e tal caminho não devolve
  `replayed`/`resultDigest` (não reivindica durabilidade).
- O runtime não persiste o `callerIdempotencyKey` no registro de aprovação
  (não era permitido alterar `approval-engine`). Um retry que não reapresente a
  mesma chave deriva outra `operationKey` e obtém `already_executed` em vez de
  replay; preservar a chave entre retries é responsabilidade do chamador
  (provado em T-17 quando a chave é ressupida).
- A reconciliação de TTL no início do turno cobre a aprovação da operação atual
  (inclusive com `callerIdempotencyKey`). A varredura periódica de todos os
  tenants/reservas continua sendo responsabilidade do worker via
  `ApprovalEngine.releaseExpired` (AAA-16).
- `outboxPending` depende da outbox deduplicar por `operationKey`
  (`packages/persistence/src/outbox.ts`); esta lane preserva o evento e a chave,
  sem reexecutar a ferramenta.
- O caminho `ALLOW` (sem `approvalId`) com journal configurado executa a
  ferramenta sem `journal.reserve` quando a capability não exige durabilidade
  (MEDIUM_RISK_WRITE controlado/falso) e não reivindica durabilidade. Com journal
  ausente, capability que pode produzir efeito real é negada antes da ferramenta
  (`durability_required`). Política que devolva `ALLOW` para capability de efeito
  real com journal configurado continua fora do caminho durável; a restrição
  normativa é de policy (§5.1: `ALLOW` só para capability sem efeito real).
- `FileEffectJournal` é durável entre processos do mesmo host, mas não prova
  durabilidade física sob queda de energia tampouco compartilhamento entre hosts
  (herdado da lane `ports`).
- Limites por turno (deadline/orçamento/cancelamento), findados do T-09..T-11,
  são AAA-11; esta lane não alterou a semântica de budget existente (AAA-09) e
  não implementou os artefatos de AAA-11.
- Nenhum dado real, provider real, canal real ou ação clínica/financeira foi
  usado. Nenhum commit/push/deploy foi executado.
