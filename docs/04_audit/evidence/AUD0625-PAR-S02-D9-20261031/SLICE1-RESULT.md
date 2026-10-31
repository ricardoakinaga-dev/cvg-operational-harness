# PAR-S02 fatia 1 — redutor de turnos e projeção pura (SPEC 0292 R1 §7)

Autor: Claude D9. Branch `claude/aud0625-par-s02-build-d9` sobre a onda 5 `ca2c996cb` (+ SPEC 0292 R1 por cherry-pick de `616ab49d1` e `2bac19988`).

## O que entrou

- `packages/harness/src/session/turn-analysis.ts`: `foldTurnAnalysis(estado, eventos, contexto?)`, o redutor de turnos do S04 que agrupa um evento por vez. Efeitos laterais fora do estado: `closedIds` (recusa de turnos intercalados, só na análise completa), `onClose` e `deferred` (o primeiro erro de relatório de grupo, para os erros de agrupamento do log inteiro continuarem vindo primeiro).
- `fork.ts`: `analyzeSessionLog = fold(inicial, eventos)` + `finishTurnAnalysis`; a regra de `inheritableThrough` e `openTurn` ficou onde estava.
- `packages/harness/src/session/projection.ts`: `emptySessionProjection`, `projectSession`, `foldSessionProjection`, `currentStops`, `sessionProjectionStateBytes`, `SESSION_PROJECTION_RECENT_STOPS = 32`, `SESSION_PROJECTION_MAX_STATE_BYTES = 64 KiB`.
- `packages/contracts/src/session-projection.ts`: `SessionProjection`, `OpenGroup`, `ClosedTurns`, `StopLog`, `Stop`, `CallRef`.

## Provas (PJ01–PJ03, PJ09/PJ10 puros, PJ11 parcial)

- **Critério de aceite FP/FK do S04:** os 44 testes de `tests/par-s04-session-fork-edges.test.ts` e `tests/aud0625-par-s04-red.test.ts` passam sem alteração. Além disso, o `analyzeSessionLog` antigo está copiado literalmente no teste como oráculo: 2400 logs aleatórios (um terço corrompido: lacuna, sobreposição, `turn/end` duplicado, turno que volta) dão a mesma análise ou o mesmo erro.
- A projeção concorda com a análise nos mesmos 2400 logs em `inheritableThrough`, contagens por estado e último turno (marcador de compactação fora).
- `fold(proj(1..k), k+1..n) = proj(1..n)` em todos os cortes de 800 logs aleatórios (mais de 3000 cortes), inclusive no meio de um turno e entre `tool/call` e `tool/result`.
- Os 11 testes RED da fase 1 (`tests/aud0625-par-s02-red.test.ts`) viraram verdes sem relaxar corpo algum. Duas correções no próprio teste, não na asserção: o controle "não existe projeção" virou "a API existe" (inverteu por construção), e o teste de compactação renumera a sequência depois de tirar o marcador, porque o filtro deixava um buraco que a análise corretamente recusa.
- Teto do estado (400×3 paradas finais cabem em menos de 64 KiB), cauda com lacuna ou sobreposição, versão errada, turno intercalado (recusado do zero, aceito pelo `fold` no corte, I2), `turn/end` duplicado, golden da saída para um log de referência (muda só com `SESSION_PROJECTION_VERSION`), sem texto de mensagem, resumo ou entrada de ferramenta no estado.
- Cobertura 100% por arquivo em `turn-analysis.ts`, `projection.ts` e `fork.ts`.
- Mutantes: 27/27 mortos (`mutations-slice1.json`). Seis sobreviveram na primeira passada: quatro eram código equivalente (o rastreio de `turn/end` duplicado da projeção e o desvio de grupo-marcador em `currentStops`, ambos inalcançáveis porque o duplicado já é recusado), então o código foi removido; os outros dois exigiam comparar a projeção com a análise, hoje coberto pelo teste de concordância.
- typecheck, eslint, prettier: limpos.

## Desvios e achados para a SPEC

1. `openCalls` é uma lista de pares (`[toolId, CallRef[]]`), não um `Record`: com `Record`, um `toolId` como `"2"` ou `"1"` reordena as chaves e muda a ordem dos efeitos incertos em relação à análise de sempre (o teste fixa isso).
2. `OpenGroup` ganhou `start`/`startType` e `CallRef` (`operationKey`, `sequence`, `eventId`): sem a referência do evento, `currentStops` não poderia citar a origem do `open_turn` e do `uncertain_effect` (I3). `endCount` substitui um `end` repetido.
3. **Achado (P3 da SPEC):** `uncertain_effect` é derivado só do grupo aberto, como a SPEC manda. Um efeito incerto de um turno que já foi fechado por um turno posterior some de `currentStops` (continua em `lastTurn` enquanto for o último e quebra `inheritableThrough`). Quem quiser a lista completa precisa de outra projeção; não mudei o contrato.
4. `foldTurnAnalysis` fica exportado de `@cvg/harness` (via `session/index.ts`) porque a persistência da fatia 2 o usa; é aditivo.

## Não feito (fatias seguintes)

Tabela e migração opt-in, `project` com os três `origin`, `verifyProjectionCache` (fatia 2); gatilho no `append` que cruza K, estado dobrado no escritor, tolerância a falha com contador (fatia 3); `resumeSession` pelo checkpoint (fatia 4). Os testes RED em PG (`aud0625-par-s02-red-postgres.test.ts`) continuam `it.fails` até a fatia 2.
