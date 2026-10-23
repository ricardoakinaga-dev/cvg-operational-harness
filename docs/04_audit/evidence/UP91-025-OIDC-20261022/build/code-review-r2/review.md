# Revisão de código independente r2 — BUILD da SPEC0254 r2 (UP91-025, fatia A)

- **Commit revisado:** `aa91c86f89e10f7749adaa021e3640e83a15310a`, diff `ad9b1aefa..aa91c86f8` (9 arquivos, +131/−28). Também li o código anterior que o diff toca.
- **SPEC:** `docs/02_spec/0254_oidc_login_case_principals.md`, r2, sha256 `3c804dc22c34b736b6d0c6bb5d683b6144a1d7d34dd083d33926d34afef49694`. Conferi o hash no início e no fim.
- **Autoridade lida:**
  - `spec-approval.json`;
  - `code-review-r1/review.md` e `review.json`;
  - `build/mutants.json` (execução final sobre `aa91c86f8`) e `build/mutants-runner.py`.
- **Worktree:** `/mnt/dados/cvg-work/cvg-d9ef-up91025-20261022` (detached). Node 22.23.2.
- **Crítico:** Claude Code, contexto novo, separado do executor. Data: 22/10/2026.
- **Escrita:** só estes dois arquivos.
  - Nenhum mutante aplicado e nenhuma execução do `mutants-runner.py`, porque o executor roda gates na mesma árvore.
  - Nenhum teste com PostgreSQL. Não usei `TEST_DATABASE_URL` nem a porta 3456.
  - Nenhum commit, push, PR ou deploy.
  - No fim, `git status --short` mostrou só a pasta não versionada `build/`.

## Veredito: `APPROVE`

Nenhum obrigatório.

- Os opcionais O1, O3, O4, O5, O6, O9, O10, O11 e O12 da r1 entraram corretamente.
  - Nenhuma asserção foi afrouxada: `git diff -w` mostra só três linhas removidas nos testes, e cada uma foi trocada por um superconjunto.
  - O código de produção muda só em dois pontos. O texto de uma recusa (O9) e o momento de uma recusa que já existia (O11, agora antes de qualquer I/O, como a §4.1 pede).
- O2 está registrado de forma adequada. Reconferi a equivalência do C1 no código do `oauth4webapi` 3.8.8.
- O7 ainda não tem registro fora da r1. O8 está em andamento, e o que já existe está consistente.
- O commit não introduz regressão, contradição com a SPEC ou com a r1, nem falha de segurança.
- O conjunto de escrita continua dentro do §6. Os 9 arquivos já estavam entre os 31 da r1, e o total acumulado desde `693fec0ef` continua 31.

**Condição de evidência, não de código.** Não rodei PG, então três coisas ainda dependem do executor:
- o teste novo do O4, em `oidc-login-postgres.test.ts:655`;
- a asserção nova do O10, em `oidc-login-entrypoint-postgres.test.ts:407,420`;
- os demais testes PG sobre `aa91c86f8`.

O `mutants.json` mostra que o teste do O4 falha com o C4. Só que essa falha só vale como morte se o mesmo teste passar no código real. Peço ao executor que anexe ao relatório do BUILD o resultado verde de `oidc-login-postgres` (6 testes) e de `oidc-login-entrypoint-postgres` (2 testes) sobre `aa91c86f8`.

## Obrigatórios

Nenhum.

## Opcionais

### R2-O1 — O teste do O9 não isola a cláusula de `consoleOrigin` (a primeira variação não muda nada)

- **Onde:**
  - teste: `apps/api/src/__tests__/oidc-login-config.test.ts:651-671`;
  - código: `apps/api/src/server.ts:5420-5428`.
- **O que acontece:** o `operatorLogin` base já usa `authorityVersion: 'oidc-v1-'.padEnd(72, '0')`. A primeira variação (`:653`) repete esse mesmo valor, então não muda nada.
  - O valor também nunca é o da configuração. Pela sonda, a configuração de `validEnv` dá `oidc-v1-8d7feb69…`.
  - Por isso a segunda variação (`consoleOrigin` diferente) também diverge na versão.
  - Resultado: as duas iterações recusam pela versão. Um mutante que tire `|| operatorLogin.consoleOrigin !== config.consoleOrigin` (chamo de C10) continua passando. Nenhum outro teste chama `buildServerFromEnv` com um `operatorLogin` divergente.
- **Impacto:** nulo em segurança.
  - A SPEC não exige essa comparação.
  - O caminho produtivo (`production-bootstrap.ts:217-223`) monta `operatorLogin` a partir da mesma configuração.
  - Tudo só compõe com `NODE_ENV=test`.
  - O código atual recusa corretamente a divergência só de origem. Conferi com uma sonda fora do repositório (seção "Conferências").
  - O defeito está no teste: ele parece cobrir os dois campos, mas cobre só um.
- **Correção mínima:**
  - usar como base `authorityVersion: parseOperatorLoginConfig(validEnv)!.authorityVersion` (importado de `../oidc-config.ts`), para cada variação mudar exatamente um campo;
  - opcionalmente, registrar o C10 no `mutants.json`.

### R2-O2 — O alinhamento do O11 não tem prova

- **Onde:**
  - código: `apps/api/src/oidc-config.ts:38-39`;
  - prova sugerida: a tabela de recusas do O1, em `oidc-login-config.test.ts:326-338`.
- **O que acontece:** a remoção de `[::1]` está correta. A sonda confirma:
  - `http://[::1]/v1/auth/oidc/callback` e `http://[::1]:3000/...` agora são recusados com "CVG_OIDC_REDIRECT_URI is invalid";
  - `http://127.0.0.1:3000/...` e `http://localhost/...` continuam aceitos.
  - Mas nenhum teste usa `[::1]`, então um mutante que devolva `'[::1]'` ao conjunto (chamo de C11) sobrevive.
  - O efeito seria só voltar a recusar depois do discovery, com mensagem genérica. Continua sendo falha fechada.
- **Correção mínima:** acrescentar à tabela do O1 o caso `['redirect http: em [::1]', { ...validEnv, CVG_OIDC_REDIRECT_URI: 'http://[::1]/v1/auth/oidc/callback' }, /CVG_OIDC_REDIRECT_URI/]`.

### R2-O3 — O relatório do BUILD também deve registrar a r2

O relatório já tem os itens do O8 da r1. Ele deve acrescentar:
- **O7:** RFC 9207 como resíduo da 0254-C, com o texto da r1 (repassar o `iss` único do callback e deixar a biblioteca validar). Pôr na mesma lista dos resíduos da 0254-C que vieram das revisões da SPEC (O11 e O12 da `spec-review-r1`).
- **O4:** a variação aceita. Foi usado o mesmo fixture com N = 7, e não um fixture novo com N = 3. Ver a avaliação abaixo.
- **O12:** o teto usado é 300, e não 900.
- **PG:** os resultados sobre `aa91c86f8` pedidos no veredito.
- **R2-O1 e R2-O2:** a decisão tomada, e C10 e C11 se forem aplicados.

## Avaliação dos opcionais da r1

| ID  | Situação                    | Nota |
| --- | --------------------------- | ---- |
| O1  | incorporado                 | `oidc-login-guards.test.ts:419-445`. Cookie `opsess_` + 43 caracteres (casa com `^opsess_[A-Za-z0-9_-]{43}$`, sessão inexistente). Exige 403 "Origin is not allowed" sem `Set-Cookie` em `POST /v1/tasks` e `/v1/session/logout`, e 401 "Bootstrap tokens are disabled" sem `Set-Cookie` em `GET /v1/cases` e `/v1/session`. É mais do que a r1 pediu. O C2 do runner é a troca exata dos dois blocos (`mutants-runner.py:210-239`) e morre. |
| O2  | registrado                  | `mutants.json` registra o C1 como `SURVIVED (EQUIVALENT)`, com o motivo, e `criticMutants.equivalent = ["C1"]`. Reconferi a equivalência no `oauth4webapi` 3.8.8. Com `maxAge`, a biblioteca recusa se `auth_time + 300 < agora − 30` (`build/index.js:1425`, tolerância padrão de 30 s em `:435-440`). O mapeador já recusa se `auth_time < agora − 300` e exige `auth_time` (`oidc-identity.ts:94,99`). O mapeador é estritamente mais forte, e as duas recusas dão o mesmo 401. |
| O3  | incorporado                 | `oidc-login-guards.test.ts:392-409`. Agora testa os valores `'synthetic.token.value'` e `''`, com e sem cookie, e mantém todas as asserções. O valor vazio chega ao servidor: o teste passa com `=== undefined` e o C3 (`!header`) morre em 2 testes. |
| O4  | incorporado, com variação aceita | `oidc-login-postgres.test.ts:655-679`. Usa o mesmo fixture do describe e N = 7, e não um fixture novo com N = 3. A variação é robusta nos dois casos. Rodando sozinho (filtro do runner), o tenant A não tem principal. Na ordem do arquivo, o tenant A fica com o principal em `oidc-v4-` (< 7), que não dispara a recusa. Nos dois casos, só o tenant B decide. A ordem `[A, B]` vem de `new Set(entries.map(tenantId))` (`server.ts:4624-4626`). O mutante simétrico ("só o último tenant") morre no teste anterior, que edita o tenant A. O C4 morre. Falta o verde no código real (ver o veredito). |
| O5  | incorporado                 | `case-principal-producer.test.ts:227-235`: `synthetic_fixture`, ativo, `v(3)` com `D_A`, role igual à da entrada. Sem a cláusula de origem, a decisão cairia na linha 8 (nenhuma escrita, revisão 1), e o teste exige revisão 2 e `verified_adapter`. O C5 morre. |
| O6  | incorporado                 | `oidc-login-routes.test.ts:446-455`. Corpo `'{'` com `content-type: application/json`. O C6 morre nos casos "sem Origin" e "Origin irmã", que são os casos em que o 403 vem do `onRequest` da rota. Nos outros três, o 403 vem do hook HTTP, que roda antes de qualquer parse, então eles continuam passando: "failed 2 / passed 3". Isso é coerente. |
| O7  | pendente de registro        | Fora da r1, não encontrei registro em `docs/` nem em `build/` (`grep 9207`). Não muda código na fatia A. O registro é adequado se entrar no relatório do BUILD e na lista de resíduos da 0254-C (R2-O3). |
| O8  | em andamento                | O que existe está consistente. Conferi o `mutants.json`: `checkedCommit = aa91c86f8…` e M1–M30 mortos. Cada `restoredSha256` bate com o blob de HEAD e com o arquivo atual (`server.ts` `e48a53a3…`, `oidc-routes.ts` `954bf884…`, `oidc-authority.ts` `e5b5c298…`, `case-principal-producer.ts` `fcfa1a56…`, `oidc-login-transaction.ts` `918cfb66…`, `oidc-config.ts` `36e8cf38…`, `oidc-identity.ts` `1f41571a…`). O C1 é equivalente, e C7–C9 estão anotados como mortos na r1. `certification/skip-inventory.json` não está em nenhum dos dois commits. Falta o relatório do BUILD. |
| O9  | incorporado                 | `server.ts:5412-5428`. A condição antiga foi dividida em duas: sem `operatorLogin` ou sem store, a mensagem antiga; com divergência, "operatorLogin does not match the OIDC configuration", sem valores sensíveis. A lógica é a mesma. O `!` é seguro, porque a checagem anterior já lança quando falta `operatorLogin`. O teste novo só prova a cláusula da versão (R2-O1). |
| O10 | incorporado                 | `oidc-login-entrypoint-postgres.test.ts:406-420`. Exige que `idp.calls.discovery` não aumente. O contador está vivo no transporte HTTPS: `synthetic-oidc-issuer.ts:311-319` passa pelo mesmo `handle`. Todas as recusas da tabela saem de `parseOperatorLoginConfig` (`oidc-config.ts:285-298` e seguintes), antes do pool de sessão e do discovery. Falta o verde PG (ver o veredito). |
| O11 | incorporado                 | `oidc-config.ts:38-39`. As listas agora batem com `oidc-login-transaction.ts:247`. No nível do sistema, o resultado não muda, porque `[::1]` já era recusado no boot. A diferença é que antes a recusa vinha depois do discovery, em `clearOidcLoginCookie` (`oidc-authority.ts:190`), e agora vem antes de qualquer I/O, como manda a §4.1. Isso não contradiz a SPEC: §4.1 linha 109 autoriza `http:` em loopback, mas não obriga a aceitar todas as formas. Não tem prova (R2-O2). |
| O12 | incorporado, mais forte     | `oidc-login-routes.test.ts:329-332`. Exige `0 < Max-Age ≤ 300`, e não só ≤ 900. O teto não é instável: o IdP emite `exp = floor(agora/1000) + 300` (`synthetic-oidc-issuer.ts:469`), e `Max-Age = ceil((expiresAt − agora)/1000)` (`operator-session.ts:117`). Então o valor é ≤ 300 sempre. O teste prova ≤ `exp` em processo e mataria o C8 sem PG. O teto de 900 segue provado no mapeador (`oidc-identity.test.ts:76`). |

## Respostas às quatro perguntas

1. **Opcionais O1, O3, O4, O5, O6, O9, O10, O11 e O12:** entraram corretamente, sem afrouxar asserção.
   - Fora do que a SPEC pede, o comportamento de produção não muda: só um texto de erro e uma recusa que passou para antes do I/O.
   - Ressalvas de prova: R2-O1 e R2-O2.
2. **O2, O7 e O8:**
   - O2 está adequado.
   - O7 ainda não tem registro, e é esperado no relatório do BUILD (R2-O3).
   - O8: o que existe está consistente.
3. **Regressões e segurança:** nenhuma regressão, contradição ou falha de segurança.
   - Rodaram verdes 316 testes focais, sem PG.
   - Os quatro testes sem PG que usam `buildServerFromEnv` também estão verdes.
   - `typecheck`, `eslint` e `prettier` deram exit 0.
4. **Conjunto de escrita:** dentro do §6.
   - São 6 testes da §7, `oidc-config.ts`, `server.ts` (ramo OIDC de `buildServerFromEnv`) e `scripts/skip-catalog.json`.
   - Os sha256 do catálogo batem com os arquivos: `b4418d27…` com 6 pulados e `5ea5c17d…` com 2 pulados.
   - Nada em migrations, `apps/web`, `apps/worker`, `deploy`, `products`, `legacy`, `main.ts`, lockfile, ledgers ou coordenação.

## Conferências (comandos)

Todos os comandos rodaram a partir da raiz do worktree, com `env -i HOME=$HOME PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin TMPDIR=<scratch>/critic-tmp-r2`.

### Integridade e diff

- `sha256sum docs/02_spec/0254_oidc_login_case_principals.md`: bate com a aprovação.
- `git rev-parse HEAD aa91c86f8`.
- `git diff --stat`, `git diff` e `git diff -w ad9b1aefa aa91c86f8 -- apps/api/src/__tests__/`. Nos testes, saíram só 3 linhas, todas trocadas por um superconjunto.
- `git diff --name-only 693fec0ef aa91c86f8`: 31 arquivos. Comparei com a lista da r1.
- `git log -1 --format=%B aa91c86f8`.

### Hashes

- `sha256sum` dos dois arquivos PG, comparado com `scripts/skip-catalog.json`.
- Contagem de `it(` nos mesmos arquivos: 6 e 2.
- `sha256sum` dos arquivos de produção e `git show HEAD:<arquivo> | sha256sum`, comparados com os `restoredSha256` do `mutants.json`.

### Verificações estáticas

- `npm run -s typecheck`: exit 0.
- `npx eslint <8 arquivos .ts tocados>`: exit 0.
- `npx prettier --check <9 arquivos tocados>`: OK.

### Testes focais, sem PG

Primeira execução, com `npx vitest run`:
- `oidc-login-routes`, `oidc-login-guards`, `oidc-login-config`, `oidc-authority`, `case-principal-producer`, `oidc-login-boundary`, `oidc-identity`, `oidc-login-transaction`, `production-bootstrap-own` e `operator-session-hook`;
- mais os dois arquivos PG, que ficam pulados.
- Resultado: 10 arquivos e 316 testes verdes, 8 pulados. Na r1 eram 313, e os 3 a mais são os casos novos.

Segunda execução, com `npx vitest run`:
- os testes sem PG que usam `buildServerFromEnv`: `build-server-from-env-boundary`, `identity-composition-wiring`, `secretary-bootstrap` e `webhook-security`;
- resultado: 38 verdes e 2 pulados.

### Sonda só de leitura, fora do repositório

- **Script:** `<scratch>/critic-r2-probe/probe.mts`, rodado com `npx tsx`. Importa `oidc-config.ts`, `server.ts` e o suporte do IdP, sem escrever nada.
- **Resultados:**
  - `authorityVersion` de `validEnv` ≠ `'oidc-v1-'.padEnd(72, '0')`;
  - `[::1]` é recusado no redirect;
  - `127.0.0.1` e `localhost` são aceitos;
  - divergência só de `consoleOrigin` → "operatorLogin does not match the OIDC configuration";
  - divergência só de versão → a mesma mensagem;
  - os dois campos iguais passam pela guarda.
- **Banco:** as URLs de banco apontavam para `127.0.0.1:1`.

### Mutantes

Só leitura de `mutants-runner.py:209-243` (C1–C6) e de `mutants.json`. Nenhuma aplicação.

## Não conferido nesta rodada

- **PG:** O6 (PG), O9 com o caso novo do O4, O10 com a asserção nova do discovery, e as suítes de regressão. Ficam com o executor (ver o veredito).
- **Suíte completa** `apps/api packages/persistence`: não rodei, para não disputar portas e CPU com os gates em curso.
- **Gates com claim próprio:** E2E, `certify`, `sbom`, `licenses:check`, `coverage:critical`, `mutation:guard` e `skip:governance`. O `skip:governance` reescreve um arquivo versionado na árvore compartilhada.
