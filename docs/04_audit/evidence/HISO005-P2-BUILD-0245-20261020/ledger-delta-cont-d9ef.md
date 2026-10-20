# Delta proposto para os ledgers — HISO005-P2-BUILD-0245 (CONT-20261018-D9EF)

Texto para o lead integrar. Esta unidade não editou `99`, `20`, `30`, a coordenação, o catálogo central nem `docs/02_spec`.

Evidência:

- [relatório](REPORT.txt)
- [aceites](acceptance-status.json)
- [comparação B6](b6-final-comparison.json)
- [conservação](conservation-r2.json)
- [reconstituição da raiz](eval-root-reconstitution.json)
- [certify](certify-summary.json)
- [promoção](promotion-deltas-prepared.json)
- [recibo de liberação](runtime-release-receipt.json)

## `docs/99_runtime_state.md`

- `last_completed_action`: BUILD local da SPEC0245 (SHA `04ec44ea…`) na candidata detached `/mnt/dados/cvg-work/cvg-hiso005-build0245-20261020`.
  - Commit `1d40fe519439` sobre `6c9fc651` (main com PR #9).
  - certify 16/16 na r2; a r1 deu NO_GO por 3 timeouts num teste claude100 sem relação com o delta.
  - Consumidor fresco PASS.
  - B6 na raiz `228e7918`: de 12.283 para 11.723 diagnósticos, com 0 provas e 0 violações.
- `status`: `READY_FOR_LEAD_PROMOTION_REVIEW`. A crítica fechou com R2 APPROVE, sem obrigatórios, e nada mudou no código depois dela.
- `next_action`: o lead promove `promotion-1d40fe519439.patch.txt` por PR sobre a main `6c9fc651`.
- Raiz avaliada reconstituída e mantida para os próximos BUILDs: `/mnt/dados/cvg-work/cvg-hiso005-eval-228e`. A receita está em `eval-root-reconstitution.json` (7 passos, inclusive o build do harness).
- B6: continua `INCOMPLETE`, sem crédito.

## `docs/20_master_execution_log.md`

### 20/10/2026 — HISO005-P2-BUILD-0245 (Claude Code, CONT-20261018-D9EF)

- **Raiz avaliada.** A cópia física de `228e7918` foi reconstituída em `/mnt/dados/cvg-work/cvg-hiso005-eval-228e`, com worktree, deps copiadas, runtime, sdk e build do harness.
  - Os 1.410 inputs do relatório selado conferem: 1.410/1.410.
  - A v5 reproduz o selado, inclusive no originId, com compiledProvenance 121.
- **Delta.**
  - T1: ScriptKind pela extensão, em tabela fechada: `.tsx`→TSX, `.jsx`→JSX, `.[cm]ts`→TS, demais→JS.
  - T2 sem código: o JSX é recusado pelo fallback, com o SyntaxKind.
  - Versão `semantic-kernel-v6-tsx-parse`. O literal foi migrado em 5 testes, como registrado.
- **Testes.**
  - Novo: 18/18. Primeira falha na v5: 13/18.
  - O mutante que manda `.ts` para TSX morre no MT04.
  - Focal 890/890, nativo 79/79.
  - certify r2 16/16 (unit 6127/6127, CONDITIONAL_GO/AAA_CONTROLLED); consumidor fresco PASS.
  - certify r1: NO_GO só no unit, com 3 timeouts de 15 s em `tests/claude100/reference-capture/controller.test.js` sob load de 12 a 15. Isolado, o arquivo deu 66/66, e o coverage do mesmo run passou.
- **Medição real.**
  - De 12.283 para 11.723 diagnósticos, com normal = strict e validation true.
  - Conservação §3.3 tupla a tupla: PASS.
    - Somem 561 tuplas, todas nos 29 `.tsx`.
    - Aparece 1: JsxElement em `apps/web/src/main.tsx`.
    - Fora dos `.tsx`: zero mudança.
    - Grafo de 1.341 arquivos e 2.729 arestas, com o mesmo conjunto.
    - 78 arquivos a jusante.
  - Nos fixtures, as violações perdidas são só da classe JsxText (F13 e F7×F13).
  - Contextos 229/256 antes e depois.
- **Crítica (crítico novo, não-fork).**
  - R1: REVISE, com 3 obrigatórios P2 (raiz sem harness, MT04 sem a v5, census nos fixtures) e 6 P3, todos corrigidos.
  - R2: APPROVE, sem obrigatórios. Os 4 P3 foram tratados só na evidência.
- **Recursos.** PG próprio removido, com as portas livres. Runtime e worktree liberados (1,75 GB). Ficam a candidata, como âncora, e a raiz avaliada. Sem push nem PR.

## `docs/30_backlog_master.md`

- `HISO005-P2-BUILD-0245`: DONE local (commit `1d40fe519439` na candidata). A promoção depende de PR do lead.
- Riscos registrados:
  - folga de 27 contextos no `maxContexts`;
  - tempo do worker sob carga de 154 a 188 s, contra o teto de 300 s;
  - flake de timeout de 15 s em `tests/claude100/reference-capture/controller.test.js` sob load alto. É candidato a cartão próprio, fora do B6.
- Continua aberto, em outra unidade: a SPEC de correção da lacuna CJS do K0. A SPEC0246 (escopo) foi adiada pelo usuário.
