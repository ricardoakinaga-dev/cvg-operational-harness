# AAA-11 — span closure proof

## Mechanism (packages/agent-runtime/src/runtime.ts)

- `openSpans: Set<ActiveSpan>` registra todo span aberto pelo turno (`agent.turn` +
  filhos orçados + `policy.evaluate`).
- `endSpan(span, status, code)` remove do conjunto e encerra o span nos caminhos
  normais (sucesso/erro declarado).
- `finish(outcome, reason, ...)` encerra qualquer span ainda aberto como
  `error(reason)` e limpa o conjunto antes de fechar o span raiz. Nenhum caminho de
  `finish` (sucesso, negação, deadline, cancelamento, orçamento) pode deixar filho
  pendente.
- Spans de etapa orçada só abrem em `beginStage`, depois das checagens de orçamento e
  stop; etapa negada não abre span.

## Prova em teste

`trackingTelemetry()` em `runtime-limits.test.ts` embrulha `InMemoryTelemetry`:
registra cada `startSpan` (nome + id) e intercepta `span.end`, removendo o span de
`pending()`. `expectNoPendingSpans(harness)` exige:

1. `tracker.pending() === []` (nenhum span aberto sem `end`);
2. `tracker.opened()` contém `agent.turn`;
3. `tracker.closed()` contém `agent.turn` (raiz sempre encerrada).

Os 16 testes do arquivo usam `expectNoPendingSpans`; o teste dedicado de span closure
percorre quatro desfechos no mesmo teste:

| Desfecho           | Cenário                                              | Resultado esperado                         | Log              |
| ------------------ | ---------------------------------------------------- | ------------------------------------------ | ---------------- |
| sucesso            | `appointment.create` controlled_fake, tool+outbox    | `executed`; pending 0                      | span-closure.log |
| negação por policy | `patient.record.write`                               | `denied policy_denied`; pending 0          | span-closure.log |
| erro de outbox     | outbox lança                                         | `denied outbox_failed`; pending 0          | span-closure.log |
| timeout/deadline   | relógio avança além de `maxDurationMs` após o modelo | `denied loop_deadline_exceeded`; pending 0 | span-closure.log |

Cancelamento (`turn_cancelled`) tem prova equivalente nos dois testes de T-11 e no
teste de resposta tardia, todos com `pending() === []`.

## RED correspondente

Com a aplicação dos limites neutralizada (ver `limitations.md`), `finish` não encerra
filhos pendentes e o teste de span closure falha (`executed` em vez de
`loop_deadline_exceeded`, spans pendentes). Isso demonstra que a asserção detecta a
classe de falha F05 (limite que não interrompe trabalho) — `red-focused.log`.
