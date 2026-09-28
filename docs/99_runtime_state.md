# AUD20-008 — I1 novo e sentinel no candidato isolado — 28/09/2026

- status: `I1_APPROVED_NEW_CANDIDATE / SENTINEL_MATCH / CLOSURE_REGISTRY_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: [packet](04_audit/evidence/AUD20-008-I1-20260928/packet.json) congelou os oito arquivos de fencing no candidato `47440863…`, run `run-pr003-composite-r2-20260928` e SHA `7ef74e7`; [parecer independente](04_audit/evidence/AUD20-008-I1-20260928/I1-review.md) aprovou o critério sem P0/P1. [Sentinel](04_audit/evidence/AUD20-008-I1-20260928/sentinel-review.md) `MATCH` foi rechecado por Hypatia em 1.503 arquivos e bundle.
- verification_state: cert arquivado 16/16 gates, 38/38 artefatos e PG 261/261 sem skips; revisão de código/SQL/testes e hashes sem reexecutar gates nesta fatia. Worktree `7ef74e7` limpo, bytes do packet preservados.
- blocking_state: o certificado existente ainda registra `A21-F20 OPEN_INTERNAL`; nova adjudicação e cert do SHA final exigem gate próprio. P2 do preflight confere nomes de constraints, não definições. Root PR-L04, CI/atestação, IAM/staging, SPEC 0157 T3 e condições 0354 pendentes.
- next_action: registrar o P2 em SPEC de segurança e, após aprovação T3, corrigir; reemitir adjudicação/certificado no SHA integrado quando PR-L04 liberar os caminhos. Produção `NO_GO`.

# PR-003 — negativo de HEAD do verificador — 28/09/2026

- status: `HEAD_DRIFT_REPRODUCED / SPEC_0157_HUMAN_T3_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: worktree certificado `7ef74e7` recebeu commit vazio `60bbf22`; zero diff de árvore e ID de candidato igual, mas `certification:verify` saiu 0 e qualificou o HEAD com `result.commit`, `manifest.commit` e `candidate.git.head` ainda em `7ef74e7`. [Prova](04_audit/evidence/PR003-HEAD-DRIFT-20260928/reproduction.json) e [crítica I1](04_audit/evidence/PR003-HEAD-DRIFT-20260928/I1-review.md) `ACCEPT_REPRO`.
- verification_state: Node 22, dois runs do verificador exit 0, 38/38 hashes, dois logs rehashados, candidato `47440863…` inalterado; o crítico repetiu o verificador em leitura. Nenhum código de produto ou do verificador foi alterado.
- blocking_state: P1 do gate de release aberto. [SPEC 0157](02_spec/0157_certificate_live_head_binding.md) T3 aguarda revisão humana; root/PR-L04, CI/atestação, IAM/staging e condições 0354 continuam pendentes.
- next_action: após aprovação T3, implementar e testar recusa de HEAD divergente e vínculo interno do manifesto em worktree isolado; reemitir certificado somente no SHA final integrado. Produção `NO_GO`.

# PR-301 — login Keycloak/MFA no entrypoint local — 28/09/2026

- status: `ISOLATED_LOCAL_ENTRYPOINT_I2_ACCEPT / CORPORATE_STAGING_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: [prova](04_audit/evidence/PR301-LOCAL-ENTRYPOINT-20260928/proof.json) no SHA isolado `7ef74e7` percorreu Chromium → Keycloak com OTP → callback HTTP Fastify → sessão PostgreSQL. Crítica I1 rejeitou três lacunas da prova; após correção e nova execução, [I2](04_audit/evidence/PR301-LOCAL-ENTRYPOINT-20260928/I2-review.md) aceitou o escopo local.
- verification_state: Node 22.23.2, PostgreSQL 16.15 e Keycloak 26.7.4 pinado; sem sessão após OTP errado, sessão persistida após OTP válido, state consumido, replay com cookie pendente restaurado 401, cookie operacional antigo 401 após logout e família revogada. Exit 0, 10/10 hashes; zero usuários/roles/schemas/contêineres/portas próprios ao fim.
- blocking_state: harness de auditoria fora do commit, destino de console sintético, IdP corporativo HTTPS/IAM real e staging no digest de produção não testados. Root PR-L04, CI/atestação, SPEC 0157 T3 aguardando revisão humana e condições 0354 abertos.
- next_action: integrar o SHA root após PR-L04 e executar o positivo corporativo em staging HTTPS com IAM; implementar SPEC 0157 somente após aprovação T3. Produção `NO_GO`.

# PR-003 / AUD20-008 — revisão de proveniência e I1 — 28/09/2026

- status: `SPEC_0157_REVIEW_READY / AUD20_008_I1_REJECTED / PROGRAM_IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: [SPEC 0157](02_spec/0157_certificate_live_head_binding.md) T3 foi corrigida após crítica independente e está pronta para revisão humana; exige vínculo entre Git HEAD, resultado, manifesto e candidato, com ciclo de certificado no SHA final e histórico separado. [Parecer I1](04_audit/evidence/AUD-20260920/AUD20-008/I1-20260928.md) rejeitou o fechamento histórico de AUD20-008: seis hashes próprios conferem, 33 artefatos compartilhados divergem e sentinel falta.
- verification_state: `docs:check-links`, higiene, Prettier e diff passaram; nenhuma implementação T3 ou nova certificação nesta fatia. Código de fencing e teste PostgreSQL preservado apoiam comportamento local, sem vincular o run histórico.
- blocking_state: revisão humana T3 da SPEC 0157, novo pacote I1 verificável, root PR-L04/CI/IAM/staging e condições 0354 pendentes.
- next_action: após aprovação T3, implementar e testar o vínculo do verificador em branch isolado; para AUD20-008, recuperar bundle antigo íntegro ou revisar novo candidato congelado e registrar sentinel real. Produção `NO_GO`.

# PR-003 — certificado interino do candidato OIDC/RLS — 28/09/2026

- status: `ISOLATED_16_GATES_PASS / AAA_CONTROLLED_CONDITIONAL_GO / ROOT_AND_EXTERNAL_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: sob [SPEC 0156](02_spec/0156_worker_startup_smoke_node_env.md), commit isolado `7ef74e7` corrigiu o ambiente dos smokes de worker. Certificação inicial de `ae0344f` encontrou 14/16 PASS; nova certificação de `7ef74e7` passou 16/16. [Prova](04_audit/evidence/PR003-COMPOSITE-20260928/proof.json) e crítica independente aceitam o certificado somente para o SHA isolado.
- verification_state: Node 22/PostgreSQL 16, 340/2.582 unit, PG 35/261, Chromium 12/12, zero skips, RLS 191/197 (96,95%); `certification:verify` exit 0 e 38/38 hashes de artefatos também conferidos dentro do bundle arquivado. HEAD/manifest/resultado iguais a `7ef74e7`; zero objetos sintéticos residuais e contêiner removido.
- blocking_state: root sob PR-L04 tem outro SHA; CI remoto/atestação e proveniência do SHA definitivo, IdP/provider/canal reais, staging HTTPS/IAM, decisão humana e 13 condições 0354 não foram comprovados. P2 do verificador não compara automaticamente commit registrado com Git HEAD; a comparação manual passou apenas aqui. P2 de revisão I1 independente permanece no certificado.
- next_action: integrar após PR-L04, corrigir/revisar vínculo de commit do verificador sob gate apropriado, recertificar o SHA root, validar CI e staging e obter decisões externas. Produção `NO_GO`.

# PR-301 — prévia integrada OIDC/RLS com catálogo reconciliado — 28/09/2026

- status: `ISOLATED_COMPOSITION_TESTS_PASS / CURRENT_SHA_CERTIFICATION_PENDING / ROOT_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: merge isolado `c78a64a` combinou root e OIDC/RLS sem conflitos; commit `ae0344f` corrigiu apenas `SKIP-PG-004/006` segundo [SPEC 0155](02_spec/0155_isolated_skip_catalog_rebind_004_006.md). Revisor independente fechou P1 e deixou P2 de evidência do candidato. [Prova](04_audit/evidence/PR301-COMPOSITE-20260928/proof.json).
- verification_state: Node 22/PostgreSQL 16: 340/2.582 testes no SHA final, PG 35/261, E2E 12/12, tipo/lint/formato/links PASS, zero skips e objetos sintéticos residuais. Cobertura no pai de mesmo código fonte 340/2.582, RLS crítico 191/197 (96,95%) PASS. Guard de catálogo PASS após o reparo, mas lê relatórios versionados antigos.
- blocking_state: inventário/certificação hash-bound do SHA `ae0344f` ainda não emitidos; root e catálogo compartilhado sob PR-L04, CI remoto/atestação, positivo corporativo em staging/IAM e condições 0354 pendentes.
- next_action: após PR-L04, reconciliar o catálogo no SHA root definitivo, gerar relatórios atuais e certificação completa; validar CI/atestação e staging antes de decisão humana de release. Produção `NO_GO`.

# PR-301 — negativos RLS aceitos no branch isolado — 28/09/2026

- status: `ISOLATED_T2_BUILD_PASS / CRITICAL_COVERAGE_PASS / ROOT_AND_CERTIFICATION_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: commit `42e69f4` adicionou negativos PostgreSQL reais de owner, role, RLS/policy e catálogo sob [SPEC 0154](02_spec/0154_rls_preflight_negative_coverage.md); crítica independente `ACCEPT`. [Prova](04_audit/evidence/PR301-RLS-20260928/proof.json).
- verification_state: Node 22/PostgreSQL 16, cobertura e `npm test` 340/2.581 sem skips, PostgreSQL 35/261, Chromium 12/12, tipo/lint/formato PASS; RLS 191/197 branches (96,95%) com piso 95% e denominador preservado. Banco descartável terminou sem roles/schemas sintéticos.
- blocking_state: `skip:governance` acusa `SKIP-PG-004/006` por hashes vencidos; PR-L04 detém o catálogo compartilhado. Código ainda isolado; falta compor root, CI remoto/atestação, positivo corporativo em staging, IAM real e certificado do SHA integrado.
- next_action: após liberação PR-L04, integrar commit, reconciliar catálogo de skips e reemitir certificação no mesmo SHA; manter produção `NO_GO`.

# PR-301/302 — correção OIDC corporativa e prova HTTPS do produto — 28/09/2026

- status: `ISOLATED_REMEDIATION_ACCEPTED / SYNTHETIC_HTTPS_TRANSPORT_PASS / ROOT_AND_STAGING_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: commit isolado `ed012a4` corrigiu quatro falhas da crítica pós-BUILD: compatibilidade de site do cookie Strict, authorization host corporativo, callback com cookie legado/malformado e timeout DNS. [Prova de código](04_audit/evidence/PR301-CORP-I1-20260928/proof.json); [prova Chromium/NGINX](04_audit/evidence/PR302-HTTPS-BROWSER-20260928/proof.json) com imagem local do commit e hosts HTTPS sintéticos do mesmo site.
- verification_state: Node 22 + PostgreSQL 16, suíte 340 arquivos/2.578 testes PASS sem skips, PG 35/258 PASS, Chromium 12/12 PASS, tipo/lint/formato/links PASS; cobertura global 92,14% statements/87,46% branches PASS. Crítica independente `ACCEPT`. O navegador comprovou bundle/NGINX e hook HTTP real, com sessão/IdP sintéticos.
- blocking_state: cobertura crítica `FAIL` no grupo RLS (83,76% branches contra 95%); `skip:governance` `FAIL` por hash de fonte sob claim PR-L04; root API/web ainda sob PR-L04. Sem positivo do entrypoint corporativo com issuer HTTPS público controlado, IAM real, staging no mesmo digest, migração/rollback, CI remoto/atestação ou certificado do SHA integrado.
- next_action: integrar o branch após a liberação da PR-L04, reconciliar o catálogo e certificar o SHA final; executar staging corporativo sintético e obter pacote IAM antes de qualquer decisão de produção.

# PR-301/302/204 — BUILD T3 sintético corporativo/HTTPS isolado — 28/09/2026

- status: `ISOLATED_SYNTHETIC_BUILD_PASS / ROOT_INTEGRATION_PENDING / STAGING_POSITIVE_NOT_RUN`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: branch `codex/pr301-corporate-20260928` (`7019422`) implementou client OIDC corporativo, MFA/grupos, composição de boot com PostgreSQL, cookies `__Host-`, console/API em hosts HTTPS distintos e bundle web selado. [Prova](04_audit/evidence/PR301-CORP-T3-20260928/proof.json).
- verification_state: Node 22, suíte 319 arquivos/2.410 testes PASS (21/164 skips sem serviços externos), PostgreSQL 16 descartável 35/258 PASS e OIDC/sessão PostgreSQL 2/20 PASS; web focado 2/35, tipo/lint/formato/builds PASS. Banco próprio removido. Apenas dados sintéticos.
- blocking_state: PR-L04 detém API/web no root; positivo do entrypoint produtivo com issuer HTTPS público controlado, prova Chromium do mesmo digest, pacote IAM real, migração/rollback, CI remoto/atestação e condições de GO do plano 0354 pendentes.
- next_action: integrar branch após liberação da PR-L04, repetir gates no SHA final e executar staging sintético/publicado antes de qualquer decisão de produção.

# PR-204 — preparação B2 validada, release pendente — 28/09/2026

- status: `B2_PREPARATION_LOCAL_PASS / B2_RELEASE_NOT_PROVEN`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: branch isolado `643f6ad` adicionou aviso sem segredo para uso do alias antigo em dev/test na futura fase B2. [Prova](04_audit/evidence/PR204-B2-PREP-20260928/proof.json) inclui imagem API B1 real: `/live` 200 e spoof de fase B2 recusado antes do listener, sem valor secreto em logs.
- verification_state: Node 22 333/2.478 com cobertura 92,28% statements/87,45% branches, PostgreSQL 35/258, Chromium 12/12, tipo/lint/formato/skip e build runtime/Docker PASS. Crítica independente rejeitou **prova de release B2** porque o binário segue corretamente pinado em B1.
- blocking_state: drenar A, certificar B1, cofre e transições/rollback B2 em staging, branch root integrado após PR-L04 e demais gates produtivos. Produção `NO_GO`.
- next_action: publicar um B2 pinado somente após a frota B1 certificada e drenagem de A, então testar entrypoint e rollback; continuar frentes independentes até lá.

# PR-301/204 — contrato OIDC corporativo pronto para revisão — 28/09/2026

- status: `SPEC_REVIEW_READY / HUMAN_T3_REVIEW_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: [AUD-0582](04_audit/0582_corporate_oidc_boot_gap_2026-09-27.md) distinguiu rejeição segura do boot de prova positiva corporativa. [SPEC 0152](02_spec/0152_corporate_oidc_authority_contract.md) exige client confidencial, MFA e grupos aprovados, boot e login Chromium no mesmo digest, preflight compatível e drenagem integral de sessões/state para rollback. Críticas I1–I3 rejeitaram lacunas P1 corrigidas; I4 `ACCEPT_SPEC_REVIEW_READY` documental.
- verification_state: inspeção de código/contratos, crítica independente I1–I4 e links/formato documentais; nenhuma implementação corporativa, issuer IAM ou teste positivo de produção nesta fatia.
- blocking_state: revisão humana T3 da SPEC 0152, parâmetros IAM, SPEC 0150, integração root após PR-L04, staging, CI/certificação e demais 13 condições de GO. Produção `NO_GO`.
- next_action: após aprovação T3, implementar e testar com issuer HTTPS sintético; sem conexão ao IdP real até receber pacote IAM e gate de release.

# PR-204 — BUILD T3 validado no branch isolado — 27/09/2026

- status: `ISOLATED_BUILD_LOCAL_PASS / ROOT_INTEGRATION_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: sob [SPEC 0151](02_spec/0151_production_boot_configuration_contract.md) aprovada, branch `codex/pr204-boot-20260927` (`99692e3`) congela o perfil de boot da API, recusa produção sem autoridade OIDC corporativa, valida worker e gateway, e sela o bundle web. Imagem Docker remove arquivos padrão do Nginx e preserva UID 101. [Prova](04_audit/evidence/PR204-BUILD-20260927/proof.json).
- verification_state: Node 22/PostgreSQL sintético: suíte 333 arquivos/2.477 testes, gate PG 35/258 e Chromium 12/12 PASS, zero skips; Docker web com 10 arquivos e digest validado. Cobertura completa 333/2.477 PASS, sem skips: statements 92,28%, branches 87,45%, funções 95,06%, linhas 93,27%.
- blocking_state: PR-L04 detém integração root; rollout B2 do segredo, IdP corporativo, SPEC 0150, decisões de produto, certificado/CI/atestação do SHA integrado pendentes. Produção `NO_GO`.
- next_action: compor após PR-L04, executar B2 controlado e certificar o SHA final com proveniência remota antes de qualquer promoção.

# PR-203 — extração PostgreSQL inbound validada localmente — 27/09/2026

- status: `ROOT_LOCAL_PASS / COMPOSITE_CERTIFICATION_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: commit isolado `9e949d7` moveu sete métodos inbound e dois helpers para `postgres-inbound.ts`; `postgres.ts` tem 1.455 linhas e o módulo novo 813. [Prova](04_audit/evidence/PR203-20260927/proof.json) inclui AST 9/9, assinaturas 7/7 e crítica independente `ACCEPT`.
- verification_state: Node 22/PostgreSQL 16: suíte integral final com cobertura 325 arquivos/2.392 testes sem skips; PG 35/258; Chromium 12/12; tipo, lint, formato e links/higiene PASS. Integrado ao root em `7b3871d`, com três hashes iguais, tipo/lint/negativo focado PASS. O teste novo rejeita correlation ID inválido antes de acesso ao banco.
- blocking_state: composição com OIDC/PR-L04, CI remoto, certificado do SHA final e decisões de identidade/dados/topologia permanecem. Produção `NO_GO`.
- next_action: compor o candidato final após PR-L04 e repetir os gates nesse SHA; continuar frentes independentes.

# PR-204 — contrato de configuração de produção especificado — 27/09/2026

- status: `SPEC_REVIEW_READY / HUMAN_T3_REVIEW_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last*completed_action: [AUD-0581](04_audit/0581_production_boot_configuration_gap_2026-09-27.md) reproduziu o parser aceitando flags `ENABLE_REAL*\*`e defaults inadequados; o preflight do worker aceita`NODE_ENV` ausente/inválido. [SPEC 0151](02_spec/0151_production_boot_configuration_contract.md) define snapshot de boot, seleção OIDC, bundle web, provider e rollout de segredo. I1 rejeitou quatro P1; I2 aceitou a revisão para revisão humana.
- verification_state: sondas sintéticas Node 22 do parser e preflight, inspeção de API/worker/web/gateway, crítica independente I1/I2; links, higiene e formato documentais. Nenhum boot completo, teste amplo, código ou deploy nesta fatia.
- blocking_state: revisão humana T3 antes de BUILD; PR-L04/branch OIDC, issuer corporativo, SPEC 0150, provider e certificação do SHA integrado ainda pendentes. Produção `NO_GO`.
- next_action: após aprovação T3, implementar a matriz no candidato integrado, executar negativos de processo e gates Node 22/PostgreSQL/E2E; manter as demais frentes independentes em andamento.

# PR-301 — merge OIDC no candidato isolado — 27/09/2026

- status: `ISOLATED_INTEGRATION_LOCAL_PASS / ROOT_AND_REMOTE_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: branch `codex/pr301-root-integration-preview` mesclou sem conflito o checkout `d43d3f5` com OIDC `85c2c7d` (`dd954ab`); commit `0b4a95b` ajustou o verificador E2E para porta API isolada e reconciliou os hashes de `SKIP-PG-004/014`. [Prova](04_audit/evidence/PR301-ROOT-INTEGRATION-20260927/proof.json).
- verification_state: Node 22/PostgreSQL 16: suíte completa 331 arquivos/2.437 testes e gate PostgreSQL 35/258, zero skips; `skip:governance`, tipo, lint, formato, links/higiene PASS. Chromium com Keycloak MFA real confirmou OTP errado negado, callback entre sites, recarga por cookie, troca/revogação e replay negado. Roles/schemas sintéticos zerados; Keycloak e PostgreSQL próprios removidos.
- blocking_state: branch isolado ainda não integrado no checkout compartilhado por claim PR-L04; certificado e CI remoto no mesmo SHA, IdP corporativo, SPEC 0149/0150 T3, retenção e rollout pendentes. Produção `NO_GO`.
- next_action: após PR-L04 liberar os caminhos, reconciliar o candidato principal e certificar seu SHA; obter decisões humanas de identidade, dados e topologia antes de promoção.

# PR-009-PROV — verificador de atestação autenticado localmente — 27/09/2026

- status: `LOCAL_VALIDATION_PASS / REMOTE_PROVENANCE_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: sob SPEC 0147 aprovada, commit `cae1c2a` forneceu `GH_TOKEN: ${{ github.token }}` ao passo `gh attestation verify` do job independente e acrescentou regressão no contrato. [Prova](04_audit/evidence/PR009-GH-TOKEN-20260927/proof.json) inclui negativo que falha sem o token e JUnit E2E.
- verification_state: Node 22.23.2, worktree isolado: 16 testes focados, suíte sem banco 305/2.229 PASS (20 arquivos/162 testes skipped), PostgreSQL 16 35/258 PASS, Chromium 12/12 PASS, typecheck/lint/actionlint 1.7.12/formato PASS. Primeira tentativa E2E parou por `@cvg/shared` sem dist; compilação isolada resolveu a precondição. Nenhum run remoto novo.
- blocking_state: push não autorizado; atestação real do SHA integrado, digest OCI, proteção de `main` e certificação final pendentes. Produção `NO_GO`.
- next_action: integrar candidato quando PR-L04 liberar; executar Verify/Security e verificação independente no mesmo SHA após autorização de push, então avaliar o resultado para promoção.

# PR-009-PROV — auditoria remota da proveniência do CI — 27/09/2026

- status: `HISTORICAL_REMOTE_VERIFY_PASS / CURRENT_PROVENANCE_UNPROVEN`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: [prova remota](04_audit/evidence/PR009-REMOTE-AUDIT-20260927/proof.json) do GitHub: Verify `36309111340` e Security `36309111343` passaram no SHA `8ee6fa2`; o manifesto baixado lista 37 gates PASS e 60 arquivos presentes, SHA-256 `51bdfe6d6aa4cd3591978b49c273a9e03814a09e402c59cf50251ea247fdb923`.
- verification_state: o run tem só o job Verify, sem jobs de atestação/verificação independente ou bundle; pertence a SHA divergente do checkout atual. API do GitHub retornou `main` sem branch protection (404) e sem rulesets. A CLI local 2.45.0 não oferece `gh attestation`; a contagem de arquivos não é prova criptográfica de integridade.
- blocking_state: workflow SPEC 0147 ainda sem execução remota no SHA integrado; atestação de manifesto/digest OCI, retenção/exportação e proteção do check de proveniência pendentes. Sem push autorizado. Produção `NO_GO`.
- next_action: após integração do candidato e autorização de push, executar Verify/Security no mesmo SHA, conferir o bundle em verificador independente e aplicar proteção de `main`; continuar os gates locais independentes.

# PR-301 — prova sintética HTTPS de cookies — 27/09/2026

- status: `SYNTHETIC_BROWSER_SEMANTICS_PASS / SPEC0150_T3_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: [prova Chromium](04_audit/evidence/PR301-CROSS-ORIGIN-PROBE-20260927/proof.json) com hosts HTTPS sintéticos distintos confirmou que o console não recebeu cookies da API, a requisição CORS com credenciais levou o cookie operacional `Strict` à API, a navegação iniciada em documento do IdP levou o cookie pendente `Lax` ao callback sem levar o `Strict`, e um host irmão não conseguiu injetar/substituir cookie `__Host-` da API.
- verification_state: Node 22.23.2, Chromium 147.0.7727.15, quatro servidores HTTPS sintéticos e certificado descartável; `result.json` SHA-256 `7c1a30960d993590a6c9e443c96a008cc7d20053381055a9b8d59721f889a76f`. Uma navegação inicial direta com redirecionamento do IdP enviou `Strict` e foi descartada como modelo inadequado do callback; a execução final usou documento do IdP com link. Nenhum código do produto, troca OIDC, banco, CDN ou NGINX foi testado.
- blocking_state: revisão humana T3 da SPEC 0150, implementação e E2E real entre hosts; issuer corporativo, PR-L04, purge/retensão e certificação do SHA integrado. Produção `NO_GO`.
- next_action: após aprovação da SPEC 0150, implementar em branch isolado, provar o fluxo real em navegador e integrar quando PR-L04 liberar; avançar gates independentes enquanto isso.

# PR-301/302 — fronteira HTTPS console/API, SPEC 0150 pronta — 27/09/2026

- status: `SPEC_REVIEW_READY / HUMAN_T3_REVIEW_PENDING / ROOT_INTEGRATION_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: [AUD-0580](04_audit/0580_cross_origin_oidc_gap_2026-09-27.md) inspecionou o branch OIDC `85c2c7d`: cliente web usa fetch relativo, Vite/NGINX encaminham `/v1` no host do console e o hook HTTP não emite `Access-Control-Allow-Credentials`. Node 22, `Fastify.inject`: `GET 200` e `OPTIONS 204` da origem permitida vieram com ACAO e `Vary`, sem ACAC. A [SPEC 0150](02_spec/0150_cross_origin_operator_console.md) propõe hosts HTTPS distintos, origem fixa, CORS/CSRF, cookies `__Host-`, cache privado sem armazenamento, CSP e cutover seguro. I27/I28 rejeitaram a primeira versão e aceitaram a revisão `ACCEPT_SPEC_REVIEW_READY` somente para revisão humana.
- verification_state: inspeção de código/hashes, sonda HTTP sintética Node 22 e críticas independentes; formatação, links e higiene documental em fechamento. Nenhum código foi alterado, nem HTTPS/Chromium com dois hosts, IdP corporativo, deploy ou certificação executados nesta rodada.
- blocking_state: aprovação explícita T3 da SPEC 0150 para BUILD; domínio/issuer corporativo e revisão dos parâmetros OIDC; PR-L04 ativo para integração root; retenção/purge DP-01 a DP-06 e certificação no SHA integrado. Produção `NO_GO`.
- next_action: apresentar a SPEC 0150 para revisão; após aprovação, construir e provar o transporte em hosts HTTPS sintéticos no branch isolado, então integrar quando PR-L04 liberar e certificar o candidato completo.

# PR-301/402 — rollout de purge especificado e I25 aceito — 27/09/2026

- status: `SPEC_REVIEW_READY / DPO_POLICY_PENDING / ROOT_INTEGRATION_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: [SPEC 0149](02_spec/0149_operator_auth_purge.md) ganhou matriz A0–A4 para preflight compatível, drenagem de todas as réplicas antigas, runner com alvo explícito, nova checagem após migration e limite de rollback. I25 rejeitou duas versões por falta de leitura autorizada da policy e risco de snapshot antigo; a revisão incluiu `operator_auth_policy_attest()`, comparação da tupla dentro da purge antes de `DELETE`, `READ COMMITTED`, `VOLATILE` e lock da tabela. Rechecagem I25 `ACCEPT_SPEC_REVIEW_READY`, somente para revisão humana. I26 reavaliou as rotas OIDC isoladas: `ACCEPT_LOCAL`, revogação por digest antigo conforme SPEC 0144 e P3 de cookie visível ao servidor Vite sintético no mesmo hostname.
- verification_state: revisão estática I25/I26; links, higiene e formatação documental em fechamento. Nenhuma migration `0002`, role/job de purge, banco real ou deploy foi executado. Testes do branch isolado continuam no SHA `85c2c7d`, sem alteração de código nesta rodada.
- blocking_state: DP-01 a DP-06 e revisão humana T3 antes de BUILD de purge; topologia HTTPS corporativa com cookie host-only e prova de navegador antes de produção; claim PR-L04 ativo impede integração do branch de autenticação no checkout compartilhado. Certificação e gates remotos do SHA integrado pendentes; `NO_GO`.
- next_action: obter revisão/decisões da SPEC 0149, depois implementar/testar o rollout e purge em branch isolado; integrar PR-301/302 após liberação PR-L04 e certificar o candidato inteiro. Prosseguir nos gates independentes.

# PR-301/402 — SPEC de purge OIDC pronta para revisão — 27/09/2026

- status: `SPEC_REVIEW_READY / DPO_POLICY_PENDING / FAMILY_CONTRACT_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: inspeção das migrations `0000_auth` e `0001_oidc_state` mostrou que expiração lógica não elimina states não consumidos nem sessões; o inventário ganhou DB-09. A [SPEC 0149](02_spec/0149_operator_auth_purge.md) define job/role separados, limite por lote, lock por família, política única com domínio validado, rollout compatível e prova de backup/PITR. I24 rejeitou a primeira proposta por domínio incompleto e possibilidade de família indefinida; após correção, `ACCEPT_SPEC_REVIEW_READY` somente para revisão humana, sem BUILD.
- verification_state: revisão estática independente I24, sem banco ou dados reais; links, higiene e formatação documental em validação final. Nenhuma migration, role de purge ou job foi executado.
- blocking_state: decisões DP-01 a DP-06 do controlador/DPO (prazos após expiração, política global ou por tenant, backups/PITR, finalidade e idade máxima da família) e revisão T3 explícita pendentes. O contrato de troca de família para um limite finito requer definição adicional; produção `NO_GO`.
- next_action: apresentar a SPEC 0149 e as decisões ao usuário/controlador/DPO; só iniciar BUILD de purge após revisão T3 e política aprovada. Prosseguir nos demais gates independentes.

# PR-301 — startup de produção sem DDL, validado no branch isolado — 27/09/2026

- status: `I23_ACCEPT_LOCAL / ROOT_INTEGRATION_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: commit isolado `85c2c7d` corrigiu a contradição da SPEC 0144: serving em produção rejeita `DATABASE_MIGRATION_URL` e auto-migration, verifica owner e grants por catálogo somente leitura, login direto como runtime e ausência de `CREATE` no banco e em schemas persistentes. I23 rechecou o diff e deu `ACCEPT_LOCAL`; `.env.example` não injeta DDL por padrão. O navegador usa porta web configurável quando 4173 pertence a outro agente.
- verification_state: Node 22.23.2, PostgreSQL 16 descartável: suíte 331 arquivos/2.437 testes sem skips, `test:postgres` 35/258, foco de startup e Phase 4A PASS; typecheck, lint, formato, links/higiene PASS. Chromium/Keycloak/API/web entre sites com OTP real PASS; roles/schemas sintéticos zerados, serviços e contêineres removidos. Manifesto com 18 hashes em `docs/04_audit/evidence/PR301-PROD-STARTUP-20260927/proof.json` **no branch isolado**.
- blocking_state: código ainda fora do checkout compartilhado por claim PR-L04; IdP corporativo, retenção/purga, rollout compatível, certificação/CI no mesmo SHA integrado e decisão humana de release pendentes. O teste de startup usa store de sessão sintético; prova de identidade durável é o E2E local separado.
- next_action: integrar `codex/pr301-oidc-client` após liberação PR-L04, revisar o candidato integrado e certificar o SHA; manter `NO_GO`.

# PR-301/302 — I22 rechecagem aceita e cleanup verificado — 27/09/2026

- status: `I22_ACCEPT_LOCAL_PROOF / ROOT_INTEGRATION_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: revisão independente I22 aceitou a prova local reforçada de callback entre sites, substituição de sessão e revogação após replay do cookie salvo. Commits isolados `8b0f92d` e `0b57416`; a frase imprecisa “família antiga” foi corrigida para “sessão antiga”. Uma tentativa posterior de E2E deixou quatro roles/dois schemas sintéticos após rejeição assíncrona não tratada; foram removidos manualmente. O verificador agora só emite `PASS` após confirmar zero roles/schemas e remoção do usuário sintético.
- verification_state: Node 22.23.2, Chromium, Keycloak `localhost`, API/web `127.0.0.1` e PostgreSQL 16 descartável: `TRUSTED_OIDC_BROWSER_E2E_PASS` final, OTP errado rejeitado, pending Lax recebido sem cookie Strict no callback, cookie antigo rejeitado após replace e cookie salvo rejeitado após logout. Prova/hashes em `docs/04_audit/evidence/PR301-302-TRUSTED-E2E-20260927/proof.json` **no branch isolado**; lint, tipo, links, formato e higiene PASS. Contêineres removidos.
- blocking_state: branch ainda fora do checkout compartilhado por PR-L04; rollout compatível com API confiável legada, IdP corporativo, retenção/purge, startup de produção sem DDL, certificação/CI no mesmo SHA e demais condições humanas de GO pendentes.
- next_action: integrar branch após liberação PR-L04, revisar o candidato integrado e certificar o mesmo SHA. Produção continua `NO_GO`.

# PR-301/302 — I22: prova E2E entre sites reforçada — 27/09/2026

- status: `CROSS_SITE_E2E_PASS_LOCAL / I22_RECHECK_PENDING / ROOT_INTEGRATION_PENDING`; produção `NO_GO`.
- last_completed_action: crítica independente I22 rejeitou duas inferências da prova `cb943e8`: 401 após limpar cookie no browser não comprovava revogação no servidor, e IdP/API no mesmo host não comprovavam callback entre sites. Commit isolado `8b0f92d` reforçou o verificador com replay do cookie salvo após logout e segundo login com IdP `localhost`, API `127.0.0.1`, cookie pendente Lax presente e cookie operacional Strict ausente no callback, nova sessão e replay da antiga 401.
- verification_state: `docs/04_audit/evidence/PR301-302-TRUSTED-E2E-20260927/proof.json` **no branch isolado** registra Node 22.23.2, Chromium/Keycloak OTP real, PostgreSQL sintético e execução entre sites PASS. Roles/schemas zerados, serviços e contêineres removidos. Logs anteriores são diagnósticos e não sustentam as inferências corrigidas; rechecagem independente I22 solicitada.
- blocking_state: revisão I22, integração após PR-L04, compatibilidade com API legada sem rota OIDC, IdP corporativo, retenção/purge, rollout, startup de produção sem DDL e certificação/CI do SHA integrado pendentes.
- next_action: receber rechecagem I22; integrar branch após liberação PR-L04 e recertificar. Produção segue `NO_GO`.

# PR-301/302 — E2E OIDC confiável local isolado — 27/09/2026

- status: `TRUSTED_BROWSER_E2E_PASS_LOCAL / ROOT_INTEGRATION_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: branch isolado `codex/pr301-oidc-client` commit `cb943e8` executou Chromium com console, API, Keycloak MFA real e PostgreSQL 16 de produto/autenticação com roles separadas. OTP errado não criou sessão; OTP válido completou callback, cookie HttpOnly/Strict, recarga sem headers de autoridade e logout com revogação. Prova repetida em Node 24 e no Node 22.23.2 fixado pelo repositório.
- verification_state: `docs/04_audit/evidence/PR301-302-TRUSTED-E2E-20260927/proof.json` **no branch isolado** contém 12 hashes e logs finais. `build:runtime`, build web, tipos, lint, links, formato e higiene PASS. Roles/schemas sintéticos zerados; operador, API/web e contêineres descartáveis removidos. Primeira tentativa revelou runtime não compilado para Vite; outra revelou observação incorreta de header de cookie pelo Playwright; ambas corrigidas na preparação/prova final.
- blocking_state: branch ainda fora do checkout compartilhado por claim PR-L04; revisão adversarial independente, IdP corporativo, retenção/purge, migração/rollout, startup de produção sem credencial DDL e certificação/CI remota no mesmo SHA continuam abertos.
- next_action: integrar após PR-L04, revisar adversarialmente o candidato integrado e recertificar; sem liberar produção irrestrita.

# PR-302-WEB-OIDC — console confiável local isolado — 27/09/2026

- status: `BUILD_VERIFIED_LOCAL / REVIEW_AND_E2E_PENDING / ROOT_INTEGRATION_PENDING`; produção `NO_GO`.
- last_completed_action: branch `codex/pr301-oidc-client`, commits `531ef2a` e `1c1ae32`, liga o console web a `POST /v1/auth/oidc/start` e restaura a identidade por `GET /v1/session` apenas com cookie. Diferencia 401 inicial de 503, preserva sessão local em falha de logout, bloqueia ações enquanto a recarga está indisponível e recupera retry do início OIDC após 503.
- verification_state: prova e hashes em `docs/04_audit/evidence/PR302-OIDC-WEB-20260927/proof.json` **no branch isolado**: suíte web 26 arquivos/96 testes, typecheck, lint, build web, links e higiene PASS. Uma primeira leitura concorrente de logs vazios falhou em higiene; repetição serial final PASS.
- blocking_state: revisão adversarial independente e E2E confiável com API/PostgreSQL/Keycloak na mesma execução pendentes. PR-L04 mantém web/API no checkout compartilhado; IdP corporativo, retenção/purge, rollout, preflight de produção e certificação remota no SHA integrado seguem abertos.
- next_action: executar E2E sintético, integrar após liberação da PR-L04 e recertificar; manter `NO_GO`.

# PR-301-OIDC-ROUTES — composição HTTP local isolada — 27/09/2026

- status: `ACCEPT_LOCAL / ROOT_INTEGRATION_PENDING`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: no branch isolado `codex/pr301-oidc-client`, commit `b41cff2`, compus IdP OIDC local, state e sessão PostgreSQL, início/callback HTTP, recarga por cookie e logout com revogação. I19/I20 aceitaram a fatia local após vínculo cifrado da sessão antiga ao state e rejeição de cookie de logout duplicado/malformado.
- verification_state: prova e 28 hashes em `docs/04_audit/evidence/PR301-OIDC-ROUTES-20260927/proof.json` **no branch isolado**. Node 22: suíte com PostgreSQL 330 arquivos/2.428 testes, `test:postgres` 35/258, Keycloak/Chromium senha+OTP e replay rejeitado, tipos/lint/formato/links/audit PASS. Banco e Keycloak descartáveis removidos.
- blocking_state: PR-L04 ainda detém `apps/api/src/server.ts` e web no checkout principal; a fatia não integra `main`. PR-302 web, IdP corporativo, retenção/purge, rollout, preflight de produção sem DDL e certificação/CI remoto no mesmo SHA seguem abertos.
- next_action: integrar após liberação do claim PR-L04, ligar o console web, provar E2E confiável e recertificar candidato integrado. Sem liberação irrestrita.

# PR-301-OIDC-CLIENT — cliente OIDC local em branch isolado — 27/09/2026

- status: `OIDC_CLIENT_ACCEPTED_LOCAL / ROOT_INTEGRATION_PENDING`; produção `NO_GO`.
- last_completed_action: implementei e commitei no branch `codex/pr301-oidc-client` o cliente OIDC local `30d3ca4`, com discovery restrito a loopback, Authorization Code + PKCE, verificação de assinatura/JWKS e nonce, mapeamento MFA/tenant, e prova em navegador Keycloak com usuário sintético removido. I18 `ACCEPT_LOCAL`.
- verification_state: prova em `docs/04_audit/evidence/PR301-OIDC-CLIENT-20260927/proof.json` **no branch isolado**: Node 22, 41/41 focados, suíte sem banco 306 arquivos/2.240 testes PASS com 20 arquivos/162 testes skipped, typecheck/lint/audit 0 vulnerabilidades, links/higiene e hashes PASS. O primeiro ciclo encontrou allowlist ausente para `openid-client`, corrigida e revalidada.
- blocking_state: PR-L04 mantém `apps/api/package.json`, `package-lock.json`, `docs/03_build/0305_repository_target_structure.json`, `server.ts` e web no checkout compartilhado. Código/evidência ainda não integram o branch principal; faltam rotas, composição PostgreSQL, recarga web, purge, E2E confiável e certificação no SHA integrado. IdP corporativo e decisões de produção pendentes.
- next_action: após liberação da PR-L04, integrar o commit isolado com lockfile/allowlist reconciliados, compor API/web e executar gates integrados; manter `NO_GO`.

# PR-301-OIDC-STATE-PG — persistência compartilhada do state — 27/09/2026

- status: `OIDC_STATE_STORE_ACCEPTED_LOCAL / API_OIDC_INTEGRATION_PENDING`; produção `NO_GO`.
- last_completed_action: implementei migration incremental `0001` de state OIDC, duas funções `SECURITY DEFINER` de reserva e consumo atômico, adapter PostgreSQL com pool limitado e preflight fechado de tabelas, colunas, ACL/RLS, constraints, índices e corpos das seis funções. O callback diferencia indisponibilidade do store de state inválido e tolera até 30 segundos de diferença positiva de relógio.
- verification_state: [prova](04_audit/evidence/PR301-OIDC-STATE-PG-20260927/proof.json): Node 22, PostgreSQL 16 focado 26/26, suíte geral com banco 325 arquivos/2.391 testes PASS sem skips, `test:postgres` 35/258 PASS, typecheck/lint PASS. I16 `ACCEPT_LOCAL_DESIGN` e I17 `ACCEPT_LOCAL` após correções; banco descartável removido.
- blocking_state: faltam composição de serving e rotas/web sob claim PR-L04, cliente OIDC com discovery/JWKS/token, E2E confiável, purge/retensão aprovada, migração de ambiente com compatibilidade/rollback e certificação do candidato. Sem produção.
- next_action: quando PR-L04 liberar caminhos, integrar store, IdP local e sessão confiável, testar HTTP/navegador e reemitir certificação; em paralelo fechar cliente OIDC e purge em claims próprios.

# PR-301-OIDC-TRANSACTION — transação PKCE isolada — 27/09/2026

- status: `OIDC_TRANSACTION_ACCEPTED_LOCAL / DISTRIBUTED_STORE_AND_API_INTEGRATION_PENDING`; produção `NO_GO`.
- last_completed_action: implementei `state`, `nonce` e PKCE S256 ligados a cookie de callback AES-256-GCM de cinco minutos, `SameSite=Lax` e `response_mode=query`; callback consome digest do state pelo contrato `OidcLoginStateStore`. Corrigi replay e URI de callback apontados por I15; crítica final `ACCEPT_LOCAL`.
- verification_state: [prova](04_audit/evidence/PR301-OIDC-TRANSACTION-20260927/proof.json): Node 22, focados 6/6, suíte geral 305 arquivos/2.226 testes PASS (20/154 skipped sem banco), PostgreSQL 16 descartável 35/258 PASS, typecheck/lint PASS. Banco removido.
- blocking_state: falta implementação durável do store de state, discovery e token exchange, validação assinada do ID token/nonce, composição da API e web, E2E confiável e certificação integrada. PR-L04 ainda possui caminhos de rotas/web; produção `NO_GO`.
- next_action: após liberação dos claims PR-L04, implementar adapter compartilhado de state e ligar cliente OIDC, store de sessão e web ao Keycloak local; testar callback real e reemitir certificado no mesmo SHA.

# PR-003-INTERIM — certificação isolada do SHA corrente — 27/09/2026

- status: `INTERIM_CERTIFICATION_NO_GO / PR-L04_CLAIM_PENDING`; produção `NO_GO`.
- last_completed_action: executei `npm run certify` em worktree detached limpo no commit `c634fcd`, com Node 22, PostgreSQL 16 descartável e portas próprias. Os 16 comandos saíram com 0; a adjudicação ficou 15 PASS/1 FAIL por um skip unitário Phase 4A e pelo vínculo obsoleto de `SKIP-PG-014`. O certificado declarou `NO_GO`.
- verification_state: [prova e bundle](04_audit/evidence/PR003-INTERIM-20260927/proof.json), candidato `2025654942d24e306c849e79d858afad52e8f8438e7aa2dfb188dd6945267a1c`; manifesto 38/38 hashes, E2E em simulação 12/12, PostgreSQL 35/258 PASS. O teste Phase 4A passou isolado com `PHASE4A_DISPOSABLE_PG=1`; suíte unitária completa repetida com banco 324 arquivos/2.374 testes, zero skips, sem reemitir certificado. `certification:verify` preservou 38 hashes e recusou unit/skip; I14 `ACCEPT_FACTS` do arquivo completo após corrigir uma alteração posterior do inventário no worktree temporário.
- blocking_state: `scripts/skip-catalog.json` permanece no claim PR-L04 e guarda hash `207335…` contra `a27d2f…` do teste atual. O E2E usa simulação; OIDC confiável, store composto, CI remoto no mesmo SHA, IdP corporativo e as 13 condições de GO continuam abertos.
- next_action: após liberação da PR-L04, reconciliar `SKIP-PG-014` conforme SPEC 0143, compor API/web confiáveis e reemitir certificação do SHA integrado com `PHASE4A_DISPOSABLE_PG=1`; manter `NO_GO`.

# PR-301-PG-INDEX — inventário de índices no preflight — 27/09/2026

- status: `PG_INDEX_BOUNDARY_ACCEPTED_LOCAL / INTEGRATION_PENDING`; produção `NO_GO`.
- last_completed_action: o preflight da role de sessão passou a verificar os cinco índices canônicos do schema de autenticação, incluindo validade, chave, owner, método, ausência de expressão/predicado e inventário exato. Negativos em banco descartável rejeitaram índice ausente, chave trocada, parcial e índice extra.
- verification_state: [prova](04_audit/evidence/PR301-PG-INDEX-20260927/proof.json); Node 22: PostgreSQL 16 focado 9/9, suíte geral 304 arquivos/2.220 testes PASS (20/154 skipped sem banco) e PostgreSQL completo 35 arquivos/258 testes PASS; typecheck/lint/formato PASS. Crítica I13 `ACCEPT_LOCAL`; banco descartável removido.
- blocking_state: composição do store no servidor, cliente OIDC/JWKS/callback, web confiável, E2E e certificação integrada aguardam caminhos PR-L04 e demais gates; sem produção.
- next_action: integrar API/web após liberação dos claims, revalidar entrypoint publicado e certificar o mesmo SHA; manter `NO_GO`.

# PR-301-OIDC-MAP — vínculo de identidade — 27/09/2026

- status: `OIDC_MAPPING_ACCEPTED_LOCAL / API_INTEGRATION_PENDING`; produção `NO_GO`.
- last_completed_action: implementei o mapeamento estrito de ID token OIDC previamente verificado para identidade de operador, com MFA `pwd`+`otp`, autenticação recente, um grupo de tenant/papel, subject ligado ao issuer e sessão limitada a 15 minutos/`exp`. O verificador local do Keycloak passou novamente com claims reais e removeu o usuário sintético.
- verification_state: [prova](04_audit/evidence/PR301-OIDC-MAP-20260927/proof.json); Node 22: 22 testes focados, suíte geral 304 arquivos/2.220 testes PASS (20/153 skipped sem banco), PostgreSQL descartável 35 arquivos/258 testes PASS; typecheck/lint/formato PASS. Crítica I12 `ACCEPT_LOCAL` e compatibilidade de audience unitária corrigida e aceita na rechecagem. IdP local/usuário de teste e banco descartável removidos.
- blocking_state: o mapeador pressupõe validação criptográfica anterior de assinatura/JWKS, nonce, issuer, audience e resposta do code exchange; callback, store composto e web ainda faltam, assim como IdP corporativo e certificação integrada.
- next_action: integrar cliente OIDC e rotas API/web após liberação dos caminhos PR-L04, executar E2E confiável e certificar o SHA integrado; manter `NO_GO`.

# PR-301-OIDC-LOCAL — IdP local com MFA — 27/09/2026

- status: `OIDC_LOCAL_ACCEPTED / API_INTEGRATION_PENDING`; produção `NO_GO`.
- last_completed_action: Keycloak 26.7.4 com digest OCI fixado, realm importado em loopback, fluxo próprio de senha e OTP obrigatórios, client Code + PKCE `S256`, direct grant desativado, mapper `amr` e grupo de tenant/papel sintético. Configuração em [deploy/local-oidc](../deploy/local-oidc/README.md).
- verification_state: container descartável saudável e discovery HTTP 200; [verificador](04_audit/evidence/PR301-OIDC-LOCAL-20260927/proof.json) em Chromium real PASS para PKCE ausente, redirect inválido, cadastro OTP, OTP incorreto, token com `amr: otp` após código válido e grupo sintético. I11 `ACCEPT_LOCAL`; assinatura/nonce não são validadas pelo verificador e permanecem gate da API. Container removido após a prova. Nenhum usuário/senha real no repositório.
- blocking_state: API ainda não implementa Authorization Code + PKCE, callback/validação JWKS/issuer/audience/MFA, mapeamento de grupos e store composto; web não tem fluxo confiável. Configuração usa HTTP e `start-dev` apenas em loopback; issuer corporativo de produção ainda pendente.
- next_action: integrar API/web e testar fluxo ponta a ponta sob SPEC 0144 após liberação dos caminhos PR-L04; manter `NO_GO`.

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

# PR-202 integrada; SPECs 0150/0152 liberadas para BUILD sintético — 28/09/2026

- status: `PR202_FIRST_SLICE_ROOT_LOCAL_PASS / T3_SYNTHETIC_BUILD_APPROVED`; programa `IN_PROGRESS`; produção `NO_GO`.
- last_completed_action: commit isolado `f787ad9` e root `69d08d3` extraíram o pedido de approval de `runTurn`, preservando referências capturadas de autoridade/telemetria. A [prova](04_audit/evidence/PR202-SLICE-20260928/proof.json) registra AST 3/3 e crítica I2 `ACCEPT` após P1 corrigido. O usuário aprovou BUILD sintético das [SPEC 0150](02_spec/0150_cross_origin_operator_console.md) e [0152](02_spec/0152_corporate_oidc_authority_contract.md).
- verification_state: Node 22, 13/275 focados, suíte 325/2.393, PostgreSQL 35/258, Chromium 12/12, cobertura 92,53%/87,66%/95,10%/93,56%, tipo/lint/formato e regressão root PASS; zero skips reportados. O verificador do catálogo falha por hash vencido em `SKIP-PG-014` sob PR-L04.
- blocking_state: PR‑202 ainda tem execução/replay e tamanho da classe abertos; PR-L04, catálogo, composição/certificação e CI do digest final, IAM real, dados/ops/pentest/piloto e demais condições de 0354. Produção `NO_GO`.
- next_action: implementar SPECs 0150/0152 em worktree com IdP HTTPS e dados sintéticos; conciliar catálogo após PR-L04 e certificar o candidato composto.
