# PR-306 — ameaças das integrações reais — 27/09/2026

- `DOCUMENTED_LOCAL / FACT_CHECK_ACCEPTED`: [modelo de ameaças](10_phase10/PHASE10_THREAT_MODEL.md) e [task 0356](03_build/0356_production_backlog_2026-09-26.md) cobrem canal, provider, RAG, agenda, IdP, exfiltração por tool e prova de CI com teste atual e lacuna de staging. I1 encontrou quatro afirmações/omissões corrigidas; I2 aceitou o inventário local. PR-504/505 registram handoff sem fonte e destino de tool como testes faltantes. Nenhuma integração real, dado real ou release autorizado.

# PR-009-PROV — âncora externa do ci-bar — 27/09/2026

- `SPEC_PROPOSED / WAITING_HUMAN_REVIEW`: [SPEC T3 0147](02_spec/0147_ci_bar_external_provenance.md) e [task em 0356](03_build/0356_production_backlog_2026-09-26.md). Falta selo fora do diretório de artefatos, verificação remota de manifesto/imagem e teste de adulteração coerente pós-gate. Sem BUILD de segurança antes de revisão explícita; produção `NO_GO`.

# PR-008/009 — verificação local e pendências de promoção — 27/09/2026

- `BUILD_VERIFIED_LOCAL`: [PR-008](02_spec/0146_web_image_digest_and_name.md) tem digest fixado, web build/smoke e gate `image` verdes; [PR-009](02_spec/0145_e2e_junit_json_run_binding.md) tem vínculo JSON/JUnit/log/run, regressões negativas e E2E 12/12 no candidato isolado `2a11435`. [Prova web/imagem](04_audit/evidence/PR008-20260927/proof.json) e [prova E2E r3](04_audit/evidence/PR009-20260927-r3/proof.json). Node 22: `npm test` 300/2.182, PostgreSQL 35/258 PASS.
- `OPEN / NO_GO`: I5 rejeitou a proveniência adversarial sem âncora externa ao diretório mutável; desenho e revisão T3 pendentes. PR-L04 ainda detém `SKIP-PG-014` e os artefatos compartilhados; recertificação/CI no SHA integrado não executados. NGINX web depende do hostname `secretary-api` no deploy (PR-L10). SPEC T3 0144/D-09 e as 13 condições de GO permanecem abertas. Nenhum deploy ou dado real autorizado.

# PR-008 — imagem web reproduzível — 27/09/2026

- `SPEC_READY / BUILD_T2`: [SPEC-PR008-001](02_spec/0146_web_image_digest_and_name.md) define digest multiarch da imagem NGINX e nome corrente no Dockerfile. Gates ainda pendentes; produção `NO_GO`.

# PR-009 I2 — prova ci-bar isolada — 27/09/2026

- `E2E_CI_BAR_VERIFIED_ISOLATED / I2_RECHECK_PENDING`: gate E2E do ci-bar 12/12 no commit `1413809`; [log/snapshots/hash e negativo de finalização](04_audit/evidence/PR009-20260927-r2/proof.json). Falta reavaliação I2 e certificado/CI no SHA integrado. Produção `NO_GO`.

# PR-009 fatia 3 — I2 em remediação — 27/09/2026

- `BUILD_VERIFIED_LOCAL_R2 / CI_BAR_E2E_PENDING`: I2 rejeitou o vínculo de log/snapshots no commit `725a1b3`; correções implementadas e testes locais verdes (`npm test` 2.178, PostgreSQL 258). Falta prova E2E/ci-bar do código corrigido, reavaliação independente e certificado integrado. Produção `NO_GO`.

# PR-009 fatia 3 — E2E isolado aprovado — 27/09/2026

- `E2E_VERIFIED_ISOLATED / CERTIFICATION_PENDING_INTEGRATED`: 12/12 PASS no commit `6bc3bfc` em worktree próprio; [JSON/JUnit com hashes](04_audit/evidence/PR009-20260927/proof.json) e IDs internos coerentes. Ainda exige certificação/CI no SHA integrado; produção `NO_GO`.

# PR-009 fatia 3 — BUILD local — 27/09/2026

- `BUILD_VERIFIED_LOCAL / E2E_PENDING_ISOLATED`: [SPEC-PR009-003](02_spec/0145_e2e_junit_json_run_binding.md) implementada. Testes focados, `typecheck`, lint, formatação, links, self-test, `npm test` 2.177 PASS e PostgreSQL 258 PASS. Falta E2E real em claim próprio e certificado do candidato integrado. Produção `NO_GO`.

# PR-009 fatia 3 — evidência E2E — 27/09/2026

- `SPEC_READY / BUILD_T2`: [SPEC-PR009-003](02_spec/0145_e2e_junit_json_run_binding.md) define JSON e JUnit da mesma invocação, com `runId`, `candidateId` e `executionId` internos, comparados ao log/certificado. Artefatos E2E aguardam claim após a PR-L04. Produção `NO_GO`.

# Backlog mestre vigente — PROD-20260926 — 27/09/2026

A [task list 0356](03_build/0356_production_backlog_2026-09-26.md) é a fonte detalhada de PR-001–PR-709 e PR-L01–L12. O [plano 0354](03_build/0354_production_executive_plan_2026-09-26.md) define 13 condições de GO. Produção `NO_GO`.

## Estado de execução

- `COMPLETED`: PR-005 (rotação integral dos ledgers, links, formatação e reconstrução SHA-256 comprovados). Concluídas anteriormente: PR-001, PR-002, PR-004, PR-006, PR-108, PR-109, PR-012 e PR-L01, L02, L03, L05, L06, conforme 0356.
- `IN_PROGRESS`: PR-003 (certificado do candidato atual; `SKIP-PG-014` no claim PR-L04), PR-009 (par JSON/JUnit e jornadas), PR-L04 (outro agente), PR-010/011 (validação remota no mesmo SHA e em `main`).
- `WAITING_HUMAN_SPEC_REVIEW`: PR-301/302 sob [SPEC-PR301/302-001](02_spec/0144_trusted_operator_session_production.md), com D-09. F1–F7 e a maioria das tarefas restantes continuam propostas, sujeitas aos gates próprios.
- RA25: [0574](04_audit/0574_aud0573_execution_evidence_2026-09-25.md) comprova RA25-01/02/03/06/08/09 concluídas, RA25-10 com política registrada; [0575](04_audit/0575_aud53_closure_rebind_decision_packet.md) concluiu RA25-04/11. RA25-07 teve fatias 1–3 concluídas segundo o [log arquivado](08_runtime/archive/prod20260926_execution_log_history.md), com trabalho estrutural adicional ainda aberto. RA25-05 depende da matriz nova e da decisão C1M; os estados históricos de 0351 e 0574 representam suas datas, sem promoção automática a GO.

## Histórico íntegro

- [Backlog mestre anterior](08_runtime/archive/prod20260926_backlog_history.md), fonte `docs/30_backlog_master.md`, SHA-256 `fedc1c99cfe9333f80c8aad864df0a310995e1d1d5c5c26c427e276dd332f937` (revisão `4aac877e5e0c504940c8ef2856928e43a1a5ed2a`).
- [Runtime anterior](08_runtime/archive/prod20260926_runtime_state_history.md) e [log anterior](08_runtime/archive/prod20260926_execution_log_history.md) mantêm as decisões e evidências completas dos ciclos anteriores.
