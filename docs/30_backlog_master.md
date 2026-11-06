# 04/11/2026 — backlog vigente após a auditoria 0626

| Prio | Item                                                 | Trilha | Estado / dono                                                                                                                                                                                                                                                              |
| ---- | ---------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1   | Sandbox `PROCESS` indisponível na imagem de produção | T3/T4  | [SPEC 0313](02_spec/0313_process_sandbox_production_image.md) D1' decidida (runner separado): [SPEC 0316](02_spec/0316_tool_runner_service.md) `PROPOSED_FOR_HUMAN_T3_REVIEW`; staging com `apparmor_restrict_unprivileged_userns=1` antes do BUILD. Imagem atual não muda |
| P2   | `boundary:products` `INCOMPLETE` (HISO-005)          | T2/T3  | Programa B6 (SPECs 0236/0237). Os `pinsHold: false` são o catálogo legado (SPEC 0228, só inventário histórico: não removem diagnóstico), não regressão. Prova positiva segue aberta                                                                                        |
| P3   | Dividir `apps/api/src/server.ts` (6.285 linhas)      | T2     | [SPEC 0315](02_spec/0315_api_server_route_modules.md) **implementada localmente** (`server.ts` 6.285 → 1.268 linhas); falta a CI com PostgreSQL no PR                                                                                                                      |
| P3   | Evidência de 4 GB fora do caminho do clone           | T3     | [SPEC 0314](02_spec/0314_evidence_archive_offrepo.md) opção A **entregue** em 04/11/2026 ([clone enxuto](08_runtime/clone_enxuto.md)); B e C seguem fora de escopo                                                                                                         |

Produção continua `NO_GO`; nenhuma frente acima concede release.

## SPEC-GUARDRAILS-20261105 — 05/11/2026 (Codex)

| Prio | Item                                                   | Trilha | Estado / dependência                                                                                                                                                                                                                                          |
| ---- | ------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1   | G1: autoria humana durável e negação de autoaprovação  | T3     | [SPEC 0317 §2](02_spec/0317_security_guardrails.md#2-g1--separação-entre-solicitante-humano-e-aprovador-p1-harness), proposta para revisão humana; sem BUILD                                                                                                  |
| P1   | G2/G3/G4: saída, fonte de conhecimento e guardas reais | T3     | [SPEC 0317](02_spec/0317_security_guardrails.md), regras e negativos propostos; sem BUILD                                                                                                                                                                     |
| P2   | G5: separar approval:create de approval:view           | T3     | [SPEC 0317 §6](02_spec/0317_security_guardrails.md#6-g5--permissão-própria-para-criar-approval-p2-harness), matriz de papéis pendente de revisão humana                                                                                                       |
| P1   | Gates PG/imagem da baseline d394d71a4                  | AUDIT  | **CONCLUÍDO local**: [resultados](08_runtime/audit-pg-run-20261105.md), Node 22.23.2/PG 16.15; 482 PG, prova de restore, 102 Phase4A e imagem PASS, zero falhas/skips nas suítes. Guardrails futuros ainda dependem de revisão humana T3 e negativos próprios |

G6 é exclusivamente do produto: [SEC-SHIFT-WEBHOOK-20261105](../products/shift-assistant/docs/backlog.md#sec-shift-webhook-20261105--autenticidade-do-webhook). Não duplicar seu status neste ledger. A auditoria geral paralela do Claude continua dona dos demais resultados de AUDIT-FULL-RUN-20261105.

## AUDIT-FULL-RUN-20261105 — 05/11/2026 (Claude Code)

| Prio | Item                                                       | Trilha | Estado / dependência                                                                                                 |
| ---- | ---------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| P1   | `certification:self-test` quebrado e fora da CI            | T2     | Aberto; adicionar `scripts/lib/test-log-summaries.mjs` à fixture em `scripts/phase10-verify.mjs` e levar o gate à CI |
| P1   | 8 alertas high do CodeQL contra a condição 5 da barra 0373 | T2     | Aberto; corrigir ou dispensar com justificativa                                                                      |
| P2   | `boundary:products` e `test:boundary:native` fora da CI    | T2     | Aberto; pin de `/usr/bin/git` desatualizado neste host                                                               |
| P2   | Dependabot desligado e 0 revisões exigidas no `main`       | T3     | Aberto; decisão do usuário                                                                                           |

- Histórico anterior (até 03/11/2026) arquivado integralmente, sem alteração, em [`backlog_ate_20261103.md.txt`](08_runtime/archive/backlog_ate_20261103.md.txt) (SHA-256 `e0ae93c21c7098cd43abdba2d7cf5adf0b8d721053a2360b95a852e1608199e7`, ledger original completo). Texto `.md.txt` para não manter links relativos quebrados.
