# AAA-34 — cobertura comportamental `packages/policy-engine`

- Task: endurecimento de cobertura (builder), escopo exclusivo `packages/policy-engine` (testes apenas).
- Observed at: `2026-09-13T05:02:51Z` (UTC). Ambiente: Linux `7.0.0-31-generic` x86_64, Node `v24.20.0`, npm `11.19.0`.
- Base: `HEAD 512bc11e80fbf7c7b8baf6263aacc811ff829309` com mudanças de outras lanes preservadas. Nenhum arquivo de produção, `vitest.config.mts`, `package.json`, contrato ou tracking compartilhado editado por esta lane.
- Contratos aplicados: AAA-04 v2 §9.1 (branches de módulos críticos ≥95%) e AAA-03 rev2 §10 (capability matrix, resource type checks, fail-closed, ordenação, policyVersion).

## Status

`COMPLETED` no recorte de cobertura: foco 5 arquivos / 54 testes PASS, suíte completa com zero falhas, typecheck e lint verdes. Piso de branches do pacote superado: `97,84% ≥ 95%`.

## Antes/depois (comando focado idêntico)

| Arquivo / pacote                    | Stmts antes      | Stmts depois     | Branches antes       | Branches depois      | Funcs depois | Lines depois     |
| ----------------------------------- | ---------------- | ---------------- | -------------------- | -------------------- | ------------ | ---------------- |
| `packages/policy-engine` (agregado) | 155/163 = 95,09% | 161/163 = 98,77% | 124/139 = **89,20%** | 136/139 = **97,84%** | 30/30 = 100% | 152/153 = 99,34% |
| `engine.ts`                         | 93/99 = 93,93%   | 98/99 = 98,98%   | 97/109 = **88,99%**  | 107/109 = **98,16%** | 13/13 = 100% | 92/93 = 98,92%   |
| `grants.ts`                         | 17/19 = 89,47%   | 18/19 = 94,73%   | 3/6 = **50,00%**     | 5/6 = **83,33%**     | 6/6 = 100%   | 17/17 = 100%     |
| `capabilities.ts`                   | 16/16 = 100%     | 16/16 = 100%     | 10/10 = 100%         | 10/10 = 100%         | 4/4 = 100%   | 100%             |
| `documents.ts`                      | 29/29 = 100%     | 29/29 = 100%     | 14/14 = 100%         | 14/14 = 100%         | 7/7 = 100%   | 100%             |
| `index.ts`                          | 0/0              | 0/0              | 0/0                  | 0/0                  | 0/0          | 100%             |

- Fonte bruta: `before/coverage-summary.json`, `after/coverage-summary.json`, `coverage-before-after.json`, logs `before-coverage-command.log` / `after-coverage-command.log`.
- Testes do pacote: antes 3 arquivos / 35 testes; depois 5 arquivos / 54 testes (`+19`).
- `grants.ts` permanece em 83,33% apenas por um branch defensivo inalcançável (`grants.ts:154`) — todos os branches alcançáveis estão cobertos; ver `limitations.md`. Os branches restantes do pacote (2 em `engine.ts`) também são inalcançáveis pela API pública e não são caminhos de negação.

## Matriz §10 confirmada (ver `matrix-table.md`)

- `appointment.confirm` e `appointment.reschedule`: **nenhum grant em nenhum perfil** (checado na tabela bruta e via engine: 5 perfis × 5 roles × 2 capabilities → `DENY`/`capability_not_granted`).
- `appointment.modify`: exige `appointment_draft`; recurso real `appointment` → `resource_type_not_allowed` em todos os perfis, mesmo sem grant e mesmo com documento ALLOW tentando expandir.
- Tipos reais/desconhecidos: todos os 5 capabilities com escopo negam tipo desconhecido (25 combinações perfil×capability) e exigem recurso explícito (25 combinações); `resource` presente sem `type` utilizável → `insufficient_context` (DENY).
- Ordenação comprovada: tenant → resource → action → grant → role → documentos; grants nunca são consultados antes do escopo de recurso.
- `policyVersion`: decisões por regra reportam `policyId`/`version` do documento; negações e fallback reportam `builtin.deny_by_default` / `policy-engine-v1`; documento global (sem tenant) aplica-se; documento expirado não altera a identidade.
- Contexto ausente/inválido: 8 campos obrigatórios removidos, valores vazios/curtos/longos, role/perfil/capability desconhecidos e campo extra (schema estrito) → `DENY`/`insufficient_context`.
- Matriz capability × perfil × role completa: 5 × 5 × 21 = **525** avaliações reais comparadas com grants, teto de role, risco e escopo de recurso — zero divergências.

## Suíte e gates

- Focada: `npx vitest run packages/policy-engine --no-file-parallelism --maxWorkers=2` → 5 arquivos / 54 testes PASS, exit 0 (`focused-tests.log`).
- Cobertura focada: exit 0 (`after-coverage-command.log`).
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm test`: 227 arquivos PASS + 4 skipped (231); 1563 testes PASS + 57 skipped (1620); zero falhas, exit 0. Baseline do enunciado: 1544 PASS / 57 skip; delta = exatamente +19 testes desta lane, skips inalterados.

## Bugs

Nenhum bug de produção encontrado ou corrigido. Nenhuma alteração de código de produção.

## Limitações

Ver `limitations.md`: denominador focado (não global), 3 branches inalcançáveis documentados, `resource` sem `type` cai no schema estrito (`insufficient_context`, ainda DENY), dados sintéticos, tracking compartilhado intocado.
