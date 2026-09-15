# AAA-12 coverage hardening — pedido de revisão independente

- Task: `AAA-12`. Rodada: cobertura comportamental do canal, autorizada por `docs/04_audit/evidence/AAA/AAA-12/review-coordinator-c4/next-task-agent-2.md`.
- Autor: agent-2. Status: **IMPLEMENTED_PENDING_INDEPENDENT_REVIEW** (sem DONE, sem SQL, sem AAA-21).
- Escopo: somente testes novos em `packages/channel-gateway/src/__tests__/` e evidência própria.

## Resultado

| Métrica                    | Baseline (FAIL preservado) | Final     | Barra congelada |
| -------------------------- | -------------------------- | --------- | --------------- |
| statements (subset)        | 86.47                      | 98.39     | ≥90             |
| lines (subset)             | 88.07                      | 99.61     | ≥90             |
| functions (subset)         | **79.61 FAIL**             | 96.11     | ≥90             |
| branches (geral)           | 82.57                      | 96.18     | ≥85             |
| branches journal (crítico) | 77.08–89.13                | 95.83–100 | ≥95             |
| branches gateway (crítico) | 77.21                      | 96.2      | ≥95             |

Por arquivo (final): `effect-journal-file` 98.11/100/90.32/100; `effect-journal` 97.83/95.83/100/100; `gateway` 99.07/96.2/90.91/100; `idempotency` 100/100/100/100; adapters `chatwoot` 98.21/93.85/100/98.15 e `evolution` 97.92/89.36/100/97.87; `fake/contracts/errors/index` 100.

## Evidência

| Item                        | Path                                                    |
| --------------------------- | ------------------------------------------------------- |
| Manifesto                   | `manifest-coverage-hardening.json`                      |
| Mapa cenário→invariante     | `scenario-map.md`                                       |
| Baseline + gaps             | `baseline.log`, `baseline-gaps.txt`, `baseline/`        |
| Final + gaps                | `after-final.log`, `after3-gaps.txt`, `after-final/`    |
| Diff dos testes adicionados | `added-tests.patch`                                     |
| Regressões                  | `green-consumers-final.log`, `full-npm-test.log`        |
| Gates estáticos             | `typecheck.log`, `lint-channel.log`, `format-check.log` |
| C4-F01 preservado           | `c4-f01-acceptance-probe.log`                           |
| Comandos/exit codes         | `manifest-coverage-hardening.json` → `commands`         |

## Confirmações

- 14/14 hashes pinados pelo coordenador inalterados; 8/8 arquivos de produto sem mudança; somente 4 arquivos de teste adicionados.
- Baseline FAIL de functions preservado como histórico; nenhum limiar reduzido, arquivo excluído ou teste removido.
- Ramos não alcançáveis documentados com justificativa; nenhuma correção de produto foi necessária (nenhum RED de produto).
- Nenhum acesso a registros compartilhados, `@cvg/shared`, persistence, migrations, package/lockfile, runtime; PostgreSQL 55432 usado apenas nos testes de chaos do consumidor e segue isolado.
- Não reivindicados: coverage global, mutação 100%, durabilidade física, SQL, G_QUALITY, DONE.
