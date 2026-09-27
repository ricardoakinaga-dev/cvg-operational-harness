# PR-301-OIDC-TRANSACTION — contrato de início/callback — 27/09/2026

- `ACCEPT_LOCAL / INTEGRATION_PENDING / NO_GO`: [prova](04_audit/evidence/PR301-OIDC-TRANSACTION-20260927/proof.json) de state/nonce/PKCE S256 e cookie temporário autenticado; I15 rechecagem aceitou após corrigir replay e callback exato do Keycloak. Node 22: 6/6 focados, suíte geral 305/2.226 PASS (20/154 skipped sem banco), PostgreSQL 35/258 PASS. PR-301 permanece P0: implementar state store durável e atômico, cliente OIDC/discovery/JWKS, rotas e sessão/web confiáveis, E2E e certificação no mesmo SHA.

# PR-003-INTERIM — certificado diagnóstico do candidato — 27/09/2026

- `NO_GO / PR-L04_PENDING`: [prova isolada](04_audit/evidence/PR003-INTERIM-20260927/proof.json) do SHA `c634fcd`: 16 comandos exit 0, 15 gates PASS/1 FAIL após adjudicação; E2E em simulação 12/12, PostgreSQL 35/258. `SKIP-PG-014` tem hash de fonte vencido sob claim PR-L04. Suíte unitária completa com ambiente PostgreSQL correto passou 324/2.374 sem skips, mas o certificado arquivado não foi promovido. I14 aceitou os fatos e 38/38 hashes do bundle. Reemitir no candidato integrado após correção do catálogo; OIDC e condições de GO abertas.

# PR-301-PG-INDEX — índices de sessão PostgreSQL — 27/09/2026

- `PG_INDEX_BOUNDARY_ACCEPTED_LOCAL / INTEGRATION_PENDING / NO_GO`: [preflight](../apps/api/src/operator-session-preflight.ts) exige cinco índices canônicos e falha fechado em drift de chave, predicado ou inventário; [prova PostgreSQL](04_audit/evidence/PR301-PG-INDEX-20260927/proof.json) Node 22 com 9/9 focados, suíte geral 304/2.220 e PostgreSQL 35/258 PASS; I13 `ACCEPT_LOCAL`. PR-301 ainda depende de OIDC criptográfico, composição API/web, E2E e certificação no SHA integrado.

# PR-301-OIDC-MAP — identidade OIDC verificada — 27/09/2026

- `MAPPING_ACCEPTED_LOCAL / API_INTEGRATION_PENDING / NO_GO`: [mapeador](../apps/api/src/oidc-identity.ts) e [prova](04_audit/evidence/PR301-OIDC-MAP-20260927/proof.json) exigem MFA, autenticação recente e grupo único após verificação de ID token. Keycloak real confirmou `pwd`/`otp`/`auth_time`; Node 22: 22 testes focados, suíte geral 304/2.220 e PostgreSQL 35/258 PASS; I12 `ACCEPT_LOCAL`. PR-301 ainda precisa validar assinatura/JWKS/nonce/state/PKCE na API, compor sessão PostgreSQL, integrar web, E2E e certificar o candidato; produção não autorizada.

# PR-301-OIDC-LOCAL — IdP de homologação — 27/09/2026

- `BUILD_ACCEPTED_LOCAL / API_INTEGRATION_PENDING / NO_GO`: [D-09](03_build/0357_production_decision_packet_2026-09-26.md) aplica IdP OIDC local com MFA e identidades sintéticas. [Keycloak local](../deploy/local-oidc/README.md) importou realm e passou prova real de PKCE S256 obrigatório, redirect exato, setup e validação OTP, `amr: otp` e grupo sintético no ID token ([prova](04_audit/evidence/PR301-OIDC-LOCAL-20260927/proof.json)); I11 `ACCEPT_LOCAL`. Sem composição de API/web, validação de assinatura/nonce, E2E confiável ou IdP corporativo; nenhum GO.

# PR-301 — store PostgreSQL em BUILD T3 — 27/09/2026

- `PG_STORE_ACCEPTED_LOCAL / INTEGRATION_PENDING / NO_GO`: [SPEC 0144](02_spec/0144_trusted_operator_session_production.md) aprovada e D-09 esclarecida para IdP OIDC local com MFA em desenvolvimento/homologação ([pacote](03_build/0357_production_decision_packet_2026-09-26.md), SHA-256 `0309ca28394c2499f0a47b60b90281b8ceca214d27066be8fd420ab1bcb15460`). Migration isolada, adapter, preflight e negativos em PostgreSQL 16: 8/8 do store e 16/16 focados PASS; tipo/lint/formato/links PASS. I7–I9 rejeitaram sete lacunas corrigidas; I10 `ACCEPT_LOCAL`. A [task PR-301](03_build/0356_production_backlog_2026-09-26.md) mantém composição, OIDC/PKCE, IdP local, web, E2E e certificação abertos; nenhum GO.

# PR-301/302 — SPEC 0144 e D-09 aprovadas — 27/09/2026

- `API_HOOK_PARTIAL_BUILD / WEB_REJECTED_I2 / NO_GO`: hook preserva cookie em falha de store sob [SPEC 0144](02_spec/0144_trusted_operator_session_production.md), com [prova local](04_audit/evidence/PR301-20260927/proof.json). A tentativa de recarga web foi retirada após crítica I2 dos estados 401/503 em `App.tsx`. PostgreSQL/role/RLS, troca atômica, composição do entrypoint, OIDC + PKCE e E2E confiável seguem abertos na [task 0356](03_build/0356_production_backlog_2026-09-26.md). Issuer e parâmetros IdP ainda aguardados do usuário; produção não autorizada.

# PR-009-PROV — BUILD T3 autorizado — 27/09/2026

- Usuário aprovou [SPEC 0147](02_spec/0147_ci_bar_external_provenance.md). Selo de cada gate em output externo ao diretório, inventário de hashes brutos e jobs separados de atestação/verificação implementados localmente. I1–I3 `REJECT` corrigidos; I4 `ACCEPT_LOCAL`; [prova local](04_audit/evidence/PR009-PROV-20260927/proof.json) com 24 testes focados e suíte completa 301/2.196 PASS, 20/146 skipped sem banco. [Task 0356](03_build/0356_production_backlog_2026-09-26.md) segue `REMOTE_PROOF_PENDING`: prova remota no SHA integrado, digest OCI publicável, proteção de `main` e política de retenção/exportação pendentes. Produção `NO_GO`.

# PR-401 — inventário de dados pessoais — 27/09/2026

- `INVENTORY_DRAFT / DPO_APPROVAL_PENDING`: [inventário técnico](platform/09-personal-data-inventory.md) por schema, fluxo e legado, e [modelo RIPD](platform/10-ripd-template.md) sem valores reais. Críticas I1–I3 corrigidas; I4 `ACCEPT` factual; links, higiene e formato PASS. D-10 e [PR-401](03_build/0356_production_backlog_2026-09-26.md) só fecham após revisão/aprovação do controlador/DPO e preenchimento por produto. PR-402/403/405 e gates de produção permanecem abertos; `NO_GO`.

# PR-007 — cobertura completa e lint tipado — 27/09/2026

- `SPEC_READY / BUILD_WAITING_PR003_AND_PATH_CLAIM`: [SPEC 0148](02_spec/0148_coverage_denominator_and_typed_lint.md) e [task 0356](03_build/0356_production_backlog_2026-09-26.md). Falta liberar `vitest.config.mts` da PR-L04, estabelecer baseline certificada da PR-003 e então implementar dois relatórios/guard e lint type-aware sem reduzir pisos. Produção `NO_GO`.

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
