# Delta proposto para os ledgers — HISO005-P2-BUILD-0244 (CONT-20261018-D9EF)

Texto para o lead integrar. Esta unidade não editou `99`, `20`, `30`, a coordenação, o catálogo central nem `docs/02_spec`. Evidência: [relatório](REPORT.txt), [aceites](acceptance-status.json), [comparação B6](b6-final-comparison.json), [conservação](conservation-r3.json), [margens](usage-margins.json), [promoção](promotion-deltas-prepared.json), [recibo de liberação](runtime-release-receipt.json).

## `docs/99_runtime_state.md`

- `last_completed_action`: BUILD local da SPEC0244 (SHA `50463db7…`) na candidata detached `/mnt/dados/cvg-work/cvg-hiso005-build0244-20261019`.
  - Commit `fd4d641e8f28` sobre `1073a9dd` (PR #8).
  - certify 16/16, consumidor fresco PASS.
  - B6 na raiz `228e7918`: de 13.521 para 12.283 diagnósticos, com 0 provas e 0 violações.
- `status`: `READY_FOR_LEAD_PROMOTION_REVIEW`. O R2-01 da crítica foi corrigido depois do orçamento de 2 rodadas, sem terceira rodada. O diff está em `freeze-r2-to-r3.diff.txt`.
- `next_action`:
  1. o lead confere `freeze-r2-to-r3.diff.txt`;
  2. promove `promotion-fd4d641e8f28.patch.txt` por PR depois da 0243/0242 (PR #8);
  3. registra o risco de folga de contextos (27).
- B6: continua `INCOMPLETE`, sem crédito.

## `docs/20_master_execution_log.md`

### 20/10/2026 — HISO005-P2-BUILD-0244 (Claude Code, CONT-20261018-D9EF)

- **Delta.** E1: `export *` e `export * as ns` com a semântica ESM.
  - Ligação resolvida, ambiguidade sticky com propagação ao reexportador, precedência só de export explícito de runtime.
  - A estrela não qualificada envenena os nomes de estrela do módulo e o namespace incompleto é transitivo.
  - Namespace reexportado é ligação do reexportador, como no Node 22.
  - E2: a classe recusada mantém a raiz; o nome é pré-declarado U e exportado U; `declare class` dá RUNTIME_DECLARATION.
  - O census não muda. A versão do kernel passa a `semantic-kernel-v5-esm-module-shape`.
- **Testes.**
  - Novo: 50/50.
  - Primeira falha na v4: 34/50.
  - Mutações: M1 derruba 7 testes; M2 derruba 1.
  - Focal 872/872, nativo 79/79, certify 16/16 (unit 6109/6109), consumidor fresco PASS.
- **Medição real.**
  - De 13.521 para 12.283 diagnósticos, com normal = strict e validation true.
  - Conservação §3.3 tupla a tupla PASS: somem 1.541 e aparecem 303, com denominadores para o superconjunto e para o texto da SPEC.
  - Census idêntico.
  - Uso: contextos de 145 para 229, de um teto de 256. O pico é z.object do zod.
- **Fixtures PROVEN novos.** 13, só no teste novo, todos com estrela qualificada. Nenhum na raiz real.
- **Crítica (crítico novo, não-fork).**
  - R1: REVISE, com 4 obrigatórios e 7 P3, todos corrigidos.
  - R2: REVISE, com R2-01 (P1, colisão da identidade de `export * as ns` com ligação local) e 2 P3.
  - R2-01 foi corrigido com uma identidade sentinela, depois do orçamento e sem terceira rodada.
- **Recursos.** PG próprio removido, runtime e worktree liberados, a candidata fica como âncora. Sem push nem PR.

## `docs/30_backlog_master.md`

- `HISO005-P2-BUILD-0244`: DONE local (commit `fd4d641e8f28` na candidata); promoção pendente de PR do lead, depois do PR #8.
- Risco registrado: folga de 27 contextos no `maxContexts` da medição B6. Cada novo `z.object` no código avaliado consome folga.
- Candidatas futuras (não abertas):
  - TSX parseado como TS (705 tuplas, T3);
  - regra de prova por escopo (T3);
  - modelo de entrada externa K0 (T3).
