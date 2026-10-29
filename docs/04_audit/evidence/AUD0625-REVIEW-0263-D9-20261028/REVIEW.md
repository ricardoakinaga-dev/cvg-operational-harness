# Revisão independente — SPEC 0263 (cancelamento durante DNS e entre hops, U06), BUILD do DF

Branch `claude/aud0625-0263-df` @ `7a7d0d28` (base `63fc9862`). Revisora: sessão Claude D9, somente leitura sobre uma cópia detached, Node 22.23.2, `--maxWorkers=2`, carga 14–20 (por isso nenhum PG nem E2E; não se aplicam a esta fatia). Sem push. Aceite final continua dependente de HISO-005/006, como a SPEC e o BUILD-RESULT dizem.

## Veredito: APPROVE, sem obrigatórios (3 P3 de teste e 2 observações)

Não achei defeito de código. Os seis arquivos de teste da 0263 passam (28/28), os pacotes `shared`, `model-gateway` e `channel-gateway` passam inteiros (50 arquivos, 559 testes) e das 30 mutações que tentei, 18 morrem sozinhas; as 12 que sobrevivem são camadas redundantes de uma mesma defesa (uma delas, A14, é lacuna real de teste), e todas as combinações dessas camadas morrem. Os P3 são de teste: cada camada de defesa redundante, sozinha, não é fixada por um teste.

## Foco pedido

1. **`awaitWithSignal` (listener, throw síncrono, valor tardio).** Confere o abort antes de instalar o listener e de novo antes de invocar o thunk, captura o throw síncrono, instala os handlers de fulfillment e rejeição também depois de um abort síncrono dentro do thunk, remove o próprio listener em toda saída e entrega o valor tardio ao descarte (`discardResponse`), com erro de limpeza engolido. Mutações mortas: listener não removido (A2), valor tardio não descartado (A3), rejeição tardia sem handler (A13, 5 falhas, `unhandledRejection`), cancel de corpo sem observar a rejeição (A19).
2. **Checagem final antes do dispatch.** O sinal é conferido na entrada de `resolveAndGuardOutboundUrl` (inclusive IP literal), depois do lookup, no `catch` do DNS (cancelamento nunca vira `dns_resolution_failed`: A4 mata 12), na entrada do helper, depois do listener e depois da resposta; nos transportes, antes e depois do `encodeBody` e dentro do executor imediatamente antes de criar a requisição. Mutações: cada camada sozinha **sobrevive** (A5, A6, A8, A16, A17, T1–T3 dos dois transportes) porque as outras a cobrem, mas as combinações **morrem** (C1–C4: as três camadas do transporte, as duas últimas, as de entrada+helper, todas as de pré-dispatch). Ou seja, o conjunto de testes prova o comportamento, só não fixa cada camada isolada (P3-a).
3. **Erros constantes.** `AbortError`/`TimeoutError` como `Error` com `name` (por causa do jsdom), mensagem constante, motivo customizado não vaza (A12 morre, 2 falhas), `TimeoutError` reconhecido pelo `name` do motivo (A11 morre), sinal presente e inválido dá `TypeError` antes de I/O (A10 morre). O motivo `Error` nos transportes continua preservado como na 0180 (T4 morre nos dois).
4. **Transportes e `diagnostics_channel`.** Os testes contam `http.client.request.created` (D16): zero requisições com `Blob.arrayBuffer` pendente e com pré-abort, e uma no controle real em loopback. Fixos os dois transportes (model e channel) e o `exam-egress` (X1, preliminar sem sinal, morre).
5. **D15 com `vi.mock`.** O teste segura a carga de `node:dns/promises` com `vi.mock`, aborta durante a carga, libera e espera 10 ms: zero chamadas ao lookup nativo; o controle sem abort resolve uma vez. A7 (tirar a checagem depois do `import`) morre com 2 falhas.
6. **Mutações numa cópia minha.** 17 no `ssrf.ts` ([mutations-shared.txt](proofs/mutations-shared.txt)): 11 mortas, 6 sobrevivem individualmente (as camadas redundantes acima, mais A14); 9 nos transportes e no exam ([mutations-transport.txt](proofs/mutations-transport.txt)): 3 mortas, 6 redundantes; 4 combinadas ([mutations-combined.txt](proofs/mutations-combined.txt)): todas mortas.

## P3 (testes, não bloqueiam)

- **P3-a:** cada checagem de pré-dispatch isolada sobrevive (A5, A6, A8, A16, A17, T1, T2, T3). O que falta é um teste de `resolveAndGuardOutboundUrl` direto com sinal já abortado e IP literal, outro com abort logo depois do lookup resolvido (a rota do `exam-egress`), e um do helper com abort entre a resolução da promessa e a continuação.
- **P3-b (A14):** se o thunk lança de forma síncrona, o código chama `settle`, que remove o listener. Trocar por `reject(error)` direto deixaria o listener preso ao sinal e **nenhum teste percebe**: o teste do throw síncrono não afirma o contador de listeners (o D11 só afirma sucesso, erro e abort). Um sinal de vida longa acumularia um listener por chamada que falha de forma síncrona.
- **P3-c:** a ordem das checagens faz um sinal abortado com URL inválida dar `AbortError` em vez de `UnsafeUrlError`. É coerente com "cancelamento prevalece" (§4), mas nenhum teste fixa a ordem.

## Observações

- Evolution e Chatwoot não têm teste próprio de DNS lento (o BUILD-RESULT já diz). Confirmei que os dois passam o `signal` no `init` do `fetchWithSsrfGuard` e ainda envolvem a chamada em `raceSignal`, então o caminho é o mesmo dos testes do guard.
- Um lookup nativo iniciado não é interrompido (limite declarado na SPEC §3). O D12 (loopback real) reaproveita testes antigos em vez de teste novo.

Nada disto muda o aceite técnico. Produção segue `NO_GO`.
