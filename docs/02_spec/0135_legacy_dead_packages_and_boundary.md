# 0135 — SPEC: remoção dos pacotes mortos do legado e fronteira de `legacy/`

- ID: `SPEC-LEGACY-001`
- Estado: `EXECUTED` (PR-L02 e PR-L03 concluídas em 26/09/2026). Autorização: `SPEC_APPROVED_BY_USER / BUILD_AUTHORIZED` — autorização do
  usuário em 26/09/2026 ("então vamos avançar") sobre o plano
  [0354](../03_build/0354_production_executive_plan_2026-09-26.md), com DL-02
  já decidida em [0357](../03_build/0357_production_decision_packet_2026-09-26.md).
- Tasks: PR-L02 e PR-L03 de
  [0356](../03_build/0356_production_backlog_2026-09-26.md).
- Inventário de base: [LEGACY_INVENTORY.md](../../legacy/LEGACY_INVENTORY.md).

## PR-L02 — remover `workflows`, `tools` e `memory`

### Recon medido (26/09/2026, `001fc6f`)

| Pacote      | Linhas de produção | Importadores fora do próprio pacote |
| ----------- | ------------------ | ----------------------------------- |
| `workflows` | 266                | 0                                   |
| `tools`     | 395                | 0                                   |
| `memory`    | 13                 | 0                                   |

Referências de configuração: `tsconfig.json`, `tsconfig.base.json`,
`apps/worker/tsconfig.json`, `vitest.config.mts`,
`scripts/phase3-candidate-digest.mjs` e `package-lock.json`. A política
`config/workspace-dependency-policy.json` (M07-S1) não cita os três pacotes.

### Regras

1. R1 — só remoção: nenhum outro arquivo de produção muda.
2. R2 — o lockfile perde as entradas `packages/<nome>` e
   `node_modules/@cvg/<nome>` e nada mais.
3. R3 — os testes dos três pacotes saem junto; nenhum outro teste é
   removido ou alterado.

### Critério de pronto

`git grep` sem referência aos três pacotes fora do histórico; `npm ci`,
`typecheck`, `lint`, `npm test`, `test:postgres`, `sbom` e `licenses:check`
verdes em Node 22.

## PR-L03 — fronteira de `legacy/`

### Regras

1. R1 — `packages/**` nunca importa de `legacy/` nem de `@cvg/legacy-*`.
2. R2 — `apps/**` só importa de `legacy/` ou `@cvg/legacy-*` a partir dos
   pontos de composição listados em `LEGACY_COMPOSITION_POINTS` do teste de
   arquitetura. A lista começa vazia; cada task FL que criar um ponto o
   declara ali, com a task de origem.
3. R3 — pacotes em `legacy/packages/` usam o nome `@cvg/legacy-<nome>`.
4. R4 — a inclusão de `legacy/packages/*` nos workspaces do npm fica para a
   PR-L04: o auditor de dependências da M07-S1
   (`scripts/workspace-dependency-audit.mjs`) fixa `apps/*` e `packages/*`, e
   mudar isso depende da decisão D-13.

### Critério de pronto

Teste de arquitetura com as regras R1–R3 verde, e caso negativo provado (um
import proibido sintético faz a função de varredura acusar violação).

## Execução — 26/09/2026

### Consequências fora do diff óbvio

A remoção quebrou três contratos antigos da época da Esmeralda. Cada um foi
tratado sem apagar histórico:

| Contrato                                              | Problema                                                                                            | Tratamento                                                                                                                         |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `docs/03_build/0304_traceability_matrix.json`         | 6 mapeamentos de RFs do PRD legado exigiam testes de `workflows`/`tools`                            | Testes movidos para `legacy_removed_tests` com `legacy_status`; os `source_ids` continuam mapeados                                 |
| `docs/03_build/0305_repository_target_structure.json` | Exigia os três pacotes                                                                              | Entradas movidas para `removed_packages`, com task e motivo                                                                        |
| Links em `0539`, `0554` e `0556` de `docs/04_audit`   | Apontam para arquivos apagados; relatórios vinculados por hash em `AUD-20260913-DOCS/manifest.json` | Relatórios preservados byte a byte; nova classe `removedTargets` em `docs/doc-link-policy.json` e em `scripts/check-doc-links.mjs` |

A classe `removedTargets` estende SPEC-DOC-002 de forma estreita: exige o
arquivo exato, o caminho exato do alvo e a task que o removeu; o alvo aparece
em `historicalRemovedTargets` (não some da saída); e a verificação falha com
`STALE_REMOVED_TARGETS` se um alvo listado voltar a existir. Um link quebrado
sem registro continua falhando como antes. Teste novo em
`tests/docs-check-links.test.js`.

### Gates (Node 22.23.2, PostgreSQL descartável `cvg-legacy-pg-20260926`)

| Gate                                                                        | Resultado                                                            |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `typecheck`, `lint`, `format:check`, `diff:check`                           | exit 0                                                               |
| `docs:check-links` + higiene de evidências                                  | exit 0; 0 quebrados; 4 alvos removidos classificados                 |
| `sbom`, `licenses:check`, `audit:security`                                  | exit 0                                                               |
| `npm run test:coverage` com `TEST_DATABASE_URL` e `PHASE4A_DISPOSABLE_PG=1` | 314 arquivos / 2 280 testes PASS, 0 skipped                          |
| Cobertura                                                                   | 92,57 / 87,62 / 94,93 / 93,57 (antes: 92,41 / 87,48 / 94,79 / 93,40) |
| `npm run test:postgres`                                                     | 35 arquivos / 258 testes PASS                                        |
| `tests/architecture` (inclui `legacy-boundary.test.ts`)                     | 8 testes PASS, com caso negativo                                     |

Revisão independente e humana: `NOT_RUN`.
