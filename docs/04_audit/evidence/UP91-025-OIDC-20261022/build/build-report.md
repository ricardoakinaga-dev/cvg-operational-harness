# BUILD local da SPEC0254 r2 — UP91-025, fatia A (login OIDC com IdP sintético, produtor verificado de `case_principals`, store PG no entrypoint)

- **Task:** `UP91-025-OIDC-20261022`. **SPEC:** [`0254_oidc_login_case_principals.md`](../../../../02_spec/0254_oidc_login_case_principals.md), r2, sha256 `3c804dc22c34b736b6d0c6bb5d683b6144a1d7d34dd083d33926d34afef49694` (conferido antes do BUILD e no fim; a SPEC não mudou).
- **Autoridade:** [aprovação do crítico (r2, APPROVE)](../spec-approval.json), [decisões de 22/10](../user-decisions-20261022.json) (P1 `openid-client` 6.x; P2–P7 aplicadas na SPEC). Notas de BUILD R2-O1..R2-O7 incorporadas (§ "Notas R2-O*").
- **Worktree:** `/mnt/dados/cvg-work/cvg-d9ef-up91025-20261022` (detached), base `693fec0ef` (docs da SPEC) sobre a `main` `420b97b33`. Node 22.23.2 (`env -i`).
- **Commits locais (sem push, sem PR):**
  - `ad9b1aefa` — BUILD (código, testes O1–O12, dependência, governança);
  - `aa91c86f8` — opcionais da revisão de código r1 (provas novas e uma mensagem de erro);
  - `37687e92f` — opcionais da revisão de código r2 (só teste);
  - commit desta evidência (pasta `build/`).
- **Não concedido e não feito:** deploy, produção, release, dado real, IdP ou conta real, provider. NO_MODEL. Nenhuma migration.

## 1. O que mudou

### Produção (`apps/api/src`)

| Arquivo | Mudança |
| --- | --- |
| `oidc-config.ts` (novo) | §4.1: `parseOperatorLoginConfig(env)` sem I/O. Modo `CVG_OPERATOR_LOGIN` (vazio, `oidc` ou recusa); configuração parcial recusa; só `NODE_ENV=test`; exige `trusted`, `postgres`, RLS, `DATABASE_MIGRATION_URL` com papel distinto do runtime e da sessão (P6); recusa keyring HMAC e `CVG_LOCAL_OIDC_*`; valida issuer (`https:`, sem usuário, query ou fragmento), client, segredo (≥ 32, sem placeholder), redirect (caminho exato, `https:` ou `http:` em 127.0.0.1/localhost), console (origem válida, na allowlist, diferente do issuer), chave do pendente (base64url canônico de 32 bytes), política MFA e matriz (JSON estrito, versão inteira 1..999999999, claim fora dos registrados e de `__proto__`/`constructor`/`prototype`, 1..256 entradas, grupo único). `authorityVersion = oidc-v<N>-<sha256(canonicalizeJson({issuer, clientId, mfaPolicy, groupMatrix}))>`, com `entries` ordenadas por grupo e `requiredAmr` ordenado (R2-O5). Mensagens nomeiam a variável, nunca o valor. |
| `oidc-authority.ts` (novo) | §4.2: `discovery` com `ClientSecretBasic`, `id_token_signed_response_alg: 'RS256'`, `execute: [enableNonRepudiationChecks]`, timeout 5 s e `customFetch` = invólucro D12; recusa issuer diferente byte a byte, endpoints fora de `https:` ou da origem do issuer, metadados sem `code`/`S256`/`client_secret_basic`/`RS256`, e erro ou timeout no discovery. `authorizationCodeGrant` com `pkceCodeVerifier`, `expectedNonce`, `expectedState`, `idTokenExpected: true` e `maxAge: 300`. O invólucro marca "indisponível" por chamada com `AsyncLocalStorage` (R2-O2) em erro de rede/TLS/timeout, HTTP ≥ 500 ou 429 (R2-O7) → 503; qualquer outro erro → 401. Transporte injetado só com `NODE_ENV=test`. |
| `oidc-routes.ts` (novo) | §4.3 e §4.7: `POST /v1/auth/oidc/start` (Origin exato num `onRequest` da rota, corpo ausente ou `{}`, limite 10/min por IP, cookie operacional válido vira `previousSessionId`, inválido é apagado) e `GET /v1/auth/oidc/callback` (limite 30/min; alvo ≤ 4096 e caminho exato; state único e code xor error; state validado e consumido antes da troca; produtor antes da sessão; `switchIdentity` com sessão anterior; 303 para o console). 401 com corpo único "Operator login failed"; motivo só no log (`reasonCode`). `no-store` em toda resposta das duas rotas, inclusive as dos hooks globais. Rota HEAD do callback desligada. Hooks do modo OIDC: token HMAC → 401 sem `Set-Cookie` (fora das probes, qualquer valor); mutação com o nome do cookie operacional exige `Origin` único igual ao do console (403), com o mesmo corte do parser (e também por `,`, ver desvio 2). |
| `case-principal-producer.ts` (novo) | §4.5: tabela de nove linhas, CAS com uma releitura, `verified_adapter`, 401/503 com `reasonCode`. Único chamador de `applyVerifiedPrincipalState` fora de fixtures. |
| `oidc-identity.ts` | §4.4: `mapVerifiedOidcIdentity(claims, policy)` substitui o mapeador de caminho. MFA por `requiredAmr`; grupos só como propriedade própria (`Object.hasOwn`, R2-O1); P2; `inactive_group` vai ao produtor; `operatorId`, `expiresAt` e `proofRef` como a SPEC. |
| `oidc-login-transaction.ts` | `previousSessionId` opcional selado no pendente (AES-256-GCM, mesma AAD). |
| `operator-session-hook.ts` | isenta `/v1/auth/oidc/start` e `/v1/auth/oidc/callback` (§4.6). |
| `production-bootstrap.ts` | §4.8 passos 1–3: valida o login, compõe store PG de sessão e `PostgresOidcLoginStateStore` no mesmo pool quando `production` **ou** `CVG_OPERATOR_LOGIN=oidc`; a recusa de `DATABASE_MIGRATION_URL` fica só em `production`; discovery antes do `buildServerFromEnv`. |
| `server.ts` | opções `operatorLogin`/`oidcTransport`; recusas de composição lendo `process.env` (I3, I4, I6, versão divergente, trusted e store exigidos); hooks do modo OIDC entre o hook HTTP e o de sessão; rotas; `GET /v1/session` só por cookie no modo OIDC; ramo OIDC de `buildServerFromEnv` (recusa sem os stores ou com composição divergente) e checagem de versão por tenant da matriz (P5) antes de devolver o app; resumo de boot sem segredo. |

### Persistência

- `packages/persistence/src/case-authority.ts`: `CaseReadSnapshot.hasPrincipalVersionMismatch(prefix, current)` na interface e na memória (fila serial).
- `packages/persistence/src/case-authority-postgres.ts`: o mesmo em SQL na conexão do snapshot (`left(authority_version, length($2)) = $2 AND authority_version <> $3`, sob RLS do tenant). `case-authority-memory-state.ts` não precisou mudar.

### Dependência (P1)

- `openid-client` **6.8.8** exato em `apps/api/package.json` (6.x mais recente; publicada em 2026-09-05; MIT; sem advisory). Transitivas no lockfile: `oauth4webapi` 3.8.8 (2026-09-05, MIT) e `jose` **6.2.12** (2026-09-05, MIT), ver desvio 1.
- Allowlist `docs/03_build/0305_repository_target_structure.json` (`apps/api.allowed_dependencies`) ganhou `openid-client`.
- API reconferida na versão pinada (detalhe em `build.json`): `discovery` (`index.d.ts:925`), `ClientSecretBasic` (`:122`), `customFetch` (`:524`), `Configuration.timeout` (`:1149-1153`), `enableNonRepudiationChecks` (`:1530`; `index.js:750` liga `nonRepudiation`, `index.js:963` o chama no `authorizationCodeGrant`), `authorizationCodeGrant` e checks (`:1814`, `:1910`), comparação normalizada do issuer pela biblioteca (`index.js:287`); `oauth4webapi` 3.8.8: cache do JWKS expira em 300 s (`index.js:1036`) e `kid` desconhecido só rebusca com cache ≥ 60 s (`index.js:1093`).

### Governança e documentos

- `package.json`: `test:postgres` com `oidc-login-postgres.test.ts` e `oidc-login-entrypoint-postgres.test.ts`.
- `scripts/skip-catalog.json`: `SKIP-PG-041` (6 testes) e `SKIP-PG-042` (2 testes), com o sha256 final dos arquivos.
- `.env.example`: variáveis novas comentadas, marcadas "TEST ONLY".
- `docs/02_spec/0107_contratos_de_api.md`: adendo com as duas rotas e as regras do modo OIDC (§4.11).

### Testes

Novos: `oidc-login-config.test.ts` (O1), `oidc-authority.test.ts` (O2), `oidc-login-routes.test.ts` (O3, O4, O5, O11 e a parte de rota do O6), `case-principal-producer.test.ts` (O6 em memória), `oidc-login-guards.test.ts` (O7, O8), `oidc-login-postgres.test.ts` (O6 em PG e O9), `oidc-login-entrypoint-postgres.test.ts` (O10), `oidc-login-boundary.test.ts` (O12) e o suporte `__tests__/support/synthetic-oidc-issuer.ts` (IdP sintético em memória e HTTPS com CA efêmera gerada por `openssl`, RSA 2048 por execução, TOTP RFC 6238, controles negativos) e `__tests__/support/oidc-postgres-fixture.ts` (papéis e schemas como em `production-bootstrap-postgres-own.test.ts:59-130`, sem o stub de produção).

## 2. Provas (§7)

| ID | Onde | Resultado final |
| --- | --- | --- |
| O1 | `oidc-login-config.test.ts` (99 testes) + casos de configuração do O10 | verde; cada variável ausente ou inválida, parcial, `production`, `development`, memória, RLS, migração, keyring, `CVG_LOCAL_OIDC_*`, issuer, redirect (inclusive `[::1]`), console, chave 31/33/não canônica, segredo curto ou placeholder, política e matriz (inclusive `__proto__`, `constructor`, `prototype`, 257 entradas e versões 0, −1, 1,5, `"3"`, 1000000000, `null`), store ausente e composição divergente, pelos dois construtores, recusam antes de qualquer pool e sem segredo na mensagem |
| O2 | `oidc-authority.test.ts` (34) | verde; issuer diferente e só normalizado (maiúsculas, `:443`, barra final), endpoints fora da origem ou `http:`, capacidades ausentes, IdP fora, IdP lento (recusa entre 4,5 e 7,5 s), transporte fora de teste; versão com N, muda com issuer/client/política/matriz/claim, não muda com segredo, redirect, console, chave, ordem das entradas nem ordem do `requiredAmr` |
| O3 | `oidc-login-routes.test.ts` | verde; start → authorize com senha + TOTP → 303, cookie `HttpOnly; SameSite=Strict; Path=/` com `Max-Age` ≤ 300 (`exp` do IdP), pendente apagado, 1 chamada a `token` e 1 a `jwks`; `GET /v1/session` só com cookie; Supervisor 200 em `/v1/cases` e `/v1/tasks` (503 sem login OIDC); principal revisão 1, `verified_adapter`, V; segundo login sem revisão nem audit; caminho feliz também pelo IdP HTTPS com CA efêmera |
| O4 | idem | verde; `Origin` ausente, `null`, irmã, `http:`, repetida → 403 antes do corpo (inclusive JSON malformado) e sem state; corpo não vazio → 400; 11ª chamada → 429; store de state fora → 503; cookie expirado, desconhecido, malformado, vazio ou duplicado → 200 com o cookie apagado e sem revogação; cookie válido → sessão anterior aposentada |
| O5 | idem | verde; corpo de 401 idêntico; zero chamadas a `token` nas recusas antes da troca (parâmetros, alvo > 4096, pendente ausente, adulterado, duplicado, de outro client, com mais de 5 min, state divergente, `error` do IdP, replay); sequência state divergente → 401 e depois 303 com o mesmo code; assinatura (outra chave com `kid` conhecido, `kid` desconhecido, `none`, `HS256`); claims (`iss`, `aud`, `azp`, `nonce`, `exp`, `auth_time`, `amr`, grupos ausentes, escalar, aninhados, não-string, sem grupo da matriz, dois elegíveis, poluição de protótipo); TOTP errado sem code; code reusado; segredo errado → 401; token 500/429, JWKS 500/fora (configuração nova) e IdP fora → 503; state store fora no callback → 503 com pendente mantido; 31ª chamada → 429 sem tocar o pendente; rotação de chave |
| O6 | `case-principal-producer.test.ts` (22), `oidc-login-routes.test.ts`, `oidc-login-postgres.test.ts` | verde; as nove linhas em memória e em PG (inclusive `synthetic_fixture` já na versão vigente), CAS com uma releitura, dois conflitos → 503 sem sessão, falha de escrita → 503 sem sessão, falha do store de sessão → 503 com o principal já corrente, dois callbacks simultâneos → revisão 1 e duas sessões (memória e PG), `hasPrincipalVersionMismatch` com tenant adversário isolado (memória e PG) |
| O7 | `oidc-login-guards.test.ts` | verde; recusas I3, I4 (`development` e `production`), I6, versão divergente, trusted e store exigidos; fixture em `test` aceita; guarda HMAC trusted segue falhando fechado (503; 403 para Operator/Approver no registro, desvio 3) |
| O8 | idem | verde; mutações com cookie (task, status, atribuição, logout) sem `Origin` exato → 403 sem efeito; cookie malformado, repetido, vazio, sem `=`, com espaços e em array; cookie de formato válido e sessão inexistente (prova a ordem dos hooks); `Origin` exato segue o fluxo; webhook sem cookie igual ao modo sem login; `x-cvg-operator-token` (inclusive vazio) → 401 sem `Set-Cookie`; probes livres; `GET /v1/session` só por cookie |
| O9 | `oidc-login-postgres.test.ts` (6) | verde (PG próprio); grants por tenant/role/caso; linha `verified_adapter`, `oidc-v1-<64 hex>`, `proof_digest` de 64 hex; deriva recusada; entrada desativada corta a sessão aberta nas rotas de caso; versão: N=3 → matriz editada com N=3 recusa o boot → N=4 sobe, sessão antiga 401, novo login atualiza → N=2 sobe, login recusado sem escrita, rotas de caso 401; checagem por tenant (principal só no tenant B) |
| O10 | `oidc-login-entrypoint-postgres.test.ts` (2) | verde; `tsx apps/api/src/main.ts` com PG e IdP HTTPS (`https://localhost:<porta>`, CA efêmera em `NODE_EXTRA_CA_CERTS` só do filho; API em `http://127.0.0.1:3456`): login 303, recarga só com cookie, Supervisor 200, reinício mantém a sessão, novo login aposenta o cookie anterior, logout sem `Origin` 403 e com `Origin` 200, `exp` de 5 s → 401, papel de sessão sem login e conexões encerradas → 503 na rota e no callback sem `Set-Cookie`, recuperação e conclusão do mesmo login; dez configurações inválidas saem com 1 antes de `listen`, sem discovery e sem segredo |
| O11 | asserções `findLeaks`/`assertNoLeaks` em O3–O10 | verde; nenhum code, state, nonce, verifier, `code_challenge`, ID token, access token, segredo, chave, `sub`, grupo, senha, segredo TOTP ou TOTP em resposta (exceto o corpo 200 do start), header, log de runtime, telemetria, audit (memória e PG) ou saída do processo filho |
| O12 | `oidc-login-boundary.test.ts` (4) | verde (e verde na base); nenhum import do suporte fora de `__tests__`; build de runtime exclui `__tests__`; nenhum `NODE_EXTRA_CA_CERTS`, `ca:` ou contexto TLS em produção; nenhum uso do opt-in de HTTP inseguro |

**First red:** [`first-red.json`](first-red.json) — 157 testes na base, 150 vermelhos pelo motivo certo, 7 guardas verdes (O12 e três guardas de O7/O8); quatro arquivos falham no import (módulos inexistentes) e a sonda [`first-red-probe.test.ts.txt`](first-red-probe.test.ts.txt) mostrou `start`/`callback` 404 na base, em processo e com PG.

**Verde final:** todos os testes focais (incluindo os de PG) passam sobre `aa91c86f8` (324/324) e sobre `37687e92f` (resultado da cobertura, abaixo). Os dois arquivos PG pedidos pela revisão r2 (`oidc-login-postgres`, 6; `oidc-login-entrypoint-postgres`, 2) estão verdes nessas execuções.

## 3. Mutantes (§8)

[`mutants.json`](mutants.json), runner [`mutants-runner.py`](mutants-runner.py): cada mutante aplicado sozinho (âncora com contagem 1), teste citado executado, bytes restaurados e sha256 conferido contra o blob de HEAD.

- **M1–M29 da SPEC + M30 (R2-O1): 30/30 mortos**, sobre `aa91c86f8`. M13 e M24 editam transação e rotas (desvio 7). M25 morre pelo O9 (matriz editada com N=3 sobe); M20 morre pelo O4 em memória e, no PG, pelo O10 (C9 do crítico).
- **Mutantes do crítico r1:** C2–C6 mortos depois dos opcionais da r1; C7–C9 já morriam na r1; **C1 (sem `maxAge: 300`) é equivalente**: o mapeador exige `auth_time` e `auth_time ≥ agora − 300`, mais forte que a biblioteca (que aceita até 30 s de folga); as duas recusas dão o mesmo 401.
- **Mutantes da r2:** R1 (sem comparar a origem do console da composição) e R2 (`[::1]` de volta) mortos sobre `37687e92f`.

## 4. Gates (§10), Node 22

| Gate | Comando | Resultado |
| --- | --- | --- |
| prettier | `npx prettier --check <tocados>` | OK (o `.env.example` não tem parser no prettier) |
| lint | `npm run -s lint` | exit 0 |
| typecheck | `npm run -s typecheck` | exit 0 |
| skip:governance | `npm run -s skip:governance` | PASS (0 falhas); `certification/skip-inventory.json` reescrito e restaurado aos bytes de HEAD, não commitado |
| docs:check-links | `npm run -s docs:check-links` | DOC_LINKS_OK, EVIDENCE_HYGIENE_OK |
| licenses:check | `npm run -s licenses:check` | exit 0: 385 pacotes, 0 negados, 0 sem classificação; `certification/license-report.json` restaurado, não commitado |
| sbom | `npm run -s sbom` | exit 0: 385 componentes; `openid-client` 6.8.8, `oauth4webapi` 3.8.8 e `jose` 6.2.12, todos MIT; `certification/sbom.cyclonedx.json` restaurado, não commitado |
| npm audit | `npm audit`, `npm audit --omit=dev`, `npm audit --audit-level=high` | **1 low preexistente e fora do delta**: `fastify` 5.12.5, GHSA-389g-gv7q-r4x8 (a base `693fec0ef`/`420b97b33` e `origin/main` têm o mesmo); 0 moderate/high/critical; nenhum dos três pacotes novos acusa nada. O lead trata o fastify em PR próprio. O gate `security` do `certify` exige "found 0 vulnerabilities" e falha por essa vulnerabilidade até o PR do fastify entrar |
| focais | 12 arquivos OIDC + ajustados, com PG | 324/324 sobre `aa91c86f8`; `oidc-login-config` 99/99 sobre `37687e92f` |
| suítes `apps/api` + `packages/persistence` + `tests/repository-structure.test.js` | `npx vitest run apps/api packages/persistence tests/repository-structure.test.js` (sem PG) | 971 verdes, 185 pulados (PG), 0 falhas (sobre o BUILD) |
| test:postgres | `npm run test:postgres` (PG próprio 127.0.0.1:56270) | 337/337 em 42 arquivos (sobre o BUILD) |
| cobertura | `CVG_TEST_SCOPE=core CVG_COVERAGE_PER_FILE=1 TEST_DATABASE_URL=… npm run test:core -- --coverage` (comando do CI, com PG) | exit 0 sobre `37687e92f`: 501 arquivos verdes e 1 pulado; 6899 testes verdes e 1 pulado; agregado 94,35% statements, 91,02% branches, 95,87% functions, 95,18% lines (limiares 90/85/90/90) e gate por arquivo do núcleo verde. Arquivos novos: `case-principal-producer.ts` 100/100, `oidc-identity.ts` 100/98,46, `oidc-config.ts` 96,66/97,58, `oidc-routes.ts` 94,37/92,47, `oidc-authority.ts` 92,85/89,74 (statements/branches). Duas execuções anteriores falharam por ambiente (§6, item 8); detalhe em [`logs/gates.json`](logs/gates.json) |
| coverage:critical | `npm run coverage:critical` | PASS: global 94,36/91,02/95,88/95,19; grupos críticos (branches ≥ 95%) kernel 100, approval 99,44, policy 99,07, journal 98,52, channel 97,28, rls 97,19; relatório restaurado, não commitado |
| mutation guard | `npm run mutation:guard` | PASS: 10/10 mutações do manifesto mortas; relatório restaurado, não commitado |
| E2E | `npx vitest run tests/e2e/critical-flows.test.ts`; `CVG_API_PORT=3456 CVG_WEB_PORT=4456 npm run test:e2e:rem21-014`; `CVG_API_PORT=3456 CVG_WEB_PORT=4456 npx playwright test` | critical-flows 1/1; rem21-014 PASS 18/18 (chromium, firefox, webkit, 6 cada), relatório restaurado e não commitado; Playwright 12/12; sem ajuste de asserção |
| gitleaks | `gitleaks dir` (8.28.0, `.gitleaks.toml` do repo) sobre os arquivos do diff e sobre esta pasta | no leaks found |
| certify integrado | — | **não rodado localmente** (ver §7) |

## 5. Revisão de código independente

- **r1** ([`code-review-r1/`](code-review-r1/review.md)) sobre `ad9b1aefa`: **APPROVE, sem obrigatórios**; 12 opcionais; os sete desvios aceitos; mutantes C1–C9.
- Opcionais incorporados em `aa91c86f8`: O1 (ordem dos hooks), O3 (token vazio), O4 (checagem por tenant), O5 (cláusula de origem da linha 7), O6 (Origin antes do parse), O9 (mensagem própria de composição divergente), O10 (sem discovery nas configurações inválidas do entrypoint), O11 (`[::1]` fora do redirect), O12 (`Max-Age` do cookie). O2 registrado (C1 equivalente). O7 registrado como resíduo da 0254-C (§6). O8 é esta evidência.
- **r2** ([`code-review-r2/`](code-review-r2/review.md)) sobre `aa91c86f8`: **APPROVE, sem obrigatórios**; pediu o verde de PG de `oidc-login-postgres` (6) e `oidc-login-entrypoint-postgres` (2) sobre `aa91c86f8` (§2 e §4) e trouxe R2-O1 (isolar a origem do console no teste de divergência) e R2-O2 (provar o `[::1]`), incorporados em `37687e92f` (só teste) com os mutantes R1 e R2 mortos. Por regra, não houve terceira rodada; o delta de `37687e92f` é só teste e está coberto pelos mutantes R1/R2.

## 6. Desvios, escolhas e resíduos

1. **`jose` 6.2.12 no lockfile.** O `^6.2.12` do `openid-client` resolveria 6.2.13, publicada em 20/10/2026 (dois dias antes), sem correção de segurança nas notas. Fixei a 6.2.12 (a que o crítico da SPEC usou) editando a entrada do lock com a integridade do registry; provado com `npm ci` e `npm audit`. Aceito na r1.
2. **Tokenizador do CSRF corta também por `,`.** O `inject` junta cabeçalho em array com `,`; o corte extra só pode exigir `Origin` a mais, nunca a menos. A função também trata array de verdade. Aceito na r1.
3. **Guarda O7 "503 para todas as roles".** Na base, Operator/Approver recebem 403 em `/v1/cases` (permissão do registro antes do escopo, `case-routes.ts` sem mudança). O teste exige 503, e 403 nesses dois casos: segue falha fechada. Correção do teste registrada no first red. Aceito na r1.
4. **O9 compõe por `buildApiWithProductionSessions`**, que chama `buildServerFromEnv` (os stores PG vêm do bootstrap, §4.8 passo 2). `buildServerFromEnv` chamado direto no modo OIDC sem os stores recusa (O1). Aceito na r1.
5. **`no-store` nos 403 de CSRF.** Exigido nas respostas do próprio hook (sem `Origin`, origem irmã); `Origin` nula, `http:` e repetida são recusadas antes pelo hook HTTP existente. Nas duas rotas de login, um `onSend` garante `no-store` também nessas respostas. Aceito na r1.
6. **`fastify` com 1 low preexistente** (ver gates). Fora do delta e do P1; o lead trata em PR próprio.
7. **M13 e M24 em dois arquivos** (o consumo do state mora na transação). Aceito na r1.
8. **Execuções de cobertura repetidas por ambiente.** (a) A primeira, sobre `aa91c86f8`, falhou em três arquivos PG de `packages/persistence` fora do delta (timeouts de 10–20 s em `channel-effect-journal-postgres`, `session-version-pinning-postgres` e `attendance-approval-postgres`, com outro processo de teste rodando em paralelo); os três passam isolados e com cobertura (15/15) e passaram no `test:postgres` (337/337). (b) A segunda falhou em 14 testes de processo filho e em `workspace-dependency-manifest` por dois problemas meus de ambiente: o `npx tsc -b tsconfig.json` da receita de E2E gerou `.js`/`.d.ts` nas pastas `src` (ignorados pelo git) e o IPC do `tsx` usa socket Unix em `$TMPDIR`, cujo caminho no scratchpad passa do limite de 108 bytes (colisão `EADDRINUSE`). Apaguei todos os artefatos gerados (todos com o horário daquela execução) e a execução final usou o `TMPDIR` padrão (`/tmp`): 6899/6899 verdes, 1 pulado. Os testes OIDC de processo filho passam o ambiente do filho sem `TMPDIR`.
9. **Resíduos para a 0254-C** (além dos da §5 da SPEC): RFC 9207 — `complete()` remonta o callback sem `iss`; um IdP que anuncie `authorization_response_iss_parameter_supported` recusaria todo login (falha fechada); repassar o `iss` recebido e deixar a biblioteca validar (opcional O7 da r1). O resumo de boot e os logs de login vão à telemetria (`operator_login.*`), sem segredo.

## 7. O que não rodou e o que só o CI ou as fatias B/C provam

- **`certify` integrado:** não rodado localmente. Duração estimada acima de uma hora e meia (refaz unit, cobertura, PG, E2E e cadeia de certificação), e o gate `security` dele falharia hoje pelo fastify preexistente. Fica para o CI, depois do PR do fastify.
- **Só o CI:** gitleaks no histórico com `fetch-depth: 0`, CodeQL, Trivy e o `ci-bar` completo no runner `ubuntu-latest` (inclui `openssl`, exigido pelo IdP HTTPS sintético; sem ele o O10 e um caso do O3 falham em vez de pular).
- **Fatia B (0254-B):** console com botão de login, transporte cross-origin (CORS com credenciais, `__Host-`, origem fixa no bundle, NGINX, CSP), Chromium com console, API e IdP em hosts HTTPS distintos, CSRF no modo HMAC, defesa contra cookie tossing do pendente.
- **Fatia C (0254-C):** IdP real do hospital, valores reais de MFA e grupos, allowlist de discovery, DNS público, cofre, CA interna, staging; conciliar `CVG_OPERATOR_LOGIN` com o discriminante da SPEC0151/0152; limite do start atrás de NAT; RFC 9207 (resíduo 9 acima).
- O cartão UP91-025 continua aberto (hosts distintos na B, produção na C). Nenhum ledger, cartão, runtime state ou coordenação foi alterado nesta rodada.

## 8. Testes existentes ajustados (sem afrouxar asserção)

| Arquivo | Ajuste |
| --- | --- |
| `apps/api/src/__tests__/oidc-identity.test.ts` | Reescrito para `mapVerifiedOidcIdentity` (o mapeador de grupo por caminho foi removido, §4.4/§6). Mantidos: identificador estável por `iss`/`sub`, teto de 15 min, `exp` mais curto, multi-audiência com `azp`, e todos os negativos (issuer, audiência, multi-audiência sem `azp`, `azp` errado, `sub` vazio, expirado, `iat` futuro, autenticação velha de 301 s, `auth_time` ausente ou futuro, sem OTP, sem senha, sem MFA, duas roles, dois tenants, grupo não-string, entrada nula). Os casos de caminho (`tenant malformed`, `role unknown`) viraram casos de matriz (sem grupo elegível, grupo de caminho ignorado), e o de `maxAuthenticationAgeSeconds` (opção removida; a idade é fixa em 300 s) virou relógio inválido e client vazio. Ganhou asserção do `reasonCode` em cada recusa e casos novos (`sub` > 255 bytes, `iat` fracionário, `amr` não-array ou com não-string, > 256 grupos, grupo > 256 caracteres, propriedade herdada, P2, entrada inativa, `requiredAmr` configurável). |
| `apps/api/src/__tests__/oidc-login-transaction.test.ts` | +1 teste (`previousSessionId` selado; inválido recusado). Nenhuma asserção existente mudou. |
| `apps/api/src/__tests__/production-bootstrap-own.test.ts` | +1 teste (stores PG de sessão e de state no modo OIDC de teste com `DATABASE_MIGRATION_URL`; produção sem store de state). Nenhuma asserção existente mudou. |

`operator-session-hook.test.ts` não precisou de ajuste: a isenção das rotas de login é provada pelo O4 (cookie expirado no start → 200, não o 401 do hook).

## 9. Ambiente e limpeza

- PostgreSQL descartável próprio `cvg-d9ef-up91025-pg` (`postgres:16-alpine`, `127.0.0.1:56270`), removido ao final. API dos testes de entrypoint e do E2E na porta 3456, web 4456. Nenhum `pkill -f`.
- Chaves, certificados, senhas e segredos TOTP só gerados em tempo de teste (diretório temporário removido ao fechar o IdP HTTPS); nenhum material versionado.
- Arquivos de `certification/` reescritos por gates foram restaurados aos bytes de HEAD e não entram em commit.
