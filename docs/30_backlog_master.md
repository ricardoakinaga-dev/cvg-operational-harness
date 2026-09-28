# PR-301 — login local completo validado; corporativo aberto — 28/09/2026

- `LOCAL_KEYCLOAK_ENTRYPOINT_I2_ACCEPT / CORPORATE_STAGING_PENDING / NO_GO`: [prova](04_audit/evidence/PR301-LOCAL-ENTRYPOINT-20260928/proof.json) do SHA isolado `7ef74e7` percorreu Keycloak OTP, Chromium, API e PostgreSQL; I2 aceitou negativos pré-MFA/replay/logout e limpeza, 10/10 hashes. O harness não pertence ao commit e usa console sintético. Ainda faltam root integrado, IdP/IAM corporativo, staging HTTPS no mesmo digest, CI/atestação, SPEC 0157 aprovada e condições 0354.

# PR-003 / AUD20-008 — gates de proveniência em aberto — 28/09/2026

- `SPEC_0157_REVIEW_READY / BUILD_T3_WAITING_HUMAN`: [contrato](02_spec/0157_certificate_live_head_binding.md) de vínculo Git HEAD ↔ certificado aceito em crítica técnica, aguardando revisão humana explícita e testes. Certificado local `7ef74e7` continua apenas daquele SHA.
- `AUD20-008_I1_REJECTED_EVIDENCE / A21-F20_OPEN_INTERNAL`: [parecer](04_audit/evidence/AUD-20260920/AUD20-008/I1-20260928.md) encontrou 33 hashes históricos divergentes e sentinel ausente; reemitir pacote no mesmo candidato/run ou recuperar arquivos íntegros antes de I1. Root/CI/IAM/staging e 13 condições 0354 permanecem abertos; produção `NO_GO`.

# PR-003 — certificado local passou; produção ainda aberta — 28/09/2026

- `ISOLATED_16_GATES_PASS / AAA_CONTROLLED_CONDITIONAL_GO / PRODUCTION_NO_GO`: [prova](04_audit/evidence/PR003-COMPOSITE-20260928/proof.json) do SHA `7ef74e7` inclui 2.582 unit, PG 261, E2E 12, zero skips, RLS 96,95%, 38/38 hashes e verificador PASS. Integração root após PR-L04, certificado do SHA definitivo, CI/atestação, staging/IAM, provider/canal, revisão I1, proveniência do commit e condições 0354 seguem abertos.

# PR-301 — composição sintética passou; certificado atual pendente — 28/09/2026

- `ISOLATED_COMPOSITION_TESTS_PASS / CURRENT_SHA_CERTIFICATION_PENDING / NO_GO`: [prova](04_audit/evidence/PR301-COMPOSITE-20260928/proof.json) de `ae0344f`: merge OIDC/RLS sem conflitos, 340/2.582, PG 35/261, E2E 12/12, guard de catálogo PASS e RLS 191/197 branches no pai de mesmo código. Relatórios versionados de skips são antigos e ainda não certificam este SHA. Após PR-L04, integrar root, gerar relatórios atuais, CI/atestação e staging/IAM; completar 0354 antes de GO.

# PR-301 — RLS crítico passou localmente; integração pendente — 28/09/2026

- `CRITICAL_COVERAGE_LOCAL_PASS / ROOT_INTEGRATION_PENDING / NO_GO`: [prova](04_audit/evidence/PR301-RLS-20260928/proof.json) do commit isolado `42e69f4` mostra RLS 191/197 branches (96,95% ≥ 95%), 340/2.581 testes, PostgreSQL 35/261 e E2E 12/12 sem skips. Integrar após PR-L04, reconciliar `SKIP-PG-004/006` e certificar o SHA composto; fechar positivo de staging/IAM/CI e condições 0354 antes de GO.

# PR-301/302 — follow-up T3 isolado — 28/09/2026

- `LOCAL_FUNCTIONAL_PASS / CRITICAL_COVERAGE_FAIL / SYNTHETIC_BROWSER_TRANSPORT_PASS / ROOT_INTEGRATION_PENDING / NO_GO`: [correção](04_audit/evidence/PR301-CORP-I1-20260928/proof.json) `ed012a4` passou 2.578 testes, PG 258, E2E 12 e cobertura global, mas o grupo RLS ficou em 83,76% de branches contra piso 95%; [prova HTTPS](04_audit/evidence/PR302-HTTPS-BROWSER-20260928/proof.json) passou no bundle/NGINX reais com API/IdP sintéticos. Integrar após PR-L04, elevar cobertura RLS com negativos significativos, corrigir o catálogo de skips, provar o entrypoint corporativo com MFA/PG no mesmo digest em staging HTTPS público controlado, receber IAM e fechar rollback, CI/atestação/certificação e condições 0354 antes de GO.

# PR-301/302/204 — BUILD T3 sintético isolado — 28/09/2026

- `ISOLATED_SYNTHETIC_BUILD_PASS / ROOT_INTEGRATION_PENDING / STAGING_POSITIVE_NOT_RUN / NO_GO`: [prova](04_audit/evidence/PR301-CORP-T3-20260928/proof.json) do commit `7019422` registra 2.410 testes unitários PASS, PG 258/258 e OIDC/sessão PG 20/20, além do build web selado. Integrar após PR-L04 e comprovar entrypoint produtivo, MFA e recarga no mesmo digest em staging HTTPS público controlado; obter IAM, CI/atestação/certificado e demais gates 0354 antes de GO.

# PR-204 — B2 preparado, release ainda aberto — 28/09/2026

- `B2_PREPARATION_LOCAL_PASS / B2_RELEASE_NOT_PROVEN / NO_GO`: [prova](04_audit/evidence/PR204-B2-PREP-20260928/proof.json) de `643f6ad`: 333/2.478, PG 35/258, Chromium 12/12, cobertura e imagem API B1. Fase B2 por env falha antes do listener. Crítica rejeitou fechamento B2 enquanto o binário permanece pinado em B1; faltam dreno A, cofre, B1 certificado, imagem B2 e rollback em staging.

# PR-301/204 — autoridade corporativa em SPEC T3 — 28/09/2026

- `SPEC_REVIEW_READY / HUMAN_T3_REVIEW_PENDING / NO_GO`: [AUD-0582](04_audit/0582_corporate_oidc_boot_gap_2026-09-27.md) e [SPEC 0152](02_spec/0152_corporate_oidc_authority_contract.md) delimitam boot OIDC corporativo e prova no mesmo candidato. I1–I3 P1 corrigidos, I4 aceitou revisão documental. BUILD depende de aprovação explícita; IAM, SPEC 0150, staging e certificado final seguem abertos.

# PR-204 — BUILD T3 isolado validado — 27/09/2026

- `ISOLATED_BUILD_LOCAL_PASS / ROOT_INTEGRATION_PENDING / NO_GO`: [prova](04_audit/evidence/PR204-BUILD-20260927/proof.json) do branch `99692e3` registra suíte 333/2.477, PG 35/258 e Chromium 12/12 sem skips, além da imagem web selada com 10 arquivos. Fechamento de boot, gateway e worker feito sob SPEC 0151; cobertura 333/2.477 PASS com 92,28% statements e 87,45% branches. Integrar após PR-L04, executar B2, completar IdP corporativo/SPEC 0150 e certificar o SHA integrado com CI/atestação antes de GO.

# PR-203 — extração PostgreSQL inbound local concluída — 27/09/2026

- `ROOT_LOCAL_PASS / COMPOSITE_CERTIFICATION_PENDING / NO_GO`: branch `codex/pr203-postgres-extraction-20260927` (`9e949d7`) integrado ao root em `7b3871d`, com três hashes iguais, deixa `postgres.ts`/`postgres-inbound.ts` em 1.455/813 linhas. [Prova](04_audit/evidence/PR203-20260927/proof.json): AST 9/9, assinatura 7/7, crítico `ACCEPT`, suíte final 325/2.392, PG 35/258, E2E 12/12, zero skips; tipo/lint/negativo focado PASS no root. Próximo gate: compor OIDC/PR-L04 e certificar o SHA final com CI remoto; sem promoção de produção.

# PR-204 — configuração de produção T3 pronta para revisão — 27/09/2026

- `SPEC_REVIEW_READY / HUMAN_T3_REVIEW_PENDING / NO_GO`: [AUD-0581](04_audit/0581_production_boot_configuration_gap_2026-09-27.md) e [SPEC 0151](02_spec/0151_production_boot_configuration_contract.md) delimitam parser, API, worker, web e gateway. I1 rejeitou quatro P1; I2 aceitou a revisão documental. Implementar só após revisão T3, com negativos do entrypoint e certificado do SHA integrado; PR-L04 e decisões de produto continuam abertas.

# PR-301 — merge OIDC isolado validado — 27/09/2026

- `LOCAL_INTEGRATION_PASS / ROOT_INTEGRATION_PENDING / NO_GO`: [prova](04_audit/evidence/PR301-ROOT-INTEGRATION-20260927/proof.json) do branch `codex/pr301-root-integration-preview` (`0b4a95b`) combina root com OIDC sem conflitos, com 331/2.437 testes, PG 35/258 e skips zero. E2E Keycloak MFA/Chromium, tipo/lint/links/higiene PASS. PR-L04 ainda detém API/web no checkout principal; certificado/CI do SHA final, IdP corporativo, SPEC 0149/0150 e decisões de dados seguem P0. Produção `NO_GO`.

# PR-009-PROV — autenticação da CLI no job independente — 27/09/2026

- `LOCAL_VALIDATION_PASS / REMOTE_PROVENANCE_PENDING / NO_GO`: commit `cae1c2a` fornece `GH_TOKEN` ao `gh attestation verify` e [prova](04_audit/evidence/PR009-GH-TOKEN-20260927/proof.json) inclui negativo, 16 testes focados, suíte Node 22 305/2.229, PostgreSQL 35/258, Chromium 12/12, tipo/lint/actionlint. Ainda exigir execução remota no SHA integrado, atestação/digest OCI, check obrigatório e certificação.

# PR-009-PROV — CI remoto histórico não sela o candidato atual — 27/09/2026

- `HISTORICAL_REMOTE_VERIFY_PASS / CURRENT_PROVENANCE_UNPROVEN / NO_GO`: [prova remota](04_audit/evidence/PR009-REMOTE-AUDIT-20260927/proof.json) confirmou Verify/Security verdes em `8ee6fa2` e 37/37 gates no manifesto antigo, mas sem jobs/bundle de atestação, SHA divergente do checkout e `main` sem proteção/rulesets. Exigir CI da SPEC 0147 no SHA integrado, verificação independente da atestação e digest OCI, retenção/exportação e check obrigatório antes de promoção.

# PR-301 — prova sintética de topologia HTTPS — 27/09/2026

- `SYNTHETIC_BROWSER_SEMANTICS_PASS / NO_GO`: [prova Chromium](04_audit/evidence/PR301-CROSS-ORIGIN-PROBE-20260927/proof.json) em quatro hosts HTTPS sintéticos confirma isolamento de cookies da API em relação ao console e host irmão, envio do `Strict` por CORS com credenciais e retorno do `Lax` sem `Strict` por navegação iniciada no documento do IdP. É prova do navegador, não do produto. SPEC 0150 T3, BUILD, E2E integrado, issuer corporativo e certificação do SHA integrado continuam P0.

# PR-301/302 — cross-origin HTTPS do console — 27/09/2026

- `SPEC_REVIEW_READY / HUMAN_T3_REVIEW_PENDING / NO_GO`: [AUD-0580](04_audit/0580_cross_origin_oidc_gap_2026-09-27.md) provou falta de ACAC no GET/OPTIONS do hook em Node 22; web e NGINX usam `/v1` relativo/proxy. [SPEC 0150](02_spec/0150_cross_origin_operator_console.md) recebeu I27/I28 `ACCEPT_SPEC_REVIEW_READY` após corrigir cookie de domínio irmão, cache entre tenants, rollback e CSP. Aprovação T3, BUILD, hosts HTTPS/Chromium, integração e certificação permanecem P0. O E2E local anterior não cobre essa topologia.

# PR-301/402 — rollout de purge e topologia de cookie — 27/09/2026

- `SPEC_REVIEW_READY / DPO_POLICY_PENDING / NO_GO`: [SPEC 0149](02_spec/0149_operator_auth_purge.md) inclui matriz A0–A4, runner versionado, attest da policy, comparação/lock antes de purge e isolamento `READ COMMITTED`; I25 `ACCEPT_SPEC_REVIEW_READY` após dois P1 corrigidos. DP-01 a DP-06, revisão T3 humana, código, PostgreSQL, staging e certificado do candidato integrado pendentes.
- I26 `ACCEPT_LOCAL` no branch OIDC `85c2c7d`: logout por digest antigo é contrato aprovado de revogação da família; P3 local de cookie visível ao servidor Vite no mesmo hostname. Para GO, provar host-only `Secure; HttpOnly; SameSite=Strict` com console/API em hosts HTTPS distintos do mesmo site, cookie pendente Lax no callback e cookie operacional ausente nele. PR-L04 ainda mantém integração root pendente.

# PR-301/402 — retenção OIDC, SPEC 0149 pronta para revisão — 27/09/2026

- `SPEC_REVIEW_READY / DPO_POLICY_PENDING / NO_GO`: [SPEC 0149](02_spec/0149_operator_auth_purge.md) e inventário DB-09 registram purge de state/sessões/famílias, isolamento do job e rollout. I24 `ACCEPT_SPEC_REVIEW_READY` após corrigir policy sem domínio e risco de família ativa sem limite. DP-01 a DP-06 e revisão T3 explícita são gates antes de BUILD; nenhum purge foi executado. PR-301/402 permanecem P0 para GO.

# PR-301 — serving sem DDL validado isoladamente — 27/09/2026

- `I23_ACCEPT_LOCAL / ROOT_INTEGRATION_PENDING / NO_GO`: commit isolado `85c2c7d` rejeita credencial DDL e migração automática na API de produção e executa preflight somente leitura para owner, runtime, grants e schemas. Node 22: 331/2.437 sem skips, PostgreSQL 35/258, E2E Keycloak/Chromium entre sites PASS, I23 `ACCEPT_LOCAL`, 18 hashes em `docs/04_audit/evidence/PR301-PROD-STARTUP-20260927/proof.json` no branch; inventário sintético zero e contêineres encerrados. Integrar após PR-L04; IdP corporativo, retenção/purga, rollout e certificação/CI no SHA integrado permanecem P0 de GO.

# PR-301/302 — prova local I22 aceita; produção ainda bloqueada — 27/09/2026

- `I22_ACCEPT_LOCAL_PROOF / ROOT_INTEGRATION_PENDING / NO_GO`: rechecagem independente aceitou a prova entre sites e replay de cookie salvo (`8b0f92d`). Commit isolado `0b57416` corrige a descrição da sessão antiga e exige limpeza verificável antes de emitir PASS; Node 22 E2E final, tipos/lint/links/higiene PASS. Tentativa com timeout deixou objetos sintéticos descartáveis, removidos manualmente; execução final zerou inventário. Prova no branch: `docs/04_audit/evidence/PR301-302-TRUSTED-E2E-20260927/proof.json`. Integração após PR-L04 e demais gates de produção abertos.

# PR-301/302 — I22: callback entre sites e revogação comprovados localmente — 27/09/2026

- `CROSS_SITE_E2E_PASS_LOCAL / I22_RECHECK_PENDING / NO_GO`: crítica independente rejeitou a prova anterior por não reapresentar o cookie salvo após logout nem usar sites distintos. Commit isolado `8b0f92d` executou Keycloak `localhost`, API/web `127.0.0.1`, callback sem cookie Strict mas com pendente Lax, substituição da sessão antiga e replays 401. Prova Node 22 no branch: `docs/04_audit/evidence/PR301-302-TRUSTED-E2E-20260927/proof.json`. Rechecagem I22, integração após PR-L04, rollout/IdP corporativo, dados e certificação no mesmo SHA seguem abertos.

# PR-301/302 — E2E confiável local com MFA real — 27/09/2026

- `TRUSTED_BROWSER_E2E_PASS_LOCAL / ROOT_INTEGRATION_PENDING / NO_GO`: commit isolado `cb943e8` comprova console/API/PostgreSQL/Keycloak em Chromium, OTP errado negado, OTP correto, cookie HttpOnly/Strict, recarga só por cookie e logout revogado; Node 22 e 24 PASS. Prova no branch `docs/04_audit/evidence/PR301-302-TRUSTED-E2E-20260927/proof.json`. Integração após PR-L04, crítica independente, IdP corporativo, retenção/purge, rollout e certificação/CI no SHA integrado seguem abertos.

# PR-302-WEB-OIDC — console local com login MFA — 27/09/2026

- `BUILD_VERIFIED_LOCAL / REVIEW_AND_E2E_PENDING / NO_GO`: branch isolado `codex/pr301-oidc-client` commits `531ef2a` e `1c1ae32` liga início OIDC, recarga por cookie, 401/503 distintos e logout seguro; suíte web 26/96, tipos/lint/build/links PASS. Prova no branch: `docs/04_audit/evidence/PR302-OIDC-WEB-20260927/proof.json`. Faltam crítica independente, E2E web/API/PostgreSQL/Keycloak, integração após PR-L04 e certificação do SHA integrado.

# PR-301-OIDC-ROUTES — rotas locais com sessão confiável — 27/09/2026

- `ACCEPT_LOCAL / ROOT_INTEGRATION_PENDING / NO_GO`: branch isolado `codex/pr301-oidc-client` commit `b41cff2` contém rotas de login/callback OIDC, preflight PostgreSQL, sessão opaca por cookie, replace atômico e logout revogado. I19/I20 aceitaram após correções; suíte com banco 330/2.428, `test:postgres` 35/258, Keycloak MFA e gates de tipos/lint/links/audit PASS. Prova no próprio branch: `docs/04_audit/evidence/PR301-OIDC-ROUTES-20260927/proof.json`. Integrar após PR-L04; implementar PR-302 web, IdP corporativo, retenção/purge, rollout e certificação/CI no mesmo SHA antes de considerar produção.

# PR-301-OIDC-CLIENT — cliente OIDC local isolado — 27/09/2026

- `ACCEPT_LOCAL / ROOT_INTEGRATION_PENDING / NO_GO`: branch `codex/pr301-oidc-client` commit `30d3ca4` contém cliente OIDC com assinatura/JWKS, nonce, PKCE, MFA/tenant e prova real Keycloak. I18 aceitou; Node 22: 41/41 focados, suíte sem banco 306/2.240 PASS (20/162 skipped), tipo/lint/audit/links PASS. Prova no branch isolado `docs/04_audit/evidence/PR301-OIDC-CLIENT-20260927/proof.json`. Integrar depois que PR-L04 liberar package/lockfile/contrato, API e web; compor store PostgreSQL, testar E2E confiável e certificar mesmo SHA. Produção segue bloqueada.

# PR-301-OIDC-STATE-PG — state OIDC compartilhado — 27/09/2026

- `ACCEPT_LOCAL / INTEGRATION_PENDING / NO_GO`: [prova](04_audit/evidence/PR301-OIDC-STATE-PG-20260927/proof.json) da migration incremental e consumo único em PostgreSQL 16; I16 aceitou desenho local, I17 aceitou BUILD após negativos de FK extra e timeout. Node 22: 26/26 focados, suíte 325/2.391 sem skips, PostgreSQL 35/258 PASS. PR-301 ainda P0: compor API, completar cliente OIDC/discovery/JWKS, ligar web/Keycloak, executar purge/rollback, E2E confiável e certificado no mesmo SHA.

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

# PR-202 — fatia local integrada; OIDC/HTTPS T3 liberados para BUILD sintético — 28/09/2026

- `FIRST_SLICE_ROOT_LOCAL_PASS / FULL_PR202_OPEN / NO_GO`: [prova](04_audit/evidence/PR202-SLICE-20260928/proof.json) do root `69d08d3` com AST 3/3, crítico I2 `ACCEPT`, 325/2.393 com cobertura, PG 35/258, Chromium 12/12 e regressão root 13/275. Restam execução/replay, redução do arquivo e certificado composto. `skip:governance` falha por hash `SKIP-PG-014` vencido sob PR-L04; zero skips observados.
- [SPEC 0150](02_spec/0150_cross_origin_operator_console.md) e [SPEC 0152](02_spec/0152_corporate_oidc_authority_contract.md) receberam aprovação humana T3 para BUILD e testes somente sintéticos. Implementar em worktree com IdP HTTPS e hosts distintos; IAM real, DP/ops, integração, CI/atestação e 13 condições de 0354 permanecem gates de produção.
