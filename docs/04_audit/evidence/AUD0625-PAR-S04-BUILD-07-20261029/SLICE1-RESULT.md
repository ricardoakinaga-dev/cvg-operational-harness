# PAR-S04 BUILD, fatia 1: funções puras (SPEC 0287 §3-§4, §8.1)

Task `AUD0625-PAR-S04-BUILD-07-20261029` (Claude Sonnet 5.5, sessão 07). Autorização: recibo [human-decisions-23](../USER-DECISIONS-20261028/human-decisions-23.json) (sha256 `9074762075fbe9d494a3f013dc7a188d2ca6fb339a76a3eec2e2cac6b8882077`, vinculado à SPEC 0287 e ao `c86d6b3c3`): FK-A..FK-F como recomendado (prefixo estrito; turno com efeito incerto fora; `SessionForkRefusedError` com códigos fechados; só no serviço de persistência; seeded sem linhagem continua válido; profundidade 16). Sem push.

## Entregue

- `packages/harness/src/session/fork.ts` (exportado por `session/index.ts`): `analyzeSessionLog`, `planSessionFork`, `sessionForkSourceDigest`, `SessionForkRefusedError` (6 códigos fechados), `SESSION_FORK_MAX_DEPTH = 16`. Puro: sem IO, sem relógio, não muta a entrada.
- Testes: os 25 do RED viraram verdes sem enfraquecer asserção (`tests/aud0625-par-s04-red.test.ts`) e 15 casos de borda novos (`tests/par-s04-session-fork-edges.test.ts`).

## Decisões de implementação que a SPEC deixava abertas

- Par `tool/call` ↔ `tool/result`: o resultado não carrega `operationKey`; casa-se por `toolId`, em ordem (FIFO) dentro do turno. Resultado sem chamada é ignorado; chamada sem resultado é incerta.
- Log não analisável (fail-closed, `SessionPersistenceCorruptionError`, já aprovada; a classe própria `SessionLogUnanalyzableError` foi removida na revisão do DF por não estar no recibo 23): sequências que não são contíguas a partir de 1, turnos intercalados, mais de um `turn/end` no mesmo turno.
- Grupo só de `context/compacted` (correlationId próprio) é um marcador atômico `completed`.
- `openTurn` = o turno aberto mais recente (os anteriores continuam em `turns`).
- Profundidade: `sourceLineage` opcional; sem ele a origem conta como profundidade 0.
- Os RED traziam contagens de sequência erradas (12/6 onde o fixture dá 10/4) e uma checagem por substring (`c3` casa hex do fingerprint); corrigidos nos testes, a regra testada é a da SPEC.

## Verificação

| Gate | Resultado |
| --- | --- |
| vitest (2 arquivos) | 40/40 |
| cobertura por arquivo de `fork.ts` (`CVG_COVERAGE_PER_FILE=1`, `--coverage.include`) | 100% stmts/branches/funcs/lines (92/92, 57/57, 16/16, 79/79) |
| `npm run typecheck` | 0 |
| eslint, prettier | limpos |
| mutação (`mutate-s1.py`, `mutations-s1.json`) | 13/13 mortos: turno não concluído contado, efeito incerto ignorado, corte além do herdável (off-by-one), sessionId mantido, renumeração, assistant dispensado, `deadline` fora do conjunto, chamada sem resultado ignorada, profundidade não cresce, alvo = origem, digest fora de ordem, primeiro aberto em vez do último, lacuna de sequência aceita |

Duas mutações sobreviveram na primeira rodada (corte `+1`; digest invertido que o próprio plano repetia) e viraram os testes "turno aberto de um evento" e "digest = hash documentado de `sequência:input_digest`".

## Achado para cartão próprio (fora do S04)

**Aprovação sem vínculo à sessão** (DISCOVERY, achado 3): o `#validateBinding` do engine liga ação/recurso/payload/agente/política, não `sessionId`; uma aprovação `APPROVED`, de uso único, não consumida e no prazo vale para a mesma ação e payload em outra sessão do mesmo tenant. O fork não agrava (nada de aprovação atravessa, I5/I6) e a prova FP07 chega na fatia 3, mas o risco existe independente do fork. Recomendo cartão separado; o DF leva adiante.

## Próximo

Fatia 2: `fork` transacional e `verifySessionFork` no adaptador PG (FP04, FP05, FP06, FP09), com testes PG e de processos e skip-catalog.
