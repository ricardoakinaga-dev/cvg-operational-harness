# AAA-34 — Before/After de cobertura: `packages/persistence` e `packages/model-gateway`

Task: AAA-34 (coverage hardening). Escopo: somente testes nos dois pacotes. Nenhum código de produção alterado.

Método de referência (mesmo da barra AAA-04 v2 §9.1): denominador do `vitest.config.mts`
(`packages/**/*.ts`, excluindo `*.test.ts`, adapters `*postgres*`, `postgres.ts`,
`platform-control-plane-repository.ts`, `platform-approval-repository.ts`,
`tenant-scoped-capability-approval-repository.ts`), cobertura do pacote filtrada do run global.

- `before`: run full-suite de 2026-09-13T02:35:39Z em cópia isolada
  (`docs/04_audit/evidence/AAA/AAA-13/rehearsal`; artefato original
  `/tmp/opencode/aaa13-rehearsal-20260913T023539Z/repo/coverage/coverage-summary.json`),
  proveniência verificada por sha256: `baseline-provenance-sha256.txt` mostra que todos os
  fontes de produção dos dois pacotes são idênticos ao working tree; as únicas divergências são
  `channel-effect-journal-postgres.ts` + teste (lane AAA-12) e os 6 testes novos desta task,
  arquivos excluídos do denominador ou ausentes no baseline.
- `after`: run full-suite desta lane em `after-full-coverage.log` + `after-full-coverage-summary.json`.

## Agregado por pacote

| Pacote        | Métrica    | Before            | After                  | Barra |
| ------------- | ---------- | ----------------- | ---------------------- | ----- |
| persistence   | statements | 85.26% (931/1092) | **97.80% (1068/1092)** | ≥90%  |
| persistence   | branches   | 79.55% (712/895)  | **92.07% (824/895)**   | ≥85%  |
| persistence   | functions  | 94.35% (267/283)  | **98.94% (280/283)**   | ≥90%  |
| persistence   | lines      | 85.77% (886/1033) | **98.06% (1013/1033)** | ≥90%  |
| model-gateway | statements | 86.59% (452/522)  | **98.47% (514/522)**   | ≥90%  |
| model-gateway | branches   | 78.87% (321/407)  | **96.56% (393/407)**   | ≥85%  |
| model-gateway | functions  | 80.00% (60/75)    | **98.67% (74/75)**     | ≥90%  |
| model-gateway | lines      | 87.86% (427/486)  | **98.56% (479/486)**   | ≥90%  |

Ganho persistence: +137 statements, +112 branches, +13 functions, +127 lines.
Ganho model-gateway: +62 statements, +72 branches, +14 functions, +52 lines.

## Piores arquivos — persistence (before → after)

| Arquivo                                       | stmts before | br before | stmts after | br after |
| --------------------------------------------- | ------------ | --------- | ----------- | -------- |
| `src/restore.ts`                              | 67.74%       | 51.04%    | 99.53%      | 90.62%   |
| `src/repositories/conversation-repository.ts` | 80.68%       | 68.96%    | 99.31%      | 95.68%   |
| `src/outbox.ts`                               | 87.98%       | 80.64%    | 99.29%      | 92.47%   |
| `src/journeys.ts`                             | 91.45%       | 86.79%    | 91.88%      | 86.79%   |
| `src/repositories/audit-repository.ts`        | 92.47%       | 87.09%    | 98.92%      | 95.69%   |
| `src/repositories/approval-repository.ts`     | 97.29%       | 89.65%    | 100%        | 93.10%   |
| `src/repositories/task-repository.ts`         | 96.66%       | 90.00%    | 100%        | 93.33%   |

## Piores arquivos — model-gateway (before → after)

| Arquivo                              | stmts before | br before | stmts after | br after |
| ------------------------------------ | ------------ | --------- | ----------- | -------- |
| `src/gateway.ts`                     | 81.37%       | 67.59%    | 97.93%      | 90.74%   |
| `src/circuit-breaker.ts`             | 77.46%       | 87.87%    | 94.36%      | 96.96%   |
| `src/router.ts`                      | 83.33%       | 72.50%    | 100%        | 97.50%   |
| `src/providers/ollama.ts`            | 85.36%       | 57.57%    | 100%        | 96.96%   |
| `src/providers/openai-compatible.ts` | 90.56%       | 86.36%    | 98.11%      | 97.72%   |
| `src/providers/deterministic.ts`     | 83.33%       | 80.00%    | 100%        | 100%     |
| `src/budget.ts`                      | 94.59%       | 82.14%    | 100%        | 100%     |
| `src/errors.ts`                      | 96.96%       | 85.00%    | 100%        | 100%     |
| `src/prompt-registry.ts`             | 92.50%       | 92.85%    | 100%        | 100%     |

## Focused runs (antes/depois) — pacotes isolados

| Run                                                                             | Métrica persistence                                                               | Métrica model-gateway                          |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| before focused (`before-persistence-focused*`, `before-model-gateway-focused*`) | 78.48% stmts / 69.94% br (somente testes do pacote)                               | 84.29% stmts / 78.38% br                       |
| after focused (`after-*-focused*`)                                              | 97.62% stmts / 90.61% br, 29 arquivos/187 testes, 0 skips com `TEST_DATABASE_URL` | 98.47% stmts / 96.56% br, 5 arquivos/93 testes |

Os focused runs saem com `exit 1` **exclusivamente por thresholds globais** do
`vitest.config.mts` (o run cobre só um pacote); todos os testes passam.
