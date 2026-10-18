# PARE100-GAP-20261016 — análise de lacunas por capacidade, CVG × DeepSeek

- Task: `PARE100-GAP-20261016-F5` (Claude Code, sessão `f5`). Pedido do usuário em 16/10/2026: backlog e roadmap para o operational-harness alcançar 100% de pareamento com o DeepSeek Harness.
- Saídas: [roadmap 0379](../../../03_build/0379_roadmap_paridade_100_deepseek.md) e [backlog 0380](../../../03_build/0380_backlog_paridade_100_deepseek.md).
- Referência: `/home/ricardo/deepseek-harness-session-fixes`, commit `768fb1f3`, versão `0.2.0-rc.1` (o mesmo pin do plano 0376). CVG: checkout principal em 16/10/2026, HEAD `ca565391` mais o trabalho não commitado do PARE100 presente no diretório.

## Método

Cinco grupos de famílias, analisados em paralelo e somente em leitura, com as instruções comuns de [BRIEF.md](BRIEF.md):

| Grupo                                         | Arquivo                                                    | Executor                    | Capacidades | Presentes | Parciais | Ausentes | Divergentes ou N/A |
| --------------------------------------------- | ---------------------------------------------------------- | --------------------------- | ----------- | --------- | -------- | -------- | ------------------ |
| G1 — núcleo, modelo, sessão e contexto        | [G1-nucleo-modelo-sessao.md](G1-nucleo-modelo-sessao.md)   | sessão Claude Code (Haiku)  | 50          | 3         | 17       | 30       | —                  |
| G2 — ferramentas, contenção e protocolos      | [G2-ferramentas-contencao.md](G2-ferramentas-contencao.md) | sessão Claude Code (Sonnet) | 67          | 1         | 16       | 50       | —                  |
| G3 — orquestração e extensões                 | [G3-orquestracao.md](G3-orquestracao.md)                   | subagente Sonnet            | 56          | 0         | 12       | 40       | 4                  |
| G4 — API, SDK, host e operação                | [G4-api-sdk-host-ops.md](G4-api-sdk-host-ops.md)           | subagente Sonnet            | 47          | 2         | 21       | 22       | 2                  |
| G5 — aplicações, interface e interação        | [G5-ui-apps-interacao.md](G5-ui-apps-interacao.md)         | subagente Sonnet            | 46          | 3         | 10       | 33       | —                  |
| **Total**                                     |                                                            |                             | **266**     | **9**     | **76**   | **175**  | **6**              |

A sessão coordenadora consolidou os 266 itens em 111 cartões ([generator/cards.py](generator/cards.py)) e gerou o backlog e os totais com [generator/gen.py](generator/gen.py). [generator/totals.json](generator/totals.json) traz esforço, caminho crítico e calendário por marco; [generator/map.json](generator/map.json) traz a correspondência P100 → PAR. Os hashes estão em [SHA256SUMS](SHA256SUMS).

Para reproduzir: `python3 -I gen.py <pasta-do-generator> cards.md map.json > totals.json`.

## Conferências feitas pela sessão coordenadora

- `stream: false` fixo em `packages/model-gateway/src/providers/openai-compatible.ts:145` e `ollama.ts:120`: confirmado.
- Nenhum SSE, WebSocket ou `EventSource` em `packages/` e `apps/` fora de testes: confirmado.
- `landlock` em `packages/sandbox/src/capabilities.ts` sem `landlock_create_ruleset` ou `landlock_restrict_self` aplicados: confirmado.

## Limites

- Análise por leitura de README, entrypoints, tipos públicos e grep. "AUSENTE" significa "não encontrado por grep", não prova de ausência.
- Nenhum teste foi executado nos dois repositórios; nenhuma capacidade tem `PASS_CURRENT` por esta evidência. A contagem é indicativa e não substitui a medida do PAR-Q01/PAR-Q05.
- Tamanhos (P, M, G, GG) são estimativas de engenharia de cada analista, normalizadas pela coordenação; os dias são equivalentes de engenharia humana, a recalibrar pela velocidade real (roadmap 0379).
- Os IDs de capacidade repetem prefixos entre grupos (por exemplo `SUB-01` em G2 é subprocesso e em G3 é subagente). O backlog cita sempre com o grupo: `G2/SUB-01`.
- Sem dados reais, sem leitura de `~/.dsh` ou `~/Documentos/deepseek-harness`, sem cópia de código da referência.
