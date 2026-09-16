# Tabela de branches críticos — AAA-34 / agent-runtime

Medida com o mesmo comando de coverage da task, sobre `after/coverage-final.json`
(`packages/agent-runtime/src/**/*.ts`). Linhas referem-se a `runtime.ts` (R) e
`effect-journal.ts` (J).

| #   | Caminho crítico                                     | Arquivo/linhas                           | Branches cobertos/total | %          | Ramos não cobertos                                | Alcançável?                                        |
| --- | --------------------------------------------------- | ---------------------------------------- | ----------------------- | ---------- | ------------------------------------------------- | -------------------------------------------------- |
| 1   | policy→approval reserve→journal→tool→confirm→outbox | R 592–1617                               | 222/230                 | 96,52%     | R 796, 818, 1015, 1228, 1482, 1542                | Não (guardas defensivos; ver notas)                |
| 2   | fencing/lease/recovery                              | R 1950–2366                              | 60/62                   | 96,77%     | R 2206, 2210                                      | Não (callsite já garante journal/proposalHash)     |
| 3   | imutabilidade terminal (decide\*)                   | J 275–459                                | 52/52                   | 100%       | —                                                 | —                                                  |
| 4   | replay idempotente (runtime)                        | R 1761–1948                              | 37/39                   | 94,87%     | R 1768, 1916                                      | Não (guardas defensivos; 37/37 alcançáveis = 100%) |
| 5   | replay idempotente (reserva no journal)             | J 240–273                                | 12/12                   | 100%       | —                                                 | —                                                  |
| 6   | budget/deadline/cancel                              | R 454–530, 678–716, 1323–1384, 1473–1510 | 65/68                   | 95,59%     | R 495, 1482 (+ R 1326 só em variação descendente) | Não (cost check e digest definido)                 |
| 7   | autorização de efeito real                          | R 311–336, 649–660, 854–866, 1150–1159   | 22/22                   | 100%       | —                                                 | —                                                  |
| —   | **Total**                                           | —                                        | **470/485**             | **96,91%** | —                                                 | —                                                  |

## Notas sobre os ramos não cobertos

- `R:796` — `createExecutionProposal` falhar dentro de `runTurn`: TTL é sempre o default válido e o payload estruturado do gateway é JSON canônico; nenhuma entrada pública faz a criação lançar.
- `R:818` — `proposal.promptVersion !== undefined`: `input.prompt.version` é obrigatório em `GovernedTurnInput`, logo o ramo falso é inalcançável via `runTurn`.
- `R:1015` — `input.approvalId ?? ''`: `#runExecutionTurn` só é chamado quando `approvalId` está definido.
- `R:1228` — `reservation === undefined` após o try/catch: todos os ramos atribuem `reservation` ou retornam antes.
- `R:1482` / `R:1542` — extras com `resultDigest` ausente: o digest é string sempre que `journalAttemptId` existe (as duas chamadas vivem nesse ramo).
- `R:1768` — `journal === undefined || record.proposalHash === undefined` em `#replayConfirmedEffect`: o callsite exige `effectJournal` e o `proposalHash` já foi validado antes.
- `R:1916` — `record.proposalHash ?? null` no replay: o hash é necessário para o match do replay; nunca é `undefined` nesse ponto.
- `R:2206/2210` — `#reserveJournalEffect` com `journal`/`proposalHash` ausente: pré-condições validadas pelo chamador.
- `R:443`, `R:495` — `endSpan(undefined)` e custo acumulado maior que o teto em `assertBudget`: defensivos/inalcançáveis no fluxo atual (o gasto é checado logo após o modelo e a execução não gasta modelo).

## Cobertura por módulo (branches)

| Módulo              | Cobertos/total | %          |
| ------------------- | -------------- | ---------- |
| `runtime.ts`        | 464/479        | 96,87%     |
| `effect-journal.ts` | 165/166        | 99,40%     |
| `proposal.ts`       | 25/26          | 96,15%     |
| `contracts.ts`      | 3/3            | 100%       |
| **Pacote**          | **657/674**    | **97,48%** |

## Cobertura por módulo (statements)

| Módulo              | Cobertos/total | %          |
| ------------------- | -------------- | ---------- |
| `runtime.ts`        | 635/646        | 98,30%     |
| `effect-journal.ts` | 255/259        | 98,46%     |
| `proposal.ts`       | 41/41          | 100%       |
| `contracts.ts`      | 5/5            | 100%       |
| **Pacote**          | **936/951**    | **98,42%** |
