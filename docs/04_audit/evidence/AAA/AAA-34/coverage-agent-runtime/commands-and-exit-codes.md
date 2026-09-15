# Comandos e exit codes — AAA-34 / agent-runtime

Todos executados a partir da raiz `/home/ricardo/cvg-agent-secretary-v2`.

| # | Comando | Exit | Evidência |
| --- | --- | --- | --- |
| 1 | `npx vitest run <6 suítes originais de agent-runtime> --coverage --coverage.include='packages/agent-runtime/src/**/*.ts' --coverage.reporter=text --coverage.reporter=json --coverage.reporter=json-summary --coverage.reportsDirectory=.../before --coverage.reportOnFailure=true --coverage.thresholds.*=0 --no-file-parallelism --maxWorkers=2` | 0 | `before-coverage-command.log`, `before/coverage-final.json`, `before/coverage-summary.json` |
| 2 | `npx vitest run packages/agent-runtime packages/agent-core --coverage --coverage.include='packages/agent-runtime/src/**/*.ts' --coverage.reporter=text --coverage.reporter=json --coverage.reporter=json-summary --coverage.reportsDirectory=.../after --coverage.reportOnFailure=true --coverage.thresholds.*=0 --no-file-parallelism --maxWorkers=2` | 0 | `after-coverage-command.log`, `after/coverage-final.json`, `after/coverage-summary.json` |
| 3 | `npx vitest run packages/agent-runtime packages/agent-core --no-file-parallelism --maxWorkers=2` (3 execuções) | 0 | `focused-tests-3x.log`, `focused-tests-3x-exit.txt` |
| 4 | `npm test` | 0 | `full-test.log`, `full-test-exit.txt` |
| 5 | `npm run typecheck` | 0 | `typecheck.log`, `typecheck-exit.txt` |
| 6 | `npm run lint` | 0 | `lint.log`, `lint-exit.txt` |
| 7 | `npx eslint packages/agent-runtime` | 0 | `eslint-agent-runtime.log`, `eslint-agent-runtime-exit.txt` |

## Resultados

- Foco (passo 3): 3× `14 arquivos / 266 testes PASS` (agent-runtime 249 + agent-core 17).
- Suíte completa (passo 4): `225 passed | 4 skipped (229)` arquivos; `1544 passed | 57 skipped (1601)` testes; zero falhas.
- Typecheck/lint (passos 5–7): zero erros.
- Coverage antes (passo 1): pacote 76,03% stmts / 70,33% branches; runtime 71,98/66,39; effect-journal 84,94/81,33.
- Coverage depois (passo 2): pacote 98,42% stmts / 97,48% branches; runtime 98,30/96,87; effect-journal 98,46/99,40.

## Notas

- `--coverage.thresholds.*=0` foi usado apenas para coletar o relatório sem o gate global de 80/80/80/80 do `vitest.config.mts` (que não pode ser editado nesta task); nenhum threshold do repositório foi alterado.
- `--coverage.reportOnFailure=true` garante relatório mesmo quando um teste falha (usado durante a iteração; as coletas finais são de execuções verdes).
- Nenhum `npm install`, commit, push ou deploy foi executado.
