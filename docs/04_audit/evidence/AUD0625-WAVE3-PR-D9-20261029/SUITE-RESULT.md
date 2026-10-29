# Suíte completa da onda 3 com PostgreSQL

Árvore: `claude/aud0625-wave3` @ `f9ef2ffe4` (cópia detached). Node 22.23.2, PostgreSQL 16 em contêiner próprio (removido), `nice -n 15` e `ionice` idle, `npm test` (`vitest run --no-file-parallelism --maxWorkers=2`), 05:41Z a 06:40Z (59 min), com pressão de I/O entre 1 e 40% por causa do CI do cvg-claw e de outros PG na máquina. Sem push; produção `NO_GO`.

## Resultado bruto

561 arquivos: 558 passaram, 1 foi pulado, 2 falharam. 7920 testes: 7908 passaram, 1 foi pulado, 11 falharam.

## Triagem das 11 falhas

| Falhas | Arquivo | Causa | Prova |
| --- | --- | --- | --- |
| 9 | `tests/b6-0241-integral-body.test.js` | Artefato do ambiente, não regressão: o worktree usava `node_modules` por link simbólico, e esse teste de B6 precisa de uma cópia real (a mesma armadilha já registrada em sessões anteriores). | Com `node_modules` por `cp -al`, o arquivo dá 28/28. |
| 2 | `apps/api/src/__tests__/rate-limit-distributed-postgres.test.ts` | Estouro do prazo de 15 s sob a carga de I/O (`Test timed out in 15000ms`). | Isolado, 9/9. |

Regressão real: nenhuma. Nada que já falhasse na `main` apareceu (os testes `claude100` passaram nesta árvore).

## Gates repetidos

`tests/mutation-guard.test.js` 3/3 e `npm run skip:governance` com `verdict: PASS` (o `certification/skip-inventory.json` foi restaurado).
