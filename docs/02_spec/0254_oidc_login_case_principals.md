# SPEC0254 — Login OIDC com MFA no entrypoint, produtor verificado de `case_principals` e store durável (fatia A, IdP sintético)

**PROPOSTA T3 (identidade, sessão e autorização), revisão r2. BUILD condicionado ao APPROVE do crítico independente sem obrigatórios**, conforme a [decisão do usuário de 21/10/2026](../04_audit/evidence/UP91-018-CASE-SCOPE-20261021/user-decisions-20261021.json). Premissa nova ou migração param a execução e voltam ao usuário. Task `UP91-025-OIDC-20261022`, cartão [UP91-025](../03_build/0367_program_backlog_reaudit_2026-09-30.md#up91-025). Origem: dependência F01 da AUD0621 registrada no cartão: com a [SPEC0176](0176_case_assignment_read_authorization.md) e a [SPEC0251](0251_case_scope_tasks_approvals.md), toda composição trusted responde 503 nos leitores de caso, no registro e em tasks/approvals, porque nada produz `case_principals` a partir de um login verificado. Autoridade: [SPEC0144](0144_trusted_operator_session_production.md) (sessão durável), [SPEC0150](0150_cross_origin_operator_console.md) (CSRF por `Origin`), [SPEC0152](0152_corporate_oidc_authority_contract.md) (contrato OIDC/MFA), SPEC0176 (principal e política), SPEC0251. Constituição: [D-12/T3](../07_agents/AGENTS.md). Fatos e âncoras: [recon](../04_audit/evidence/UP91-025-OIDC-20261022/recon.md) (achados R1–R15).

Histórico:

- **r2** ([revisão r1](../04_audit/evidence/UP91-025-OIDC-20261022/spec-review-r1/review.md), [correções](../04_audit/evidence/UP91-025-OIDC-20261022/spec-review-r1/corrections.md), [decisões de 22/10](../04_audit/evidence/UP91-025-OIDC-20261022/user-decisions-20261022.json)):
  - M1: verificação de assinatura do ID token ligada por `enableNonRepudiationChecks`; texto do JWKS corrigido;
  - M2: provas que matam M13 e M19, com contagem de chamadas ao token endpoint;
  - M3: só a `authorizationUrl` do start fica fora da regra de redação;
  - M4: RLS obrigatório no modo OIDC; credencial de migração no serving só em teste (P6); ambiente de O9 e O10 declarado;
  - decisões P1–P4 do usuário e P5–P7 do lead aplicadas (versão de autoridade inteira e ordenada; o login só reduz acesso);
  - opcionais da revisão O1–O12 incorporados.

Base: `d9c84df9e` (head do PR #14, sobre a `main` `24cdb463f`). Âncoras desta base, tolerância de ±2 linhas. Nenhum dado real, IdP real, conta real, provider, canal, deploy ou produção.

## 0. O que esta rodada entrega

A UP91-025 é grande demais para uma rodada. Proposta em três fatias:

| Fatia             | Entrega                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Estado                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| **0254-A (esta)** | Login OIDC (Authorization Code + PKCE, state/nonce de uso único, ID token RS256 com assinatura verificada, MFA) pelas rotas `/v1/auth/oidc/start` e `/v1/auth/oidc/callback`; produtor verificado de `case_principals` no callback; `casePrincipalAuthority` composto por `buildServerFromEnv` só junto com o login OIDC; stores PG de sessão e state no entrypoint; CSRF por `Origin` exato; recusa de configuração inválida. IdP sintético local HTTPS com MFA, só em teste. | Esta SPEC                                                |
| 0254-B            | Console: botão de login, transporte cross-origin da SPEC0150 (origem de API fixa no bundle, CORS com credenciais, cookies `__Host-`, NGINX sem `/v1`, CSP), Chromium com console, API e IdP em hosts HTTPS distintos.                                                                                                                                                                                                                                                          | SPEC própria depois do BUILD da A                        |
| 0254-C            | Produção corporativa da SPEC0152 §1–§3 e §6: allowlist de discovery, DNS público, segredo pelo cofre, pacote IAM, positivo em staging.                                                                                                                                                                                                                                                                                                                                         | Depende da escolha do IdP do hospital (decisão de 21/10) |

Por que não "A = produtor + autoridade, B = store PG + sessão": o store PG de sessão já existe e já é composto em produção (R1, R6); o store PG de state existe, mas nada o compõe fora dos testes (R4.6, R6.1). O produtor não tem fonte verificada sem o login OIDC (R4, R10). Ligar a autoridade sem login criaria uma versão sem produtor. Por isso a A junta login, produtor, autoridade e a composição dos dois stores; a B fica com o navegador.

"Pronto/prova" do cartão e onde cada item fecha:

| Item do cartão                                          | Fatia | Prova   |
| ------------------------------------------------------- | ----- | ------- |
| IdP local HTTPS/MFA sintético autentica pelo entrypoint | A     | O10     |
| Hosts distintos (console e API)                         | B     | —       |
| Recarga só com cookie                                   | A     | O3, O10 |
| CSRF                                                    | A     | O8, O10 |
| Sessão revogada                                         | A     | O10     |
| Role/tenant                                             | A     | O9      |
| Store ausente, com PG                                   | A     | O1, O10 |
| Configuração inválida recusa                            | A     | O1, O10 |

Depois da 0254-A, o cartão UP91-025 continua aberto: hosts distintos de console/API ficam para a B, e produção para a C.

## 1. Decisões do usuário que esta SPEC aplica

- **21/10/2026:** a UP91-025 vem depois do escopo por caso, "com IdP sintético local (HTTPS/MFA), sem conta real; a escolha do IdP do hospital fica para quando o servidor existir; mesma regra de gate". Não concedidos: deploy, produção, dado real, IdP ou conta real.
- **22/10/2026** ([decisões](../04_audit/evidence/UP91-025-OIDC-20261022/user-decisions-20261022.json)): P1 autoriza `openid-client`; P2 ignora grupos alheios à matriz; P3 mantém a regra literal da SPEC0176 (deriva de role recusa); P4 "o login só pode reduzir"; decisões do lead P5 (versão inteira crescente), P6 (credencial de migração no serving só em teste) e P7 (informativo). Detalhe em §12.1.
- **D-09 ([pacote 0357](../03_build/0357_production_decision_packet_2026-09-26.md)) e C8 (16/10):** IdP corporativo OIDC com MFA antes do uso pela equipe; token interno assinado só para o ensaio da fase C ([decisões de 16/10](../04_audit/evidence/USER-DECISIONS-20261016/production-0374.json)). Esta SPEC não muda o ensaio C8.
- **27–28/09:** SPEC0144, SPEC0150 e SPEC0152 aprovadas para BUILD T3 sintético (aprovação em texto, sem hash; recon R3.6). Os commits isolados daquela época (`7019422`, `ed012a4`) não estão em nenhum ref (R3.1) e não são reaproveitados. Esta SPEC reaproveita o desenho revisado deles (rotas, limites, `customFetch`, `enableNonRepudiationChecks`), não os commits.

## 2. CURRENT

- A sessão só nasce de um token HMAC em `GET /v1/session` (`server.ts:844-966`; R2.1). Não existem rotas OIDC, cliente OIDC nem `openid-client` (R4, R5).
- No `main` há peças avulsas sem chamador fora dos testes: transação de login com state/PKCE/nonce e cookie pendente selado (`oidc-login-transaction.ts:59-177`), store PG de state (`oidc-state-postgres.ts:10-68`) e um mapeador de claims com `amr` fixo e grupo em caminho (`oidc-identity.ts:28-103`), que a SPEC0152 §5 proíbe reaproveitar sem adaptação (R4).
- O store PG de sessão só é composto com `NODE_ENV=production` (`production-bootstrap.ts:47-50`), e produção só aceita HMAC (`main.ts:43-47`) (R1, R6).
- `casePrincipalAuthority` é um texto de versão (`server.ts:349-354`, `:766-771`); nenhum chamador de produção o injeta; sem ele, `resolveCaseReadScope` dá 503 (`case-routes.ts:110-115`) (R8, R9).
- `applyVerifiedPrincipalState` existe com CAS e audit na mesma transação (`case-authority-postgres.ts:702-780`), chamado só por fixtures (R10).
- `Origin` ausente passa no hook HTTP (`http-security.ts:263`); não há guarda de CSRF por `Origin` exato (R12).
- Sem RLS, a persistência PG usa uma conexão única (`server.ts:5546-5549`), e o `write` do `PostgresCaseAuthority` faz `BEGIN`/`COMMIT` nela (`case-authority-postgres.ts:669-690`).
- Nenhuma migração falta para este recorte (R11).

## 3. Invariantes

- **I1 (login verificado).** Uma sessão de operador no modo OIDC só nasce no callback, depois de:
  - state de uso único consumido antes da troca do code;
  - troca com PKCE S256 e autenticação `client_secret_basic`;
  - ID token RS256 com **assinatura verificada** contra o JWKS do issuer configurado (`enableNonRepudiationChecks`, §4.2), e `iss`, `aud`, `azp`, `exp`, `iat`, `nonce` e `auth_time` ≤ 5 min;
  - MFA provado pela política;
  - exatamente um grupo elegível da matriz.
- **I2 (principal antes da sessão).** O principal `(tenantId, operatorId)` está corrente (ativo, mesma role, versão de autoridade vigente, origem `verified_adapter`) **antes** de a sessão ser criada. Falha do produtor não cria sessão.
- **I3 (autoridade só com produtor).** Em trusted, a versão de autoridade de principal só existe quando o login OIDC está composto, e é a mesma que o produtor grava. Com `process.env.NODE_ENV` diferente de `test`, `casePrincipalAuthority` sem login OIDC recusa a construção. Sem login OIDC, trusted continua 503 nas rotas de caso (falha fechada inalterada).
- **I4 (sem modo fixture produtivo).** Nesta rodada o login OIDC só compõe com `NODE_ENV=test`. `production` e `development` recusam a configuração OIDC no boot. Issuer `http:` é recusado sempre. Transporte injetado e issuer em loopback só existem em `NODE_ENV=test`. O IdP sintético mora em `__tests__/support/`, fora do build de runtime (`scripts/build-runtime.mjs:148-149`).
- **I5 (store durável e RLS).** No modo OIDC, `buildServerFromEnv` exige `API_PERSISTENCE_MODE=postgres`, `POSTGRES_RLS_ENFORCEMENT=true` e os stores PG de sessão e de state, com o mesmo preflight e a mesma readiness da produção (`production-bootstrap.ts:57-172`). Memória, RLS desligado, configuração parcial ou store ausente recusam o boot antes de `listen`. As recusas de `DATABASE_MIGRATION_URL` e `POSTGRES_AUTO_MIGRATE` no serving continuam só em `production` (`production-bootstrap.ts:52-56`, `server.ts:5359-5368`); no modo OIDC de teste, o serving recebe a credencial de migração (P6).
- **I6 (sem HMAC no modo OIDC).** Configuração OIDC com `CVG_OPERATOR_IDENTITY_KEYRING` recusa o boot. No modo OIDC, requisição com `x-cvg-operator-token` responde 401 sem `Set-Cookie`. `GET /v1/session` só restaura por cookie; nunca cria sessão.
- **I7 (CSRF).** No modo OIDC, toda requisição com método fora de `GET`/`HEAD`/`OPTIONS` que traga o nome do cookie operacional (mesmo malformado ou duplicado) exige `Origin` único e igual à origem do console, antes de qualquer efeito. `POST /v1/auth/oidc/start` exige essa origem mesmo sem cookie. Webhook sem cookie não muda.
- **I8 (cookies e expiração).**
  - Cookie operacional `HttpOnly; SameSite=Strict; Path=/` (`Secure` com HTTPS), validade = mínimo entre 15 min e o `exp` do ID token (CHECK no banco, `0000_auth.sql:20`). Sem refresh token nem renovação silenciosa.
  - Cookie pendente `SameSite=Lax`, 5 min. O handler do callback o apaga no sucesso e em toda resposta a partir do passo 2 (§4.3), exceto quando o próprio store de state está indisponível (passo 3).
  - Respostas dadas antes do handler não tocam o pendente: limite 429 (passo 1), recusas dos hooks globais (426, 403) e o 503 do hook de readiness do store.
- **I9 (redação).** Code, state, nonce, verifier, `code_challenge`, tokens, segredo do client, chave do cookie, `sub`, grupos, senha e TOTP nunca aparecem em resposta, log, erro de boot, métrica ou audit. **Única exceção:** a `authorizationUrl` da resposta 200 do start, que leva `state`, `nonce` e `code_challenge` por protocolo. Logs levam etapa, `reasonCode` e `correlationId`.
- **I10 (sem esquema novo).** Nenhuma migration, tabela, coluna, função SQL, role ou grant de banco muda. DTOs existentes não mudam; as rotas novas entram no contrato (§4.11).
- **I11 (falha fechada no IdP).** Discovery inválido ou indisponível impede o boot. IdP ou JWKS indisponível no callback dá 503 sem sessão. Sessões existentes continuam até expirar.
- **I12 (versão ordenada).** A versão de autoridade é ordenada pelo inteiro `matrix.version`. Um principal gravado com versão maior que a vigente nunca é reescrito por login: rollback de matriz não reativa nem troca role (P5, SPEC0176 `:52` "versão anterior/replay não restaura principal").

## 4. PROPOSED — contrato

### 4.1 Seleção do modo e configuração

`CVG_OPERATOR_LOGIN` seleciona o modo:

- ausente ou vazio: comportamento atual (HMAC quando `CVG_OPERATOR_IDENTITY_KEYRING` existe). Se qualquer variável `CVG_OIDC_*` ou `CVG_OPERATOR_CONSOLE_ORIGIN` estiver presente, o boot recusa ("configuração OIDC parcial");
- `oidc`: modo OIDC, com as regras abaixo;
- outro valor: recusa.

No modo `oidc`, a validação roda sem I/O, antes de criar pools, listener ou poller, e lê o `env` passado a `buildServerFromEnv`/`buildApiWithProductionSessions`. As guardas de `buildServer` (§4.8) leem `process.env`. Qualquer item ausente ou inválido recusa o boot com mensagem sem segredo (`serializeStartupFailure`).

| Variável                                                                                     | Regra                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                                   | só `test` nesta rodada; `production` e `development` recusam ("OIDC login is not qualified for this environment")                                                                                                                                                                                                                                                                                                                                                                   |
| `CVG_IDENTITY_MODE`                                                                          | `trusted` explícito                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `API_PERSISTENCE_MODE`                                                                       | `postgres`                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `POSTGRES_RLS_ENFORCEMENT`                                                                   | `true` (sem RLS, a conexão única quebra a concorrência do produtor; §2)                                                                                                                                                                                                                                                                                                                                                                                                             |
| `DATABASE_MIGRATION_URL`                                                                     | obrigatória no modo OIDC de teste, com papel distinto do runtime e do papel de sessão (o boot com RLS fora de produção já exige papel distinto, `server.ts:5429-5432,5528-5531`); premissa P6, só teste                                                                                                                                                                                                                                                                             |
| `CVG_OPERATOR_IDENTITY_KEYRING`, `CVG_LOCAL_OIDC_*`                                          | ausentes                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `CVG_OPERATOR_SESSION_DATABASE_URL`, `CVG_OPERATOR_AUTH_SCHEMA`, `CVG_OPERATOR_SESSION_ROLE` | obrigatórias, com as regras de `production-bootstrap.ts:57-90` (schema privado, papel dedicado e diferente do de `DATABASE_URL`, URL sem parâmetros de pool)                                                                                                                                                                                                                                                                                                                        |
| `CVG_OIDC_ISSUER`                                                                            | URL `https:`, sem usuário, senha, query ou fragmento; host em loopback aceito só com `NODE_ENV=test`                                                                                                                                                                                                                                                                                                                                                                                |
| `CVG_OIDC_CLIENT_ID`                                                                         | `[A-Za-z0-9._:-]{1,128}`                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `CVG_OIDC_CLIENT_SECRET`                                                                     | ≥ 32 caracteres, sem placeholder (`replace_me`, `change_me`, `example`)                                                                                                                                                                                                                                                                                                                                                                                                             |
| `CVG_OIDC_REDIRECT_URI`                                                                      | URL absoluta, caminho exato `/v1/auth/oidc/callback`, sem query, fragmento ou usuário; `https:`, ou `http:` em loopback só com `NODE_ENV=test`                                                                                                                                                                                                                                                                                                                                      |
| `CVG_OPERATOR_CONSOLE_ORIGIN`                                                                | origem válida por `normalizeOrigin`, presente em `API_ALLOWED_ORIGINS` e diferente da origem do issuer                                                                                                                                                                                                                                                                                                                                                                              |
| `CVG_OIDC_PENDING_COOKIE_KEY`                                                                | base64url canônico de exatamente 32 bytes                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `CVG_OIDC_MFA_POLICY`                                                                        | JSON estrito `{"version", "requiredAmr"}`: `version` `[A-Za-z0-9._-]{1,64}`; `requiredAmr` com 1 a 8 valores únicos `[a-z0-9_-]{1,32}`                                                                                                                                                                                                                                                                                                                                              |
| `CVG_OIDC_GROUP_MATRIX`                                                                      | JSON estrito `{"version", "claim", "entries"}`: `version` inteiro JSON de 1 a 999999999 (P5); `claim` `[A-Za-z0-9_.:-]{1,64}`, fora dos claims registrados (`iss`, `sub`, `aud`, `exp`, `iat`, `nbf`, `auth_time`, `nonce`, `acr`, `amr`, `azp`) e de `__proto__`, `constructor` e `prototype`; `entries` com 1 a 256 itens `{"group", "tenantId", "role", "active"}`, `group` de 1 a 256 caracteres e único, `tenantId` `tenant_<uuid>`, `role` entre as quatro, `active` booleano |

**Versão de autoridade (P5).** `N = matrix.version`. `D = sha256hex(canonicalizeJson({ issuer, clientId, mfaPolicy, groupMatrix }))`, com `entries` ordenadas por `group` antes do digest. `authorityVersion = "oidc-v" + N + "-" + D` (no máximo 80 caracteres, dentro de `case-authority.ts:332`). A ordem entre versões é a de N. O digest D só serve para detectar configuração editada sem subir N (checagem de boot, §4.8). Editar issuer, client, política MFA ou matriz exige subir N. Com N novo, todos os principais ficam não correntes (401 nas rotas de caso) até o próximo login de cada operador, como na drenagem da SPEC0152. O boot registra um resumo sem segredo: modo, origem do issuer, N, `authorityVersion` e versão da política MFA.

### 4.2 Autoridade OIDC no boot

Novo `apps/api/src/oidc-authority.ts`, sobre `openid-client` (P1). Usa só a API pública, reconferida na versão pinada:

- `discovery` com `ClientSecretBasic(secret)`, metadado `id_token_signed_response_alg: 'RS256'`, `execute: [enableNonRepudiationChecks]`, timeout de 5 s e `customFetch` apontando para o transporte da autoridade. **Sem** `allowInsecureRequests`. Na 6.8.8, sem `enableNonRepudiationChecks` a biblioteca não verifica a assinatura do ID token do token endpoint (`build/index.d.ts:1475-1486`, `build/index.js:748-760,963`; [revisão r1, M1](../04_audit/evidence/UP91-025-OIDC-20261022/spec-review-r1/review.md)). Se a versão pinada mudar o nome, o BUILD usa o equivalente exato e registra.
- `authorizationCodeGrant` com `pkceCodeVerifier`, `expectedNonce`, `expectedState`, `idTokenExpected: true` e `maxAge: 300`.

Recusa no boot (antes de `listen`), cada uma com teste:

1. `issuer` do metadata diferente, **byte a byte**, do configurado. A biblioteca compara só depois de normalizar a URL (`build/index.js:287`) e aceita, por exemplo, host em maiúsculas, `:443` ou barra final; a SPEC recusa esses casos;
2. `authorization_endpoint`, `token_endpoint` ou `jwks_uri` fora de `https:` ou fora da origem do issuer (D6; mesma regra de `oidc-login-transaction.ts:204`);
3. `response_types_supported` sem `code`; `code_challenge_methods_supported` sem `S256`; `token_endpoint_auth_methods_supported` ausente ou sem `client_secret_basic`; `id_token_signing_alg_values_supported` sem `RS256`;
4. erro de rede, TLS ou timeout no discovery.

**Transporte e classificação de erros (D12).** O transporte da autoridade é um invólucro interno sobre o `fetch` do Node (em teste, sobre `oidcTransport`). O mesmo invólucro serve discovery, token e JWKS. Ele marca a operação como indisponível em erro de rede, TLS ou timeout, ou em resposta HTTP ≥ 500. No callback:

- erro da biblioteca numa operação marcada → 503;
- qualquer outro erro da biblioteca (`ResponseBodyError`, códigos `OAUTH_*`, inclusive `OAUTH_INVALID_RESPONSE` e `OAUTH_KEY_SELECTION_FAILED` da assinatura) → 401.

A injeção `oidcTransport` em `buildServer`/`buildServerFromEnv` só é aceita com `NODE_ENV=test`. Em produção (fatia C) o invólucro usa o `fetch` do Node com as CAs do sistema.

**JWKS.** Com `enableNonRepudiationChecks`, a biblioteca busca o JWKS na primeira verificação e o guarda em cache. Diante de `kid` desconhecido, recusa sem nova busca se o cache tiver menos de 60 s; com 60 s ou mais, faz uma nova busca. O cache expira em 300 s (`oauth4webapi` 3.8.8, `build/index.js:1036,1093`; o BUILD reconfere na versão pinada). A readiness não chama o IdP: sessões existentes não dependem dele (I11).

### 4.3 Rotas

**`POST /v1/auth/oidc/start`.** Toda resposta com `cache-control: no-store`. Ordem:

1. hooks globais atuais: HTTPS, allowlist de `Origin`, limite global por IP, readiness do store de sessão;
2. `Origin` único e igual à origem do console, num `onRequest` da própria rota (antes do parse do corpo). Senão 403 `forbidden` "Operator login origin is invalid", sem ler cookie nem reservar state;
3. corpo ausente ou `{}`, senão 400 `validation_failed`;
4. limite `oidc:start:ip:<ip>` de 10 por 60 s (D3): excedido 429 com `Retry-After`; erro do limitador 503;
5. cookie operacional: um único cookie válido com sessão viva no store vira `previousSessionId`; ausente não muda nada; malformado, duplicado, expirado ou desconhecido não vira `previousSessionId` e a resposta o apaga; falha do store 503;
6. `startOidcLogin` com o `authorization_endpoint` do discovery; o payload selado do cookie pendente ganha `previousSessionId` opcional (AES-256-GCM, AAD atual); state reservado por até 5 min;
7. 200 `{ data: { authorizationUrl } }` e `Set-Cookie` do pendente. Falha do store de state 503.

**`GET /v1/auth/oidc/callback`.** Toda resposta com `cache-control: no-store`. O hook de sessão não trata esta rota nem o start (§4.6). Ordem:

1. limite `oidc:callback:ip:<ip>` de 30 por 60 s (D3);
2. alvo bruto ≤ 4096 bytes e caminho exato; `state` único e presente, e `code` único ou `error` único; senão 401 `unauthorized` "Operator login failed", pendente apagado, sem consumir state;
3. `readOidcLoginCallback` valida o cookie pendente e o state e **consome o state**. Inválido: 401 e pendente apagado, sem consumir state. Store de state indisponível: 503, pendente mantido;
4. `error` do IdP: 401 e pendente apagado;
5. troca do code (`authorizationCodeGrant`), com a classificação de §4.2: 401 ou 503, pendente apagado nos dois;
6. mapeamento dos claims (§4.4). Recusa: 401;
7. produtor (§4.5). Recusa: 401. Indisponível ou conflito repetido: 503;
8. sessão (§4.6). Falha: 503, pendente apagado, cookie operacional inalterado;
9. sucesso: 303 `Location: <origem do console>/`, `Set-Cookie` do cookie operacional e da limpeza do pendente.

Nenhuma resposta dos passos 1 a 4 chama o token endpoint. Corpo de 401 igual em todas as recusas (exceto `meta.correlationId`); o motivo vai só no log (`reasonCode`). Falhas respondem JSON, não redirecionam (D8).

O state preso ao cookie pendente impede que um code obtido por outra pessoa, aberto no navegador da vítima, case com o pendente dela. Isso não cobre o cookie tossing: sem o prefixo `__Host-`, uma origem irmã pode plantar um pendente na vítima. A defesa vem na 0254-B (SPEC0150 item 5). Na A, que só roda em teste, não há origem irmã real.

### 4.4 Mapeamento dos claims

Substitui `mapVerifiedOidcClaims` (`oidc-identity.ts:28-103`) por `mapVerifiedOidcIdentity(claims, policy)`. Entrada: claims já verificados pela biblioteca. A função repete e completa:

- `iss` igual ao issuer; `aud`/`azp` pela regra atual `hasExpectedAudience` (`oidc-identity.ts:109-129`); `sub` string de 1 a 255 bytes; `iat`, `exp` e `auth_time` inteiros; skew 30 s; `exp` > agora; `auth_time` ≥ agora − 300;
- MFA: `amr` é array de strings e contém todos os valores de `requiredAmr` (D4); ausência, tipo errado ou falta de um valor recusa (`mfa_missing`);
- grupos: o claim `matrix.claim` é lido só como propriedade própria (`Object.hasOwn`), membro de topo, array de até 256 strings de até 256 caracteres; senão `groups_invalid`. Elegíveis = entradas da matriz cujo `group` está no claim. Zero: `no_eligible_group`. Mais de um: `ambiguous_group`. Um inativo: `inactive_group` (vai ao produtor, §4.5). Um ativo: `{ tenantId, role }`. Grupos fora da matriz são ignorados (P2);
- `operatorId = "oidc_" + sha256hex(JSON.stringify([iss, sub]))` (regra atual `oidc-identity.ts:91-93`, 69 caracteres);
- `expiresAt = min(exp, agora + 900) × 1000`;
- `proofRef = "oidc-login:" + sha256hex(JSON.stringify([iss, sub, iat, auth_time]))` (sem segredo; só o digest é persistido).

### 4.5 Produtor verificado de principal

Novo `apps/api/src/case-principal-producer.ts`, único chamador de `applyVerifiedPrincipalState` fora de fixtures. Entrada: `tenantId`, `operatorId`, `role`, se a entrada da matriz está ativa, `authorityVersion` vigente V = (N, D) e `proofRef`. Algoritmo:

1. lê P por `caseAuthority.readSnapshot(tenantId, s => s.principal(operatorId))`;
2. extrai (Np, Dp) de `P.authorityVersion` pelo padrão `^oidc-v([1-9][0-9]{0,8})-([0-9a-f]{64})$`; fora do padrão (por exemplo, fixtures sintéticas), Np = 0;
3. decide pela tabela abaixo;
4. escreve, quando a tabela manda, com `expectedRevision` = revisão lida (0 se ausente), `identitySource: 'verified_adapter'` e V;
5. em `principal_conflict`, volta ao passo 1 uma vez; no segundo conflito, 503;
6. erro de banco: 503.

"Corrente" = ativo, mesma role do mapeamento, `authorityVersion` = V e origem `verified_adapter`. A tabela é lida de cima para baixo; vale a primeira linha que casa.

| #   | P                                                 | Entrada da matriz | Decisão                                                                                               |
| --- | ------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | ausente                                           | ativa             | cria (revisão 0 → 1), ativo, role do mapeamento (primeiro cadastro, SPEC0176 `:52`)                   |
| 2   | ausente                                           | inativa           | recusa sem escrita                                                                                    |
| 3   | Np > N, ou Np = N com Dp ≠ D                      | qualquer          | recusa sem escrita (`principal_version_ahead`; P5: rollback não reativa, não rebaixa, não troca role) |
| 4   | ativo                                             | inativa           | desativa (`active: false`, role mantida, V) e recusa (P4: o login só reduz)                           |
| 5   | inativo                                           | inativa           | recusa sem escrita                                                                                    |
| 6   | inativo, Np = N                                   | ativa             | recusa sem escrita (login não reativa sozinho)                                                        |
| 7   | Np < N, ou origem ≠ `verified_adapter`            | ativa             | atualiza: role do mapeamento, ativo, V (versão de matriz maior; inclui reativação)                    |
| 8   | corrente                                          | ativa             | nada a escrever (sem revisão nova nem audit)                                                          |
| 9   | ativo, Np = N, `verified_adapter`, role diferente | ativa             | recusa sem escrita (`principal_drift`; P3, regra literal da SPEC0176 `:52`)                           |

**Leitura explícita da SPEC0176 `:52` (decisão P4 de 22/10).** Sob a mesma versão de matriz, o login só pode **tirar** acesso (linha 4); nunca dá acesso nem troca role (linhas 6 e 9). Dar acesso acontece só no primeiro cadastro (linha 1, previsto na SPEC0176) ou com versão de matriz maior que a do principal (linha 7, configuração versionada). A desativação da linha 4 corta na hora as sessões abertas nas rotas de caso (401 por principal inativo, `case-routes.ts:116-130`).

A linha 7 com origem `synthetic_fixture` só ocorre em `NODE_ENV=test`, onde fixtures da SPEC0176 gravam principais sintéticos. Com a checagem de boot (§4.8), Np = N com Dp ≠ D não deveria chegar ao produtor nos tenants da matriz; a linha 3 fica como defesa.

Efeitos: a escrita usa a transação de `applyVerifiedPrincipalState` (CAS + audit `policy_decision`, ator `System`/`case-principal-provisioning`). O produtor nunca é rota HTTP, nunca recebe dado do corpo e nunca é chamado pelo cadastro de atribuições. Nenhum grant é criado no login (SPEC0176 `:54`).

### 4.6 Sessão no modo OIDC

- **Criação:** depois do produtor. Com `previousSessionId`, `switchIdentity(previous, next)` aposenta a linhagem anterior e cria uma família nova na mesma transação (`operator-session-postgres.ts:143-186`; no store em memória, `revoke` + `create`). Sem ele, `create`. Todo login cria família nova (D7).
- **Recarga:** `GET /v1/session` com cookie válido devolve `{ identity, expiresAt }` como hoje. Sem cookie, 401 "Operator session is missing or expired". Hoje esse caminho responde "A trusted operator identity resolver is required in production" e apaga o cookie (`server.ts:884-897,958-965`); o handler muda no modo OIDC (§6). Nunca cria sessão no modo OIDC.
- **Logout:** `POST /v1/session/logout` como hoje (revoga a família, depois limpa o cookie), mais o CSRF de §4.7.
- **Expiração:** I8. Cookie expirado ou revogado: 401 e cookie apagado (hook atual).
- **Hook de sessão:** `operator-session-hook.ts:56,73` passa a isentar também `/v1/auth/oidc/start` e `/v1/auth/oidc/callback`, que tratam o cookie operacional pelas próprias regras.
- **Principal e sessão:** principal desativado ou com role diferente da sessão dá 401 nas rotas de caso (`case-routes.ts:116-130`, sem mudança). As demais rotas seguem a sessão até expirar (resíduo, §5).

### 4.7 CSRF e token HMAC no modo OIDC

Dois hooks `onRequest`, instalados só quando o login OIDC está composto, depois do hook HTTP (`http-security.ts:231`) e antes do hook de sessão:

1. **Token HMAC:** fora das quatro probes, requisição com o cabeçalho `x-cvg-operator-token` (qualquer valor) recebe 401 `unauthorized` "Bootstrap tokens are disabled", `cache-control: no-store`, sem `Set-Cookie` (D10).
2. **CSRF:** método fora de `GET`/`HEAD`/`OPTIONS` com o nome do cookie operacional no cabeçalho `cookie` exige `Origin` único com `normalizeOrigin(origin) === origem do console`. Senão 403 `forbidden` "Origin is not allowed", `cache-control: no-store`, antes de body, handler ou efeito. A detecção do nome usa o mesmo corte de `parseOperatorSessionCookie` (`operator-session.ts:92-111`: segmentos por `;`, nome antes do primeiro `=`, com `trim`), aceita qualquer valor (inclusive vazio, malformado ou repetido) e trata `cookie` em array (vindo de `inject`) olhando cada elemento.

Sem login OIDC, nenhum dos dois hooks existe: o modo HMAC (ensaio C8, E2E `rem21-014`) não muda (D11).

### 4.8 Composição

**`BuildServerOptions`** ganha:

```ts
operatorLogin?: {
  kind: 'oidc'
  authorityVersion: string
  consoleOrigin: string
  authority: OidcOperatorAuthority // start, complete, clearPendingCookie
  stateStore: OidcLoginStateStore
}
oidcTransport?: OidcTransport // só NODE_ENV=test
```

Regras em `buildServer`, lendo `process.env.NODE_ENV` (cada uma recusa a construção com erro):

- `operatorLogin` exige `identityMode === 'trusted'` e `operatorSessionStore`;
- `operatorLogin` com `operatorIdentityResolver` recusa (I6);
- `operatorLogin` com `process.env.NODE_ENV` diferente de `test` recusa (I4);
- `principalPolicy.authorityVersion` vem de `operatorLogin.authorityVersion`; `casePrincipalAuthority` junto, com versão diferente, recusa;
- `casePrincipalAuthority` sem `operatorLogin` só com `process.env.NODE_ENV === 'test'` (fixtures da SPEC0176/0251, `case-authorization-fixtures.ts:12-44`); fora disso recusa (I3). Ler `process.env`, e não o `env` do builder, mantém `postgres-persistence-mode.test.ts:1826` (que passa `NODE_ENV: 'production'` no `env` com o processo em `test`);
- `oidcTransport` fora de `NODE_ENV=test` recusa.

**Boot pelo entrypoint** (`main.ts` → `buildApiWithProductionSessions` → `buildServerFromEnv`), sem mudar `main.ts`:

1. valida a configuração do login (§4.1), sem I/O;
2. compõe o store PG de sessão e o `PostgresOidcLoginStateStore` no mesmo pool, com o preflight e a readiness atuais, quando `NODE_ENV=production` **ou** `CVG_OPERATOR_LOGIN=oidc` (generaliza `production-bootstrap.ts:47-50`; o nome exportado pode continuar). A recusa de `DATABASE_MIGRATION_URL` em `production-bootstrap.ts:52-56` continua só para `production`;
3. discovery (§4.2);
4. pools e preflights do produto (atuais, com RLS);
5. `buildServer` com `operatorLogin`, store PG, `identityMode: 'trusted'`;
6. **checagem de versão (P5):** para cada `tenantId` distinto da matriz, `app.caseAuthority.readSnapshot(tenantId, s => s.hasPrincipalVersionMismatch("oidc-v" + N + "-", V))`. Qualquer `true` recusa o boot ("matriz alterada sem subir a versão"). Sem estado novo: lê `case_principals` sob RLS do tenant;
7. `listen`.

Falha em qualquer passo fecha o que foi aberto e não chama `listen`. O hook de readiness do store (`production-bootstrap.ts:194-219`) vale também no modo OIDC, cobrindo as rotas de login.

**Método novo de leitura.** `CaseReadSnapshot.hasPrincipalVersionMismatch(prefix, current)` devolve se algum principal do tenant tem `authority_version` que começa com `prefix` e difere de `current`. PostgreSQL: `SELECT EXISTS (SELECT 1 FROM case_principals WHERE tenant_id = $1 AND left(authority_version, length($2)) = $2 AND authority_version <> $3)`, na conexão do snapshot. Memória: o mesmo predicado sobre o estado do tenant, na fila serial.

### 4.9 Erros

| Situação                                                                                                                                    | Status                                     | Efeito                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| start sem `Origin` exato                                                                                                                    | 403 `forbidden`                            | nenhum state, nenhum cookie                                                            |
| start ou callback acima do limite                                                                                                           | 429 `rate_limited`                         | pendente intocado                                                                      |
| start com store de sessão/state ou limitador indisponível                                                                                   | 503 `configuration_error`                  | nenhum state novo                                                                      |
| callback com parâmetros, cookie ou state inválido, replay, `error` do IdP, token ou assinatura rejeitados, MFA, grupo ou principal recusado | 401 `unauthorized` "Operator login failed" | sem sessão; sem escrita de principal, salvo a desativação da linha 4; pendente apagado |
| callback com IdP ou JWKS indisponível, produtor indisponível, conflito repetido ou store de sessão indisponível                             | 503 `configuration_error`                  | sem sessão; cookie operacional inalterado; pendente apagado                            |
| callback com store de state indisponível (passo 3)                                                                                          | 503 `configuration_error`                  | pendente mantido                                                                       |
| mutação com cookie sem `Origin` exato                                                                                                       | 403 `forbidden`                            | nenhum efeito                                                                          |
| `x-cvg-operator-token` no modo OIDC                                                                                                         | 401 `unauthorized`                         | sem `Set-Cookie`                                                                       |
| configuração inválida, parcial ou em ambiente não qualificado; discovery inválido; matriz alterada sem subir a versão                       | boot falha, saída 1, antes de `listen`     | nenhum pool fica aberto; stderr sem segredo                                            |
| rota de caso em trusted sem login OIDC                                                                                                      | 503 (inalterado)                           | —                                                                                      |

`reasonCode` de log: `origin_invalid`, `rate_limited`, `state_invalid`, `state_unavailable`, `idp_error`, `token_rejected`, `idp_unavailable`, `mfa_missing`, `groups_invalid`, `no_eligible_group`, `ambiguous_group`, `inactive_group`, `principal_inactive`, `principal_drift`, `principal_version_ahead`, `principal_conflict`, `principal_unavailable`, `session_unavailable`.

### 4.10 IdP sintético (só teste)

Novo `apps/api/src/__tests__/support/synthetic-oidc-issuer.ts`. Nunca importado fora de `__tests__` (teste de fronteira, O12).

- **Transportes:** (a) em memória, `fetch(url, init) → Response`, para testes em processo; (b) servidor HTTPS em `127.0.0.1:0` com CA e certificado efêmeros (SAN `localhost`, `127.0.0.1`) gerados por `openssl` num diretório temporário removido ao fechar (D5). Sem `openssl`, o teste falha (não pula).
- **Endpoints:** discovery, `authorize`, `token` (`client_secret_basic`, PKCE S256, code de uso único com 60 s), `jwks`. O IdP conta as chamadas a `token` e a `jwks`.
- **Chaves:** RSA 2048 gerada a cada execução por `node:crypto`; JWKS com `kid`. Rotação positiva se prova com app novo (nova `Configuration`) ou com relógio falso passando de 60 s, por causa do cache de §4.2.
- **Usuários:** criados por teste com senha e segredo TOTP aleatórios e grupos sintéticos. MFA: TOTP RFC 6238 (HMAC-SHA1, 30 s, 6 dígitos) por `node:crypto`; `amr: ['pwd','otp']` só com TOTP válido; TOTP errado não emite code.
- **Controles para negativos:**
  - claims: `iss`, `aud`, `azp`, `nonce` errados; `exp` vencido ou curto; `auth_time` antigo; `amr` sem `otp`; claim de grupos ausente, escalar, aninhado ou com não-string; dois grupos elegíveis;
  - assinatura: `alg` `none` ou `HS256`; `kid` desconhecido; assinatura de outra chave com `kid` conhecido;
  - transporte: erro no `authorize`; token endpoint 400/401/500; JWKS 500 ou fora do ar; IdP fora do ar;
  - metadata: `issuer` divergente, inclusive só na normalização (host em maiúsculas, `:443`, barra final); endpoints fora da origem.
- Dados só sintéticos: tenants `tenant_<uuid>` de teste, grupos `synthetic-*`, nenhum e-mail ou nome.

### 4.11 Contrato público (adendo à SPEC0107, promoção pelo lead)

- `POST /v1/auth/oidc/start`: público com `Origin` exato do console; 200 `{authorizationUrl}` + cookie pendente; 400, 403, 429, 503.
- `GET /v1/auth/oidc/callback`: público para a navegação do IdP; 303 para o console com cookie operacional; 401 genérico; 429; 503.
- `GET /v1/session` no modo OIDC: só restaura por cookie.
- No modo OIDC, mutação com cookie exige `Origin` exato (403), e `x-cvg-operator-token` é recusado (401).

## 5. Fora de escopo e resíduos

- **0254-B:** login no console, transporte cross-origin (CORS com credenciais, `__Host-`, origem fixa no bundle, NGINX, CSP), Chromium com hosts distintos, CSRF no modo HMAC, defesa contra cookie tossing do pendente.
- **0254-C:**
  - login OIDC em produção (SPEC0152 §1–§3, §6), valores reais de MFA e grupos, escopos além de `openid`, CA interna do hospital, cofre, staging;
  - conciliar `CVG_OPERATOR_LOGIN` com o discriminante `local-controlled`/`corporate-oidc` da SPEC0151/0152 §1;
  - rever o limite de start de 10/min por IP, que vira gargalo atrás do NAT ou proxy do hospital.
- **UP91-026:** troca atômica de sessão e revogação de todas as sessões de um operador; rotas fora de caso continuam aceitando a role da sessão até expirar (≤ 15 min) depois de mudança de role ou desativação.
- **SPEC0149:** purga de sessões e states expirados (proposta, não construída).
- **Checagem de versão no boot:** cobre só os tenants da matriz vigente. Principal de tenant retirado da matriz não é examinado, mas também não consegue logar (sem grupo elegível).
- Diretório de principais com nome legível para o Supervisor achar o `operatorId` opaco: precisa de migração; o operador vê o próprio `operatorId` em `GET /v1/session`.
- Desprovisionamento sem login (SCIM, back-channel logout) e logout no IdP.
- Ensaio C8 com HMAC em produção: inalterado; rotas de caso seguem 503 até a 0254-C (P7).
- `deploy/local-oidc` (Keycloak HTTP) não muda e não é usado.

## 6. Conjunto de escrita (candidata)

- **Produção:**
  - novos: `apps/api/src/oidc-config.ts`, `oidc-authority.ts`, `oidc-routes.ts`, `case-principal-producer.ts`;
  - alterados: `oidc-identity.ts` (mapeador por política; sai o de caminho), `oidc-login-transaction.ts` (`previousSessionId` no payload; endpoint vindo do discovery), `production-bootstrap.ts` (§4.8 passos 1–3), `operator-session-hook.ts` (isenção), `server.ts` (opções, recusas, hooks, rotas, a mensagem de `GET /v1/session` sem cookie no modo OIDC, o ramo OIDC de `buildServerFromEnv` e a checagem de versão);
  - persistência, só o método de leitura de §4.8: `packages/persistence/src/case-authority.ts`, `case-authority-postgres.ts` e, se preciso, `case-authority-memory-state.ts`.
- **Dependência (P1):** `apps/api/package.json`, `package-lock.json`, allowlist `docs/03_build/0305_repository_target_structure.json` (`allowed_dependencies` de `apps/api`, conferida por `tests/repository-structure.test.js`).
- **Testes:** novos `__tests__/support/synthetic-oidc-issuer.ts` e os arquivos de §7; ajustes sem afrouxar asserção em `oidc-identity.test.ts`, `oidc-login-transaction.test.ts`, `production-bootstrap-own.test.ts`, `operator-session-hook.test.ts` e qualquer teste que codifique o mapeador antigo ou a ativação do bootstrap só em produção. O BUILD registra a lista final.
- **Governança:** `package.json` (novos arquivos PG em `test:postgres`), `scripts/skip-catalog.json`, `.env.example` (variáveis novas, marcadas como só teste nesta rodada), adendo à SPEC0107.
- **Nada em:** migrations, `apps/web/**`, `apps/worker/**`, `deploy/**`, `products/**`, `legacy/**`, `main.ts`.
- O BUILD precisa de claim próprio sobre `server.ts`, o lockfile e os demais caminhos ([coordenação](../08_runtime/agent_coordination.md)).

## 7. Provas

Cada teste novo falha na base (first red) e passa no BUILD. Fixtures sintéticas: tenant A e tenant B; grupos `synthetic-a-operator` (Operator, A), `synthetic-a-approver` (Approver, A), `synthetic-a-supervisor` (Supervisor, A), `synthetic-a-disabled` (Operator, A, inativo), `synthetic-b-operator` (Operator, B); usuários com um grupo cada, um com dois grupos elegíveis, um sem grupo da matriz.

**Ambiente PG de O6 (parte PG), O9 e O10.**

- `NODE_ENV=test` no processo e no `env`. Sem `stubEnv('NODE_ENV', 'production')`.
- `API_PERSISTENCE_MODE=postgres`, `POSTGRES_RLS_ENFORCEMENT=true` e `POSTGRES_AUTO_MIGRATE=false` (o harness migra antes).
- `DATABASE_URL` do papel runtime `NOSUPERUSER NOBYPASSRLS`; `DATABASE_MIGRATION_URL` do papel dono das migrations, distinto do runtime e do de sessão (P6); `POSTGRES_SCHEMA` próprio.
- Papel e schema de sessão próprios, com as funções concedidas.
- `CVG_RATE_LIMIT_KEYRING` sintético, `API_ALLOWED_ORIGINS` com a origem do console e as variáveis OIDC de §4.1.
- Papéis e schemas criados como em `production-bootstrap-postgres-own.test.ts:59-130`, sem as linhas `:131-137`.
- PostgreSQL descartável próprio, com a porta registrada no claim.

| ID  | Teste                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | First red na base                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| O1  | Configuração (tabela, `buildServerFromEnv` e `buildApiWithProductionSessions`): cada variável de §4.1 ausente ou inválida; `CVG_OIDC_*` sem modo; modo com keyring HMAC ou com `CVG_LOCAL_OIDC_*`; `production`, `development`; `memory`; RLS desligado; sem `DATABASE_MIGRATION_URL`; issuer `http:`; redirect com outro caminho ou query; console fora da allowlist ou igual ao issuer; chave de 31/33 bytes; segredo curto ou placeholder; política inválida; matriz inválida (grupo repetido, tenant, role, claim registrado ou `__proto__`, 257 entradas, `version` 0, negativa, fracionária, string ou acima de 999999999); store de sessão ausente. Recusa antes de abrir pool (URL de banco inalcançável não chega a ser usada: a mensagem é de configuração) e sem segredo na mensagem. Nos casos `production` e `development`, o restante da configuração é válido para esse ambiente, para que a recusa observada seja a do OIDC e não a de `parseEnv`.                                                                                                                                                         | o boot ignora as variáveis e segue     |
| O2  | Discovery e versão:<br>• `issuer` diferente (`https://other…`) e `issuer` que só difere na normalização (host em maiúsculas, `:443`, barra final) → boot falha;<br>• endpoint fora da origem ou `http:` → boot falha;<br>• sem `code`, `S256`, `client_secret_basic` ou `RS256` → boot falha;<br>• IdP fora do ar ou lento (5 s, timeout de teste explícito ≥ 30 s) → boot falha sem `listen`;<br>• `authorityVersion` tem o N da matriz e muda com issuer, client, política ou matriz; não muda com segredo, redirect, console nem com a ordem das entradas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | rota e módulo inexistentes             |
| O3  | Caminho feliz em processo (`buildServer` com stores em memória e transporte em memória): start com `Origin` → authorize com senha e TOTP → callback 303 para o console, cookie operacional `SameSite=Strict`, pendente apagado, uma chamada a `token` e uma a `jwks`; `GET /v1/session` só com cookie 200 com a identidade mapeada; Supervisor em `GET /v1/cases` e `GET /v1/tasks` 200 (sem login OIDC, 503); principal com revisão 1, `verified_adapter` e V; segundo login do mesmo usuário não cria revisão nem audit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `POST /v1/auth/oidc/start` 404         |
| O4  | Start: sem `Origin`, `null`, origem irmã, `http:` e `Origin` repetido → 403 sem linha de state, inclusive com corpo inválido (o 403 vem antes do 400); corpo não vazio → 400; 11ª chamada no minuto → 429; store de state fora → 503; cookie operacional expirado ou malformado → 200 com o cookie apagado e sem `previousSessionId`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 404                                    |
| O5  | Callback; em todo caso, corpo de 401 igual, sem linha de sessão e sem escrita de principal:<br>• **zero chamadas a `token`**, pendente apagado: parâmetros inválidos; sem cookie pendente; cookie adulterado ou de outro issuer/client; state divergente; pendente com mais de 5 min; `error` do IdP; **replay** (segundo uso do mesmo callback, sem chamada nova a `token`);<br>• **sequência:** state divergente → 401; depois, o mesmo code com o state certo e o mesmo pendente → 303 (code não queimado, state não consumido);<br>• **assinatura:** outra chave com `kid` conhecido → 401; `kid` desconhecido → 401; `alg` `none`/`HS256` → 401;<br>• **claims:** `iss`, `aud`, `azp`, `nonce` errados; `exp` vencido; `auth_time` > 5 min; `amr` sem `otp`; grupos ausentes, escalar, aninhado ou com não-string; nenhum grupo da matriz; dois grupos elegíveis → 401;<br>• **IdP:** TOTP errado (sem code); code reusado; segredo do client errado (token 401) → 401; token endpoint 500, JWKS 500, JWKS fora e IdP fora → 503;<br>• **rotação:** chave nova no JWKS aceita por app novo (ou relógio falso > 60 s). | 404                                    |
| O6  | Produtor, memória e PG, cada linha (1–9) da tabela de §4.5:<br>• criação; nada a escrever (revisão e contagem de audit iguais); atualização por N maior; atualização de `synthetic_fixture` para `verified_adapter`;<br>• recusa por deriva de role; recusa de inativo com mesmo N; reativação com N maior;<br>• recusa sem escrita com Np > N (rollback) e com Np = N e Dp ≠ D;<br>• desativação por entrada inativa (audit com `active: false`) e recusa;<br>• dois callbacks simultâneos do mesmo usuário novo → um principal revisão 1 e as duas sessões criadas;<br>• dois conflitos seguidos (injetados) → 503 sem sessão; falha de escrita do principal → 503 sem sessão;<br>• `hasPrincipalVersionMismatch` em memória e PG, com tenant adversário isolado.                                                                                                                                                                                                                                                                                                                                                        | módulo inexistente                     |
| O7  | Autoridade e recusas de composição: `casePrincipalAuthority` sem `operatorLogin` com `process.env.NODE_ENV=development` → recusa; `operatorLogin` + resolver HMAC → recusa; versões diferentes → recusa; `operatorLogin` ou `oidcTransport` fora de `test` → recusa. Guarda (verde na base): trusted com HMAC pelo `buildServerFromEnv` continua 503 em `/v1/conversations`, `/v1/cases` e `/v1/tasks` para todas as roles; `postgres-persistence-mode.test.ts` continua passando.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | construção aceita                      |
| O8  | CSRF e token no modo OIDC: com cookie, `POST /v1/tasks`, `PATCH /v1/tasks/:id/status`, `PUT /v1/cases/:caseId/assignments/:operatorId` e `POST /v1/session/logout` sem `Origin`, com `null`, origem irmã, `http:` ou repetido → 403, sem task, audit, grant nem revogação. Também com cookie malformado, repetido, vazio, com espaços ao redor do nome (` cvg_operator_session =x`) e com `cookie` em array. Com `Origin` exato → segue o fluxo atual. Webhook assinado sem cookie → mesma resposta de hoje. `x-cvg-operator-token` em `GET /v1/session` e em `GET /v1/cases` → 401 sem `Set-Cookie`, com e sem cookie válido.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 200/201 sem `Origin`                   |
| O9  | PG em processo (`buildServerFromEnv`, ambiente acima, transporte em memória):<br>• OperatorA logado e com grant no caso X lê X (200) e recebe 404 em Y; ApproverA sem grant 404; Supervisor do tenant A vê o tenant; Operator do tenant B recebe 404 nos recursos de A;<br>• linha `case_principals` com `verified_adapter`, `authority_version` `oidc-v<N>-<D>` e `proof_digest` de 64 hex;<br>• deriva de role recusada; entrada desativada → sessão existente 401 nas rotas de caso;<br>• **versão:** login com N=3 (digest A); app novo com N=3 e matriz editada (digest B) → boot recusa; com N=4 → boot sobe, sessão antiga 401 nas rotas de caso, novo login atualiza (linha 7); app com N=2 (rollback) → boot sobe, login do principal N=4 recusado sem escrita (linha 3), rotas de caso 401.                                                                                                                                                                                                                                                                                                                      | 404                                    |
| O10 | Entrypoint real com PG e IdP HTTPS (processo filho `tsx apps/api/src/main.ts`, ambiente acima, `NODE_EXTRA_CA_CERTS` com a CA efêmera, IdP em host e esquema distintos da API):<br>• login → 303; recarga só com cookie 200; Supervisor em `/v1/cases` e `/v1/tasks` 200;<br>• reinício do processo → mesmo cookie 200; novo login no mesmo navegador → cookie anterior 401;<br>• logout sem `Origin` → 403 e sessão viva; logout com `Origin` → cookie 401;<br>• usuário com `exp` de 5 s → 401 depois de expirar (timeout de teste explícito ≥ 30 s);<br>• papel de sessão sem login e conexões encerradas → 503 em rota protegida e no callback, cookie preservado, recuperação depois;<br>• configurações de O1 → saída 1 antes de `listen` e stderr sem segredo.                                                                                                                                                                                                                                                                                                                                                      | start 404 / boot ignora a configuração |
| O11 | Redação: em todas as respostas, logs capturados, audit e stderr de O3–O10, nenhum code, state, nonce, verifier, `code_challenge`, ID token, segredo, chave, `sub`, grupo, senha ou TOTP sintético. Isso vale para o 303 do callback e para os 401/503. Única exceção: a `authorizationUrl` da resposta 200 do start (I9).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | guarda (rotas inexistentes na base)    |
| O12 | Fronteira: nenhum arquivo fora de `__tests__` importa `synthetic-oidc-issuer`; o build de runtime não contém o suporte; nenhum código de produção lê `NODE_EXTRA_CA_CERTS` ou injeta CA; nenhum uso de `allowInsecureRequests`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | guarda (verde na base)                 |

## 8. Mutantes que os testes matam

- M1 sessão sem chamar o produtor (O3/O9: 401 nas rotas de caso).
- M2 produtor depois da sessão (O6: falha do produtor deixa sessão).
- M3 `identitySource: 'synthetic_fixture'` no produtor (O9: `verified_adapter` na linha; O3: o segundo login cairia na linha 7 e criaria revisão).
- M4 versão de autoridade sem o N da matriz (O2 e O9: N=4 não invalida a sessão antiga).
- M5 aceitar `amr` sem `otp` (O5).
- M6 primeiro grupo elegível ganha (O5: dois grupos).
- M7 ignorar entrada inativa (O6, O9).
- M8 reativar inativo com mesmo N (O6).
- M9 atualizar role por deriva com mesmo N (O6, O9).
- M10 `casePrincipalAuthority` aceito sem login OIDC fora de teste (O7).
- M11 CSRF só quando o cookie é válido (O8: cookie malformado).
- M12 `Origin` ausente aceito (O8).
- M13 state consumido depois da troca do code (O5: o replay passa a chamar `token`).
- M14 `expectedNonce` omitido (O3: a biblioteca recusa todo ID token com `nonce`, e o caminho feliz falha).
- M15 pendente mantido em falha depois do consumo (O5).
- M16 token HMAC aceito no modo OIDC (O8).
- M17 modo OIDC aceito em `production` ou `development` (O1/O7).
- M18 store em memória aceito no modo OIDC pelo entrypoint (O1).
- M19 comparação de issuer deixada só para a biblioteca, sem a checagem byte a byte (O2: issuer que só difere na normalização).
- M20 `create` em vez de `switchIdentity` com sessão anterior (O10: cookie anterior continua 200).
- M21 corpo de 401 diferente por motivo (O5: igualdade de corpo).
- M22 `authorityVersion` dependente do segredo (O2).
- M23 sem `enableNonRepudiationChecks` (O5: outra chave com `kid` conhecido e `kid` desconhecido seriam aceitos).
- M24 troca do code antes de validar o state (O5: na sequência, o code é queimado e o segundo passo dá 401 em vez de 303).
- M25 boot sem a checagem de versão (O9: matriz editada com N=3 sobe).
- M26 produtor compara versão por diferença, não por ordem (O6 e O9: rollback N=2 reativa ou rebaixa o principal N=4).
- M27 erro de transporte classificado como 401 (O5: JWKS fora e token 500 dão 503).
- M28 tokenizador do CSRF mais estrito que `parseOperatorSessionCookie` (O8: espaços ao redor do nome e `cookie` em array).
- M29 matriz aceita `claim` `__proto__`, `constructor` ou `prototype` (O1).

## 9. Aceites

1. Configuração OIDC inválida, parcial, com HMAC ou `CVG_LOCAL_OIDC_*`, em memória, sem RLS, sem credencial de migração em teste, sem store de sessão ou fora de `NODE_ENV=test` recusa o boot antes de `listen`, sem segredo na mensagem (O1, O10).
2. Discovery divergente (inclusive só na normalização do issuer) ou indisponível impede o boot (O2).
3. O login pelo entrypoint com IdP sintético HTTPS e MFA cria sessão PG e cookie operacional; recarga só com cookie restaura a identidade; reinício mantém a sessão (O3, O10).
4. Todos os negativos de O5 terminam sem sessão, sem principal escrito (salvo a desativação da linha 4) e com o mesmo 401 ou com 503. As recusas antes da troca não chamam o token endpoint.
5. A assinatura do ID token é verificada contra o JWKS do issuer (O5, M23).
6. O principal fica corrente antes da sessão, com `verified_adapter` e V; a tabela de §4.5 vale em memória e em PG; o login só reduz acesso sob a mesma versão (O6, O9).
7. A versão de autoridade é ordenada: rollback não reescreve principal; matriz editada sem subir N não sobe nos tenants da matriz (O6, O9).
8. Com login OIDC, Supervisor/Admin leem o tenant, Operator/Approver só o atribuído, e o tenant adversário recebe 404 (O9). Sem login OIDC, trusted segue 503 (O7).
9. `casePrincipalAuthority` não existe fora de teste sem o login OIDC (O7).
10. CSRF por `Origin` exato em toda mutação com cookie no modo OIDC; webhook sem cookie inalterado (O8).
11. Token HMAC recusado no modo OIDC, sem `Set-Cookie` (O8).
12. Logout, revogação pela troca de identidade e expiração levam a 401; store fora dá 503 sem apagar cookie e recupera (O10).
13. Nada sensível em resposta, log, audit ou stderr, salvo a `authorizationUrl` do start (O11).
14. O IdP sintético não entra no runtime (O12).
15. Nenhuma migration, DTO existente ou rota do modo HMAC muda; `critical-flows` e `rem21-014` passam sem ajuste de asserção.
16. Mutantes M1–M29 mortos e registrados.

## 10. Gates de pronto

- Node 22: `npx prettier --check` nos tocados, `npm run -s lint`, `npm run -s typecheck`, `npm run -s skip:governance`, `npm run -s docs:check-links`, `npm run -s licenses:check`, `npm audit --omit=dev` sem high/critical, SBOM (mudança de lockfile, com claim próprio).
- Testes focais O1–O12; suítes `apps/api` e `packages/persistence`; `tests/repository-structure.test.js`; `test:postgres` com PostgreSQL descartável próprio (porta registrada no claim).
- Cobertura com o comando do CI (`test:core --coverage`), `coverage:critical` e mutation guard.
- E2E `critical-flows` e `rem21-014` na candidata; `certify` integrado.
- Crítico de código independente (contexto novo), até duas rodadas.
- Não autoriza deploy, produção, dado real, IdP ou conta real, nem release.

## 11. Riscos

- **Cadeia de suprimento (P1).** Três pacotes novos no runtime da API. Mitigação: versão exata, `npm audit`, licença MIT, SBOM, API reconferida no BUILD (inclusive `enableNonRepudiationChecks`).
- **Boot depende do IdP.** IdP fora no boot impede a API de subir (SPEC0152 §3). Sessões existentes não dependem dele depois do boot.
- **Deriva de role trava o login (P3).** Uma troca de grupo no IdP sem subir N recusa o login até nova versão da matriz. Em teste é inofensivo; na 0254-C pode virar atrito operacional.
- **Rollback de matriz (P5).** Voltar a uma matriz anterior exige publicá-la com N maior; com N menor, quem já logou na versão maior fica recusado até nova versão.
- **Principal ativo sem login.** Quem sai de todos os grupos do IdP não é desativado até tentar logar; continua elegível a grant. Sessões duram ≤ 15 min.
- **Role antiga fora das rotas de caso.** Depois de desativação ou troca de role, rotas fora de caso aceitam a sessão antiga até expirar (≤ 15 min). Fica na UP91-026.
- **Acúmulo de linhas** de sessão e state sem purga (SPEC0149).
- **`openssl` no teste.** O CI precisa do binário. O runner é `ubuntu-latest` (`.github/workflows/verify.yml:20`), que traz `openssl`. Ausente, o teste falha em vez de pular.
- **Produção sem caso (P7).** Até a 0254-C, nenhuma composição fora de teste lê casos; o ensaio C8 segue 503 nas rotas de caso, tasks e approvals.
- **`scope=openid`** pode não trazer grupos num IdP real; fica para a 0254-C.
- **JWKS.** Um `kid` desconhecido dispara no máximo uma nova busca por minuto (cache de 60 s); o limite do callback (30/min por IP) reduz o tráfego ao IdP. Rotação de chave no IdP só vale no app depois de 60 s.
- **Operador opaco.** O Supervisor precisa do `operatorId` (`oidc_<hash>`) para conceder caso; sem diretório, o operador informa o próprio ID.

## 12. Premissas e decisões do usuário

### 12.1 Decisões de 22/10 aplicadas

Registro: [user-decisions-20261022.json](../04_audit/evidence/UP91-025-OIDC-20261022/user-decisions-20261022.json). Nenhuma premissa nova fica pendente nesta revisão.

- **P1 (usuário) — `openid-client` autorizado:** 6.x mais recente sem advisory na data do BUILD, versão exata registrada no BUILD com a API reconferida (inclusive `enableNonRepudiationChecks`), claim próprio de lockfile, BUILD só depois do APPROVE do crítico (§4.2, §6).
- **P2 (usuário) — grupos alheios ignorados:** só contam os grupos da matriz; o login falha com zero ou mais de um grupo elegível, ou com entrada inativa (§4.4).
- **P3 (usuário) — regra literal:** deriva de role sob o mesmo N recusa sem escrita (§4.5, linha 9). A SPEC0176 não muda.
- **P4 (usuário) — o login só pode reduzir:** a linha 4 desativa e recusa; o login pode tirar acesso, nunca dar nem trocar role. Leitura explícita da SPEC0176 `:52` (§4.5).
- **P5 (lead) — versão inteira crescente:** `matrix.version` define a ordem; recusa sem escrita quando a versão do principal é maior que a vigente; "versão nova" = N maior que o do principal; o boot recusa matriz editada sem subir N, lendo `case_principals` sem estado novo (§4.1, §4.5 linhas 3 e 7, §4.8 passo 6).
- **P6 (lead) — credencial de migração no serving só em teste:** no modo OIDC de teste o serving recebe `DATABASE_MIGRATION_URL`; em produção continua proibido (SPEC0144 `:54`) (§4.1, I5).
- **P7 (lead, informativo):** até a 0254-C, nenhuma composição fora de teste lê casos; o ensaio C8 com HMAC segue com 503 nas rotas de caso (§5, §11).

### 12.2 Defaults propostos (sem decisão nova; o crítico deve conferir)

- **D2** prazos: sessão ≤ 15 min e ≤ `exp` (CHECK atual), pendente e state 5 min, `auth_time` ≤ 5 min e `max_age=300`. Justificativa: são os valores já no banco e no código (R2.5, R4.1); sem refresh token, o login fresco com MFA é a única renovação.
- **D3** limites: start 10/min e callback 30/min por IP, além do global de 300/min. Justificativa: valores dos ramos revisados de 28/09 (R3.3).
- **D4** MFA sintética: `amr` com `pwd` e `otp` (RFC 8176) e TOTP RFC 6238 (SHA-1, 30 s, 6 dígitos) no IdP sintético. Justificativa: é a política já codificada (`oidc-identity.ts:67-74`), agora configurável; os valores reais vêm do pacote IAM na 0254-C.
- **D5** chaves: RSA 2048 RS256 por execução; certificado TLS efêmero por `openssl`; nada versionado. Chave do cookie pendente única; trocar a chave equivale a uma drenagem de 5 min (pendentes antigos dão 401). Justificativa: nenhuma chave no repositório nem no allowlist do gitleaks; a vida curta do pendente dispensa rotação com duas chaves.
- **D6** discovery: endpoints na origem do issuer; `client_secret_basic` declarado; RS256; timeout 5 s. Justificativa: é o primeiro contrato da SPEC0152 §2; a allowlist de hosts distintos fica para a 0254-C, com o IdP real.
- **D7** todo login cria família nova; a sessão anterior do navegador é aposentada por `switchIdentity`; cookie operacional inválido no start é apagado e ignorado (os ramos de 28/09 respondiam 401). Justificativa: reaproveita a troca atômica da AUD-0603 e evita um primeiro clique falho com cookie velho.
- **D8** falhas do callback em JSON; só o sucesso redireciona. Justificativa: prova simples nesta fatia sem navegador; a 0254-B pode mudar para redirecionamento de erro no console.
- **D10** token HMAC recusado no modo OIDC. Justificativa: SPEC0152 ("tokens de bootstrap nunca criam identidade operacional nesse modo"); recusar é mais simples de provar que ignorar.
- **D11** CSRF por `Origin` só no modo OIDC nesta rodada. Justificativa: o modo HMAC serve ao ensaio C8 e ao E2E `rem21-014`; mudar o dele é da 0254-B.
- **D12** classificação 401/503 pelo invólucro de transporte (§4.2). Justificativa: não depende dos códigos internos da biblioteca; JWKS fora vira 503, e não 401.
- A antiga D1 (versão por digest) foi substituída pela P5, e a antiga D9 (desativação) pela P4.

### 12.3 Atos do usuário que esta SPEC não assume

- escolher o IdP do hospital e fornecer o pacote IAM (issuer, client, MFA, grupos, matriz);
- autorizar a 0254-B e a 0254-C;
- fazer o merge do PR do BUILD;
- qualquer deploy, uso por equipe, dado real ou conta real.
