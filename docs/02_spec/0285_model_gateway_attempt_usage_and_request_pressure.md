# SPEC 0285 — Model gateway: uso por tentativa e pressão antes do dispatch

Data: 29/10/2026. Estado: **PROPOSED_FOR_HUMAN_T3_REVIEW**. T3: muda o log de eventos do gateway e acrescenta uma recusa antes do provider. **Sem BUILD até revisão humana explícita deste documento.**

Task: `AUD0625-PAR-C02-SPEC-DF-20261029`. Cartão: PAR-C02 ([0380](../03_build/0380_backlog_paridade_100_deepseek.md), "Pressão de tokens antes do dispatch"). Origem: G1/COMP lacuna 2 e AUD0611 (dimensão de modelo); absorve parte do P100-021 ([0378](../03_build/0378_backlog_paridade_integral.md)). Depende do PAR-M01 ([SPEC 0284](0284_model_gateway_streaming_single_terminal.md)), aprovado pelo DF em `248655dbad74`. Base: `claude/aud0625-par-m01-d9` @ `248655dbad74`. Autor: Claude DF (Opus). A revisão é de uma sessão não autora.

## 1. O que o cartão pede

- **Hoje:** o medidor agrega o uso das chamadas bem-sucedidas.
- **Entrega:** pressão calculada antes de cada chamada, com uso por tentativa, inclusive das que falham.
- **Aceite:** a projeção de pressão bate com o uso reconstruído do log.

## 2. Evidência atual (CURRENT, base `248655dbad74`)

| Fato                                                                                                                                                                                                                                                                                                                                                                                                                                | Onde                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Uma tentativa que falha **depois** de saída e **é repetida** é cobrada (limite conservador da 0284 §7.3, `meter.recordUnreported()`, `budget.settle`). Mas o log não registra nenhum `model.call.failed` dela: só `model.retry.scheduled`. Repro: tentativa 1 corta depois de um delta, tentativa 2 conclui. O medidor fica com `unreportedRequests = 1`, e o log mostra `started:1 → retry.scheduled:2 → started:2 → completed:2`. | `gateway.ts`, bloco `catch`, ramo `canRetry`; teste RED §9 |
| Por isso, o uso **não** é reconstruível só pelo log: o medidor diz 1 tentativa sem contagem, e o log diz 0.                                                                                                                                                                                                                                                                                                                         | teste RED §9                                               |
| O `model.call.failed` só sai na falha **final**. A 0284 §4.1 item 6 fala em "um completed ou um failed por tentativa", e o código só cumpre isso na última tentativa.                                                                                                                                                                                                                                                               | `gateway.ts`                                               |
| Nenhuma estimativa do tamanho da requisição é feita antes do provider. O único cálculo é o limite conservador (`conservativeUsage`: 1 token por byte UTF-8 de entrada mais `maxTokens`), usado só para cobrar falha ou uso ausente.                                                                                                                                                                                                 | `gateway.ts`                                               |
| `ModelProfile` não declara janela de contexto. Uma requisição maior que a janela do modelo vai ao provider, que a recusa (ou corta), e a tentativa gasta tempo e orçamento.                                                                                                                                                                                                                                                         | `contracts.ts`                                             |
| O medidor (`TokenMeter`) já separa o uso medido (`requests`, tokens) das chamadas sem contagem (`unreportedRequests`, SPEC 0267 §3.3).                                                                                                                                                                                                                                                                                              | `token-meter.ts`                                           |

## 3. Escopo

**Dentro:**

1. Um `model.call.failed` por tentativa que falha, inclusive as repetidas, emitido **antes** do `model.retry.scheduled`.
2. A projeção do tamanho da requisição, calculada uma vez por chamada, antes de reservar orçamento, e publicada em cada `model.call.started`.
3. A janela de contexto opcional no perfil e a recusa antes do provider quando a projeção não cabe.
4. A prova de que o log reconstrói o medidor.

**Fora:**

- Pressão de sessão ancorada no uso reportado pelo provider, isto é, o "próximo prompt" somado ao delta da superfície, como no harness de referência. Depende do log de sessão (PAR-S01, PAR-S02) e da compactação (PAR-C01). Fica para o C01.
- Tokenizador exato por modelo.
- Mudar o preço, o orçamento ou o limite conservador da 0284 §7.3.
- Expor deltas ou pressão ao cliente (PAR-A01).

## 4. Uso por tentativa (D1)

1. Toda tentativa que começou (`model.call.started`) termina em **exatamente um** evento: `model.call.completed` ou `model.call.failed`.
2. Na falha repetida, a ordem é `model.call.failed` (tentativa N), depois `model.retry.scheduled` (N+1) e só então o backoff.
3. O `model.call.failed` leva o que a tentativa consumiu, pela regra já aprovada na 0284 §7:
   - falha **antes** de qualquer byte de saída: sem tokens e sem custo, como hoje;
   - falha **depois** de saída (stream): `detail: 'usage_unreported'`, com tokens e custo do limite conservador.
4. Cancelamento durante o backoff: continua saindo o `model.call.failed` com `code: 'cancelled'` da tentativa que o backoff esperava. Ele não leva tokens, porque essa tentativa não começou. **Mudança técnica (T-1):** hoje esse evento leva o número da tentativa anterior; passa a levar o da tentativa que não começou e `detail: 'not_started'`. Assim nenhuma tentativa ganha dois eventos terminais.
5. Nenhum tipo de evento novo. `ModelGatewayEvent` já tem `inputTokens`, `outputTokens`, `costUsd` e `detail`.

**Invariante de reconstrução (aceite do cartão):**

- A soma de `inputTokens`/`outputTokens` dos `model.call.completed` sem `detail: 'usage_unreported'` é igual a `meter.snapshot()`.
- O número de eventos `completed` ou `failed` com `detail: 'usage_unreported'` é igual a `meter.unreportedRequests`.
- Os dois valem para qualquer sequência de tentativas.

## 5. Pressão antes do dispatch (D2)

1. Depois de `renderGovernedInput` e antes de qualquer reserva de orçamento, o gateway calcula `projectedInputTokens` uma vez por chamada: `ceil(bytesUTF8(system + conteúdo de cada mensagem) / 4) + 4 × (número de mensagens + 1 se houver system)`.
2. É uma **estimativa** de densidade fixa, nunca uma medição. O nome do campo e este documento dizem isso. Texto CJK e JSON tendem a ser subestimados; a §11 registra o limite.
3. O valor vai em cada `model.call.started`, como inteiro seguro não negativo.
   - **Mudança técnica (T-2):** é o único campo novo, opcional, em `ModelGatewayEvent` (`projectedInputTokens?: number`).
   - Nenhum export, nenhum código de erro e nenhum tipo de evento novos.
4. O `ModelResult` não muda.

## 6. Janela de contexto e recusa (D3)

1. Novo campo opcional `ModelProfile.contextWindow?: number`, inteiro seguro positivo.
   - Ausente: só medição, sem recusa. É o padrão, e nenhum perfil atual muda de comportamento.
   - Valor inválido (não inteiro, zero, negativo ou não seguro): a construção do gateway falha fechada, como os outros campos do perfil.
2. Com `contextWindow`, se `projectedInputTokens + (request.maxTokens ?? profile.maxTokens) > contextWindow`, o gateway recusa **antes** de reservar orçamento e antes de qualquer `model.call.started`:
   - `ModelGatewayError('invalid_request', …)`, não repetível;
   - nenhum provider chamado, nenhum custo, nenhuma entrada no medidor;
   - mensagem segura, sem conteúdo do prompt.
3. Rota de fallback (`fallbackProfile`): cada perfil usa a **própria** janela. Uma recusa no perfil primário por janela **não** dispara fallback nesta SPEC, porque a recusa é da requisição e não do provider. **Decisão D3b** (§10).

## 7. Segurança e dados

- O evento leva só números. Nenhum texto, hash de conteúdo ou tamanho por mensagem.
- A estimativa roda sobre o input já governado (prompt aprovado mais mensagens), sem novo acesso a dado.
- Sem dado real, sem provider real nos testes. O orçamento e o medidor seguem a 0248/0267/0284.

## 8. Critérios de pronto

1. Os 4 alvos da §9 passam e os 3 controles seguem passando.
2. Testes novos de BUILD:
   - cancelamento no backoff com `detail: 'not_started'`;
   - perfil com `contextWindow` inválido falha na construção;
   - recusa por janela sem reserva de orçamento (store do orçamento intocado);
   - a estimativa da §5.1 em entradas ASCII, UTF-8 multibyte e sem system;
   - a invariante de reconstrução da §4 em sequências de 1, 2 e 3 tentativas que misturam falha antes de saída, falha depois de saída e sucesso, com e sem `meter`.
3. Mutações, cada uma derrubando pelo menos um teste:
   - não emitir o `failed` na tentativa repetida;
   - emitir o `failed` depois do `retry.scheduled`;
   - `failed` sem tokens na falha depois de saída;
   - tokens na falha antes de saída;
   - `projectedInputTokens` ausente ou só na 1ª tentativa;
   - recusa por janela depois da reserva;
   - recusa com `>=` no lugar de `>`;
   - ignorar `request.maxTokens`;
   - fallback disparado pela recusa.
4. A suíte `packages/model-gateway` e os consumidores (`agent-runtime`, `chaos`, `tests/model-fault-server.test.ts`) passam. O consumidor que conta `model.call.failed` (fault server) é conferido e, se precisar, ajustado com justificativa.
5. A cobertura do gate REM21 continua no threshold dos arquivos tocados. typecheck, lint, format, docs:check-links, skip:governance e mutation:guard ficam verdes; o rebind do manifesto acontece se `gateway.ts` estiver catalogado.

## 9. Fase 1: testes RED

Arquivo `packages/model-gateway/src/__tests__/aud0625-par-c02-pressure.test.ts`, Node 22, provider sintético em memória.

| Caso                                                                                                   | Hoje       | Motivo da falha (verificado com `it.fails` → `it`) |
| ------------------------------------------------------------------------------------------------------ | ---------- | -------------------------------------------------- |
| Controle: sucesso reportado igual no log e no medidor                                                  | passa      | —                                                  |
| Controle: falha final depois de saída, um `failed` com `usage_unreported`                              | passa      | —                                                  |
| Controle: falha antes de saída sem tokens                                                              | passa      | —                                                  |
| Alvo: tentativa repetida que falhou depois de saída tem o próprio `failed`, antes do `retry.scheduled` | `it.fails` | `expected [] to have a length of 1`                |
| Alvo: o log sozinho reconstrói o medidor com retry                                                     | `it.fails` | log 0 contra medidor 1 em `usage_unreported`       |
| Alvo: `projectedInputTokens` no `model.call.started`, antes do provider                                | `it.fails` | campo ausente                                      |
| Alvo: projeção maior que `contextWindow` não chega ao provider e não cobra                             | `it.fails` | a chamada conclui em vez de recusar                |

## 10. Decisões para o Ricardo

- **D1.** Emitir um `model.call.failed` por tentativa que falha, também nas repetidas, com o uso já cobrado. **Recomendado: sim.** Sem isso, o aceite do cartão (reconstruir pelo log) é impossível. O tipo de evento é o mesmo; muda só a quantidade.
- **D2.** Publicar a estimativa `projectedInputTokens` (densidade fixa de 4 bytes por token mais 4 por mensagem) em cada `model.call.started`. **Recomendado: sim, só no evento.** Alternativa: não publicar e usar só na recusa da D3.
- **D3.** Janela de contexto opcional no perfil, com recusa antes do provider e sem custo. **Recomendado: sim, opcional e desligada por padrão.** Alternativa: só medir agora e deixar a recusa para o PAR-C01, junto da compactação.
- **D3b.** A recusa por janela não aciona o fallback. **Recomendado: não acionar.** Acionar exigiria escolher entre perfis por tamanho, o que é roteamento e fica fora deste cartão.

Decisões técnicas, sem gate próprio:

- **T-1:** número e `detail: 'not_started'` no cancelamento durante o backoff (§4.4).
- **T-2:** o único campo novo é o opcional do evento (§5.3).

## 11. Limites aceitos

- A estimativa pode errar para os dois lados. Para menos (CJK, JSON), a requisição passa pela janela e o provider recusa: a tentativa cai em `provider_invalid_request` e é cobrada pela regra atual. Para mais, há recusa falsa, e só quando o perfil declarar `contextWindow`.
- A pressão de **sessão** (ancorada no uso anterior do provider) não está aqui; ela fica com o PAR-C01.
- O medidor continua por turno. Tentativas de turnos diferentes não se somam aqui.

## 12. Fatias do BUILD (para estimativa; não autorizadas)

1. D1: evento por tentativa, ordem e teste de reconstrução (cerca de meio dia).
2. D2 e D3: estimativa, campo no evento, `contextWindow` e recusa (cerca de meio dia).
3. Mutações, consumidores, cobertura e revisão independente (cerca de meio dia).
