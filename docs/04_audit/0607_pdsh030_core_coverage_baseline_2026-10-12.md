# 0607 — PDSH-030: baseline de coverage do núcleo (per-file) — 12/10/2026

- Task `PARE-DSH-20261011`, cartão [PDSH-030](../03_build/0375_plano_pareamento_motor_dsh.md) (Onda 4, trilha T1). Escopo: auditoria baseline — ranking dos arquivos de `packages/{contracts,orchestrator,harness,agent-runtime}/src` abaixo de 100% per-file. Não altera código, thresholds ou config; não é certificação nem aceite de PDSH-031.
- Pedido do usuário: execução do plano 0375 ("use goal, pode implementar todo o plano"). Raio de mudança: documento novo + evidência própria; nenhum arquivo de código tocado.

## Método e proveniência

- `npm run test:coverage` (Vitest 4.1.11, provider v8, reporter `json-summary`), Node 22.23.2, no checkout `archive/local-audit-records-20261011`.
- **Limitação declarada:** sem `TEST_DATABASE_URL` (23 arquivos PG/DB-dependentes ficaram skip; 212 testes condicionais). Os quatro pacotes do núcleo não têm testes PG no denominador, então o per-file do escopo é válido; os totais globais abaixo ficam conservadores e serão re-medidos com PG no fechamento da onda.
- Evidência bruta: [`coverage.log`](evidence/PDSH-030-20261012/coverage.log), [`coverage-summary.json`](evidence/PDSH-030-20261012/coverage-summary.json) (sha256 `1d7122b9fd8ca72a…`) e [`core-per-file.json`](evidence/PDSH-030-20261012/core-per-file.json) (sha256 `da42bd899d3c5ffb…`), extraídos do relatório v8 sem edição.

## Totais globais (sem PG)

| Métrica    | Pct    | Threshold | Estado |
| ---------- | ------ | --------- | ------ |
| Statements | 88.46% | 90%       | abaixo |
| Branches   | 83.92% | 85%       | abaixo |
| Functions  | 91.09% | 90%       | ok     |
| Lines      | 89.47% | 90%       | abaixo |

O gate global atual falha **sem PG**; a comparação com PG (certify) fica para o fechamento da W4. O escopo de PDSH-031 é per-file no núcleo, não o total global.

## Núcleo — resumo por pacote

| Pacote          | Arquivos no denominador | Abaixo de 100% per-file |
| --------------- | ----------------------- | ----------------------- |
| `contracts`     | 5                       | 2                       |
| `orchestrator`  | 4                       | 2                       |
| `harness`       | 33                      | 24                      |
| `agent-runtime` | 11                      | 7                       |
| **Total**       | **53**                  | **35**                  |

## Ranking per-file (pior primeiro; L=linhas, S=statements, F=funções, B=branches)

| Arquivo                                                      | L%    | S%    | F%    | B%    | Linhas descobertas |
| ------------------------------------------------------------ | ----- | ----- | ----- | ----- | ------------------ |
| `packages/harness/src/evals/phase3-fixtures.ts`              | 69.89 | 70.10 | 71.87 | 58.33 | 28                 |
| `packages/contracts/src/execution-v2.ts`                     | 77.94 | 78.57 | 87.50 | 76.11 | —                  |
| `packages/harness/src/evals/loop-evals.ts`                   | 80.00 | 79.71 | 62.50 | 78.68 | —                  |
| `packages/harness/src/effect-journal.ts`                     | 83.95 | 81.39 | 100   | 79.10 | —                  |
| `packages/harness/src/skills/loader.ts`                      | 86.66 | 87.09 | 100   | 84.44 | —                  |
| `packages/harness/src/capability-boundary.ts`                | 87.32 | 85.77 | 93.18 | 78.83 | —                  |
| `packages/harness/src/iterative-dispatch.ts`                 | 87.40 | 86.69 | 100   | 77.43 | —                  |
| `packages/agent-runtime/src/runtime-kernel-bridge.ts`        | 87.65 | 86.51 | 87.23 | 73.33 | —                  |
| `packages/agent-runtime/src/runtime.ts`                      | 88.81 | 88.71 | 100   | 87.84 | —                  |
| `packages/harness/src/session/kernel-log.ts`                 | 90.00 | 90.90 | 100   | 83.33 | —                  |
| `packages/harness/src/step-store.ts`                         | 90.74 | 91.37 | 100   | 86.11 | —                  |
| `packages/harness/src/context-engine.ts`                     | 91.17 | 91.54 | 93.33 | 80.85 | —                  |
| `packages/orchestrator/src/scripted.ts`                      | 92.30 | 92.30 | 100   | 90.90 | —                  |
| `packages/harness/src/kernel/controls.ts`                    | 93.00 | 92.01 | 92.64 | 84.90 | —                  |
| `packages/harness/src/session/events.ts`                     | 93.54 | 87.07 | 100   | 87.87 | —                  |
| `packages/harness/src/iterative-runtime.ts`                  | 93.68 | 92.08 | 96.59 | 85.79 | —                  |
| `packages/harness/src/kernel/kernel-runtime.ts`              | 94.20 | 90.47 | 92.00 | 83.22 | —                  |
| `packages/harness/src/session/format-migration.ts`           | 94.20 | 93.15 | 90.90 | 90.19 | —                  |
| `packages/harness/src/kernel/pipeline.ts`                    | 95.33 | 94.79 | 90.62 | 87.91 | —                  |
| `packages/harness/src/kernel/host.ts`                        | 96.19 | 96.39 | 95.83 | 81.81 | —                  |
| `packages/harness/src/execution-spine.ts`                    | 96.52 | 95.98 | 96.49 | 90.95 | —                  |
| `packages/harness/src/session/memory.ts`                     | 96.55 | 96.55 | 100   | 80.00 | —                  |
| `packages/orchestrator/src/hybrid-orchestrator.ts`           | 96.66 | 95.08 | 90.00 | 89.58 | —                  |
| `packages/harness/src/__tests__/fixtures/phase3-fixtures.ts` | 96.77 | 96.90 | 90.62 | 85.41 | —                  |
| `packages/contracts/src/canonical-json.ts`                   | 97.72 | 97.91 | 100   | 96.77 | —                  |
| `packages/agent-runtime/src/composition.ts`                  | 97.82 | 94.00 | 100   | 73.58 | —                  |
| `packages/agent-runtime/src/runtime-effect-recovery.ts`      | 98.21 | 98.21 | 100   | 96.27 | —                  |
| `packages/agent-runtime/src/effect-journal.ts`               | 99.57 | 98.45 | 95.45 | 98.79 | —                  |
| `packages/agent-runtime/src/runtime-approval-request.ts`     | 100   | 100   | 100   | 75.00 | —                  |
| `packages/harness/src/trajectory.ts`                         | 100   | 80.00 | 100   | 83.33 | —                  |
| `packages/harness/src/skills/assert.ts`                      | 100   | 100   | 100   | 90.00 | —                  |
| `packages/harness/src/compaction.ts`                         | 100   | 98.03 | 93.33 | 90.62 | —                  |
| `packages/harness/src/createOperationalHarness.ts`           | 100   | 100   | 100   | 92.30 | —                  |
| `packages/harness/src/completion.ts`                         | 100   | 95.45 | 100   | 94.44 | —                  |
| `packages/agent-runtime/src/proposal.ts`                     | 100   | 100   | 100   | 96.15 | —                  |

Colunas "linhas descobertas" ficam por arquivo no `core-per-file.json`; o resumo acima omite o número para manter a tabela legível.

## Classificação preliminar para PDSH-031

- **Fixtures/evals de suporte a teste (3):** `evals/phase3-fixtures.ts`, `evals/loop-evals.ts`, `__tests__/fixtures/phase3-fixtures.ts`. Não são runtime de produção; o padrão do plano só admite exceção para bootstraps/adaptadores PG — decisão de incluir no gate per-file ou justificar como suporte exige registro explícito na 031.
- **Spine/kernel e runtime durável (18):** `effect-journal`, `capability-boundary`, `iterative-*`, `runtime-kernel-bridge`, `runtime`, `kernel/controls`, `session/events`, `kernel-runtime`, `pipeline`, `kernel/host`, `execution-spine`, `step-store`, `context-engine`, `trajectory`, `completion`, `runtime-effect-recovery`, `composition`. Precisam de testes novos (defensivos/branches), não de exceção.
- **Módulos de sessão/skills/compactação (8):** `session/kernel-log`, `session/format-migration`, `session/memory`, `skills/loader`, `skills/assert`, `compaction`, `canonical-json`, `proposal`. Gaps pequenos (branches 80–97%), fecháveis com testes focados.
- **Orquestradores (2):** `scripted.ts`, `hybrid-orchestrator.ts` — branches 89–91%.
- **Contrato grande (1):** `contracts/execution-v2.ts` (L 77.94) — o maior gap concentrado; revisar se é validação/zod exercitável ou código historicamente não usado (decisão documentada na 031).

Nenhum arquivo do núcleo é bootstrap de processo ou adaptador PG; portanto, pelo critério do plano, a maior parte exige 100% real com testes na PDSH-031, e exceções (se houver) precisam de justificativa versionada.

## Limites e próximo passo

- Baseline sem PG (nota de método); per-file do núcleo não depende de PG. Coverage global com PG será medido no fechamento da W4.
- Nenhum teste, threshold ou config foi alterado; nenhum arquivo de código tocado. Sem commit/push; produção `NO_GO`.
- Próximo: PDSH-031 (T2) em fatias — começar pelos gaps de branches pequenos (sessão/skills/compactação/orquestradores), depois spine/kernel, por último `execution-v2.ts` e a decisão sobre fixtures/evals; ao final, gate per-file no `vitest.config.mts` + justificativas versionadas.
