# UP91-025 — recon para a SPEC0254 (OIDC/MFA, produtor de `case_principals` e store durável no entrypoint)

Task `UP91-025-OIDC-20261022`. Leitura só. Base `d9c84df9e` (head do PR #14: SPEC0251 + vitest 4.1.12, sobre a `main` `24cdb463f`). Âncoras de linha desta base. Nenhum dado real, IdP real, PG, build ou teste executado nesta rodada.

## Resumo

- **O entrypoint não tem login OIDC.** A única forma de criar sessão é trocar um token HMAC (`x-cvg-operator-token`) por cookie em `GET /v1/session`. Não existem rotas `/v1/auth/oidc/*`, cliente OIDC nem `openid-client` no `main` (R1, R2, R7).
- **Os builds OIDC/HTTPS "isolados" das SPECs 0150/0152 não estão em nenhum ref.** Os commits `7019422` e `ed012a4` (28/09) e o ramo local `30d3ca4`…`0b4a95b` (27/09) só existem como objetos soltos; base 23–25 dias atrás, centenas de commits atrás do HEAD (R3).
- **O que está no `main` são peças avulsas, sem chamador fora dos testes:** transação de login com state/PKCE/nonce e cookie pendente selado, store PG de state, mapeador de claims com MFA `pwd`+`otp` e grupo em caminho `/tenant_…/Role` (R4, R5).
- **Store PG de sessão existe e já é composto, mas só em `NODE_ENV=production`** (`production-bootstrap.ts:50`). Em `test`/`development` com PG não há store de sessão (R6).
- **`casePrincipalAuthority` é só um marcador de versão** (`server.ts:354`). Nenhum chamador de produção o injeta; sem ele, toda leitura de caso em trusted dá 503 (R8, R9).
- **O produtor `applyVerifiedPrincipalState` existe e é CAS + audit**, memória e PG; hoje só é chamado por fixtures e testes (R10).
- **Sem CSRF por `Origin` exato:** `Origin` ausente passa; CORS sem `Access-Control-Allow-Credentials` (R12).
- **Nenhuma migração nova é necessária** para o recorte proposto: `case_principals` (0029), sessões e state OIDC (`operator-session/0000`, `0001`) e grants já existem (R11).
- **Decisões vigentes:** D-09 (OIDC com MFA antes do uso pela equipe), C8 (token interno assinado só para o ensaio da fase C) e a decisão de 21/10 (UP91-025 com IdP sintético local HTTPS/MFA, sem conta real) (R15).

## Achados

### R1 — Entrypoint e composição

1. `apps/api/src/main.ts:40-47` cria o resolver HMAC por `CVG_OPERATOR_IDENTITY_KEYRING` e recusa produção sem ele. `:51-56` chama `buildApiWithProductionSessions(process.env, { operatorIdentityResolver, telemetry })`; não passa `casePrincipalAuthority`.
2. `apps/api/src/production-bootstrap.ts:47-50`: `createProductionOperatorSessionBootstrap` retorna `undefined` fora de `NODE_ENV=production`. `:57-59` exige `CVG_OPERATOR_SESSION_DATABASE_URL`, `CVG_OPERATOR_AUTH_SCHEMA`, `CVG_OPERATOR_SESSION_ROLE`; `:61-77` exige schema privado e papel dedicado; `:148-158` roda o preflight `assertPostgresOperatorSessionBoundary` e recusa `rolreplication`; `:133-146` sonda de readiness pela função `operator_session_get`.
3. `production-bootstrap.ts:175-229`: injeta o store em `buildServerFromEnv` e um hook `onRequest` que devolve 503 em toda rota de operador quando o store cai (`requiresOperatorSessionBoundary`, `operator-session-route-boundary.ts:11-26`; isentos só probes e `POST` do webhook).
4. `apps/api/src/server.ts:5250-5585` (`buildServerFromEnv`): no ramo memória só cria store de sessão em memória quando `NODE_ENV=test` e trusted (`:5330-5336`); no ramo PG nunca cria store (vem de fora); `:5400-5408` recusa produção sem resolver injetado; `:5553-5585` repassa `...effectiveBuildOptions` (logo repassaria `casePrincipalAuthority` se alguém injetasse) e não define nada de autoridade de principal.
5. `server.ts:5429-5432` e `:5528-5531`: fora de produção, com RLS, o pool de migração é `DATABASE_MIGRATION_URL` ou o próprio pool de serving, e papéis iguais fazem o boot falhar ("runtime and migration roles must be distinct"). Um teste de entrypoint com PG em `NODE_ENV=test` precisa dessa URL.

### R2 — Sessão de operador hoje

1. `server.ts:844-966` (`GET /v1/session`): 503 se não trusted ou sem store (`:849-858`); com cookie válido e sem token, restaura (`:874-880`); com token HMAC, cria, roda (`replace`, `:912-913`) ou troca identidade (`switchIdentity`, `:929`) e só então emite `Set-Cookie` (`:947-950`).
2. `server.ts:969-993` (`POST /v1/session/logout`): revoga a família e só depois limpa o cookie; falha mantém o cookie (503).
3. `server.ts:534-542` instala o hook de sessão só com trusted + store. `apps/api/src/operator-session-hook.ts:44-88`: cookie inválido ou expirado dá 401 e limpa o cookie em toda rota, exceto probes, `/v1/session` e `/v1/session/logout` (`:56`, `:73`); falha do store dá 503.
4. `apps/api/src/operator-session.ts:4`: cookie `cvg_operator_session`; `:113-127`: `HttpOnly; SameSite=Strict; Path=/`, `Secure` só com HTTPS. Não há nomes `__Host-` no `main`.
5. `apps/api/src/operator-session-postgres.ts:12` limita a sessão a 15 min; `:143-186` `switchIdentity` revoga a linhagem e cria a nova na mesma transação; `:188-194` revoga a família. SQL: `packages/persistence/migrations/operator-session/0000_auth.sql:9-25` (CHECK `expires_at <= created_at + 15 min`, `:20`), funções `SECURITY DEFINER` a partir de `:41`.
6. `server.ts:4536-4565`: com cookie, a identidade vem da sessão; sem cookie, do resolver HMAC. `:4498-4512`: trusted sem resolver lança 401.

### R3 — Builds isolados OIDC/HTTPS (SPEC0150/0152) fora de qualquer ref

1. `git for-each-ref --contains` vazio para `7019422`, `ed012a4`, `643f6ad`, `30d3ca4`, `b41cff2`. `git merge-base 643f6ad HEAD` = `ed70b0a1c` (27/09). Nenhum é ancestral do HEAD.
2. `7019422` (28/09) criou `oidc-client-corporate.ts`, `corporate-oidc-composition.ts`, `oidc-identity-corporate.ts`, alterou `server.ts` (+149), `http-security.ts`, `apps/web/src/api/client.ts`, `deploy/nginx.web.conf`. `ed012a4` adicionou `tldts` e corrigiu site HTTPS/`__Host-`/DNS. Usava `openid-client` 6.8.8 com `customFetch` e transporte HTTPS próprio com pinagem de DNS (`git show ed012a4:apps/api/src/oidc-client-corporate.ts:4,119-128,195`).
3. Ramo local `30d3ca4`…`0b4a95b` (27/09): `oidc-client-local.ts`, `oidc-routes-local.ts`, `local-oidc-composition.ts`, Keycloak 26.7.4 HTTP com TOTP. As rotas isoladas (`git show ed012a4:apps/api/src/oidc-routes-local.ts`) já tinham o desenho revisado: `POST /v1/auth/oidc/start` com `Origin` exato e limite por IP 10/min; callback com limite 30/min, alvo ≤ 4096, 401 genérico, 303 para o console, pendente limpo, 503 sem cookie quando o store falha.
4. Provas: [PR301-CORP-T3](../PR301-CORP-T3-20260928/proof.json) (`ISOLATED_SYNTHETIC_BUILD_PASS / ROOT_INTEGRATION_PENDING`), [PR301-CORP-I1](../PR301-CORP-I1-20260928/proof.json) (`CRITICAL_COVERAGE_FAIL`, RLS 83,76% < 95%), [PR302-HTTPS-BROWSER](../PR302-HTTPS-BROWSER-20260928/proof.json) (transporte com sessão e IdP sintéticos), [PR301-LOCAL-ENTRYPOINT](../PR301-LOCAL-ENTRYPOINT-20260928/proof.json) (Keycloak HTTP, `start-dev`).
5. [AUD0599 condição 4](../AUD0599-FABLE-20261006/opus-condition-4.md) (`:28-31`, `:47`) já concluiu que integrar esses ramos é o caminho errado (centenas de commits atrás, conflitos em `env.ts`, worker, lockfile). `docs/04_audit/0591_repository_audit_2026-09-30.md:326` registra que essas provas não se atribuem ao root.
6. Aprovações: SPEC0150 e SPEC0152 aprovadas pelo usuário para BUILD T3 sintético em 28/09 (`0150:5`, `0152:4`; `docs/03_build/0356_production_backlog_2026-09-26.md:590,630`). Aprovação só em texto, sem hash. Hashes atuais: 0150 `6d145311…2473`, 0152 `3dc167f2…55e6`, sem mudança desde `36c9166c4` (28/09). SPEC0144 aprovada em 27/09 (`0144:4`), hash `8cf42afa…5c89`. SPEC0151 aprovada em 27/09 (`0151:4`), BUILD também fora de ref (`fe1747d1a`).

### R4 — Peças OIDC no `main`, sem chamador fora dos testes

1. `apps/api/src/oidc-login-transaction.ts:59-113` (`startOidcLogin`): state, nonce e verifier de 32 bytes; S256; `scope=openid` (`:78`); `response_mode=query` (`:77`); `max_age=300` (`:85`); cookie `cvg_oidc_pending` (`:9`) AES-256-GCM com AAD ligado a issuer/client/redirect (`:233-238`); reserva o state antes de devolver (`:99-108`).
2. `oidc-login-transaction.ts:116-177` (`readOidcLoginCallback`): valida cookie, idade 5 min, skew 30 s, `timingSafeEqual` do state e **consome o state antes da troca do code** (`:169-175`).
3. `oidc-login-transaction.ts:186-212`: exige `authorization_endpoint` na mesma origem do issuer (`:204`) e redirect terminando em `/callback`. `:214-231`: aceita `http` só em `127.0.0.1`/`localhost` (`:221-223`).
4. `apps/api/src/oidc-identity.ts:28-103` (`mapVerifiedOidcClaims`): exige `amr` com `pwd` e `otp` (`:67-74`), `auth_time` ≤ 5 min, grupo único em caminho `/tenant_<uuid>/<Role>` (`:7-8`, `:81-90`), `operatorId = oidc_<sha256(iss,sub)>` (`:91-93`, 69 caracteres), expiração `min(exp, agora + 15 min)` (`:100-101`). A SPEC0152 §5 (`0152:19`) proíbe reaproveitar essa hipótese local sem contrato e esse mapeador de grupo por caminho.
5. `apps/api/src/oidc-state-postgres.ts:10-68`: `reserve`/`consume` por funções do schema de auth; exige pool limitado (`:17-26`).
6. Chamadores: só `__tests__/oidc-login-transaction.test.ts`, `oidc-identity.test.ts` e `operator-session-postgres.test.ts:486-630`.

### R5 — Dependência OIDC

1. `apps/api/package.json:7-21` não tem `openid-client`, `jose` nem `oauth4webapi`; `package-lock.json` também não.
2. A SPEC0152 §4 (`0152:18`) exige "biblioteca OIDC mantida" para verificar o ID token. Adicionar a biblioteca muda o lockfile (claim próprio pela coordenação).

### R6 — Store durável fora de produção

1. Em `NODE_ENV=test`/`development` com `API_PERSISTENCE_MODE=postgres`, nada compõe `PostgresOperatorSessionStore` nem `PostgresOidcLoginStateStore` (R1.2, R1.4). Logo o entrypoint só tem store PG em produção, e produção só aceita HMAC.
2. O preflight do schema de auth já cobre as funções de state OIDC (`apps/api/src/operator-session-preflight.ts:6-11,84-91`) e a tabela `oidc_login_states` (`:284`).

### R7 — Web

1. `apps/web/src/api/client.ts:850-865`: `getSession` só envia o token HMAC; `:727-730` usa caminho relativo com proxy Vite. Não há botão de login OIDC, origem de API fixa nem cookie `__Host-`.
2. `playwright.rem21-014.config.ts:44-55`: E2E trusted sobe a API com HMAC, memória e `NODE_ENV=test`, sem autoridade de principal.

### R8 — `casePrincipalAuthority` e a política de principal

1. `server.ts:349-354`: opção `casePrincipalAuthority?: { authorityVersion: string }`, descrita como "SPEC0152 adapter".
2. `server.ts:766-771`: `principalPolicy = { identityMode, authorityVersion: options.casePrincipalAuthority?.authorityVersion ?? null }`.
3. `apps/api/src/case-authorization/case-routes.ts:103-150` (`resolveCaseReadScope`): trusted sem versão → 503 `configuration_error` (`:110-115`); principal ausente, inativo, com role diferente da sessão, com versão diferente ou com origem diferente de `verified_adapter` fora de `NODE_ENV=test` → 401 (`:116-130`); Supervisor/Admin → escopo do tenant; Operator/Approver sem tabelas 0029 → 503 (`:143-148`).
4. Hoje nada impede um chamador fora de teste de injetar `casePrincipalAuthority` sem produtor: é só um texto de versão.

### R9 — Onde o 503 aparece (falha fechada)

1. Leitores de caso, registro `/v1/cases*` e as oito rotas de tasks/approvals da SPEC0251 chamam `resolveCaseReadScope` (`case-routes.ts:374,422,453,497,560,605` e o helper `authorizeCaseMutation`).
2. Testes que fixam o 503: `apps/api/src/__tests__/case-read-authorization-f01.test.ts:92-125`, `case-assignment-authorization.test.ts:327-370`. Os testes do caminho configurado injetam `casePrincipalAuthority` em `NODE_ENV=test` com principal `synthetic_fixture` (`case-authorization-fixtures.ts:12,23-44`).

### R10 — Produtor verificado (porta)

1. `packages/persistence/src/case-authority.ts:107-128`: `VerifiedPrincipalStateInput` e `PrincipalProvisioningPort.applyVerifiedPrincipalState` ("único escritor de principais, porta interna do adaptador verificado SPEC0152, nunca endpoint").
2. `case-authority.ts:332,350-374`: valida `operatorId` (`[A-Za-z0-9._:-]{3,80}`), role, `expectedRevision ≥ 0`, `authorityVersion` (`[A-Za-z0-9._:-]{1,120}`), `proofRef` 8–512 e `identitySource`.
3. PG `packages/persistence/src/case-authority-postgres.ts:702-780`: `SELECT … FOR UPDATE`, CAS por revisão (`principal_conflict`), `INSERT` na revisão 0 ou `UPDATE` com `revision + 1`, audit `policy_decision` do ator `System`/`case-principal-provisioning` na mesma transação. Memória `case-authority.ts:559-603`.
4. O snapshot já lê o principal (`case-authority.ts:237`), suficiente para o produtor decidir a revisão esperada.
5. SPEC0176 `:52`: primeiro cadastro (revisão 0) só após login OIDC fresco com MFA e mapping vigente; "login/cookie posterior nunca atualiza registro existente por si só"; atualização/revogação vem de evento/configuração autenticada e versionada; CAS perdido é conflito. `:50`: ausência de principal → 401; falta de autoridade → 503.

### R11 — Banco e migrações

1. `packages/persistence/migrations/0029_case_assignment_authorization.sql:20-44`: `case_principals` com CHECK de tenant, operator, role, origem (`verified_adapter`/`synthetic_fixture`), versão e digest de prova; `:278-296` revisão monotônica, sem DELETE/TRUNCATE; `:301-316` RLS forçado por `cvg.tenant_id`.
2. `packages/persistence/src/tenant-schema.ts:78` inclui `case_principals` como `tenant-only`; `scripts/migrate-job.mjs:71-75` dá `SELECT, INSERT, UPDATE` ao papel runtime. O papel de serving já pode gravar principais.
3. `operator-session/0001_oidc_state.sql`: `oidc_login_states` com expiração ≤ 5 min e funções `oidc_state_reserve/consume`; `packages/persistence/src/operator-session-migrations.ts:202-235` dá `EXECUTE` ao papel de sessão.
4. Conclusão: o recorte API (login, produtor, store, CSRF) **não precisa de migração**. Diretório de principais com nome legível ou purga (SPEC0149, `PROPOSED_FOR_SPEC_REVIEW`) precisariam.

### R12 — CORS e CSRF

1. `apps/api/src/http-security.ts:248-268`: `Origin` inválido → 403; `Origin` fora da allowlist → 403; **`Origin` ausente passa** (`:263`).
2. `http-security.ts:339-351`: CORS sem `Access-Control-Allow-Credentials`. Produção exige `API_ALLOWED_ORIGINS` e HTTPS (`:183-203`).
3. Não há guarda de mutação por cookie com `Origin` exato (SPEC0150 item 4, `0150:78-90`). A defesa atual é só `SameSite=Strict`.

### R13 — Testes existentes e lacunas para o "Pronto/prova" do cartão

1. PG, HMAC, produção simulada por `vi.stubEnv`: `production-bootstrap-postgres-own.test.ts:189-1032` (cria papéis e schemas próprios `:59-150`; reinício, revogação, expiração, rotação de família, falha do store, preflight). Bom modelo de harness PG.
2. Entrypoint real em processo filho: `identity-composition-wiring.test.ts:407-429` (`tsx apps/api/src/main.ts`).
3. State OIDC PG: `operator-session-postgres.test.ts:486-630`. Transação e mapeador: `oidc-login-transaction.test.ts` (8), `oidc-identity.test.ts` (3).
4. Faltam: qualquer teste de login OIDC pelo entrypoint; IdP sintético HTTPS com MFA; produtor de principal ligado ao login; 503 → 200 com autoridade configurada fora de injeção manual; CSRF por `Origin`; recusa de configuração OIDC parcial; store ausente no modo OIDC; hosts distintos console/API (depende da SPEC0150).
5. `scripts/build-runtime.mjs:148-149` exclui `src/**/*.test.ts` e `src/**/__tests__/**` do build de runtime: suporte de teste em `__tests__/support/` não entra na imagem.
6. `openssl` 3.0.13 disponível localmente; o runner `ubuntu-24.04` do CI também traz `openssl`. Node 22 não gera X.509 sem biblioteca.

### R14 — IdP local existente

1. `deploy/local-oidc/README.md:3-5`: Keycloak local em HTTP (`start-dev`), TOTP obrigatório, só desenvolvimento/homologação; exige Docker e não roda no CI. O `README` ainda diz que a API não contém as rotas OIDC.

### R15 — Decisões do usuário vigentes

1. [Decisões de 21/10](../UP91-018-CASE-SCOPE-20261021/user-decisions-20261021.json): UP91-025 depois do escopo por caso, "com IdP sintético local (HTTPS/MFA), sem conta real; a escolha do IdP do hospital fica para quando o servidor existir; mesma regra de gate". Não concedido: deploy, produção, dado real, IdP ou conta real.
2. [Decisões de 16/10](../USER-DECISIONS-20261016/production-0374.json) C8: "Token interno assinado só para o ensaio da fase C"; D-09 vale (IdP corporativo OIDC com MFA antes do uso pela equipe; provedor não escolhido).
3. Regra de gate da SPEC0251 (`0251:3`): BUILD só após APPROVE do crítico independente sem obrigatórios; premissa nova ou migração param e voltam ao usuário.

## Consequências para a SPEC0254

- O produtor de principal depende de um login verificado que não existe no `main`. Ligar só `casePrincipalAuthority` sem login OIDC criaria uma versão sem produtor. Logo a fatia mínima inclui cliente OIDC, rotas e produtor.
- O store PG já existe; o que falta é compô-lo também quando o login OIDC está configurado (fora de produção, para o IdP sintético), com o store PG de state.
- Hosts distintos de console/API (SPEC0150 itens 1–3, 5–6) mudam web, NGINX e cookies `__Host-`: fatia própria.
- Produção corporativa (SPEC0152 §1–§3, §6: allowlist de discovery, DNS público, cofre, pacote IAM) depende do IdP do hospital: fatia própria.
- Reaproveitar o desenho revisado dos ramos isolados (rotas, `customFetch`, limites), não os commits.
