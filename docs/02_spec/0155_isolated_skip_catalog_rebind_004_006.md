# SPEC-PR003-004 — reconciliar SKIP-PG-004/006 no candidato isolado

- Trilha: **T2**, vínculo de evidência de testes, sem efeito externo ou
  mudança de contrato de produção.
- Task: PR-003, fatia de prévia isolada em
  [backlog 0356](../03_build/0356_production_backlog_2026-09-26.md).
- Estado: `SPEC_READY / ISOLATED_T2_BUILD_AUTHORIZED / ROOT_PENDING`.
- Escopo de escrita: apenas `scripts/skip-catalog.json` em
  `/tmp/cvg-pr301-composite-20260928`, sob claim próprio. O catálogo do
  checkout compartilhado permanece no claim PR-L04.

## Recon

O merge isolado `c78a64a` combina root `40eb3ed` e OIDC/RLS `42e69f4`
sem conflitos de merge. `skip:governance` retorna `FAIL` por dois vínculos:

| ID            | SHA no catálogo | SHA do teste no merge | Casos sem PostgreSQL |
| ------------- | --------------- | --------------------- | -------------------: |
| `SKIP-PG-004` | `f12b86ca…`     | `c0a8a9b0…`           |                    8 |
| `SKIP-PG-006` | `3fba40f1…`     | `800b647b…`           |                    7 |

Os 8 e 7 skips foram observados com Vitest sem `TEST_DATABASE_URL`. Com
PostgreSQL, a prova RLS no branch de origem executou todos os 7 casos;
o merge passou os 32 testes focados, incluindo OIDC e RLS. O revisor da
composição classificou a divergência como P1 e o inventário versionado
anterior como evidência insuficiente para este SHA.

## Regra e pronto

1. Atualizar somente `sourceSha256` de `SKIP-PG-004/006` e
   `expectedSkippedTests` de `SKIP-PG-006` para 7 no catálogo do worktree
   isolado. Preservar ID, motivo, owner, gate, expiração, checks e os
   próprios testes. Medir SHA e contagem outra vez antes de editar.
2. Rodar `skip:governance` em Node 22 com relatórios sem skips, além de
   typecheck, lint, `npm test`, `test:postgres` e E2E com PostgreSQL 16
   descartável. Não tratar o inventário versionado anterior como prova;
   arquivar saída nova do gate, SHA do commit e hashes da evidência.
3. Nenhuma mudança no checkout root, push, certificação ou produção é
   liberada por esta prévia. Integrar depois que PR-L04 liberar o caminho,
   revalidando hashes/contagens no SHA composto definitivo.

Se qualquer teste mudar, interromper a simples troca de hash e revisar
esta SPEC antes de continuar.
