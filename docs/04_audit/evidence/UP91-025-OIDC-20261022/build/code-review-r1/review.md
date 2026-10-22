# Revisão de código independente r1 — BUILD da SPEC0254 r2 (UP91-025, fatia A)

- **Commit revisado:** `ad9b1aefa545269f39bfffaba34a69888357590d`, diff `693fec0ef..ad9b1aefa` (31 arquivos).
- **SPEC:** `docs/02_spec/0254_oidc_login_case_principals.md`, r2, sha256 `3c804dc22c34b736b6d0c6bb5d683b6144a1d7d34dd083d33926d34afef49694`. Conferi o hash antes e depois da revisão.
- **Autoridade lida:** `spec-approval.json` (notas R2-O1..R2-O7), `user-decisions-20261022.json`, `spec-review-r2/review.md`, `recon.md` e a evidência parcial em `build/`.
- **Worktree:** `/mnt/dados/cvg-work/cvg-d9ef-up91025-20261022` (detached). Node 22.23.2. PostgreSQL descartável do executor em `127.0.0.1:56270`. Porta 3456 só para o O10.
- **Crítico:** Claude Code, contexto novo, separado do executor. Data: 22/10/2026.
- **Escrita:** só estes dois arquivos. Nenhum commit, push, PR ou deploy. Todos os mutantes foram restaurados e conferidos por sha256 (ver "Conferências").

## Veredito: `APPROVE`

Nenhum obrigatório.

- O código cumpre I1–I12 e §4.1–§4.11.
- As provas O1–O12 existem e testam o que a SPEC pede. Rodaram verdes, inclusive as de PG e o entrypoint real.
- Os mutantes M1–M30 morrem. Reapliquei M11, M13, M19, M20, M23, M24, M25, M27, M28 e M30, e todos morrem pelo motivo certo.
- O conjunto de escrita é exatamente o §6 da SPEC.
- Os sete desvios declarados foram aceitos.

Propus nove mutantes próprios (C1–C9). Três morrem. Seis sobrevivem, mas nenhum desses abre falha de segurança: o comportamento correto já está no código e, em todos, o resultado continua sendo falha fechada. Eles viram os opcionais O1–O6, que são lacunas de prova.

## Obrigatórios

Nenhum.

## Opcionais

### O1 — A ordem dos hooks da §4.7 não tem prova (C2 sobrevive)

- **Onde:**
  - código: `apps/api/src/server.ts:555-571`;
  - prova: `apps/api/src/__tests__/oidc-login-guards.test.ts:307-334,387-415`.
- **O que acontece:** o código instala os hooks de token e de CSRF depois do hook HTTP e antes do hook de sessão, como a SPEC manda. O mutante C2 põe os dois depois do hook de sessão, e os 72 testes de `oidc-login-guards` e `oidc-login-routes` continuam passando.
- **Por que nenhum teste pega:** o O8 usa só cookie válido ou cookie malformado. Nos dois casos, o hook de sessão deixa a requisição passar.
- **Efeito se a ordem invertesse:** com um cookie de formato válido, mas desconhecido ou expirado, a resposta viraria 401 do hook de sessão, com `Set-Cookie` de limpeza. Seria 401 no lugar do 403 do CSRF e, com o token, um 401 com `Set-Cookie`, o que contraria o I6.
- **Correção mínima:** no O8, acrescentar o cookie `cvg_operator_session=opsess_<43 caracteres>` (formato válido, sessão inexistente) e exigir:
  - `POST /v1/session/logout` sem `Origin` → 403 "Origin is not allowed";
  - `GET /v1/session` com `x-cvg-operator-token` → 401 "Bootstrap tokens are disabled", sem `Set-Cookie`.

### O2 — O `maxAge: 300` da §4.2 é um mutante equivalente (C1 sobrevive)

- **Onde:** `apps/api/src/oidc-authority.ts:219`.
- **O que acontece:** tirar o `maxAge` do `authorizationCodeGrant` não muda nenhum resultado. O mapeador repete a checagem: exige `auth_time` (`oidc-identity.ts:94`) e `auth_time ≥ agora − 300` (`oidc-identity.ts:99`).
- **Correção mínima:** registrar o C1 como equivalente no `mutants.json` do BUILD. Não precisa mudar código.

### O3 — O D10 diz "qualquer valor", mas a prova só usa um valor não vazio (C3 sobrevive)

- **Onde:**
  - código: `apps/api/src/oidc-routes.ts:121`, que já trata o cabeçalho vazio corretamente (`=== undefined`);
  - prova: `oidc-login-guards.test.ts:392-407`.
- **Correção mínima:** acrescentar o caso `x-cvg-operator-token: ''` ao `it.each` do O8.

### O4 — A checagem de versão no boot por tenant não tem prova (C4 sobrevive)

- **Onde:**
  - código: `apps/api/src/server.ts:4618-4636`;
  - prova: `oidc-login-postgres.test.ts:574-653`.
- **O que acontece:** o O9 só grava principais no tenant A. O mutante C4 examina só o primeiro tenant da matriz e passa.
- **Impacto:** nulo em segurança. A linha 3 do produtor recusa o login do tenant B, então o resultado é recusa, nunca acesso.
- **Correção mínima:** num fixture novo, gravar só um principal do tenant B em `oidc-v3-<outro digest>` e subir a matriz N=3. O esperado é o boot recusar com "matrix changed without a higher version".

### O5 — A cláusula "origem ≠ `verified_adapter`" da linha 7 não tem prova (C5 sobrevive)

- **Onde:**
  - código: `apps/api/src/case-principal-producer.ts:87`;
  - prova: `case-principal-producer.test.ts:205-246` e `oidc-login-postgres.test.ts:489-501`.
- **O que acontece:** os casos de `synthetic_fixture` usam `authorityVersion` fora do padrão (`synthetic-authority-v1`). Por isso Np = 0 < N, e a cláusula da origem nunca é a que decide.
- **Correção mínima:** acrescentar à linha 7 um caso `synthetic_fixture`, ativo, com `authorityVersion = v(3)` (Np = N, Dp = D). O esperado é revisão 2 e `identitySource: 'verified_adapter'`.

### O6 — "Antes do parse do corpo" (§4.3, passo 2) não tem prova (C6 sobrevive)

- **Onde:**
  - código: `apps/api/src/oidc-routes.ts:235` (`onRequest`, correto);
  - prova: `oidc-login-routes.test.ts:432-457`.
- **O que acontece:** o O4 usa um corpo JSON válido (`{unexpected: true}`). Com o mutante C6, a checagem de `Origin` vira `preHandler` e o 403 continua aparecendo.
- **Correção mínima:** acrescentar ao O4 um corpo JSON malformado (`content-type: application/json`, payload `{`) sem `Origin`. O esperado é 403, e não o 400 do parser.

### O7 — RFC 9207 (`iss` na resposta de autorização), para a 0254-C

- **Onde:** `apps/api/src/oidc-authority.ts:208-210`.
- **O que acontece:** `complete` remonta a URL do callback só com `code` e `state`. Se um IdP real anunciar `authorization_response_iss_parameter_supported: true` (o Keycloak anuncia), o openid-client vai exigir `iss`, e todo login dará 401. É falha fechada.
- **Na fatia A:** o IdP sintético não anuncia esse metadado, então nada muda.
- **Correção sugerida:** registrar como resíduo da 0254-C. Repassar o `iss` recebido no callback (único, no máximo 1) e deixar a biblioteca validar.

### O8 — Evidência do BUILD ainda incompleta

- **O que falta versionar no relatório do BUILD:**
  - a lista final de testes ajustados (§6);
  - as versões pinadas e a API reconferida, inclusive `enableNonRepudiationChecks` em `openid-client` 6.8.8 (`build/index.js:748-760`, `:963`; conferi);
  - os sete desvios, com estas decisões;
  - C1–C9 desta revisão, com C1 marcado como equivalente.
- **Cuidado no commit:** `npm run skip:governance` reescreve `certification/skip-inventory.json`, que é versionado. Na minha execução, restaurei esse arquivo para o blob de HEAD. Não incluir esse arquivo no commit sem querer.

### O9 — Mensagem de erro enganosa em `buildServerFromEnv`

- **Onde:** `apps/api/src/server.ts:5410-5424`.
- **O que acontece:** quando `operatorLogin.authorityVersion` ou `consoleOrigin` diverge do `env`, a recusa diz "requires the durable operator session and login state stores".
- **Correção sugerida:** uma mensagem própria, por exemplo "operatorLogin does not match the OIDC configuration".

### O10 — O "antes de `listen`" do O10 é fraco

- **Onde:** `oidc-login-entrypoint-postgres.test.ts:405-426`.
- **O que acontece:** o `portFree()` depois da saída do processo é trivialmente verdadeiro.
- **Correção sugerida:** exigir também que `idp.calls.discovery` não aumente nos casos de configuração inválida. Isso prova a recusa antes de qualquer I/O ao IdP.

### O11 — Loopback `[::1]` aceito de forma inconsistente

- **Onde:** `apps/api/src/oidc-config.ts:38` contra `apps/api/src/oidc-login-transaction.ts:247`.
- **O que acontece:**
  - a configuração aceita o redirect `http://[::1]/...`;
  - a transação recusa esse redirect;
  - o boot falha numa etapa posterior, com mensagem genérica.
- **Correção sugerida:** alinhar as duas listas. O mais simples é tirar `[::1]` de `LOOPBACK_HOSTS`.

### O12 — A validade do cookie operacional só tem prova no PG

- **O que acontece:** a validade ≤ 15 min e ≤ `exp` (I8) só é provada no O10, pelo mutante C8. O O3, que roda em processo, não confere o `Max-Age`.
- **Correção sugerida:** no O3 (`oidc-login-routes.test.ts:323-328`), exigir `Max-Age` ≤ 900, para o retorno sair mais cedo.

## Desvios declarados pelo executor

| #   | Desvio                                                                       | Decisão | Motivo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `jose` 6.2.12 no lockfile; `openid-client` 6.8.8 e `oauth4webapi` 3.8.8 exatos | aceito  | 6.2.12 satisfaz o `^6.2.12` do openid-client, e o lockfile governa o `npm ci`. O diff do lockfile só toca `openid-client`, `jose` e `oauth4webapi`. O `npm audit --omit=dev` não acusa nenhum dos três. `apps/api/package.json` fixa `openid-client` em 6.8.8 exato. Falta registrar no relatório do BUILD (O8).                                                                                                                                                                                                                                                                                                                                                                    |
| 2   | tokenizador do CSRF corta por `,` além de `;`                                | aceito  | Provei que o conjunto de nomes visto é superconjunto do de `parseOperatorSessionCookie`: o nome do cookie não tem vírgula, então nenhum segmento visto pelo parser se perde. O mutante C7 (só `;`) morre: o `inject` junta o cabeçalho em array com `,`, e a guarda do array deixa de ver o nome (200 no lugar de 403). Em HTTP real, o Node junta `Cookie` duplicado com `; `. O corte extra só pode exigir `Origin` a mais, nunca a menos.                                                                                                                                                                                                                                                          |
| 3   | guarda O7 com 403 para Operator/Approver em `/v1/cases`                       | aceito  | `case-authorization/case-routes.ts:887` chama `requireCaseManager(..., 'case:registry_read')` antes de `resolveCaseReadScope`. O arquivo não está no diff, então a base responde igual. Continua sendo falha fechada para as quatro roles (503 nos demais casos). Registrar no relatório do BUILD.                                                                                                                                                                                                                                                                                        |
| 4   | O9 compõe por `buildApiWithProductionSessions` → `buildServerFromEnv`        | aceito  | É exatamente a sequência da §4.8 (passos 2, 3 e 5). A chamada direta de `buildServerFromEnv` no modo OIDC sem os stores recusa antes de abrir pool (O1, `oidc-login-config.test.ts:630-634`). A mensagem dessa recusa pode melhorar (O9).                                                                                                                                                                                                                                                                                                                                               |
| 5   | `no-store` exigido só nos 403 do próprio hook de CSRF                        | aceito  | A §4.7 instala o hook de CSRF depois do hook HTTP. `Origin` nula, `http:` e repetida são recusadas antes, pelo hook existente (`http-security.ts:248-266`), e esse código não muda. Pela RFC 9111, 403 não é cacheável por heurística. No start, o `onSend` da rota (`oidc-routes.ts:196-201`) põe `no-store` também nessas respostas, e o O4 confere.                                                                                                                                                                                                                                                                      |
| 6   | `npm audit`: 1 vulnerabilidade baixa preexistente no fastify                 | aceito  | Rodei `npm audit --omit=dev`: `{low: 1, high: 0, critical: 0}`, com fastify em GHSA-389g-gv7q-r4x8. O lockfile não toca o fastify. O gate da §10 é "sem high/critical".                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 7   | M13 e M24 editam transação e rotas                                           | aceito  | O consumo do state mora em `readOidcLoginCallback` (`oidc-login-transaction.ts:195-201`), então simular "consumir depois da troca" exige mexer nos dois arquivos. Os mutantes são fiéis à §8. Reapliquei os dois: M13 morre por `expected 2 to be 1` (o replay chama `token`); M24 morre por `expected 1 to be +0` (state divergente chama `token`).                                                                                                                                                                                                                                                                  |

## Conformidade com a SPEC (resumo)

### Configuração (§4.1) e autoridade (§4.2)

- **§4.1:** `oidc-config.ts:262-401`.
  - Valida sem I/O e é chamado no início de `buildServerFromEnv` (`server.ts:5405-5424`) e de `buildApiWithProductionSessions` (`production-bootstrap.ts:232`), antes de qualquer pool.
  - `NODE_ENV` é lido do `env`.
  - A detecção de configuração parcial cobre `CVG_OIDC_*` e `CVG_OPERATOR_CONSOLE_ORIGIN`. Nenhum compose, workflow ou deploy define essas variáveis (busca no repositório).
  - O claim da matriz recusa os claims registrados e `__proto__`, `constructor` e `prototype`.
  - O digest ordena `entries` por `group` e `requiredAmr` (R2-O5).
- **§4.2:** `oidc-authority.ts`.
  - Discovery com `ClientSecretBasic`, `id_token_signed_response_alg: 'RS256'`, `execute: [enableNonRepudiationChecks]`, `timeout: 5` e `customFetch`.
  - Não há `allowInsecureRequests` em nenhum lugar (O12).
  - O issuer é comparado byte a byte (`:88`).
  - Os endpoints são exigidos em `https:` e na origem do issuer.
  - As capacidades exigidas são conferidas.
- **Verificação de assinatura:** conferi na 6.8.8 que `enableNonRepudiationChecks` liga `validateApplicationLevelSignature` depois de `processAuthorizationCodeResponse` (`index.js:748-760,963`).
- **Classificação 401/503:** é por chamada, com `AsyncLocalStorage` (R2-O2), e marca 5xx, 429 (R2-O7), rede, TLS e timeout.
  - O `oauth4webapi` 3.8.8 não compartilha busca de JWKS em andamento entre chamadas (`build/index.js:1025-1046`). Por isso a marca por contexto classifica cada callback corretamente.

### Rotas (§4.3)

- **Start:**
  - a checagem de `Origin` é um `onRequest` da rota;
  - depois vêm o corpo vazio, o limite `oidc:start:ip`, o cookie operacional (só uma sessão viva vira `previousSessionId`; o resto é apagado) e o state;
  - todas as respostas saem com `no-store`.
- **Callback:**
  - a ordem é limite → parâmetros → `readCallback` (consome o state antes de `token`) → `error` → troca → mapeamento → produtor → sessão → 303;
  - o pendente é mantido só no 503 do store de state e nas respostas anteriores ao handler;
  - o corpo do 401 é único.

### Mapeador (§4.4) e produtor (§4.5)

- **§4.4:** `oidc-identity.ts:67-147`.
  - Os grupos são lidos só como propriedade própria.
  - O `operatorId` e o `proofRef` seguem as fórmulas da SPEC.
  - `expiresAt = min(exp, agora + 900)`.
- **§4.5:** `case-principal-producer.ts:56-94`. Conferi a tabela linha a linha:
  - a ordem de cima para baixo está preservada;
  - "corrente" equivale a Np = N com Dp = D, `verified_adapter`, ativo e mesma role;
  - há uma releitura no conflito, e o segundo conflito dá 503;
  - erro de banco dá 503.

### Sessão (§4.6) e guardas (§4.7)

- **§4.6:**
  - `GET /v1/session` no modo OIDC só restaura pelo cookie (`server.ts:901-917`);
  - a isenção do hook de sessão cobre as duas rotas de login;
  - no PG, `switchIdentity` troca a sessão de forma atômica.
- **§4.7:**
  - o hook de token recusa qualquer valor, inclusive vazio, fora das quatro probes;
  - o hook de CSRF exige `Origin` normalizada igual à do console, para métodos fora de `GET`/`HEAD`/`OPTIONS` que tragam o nome do cookie;
  - os dois só existem com `operatorLogin`.

### Composição (§4.8)

- As recusas de `buildServer` leem `process.env` (`server.ts:4573-4614`).
- `principalPolicy` usa a versão do login.
- O bootstrap PG compõe os stores de sessão e de state no mesmo pool quando `CVG_OPERATOR_LOGIN=oidc`. A recusa de `DATABASE_MIGRATION_URL` continua só em `production`.
- O discovery roda antes dos pools do produto.
- A checagem de versão roda por tenant da matriz e fecha o app em caso de falha.
- O hook de readiness cobre as rotas de login.

### Persistência e contrato (§4.11)

- **Persistência:** `hasPrincipalVersionMismatch` tem implementação em memória e em PG.
  - No PG, usa `left()` e não `LIKE`. A prova com `oidc-v%-` confirma.
  - Nenhuma migração.
- **§4.11:** o adendo à SPEC0107 corresponde ao contrato.

### Segurança e redação

- Nenhum modo fixture produtivo: OIDC e transporte injetado só existem com `NODE_ENV=test`, conferido no `env` e no `process.env`.
- O IdP sintético mora só em `__tests__/support/`.
- Nenhum código de produção lê `NODE_EXTRA_CA_CERTS` nem injeta CA.
- Chaves RSA, CA e certificado são gerados em tempo de teste, num diretório temporário removido ao fechar. Não há segredo versionado: `.env.example` só tem nomes comentados.
- O11 cobre respostas, logs (`runtimeLogger` e telemetria), audit e stderr do entrypoint. O `authorizationUrl` do start é a única exceção.

### Conjunto de escrita

- Os 31 arquivos estão todos no §6.
- Nada em migrations, `apps/web`, `apps/worker`, `deploy`, `products`, `legacy` ou `main.ts`, nem em ledgers, cartões ou coordenação.
- Lockfile: só `openid-client`, `jose` e `oauth4webapi`.
- `skip-catalog`: os sha256 batem com os dois arquivos PG; os testes esperados como pulados são 5 e 2.

### Testes ajustados

- **`oidc-identity.test.ts`:** reescrito para o mapeador por política.
  - Todas as recusas da base continuam, com o motivo exigido.
  - Saíram só os casos do caminho `/tenant/role`, que a SPEC retira.
  - Entraram casos novos: `sub` com mais de 255 bytes, `iat` fracionário, `amr` com tipo errado, limites de grupos, entrada inativa ambígua e propriedade própria.
- **`oidc-login-transaction.test.ts` e `production-bootstrap-own.test.ts`:** só ganharam casos. Nenhuma asserção foi retirada.

## Mutantes

### Os da SPEC (M1–M30)

O executor registra 30 de 30 mortos. Reapliquei dez com o runner dele (`MUTANT_SCRATCH` próprio). Todos morreram, com os arquivos restaurados e o sha256 conferido:

| Mutante | Motivo da morte                                                                         |
| ------- | --------------------------------------------------------------------------------------- |
| M11     | morto                                                                                   |
| M13     | `expected 2 to be 1`, na contagem de `token`                                            |
| M19     | issuer em maiúsculas, com `:443` e com barra final                                      |
| M20     | `revoked` vazio                                                                         |
| M23     | outra chave com `kid` conhecido e `kid` desconhecido dão 303 no lugar de 401            |
| M24     | `expected 1 to be +0`                                                                   |
| M25     | "boot accepted the edited matrix"                                                       |
| M27     | os 5 casos de 503                                                                       |
| M28     | morto                                                                                   |
| M30     | morto                                                                                   |

### Os propostos pelo crítico (C1–C9)

Runner próprio, fora do repositório, com a mesma disciplina: uma edição ancorada por vez, restauração e sha256.

| ID  | Mutante                                                              | Resultado                                    | Prova que matou ou opcional |
| --- | -------------------------------------------------------------------- | -------------------------------------------- | --------------------------- |
| C1  | `authorizationCodeGrant` sem `maxAge: 300`                           | sobrevive (equivalente: o mapeador repete)   | O2                          |
| C2  | hooks de token e CSRF depois do hook de sessão                       | sobrevive                                    | O1                          |
| C3  | token recusado só com valor não vazio                                | sobrevive                                    | O3                          |
| C4  | checagem de versão no boot só no primeiro tenant                     | sobrevive                                    | O4                          |
| C5  | linha 7 sem a cláusula de origem                                     | sobrevive                                    | O5                          |
| C6  | `Origin` do start em `preHandler`                                    | sobrevive                                    | O6                          |
| C7  | tokenizador do CSRF só por `;`                                       | morto (O8, array via `inject`)               | confirma o desvio 2         |
| C8  | sessão com 15 min fixos, ignorando `exp`                             | morto (O10, `exp` de 5 s)                    | O12                         |
| C9  | M20 só no caminho PG (`create` no lugar de `switchIdentity`)         | morto (O10, cookie anterior continua 200)    | confirma a prova da §8      |

## Conferências (comandos)

Todos os comandos rodaram com `env -i HOME=$HOME PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin TMPDIR=<scratch>/critic-tmp`, a partir da raiz do worktree.

### Integridade e conjunto de escrita

- `sha256sum docs/02_spec/0254_oidc_login_case_principals.md`: bate com a aprovação.
- `git diff --stat` e `git diff --name-status 693fec0ef ad9b1aefa`, mais a leitura do diff completo de produção, testes, lockfile e governança.

### Verificações estáticas

- `npm run -s typecheck`: exit 0.
- `npm run -s lint`: exit 0.
- `npx prettier --check <arquivos tocados, sem lockfile e .env.example>`: OK.
- `npm run -s skip:governance`: PASS. Ele reescreve `certification/skip-inventory.json`; restaurei para o blob de HEAD `056ffae64ba4…` (O8).
- `npm run -s docs:check-links`: sem erros.
- `npx vitest run tests/repository-structure.test.js`: 2 de 2.
- `npm audit --omit=dev --json`: 1 low (fastify), 0 high e 0 critical.

### Testes focais (sem PG)

`npx vitest run` em `oidc-login-routes`, `oidc-login-guards`, `oidc-login-config`, `oidc-authority`, `case-principal-producer`, `oidc-login-boundary`, `oidc-identity`, `oidc-login-transaction`, `production-bootstrap-own` e `operator-session-hook`: 10 arquivos, 313 testes, todos verdes.

### Testes com PG

- **O6 (PG), O9 e O10:** com `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:56270/cvg_test OIDC0254_PG_REQUIRED=1`, `npx vitest run --no-file-parallelism oidc-login-postgres.test.ts oidc-login-entrypoint-postgres.test.ts`: 7 de 7 verdes. O O10 sobe `tsx apps/api/src/main.ts` na porta 3456, com o IdP HTTPS e a CA efêmera.
- **Regressão:** `postgres-persistence-mode`, `case-assignment-authorization-postgres`, `case-scope-tasks-approvals-postgres` e `production-bootstrap-postgres-own`: 96 de 96 verdes.

### Suítes

`npx vitest run --no-file-parallelism --maxWorkers=2 apps/api packages/persistence`: 116 arquivos verdes e 17 pulados (PG sem URL). 969 testes verdes e 185 pulados.

### Mutantes

- **Do executor:** `MUTANT_SCRATCH=<scratch>/critic-tmp/mut python3 docs/04_audit/evidence/UP91-025-OIDC-20261022/build/mutants-runner.py M13 M24 M19 M23 M27 M20 M25 M30 M11 M28`.
- **Do crítico:** `<scratch>/critic-runner/critic_mutants.py` (C1–C9).
- Depois de cada rodada, `git status --short` mostrou só a pasta não versionada `build/`.

## Não conferido nesta rodada

- Não rodei E2E (`critical-flows`, `rem21-014`), `certify`, `sbom`, `licenses:check`, `test:core --coverage`, `coverage:critical` nem `mutation:guard`. Pelas regras de coordenação, eles exigem claim próprio e ficam como gates do executor (§10).
- `scripts/critical-coverage-manifest.json` e `scripts/mutation-manifest.json` não listam os módulos novos (`oidc-routes`, `oidc-authority`, `case-principal-producer`, `oidc-config`). Incluí-los fica fora do §6 desta rodada. Sugiro como item de governança posterior.
