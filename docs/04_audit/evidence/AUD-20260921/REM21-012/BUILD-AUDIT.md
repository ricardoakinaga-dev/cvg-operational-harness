# REM21-012 — BUILD/AUDIT local

## Resultado

- task: `REM21-012` / achado `A21-F14`;
- status: `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- autorização: `G21-1`, somente local, sintética e descartável;
- run focado: `run-rem21-012-skip-1`;
- candidate: `ae3c30a1acc2872d011f8696e7b1711b21d4c5f08a62723ce07ebe33bd981878`;
- runtime: Node `22.23.2`;
- gates task-specific: E2E `PASS`, skip governance `PASS`, sem output failures;
- produção, G21-5, G21-6, I1 e freeze: continuam fechados.

## RED/GREEN e implementação

O RED foi executado em `tests/skip-governance.test.js` antes do BUILD e falhou
pelos motivos corretos: expiração passada era aceita, dedicated gate ausente
era aceito e report desconhecido não era rejeitado. O GREEN adicionou
expiração futura obrigatória, gates conhecidos `unit/postgres/chaos/e2e`,
relatórios sem duplicidade, cobertura do gate dedicado, contagem por gate e
parser de JSON Playwright.

O comando `skip:governance` deixou de ser apenas self-test: depois dos reports
de unit/PG/chaos/E2E ele materializa `certification/skip-inventory.json`,
vinculado ao `CI_RUN_ID`/`CI_CANDIDATE_ID`. O workflow publica o relatório E2E e
o gate skip como artefato por run. O self-test negativo continua disponível por
`node scripts/skip-inventory.mjs --self-test`.

## Verificação fresca

- catálogo: 35 entries, todos com `expiresAt` futuro;
- reports agregados: 1/1 em cada gate `unit`, `postgres`, `chaos` e `e2e`;
- skips observados: unit 0, PostgreSQL 0, chaos 0, E2E 0;
- inventário: `PASS`, zero failures, zero skipped tests;
- E2E: 12/12 testes Chromium passaram e o JSON reporter foi parseado;
- testes focados: 3 arquivos / 15 testes passaram;
- self-test de CI bar: `PASS` para gates removidos, runtime inválido,
  agregador opaco e artefatos não fail-closed;
- typecheck, lint, Prettier, links e `git diff --check`: `PASS`;
- `docs:check-links` ainda reporta 11 referências absolutas históricas já
  conhecidas, mas `broken: []`; elas permanecem escopo de `REM21-017`.

## Limitações e decisão

Os relatórios usados são fixtures locais e PostgreSQL descartável; nenhum
provider, canal, IdP, credencial ou dado real foi usado. A task não executou a
barra integral novamente depois de alterar o contrato; o próximo freeze de
`REM21-019` deverá repetir a barra inteira no mesmo candidate/run. A decisão
local é manter produção `NO_GO` e avançar para `REM21-013` e `REM21-016` após
seus próprios gates Discovery/PRD/SPEC.
