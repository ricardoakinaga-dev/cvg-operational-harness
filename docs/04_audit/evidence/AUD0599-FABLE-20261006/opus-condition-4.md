Fonte histórica: handback Opus, sessão Fable 77c1655f-0f79-4804-b98e-fadd3ba2bf11, SHA 34387c1. Não é validação do checkout atual.

## Condição 4 (ENG-014): sessão de operador. HEAD `34387c1`, levantamento somente leitura

### Fatos verificados

**1. O que existe no HEAD (commitado)**
- **Store em memória:** `apps/api/src/operator-session.ts:35` (`createInMemoryOperatorSessionStore`), com os helpers de cookie em :83/:104/:120.
- **Store PostgreSQL:** `apps/api/src/operator-session-postgres.ts:59` (`PostgresOperatorSessionStore`, que chama funções `operator_session_*`) e `:151` (pool).
- **Preflight do papel e do schema de sessão:** `apps/api/src/operator-session-preflight.ts:171`.
- **Migrations:** já existem `packages/persistence/migrations/operator-session/0000_auth.sql` e `0001_oidc_state.sql`, com o runner em `packages/persistence/src/operator-session-migrations.ts:95`. O runner não é exportado pelo `index.ts` do pacote.
- **OIDC:** há só peças avulsas, `oidc-identity.ts:28` (que exige `amr` pwd+otp), `oidc-login-transaction.ts:59` e `oidc-state-postgres.ts:10`. Não existe cliente OIDC nem rotas `/v1/auth/oidc/*`, e `openid-client` não é dependência. Fora dos testes, ninguém importa essas peças nem o store PostgreSQL.
- **Rotas que já existem:**
  - `GET /v1/session` (`server.ts:744`) troca um token HMAC `x-cvg-operator-token` (`operator-identity.ts:12`, chaveiro `CVG_OPERATOR_IDENTITY_KEYRING`) por um cookie `cvg_operator_session`.
  - `POST /v1/session/logout` (`server.ts:864`).
  - O hook é instalado em `server.ts:493` (código em `operator-session-hook.ts`).
- **Composição:**
  - `main.ts:12-23` passa apenas o resolver e a telemetria.
  - Em `buildServerFromEnv`, o caminho de memória injeta o store em memória apenas quando `NODE_ENV=test` (`server.ts:5196-5202`). O caminho PostgreSQL (`server.ts:5401-5433`) nunca injeta store.
  - `production-bootstrap.ts` não existe no HEAD.
- **Onde nasce o 503:** `server.ts:4474-4480`. `createSessionAwareOperatorIdentityResolver`, com `requireSessionStore=true` (trusted) e sem store, lança `configuration_error` "Operator session store is required for trusted requests", que é mapeado para 503.
- **Não commitado em `apps/api`:**
  - `M operator-session-hook.ts`: ignora cookie nas rotas `/health`, `/live`, `/ready` e `/health/metrics`.
  - `?? __tests__/operator-session-public-routes.test.ts`.
  - `?? __tests__/execution-input-trajectory-api.test.ts`.

**2. Trabalho do Codex fora do HEAD**
- **Branches PR-301:** nenhum dos 6 commits citados (30d3ca4, b41cff2, 85c2c7d, 7019422, ed012a4, 7ef74e7) é ancestral do HEAD, e `git cherry` confirma que nenhum foi reaplicado.
  - `codex/pr301-oidc-client`: base em 89a1b8a, 8 commits à frente e 338 atrás. Traz cliente OIDC local com `openid-client@6.8.8`, `oidc-routes-local.ts`, `local-oidc-composition.ts` e +312 linhas em `server.ts`. Num `git merge-tree` simulado, os únicos conflitos de texto são `apps/api/package.json` (versão do fastify) e `package-lock.json`.
  - Bloqueios desse branch: `composeLocalOidcAuthFromEnv` recusa `NODE_ENV=production` ("Local OIDC is forbidden outside controlled environments"). Além disso, 85c2c7d passa a rejeitar `DATABASE_MIGRATION_URL` em produção, o oposto do contrato atual (`server.ts:5314`) usado na validação da condição 3.
  - `codex/pr301-corporate-20260928`: 20 commits à frente e 277 atrás. Arrasta commits de perfil de boot, web e nginx, e conflita em `packages/shared/src/env.ts`, `apps/worker/src/worker.ts`, um teste do worker, `apps/api/package.json` e no lockfile. O OIDC corporativo dele exige MFA, que a barra 0373 dispensa.
- **Bootstrap aprovado (GREEN):** é a frente do Codex que de fato resolve o ENG-014. A emenda `docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/production-bootstrap-amendment.md` reproduz exatamente esse 503. Ela foi aprovada para BUILD local (`production-bootstrap-user-approval.json`, coordenação :571).
  - A implementação está só no cache privado `~/.cache/cvg-harness-green-20261004/` e não foi promovida ao repositório.
  - `hiso-neutral-final-r22/apps/api/src/production-bootstrap.ts` tem 231 linhas. Há uma versão R3 posterior em `bootstrap-r3-candidate/`, com 3 testes próprios.
  - O código só compõe o que já existe: `PostgresOperatorSessionStore` + preflight + probe de readiness, passados por `buildServerFromEnv({operatorSessionStore, readinessProbes})`. O resto vai em `main.ts` e em `operator-session-route-boundary.ts`. Não toca `server.ts`, SQL nem hooks.
  - Variáveis exigidas: `CVG_OPERATOR_SESSION_DATABASE_URL`, `CVG_OPERATOR_AUTH_SCHEMA` e `CVG_OPERATOR_SESSION_ROLE`.
  - Checkpoint-20: R3 do Builder com 182/182 PASS. A revisão independente R3 estava ativa e não encontrei o veredito.

**4. Claims e conflito de escrita**
- `agent_coordination.md:106-108`: o próprio Claude registrou ENG-014 (`main.ts` + `production-bootstrap.ts`) como "frente aprovada e ativa do Codex".
- `:593`: o claim `HARNESS_ISO_GREEN_20261004` está **ATIVO** e proíbe tocar `server.ts` e os caminhos PR-L04.
- `:943` e `:959`: registram que `server.ts` fica sob PR-L04.
- O próprio `agent_coordination.md` tem +615 linhas não commitadas.
- Hoje, entre os arquivos de sessão, só `operator-session-hook.ts` tem alteração não commitada do Codex. `main.ts` e `server.ts` estão limpos.

### Inferências
- Integrar as branches PR-301 é o caminho errado para a condição 4. São centenas de commits atrás do HEAD, o OIDC local é proibido em produção, o corporativo traz MFA e boot-profile, e há a regressão de `DATABASE_MIGRATION_URL`.
- O mínimo é a opção (b): o bootstrap GREEN, que já está escrito, revisado em R3 e aprovado.
  - **Arquivos a mudar:** `apps/api/src/main.ts` e os novos `production-bootstrap.ts`, `operator-session-route-boundary.ts` e 3 testes.
  - **Migration:** nenhuma nova. Basta rodar o `runOperatorSessionMigrations` existente num job separado e criar o papel dedicado de sessão.
  - **Variáveis de ambiente:** as três acima, mais `CVG_IDENTITY_MODE=trusted`, `CVG_OPERATOR_IDENTITY_KEYRING` e as da condição 3.
- **Teste de aceitação sem IdP** (é o login atual do HEAD):
  1. Pilha da condição 3 com o papel e o schema de auth.
  2. Gerar um token via `createTrustedOperatorIdentityToken`. Não achei script de emissão em `scripts/` nem em `deploy/`; um utilitário de teste resolve.
  3. `GET /v1/session` com o header → 200 + `Set-Cookie`.
  4. `GET /v1/admin/agents` com o cookie → 200.
  5. Sem cookie e sem token → 401.
  6. Cookie revogado ou expirado → 401.
  7. Reinício da API → a sessão continua válida.
- O Keycloak de `deploy/local-oidc` só serve se a condição 4 exigir login via navegador/OIDC, o que a barra não pede.

### Recomendação
Pedir ao Codex que promova ao repositório o bootstrap GREEN R3 (`main.ts` + `production-bootstrap.ts` + route-boundary + testes) depois do veredito da revisão R3, e depois executar o teste de aceitação acima na pilha de produção da condição 3. O claim GREEN está ativo sobre esses caminhos, então não devemos escrevê-los nós mesmos. Também não recomendo integrar as branches PR-301.
