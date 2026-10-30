# DISCOVERY — PAR-M01, streaming no gateway com um resultado terminal

Task `PAR-M01-PHASE1-D9-20261029` (Claude D9, Sonnet 5.5). Fase 1 do cartão PAR-M01 autorizada no recibo
`human-decisions-14` (sha256 `3acd13ef…`): DISCOVERY, SPEC `PROPOSED_FOR_HUMAN_T3_REVIEW` e testes
`it.fails`, **sem BUILD**. Base `claude/aud0625-wave3` @ `0efc427e3`. Entregas: a SPEC
[0284](../../../02_spec/0284_model_gateway_streaming_single_terminal.md) e o teste
`packages/model-gateway/src/__tests__/aud0625-par-m01-streaming.test.ts`. Produção `NO_GO`.

## 1. O que o cartão pede

PAR-M01 ([0380](../../../03_build/0380_backlog_paridade_100_deepseek.md)): stream por provider com
cancelamento, uso parcial e exatamente um resultado terminal. Aceite: todo stream termina em sucesso,
falha ou cancelamento; corte de conexão não grava resposta parcial como final. Decisões escolhidas (recibo
14): D1 stream só interno, D2 estado terminal único e parcial nunca final, D3 uso parcial ausente é
desconhecido, nunca zero.

## 2. O que a leitura do código mostrou

1. **Não há stream em lugar nenhum.** Os dois providers fixam `stream:false`
   (`openai-compatible.ts:150`, `ollama.ts:125`); `ModelProvider` só tem `execute`.
2. **O transporte vinculado bufferiza tudo.** `fetchWithResolvedAddress` → `readResponse` acumula todos os
   chunks e só devolve a `Response` no fim. Habilitar `stream:true` nos providers sem mexer nisso entregaria
   o corpo de uma vez: sem ociosidade, sem cancelamento no meio e sem teto de eventos que façam sentido.
   Este é o achado principal da descoberta: **o M01 exige trabalho no transporte, não só nos providers.**
   Prova: teste `hands over the Response while the server still holds the rest of the body`.
3. **O teto de bytes já funciona.** A SPEC 0248 destrói o socket no primeiro chunk que cruza o teto. Eu
   esperava que esse fosse um defeito do stream; a sonda mostrou que **não é** (o teste que escrevi como RED
   passou e virou controle). Falta teto de eventos e de ociosidade. Por isso a SPEC não depende da 0175
   (a parte de bytes de modelo é da 0248); a 0175 segue independente.
4. **Uso ausente já é "desconhecido" no caminho não-stream** (0267 §3.3). Mas uma tentativa que **falha**
   hoje não é contabilizada, então um stream que gerou saída e foi cortado contaria zero. Isso fere a D3 e
   é a única mudança de contabilização da SPEC (§7.3), limitada a perfil com `streaming:true`.
5. **O servidor de falhas da 0232 não serve como está**: aceita só `stream:false` e o `synthetic-sse` é um
   fixture de bytes, não uma resposta de provider (a 0232 diz que não prova o M01). Os testes usam servidores
   loopback próprios, escritos para soltar um fragmento, esperar e soltar o resto.
6. **Retry e circuito já classificam o corte** como `connection` → `provider_connection_reset`, retentável e
   contado no circuito. Não é preciso código de erro novo.

## 3. Prova (sem BUILD)

- `red-on-base.txt`: o arquivo como está commitado, `4 passed | 27 expected fail (31)`.
- `failure-reasons.txt`: o mesmo arquivo com `it.fails`→`it`, a razão de cada falha. Os 27 RED falham por
  ausência do caminho (`provider has no executeStream`, `Unexpected model gateway error` por chamar `execute`
  num perfil `streaming`, `still-buffering` no transporte). Nenhum falha por erro de digitação do teste.
- 4 controles: o fixture loopback de fato entrega o multibyte partido em duas escritas e incrementalmente;
  o padrão segue `stream:false` e um resultado; perfil sem `streaming` nunca chama `executeStream`; o teto de
  bytes corta o socket.

**Limite honesto.** Como o caminho não existe, 19 dos 27 RED falham pelo mesmo primeiro motivo (sem
`executeStream`). Isso mascara asserções posteriores até o BUILD: quando eles virarem `it`, é esperado
descobrir ajustes de oráculo. A SPEC exige que isso se resolva corrigindo o teste, nunca afrouxando a
asserção, e que o conjunto de mutações (§10.7) seja o guarda real.

## 4. Riscos que a SPEC trata

| Risco | Tratamento |
| --- | --- |
| Parcial promovido a final por corte | máquina de estados com terminal único; texto só vive no montador (§4.1) |
| Multibyte dividido vira U+FFFD | decodificação UTF-8 incremental (§6.1) |
| Quadro incompleto no fim interpretado | nunca interpretado (§6.1, teste) |
| Conteúdo depois de `[DONE]`/`done:true` | violação, `provider_malformed_response` |
| Corpo hostil sem fim | teto de bytes, de eventos, de quadro e de ociosidade (§6.3) |
| Uso parcial virar zero | §7: desconhecido, cobra o limite conservador |
| Fallback silencioso para o caminho sem stream | perfil `streaming` sem `executeStream` falha fechado |
| Parcial vazando em erro/evento/log | proibido e testado (`PARCIAL-SECRETO`) |

## 5. Perguntas em aberto

Em §11 da SPEC: se o stream interno do M01 precisa esperar o journal do K03 (a SPEC assume que não, só o
A01 depende), e as quatro decisões técnicas T-1 a T-4 para a revisão T3.

## 6. Tamanho

M ≈ 8 dias no 0380; a fase 1 aqui consumiu o item 1 das fatias. As fatias do BUILD estão em §12 da SPEC
(≈ 8 dias).
