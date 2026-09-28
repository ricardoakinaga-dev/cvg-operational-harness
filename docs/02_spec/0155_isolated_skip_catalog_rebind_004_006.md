# SPEC-PR003-004 — reconciliar SKIP-PG-004/006 no candidato isolado

- Trilha: **T2**, vínculo de evidência de testes, sem efeito externo ou
  mudança de contrato de produção.
- Task: PR-003, fatia de prévia isolada em
  [backlog 0356](../03_build/0356_production_backlog_2026-09-26.md).
- Estado: `ISOLATED_T2_BUILD_PASS / CURRENT_SHA_CERTIFICATION_PENDING / ROOT_PENDING`.
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

## Resultado local — 28/09/2026

- Merge `c78a64a` sem conflitos; commit isolado `ae0344f` alterou apenas os
  três campos previstos. Revisão independente fechou o P1 do catálogo e
  aceitou o reparo exato. [Prova e hashes](../04_audit/evidence/PR301-COMPOSITE-20260928/proof.json).
- `skip:governance` retornou PASS e zero skips observados após o reparo.
  No mesmo commit, `npm test` passou 340 arquivos/2.582 testes,
  `test:postgres` 35/261, E2E Chromium 12/12, tipo/lint/formato e links
  PASS. Zero roles/schemas sintéticos residuais; contêiner removido.
- Cobertura no pai `c78a64a` (mesmo código fonte; o filho muda só o
  catálogo): 340/2.582; guard global e crítico PASS, RLS 191/197 branches
  (96,95%) contra piso 95%.
- P2 de evidência aberto: o inventário versionado de skips usa relatórios
  unit/PG/chaos/E2E anteriores ao merge. O PASS recalculado comprova
  integridade do catálogo contra o código atual, **não** certificação do
  SHA `ae0344f`. Root, CI remoto, staging e certificado continuam `NO_GO`.
