# SPEC 0284 — Model gateway: stream interno com um único estado terminal

Data: 29/10/2026. Estado: **PROPOSED_FOR_HUMAN_T3_REVIEW**. T3: contrato interno do gateway, transporte e contabilização de uso. **Sem BUILD até revisão humana explícita deste documento.**

Task: `PAR-M01-PHASE1-D9-20261029`. Cartão: PAR-M01 ([0380](../03_build/0380_backlog_paridade_100_deepseek.md), "Streaming no gateway com um resultado terminal"). Origem: G1/LLM-01, absorve P100-014. Base: `claude/aud0625-wave3` @ `0efc427e3`. Autorização da fase 1 (DISCOVERY, SPEC e testes RED, sem BUILD) e as três decisões de desenho: recibo `docs/04_audit/evidence/USER-DECISIONS-20261028/human-decisions-14.json` (sha256 `3acd13ef56e7c32aad4d60ee5dca39f6f0b5cdc7e2d862272b2f6199b7b7e5b0`). Prontidão da 07: `docs/04_audit/evidence/AUD0625-F14-READINESS-07-20261029/READINESS.md` (`6cab0344`). Descoberta e prova: [DISCOVERY](../04_audit/evidence/AUD0625-PAR-M01-D9-20261029/DISCOVERY.md).

## 1. Decisões já tomadas (recibo 14)

- **D1.** O stream é **só interno** ao gateway. O chamador de `generate` continua recebendo um único `ModelResult`. Os deltas expostos a cliente, kernel ou API ficam para o PAR-A01.
- **D2.** Todo stream termina em **exatamente um** estado terminal. Uma resposta parcial **nunca** é final.
- **D3.** Uso parcial ausente é **desconhecido**, nunca zero.

Esta SPEC só detalha como cumprir essas três, e lista o que sobra como decisão técnica (§11).

## 2. Evidência atual (CURRENT, base `0efc427e3`)

| Fato                                                                                                                                                                                                                                                                                                                   | Onde                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Os dois providers fixam `stream: false`.                                                                                                                                                                                                                                                                               | `providers/openai-compatible.ts:150`, `providers/ollama.ts:125`                                                              |
| `ModelProvider` só tem `execute(request): Promise<ProviderResult>`; o gateway só chama `execute` e devolve um `ModelResult`.                                                                                                                                                                                           | `contracts.ts` (`ModelProvider`), `gateway.ts` (`provider.execute`)                                                          |
| O transporte Node vinculado (`fetchWithResolvedAddress`) lê **o corpo inteiro** (`for await … chunks.push`, `Buffer.concat`) e só então devolve a `Response`. Um servidor que escreve um fragmento e segura o resto mantém a chamada pendente até o fim do corpo. Um "stream" por esse transporte chegaria de uma vez. | `providers/ssrf-node.ts` (`readResponse`); teste `hands over the Response while the server still holds the rest of the body` |
| O teto de bytes de recepção **já existe** para o corpo bufferizado (SPEC 0248 §3.5): o socket é destruído no primeiro chunk que cruza o teto e o corpo 2xx falha com `ResponseTooLargeError`. Falta o teto de **eventos** e o de **ociosidade**, que só fazem sentido com stream.                                      | `providers/ssrf-node.ts`, `providers/http-errors.ts` (`readBoundedText`); teste de controle do teto de bytes                 |
| Uso ausente é tratado como **desconhecido** no caminho não-stream (SPEC 0267 §3.3): `usageStatus:'unreported'` e limite conservador.                                                                                                                                                                                   | `gateway.ts` (`conservativeUsage`, `UsageStatus`)                                                                            |
| Uma tentativa que **falha** não é contabilizada hoje (`accounted` só existe depois de `provider.execute` devolver). Num stream que gerou saída e foi cortado, isso contaria zero para uma chamada que consumiu tokens.                                                                                                 | `gateway.ts` (bloco `catch`)                                                                                                 |
| O servidor de falhas (SPEC 0232) só aceita requisição com `stream:false` e seu cenário `synthetic-sse` é um fixture de bytes, não uma resposta de provider; ele **não prova** o PAR-M01 (a própria 0232 diz isso). Os testes RED usam servidores loopback próprios.                                                    | `tests/support/model-fault-server/contract.js`                                                                               |

Ressalva sobre a SPEC 0175 (teto de recepção, `PROPOSED / HUMAN_T3_PENDING`): a parte de bytes dela já foi atendida pela 0248 no transporte de modelo. O que sobra da 0175 para o caminho de stream é só o que esta SPEC especifica nos tetos de eventos e de ociosidade (§6.3). **A 0175 continua independente e não é aprovada nem alterada aqui**; os canais (`channel-gateway`) ficam fora.

## 3. Escopo

**Dentro.**

1. Contrato interno de stream do provider (`executeStream`) e a máquina de estados do gateway que o consome.
2. Modo de resposta incremental no transporte Node vinculado, preservando o pinning de IP/SNI do guard SSRF e os tetos.
3. Leitores SSE (OpenAI-compatível) e NDJSON (Ollama) com tetos de bytes, eventos e ociosidade.
4. Contabilização de uso e custo do stream (D3).
5. Interação com retry, circuito e orçamento do gateway.

**Fora.**

- Entregar deltas a quem chama `generate`, ao kernel, a hooks ou à API (PAR-A01). Nenhum símbolo novo é exportado pelo barrel de `@cvg/model-gateway` (D1).
- Provider real, chave real, dado real ou egress (T4). A prova usa loopback e fakes.
- Chamada de ferramenta em stream, multimodal (PAR-M03), compactação (PAR-C01/C02), congelamento da requisição (PAR-M02).
- Mudança de `errors.ts`/códigos públicos, do guard SSRF, do DNS, do lockfile, do esquema ou de migration. **Sem migration.**

## 4. Contrato interno

Tipos internos (arquivo novo `packages/model-gateway/src/stream.ts`, **fora** de `index.ts`):

```ts
type ProviderStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'usage'; usage: ProviderUsage }
  | { type: 'finish'; reason: string }

interface ModelProvider {
  // existente
  execute(request: ProviderRequest): Promise<ProviderResult>
  // novo, opcional, interno
  executeStream?(request: ProviderRequest): AsyncIterable<ProviderStreamEvent>
}
```

`ModelProfile` ganha `streaming?: boolean` (padrão **falso**; sem o campo nada muda). Perfil com `streaming:true` e provider sem `executeStream` falha fechado com `invalid_request`, não retentável, antes de qualquer despacho; **não há fallback silencioso** para o caminho não-stream.

### 4.1 Máquina de estados (uma por tentativa)

`OPEN → (DELTA | USAGE)* → FINISHED → COMPLETED`; em qualquer ponto `→ FAILED` ou `→ CANCELLED`. `COMPLETED`, `FAILED` e `CANCELLED` são **terminais** e mutuamente exclusivos; o primeiro que ocorre vence e nenhum evento posterior o altera.

| Situação                                                          | Terminal    | Código do gateway             | Retentável                                |
| ----------------------------------------------------------------- | ----------- | ----------------------------- | ----------------------------------------- |
| `finish` recebido, iterador terminou limpo, no máximo um `finish` | `COMPLETED` | —                             | —                                         |
| iterador termina **sem** `finish` (corte, EOF antes do fim)       | `FAILED`    | `provider_connection_reset`   | sim (política atual de `connection`)      |
| provider lança `ModelProviderError`                               | `FAILED`    | o mapeamento atual de `kind`  | o atual                                   |
| `delta`/`usage`/segundo `finish` **depois** de `finish`           | `FAILED`    | `provider_malformed_response` | não                                       |
| `usage` inválido (`isValidProviderUsage`)                         | `FAILED`    | `provider_malformed_response` | não                                       |
| `AbortSignal` do chamador aborta                                  | `CANCELLED` | `cancelled`                   | não; o iterador recebe `return()` uma vez |
| prazo da chamada (`timeoutMs`) vence                              | `FAILED`    | `provider_timeout`            | sim (atual)                               |

Regras:

1. **Parcial nunca é final.** O texto acumulado vive só no montador do gateway e só vira `ModelResult.output.text` em `COMPLETED`. Em `FAILED` ou `CANCELLED` ele é descartado e **não aparece** em erro, evento, log nem métrica.
2. `finishReason:'length'` (teto de `maxTokens`) é um término **legítimo** do provedor: `COMPLETED` com o `finishReason` informado, como hoje no caminho não-stream. Corte de conexão não é `length`.
3. Saída estruturada (`structuredOutput`) é interpretada **só depois** de `COMPLETED`, com o mesmo `failClosed` atual.
4. Cada tentativa tem sua própria máquina. O gateway só devolve resultado de uma tentativa `COMPLETED`; o texto de uma tentativa falha nunca se mistura com o da seguinte.
5. O gateway fecha o iterador (`return()`) em toda saída que não seja o fim natural, uma vez, e espera o fechamento terminar antes de decidir o terminal.
6. Nenhum evento novo de gateway é criado. `model.call.started/completed/failed` continuam, um `completed` ou um `failed` por tentativa; sem evento por delta (D1).

## 5. Transporte

### 5.1 Modo incremental

`fetchWithResolvedAddress(url, init, addresses)` mantém sua assinatura. `init.responseMode` (novo, interno, `'buffered'` por padrão) aceita `'stream'`. No modo `stream` a função resolve a `Response` **ao receber os cabeçalhos**, com `body` sendo um `ReadableStream` alimentado pelo `IncomingMessage` (com contrapressão: `pause()`/`resume()` conforme a demanda do leitor). O padrão `'buffered'` é byte-a-byte o comportamento atual (SPEC 0248).

### 5.2 O que não muda

Pinning ao IP aceito pelo guard, SNI/Host, `redirect:'manual'`, validação de `signal` antes de criar a requisição (SPEC 0263 §4) e a regra "status conhecido vence": resposta não-2xx no modo `stream` mantém status e cabeçalhos com corpo nulo e socket liberado.

### 5.3 Teto de bytes preservado

`maxResponseBytes` vale também no modo `stream`: o contador roda sobre o que o leitor consome **e** sobre o que o socket entrega; ao cruzar o teto o socket é destruído e o leitor recebe `ResponseTooLargeError` (nome já tratado por `networkError`). `Content-Length` acima do teto é recusado antes de ler. Há um teste de controle que já vale hoje no modo bufferizado e deve continuar valendo no modo `stream`.

### 5.4 Cancelamento e limpeza

Abort do `signal`, erro de socket, teto, ociosidade ou `cancel()` do leitor destroem a requisição e o socket, removem listeners e timers e liquidam o stream uma única vez. Nada drena um corpo hostil como forma de limpeza.

### 5.5 Caminho com `fetchImpl` injetado

Usa o `Response.body` do `fetch` injetado com o mesmo leitor e os mesmos tetos; é o caminho dos testes sem rede e não substitui a prova via loopback real.

## 6. Leitores

### 6.1 SSE (OpenAI-compatível)

Corpo da requisição com `stream:true` e `stream_options:{include_usage:true}`. Decodificação UTF-8 **incremental** (`TextDecoder` com `stream:true`): um caractere multibyte dividido entre dois chunks TCP é remontado, nunca vira U+FFFD. Quadro = linhas até a linha em branco; aceita `\n`, `\r\n` e `\r`; ignora linhas de comentário (`:`); junta várias linhas `data:` com `\n`. Um quadro **incompleto no fim da conexão nunca é interpretado** (não vira delta). `data: [DONE]` encerra; qualquer byte de dados depois dele é violação (`provider_malformed_response`). `delta.content` vira `delta`; `finish_reason` não nulo vira `finish`; um quadro com `usage` e `choices` vazio vira `usage`. JSON inválido em um quadro, ou quadro fora do esquema fechado, é `malformed_response`.

### 6.2 NDJSON (Ollama)

Corpo com `stream:true`. Uma linha JSON por objeto, mesma decodificação incremental e mesma regra de linha incompleta. `message.content`/`response` vira `delta`; `done:true` vira `finish` (`done_reason`, padrão `stop`) e, **somente** se `prompt_eval_count` e `eval_count` vierem na linha, um `usage` (SPEC 0267 §3.3: contador ausente é desconhecido). Fim da conexão sem `done:true` é corte. Linha depois de `done:true` é violação.

### 6.3 Tetos (opções do provider)

| Teto                                   | Opção                          | Padrão    | Estouro              |
| -------------------------------------- | ------------------------------ | --------- | -------------------- |
| bytes de corpo                         | `maxResponseBytes` (existente) | 256 KiB   | `response_too_large` |
| eventos (quadros SSE ou linhas NDJSON) | `maxStreamEvents` (novo)       | 4096      | `response_too_large` |
| bytes de um quadro                     | `maxStreamEventBytes` (novo)   | 64 KiB    | `response_too_large` |
| ociosidade entre bytes                 | `streamIdleTimeoutMs` (novo)   | 30 000 ms | `timeout`            |

Valor inválido (zero, negativo, fração, `NaN`, acima de `Number.MAX_SAFE_INTEGER`) é `invalid_request` na construção. O prazo total da chamada (`timeoutMs`) continua valendo; a ociosidade só antecipa. A verificação roda a cada iteração, inclusive com chunk vazio, e não depende só de callback de timer.

## 7. Uso e custo (D3)

1. **`COMPLETED` com contadores** (`usage` recebido): `usageStatus:'reported'`, contabilizado como hoje.
2. **`COMPLETED` sem contadores:** `usageStatus:'unreported'`, `usage` = limite conservador atual (`conservativeUsage`), custo = máximo entre a estimativa e o conservador; `detail:'usage_unreported'`. Nunca zero.
3. **`FAILED` ou `CANCELLED` depois de pelo menos um byte de saída recebido:** o uso é **desconhecido**. A tentativa é contabilizada com o limite conservador, `model.call.failed` leva `detail:'usage_unreported'`, custo e tokens do limite conservador. Nunca zero e nunca a contagem parcial de caracteres/tokens vista (que seria uma medição falsa).
4. **`FAILED` antes de qualquer byte de saída** (status HTTP de erro, recusa de conexão): mantém exatamente a contabilização de falha de hoje (nenhum `detail`, nenhum custo extra). É a única tentativa de stream que não cobra.
5. Cada tentativa executada é cobrada por inteiro, sem estorno (regra da 0267 §3.3 mantida).

Esta é a **única** mudança de contabilização, e só vale para perfil com `streaming:true`; perfis sem o campo seguem como hoje.

## 8. Retry, circuito, orçamento e K03

- Retry segue a política atual por classe: `FAILED` com `provider_connection_reset`, `provider_timeout`, `provider_unavailable` e `provider_rate_limited` é retentável; `malformed_response`, `response_too_large` e `cancelled` não. O backoff é o atual e `model.retry.scheduled` continua sendo emitido **antes** do backoff.
- Um retry começa outro stream do zero, sem reaproveitar texto. A tentativa anterior já está contabilizada pela §7 antes do backoff.
- O circuito conta `provider_connection_reset` e `provider_malformed_response` como hoje (`#countsAgainstCircuit`); `cancelled` não conta.
- O orçamento autoriza uma vez e a reserva cobre a primeira tentativa contabilizada; as demais seguem a 0267.
- **Dependência PAR-K03.** O cartão lista K03 como dependência formal. Esta SPEC **não toca** o journal de resultado completo da 0225: o stream é interno ao gateway e o gateway ainda devolve um `ModelResult` por chamada. A dependência só passa a ter efeito quando o PAR-A01 expuser deltas ou quando o kernel precisar gravar tentativa de modelo antes do backoff. Pergunta ao dono do K03 em §11.

## 9. Segurança

- Hooks e superfícies observáveis recebem apenas o resultado final (compatível com F18: observação destacada; nenhum parcial chega a hook).
- O guard SSRF, o pinning e o `redirect:'manual'` não mudam; o modo `stream` não abre outro caminho de rede.
- Erros e eventos não carregam corpo, quadro, delta, URL autenticada nem chave. O texto de parcial descartado não é logado.
- Dado de teste é sintético; nenhum provider real.

## 10. Critérios de pronto

Os testes da fase 1 estão em `packages/model-gateway/src/__tests__/aud0625-par-m01-streaming.test.ts` (31 testes: 4 controles e 27 `it.fails`; razão de cada falha verificada em [DISCOVERY](../04_audit/evidence/AUD0625-PAR-M01-D9-20261029/DISCOVERY.md)). No BUILD, **todos os `it.fails` viram `it`** sem afrouxar nenhuma asserção.

1. **Estado terminal único (D2).** Os testes do gateway: resultado único com texto concatenado; corte depois de deltas sem resultado e sem parcial em erro/evento; iterador sem `finish`; abort; evento depois de `finish`; segundo `finish`; perfil `streaming` sem `executeStream`; retry que devolve só a tentativa completa; saída estruturada só de stream completo.
2. **Uso desconhecido (D3).** Completo sem contadores = `unreported` com limite conservador; cortado e cancelado depois de saída = cobrado e marcado; falha antes de saída = como hoje.
3. **Leitores.** Multibyte dividido, CRLF/comentário/`data` multilinha, quadro incompleto nunca vira delta, JSON inválido, conteúdo depois de `[DONE]`, NDJSON com `done`, contador ausente.
4. **Tetos.** Eventos, bytes e ociosidade, cada um fechando o socket do servidor loopback.
5. **Transporte.** A `Response` resolve com o servidor ainda segurando o corpo; o teto de bytes segue cortando o socket no modo `stream` (controle que vale hoje).
6. **Controles.** O padrão continua `stream:false` e um resultado; perfil sem `streaming` nunca chama `executeStream`.
7. **Mutações** (cada uma precisa derrubar pelo menos um teste): remover a regra "primeiro terminal vence"; aceitar `delta` depois de `finish`; promover parcial a resultado em corte; tratar `usage` ausente como zero; cobrar zero na falha com saída; ignorar o teto de eventos; ignorar a ociosidade; interpretar quadro incompleto no fim; decodificar UTF-8 por chunk sem estado; não chamar `return()` no abort; fallback silencioso para `execute`; retry que reaproveita o texto da tentativa falha; teto de bytes desligado no modo `stream`.
8. **Gates:** `typecheck`, `eslint`, `prettier`, `docs:check-links`, campanha vitest de `packages/model-gateway` com `--maxWorkers=2`, `test:phase3`/`phase4a` se o gateway entrar neles, mutation-manifest religado se tocar uma fonte do manifesto, skip-catalog sem mudança (nenhum teste PG).
9. **Revisão independente** de outra sessão antes da integração.

## 11. Pedidos e pendências

**Decisões do Ricardo.** D1, D2 e D3 estão gravadas no recibo 14 e vinculam esta SPEC. O BUILD **não** está autorizado: depende de nova aprovação explícita deste documento.

**Decisões técnicas propostas (revisão T3 deste texto):**

- **T-1.** Os tetos novos (`maxStreamEvents` 4096, `maxStreamEventBytes` 64 KiB, `streamIdleTimeoutMs` 30 000 ms) e o `ModelProfile.streaming` opcional.
- **T-2.** Perfil `streaming` sem `executeStream` falha fechado (sem fallback silencioso).
- **T-3.** Nenhum código de erro, evento ou export público novo (mapeamento do corte para `provider_connection_reset`).
- **T-4.** Cobrar o limite conservador na falha/cancelamento **depois** de saída (§7.3). É a única mudança de contabilização.

**Perguntas a donos:**

- Dono do K03 (Codex): o stream interno do M01 precisa esperar o journal da 0225, ou a dependência só vale a partir do PAR-A01? A SPEC assume a segunda leitura.
- Dono da 0175: se a 0175 for aprovada depois, o teto de bytes de canal fica nela e o de modelo permanece aqui sem conflito (a parte de bytes de modelo é da 0248).

## 12. Fatias do BUILD (para estimativa; não autorizadas)

1. Tipos internos, máquina de estados e contabilização no gateway, com provider fake (~2 d).
2. `responseMode:'stream'` no transporte Node, com contrapressão, teto e limpeza (~2 d).
3. Leitor SSE e provider OpenAI-compatível em stream (~1,5 d).
4. Leitor NDJSON e provider Ollama em stream (~1,5 d).
5. Mutações, revisão independente, integração com orçamento e ledgers (~1 d).

## 13. Limites aceitos

- O servidor de falhas da 0232 não é reaproveitado como está (só aceita `stream:false`); estendê-lo é decisão separada.
- Sem provider real não se prova compatibilidade com um endpoint de produção; isso é T4.
- O limite conservador pode cobrar mais do que um stream cortado realmente consumiu; é a escolha de segurança de D3 (desconhecido nunca vira zero).
