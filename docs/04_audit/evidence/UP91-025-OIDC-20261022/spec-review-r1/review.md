# Crítica independente da SPEC0254 r1 — UP91-025 (fatia A)

- SPEC: `docs/02_spec/0254_oidc_login_case_principals.md`, r1, sha256 `2681db98b0630f96dfab94b0403ac11e521f044df7d66f4d34eae690d02539bc` (conferido antes e depois da revisão).
- Base: worktree `/mnt/dados/cvg-work/cvg-d9ef-up91025-20261022`, `d9c84df9e`. Leitura só. Nenhum PG, teste longo, lockfile ou commit.
- Crítico: Claude Code, contexto independente; não escreveu a SPEC nem o recon.
- Data: 22/10/2026.

## Veredito: `REVISE`

O desenho geral é bom. A ordem do callback, a tabela do produtor, as recusas de composição e a repartição A/B/C estão coerentes com o código. Mas há quatro obrigatórios. O mais grave: a API do `openid-client` listada em §4.2 **não verifica a assinatura do ID token**. Provei isso com um script sintético contra a versão 6.8.8.

## Obrigatórios

### M1 — §4.2 não liga a verificação de assinatura do ID token

- **Defeito.** O `openid-client` v6 não valida a assinatura JWS do ID token vindo do token endpoint. Ele só valida com `enableNonRepudiationChecks`. A §4.2 diz "usando só a API pública" e lista `discovery`, `ClientSecretBasic`, `authorizationCodeGrant` e `customFetch`, mas não lista essa extensão. Um BUILD literal aceita token assinado por qualquer chave. Isso viola o I1 ("ID token RS256 verificado contra o JWKS") e a SPEC0152 §Configuração 4 (assinatura contra o JWKS). A frase da §4.2 "o JWKS fica no cache da biblioteca e é rebuscado quando chega `kid` desconhecido" também é falsa: sem a extensão, o JWKS nem é buscado.
- **Evidência.**
  - `openid-client` 6.8.8 (`build/index.d.ts:1475-1486`): "Validating signatures of JWTs received via direct communication between the client and a TLS-secured endpoint (which it is here) is not mandatory … You only need to use this method for non-repudiation purposes."
  - `build/index.js:748-760`: `nonRepudiation` só é definido por `enableNonRepudiationChecks`. Em `:963`, `authorizationCodeGrant` faz `result.id_token && (await nonRepudiation?.(response))`.
  - O BUILD isolado antigo usava a extensão: `git show ed012a4:apps/api/src/oidc-client-corporate.ts` (`execute: [oidc.enableNonRepudiationChecks]`).
  - Script sintético (`check-sig.mjs`, Node 22.23.2, `openid-client` 6.8.8, `oauth4webapi` 3.8.8, `jose` 6.2.12, transporte em memória):
    - token assinado por chave estranha com `kid` conhecido, **sem** a extensão: `accepted: true`, `jwksCalls: 0`;
    - o mesmo com `kid` desconhecido: `accepted: true`, `jwksCalls: 0`;
    - com a extensão: `OAUTH_INVALID_RESPONSE` e `OAUTH_KEY_SELECTION_FAILED`;
    - chave correta com a extensão: aceito.
  - Rebusca do JWKS: `oauth4webapi` 3.8.8 `build/index.js:1093`. Diante de `kid` desconhecido, a biblioteca só rebusca se o cache tiver 60 s ou mais. Antes disso, recusa direto. O cache expira em 300 s (`:1036`).
  - `alg` `none`/`HS256` já é recusado sem a extensão, porque o `alg` é checado contra `id_token_signed_response_alg` (`build/index.js:1394`, `:2027-2035`).
- **Correção mínima.**
  - Na §4.2, incluir `execute: [enableNonRepudiationChecks]` no `discovery`, sem `allowInsecureRequests`.
  - Corrigir a frase sobre o JWKS: `kid` desconhecido dá 401 sem nova busca se o cache tiver menos de 60 s; com 60 s ou mais, há uma nova busca. O mesmo vale para o risco de §11.
  - Acrescentar à §8 o mutante "sem `enableNonRepudiationChecks`", morto por O5 ("assinatura de outra chave" e "`kid` desconhecido"). Esses dois casos de O5 têm de afirmar 401 sem sessão.
  - Se a §4.10 usar rotação de chave num caso positivo, o teste precisa passar dos 60 s (relógio falso) ou criar uma nova `Configuration`.

### M2 — Dois mutantes da §8 não morrem com as provas citadas (prova falsa no aceite 14)

- **Defeito.**
  - **M13** ("state consumido depois da troca do code", morto por "O5: segundo uso"). Na segunda chamada, o mutante troca o code de novo. Como o IdP sintético tem code de uso único (§4.10), a troca falha e a resposta é 401. É o mesmo 401 do código correto. O O5 descrito não distingue os dois.
  - **M19** ("issuer divergente aceito no discovery", morto por O2). O `openid-client` já recusa um issuer diferente por `new URL(...).href`. Tirar a checagem byte a byte da SPEC não muda o resultado de O2 com um issuer qualquer. O mutante sobrevive.
- **Evidência.**
  - SPEC `:245` (code de uso único), `:288` (O5), `:311` (M13), `:285` (O2), `:317` (M19), `:337` (aceite 14).
  - `openid-client` `build/index.js:287`: `new URL(as.issuer).href !== server.href`.
  - Script `check-issuer.mjs`, com issuer configurado `https://idp.synthetic.test`:
    - `https://other.synthetic.test` → recusado pela biblioteca;
    - `https://IDP.synthetic.test`, `https://idp.synthetic.test:443` e `https://idp.synthetic.test/` → **aceitos** pela biblioteca.
- **Correção mínima.**
  - **O5:** o IdP sintético conta as chamadas ao token endpoint. Toda recusa antes do passo 5 afirma zero chamadas (state divergente, replay, pendente ausente, adulterado ou vencido). Acrescentar a sequência "state divergente → 401; mesmo code com o state certo → 303", que prova que o code não foi queimado. M13 passa a citar essa asserção.
  - **O2:** incluir um issuer de metadata que difere só na normalização (host em maiúsculas, `:443` ou barra final). A biblioteca aceita esse issuer e a regra da SPEC recusa. M19 passa a citar esse caso.
  - Ajustar as citações de M3 e M14. M3 morre por O9 (`verified_adapter` na linha) e pelo O3 (o segundo login não cria revisão); O7 com `development` não executa o produtor. M14 morre já em O3, porque sem `expectedNonce` a biblioteca recusa todo ID token que traga `nonce` (`oauth4webapi` `build/index.js:1429-1437`, `:1466-1468`).

### M3 — O I9 e o O11 contradizem a resposta do próprio start

- **Defeito.** O I9 diz que state e nonce "nunca aparecem em resposta". O O11 testa "em todas as respostas … nenhum … state, nonce". Mas o start responde `200 { authorizationUrl }` (§4.3, passo 7), e essa URL contém `state`, `nonce` e `code_challenge` por protocolo. Lidos ao pé da letra, o O11 não passa e o I9 não vale.
- **Evidência.** SPEC `:60` (I9), `:117` (start), `:294` (O11). `apps/api/src/oidc-login-transaction.ts:81-84` grava `state`, `nonce` e `code_challenge` na URL.
- **Correção mínima.** O I9 e o O11 passam a isentar só a `authorizationUrl` da resposta 200 do start. O O11 afirma que nenhuma outra resposta, log, stderr ou audit contém esses valores, inclusive o 303 do callback e os 401/503.

### M4 — O perfil PG do modo OIDC em `NODE_ENV=test` torna o O10 (e o O9 pelo entrypoint) impossível na leitura literal

- **Defeito.**
  - A §4.8, passo 2, manda compor o store "com o preflight e a readiness atuais" e "generalizar `production-bootstrap.ts:47-50`". Nesse caso, a recusa de `DATABASE_MIGRATION_URL` em `:52-56`, que vem logo depois, passa a valer no modo OIDC.
  - Só que, com `NODE_ENV=test` e RLS, o `buildServerFromEnv` **exige** `DATABASE_MIGRATION_URL` com um papel distinto. Sem ela, o pool de migração é o de serving e o boot cai em "runtime and migration roles must be distinct".
  - O O10 pede "papéis e schemas próprios como em `production-bootstrap-postgres-own.test.ts:59-150`". Esse harness liga RLS e simula `NODE_ENV=production`.
  - O recon já tinha anotado o problema (R1.5), mas a SPEC não o leva para a §4.8 nem para o O9/O10.
  - Além disso, a SPEC não exige `POSTGRES_RLS_ENFORCEMENT=true` no modo OIDC. Sem RLS, a persistência cai no modo legado de **uma conexão**. Nele, o `write` do `PostgresCaseAuthority` faz `BEGIN`/`COMMIT` na conexão compartilhada por requisições concorrentes. Isso quebra o O6 em PG ("dois callbacks simultâneos").
- **Evidência.**
  - `apps/api/src/production-bootstrap.ts:50`, `:52-56`.
  - `apps/api/src/server.ts:5359-5368` (recusa de DDL só em produção), `:5429-5432`, `:5463-5476`, `:5528-5531`, `:5546-5549` (sem RLS: `kind: 'postgres'` com um único `client`).
  - `packages/persistence/src/case-authority-postgres.ts:669-690` (`write` sem pool: `BEGIN`/`COMMIT` no cliente único).
  - `apps/api/src/__tests__/production-bootstrap-postgres-own.test.ts:131-137` (`stubEnv('NODE_ENV','production')` e RLS).
  - recon `:25`; SPEC0144 `:54` (a recusa de DDL no serving é regra de **produção**).
- **Correção mínima.**
  - Na §4.1, o modo OIDC exige `POSTGRES_RLS_ENFORCEMENT=true`.
  - Na §4.8, as recusas de `DATABASE_MIGRATION_URL` e `POSTGRES_AUTO_MIGRATE` (`production-bootstrap.ts:52-56`, `server.ts:5359-5368`) continuam só em `production`. No modo OIDC de teste, o serving recebe `DATABASE_MIGRATION_URL` com um papel distinto do runtime e do papel de sessão.
  - O O9 e o O10 declaram esse ambiente.
  - Registrar isso como premissa P6 (serving com credencial DDL, só em teste).

## Opcionais

- **O1 — §0 tem uma afirmação falsa.** A SPEC diz que o store PG "de sessão e de state já é composto em produção" (`:17`). O de state não é: nada compõe o `PostgresOidcLoginStateStore` fora dos testes (recon R4.6, R6.1).
- **O2 — O I8 não fecha com a §4.3 e a §4.9.** O I8 diz que o pendente é apagado "em toda falha do callback", salvo store de state fora. Mas o 429 (passo 1, `:229` "nenhum"), as recusas dos hooks globais (403/426) e o 503 do hook de readiness do bootstrap (`production-bootstrap.ts:196-219`) não apagam o pendente. O O10 até pede "cookie preservado". Melhor reescrever o I8 com essas exceções.
- **O3 — A ordem "Origin antes do corpo" no start.** O passo 2 (Origin) vem antes do passo 3 (corpo). Se a checagem ficar no handler, o Fastify faz o parse do corpo antes e devolve 400 para corpo inválido sem Origin. Pôr a checagem num `onRequest` da rota garante o 403 primeiro.
- **O4 — Mesmo tokenizador no CSRF.** A detecção do nome do cookie no hook de CSRF deve aceitar tudo o que `parseOperatorSessionCookie` aceita (`operator-session.ts:92-111`: corta por `;` e por `=`, com `trim` do nome). Também deve tratar `cookie` em array, que vem de `inject`. Ser mais estrita que o parser abre um desvio.
- **O5 — Mapear os erros da biblioteca para 401/503.**
  - 401: `ResponseBodyError` e códigos `OAUTH_*` de validação, inclusive `OAUTH_KEY_SELECTION_FAILED` e `OAUTH_INVALID_RESPONSE` da assinatura.
  - 503: rede, TLS, timeout, 5xx do token endpoint e falha ao buscar o JWKS.
  - Hoje a classificação fica implícita, e o JWKS fora do ar tem de dar 503, não 401.
- **O6 — Qualificar a frase "impede login CSRF" (`:131`).** O pendente sem `__Host-` pode ser plantado por uma origem irmã (cookie tossing), sem nenhum pendente prévio da vítima. A defesa vem na 0254-B (SPEC0150 item 5). Na A, que só roda em teste, o risco é nulo, mas a frase promete mais.
- **O7 — Dizer qual `NODE_ENV` cada guarda lê.**
  - A §4.1 lê o `env` passado ao builder; a §4.8 lê `process.env`.
  - Os dois juntos falham fechado, o que é bom. Mas a guarda I3 tem de ler `process.env`, como a §4.8 diz. Se ler o `env`, quebra `postgres-persistence-mode.test.ts:1740-1858`, que passa `NODE_ENV: 'production'` no `env` com `casePrincipalAuthority`, enquanto o processo do vitest está em `test`.
- **O8 — Nome do claim de grupos.** O padrão `[A-Za-z0-9_.:-]{1,64}` aceita `__proto__`, `constructor` e `prototype`. Excluir esses nomes e ler o claim só como propriedade própria.
- **O9 — `GET /v1/session` sem cookie.** Hoje responde 401 com "A trusted operator identity resolver is required in production" e limpa o cookie (`server.ts:884-897`, `:958-965`). A §4.6 promete "Operator session is missing or expired". Isso exige mudar o handler; vale citar na §6.
- **O10 — Fatos de CI.** O runner é `ubuntu-latest` (`.github/workflows/verify.yml:20`), não `ubuntu-24.04` como dizem §11 e R13.6. Os casos de 5 s (O2 "lento" e O10 `exp`) precisam de timeout de teste explícito fora do `test:postgres`, que já usa 60 s.
- **O11 — SPEC0152 §1.** Recusar também `CVG_LOCAL_OIDC_*` junto do modo OIDC (custo zero). Na 0254-C, conciliar `CVG_OPERATOR_LOGIN` com o discriminante `local-controlled`/`corporate-oidc` da SPEC0151.
- **O12 — Nota para a 0254-C.** O limite de start de 10/min por IP vira gargalo atrás de NAT ou proxy do hospital.

## Premissas

### As premissas que o executor marcou como novas

- **P1 (dependência `openid-client`) — bem separada.** Conferi:
  - 6.8.8 é MIT;
  - as dependências são `jose ^6.2.12` e `oauth4webapi ^3.8.8`, fixadas pelo lockfile;
  - não está em `apps/api/package.json`.

  Duas condições para o usuário: a API usada precisa incluir `enableNonRepudiationChecks` (M1), e a versão exata deve ser registrada no BUILD com a API conferida de novo.
- **P2 (grupo desconhecido) — bem separada.** A SPEC0152 §5 diz literalmente que "grupo desconhecido … falham". Ignorar esses grupos muda uma SPEC aprovada, então precisa de decisão.
- **P3 (role por CAS) — separada, mas é metade da pergunta.** Ver P4.

### Premissas escondidas, tratadas como fato

- **P4 — A desativação no login com a mesma V (linha 3 / D9).**
  - Com a mesma V, a matriz não mudou. Então a linha 3 só casa quando o grupo do usuário **no IdP** passou para uma entrada inativa.
  - Nesse caso, o login escreve (desativa). Já na linha 8, a mesma causa (troca de grupo no IdP) é recusada sem escrita, com base na leitura literal da SPEC0176 `:52` ("login posterior nunca atualiza registro existente por si só").
  - A D9 se justifica pela troca de matriz, que a linha 3 já cobre quando a versão muda.
  - Levar ao usuário junto com a P3. Opções:
    - (a) manter a linha 3 como está: desativar é falha segura;
    - (b) desativar só com versão diferente de V;
    - (c) tratar papel e desativação do mesmo jeito.
- **P5 — A versão por digest (D1) não tem ordem.**
  - "Reativação só com versão nova" (D9, `:380`) na verdade quer dizer "versão diferente".
  - Se a matriz voltar a uma versão anterior, os principais desativados no intervalo são reativados (e os papéis voltam) no próximo login. A SPEC0176 `:52` diz "Versão anterior/replay não restaura principal".
  - Toda edição da matriz, mesmo de outro tenant ou só da ordem das entradas (o `canonicalizeJson` mantém a ordem dos arrays), invalida os principais de **todos** os tenants até o próximo login.
  - A D1 é verificável e serve à SPEC0176 ("versão vigente verificável"; a sessão de 15 min limita o quanto o principal fica velho). Mas o usuário deve aceitar essas duas consequências. A alternativa é `authorityVersion = oidc-<matrix.version>-<digest>` com `matrix.version` crescente: o produtor recusa uma versão menor que a do principal.
- **P6 — Serving com credencial DDL no modo OIDC de teste** (M4). Isso é aceitável só em `NODE_ENV=test`. A SPEC0144 `:54` proíbe em produção.
- **P7 — Escopo (declarado em §12.2, mas é decisão do usuário).** Depois da A, nenhuma composição fora de teste lê casos, inclusive `development` e o ensaio C8. Está escrito, mas aparece como default.
- **Defaults D1–D11.**
  - D2–D8, D10 e D11 são seguros.
  - A D7 muda o desenho de 28/09 (de 401 para "apaga e ignora"), sem risco.
  - A D11 adia o item 4 da SPEC0150 no modo HMAC, o que está declarado.
  - A D1 e a D9 dependem da P5 e da P4.

## Pontos conferidos sem defeito

- **Tabela do produtor (§4.5).**
  - A cobertura é completa: toda combinação de P × entrada cai em exatamente uma linha, lida em ordem.
  - CAS e audit batem com `case-authority-postgres.ts:702-781`: `SELECT … FOR UPDATE`, `INSERT … ON CONFLICT DO NOTHING` na revisão 0 e audit `policy_decision` do ator `System`/`case-principal-provisioning` na mesma transação.
  - O `BEGIN` usa READ COMMITTED (`tenant-scoped-postgres.ts:192`). Com isso, dois callbacks simultâneos dão `principal_conflict` e a nova tentativa cai na linha 7, como o O6 espera.
  - O gatilho de revisão vem de `0029:234-243`. Nenhum grant é criado.
- **Recusas de composição (§4.8).**
  - Nenhum chamador de produção injeta `casePrincipalAuthority`; só três testes, todos com o processo em `test`.
  - Nenhum teste atual stuba `production` no processo e injeta a autoridade. A exceção do `env` está em O7.
  - Não achei caminho de "modo fixture produtivo": IdP sintético fora do build (`build-runtime.mjs:148-149`), transporte só por opção programática, e o `Dockerfile` e o compose de produção fixam `NODE_ENV=production`.
- **Ordem do callback (§4.3).**
  - O state é validado e consumido antes da troca (`oidc-login-transaction.ts:116-177`).
  - Pendente duplicado é recusado (`:248-259`).
  - O `previousSessionId` vem selado no pendente, e o callback não depende do cookie `Strict` (SPEC0152 §Composição 2).
  - O `switchIdentity` é atômico e tolera um digest desconhecido ou já revogado (`operator-session-postgres.ts:143-186`; `0000_auth.sql:140-157`).
  - Manter o pendente quando o store de state cai segue a SPEC0144 `:88`.
  - O redirect vai para uma origem fixa, sem open redirect, e o ID de sessão é sempre novo.
- **Hooks.**
  - A ordem de `buildServer` permite instalar CSRF e token entre `installHttpSecurityHooks` (`server.ts:532`) e o hook de sessão (`:534-543`).
  - O hook de readiness do bootstrap roda por último (`production-bootstrap.ts:196`) e cobre as rotas novas (`operator-session-route-boundary.ts:11-26`).
  - Fora do modo OIDC, nada muda no HMAC. Nenhuma configuração atual usa `CVG_OIDC_*` fora de `docs/`.
- **Limites.**
  - O `operatorId` (69 caracteres) cabe em `OperatorIdentitySchema` (≤ 80), no CHECK das duas tabelas e em `HTTP_REQUEST_MAX_PARAM_LENGTH` (100).
  - O `authorityVersion` (69) cabe em `case-authority.ts:332` e no CHECK de `0029` (≤ 120).
  - `canonicalizeJson` existe em `@cvg/harness-contracts`, que já é dependência da API.
- **Pronto/prova repartido.** A cobre o entrypoint sintético, recarga, CSRF (modo OIDC), revogação, papel/tenant, store e configuração. B cobre os hosts distintos; C, a produção. O cartão fica aberto, como a SPEC diz.
- **Âncoras.** Todas as âncoras de §2 e do recon que conferi estão na base, com tolerância de ±2.

## O que conferi (comandos)

```
sha256sum docs/02_spec/0254_oidc_login_case_principals.md   # 2681db98…39bc, antes e depois
git log --oneline -3                                          # d9c84df9e
cat -n apps/api/src/{operator-session-hook,operator-session-route-boundary,main,production-bootstrap,oidc-login-transaction,oidc-identity,oidc-state-postgres,operator-session,operator-session-postgres}.ts
awk 'NR>=300&&NR<=800' apps/api/src/server.ts; awk 'NR>=836&&NR<=1000' …; awk 'NR>=4480&&NR<=4580' …; awk 'NR>=5250&&NR<=5600' …
sed -n 150,360p apps/api/src/http-security.ts
awk 'NR>=60&&NR<=160' apps/api/src/case-authorization/case-routes.ts
sed packages/persistence/src/case-authority.ts (90-380, 550-610); case-authority-postgres.ts (300-360, 600-790)
grep 0029_case_assignment_authorization.sql (case_principals, revision guard, RLS); operator-session/0000_auth.sql (CHECK, revoke)
grep -rln casePrincipalAuthority apps packages tests scripts; grep stubEnv/NODE_ENV nos três testes
grep -rn "CVG_OIDC_|CVG_OPERATOR_CONSOLE_ORIGIN|CVG_OPERATOR_LOGIN" (fora de docs)
grep NODE_ENV Dockerfile deploy/; grep runs-on/services .github/workflows/verify.yml; which openssl  # 3.0.13
git show ed012a4:apps/api/src/oidc-client-corporate.ts
# openid-client 6.8.8, oauth4webapi 3.8.8, jose 6.2.12 extraídos do cache npm para o scratchpad (fora do repo)
env -i HOME=$HOME PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin node check-sig.mjs
env -i HOME=$HOME PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin node check-issuer.mjs
```

Saída de `check-sig.mjs` (transporte em memória, chaves RSA geradas na hora, dados sintéticos):

```
signed by evil key, kid k1, WITHOUT nonRepudiation: { accepted: true, jwksCalls: 0, tokenCalls: 1 }
signed by evil key, unknown kid, WITHOUT nonRepudiation: { accepted: true, jwksCalls: 0, tokenCalls: 1 }
signed by evil key, kid k1, WITH nonRepudiation: { accepted: false, code: 'OAUTH_INVALID_RESPONSE', … }
signed by evil key, unknown kid, WITH nonRepudiation: { accepted: false, code: 'OAUTH_KEY_SELECTION_FAILED', … }
signed by good key, kid k1, WITH nonRepudiation: { accepted: true, jwksCalls: 1, tokenCalls: 1 }
```

Saída de `check-issuer.mjs` (issuer configurado `https://idp.synthetic.test`):

```
https://other.synthetic.test -> { accepted: false, code: 'OAUTH_JSON_ATTRIBUTE_COMPARISON_FAILED' }
https://IDP.synthetic.test -> { accepted: true, … }
https://idp.synthetic.test:443 -> { accepted: true, … }
https://idp.synthetic.test/ -> { accepted: true, … }
```

Os scripts ficaram só no scratchpad da sessão; nada foi escrito no repositório fora desta pasta.

## Próximo passo

- Uma r2 que feche M1–M4 pode receber `APPROVE` numa segunda rodada curta.
- P4 e P5 vão ao usuário junto com P1–P3.
- P6 entra na r2 como premissa explícita.
