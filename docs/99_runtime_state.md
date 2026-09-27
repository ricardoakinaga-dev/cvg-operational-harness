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
