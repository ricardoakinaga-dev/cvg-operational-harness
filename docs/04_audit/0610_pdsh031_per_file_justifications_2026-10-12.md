# PDSH-031 — Gate per-file do núcleo e justificativas versionadas (2026-10-12)

- Task `PARE-DSH-20261011`, cartão [PDSH-031](../03_build/0375_plano_pareamento_motor_dsh.md) (Onda 4, T2).
- Baseline: [0607](./0607_pdsh030_core_coverage_baseline_2026-10-12.md) — 35 de 53 arquivos dos quatro pacotes do núcleo abaixo de 100% per-file.
- Este documento registra: (1) o gate per-file, (2) a decisão sobre os arquivos de suporte, (3) o inventário de supressões `v8 ignore` e (4) a reprodução.

## 1. Gate per-file

- Implementado em `vitest.config.mts`, habilitado por `CVG_COVERAGE_PER_FILE=1`.
- Quando habilitado, os arquivos cobertos de `packages/{contracts,harness,orchestrator,agent-runtime}/src` exigem **100% em statements, branches, functions e lines por arquivo** (globs de threshold do Vitest com `perFile: true`); os demais pacotes seguem medidos pelos thresholds agregados (90/85/90/90).
- Script: `npm run test:coverage:per-file` (equivalente a `test:coverage` com a flag). O CI bar (PDSH-033) chama o mesmo modo.
- Resultado no run completo de 12/10/2026: suíte 404 arquivos (381 passed, 23 skipped = PG sem `TEST_DATABASE_URL`), 3249 testes passed, **0 erros de threshold**; totais globais S 90.27 / B 86.75 / F 92.32 / L 91.07 (baseline 0607: S 88.46 / B 83.92 / F 91.09 / L 89.47). Evidência: [per-file-gate-full.log](evidence/PDSH-031-20261012/per-file-gate-full.log) e [per-file-gate-coverage-summary.json](evidence/PDSH-031-20261012/per-file-gate-coverage-summary.json) (sha256 `df85b608fee5bf43…`).
- Nota: o run focado (apenas os quatro pacotes) não basta para o gate — arquivos como `orchestrator/compatibility.ts` são exercitados por testes de outros pacotes; o gate roda na suíte completa.

## 2. Arquivos de suporte excluídos da obrigação de 100% (decisão da fatia 4)

Decisão registrada em [PDSH-031 summary](evidence/PDSH-031-20261012/summary.md) e no plano 0375 (Checkpoint031q). São código de suporte a teste/eval, não runtime de produção; seguem exercitados indiretamente pelas suítes consumidoras e foram adicionados ao `coverage.exclude` com comentário:

| Arquivo                                                      | Papel                               | Justificativa                                                         |
| ------------------------------------------------------------ | ----------------------------------- | --------------------------------------------------------------------- |
| `packages/harness/src/evals/phase3-fixtures.ts`              | fixtures de perfis/regisios de eval | suporte de eval; comportamento coberto pelas suítes que o importam    |
| `packages/harness/src/evals/loop-evals.ts`                   | runner de evals de loop             | suporte de eval; mesmos contratos já testados nos pacotes de produção |
| `packages/harness/src/__tests__/fixtures/phase3-fixtures.ts` | fixture de testes                   | código de teste, excluído do denominador como os demais `*.test.ts`   |

As exclusões já existentes no `vitest.config.mts` (bootstraps `main.ts(x)`, `apps/web/src/**` e adaptadores PG com gates próprios de smoke/integração) permanecem como estavam e continuam documentadas no próprio config.

## 3. Inventário de supressões `v8 ignore` (todas com comentário no local)

47 regiões de supressão nos quatro pacotes, todas defensivas (inalcançáveis nas composições fixas atuais) ou de instrumentação:

| Arquivo                                        | Regiões | Grupos de motivo                                                                                                                                                                                                        |
| ---------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contracts/src/canonical-json.ts`              | 1       | `default` inalcançável do switch de `typeof`                                                                                                                                                                            |
| `harness/src/completion.ts`                    | 1       | fallback `?? ''` inalcançável do detalhe do juiz indisponível                                                                                                                                                           |
| `harness/src/session/events.ts`                | 3       | guardas do validador JSON estrito (alvo de `$ref`, teto `maximum`, `items` sempre declarado)                                                                                                                            |
| `harness/src/iterative-runtime.ts`             | 8       | guardas de binding do kernel, boot de plugins fixo, teto de verify/replan já negado pela allowlist, item de catálogo sem id, observação de sucesso sempre presente                                                      |
| `harness/src/execution-spine.ts`               | 4       | invariantes internas (índice de idempotência, dead-letter defensivo, eventos garantidos no submit, buffer de audit nunca vazio)                                                                                         |
| `agent-runtime/src/runtime-kernel-bridge.ts`   | 8       | mapeamentos defensivos do switch de tool, resultado de modelo/request/signal sempre presentes, serviço `begin` não lido pelos pipelines                                                                                 |
| `agent-runtime/src/runtime-effect-recovery.ts` | 1       | `?? null` do hash de replay (todos os chamadores guardam)                                                                                                                                                               |
| `agent-runtime/src/runtime.ts`                 | 21      | posts de stop já decididos pelo race (mesmo relógio/aborto), ramos de budget/durabilidade garantidos por `beginStage` e pela composição, `span` opcional das fases duráveis, `stopReason` redundante com `assertBudget` |

## 4. Reprodução

```
export PATH="/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH"
npm run test:coverage:per-file        # suíte completa + gate per-file dos quatro pacotes
```

Para inspecionar um arquivo específico: `npx vitest run packages/<pacote> --coverage --coverage.reporter=json` e ler `coverage/coverage-final.json`.

## 5. Limites

- O gate mede o denominador do coverage unitário; caminhos duráveis de PG continuam com seus próprios gates de integração (`test:postgres`) e são excluídos do denominador, conforme o comentário do config.
- Este documento não concede release: produção segue `NO_GO` e o aceite independente (HISO-005) permanece pendente.
