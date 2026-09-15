# AAA-34 — cobertura comportamental `packages/agent-runtime`

- Task: endurecimento de cobertura (builder de cobertura), escopo `packages/agent-runtime` (+ `packages/agent-core` somente leitura de testes).
- Observed at: `2026-09-13T04:19:53Z` (UTC). Ambiente: Linux `7.0.0-31-generic` x86_64, Node `v24.20.0`, npm `11.19.0`.
- Base do repositório: `HEAD 512bc11e80fbf7c7b8baf6263aacc811ff829309` com mudanças concorrentes de outras lanes preservadas. Nenhum arquivo de produção alterado por esta lane.
- Escopo de medição: `packages/agent-runtime/src/**/*.ts` (contratos, proposal, effect-journal, runtime). Web/bootstrap/PostgreSQL ficam fora por contrato (AAA-04 §9.1) e pertencem a outras lanes.

## Status

`COMPLETED` no escopo de cobertura, com zero falhas na suíte focada e na suíte completa. Todos os pisos de AAA-04 v2 §9.1 atingidos no recorte do pacote.

## Resultado antes/depois (comando idêntico)

| Arquivo / pacote | Stmts antes | Stmts depois | Branches antes | Branches depois |
| --- | --- | --- | --- | --- |
| `packages/agent-runtime` (agregado) | 723/951 = 76,03% | 936/951 = 98,42% | 474/674 = 70,33% | 657/674 = 97,48% |
| `runtime.ts` | 465/646 = 71,98% | 635/646 = 98,30% | 318/479 = 66,39% | 464/479 = 96,87% |
| `effect-journal.ts` | 220/259 = 84,94% | 255/259 = 98,46% | 135/166 = 81,33% | 165/166 = 99,40% |
| `proposal.ts` | 33/41 = 80,49% | 41/41 = 100% | 19/26 = 73,08% | 25/26 = 96,15% |
| `contracts.ts` | 5/5 = 100% | 5/5 = 100% | 2/3 = 66,67% | 3/3 = 100% |

- Functions/lines do pacote: antes 101/109 (92,66%) / 693/897 (77,25%); depois 106/109 (97,24%) / 886/897 (98,77%).
- Referência da task (baseline do enunciado): statements 77,2% / branches 71,5%; medido pelo builder com as 6 suítes originais no mesmo candidato: 76,03/70,33 (a pequena diferença decorre de instrumentação/rounding e do conjunto exato de suítes no momento declarado).
- Fonte bruta: `before/coverage-final.json`, `after/coverage-final.json`, `coverage-before-after.json`, logs `before-coverage-command.log` e `after-coverage-command.log`.

## Branches críticos do kernel (≥95% exigido)

| Caminho crítico | Cobertos/total | % |
| --- | --- | --- |
| policy→approval reserve→journal→tool→confirm→outbox (`runtime.ts` 592–1617) | 222/230 | 96,52% |
| fencing/lease/recovery (`runtime.ts` 1950–2366) | 60/62 | 96,77% |
| imutabilidade terminal (`effect-journal.ts` decide*, 275–459) | 52/52 | 100% |
| replay idempotente, runtime (`runtime.ts` 1761–1948) | 37/39 | 94,87% (100% dos branches alcançáveis; 2 ramos defensivos inalcançáveis) |
| replay idempotente, reserva no journal (`effect-journal.ts` 240–273) | 12/12 | 100% |
| budget/deadline/cancel (`runtime.ts` 454–530, 678–716, 1323–1384, 1473–1510) | 65/68 | 95,59% |
| autorização de efeito real (`runtime.ts` 311–336, 649–660, 854–866, 1150–1159) | 22/22 | 100% |
| **Total dos caminhos críticos** | **470/485** | **96,91%** |

Nível de módulo (todos ≥95%): `runtime.ts` 464/479 = 96,87%; `effect-journal.ts` 165/166 = 99,40%; `proposal.ts` 25/26 = 96,15%; `contracts.ts` 3/3 = 100%.

Os únicos ramos não cobertos nos caminhos críticos são guardas defensivos inalcançáveis pela API pública (documentados em `limitations.md`): `runtime.ts:1768`, `runtime.ts:1916`, `runtime.ts:2206`, `runtime.ts:2210` e, no agregado do pacote, `runtime.ts:443`, `495`, `796`, `818`, `1015`, `1228`, `1482`, `1542`. Nenhum deles é um caminho de negação, fence, replay ou autorização alcançável.

## Cobertura exigida pela task

- todo código de negação: `policy_denied`, `policy_changed`, `human_takeover_active`, `real_effect_not_authorized`, `durability_required`, `journal_sweep_failed`, `approval_sweep_failed`, `approval_invalid`, `invalid_request`, `not_found`, `already_executed`, `tenant_mismatch`, `action_mismatch`, `resource_mismatch`, `proposal_mismatch`, `proposal_missing`, `payload_mismatch`, `proposal_expired`, `operation_uncertain`, `operation_in_progress`, `idempotency_key_reuse`, `effect_uncertain`, `approval_confirm_failed`, `steps_budget_exceeded`, `model_calls_exhausted`, `tool_calls_exhausted`, `loop_cost_exceeded`, `loop_deadline_exceeded`, `turn_cancelled`, `tool_failed`, `tool_rejected`, `outbox_failed`, `outbox_pending`, `internal_error`, `model_failed`, `already_reserved`, `invalid_state`;
- entradas malformadas: `LoopLimitsSchema` (maxSteps 0, maxCostUsd negativo), validadores do journal (`invalid_input`), TTL/payload de proposta;
- journal adapter: corrupção (JSON inválido/lacunas), lock EACCES/stale/timeout/sem diretório, record ausente, releaseExpired com entradas não-json e symlink quebrado, reconcile repetido, imutabilidade terminal;
- approval states: `UNCERTAIN`, `EXECUTED`, `FAILED`, `REJECTED`, `EXPIRED`, reserva vencida, lease `EFFECT_STARTED` vivo/vencido, `ABANDONED` re-armado;
- proposta: hash canônico incluindo todas as variações de campos, expiração (invalida vira expirada), imutabilidade por deep-freeze, erros `proposal_invalid_ttl`/`proposal_payload_invalid`, verificação fail-closed;
- budget/deadline/cancel: checkpoints pré/pós sweep, pré-tool, pós-effect-start, tool-stage, pós-confirm, pós-model, pós-tool, replay;
- autorização de efeito real: declarado×autorizado, não declarado, `controlled_fake`, `real_authorized` com/sem journal;
- testes novos: 145 (40 + 76 + 19 + 10), todos com fixtures sintéticas, relógio injetado e diretórios temporários únicos.

## Suíte

- Focada `npx vitest run packages/agent-runtime packages/agent-core --no-file-parallelism --maxWorkers=2`: 14 arquivos / 266 testes PASS, exit 0, executada 3× (log `focused-tests-3x.log`).
- `packages/agent-runtime` isolado: 10 arquivos / 249 testes PASS (antes: 6 arquivos / 104 testes).
- Suíte completa `npm test`: 225 arquivos PASS + 4 skipped (229), 1544 testes PASS + 57 skipped (1601), zero falhas, exit 0 (log `full-test.log`).
- `npm run typecheck`: exit 0 (log `typecheck.log`).
- `npm run lint`: exit 0 (log `lint.log`); `npx eslint packages/agent-runtime`: exit 0.
- `npm test` baseline citado no enunciado: 1160/57; o total atual é maior por testes adicionados por outras lanes concorrentes, mantendo zero falhas.

## Bugs

Nenhum bug de produção encontrado ou corrigido. Foi encontrado um defeito de determinismo em teste pré-existente (`AAA-10 T-08`, arquivo de outra lane): a corrida podia produzir `approval_confirm_failed` no perdedor em vez de `operation_in_progress`, dependendo do timing do event loop. Correção apenas de teste (gate determinístico no executor do vencedor), sem alteração de produção; ver `limitations.md`.

## Limitações

Ver `limitations.md`. Nenhum commit, push, deploy, `npm install` ou alteração fora do escopo; nenhum dado real ou ação real executada.
