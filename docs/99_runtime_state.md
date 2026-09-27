# PR-301 — sessão PostgreSQL isolada em BUILD T3 — 27/09/2026

- status: `SPEC_APPROVED / PG_STORE_ACCEPTED_LOCAL / INTEGRATION_PENDING`; produção `NO_GO`.
- last_completed_action: D-09 esclarecida: IdP OIDC local com MFA para desenvolvimento/homologação, identidades sintéticas; issuer corporativo para produção depois. Migration própria de autenticação, adapter com cookie opaco e digest, troca/revogação por família, e preflight de role/ACL/RLS/funções/constraints implementados sem tocar os caminhos PR-L04.
- verification_state: [prova local](04_audit/evidence/PR301-PG-20260927/proof.json): PostgreSQL 16 descartável 8/8 testes do store e 16/16 focados com hook/sessão PASS; `typecheck`, lint, formato e links/higiene PASS. I7–I9 rejeitaram sete lacunas corrigidas com negativos; I10 `ACCEPT_LOCAL` para a fatia isolada. `npm test` intermediário 303 arquivos/2.198 PASS, 20/151 skipped sem banco, começou antes das últimas correções e não certifica o diff final. Sem prova de entrypoint, OIDC, E2E confiável ou build de imagem.
- blocking_state: `server.ts`, `App.tsx`, `client.ts` e outros caminhos da PR-L04 ainda ativos; login OIDC/PKCE e IdP local com MFA ainda não implementados; credenciais e issuer corporativos, DPO/retenção, CI integrado e release T4 pendentes.
- next_action: compor store no entrypoint e integrar OIDC local com MFA quando os claims de caminho liberarem; D-09 no pacote de decisões SHA-256 `0309ca28394c2499f0a47b60b90281b8ceca214d27066be8fd420ab1bcb15460`. Permanecer `NO_GO`.

# PR-301/302 — BUILD T3 da sessão confiável, falha do store — 27/09/2026

- status: `SPEC_APPROVED / API_HOOK_PARTIAL_BUILD / WEB_REJECTED_I2`; produção `NO_GO`.
- last_completed_action: usuário aprovou explicitamente [SPEC 0144](02_spec/0144_trusted_operator_session_production.md) e D-09 (IdP corporativo OIDC com MFA). O hook da API mantém cookie durante indisponibilidade do store. A tentativa de recarga web foi retirada após crítica I2 rejeitar os estados 401/503 no `App.tsx`; claim PR-L04 respeitado.
- verification_state: [prova local](04_audit/evidence/PR301-20260927/proof.json): teste focado final do hook e `typecheck`/ESLint. A suíte intermediária com a tentativa web passou 303 arquivos/2.199 testes (20/146 skipped sem PostgreSQL), mas não certifica o diff final. Revisão de segurança I1 identificou owner/schema/preflight e substituição transacional ainda sem desenho fechado. Apenas dados sintéticos.
- blocking_state: issuer/client/claims MFA/grupos não informados, store durável e composição do entrypoint pendentes; `server.ts`, `App.tsx` e `client.ts` pertencem à PR-L04; E2E confiável, PostgreSQL e CI integrado ainda sem prova. Sem produção irrestrita.
- next_action: desenhar migration/adapter e corrigir recarga/UI/logout/entrypoint após liberação do claim; validar com IdP sintético e obter parâmetros não secretos do IdP para integração real.

# PR-009-PROV — BUILD T3 da proveniência selada — 27/09/2026

- status: `SPEC_APPROVED / BUILD_ACCEPTED_LOCAL / REMOTE_PROVENANCE_PENDING`; produção `NO_GO`.
- last_completed_action: usuário aprovou explicitamente [SPEC 0147](02_spec/0147_ci_bar_external_provenance.md); claim `77397a1`. Implementei selo por gate em `GITHUB_OUTPUT`, verificação em finalização, hash de manifesto como output, job separado de atestação e job independente de verificação da assinatura/commit.
- verification_state: [prova local](04_audit/evidence/PR009-PROV-20260927/proof.json): críticas I1–I3 `REJECT` corrigidas; I4 `ACCEPT_LOCAL`. Testes focados 4 arquivos/24 PASS e suíte completa repetida 301 arquivos/2.196 testes PASS, 20 arquivos/146 skipped sem PostgreSQL; Node 22.23.2, `typecheck`, lint, build, actionlint 1.7.12, links/higiene/formato PASS. Nenhum run remoto/atestado neste SHA.
- blocking_state: PR-L04/certificação integrada, Verify/Security remotos no mesmo SHA, atestação de digest OCI quando existir imagem publicável, retenção/exportação e proteção de `main` permanecem abertos. GitHub `main` retornou 404 para branch protection e rulesets `[]`; push ou alteração externa requer decisão do usuário.
- next_action: commitar a fatia e preparar execução remota para aprovação final de push; depois verificar attestation, digest e política de branch no SHA integrado.

# PR-401 — inventário técnico e modelo RIPD — 27/09/2026

- status: `INVENTORY_DRAFT / DPO_APPROVAL_PENDING`; produção `NO_GO`.
- last_completed_action: leitura estática de migrations e fluxos gerou [inventário](platform/09-personal-data-inventory.md) DB-01–08, LEG-01–02 e FLOW-01–07 e [modelo RIPD](platform/10-ripd-template.md). Separados plataforma, infraestrutura compartilhada e legado Secretary, com exposição externa condicional.
- verification_state: sem consulta a banco ou dado real; críticas I1–I3 `REJECT` corrigidas e I4 `ACCEPT` para exatidão documental; `docs:check-links`, higiene, `format:check` e `git diff --check` PASS. Controles de código não provam configuração, retenção nem aprovação de ambiente.
- blocking_state: DPO/controlador deve aprovar modelo e completar RIPD por produto; PR-402/403/405, D-09, certificação integrada e demais gates de GO abertos.
- next_action: revisão e aprovação do controlador/DPO por produto; manter `NO_GO`. BUILD T3 de identidade e proveniência do CI agora autorizado pelo usuário em 27/09/2026, com issuer IdP ainda a informar.

# PR-007 — SPEC de cobertura e lint tipado — 27/09/2026

- status: `SPEC_READY / BUILD_WAITING_PR003_AND_PATH_CLAIM`; produção `NO_GO`.
- last_completed_action: recon de `vitest.config.mts` e `eslint.config.js`; registrei [SPEC-PR007-001](02_spec/0148_coverage_denominator_and_typed_lint.md) com inventário de núcleo/web/PostgreSQL, margem de cobertura, variação entre runs e lint type-aware em etapas.
- verification_state: documentação e configuração lidas; nenhum coverage, lint config, teste ou artefato de certificação alterado. O candidato antigo da AUD-0579 tinha branches 87,37% no denominador reduzido; não é baseline atual.
- blocking_state: PR-003 ainda precisa de certificado integrado; `vitest.config.mts` permanece no claim ativo PR-L04. Após ambos, executar BUILD T2 e os gates completos.
- next_action: continuar frentes independentes; reabrir PR-007 quando os caminhos e a baseline estiverem disponíveis.

# PR-306 — modelo de ameaças de integrações — 27/09/2026

- status: `DOCUMENTED_LOCAL / FACT_CHECK_ACCEPTED`; produção `NO_GO`.
- last_completed_action: atualizei [PHASE10_THREAT_MODEL](10_phase10/PHASE10_THREAT_MODEL.md) com fronteiras de canal, provider, RAG, agenda, identidade, ferramentas e CI; cada ameaça registra controle local, teste existente e lacuna para staging. I1 rejeitou quatro afirmações/omissões, corrigi o texto e I2 aceitou o inventário local.
- verification_state: `docs:check-links` PASS, crítica I2 read-only ACCEPT; sem teste amplo por ser mudança documental; dados sintéticos e integrações reais não ativadas.
- blocking_state: D-05/06/07/09, PR-301/302, PR-501–505, provenance T3 e as condições de GO seguem abertos. Modelo não substitui testes remotos, pentest ou decisões humanas.
- next_action: fechar claim documental e continuar a remediação independente; PR-504/505 guardam os testes faltantes de handoff e egress de tool.

# PR-009-PROV — SPEC T3 da âncora externa — 27/09/2026

- status: `SPEC_PROPOSED / WAITING_HUMAN_REVIEW`; produção `NO_GO`.
- last_completed_action: após I5, examinei o `verify.yml`, a fronteira entre diretório mutável e outputs do runner e a disponibilidade de atestação no repositório público; registrei [SPEC-PR009-PROV-001](02_spec/0147_ci_bar_external_provenance.md) e a task no [backlog 0356](03_build/0356_production_backlog_2026-09-26.md).
- verification_state: recon documental e fonte oficial GitHub; nenhum workflow ou código de segurança alterado. A prova r3 permanece local e não selada.
- blocking_state: revisão explícita T3 da SPEC e da fronteira de confiança, seguida de implementação/teste remoto; PR-L04, certificado integrado, SPEC 0144/D-09 e 13 condições de GO ainda pendentes.
- next_action: desenvolver o selo externo só após aprovação T3; continuar tarefas independentes e recertificação quando a PR-L04 liberar os caminhos.

# PR-008/009 — candidato T2 isolado verificado — 27/09/2026

- status: `BUILD_VERIFIED_LOCAL / EXTERNAL_PROVENANCE_PENDING / CERTIFICATION_PENDING`; produção `NO_GO`.
- last_completed_action: corrigi o finalizador E2E para exigir dois hashes, conferir log/UUID e rejeitar gates de runs diferentes; fixei o digest OCI da imagem web. Código `4b47d81`, claim do worktree `2a11435`.
- current_evidence: [SPEC PR-009](02_spec/0145_e2e_junit_json_run_binding.md), [prova E2E r3](04_audit/evidence/PR009-20260927-r3/proof.json), [SPEC PR-008](02_spec/0146_web_image_digest_and_name.md), [prova de imagem](04_audit/evidence/PR008-20260927/proof.json), [backlog 0356](03_build/0356_production_backlog_2026-09-26.md).
- verification_state: Node 22.23.2, `typecheck`, lint, formato, links, build, auditoria npm, `npm test` 300 arquivos/2.182 PASS (146 skipped sem banco), PostgreSQL 35/258 PASS, E2E Chromium 12/12 PASS, gate `image` PASS. Finalização parcial sem falhas E2E/imagem; 80 falhas esperadas por outros gates ausentes. Web HTTP 200 com alias sintético; sem alias, NGINX sai 1 por `secretary-api` não resolvido.
- blocking_state: I5 manteve REJECT para proveniência adversarial de diretório mutável, pois estado/log/relatórios podem ser trocados juntos sem âncora externa. PR-L04 ainda detém catálogo de skips e artefatos compartilhados; certificado atual e CI remoto no SHA integrado não foram reemitidos. SPEC T3 de sessão/IdP [0144](02_spec/0144_trusted_operator_session_production.md) e D-09 aguardam revisão humana; 13 condições de GO continuam abertas.
- next_action: após liberação da PR-L04, corrigir SKIP-PG-014, certificar candidato integrado e validar CI no mesmo SHA; desenhar âncora de proveniência externa sob gate de segurança T3; obter revisão da SPEC 0144/D-09 antes de BUILD de identidade. Sem dado real, deploy ou liberação irrestrita.

# PR-008 — SPEC da imagem web — 27/09/2026

- status: `SPEC_READY / BUILD_T2` para PR-008; produção `NO_GO`.
- last_completed_action: registrei [SPEC-PR008-001](02_spec/0146_web_image_digest_and_name.md) após consultar o índice OCI multiarch da tag NGINX web e reconfirmar o nome legado no Dockerfile.
- current_evidence: [backlog 0356](03_build/0356_production_backlog_2026-09-26.md), [SPEC](02_spec/0146_web_image_digest_and_name.md).
- verification_state: consulta `docker buildx imagetools inspect` retornou índice `sha256:65e3e85d…`; gates de BUILD da PR-008 ainda pendentes. Estado PR-009 permanece na entrada abaixo.
- blocking_state: produção/CI/certificado integrado ainda não aprovados; PR-L04 e I2 seguem seus claims.
- next_action: fixar digest e comentário no Dockerfile, validar imagem web e gates T2 sob Node 22.

# PR-009 I2 — E2E/ci-bar isolado verificado — 27/09/2026

- status: `E2E_CI_BAR_VERIFIED_ISOLATED / I2_RECHECK_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: gate E2E do ci-bar passou 12/12 no commit `1413809`, com log/JSON/JUnit da mesma tentativa e hashes dos snapshots guardados no estado; finalizador rejeitou XML adulterado em cópia isolada.
- current_evidence: [prova I2/hash](04_audit/evidence/PR009-20260927-r2/proof.json), [SPEC-PR009-003](02_spec/0145_e2e_junit_json_run_binding.md), [backlog 0356](03_build/0356_production_backlog_2026-09-26.md).
- verification_state: `runId=run-pr009-i2-isolated-20260927`, `executionId=2309ccef-a58c-4dbd-b590-1ac47ea6c00d`, 12 PASS/0 skipped/0 unexpected/0 flaky; JSON snapshot SHA-256 `ca19d117…`, XML `9daf3c88…`, log `06db25fd…`; `outputFailures=[]`. Gates Node 22, suíte geral e PostgreSQL na entrada anterior.
- blocking_state: reavaliação I2 e certificado/CI do SHA integrado pendentes; PR-L04 mantém catálogo/artefatos no diretório compartilhado; PR-301/302 e 13 condições de GO abertas.
- next_action: crítica I2 em contexto fresco sobre `1413809` e prova nova; após PR-L04, reconciliar SKIP-PG-014 e certificar candidato integrado.

# PR-009 fatia 3 — crítica I2 corrigida localmente — 27/09/2026

- status: `BUILD_VERIFIED_LOCAL_R2 / CI_BAR_E2E_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: crítica independente I2 rejeitou o vínculo de `executionId` com log e snapshots; corrigi a verificação do certificado/ci-bar, captura dos buffers e hashes dos snapshots.
- current_evidence: [SPEC-PR009-003](02_spec/0145_e2e_junit_json_run_binding.md), [prova E2E do commit anterior](04_audit/evidence/PR009-20260927/proof.json), [backlog 0356](03_build/0356_production_backlog_2026-09-26.md).
- verification_state: Node 22.23.2 — testes focados 12/12, self-test C30–C32 PASS, typecheck, lint, formato, `npm test` 299 arquivos/2.178 PASS (20 arquivos/146 testes pulados sem banco), PostgreSQL descartável 35/258 PASS; banco removido. A prova E2E 12/12 anterior refere-se a `6bc3bfc`, não ao código I2 corrigido.
- blocking_state: PR-L04 ainda detém catálogo/artefatos; recertificação e prova remota do SHA integrado, PR-301/302 e 13 condições de GO permanecem pendentes.
- next_action: executar E2E via ci-bar em worktree isolado sobre o código corrigido, obter reavaliação I2 e depois certificar o candidato integrado quando PR-L04 liberar seus caminhos.

# PR-009 fatia 3 — E2E isolado verificado — 27/09/2026

- status: `E2E_VERIFIED_ISOLATED / CERTIFICATION_PENDING_INTEGRATED`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: E2E real 12/12 PASS no commit `6bc3bfc` em worktree detached, Node 22, runtime compilado, portas próprias 3209/4183; JSON/JUnit da mesma tentativa validados por IDs internos, inventário e totais.
- current_evidence: [prova e hashes PR009](04_audit/evidence/PR009-20260927/proof.json), [SPEC-PR009-003](02_spec/0145_e2e_junit_json_run_binding.md), [backlog 0356](03_build/0356_production_backlog_2026-09-26.md).
- verification_state: `runId=run-pr009-isolated-20260927`, `executionId=f75f3b25-3545-413d-bb5a-6adb530dc095`, 12 PASS/0 skipped/0 unexpected/0 flaky; JSON SHA-256 `d2c6ff87…`, JUnit `b8937986…`. A primeira tentativa isolada falhou por `dist/` ausente após `npm ci`; `build:runtime` corrigiu a preparação e a repetição passou. Gates locais anteriores mantidos na entrada abaixo.
- blocking_state: certificado e CI do SHA integrado pendentes; PR-L04 mantém claim de catálogo/artefatos no diretório compartilhado; PR-301/302 e 13 condições de GO continuam abertas.
- next_action: certificar e revalidar o candidato integrado após PR-L04; seguir revisão humana T3 de identidade e decisões F1. Sem produção irrestrita.

# PR-009 fatia 3 — BUILD verificado localmente — 27/09/2026

- status: `BUILD_VERIFIED_LOCAL / E2E_PENDING_ISOLATED`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: implementei par JSON/JUnit da mesma invocação com `runId`, `candidateId` e `executionId` internos, inventário/totais validados pelo ci-bar e certificado; corrigi teste documental da rotação PR-005.
- current_evidence: [SPEC-PR009-003](02_spec/0145_e2e_junit_json_run_binding.md), [backlog 0356](03_build/0356_production_backlog_2026-09-26.md), [log](20_master_execution_log.md).
- verification_state: Node 22.23.2 — testes focados 18/18, `typecheck`, `lint`, `format:check`, links, self-test do verificador, `npm test` 299 arquivos/2.177 PASS (20 arquivos/146 testes pulados sem banco) e `test:postgres` 35/258 PASS. E2E real da nova fatia ainda pendente.
- blocking_state: PR-L04 mantém claim dos artefatos E2E no diretório compartilhado; PR-003, PR-301/302 e 13 condições de GO continuam pendentes. Banco descartável da rodada removido; artefato de self-test restaurado.
- next_action: executar E2E da PR-009 em worktree isolado com claim próprio e, após PR-L04, certificar o candidato integrado; produção permanece `NO_GO`.

# PR-009 fatia 3 — SPEC de evidência JSON/JUnit — 27/09/2026

- status: `SPEC_READY / BUILD_T2`; produção `NO_GO`.
- last_completed_action: recon estático confirmou que o JSON e o JUnit atuais são de invocações diferentes e não contêm `runId`/`candidateId`; registrei a [SPEC-PR009-003](02_spec/0145_e2e_junit_json_run_binding.md).
- current_evidence: [backlog 0356](03_build/0356_production_backlog_2026-09-26.md) e [quadro de coordenação](08_runtime/agent_coordination.md).
- verification_state: sem novo E2E ou certificação nesta fatia; artefatos E2E permanecem liberados para a PR-L04. A SPEC exige par da mesma tentativa, IDs internos e inventário/totais coerentes.
- blocking_state: PR-L04 ainda detém E2E/artefatos e código de jornadas; PR-003, PR-301/302 e as condições de GO permanecem como no estado abaixo.
- next_action: implementar T2 nos scripts sem disputar os artefatos; executar E2E/certificação apenas com claim próprio após integração.

# Estado operacional vigente — PROD-20260926 — 27/09/2026

- status: programa `IN_PROGRESS`; produção `NO_GO`; PR-005 `COMPLETED`; PR-003 `IN_PROGRESS / WAITING_FOR_PATH_CLAIM`; PR-301/302 `WAITING_HUMAN_SPEC_REVIEW`.
- last_completed_action: rotação integral dos três ledgers sob PR-005. O conteúdo anterior foi arquivado com SHA-256 dos bytes originais e links relativos ajustados; o [backlog 0356](03_build/0356_production_backlog_2026-09-26.md) registra o aceite.
- current_evidence: [AUD-0579](04_audit/0579_current_candidate_deep_audit_2026-09-27.md), [log vigente](20_master_execution_log.md), [backlog mestre](30_backlog_master.md), [histórico deste estado](08_runtime/archive/prod20260926_runtime_state_history.md), [plano de produção 0354](03_build/0354_production_executive_plan_2026-09-26.md).
- verification_state: AUD-0579 sobre `5c0b791` encontrou typecheck, lint, build, links, audit de dependências, PostgreSQL 35/258, E2E 12/12, cobertura crítica e smoke do worker PASS. `npm test`: 2.170 PASS/146 skipped sem banco; cobertura com banco 2.315 PASS/1 skipped, Phase 4A executado separadamente 1/1. `certification:verify` e `skip:governance` FAIL no candidato atual; prova remota Verify/Security vale apenas para `8ee6fa2`. A PR-005 passou em `docs:check-links`, `format:check` e reconstrução SHA-256 dos três arquivos.
- blocking_state: `SKIP-PG-014` guarda SHA anterior em `scripts/skip-catalog.json`, caminho no claim PR-L04. O entrypoint publicado não compõe store de sessão confiável e `GET /v1/session` retorna 503 sem store; a web não retoma cookie sem token segundo inspeção estática. [SPEC-PR301/302-001](02_spec/0144_trusted_operator_session_production.md) aguarda revisão humana T3 e D-09. O par JSON/JUnit E2E não comprova a mesma execução; PR-009 permanece aberta. As 13 condições de GO de 0354 continuam pendentes.
- next_action: após a PR-L04 liberar o catálogo, executar [SPEC-PR003-003](02_spec/0143_skip_pg014_source_rebind.md) e recertificar o SHA integrado; desenvolver a fatia T2 de PR-009 com claim próprio; obter revisão da SPEC-PR301/302-001 e D-09 para BUILD T3. Sem dado real, efeito externo, deploy ou liberação irrestrita.

## Histórico íntegro

- [Estado operacional anterior](08_runtime/archive/prod20260926_runtime_state_history.md), fonte `docs/99_runtime_state.md`, SHA-256 `d8092246cb5f597dc32a469c937268b90afbfa2da7d5701e100d9f1a2544b10f`.
- [Log anterior](08_runtime/archive/prod20260926_execution_log_history.md) e [backlog anterior](08_runtime/archive/prod20260926_backlog_history.md) preservam os ciclos anteriores. O Git também mantém os bytes originais na revisão `4aac877e5e0c504940c8ef2856928e43a1a5ed2a`.
