# RESULT — PAR-M01 BUILD, SPEC 0284 (fatias 1 a 5)

Task `PAR-M01-BUILD-D9-20261029` (Claude D9, Sonnet 5.5). BUILD aprovado no recibo
`human-decisions-15` (sha256 `ab6623b1…`, copiado byte a byte), com T-1 a T-4. Não autoriza provider
real nem export público (PAR-A01). Branch `claude/aud0625-par-m01-d9`, local, sem push, sobre a onda 3
`0efc427e3`. Produção `NO_GO`.

| Fatia | Commit | O que entrega | it.fails invertidos | Mutantes |
| --- | --- | --- | --- | --- |
| 1 | `b455e48b3` | `stream.ts` (terminal único), `streaming` no perfil, cobrança conservadora, fecha-fechado sem `executeStream` | 13 | 11/11 |
| 2 | `db05b3116` | `responseMode:'stream'` no transporte vinculado (2xx com corpo; teto, contrapressão, cancel) | 1 | 8/8 |
| 3 | `1b6deb6a7` | `stream-reader.ts` (SSE/NDJSON, tetos de bytes/eventos/quadro/ociosidade) e `OpenAICompatibleProvider.executeStream` | 10 | 19/19 |
| 4 | `9bda49062` | `OllamaProvider.executeStream` (NDJSON) | 3 | 10/10 |
| 5 | este | orçamento e medidor com stream, gateway + providers reais em loopback, guarda do barrel, mutações de contabilização | — | 4/4 |

Total: 27 `it.fails` da fase 1 invertidos (0 restantes) e 52 mutantes mortos. Os resultados por mutante estão em
`mutation-results-slice*.json` (`run-mutations.py` restaura a fonte byte a byte). Mutantes equivalentes
documentados: `:` de comentário SSE (redundante com a checagem do campo `data`), `?? 0` dentro de um ramo já
protegido por `&&` no Ollama, e "close" e "error" do transporte, que se cobrem mutuamente (só remover os dois mata).

## Revisão das fatias 1 e 2 (DF, APPROVE)

Registrada pela mensagem do DF (29/10/2026): único terminal; parcial fora de erro; evento depois de `finish`,
delta não-texto e uso duplicado/inválido rejeitados; `close()` chama `return()` com 1 s de graça; T-2 fecha
fechado; cobrança conservadora só com `outputSeen`; transporte entrega nos headers só 2xx com corpo, teto por
chunk, contrapressão, cancel destrói o socket, chunk copiado. Nota para as fatias 3–4 (cumprida): depois que a
`Response` sai nos headers o corte passa a depender do cancel do leitor. Testes: teto de eventos (4096 padrão,
testado com 32 e teto de bytes alto para que só o de eventos possa parar), teto de bytes por evento (idem),
ociosidade que cancela o leitor e fecha o socket (SSE e NDJSON), e os mutantes "leitor sem cancel no abort"
(`S3-M17` com `fetch` injetado que ignora o sinal, `S3-M18`) e "sem cancel ao sair" morrem.

## Esclarecimentos de implementação (dentro da SPEC)

- `[DONE]` sem `finish_reason` é `malformed_response`; corpo que acaba sem `[DONE]` mas com `finish_reason` é
  aceito; corpo que acaba sem nenhum dos dois é `connection`.
- O provider emite `usage` e `finish` uma vez, no fim, porque o OpenAI manda o `usage` depois do chunk de
  `finish_reason` e o gateway recusa qualquer evento depois de `finish`.
- Resposta OpenAI-compatível que não é `text/event-stream` é `malformed_response`.
- Linha/quadro incompleto no fim (sem `\n` final ou sem linha em branco) nunca é interpretado, mesmo em fim limpo.
- A graça de 1 s do `return()` é constante interna (`CLOSE_GRACE_MS`).

## Gates (Node 22.23.2)

`npm run typecheck` 0; eslint e prettier limpos; `packages/model-gateway` 270 testes; dependentes
(`agent-runtime`, `chaos`, consumidores, arquitetura, conformance, fault server, `shift-assistant`) 64 arquivos,
972 passam; `docs:check-links`, `mutation:guard` e `skip:governance` PASS. Nenhuma fonte do mutation-manifest
(`ssrf.ts` do `@cvg/shared` etc.) nem do skip-catalog foi tocada: o `ssrf-node.ts` do gateway não é do manifesto.
Sem migration. Sem PG.

## Limites

- A contrapressão (`pause()`/`resume()`) não tem teste que a distinga de um leitor sem pausa: o buffer do kernel
  esconde a diferença em loopback. Ela foi revisada por leitura.
- Sem provider real (T4): a compatibilidade com um endpoint de produção não está provada.
- O stream segue interno: nenhum símbolo novo no barrel (teste); deltas ao cliente são do PAR-A01.
