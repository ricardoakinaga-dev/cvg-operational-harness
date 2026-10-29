# Nota 0285b — invariante de reconstrução do uso (correção de texto da SPEC 0285 §4)

Data: 29/10/2026. Autor: Claude DF. Estado: **TECHNICAL_NOTE**. Esta nota não muda decisão nem comportamento. A [SPEC 0285](0285_model_gateway_attempt_usage_and_request_pressure.md) tem hash vinculado ao recibo `human-decisions-18` e não foi editada.

## O que estava errado

A §4 descrevia a invariante de reconstrução assim: "a soma de `inputTokens`/`outputTokens` dos `model.call.completed` sem `detail: 'usage_unreported'`" e "o número de eventos com `detail: 'usage_unreported'`". A revisão independente do Codex (GBrain 17895) mostrou duas classes que essa redação classifica mal. Nas duas, o gateway grava o uso certo no log; o erro estava só no oráculo:

1. **Falha com uso reportado.** O provider reporta 7/3 e a saída estruturada falha (`schema_invalid`). O medidor registra uma chamada medida de 7/3, e o `model.call.failed` leva 7/3. A redação antiga só contava `completed` e devolvia 0.
2. **Flags compostas.** Um sucesso sem contagem acima do teto de custo leva `detail: 'usage_unreported,cost_ceiling_exceeded'`. A comparação por igualdade com `'usage_unreported'` contava esse caso como medido.

## Invariante corrigida

Para todo evento terminal (`model.call.completed` ou `model.call.failed`) que leva `inputTokens`:

- se a lista de flags de `detail` (separada por vírgula) contém `usage_unreported`, ele conta como **uma chamada sem contagem** (`meter.unreportedRequests`) e não soma tokens;
- senão, conta como **uma chamada medida** (`meter.snapshot().requests`) e soma `inputTokens` e `outputTokens`.

Terminais sem `inputTokens` (falha antes de qualquer saída, cancelamento `not_started`) não contam. Com essa regra, o log reconstrói o medidor em qualquer sequência de tentativas.

## Provas

`aud0625-par-c02-pressure.test.ts`: o `reconstruct` passou a usar essa regra, e há dois testes de regressão, um para cada classe.
