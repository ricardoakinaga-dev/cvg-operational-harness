# ESTADO VIGENTE — 04/11/2026

- status: programa `IN_PROGRESS`; produção `NO_GO`.
- `main` em `362dc043c` (PR #40, 04/11/2026, 11 checks SUCCESS). Única branch remota é `main`; as onze pontas anteriores estão preservadas em tags `archive/consolidation-20261103/*` (mapa em [consolidação](08_runtime/main-consolidation-20261103.md)).
- Já na `main`: ondas AUD0625 1–7 (#29–#38), incorporação de runtime e evidências Open-ClaudeCode/CI003 (via #40).
- `last_completed_action`: auditoria [0626](04_audit/0626_repository_audit_2026-11-04.md) (nota 76/100, `NO_GO`) e reconciliação dos pontos de entrada (README, ledgers, índice AUD0625) — T1.
- Implementado localmente em 04/11/2026 (sem push): SPEC 0314 opção A, SPEC 0315 (`server.ts` 6.285 → 1.268 linhas). SPEC 0313 bloqueada para nova decisão.
- PR #41 aberto (`claude/audit-0626-impl`). CodeQL: 7 alertas `js/missing-rate-limiting` (#41–#47) em rotas apenas movidas foram dispensados como falso positivo por decisão do usuário em 04/11/2026 (mesma justificativa de PROD-0373: rate limit global `onRequest`). Meta definida pelo usuário: média 85 antes de mirar >90.
- Gate novo `scripts/check-ledgers.mjs` (via `docs:check-links`): teto de linhas dos ledgers, data igual entre README e estado, SHA-256 dos arquivos arquivados.
- Decisões do usuário em 04/11/2026: sandbox `PROCESS` por **runner separado** ([SPEC 0316](02_spec/0316_tool_runner_service.md), proposta T3; 0313 superada); **staging nesta máquina** para restore, alerta e game day (exige Docker instalado pelo usuário e `apparmor_restrict_unprivileged_userns=1`); **Keycloak com MFA no staging** para a U09. Proteção do `main` conferida como já ativa (barra 0373, condição 5).
- `next_action`: abrir PR para a CI com PostgreSQL (0314/0315) e decidir D1' da 0313; demais pendências em [0626 §3](04_audit/0626_repository_audit_2026-11-04.md): sandbox `PROCESS` na imagem de produção (P1, T3/T4), prova positiva do `boundary:products` (HISO-005), divisão de `apps/api/src/server.ts` (T2) e arquivamento de evidência pesada fora do Git (decisão humana).
- Índice conciliado do programa: [aud0625_current_index.md](08_runtime/aud0625_current_index.md).

## Continuidade SPEC-GUARDRAILS-20261105 — 05/11/2026 (Codex)

- `status`: `WAITING_HUMAN_APPROVAL` somente para futuro BUILD T3; programa segue `IN_PROGRESS`, produção `NO_GO`.
- `last_completed_action`: [gates isolados em d394d71a4](08_runtime/audit-pg-run-20261105.md) PASS após usuário liberar Docker: Node 22.23.2, PostgreSQL 16.15; 482 PG/102 Phase4A, zero falhas/skips, prova backup/restore/rollback e imagem/smoke não root PASS. Inventário PG idêntico à CI #41; baseline legado não aplicável. Evidências próprias persistidas; recursos nomeados desta task removidos.
- `next_action`: incorporar resultados à auditoria geral do Claude; revisão humana explícita da [SPEC 0317](02_spec/0317_security_guardrails.md) antes de qualquer código. Os novos negativos de aceitação da SPEC continuam por implementar/executar, inclusive G1 humano ponta a ponta; G6 permanece no backlog próprio do produto. “Feito” foi retomada do ambiente Docker, sem aprovação inferida de BUILD T3.
- Sem código, lockfile, push, dado real ou certificação nova. Preservada a execução paralela `AUDIT-FULL-RUN-20261105` do Claude; esta seção não encerra nem substitui sua auditoria geral.

## Continuidade AUDIT-FULL-RUN-20261105 — 05/11/2026 (Claude Code)

- `status`: programa `IN_PROGRESS`; produção `NO_GO`. `certify` completo em `d394d71a4`: 16/16, `CONDITIONAL_GO` / `AAA_CONTROLLED`; externos `NOT_VALIDATED`, signoff `PENDING`.
- `last_completed_action`: auditoria com execução real, nota 73/100 ([relatório](https://claude.ai/artifact/7rHkerLqzhGKR3rj8M3Zp2), [evidência](04_audit/evidence/AUDIT-FULL-RUN-20261105/README.md)). Unit 10.045/10.045, PG 482/482, cobertura de linhas 95,86%.
- Defeito novo: `certification:self-test` quebrado desde 06/10 (fixture sem `test-log-summaries.mjs`), fora da CI. `test:boundary:native` falha por pin de `/usr/bin/git` desatualizado, também fora da CI.
- `next_action`: corrigir o `self-test` e levá-lo à CI; revisão humana da SPEC 0317; tratar 8 alertas high do CodeQL; subir os 7 commits locais e fechar o PR #41.

- Histórico anterior (até 03/11/2026) arquivado integralmente, sem alteração, em [`runtime_state_ate_20261103.md.txt`](08_runtime/archive/runtime_state_ate_20261103.md.txt) (SHA-256 `045b94ea281ef7ec371750858d34a0b7c4b512aaf5f72ccd5e0b140ad0b86b89`, ledger original completo). Texto `.md.txt` para não manter links relativos quebrados.
