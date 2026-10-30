# PAR-M02 — RESULT do BUILD (SPEC 0289, tarefa AUD0625-PAR-M02-D9-20261029)

Estado: BUILD local concluído, sem push; produção `NO_GO`. Autorizado por `human-decisions-21.json` (sha256
`ea036fc4…ee5f5e`, vinculado à SPEC `4565ef91…` e a `12edd8350`): D1-A, D2-A, D3-A. Base: C02 `2aad7d0b7`.

| Fatia | SHA | Conteúdo |
|---|---|---|
| fase 1 | `12edd8350` | DISCOVERY, SPEC 0289, RED (3 controles, 6 `it.fails`) |
| 1 | `77558562a` | `frozen-request.ts`; congelamento por candidato; `requestSha256`/`requestBytes`/`frozenRequest` no `model.call.started`; opção `recordFrozenRequests`; 6 `it.fails` invertidos e 7 testes novos |
| 2 | este commit | mutantes, RESULT, ledgers |

## O que mudou

- `packages/model-gateway/src/frozen-request.ts` (novo): forma canônica `frozen-request-v1`, identidade (SHA-256 e tamanho em
  bytes UTF-8) e as cópias congeladas de `metadata` e `promptBinding`.
- `gateway.ts`: em `#runCandidate`, as partes imutáveis são construídas e congeladas **uma vez por candidato** (cópias
  próprias de `metadata` e `promptBinding`; `input` já vinha congelado) e a identidade é calculada delas; cada tentativa
  recebe `Object.freeze({ ...partes, signal })`. As partes congeladas são compartilhadas entre as tentativas do candidato
  porque são imutáveis; o custo é linear (um freeze por mapa, não por chave). O `#assertPromptStillApproved` continua usando
  o binding interno do renderizador, que nenhum adaptador alcança.
- `model.call.started` ganha `requestSha256` e `requestBytes` ao lado do `projectedInputTokens`; `frozenRequest` (os bytes)
  só aparece com `recordFrozenRequests: true` (padrão desligado) e só nesse evento. A recusa antes do despacho continua sem
  evento e sem identidade.
- Sem export novo no barrel de `@cvg/model-gateway`; `ModelGatewayRequest`/`ProviderRequest` mantêm os campos. Os campos
  novos são do tipo de evento e da opção do gateway.
- C02 preservado: o catch (accounted antes do settle, `settlementFailed`, parada do fallback) não foi tocado; a suíte da
  C02 passa inteira.

## Verificação

- `packages/model-gateway` 308 → 315 testes; mais 22 arquivos de consumidores do gateway em `tests/`, `apps/`, `packages/`:
  39 arquivos, 662 testes passam (5 pulados do PG).
- Teste de linearidade: com 5 000 chaves de `metadata`, `Object.freeze` roda < 200 vezes e no máximo 2 sobre mapas
  grandes.
- typecheck, eslint, prettier, `docs:check-links`, `skip:governance` PASS.
- Mutantes (`mutations.json`, `mutation-results.json`): 17; 16 mortos. **M3** (não congelar o objeto das partes)
  sobrevive e é **equivalente**: o adaptador nunca recebe esse objeto, só a cópia por tentativa (M6 cobre essa); o freeze
  das partes é defesa em profundidade.

## Limites

- O gateway não vigia o fio: um adaptador que serializa algo diferente do que recebeu continua coberto só pela
  verificação de `promptBinding` do `input` (SPEC 0267), fora do escopo.
- Com a gravação ligada o evento contém conteúdo da requisição (dado clínico possível): o sink de eventos precisa ser
  protegido por tenant e ter retenção definida (D1-A); o gateway não consegue verificar isso.
- Uma escrita bloqueada é um `TypeError` do adaptador, tratado como erro comum (D2-A), sem código novo.
