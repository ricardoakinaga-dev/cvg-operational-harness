# 0190 — SPEC Validation

## PR-301-WEBHOOK-REPLAY — SPEC 0160 pronta para revisão humana T3 — 28/09/2026

- [SPEC 0160](0160_webhook_replay_window_and_processing_fence.md) deriva dos dois P1 reproduzidos em AUD-0587 e da task PR-301-WEBHOOK-REPLAY. Define janela/expiração, posse de lease e efeitos duráveis, recuperação e vínculo de tenant. [Críticas I1–I4](../04_audit/evidence/PR301-WEBHOOK-REPLAY-SPEC-20260928/I1-I2-review.md) fecharam lacunas P1 do contrato; os dois I4 aceitaram para revisão humana. Estado `SPEC_READY_FOR_HUMAN_T3_REVIEW / BUILD_NOT_AUTHORIZED`; somente dados sintéticos, produção `NO_GO`.

## PR-011-CODEQL — SPEC 0159 pronta para revisão humana T3 — 28/09/2026

- [SPEC 0159](0159_codeql_active_source_remediation.md) deriva de AUD-0585/0586 e da task PR-011-CODEQL: validação de alias no auditor, custo linear em quatro URLs e no filtro de instruções, prova autenticada de rate limit e disposição de histórico. [I1/I2](../04_audit/evidence/PR011-CODEQL-SPEC-20260928/I1-I2-review.md) corrigiram dois P1/três P2 e aceitaram a SPEC para decisão humana. Estado `SPEC_READY_FOR_HUMAN_T3_REVIEW / BUILD_NOT_AUTHORIZED`; dados sintéticos, produção `NO_GO`.

## PR-301/302 — SPECs 0150 e 0152 aprovadas para BUILD T3 sintético — 28/09/2026

- O usuário aprovou explicitamente [SPEC 0152](0152_corporate_oidc_authority_contract.md) para BUILD controlado com IdP HTTPS e dados sintéticos e [SPEC 0150](0150_cross_origin_operator_console.md) para console/API em hosts HTTPS distintos com testes sintéticos. Estado de ambas: `BUILD_T3_APPROVED_USER / SYNTHETIC_ONLY / IMPLEMENTATION_PENDING`.
- A aprovação não fornece parâmetros de IAM corporativo real, política de dados ou autorização de deploy. Integração no candidato compartilhado, E2E no mesmo digest, CI/certificação e decisão de GO continuam gates separados. Produção `NO_GO`.

## PR-202 — fatia T2 de approval do runtime — 28/09/2026

- [AUD-0583](../04_audit/0583_pr202_runtime_hotspot_recon_2026-09-28.md) corrigiu a baseline: `runTurn` tinha cerca de 655 linhas, não 2.233. [SPEC 0153](0153_pr202_approval_request_slice.md) delimitou extração mecânica do ramo de solicitação de approval, sem mudança de contrato/efeito. Sob D-12 e a task PR‑202, commit isolado `f787ad9` integrado ao root em `69d08d3`: comparação AST 3/3, crítica I1 P1 corrigida e I2 `ACCEPT`, Node 22 13/275 focados, suíte 325/2.393, PostgreSQL 35/258, Chromium 12/12, cobertura acima dos thresholds, tipo/lint/formato PASS. [Prova](../04_audit/evidence/PR202-SLICE-20260928/proof.json). Estado `FIRST_SLICE_ROOT_LOCAL_PASS / FULL_PR202_OPEN / COMPOSITE_CERTIFICATION_PENDING`; o gate de catálogo `SKIP-PG-014` falha por hash vencido em caminho PR-L04, produção `NO_GO`.

## PR-301/204 — SPEC 0152 corporativa pronta para revisão T3 — 28/09/2026

- [AUD-0582](../04_audit/0582_corporate_oidc_boot_gap_2026-09-27.md) comprovou que o branch PR‑204 fecha o boot produtivo sem caminho OIDC corporativo. [SPEC 0152](0152_corporate_oidc_authority_contract.md) separa IdP local e campos compartilhados, define issuer/client/MFA/grupo/tenant, exige entrypoint e navegador no mesmo digest com IdP HTTPS sintético e prescreve drenagem integral e preflight compatível para rollback. Críticas I1–I3 rejeitaram lacunas P1 corrigidas; I4 `ACCEPT_SPEC_REVIEW_READY` somente documental. Estado `HUMAN_T3_REVIEW_PENDING / BUILD_NOT_AUTHORIZED / NO_GO`; issuer e parâmetros IAM ainda ausentes. SPEC 0150 segue gate separado.

## PR-204 — SPEC 0151 aprovada para BUILD T3 — 27/09/2026

- O usuário aprovou explicitamente [SPEC 0151](0151_production_boot_configuration_contract.md) para BUILD T3 controlado com dados sintéticos em 27/09/2026, após I2 `ACCEPT_SPEC_REVIEW_READY`. Estado `BUILD_T3_APPROVED_USER / SYNTHETIC_ONLY`; claim PR-204-T3-BUILD em worktree isolado. IdP corporativo, SPEC 0150, provider/canal real, T4, deploy, certificação e GO continuam decisões/gates separados.

## PR-203 — fatia 4 executada localmente — 27/09/2026

- [SPEC 0134](0134_postgres_slice_extraction.md) BUILD T2 no commit isolado `9e949d7`, integrado ao checkout compartilhado em `7b3871d` com três hashes iguais. `postgres.ts` tem 1.455 linhas e `postgres-inbound.ts` 813. Prova AST 7 métodos/2 helpers, 7 assinaturas preservadas; crítica pós-código `ACCEPT`. Teste integral final com cobertura 325/2.392, PostgreSQL 35/258, Chromium 12/12, zero skips; tipo/lint/formato PASS. No root, tipo/lint/negativo focado PASS. [Evidência](../04_audit/evidence/PR203-20260927/proof.json). Estado `ROOT_LOCAL_PASS / COMPOSITE_CERTIFICATION_PENDING`; produção `NO_GO`.

## PR-203 — fatia 4 de `postgres.ts` — 27/09/2026

- [SPEC 0134](0134_postgres_slice_extraction.md) foi atualizada após recon do commit `f9f84c9` (fatia 3 já executada) e do checkout `79f28cc` (`postgres.ts` 2.106 linhas). A task PR-203 está registrada em 0356; a instrução vigente do usuário autoriza a extração local T2 sob D-12. Crítica independente `ACCEPT_LOCAL_DESIGN` após esclarecer bind local do contexto, conexão única e negativos de rollback. Estado `BUILD_LOCAL_AUTHORIZED` apenas para mover os métodos inbound/sessão, preservar SQL/transações/contrato e executar os gates da SPEC em worktree isolado. Resultado ainda `NOT_RUN`; produção `NO_GO`.

## PR-204 — contrato de configuração de produção — 27/09/2026

- [SPEC 0151](0151_production_boot_configuration_contract.md) está `SPEC_REVIEW_READY / HUMAN_T3_REVIEW_PENDING`, derivada de [AUD-0581](../04_audit/0581_production_boot_configuration_gap_2026-09-27.md) e da task PR-204. I1 rejeitou quatro pontos P1: perfil ausente do worker, dependência HMAC no boot OIDC, rollout incompatível do segredo e override `requiresApiKey: false` externo. A revisão definiu negativos e rollout A/B1/B2; I2 `ACCEPT_SPEC_REVIEW_READY` somente para revisão humana. Nenhum BUILD, boot corrigido, deploy ou GO autorizado.

## PR-301/302 — sessão confiável e D-09 — 27/09/2026

- O usuário aprovou explicitamente [SPEC 0144](0144_trusted_operator_session_production.md) para BUILD T3 e D-09: IdP corporativo OIDC com MFA obrigatório. A aprovação cobre a implementação controlada com dados sintéticos, não produção irrestrita, integração real sem parâmetros do issuer nem release.
- A fatia independente do hook que preserva cookie em falha do store foi entregue em `4f30565`. A tentativa isolada de recarga web foi rejeitada na crítica I2 e retirada; PR-302 depende de `App.tsx`/`client.ts` no claim PR-L04.
- O desenho da migration de autenticação teve versões rejeitadas nas revisões de segurança I3–I5. A versão revista com schema e runner separados, role exclusiva e revogação por linhagem recebeu `I6 ACCEPT` para iniciar BUILD controlado sob a SPEC T3 já aprovada pelo usuário. Esse aceite não certifica o SQL nem autoriza produção; exige testes de owner, RLS, grants, preflight, credencial DDL fora do processo servidor e concorrência de logout/troca.

## AUD-0578 / PR-010 — prontidão do worker homolog

- [SPEC 0141](0141_homolog_worker_shutdown_readiness.md) está
  `BUILD_LOCAL_AUTHORIZED` em T2: duas execuções da suíte revelaram um
  timeout fixo antes de SIGTERM; o teste passará a aguardar o evento de saúde
  do processo. Não modifica runtime, contrato público nem autorização de
  produção.

## AUD-0578 / PR-009 — fatia 2, peso tipográfico de fallback

- [SPEC-PR009-002](0139_visual_font_fallback.md) está `BUILD_LOCAL_AUTHORIZED` em T2: falha visual observada no Verify remoto, reprodução em Ubuntu e regra de correção registrados antes do código. Não altera contrato público nem autoriza produção.

## AUD-0578 / PR-003 — rebind do catálogo de skips

- [SPEC-PR003-002](0138_skip_catalog_rebind.md) está `BUILD_LOCAL_AUTHORIZED` em T2 para reconciliar somente dois hashes de testes alterados na PR-L05. A task PR-003 está registrada em 0356; recon, regras e aceite precedem a edição do catálogo. Não altera autorização de produção nem suprime o gate de skips.

## AUD-0578 / PR-009 — fatia 1, isolamento de artefatos E2E

- [SPEC-PR009-001](0137_e2e_artifact_isolation.md) está `BUILD_LOCAL_AUTHORIZED` na trilha T2: task registrada em 0356, recon, regras e aceite publicados antes do código. A autorização do usuário de implementar o planejamento cobre a correção local e reversível; não cobre T3/T4 nem produção. Resultado dos gates será anotado na SPEC e nos ledgers. As demais fatias de PR-009 continuam abertas.

## L03 operational index generator — draft v0.4, not approved

- [SPEC-DOC-001](0129_l03_operational_index_generator.md), revision 0.4, SHA-256 `7a144a686d7a5ce7333efa50c7f476b662b9da4a6b97936f85a0bb07504bc0a9`, is `SPEC_DRAFT_FOR_REVIEW` for the internal documentation utility in L03/P3-S7. The L03 backlog is its originating requirement; no product-facing PRD applies to this tool-only scope.
- Revision 0.4 defines ordered stopping at the first current/history delimiter, line-oriented handling of list/quote prefixes, inline-code and indented-link behavior, link/title grammar, and strict UTF-8 scope for inputs and index target. The lead-only critique is [AUD49-DOC-001](../04_audit/evidence/AUD-20260924/L03-generator-spec/critique-and-revision-03.md); independent I1 creation was refused by the service (`agent thread limit reached`). Earlier revisions remain in [AUD39](../04_audit/evidence/AUD-20260924/L03-generator-spec/spec-preparation.md) and [AUD40](../04_audit/evidence/AUD-20260924/L03-generator-spec/critique-and-revision-02.md).
- Independent and human review, and integrated verification: `NOT_RUN`. This record does not approve BUILD, tests, or command execution. A separate hash-bound gate is required before implementing the generator; C1K, C1H and manual AUD38 approval scopes do not transfer.
- The SPEC limits the generator to a marked navigation block, reads only allowlisted current-ledger sections, and preserves all source ledgers and historical content. First marker bootstrap remains a separate gate/delta.

## SPECs do ciclo AUD-0573 — draft, não aprovadas

- [SPEC-DOC-002](0130_doc_link_checker_extraction.md) (RA25-03) e [SPEC-OPS-001](0131_worker_startup_error_redaction.md) (RA25-06) estão `SPEC_DRAFT_FOR_REVIEW`. Revisão independente e humana, e verificação integrada: `NOT_RUN`. Registros aqui não aprovam BUILD nem substituem os gates `SPEC_APPROVED_CONTROLLED_BUILD` abaixo.
- Os dois BUILD foram executados sob a instrução explícita do usuário de 2026-09-25 (“Implemente todo o conteúdo dos documentos planejados”) no ciclo [AUD-0573](../04_audit/0573_repository_audit_executed_gates_2026-09-24.md), a partir dos itens RA25-03 e RA25-06 de [0351](../03_build/0351_audit0573_backlog.md). A ausência de aprovação humana específica está declarada no veredito da rodada.
- Escopo: utilitário interno de documentação e redação de erro no entrypoint do worker. Nenhum gate de produção, dado real, integração externa, IdP ou canal é afetado; produção permanece `NO_GO`.

- [SPEC-CERT-001](0132_run_bound_closure_registry.md) (AUD53 / RA25-11) está `SPEC_DRAFT_FOR_REVIEW`. Revisão independente e humana, e verificação integrada: `NOT_RUN`. A distinção adjudicação imutável versus vínculo gerado foi aprovada pelo usuário em 2026-09-25 sobre o packet [0575](../04_audit/0575_aud53_closure_rebind_decision_packet.md) e verificada por `npm run certify` (16 gates) e `npm run certification:verify` (exit 0).

- [SPEC-STRUCT-001](0133_iterative_runtime_slice_extraction.md) (RA25-07) está `SPEC_DRAFT_FOR_REVIEW`. A fatia 1 foi executada em 2026-09-25 sob a instrução do usuário (“siga pra próxima ação”): 1 065 linhas movidas para `packages/harness/src/iterative-dispatch.ts`, `iterative-runtime.ts` de 2 455 para 1 488 linhas, suíte completa 2 295 testes `PASS` e cobertura acima dos thresholds. Restam três hotspots, cada um com SPEC própria. Revisão independente e humana: `NOT_RUN`.

- [SPEC-STRUCT-002](0134_postgres_slice_extraction.md) (RA25-07, fatia 2) está `SPEC_DRAFT_FOR_REVIEW`. Executada em 2026-09-25: 816 linhas movidas para `packages/persistence/src/postgres-outbox.ts` (900 linhas), `postgres.ts` de 3 354 para 2 572; suíte completa 2 295 testes e `test:postgres` 258 testes `PASS`, cobertura inalterada. Registra explicitamente a leitura do critério de tamanho: cada fatia entrega módulo abaixo de ~1 500 linhas e reduz o alvo de forma monotônica, com o alvo de `postgres.ts` atingido na fatia 4. Revisão independente e humana: `NOT_RUN`.
- [SPEC-LEGACY-001](0135_legacy_dead_packages_and_boundary.md) (PR-L02/PR-L03, frente FL do programa PROD-20260926) está `EXECUTED`. Executada em 2026-09-26 sob a autorização do usuário ("então vamos avançar"): `packages/workflows`, `packages/tools` e `packages/memory` removidos (sem consumidor, decisão DL-02); teste de fronteira `tests/architecture/legacy-boundary.test.ts`; classe `removedTargets` no checker de links para relatórios históricos vinculados por hash. Suíte completa 2 280 testes e `test:postgres` 258 testes `PASS` em Node 22 com PostgreSQL. Revisão independente e humana: `NOT_RUN`.
- [SPEC-LEGACY-002](0136_legacy_secretary_profile_isolation.md) (PR-L05, trilha T3) está `SPEC_APPROVED_BY_USER` ("Aprovo as 3 fatias", 2026-09-26). Fatias 1, 3 e 2 executadas (nessa ordem): `policy-engine` recebe o catálogo como `PolicyProfile`; perfil de referência neutro para os testes do harness; conteúdo e preset da secretária em `legacy/packages/secretary-profile`, compostos só por `apps/api/src/legacy-composition.ts`; suíte 2 304 testes e `test:postgres` 258 testes PASS.
- [SPEC-LEGACY-003](0140_legacy_secretary_evals_isolation.md) (PR-L06, trilha T2) está `EXECUTED` (2026-09-27, `2533153`): `@cvg/agent-evals` neutro com regras de proteção e corpus de referência de 48 cenários nos mesmos thresholds; corpus, categorias e regras da secretária em `@cvg/legacy-secretary-evals`, que nenhum runtime compõe. Revisão independente e humana: `NOT_RUN`.

## Gate específico P1-S1 / M07 SPEC — aprovado; M07-S1 BUILD aguarda decisão

`SPEC_APPROVED_FOR_M07_S1_GATE_PREPARATION`: em 2026-09-23, o usuário respondeu “eu aprovo a Spec e as propostas”. Isso aprova SPEC-M07-001 e suas quatro recomendações para preparar o pedido e baseline do gate local M07-S1. A revisão lead I0 está registrada; a crítica independente I1 ficou `UNAVAILABLE` porque o serviço rejeitou nova thread por limite de agentes, então o veredito permanece `CONDITIONAL_PASS`; a verificação integrada continua `NOT_RUN`. Esta decisão não autoriza código, testes, builds, typecheck, lint ou execução de BUILD. O pedido concreto [M07-S1 BUILD](../04_audit/evidence/AUD-20260923/M07-BUILD-S1/build-gate-request.md) está `PENDING_HUMAN_M07_S1_BUILD_GATE`; é necessária nova aprovação humana do escopo, candidato e comandos. Evidências: [registro da decisão humana](../04_audit/evidence/AUD-20260923/M07-SPEC/human-decision-20260923.md), [pedido SPEC](../04_audit/evidence/AUD-20260923/M07-SPEC/spec-gate-request.md) e [M07-SPEC](../04_audit/evidence/AUD-20260923/M07-SPEC/). G21-5/G21-6 permanecem fechados e produção NO_GO.

## Gate incremental REM-0539 R2 — 2026-09-05

`SPEC_APPROVED_CONTROLLED_BUILD`: [0123_rem0539_r2_contract.md](0123_rem0539_r2_contract.md). REM-08 e a prova PostgreSQL foram fechadas; o usuário autorizou o BUILD local controlado. Integrações externas, dados reais e produção permanecem bloqueados.

## Gate incremental REM-0539 R3/R4/R5 — 2026-09-05

`SPEC_APPROVED_CONTROLLED_BUILD`: [0124_rem0539_r3_contract.md](0124_rem0539_r3_contract.md), [0125_rem0539_r4_integrations_ops.md](0125_rem0539_r4_integrations_ops.md) e [0126_rem0539_r5_qualification.md](0126_rem0539_r5_qualification.md). A autorização cobre somente BUILD/AUDIT controlado com fixtures e adapters locais.

## Gate incremental REM-0539 R1 — 2026-09-05T10:35:31.994051+00:00

`SPEC_APPROVED_CONTROLLED_BUILD`: [0122_rem0539_r1_contract.md](0122_rem0539_r1_contract.md). Execução local autorizada pelo usuário; contratos corretivos registrados antes de BUILD. Não altera gates de dados reais, integração externa ou piloto.

## Histórico anterior

## Alinhamento com PRD

- [x] Toda decisao tecnica deriva do PRD ou blueprint.
- [x] Nenhum desvio de produto foi introduzido sem registro.
- [x] Casos de uso principais cobertos.

## Arquitetura

- [x] Estilo arquitetural definido.
- [x] Justificativas claras.
- [x] Fronteiras do sistema claras.

## Dominio

- [x] Entidades definidas.
- [x] Estados definidos.
- [x] Invariantes registradas.

## Modulos

- [x] Responsabilidades claras.
- [x] Dependencias aceitaveis.
- [x] Riscos de acoplamento registrados.

## Contratos

- [x] Contratos de aplicacao definidos.
- [x] Contratos de API definidos.
- [x] Eventos assincronos definidos.

## Dados

- [x] Persistencia definida.
- [x] Integridade e migracao consideradas.
- [x] Auditoria considerada.

## Seguranca e governanca

- [x] Permissoes coerentes.
- [x] Acoes sensiveis auditaveis.
- [x] Segregacao de responsabilidades tratada.

## Integracoes

- [x] Integracoes justificadas.
- [x] Falhas previstas.
- [x] Contingencia definida.

## Operacao

- [x] Observabilidade minima definida.
- [x] Criterios operacionais claros.

## Build

- [x] Plano de build faseado.
- [x] Backlog estruturado.
- [x] Matriz de dependencia coerente.

## Resultado do gate

```txt
STATUS: CONDITIONAL_READY_FOR_PHASE_0_PLANNING
CONDICAO: Phase 0 pode preparar fundacao tecnica; fluxos funcionais sensiveis seguem bloqueados ate decisao humana de agenda, autonomia, RAG institucional e retencao
```

## Nao autorizado por este gate

- Uso com dados reais.
- Rollout com operadores.
- Confirmacao automatica de consulta.
- RAG institucional sem fonte aprovada.
- Qualquer acao clinica, financeira ou de prontuario sem approval e policy versionada.

## Exigencias antes de codar funcionalidades

- Testes, lint e typecheck executaveis desde Phase 0.
- Contratos compartilhados versionados antes de API/worker/web.
- Policy fail-closed implementada antes de qualquer tool sensivel.
- Auditoria append-only antes de integracoes externas.
- Documentar decisao humana para agenda, autonomia, RAG e retencao.
