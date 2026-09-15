# AAA-11 — T-09/T-10/T-11 and §9 requirement matrix

Fonte normativa: `docs/02_spec/aaa_execution_contract.md` §9 e §12 (T-09, T-10, T-11);
task AAA-11 itens 1–7. Testes: `packages/agent-runtime/src/__tests__/runtime-limits.test.ts`
(16 testes, `green-limits-verbose.log`). RED: `red-focused.log` (13/16 falham com a
aplicação dos limites neutralizada).

## T-09 — maxSteps=1

| Requisito §9 | Teste | Verde | RED (limites neutralizados) |
| --- | --- | --- | --- |
| `maxSteps=1` permite somente uma etapa orçada (modelo); ferramenta/outbox não iniciam | `AAA-11 T-09 > denies steps_budget_exceeded when maxSteps=1 and never starts tool/outbox` | PASS | FAIL (modelo, tool e outbox rodavam) |
| Negação `steps_budget_exceeded` sem abrir span `tool.execute`/`outbox.enqueue` | mesmo teste (`tracker.opened()`) | PASS | FAIL |
| `policy.evaluate` (controle) não consome `maxSteps` | `does not let the control steps (policy) consume maxSteps` (`maxSteps: 3` → model+tool+outbox) | PASS | PASS (mutação não altera contagem de controle) |
| Spans fechados e cadeia de auditoria válida | mesmo teste + `expectNoPendingSpans` | PASS | FAIL |
| Tool após orçamento não inicia (payload honesto quando a etapa negada é a outbox) | `denies steps_budget_exceeded without starting the outbox and flags the confirmed effect` (efeito confirmado, `effectConfirmed=true`, `outboxPending=true`, `outbox` 0x) | PASS | FAIL |

## T-10 — deadline com dependência lenta que ignora `AbortSignal`

| Requisito §9 | Teste | Verde | RED |
| --- | --- | --- | --- |
| Ferramenta lenta ignora o sinal; ao retornar, o turno encerra honesto | `AAA-11 T-10 > ends the turn honestly after a slow tool, with no late outbox` | PASS | FAIL (`executed` era retornado) |
| Nenhum efeito tardio: outbox 0x; aprovação/journal `UNCERTAIN` (não inventa sucesso) | mesmo teste (`loop_deadline_exceeded`, journal `UNCERTAIN`) | PASS | FAIL |
| Deadline entre modelo e ferramenta | `AAA-11 deadline and cost boundaries > denies loop_deadline_exceeded between model and tool and starts no effect` | PASS | FAIL |
| `costUsd` checado após o modelo e antes da ferramenta | `denies loop_cost_exceeded after the model and before the tool` | PASS | PASS (custo continuava checado no caminho antigo) |
| Spans fechados no timeout | `expectNoPendingSpans` em todos | PASS | FAIL (span `agent.turn`/`model.generate` pendentes) |

## T-11 — cancelamento durante o turno

| Requisito §9 | Teste | Verde | RED |
| --- | --- | --- | --- |
| `cancelSignal` propagado ao gateway; abort no modelo → `turn_cancelled`, sem tool/outbox | `AAA-11 T-11 > denies turn_cancelled when the model ignores an abort mid-turn` | PASS | FAIL |
| `cancelSignal` propagado ao `ToolInvocation.signal` | `AAA-11 signal propagation > forwards the cancellation signal to the tool invocation` | PASS | PASS (campo aditivo; mutação de limite não afeta) |
| Abort no gateway aborta o signal interno do provider | `forwards the cancellation signal to the model gateway` | PASS | PASS (propagação aditiva) |
| Ferramenta ignora o abort e retorna tardio: sem outbox, aprovação/journal `UNCERTAIN` | `denies turn_cancelled and marks the approval/journal UNCERTAIN when the tool ignores the abort` | PASS | FAIL |
| Resposta tardia do modelo não alimenta proposta/ferramenta/outbox | `AAA-11 late responses... > discards a late model result after cancellation and never triggers tool/outbox` | PASS | FAIL |

## Limites por chamada e semântica por turno

| Requisito §9 | Teste | Verde |
| --- | --- | --- |
| `maxModelCalls=0` → nenhuma chamada ao modelo; `model_calls_exhausted` | `AAA-11 budget call limits > denies model_calls_exhausted for maxModelCalls=0 without calling the model` | PASS |
| `maxToolCalls=0` → nenhuma ferramenta; `tool_calls_exhausted` | `denies tool_calls_exhausted for maxToolCalls=0 without executing the tool` | PASS |
| Contadores/custo reiniciam a cada `runTurn`; `limits` valem só para o turno que os recebeu | `AAA-11 per-turn limit semantics` (2 testes: `maxSteps=1` seguido de turno sem limites; `maxModelCalls=0` seguido de turno executado) | PASS |
| T-18 preservado: `maxToolCalls=0` nega antes de reservar aprovação | `runtime-journal.test.ts > AAA-10 T-18` (regressão) | PASS |

## Cobertura de encerramento

Todos os 16 testes novos chamam `expectNoPendingSpans` (ou o cenário de span closure),
que exige `pending() === []` e presença de `agent.turn` aberto/fechado. Cenários de
sucesso, negação por policy, falha de outbox, deadline, cancelamento e limites têm
prova de ausência de span pendente (`span-closure.md`).
