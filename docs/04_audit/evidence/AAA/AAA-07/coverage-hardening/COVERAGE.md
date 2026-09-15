# AAA-07 — cobertura crítica do approval-engine

- Task: `AAA-07` cobertura crítica (pacote `approval-engine`). Status: `IMPLEMENTED_PENDING_INDEPENDENT_REVIEW`.
- Autorização: `docs/04_audit/evidence/AAA/coordinator-batch-review/next-task-agent-1.md`; paths autorizados: testes em `packages/approval-engine/src/__tests__/` e evidência em `docs/04_audit/evidence/AAA/AAA-07/coverage-hardening/`.
- Executor desta rodada: sessão instruída pelo usuário a executar o pacote do Agente 1; revisão do coordenador pendente (sem autoaprovação DONE).
- Produto preservado: `contracts.ts fe043ae2…`, `engine.ts 74b566bb…`, `store.ts c279bd43…`, `index.ts 8a2c0b9a…`, `approval-lifecycle-fencing.test.ts fce80a18…` — hashes idênticos ao `manifest-fencing-c6.json`. Nenhum arquivo de produto/contrato/lockfile foi alterado.

## 1. Resultado

| Métrica (subset approval-engine, todos os src) | Baseline (48 testes)           | Depois (84 testes)   | Piso | Situação |
| ---------------------------------------------- | ------------------------------ | -------------------- | ---- | -------- |
| Statements                                     | 93,44%                         | **100%**             | ≥90  | OK       |
| Branches (geral)                               | 86,68%                         | **99,70%**           | ≥85  | OK       |
| Functions                                      | 95,31%                         | **100%**             | ≥90  | OK       |
| Lines                                          | 94,25%                         | **100%**             | ≥90  | OK       |
| Branches `engine.ts` (crítico)                 | 86,03% (44 locais descobertos) | **99,68% (1 local)** | ≥95  | OK       |

- Testes: 48 → 84 (36 novos, apenas comportamentais; nenhum teste existente removido ou afrouxado).
- Probes C6 reexecutados: `fencing-acceptance.mjs` exit 0 (sweep 0/0, token gasto rejeitado).
- Typecheck exit 0; lint exit 0.

## 2. Cenários adicionados (comportamentais)

36 testes em `approval-critical-coverage.test.ts`, cobrindo: contrato de opções default do construtor; todos os campos opcionais de `request`; autorização de `submit`; `reason` em `approve`; `cancel` de `PENDING`; `list` sem filtro com clone defensivo; consumo legado de `EXPIRED`; recurso sem `id`; `executionRef` em consumo reutilizável; **falhas de CAS** em reserve/markExecuting/confirm/release/fail/markUncertain/verifyAndConsume/reconcile (com estado e contadores inalterados e ausência de efeito); divergência de agente na reserva; reserva por `proposalHash` sem payload; evidência não-confirmada em `markUncertain`; reconciliação inválida; `releaseExpired` sem `now`; registros legados/parciais (sem expiry, sem token, sem geração) tratados de forma defensiva; `expireStale` honrando CAS. O mapa detalhado está em `scenario-map.json` (cenário → invariante → assertion → branch).

Cada teste de falha confirma estado, token/geração, contadores, evento e ausência de efeito — não apenas contagem de chamadas.

## 3. Branch remanescente (justificada, não excluída)

`engine.ts:662` — no evento de `confirm`, `evidence.evidenceRef !== undefined ? { actorId } : {}`. O ramo alternativo é **inalcançável pelo contrato tipado**: `EffectEvidenceSchema` exige `evidenceRef` (min 1) para `outcome: 'effect_confirmed'` (`contracts.ts:65-79`), e `confirm` só aceita evidência parseada. O ramo permanece como defesa em profundidade para outro produtor de evidência; nenhum limiar foi reduzido e nenhum arquivo foi excluído.

## 4. Comandos e exit codes

| Comando                                                                                                                | Exit | Resultado                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------- |
| `npx vitest run packages/approval-engine --coverage --coverage.include='packages/approval-engine/src/**' …` (baseline) | 0    | 5 arquivos / 48 testes; 93,44/86,68/95,31/94,25                                              |
| mesmo comando (depois)                                                                                                 | 0    | 6 arquivos / 84 testes; 100/99,70/100/100; engine 99,68 branches                             |
| `node --import tsx …/rework-fencing-c6/fencing-acceptance.mjs`                                                         | 0    | probes C6 preservados                                                                        |
| `npm run typecheck`                                                                                                    | 0    | —                                                                                            |
| `npm run lint`                                                                                                         | 0    | —                                                                                            |
| `npm test` (global, concorrente com mutação da frente 2)                                                               | 1    | 186 arquivos PASS; 1 timeout em `channel-coverage-gateway-journal-paths` (15s) por contenção |
| `npx vitest run packages/channel-gateway/src/__tests__/channel-coverage-gateway-journal-paths.test.ts` (re-run focado) | 0    | 16/16 PASS — confirma contenção, não regressão do approval                                   |

## 5. Limitações

- Cobertura é do **subset** approval-engine; não demonstra a barra AAA global, mutação, durabilidade ou G_QUALITY.
- Nenhum defeito de produto foi encontrado. Três iterações de autoria de teste foram necessárias (expectativa de `executionRef` persistido, armar `throwNext` após a reserva, expiração do registro forjado); os resultados finais estão preservados; não houve RED de produto a diagnosticar.
- Registros legados/parciais são fixtures via porta `ApprovalStore`, usadas para exercitar defesas; não representam estados produzíveis pela API pública atual.
- Sem SQL/banco, sem commit/push/deploy, sem edição de registros compartilhados.
