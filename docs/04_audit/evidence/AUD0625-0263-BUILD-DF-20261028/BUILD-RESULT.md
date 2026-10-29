# AUD0625-0263-BUILD-DF-20261028 — BUILD isolado da SPEC0263

- SPEC: `docs/02_spec/0263_egress_dns_cancellation.md` R2, sha256
  `3df9fa123c53f339d847d770e4c6521a76993cdd64908e0279dad2d1106509c2`, copiada
  byte a byte do checkout de trabalho, sem alteração.
- Autorização: BUILD T3 aprovado (`USER-DECISIONS-20261028/human-decisions.json`)
  e BUILD **isolado** autorizado (`human-decisions-6.json`). O aceite final
  continua dependente de HISO-005/HISO-006.
- Base: `candidate/aud0625-wave-20261028` @ `63fc98621` (PR #32). Executor:
  Claude DF.

## O que mudou

- `packages/shared/src/ssrf.ts`:
  - **`awaitWithSignal`:** helper interno (§3) que confere o abort antes de
    instalar o listener e de novo antes de invocar, observa throw síncrono e
    settlement tardio, remove o próprio listener em toda saída e entrega o
    valor tardio para descarte.
  - **`resolveAndGuardOutboundUrl`:** ganha `signal` no terceiro argumento. O
    abort prevalece antes de qualquer I/O, inclusive para IP literal. O DNS
    espera pelo helper, e cancelamento não vira `dns_resolution_failed`.
  - **Lookup padrão:** revalida o sinal depois do `import('node:dns/promises')`,
    imediatamente antes do lookup real (D15).
  - **`fetchWithSsrfGuard`:** usa o `init.signal` do caller em todo DNS e todo
    hop, sem criar timeout por hop. Corpo de resposta descartada (redirect,
    tardia, abortada) é cancelado sem espera e com a rejeição observada (§4).
    `GuardedFetchResponse.body` passa a ser opcional.
  - **Erros:** `AbortError` e `TimeoutError` constantes, como `Error` com
    `name`. O motivo customizado não vaza. Foi usado `Error` em vez de
    `DOMException` porque, sob jsdom (ambiente do vitest), `DOMException` não
    é `instanceof Error`, e os mapeadores (`networkError`) exigem `Error`.
  - Sinal presente e inválido dá `TypeError` antes de I/O.
- `packages/{model-gateway/src/providers,channel-gateway/src/adapters}/ssrf-node.ts`:
  - o sinal é conferido antes e depois do `encodeBody` e dentro do executor da
    promise, imediatamente antes de `httpRequest`/`httpsRequest`;
  - o `reason` que for `Error` é preservado (SPEC0180).
- `packages/channel-gateway/src/exam-egress.ts`: a resolução preliminar recebe
  o mesmo sinal combinado do upload/download.
- Providers e canais: já passavam o sinal composto no `init`, sem mudança.

## Aceites (tabela §6)

| ID | Prova | Base (RED) |
| --- | --- | --- |
| D01 | `aud0625-0263-ssrf-cancellation`: pre-abort sem lookup e sem fetch; IP literal com reason custom sem vazar; thunk que aborta sincronamente com promise pendente, com listener balanceado e rejeição tardia observada; throw síncrono observado | 3 RED, throw síncrono é controle |
| D02 | abort no DNS inicial encerra sem esperar; liberar depois não chama fetch | RED (timeout) |
| D03 | abort no DNS do segundo hop; só o primeiro fetch | RED |
| D04 | rejeições tardias de lookup/fetch sem `unhandledRejection` | RED |
| D05 | `AbortSignal.timeout(80)` com DNS de 30 ms e vários hops encerra no prazo original | RED |
| D06 | abort logo depois de resolver o DNS e antes do dispatch: zero fetch | RED |
| D07 | positivo com DNS imediato e com atraso, redirects relativo e absoluto, `too_many_redirects` | controle |
| D08 | privado, misto, vazio e falha continuam recusados com sinal presente | controle |
| D09 | cancelamento no DNS é `AbortError` constante; provider retorna `cancelled`/`timeout` (`aud0625-0263-provider-dns-cancel`) | RED |
| D10 | cancel do redirect antes do próximo DNS, com cancel e DNS pendentes; cancel rejeitado observado; resposta tardia cancelada; terminal entregue | 2 RED, 1 controle |
| D11 | listeners balanceados em sucesso, erro e abort; positivo seguinte | RED |
| D12 | coberto pelos testes de loopback existentes (`local-http-providers` "stalled loopback", `bound-transport-node22`) e pelo controle real do D16 | — |
| D13 | provider com DNS lento (`cancelled`, `timeout`, zero fetch); exam cancelado no DNS preliminar dá `REJECTED`, nenhum registro no journal, zero fetch (`aud0625-0263-exam-dns-cancel`) | 3 RED |
| D14 | pacotes shared, model-gateway e channel-gateway e fault-server: 599 passam; 1 timeout de carga em arquivo não tocado (passa isolado) | — |
| D15 | `aud0625-0263-dns-import-barrier`: abort durante o carregamento do módulo, zero lookup nativo depois de liberar | RED; o controle dessa base falha só por efeito colateral do lookup tardio do teste anterior |
| D16 | `aud0625-0263-transport-abort` nos dois transportes: abort com `Blob.arrayBuffer` pendente e pre-abort dão zero `ClientRequest` criados (canal `http.client.request.created`); o controle real em loopback cria 1 | 4 RED, controles passam |

Saídas: `red-on-base.txt`, `red-on-base-transport-dns.txt`, `red-on-base-d13.txt`, `gates.txt`.

## Limites

- O lookup nativo já iniciado no SO não é interrompido. Cancela-se a espera
  lógica, e o resultado tardio não tem autoridade (§3).
- Evolution/Chatwoot não ganharam teste próprio de DNS lento: usam o mesmo
  guard e o mesmo `init.signal`, já criado antes do guard.
- PG e E2E não se aplicam a esta fatia. A barra da CI cobre o resto no PR.
- O aceite formal continua pendente de HISO-005/HISO-006.
