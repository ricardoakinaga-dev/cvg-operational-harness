# Revisão de código independente r1: BUILD da SPEC0259 r3 (U08, fatia B1)

- Task: `UP91-025-OIDC-B-20261023`
- SPEC: `docs/02_spec/0259_oidc_console_distinct_hosts.md` r3, sha256 `ad0282a096d9f9ed21c9294ddbe4f51d913823022c31411cc5ea642b55b4778a` (conferido no arquivo)
- Base: `f06a6613`. Candidata: `f558d998` (5 commits: S0, passo 1, passo 2, mutantes, sha do SKIP-PG-041)
- Diff revisado: `git diff f06a6613..HEAD -- . ':(exclude)docs/04_audit/evidence'` (48 arquivos). A evidência foi lida, mas não foi tratada como código.
- Revisor: crítico independente, contexto novo. Não escrevi a SPEC nem o código. Nenhum arquivo do repositório foi alterado além destes dois.

## Veredito: REVISE

O contrato de segurança da API e do console está correto e bem provado. CORS com credenciais, cookies `__Host-`, comparação exata do nome, guarda de CSRF, `private, no-store`, destino fixo do 303, origem fixa do console, transporte único e bundle sem o caminho do token batem com a SPEC. Os testes da fatia A foram ajustados só no resultado do callback e no `cache-control`, sem afrouxar asserção. Os 28 mutantes foram aplicados de verdade, cada um morto pela prova citada, e os bytes foram restaurados.

Ficam dois obrigatórios, ambos pequenos:

1. a saída padrão do callback, uma das três regras de rebase com a U04, não segue a I8 nem a classe 4xx;
2. a Q9i3 não prova o "negado" que a SPEC exige e pode passar por um caminho de indisponibilidade.

## Obrigatórios

### M1. A saída padrão do callback contraria a §4.5: o pendente não segue a I8 e a classe 4xx não vira "negado"

- **Onde:** `apps/api/src/oidc-routes.ts:492-498`, o `catch` externo do handler do callback, com `reply.removeHeader('set-cookie')` e depois `return land('indisponivel')`. O teste do O5 está em `apps/api/src/__tests__/oidc-console-hosts-api.test.ts:1155-1166`.
- **O que diz a SPEC:** na §4.5, último item, "saída padrão (regra de rebase com a U04)": uma falha nova do handler "vira 303 `#cvg-login=indisponivel` se for da classe 5xx e `#cvg-login=negado` se for da classe 4xx. O pendente segue a I8 da A". A I8 (`0254:78`) manda apagar o pendente "em toda resposta a partir do passo 2, exceto quando o próprio store de state está indisponível (passo 3)".
- **O que o código faz:**
  - toda exceção que chega ao `catch` vira `indisponivel`, sem olhar a classe;
  - a resposta não apaga o pendente: o `removeHeader` tira também a limpeza;
  - toda exceção que chega a esse `catch` nasce no passo 2 ou depois, porque as falhas do passo 1 já são tratadas em `:362-373`. Pela I8, essa resposta teria de apagar o pendente.
- **Por que é obrigatório:**
  - contradiz o texto normativo da SPEC;
  - é justamente a regra que a SPEC fixa para o rebase com a U04 (a releitura do principal da SPEC0262 "cai na saída padrão da §4.5", §14.1 PB14);
  - hoje a saída só é alcançável por erro de programação; depois da U04, uma recusa de classe 4xx sairia como "indisponível" e deixaria o pendente no navegador;
  - o teste atual só cobre o caso em que o próprio `clearPendingCookie` lança, onde não há como limpar, e por isso não detecta o problema.
- **Correção esperada:**
  - no `catch`, depois de remover os `Set-Cookie` (para nunca deixar sair um cookie de sessão parcial), pôr de volta a limpeza do pendente quando ela existir. Ela pode ser calculada antes dos passos, ou pela função única do cookie pendente com o perfil;
  - mapear para `negado` um erro com `statusCode` ou `status` numérico entre 400 e 499 e o resto para `indisponivel`;
  - na Q5, um teste com falha injetada por outra costura que não seja o `clearPendingCookie`, em dois casos: um erro genérico e um erro de classe 4xx. Por exemplo, um store de sessão sintético cujo registro faça a serialização lançar, ou um `vi.mock` de dependência do handler. O teste confere o `Location`, a limpeza do pendente (`Max-Age=0`, `Secure`, nome do perfil) e a ausência de cookie operacional.

### M2. A Q9i3 não prova o "negado" exigido e pode passar por um caminho de indisponibilidade

- **Onde:** `tests/e2e-oidc-hosts/oidc-hosts.spec.ts:911-932`. Sobre o callback da vítima já autenticada, o teste confere só três coisas: `expect(callback.status).toBe(303)`, a identidade da vítima na tela e em `GET /v1/session`, e a contagem de chamadas ao token sem mudança. O comentário em `:921` afirma "The refusal lands on 'negado'", mas nada confere isso.
- **O que diz a SPEC:** a §9, Q9i3, lista entre os itens exigidos: "o callback com o code do atacante dá 'negado'". A abertura da Q9i diz: "Nenhuma pode passar vazia".
- **Por que é obrigatório:** os fatos que o teste confere também acontecem nos caminhos de indisponibilidade que não leem cookie nenhum:
  - limite do callback (429, passo 1) e erro do limitador: 303 `indisponivel`, sem chamada ao token, sessão da vítima intacta;
  - store de state indisponível (passo 3): o mesmo efeito.

  Nesses casos, o controle de material vivo que vem depois também passa, porque o state do atacante não foi consumido. O desfecho negativo da i3 pode, portanto, passar sem que a recusa tenha acontecido. O relatório afirmaria uma prova que o teste não faz.
- **Correção esperada:** conferir a categoria do pouso no callback da i3. Três formas servem:
  - ler o `Location` do 303 pela resposta de redirecionamento (`request.redirectedFrom()` ou `page.on('response')`);
  - fazer a borda registrar só a categoria fixa do fragmento do `location` do callback, que não é segredo;
  - pelo menos conferir que o `__Host-cvg_oidc_pending` da vítima sumiu de `context.cookies()` depois do callback. Pela I8, a recusa o apaga; o limite e o store fora o mantêm. Junto com a contagem do token sem mudança, isso isola o ramo de recusa dos passos 2 a 4.

  Depois, rodar a Q9 de novo.

## Opcionais

- **O1. 403 real legível no navegador (desvio c).** O 403 da Q9e vem da borda, que acrescenta ACAO e ACAC por conta própria (`tests/support/oidc-hosts/edge.ts:175-186`). Assim, a Q9e prova o texto da UI, mas não que um 403 real da API chega legível ao console com CORS credenciado; isso só está provado por `inject` (Q2). Um complemento barato: na Q9e, a página do console de um Supervisor faz um `fetch` credenciado de `POST /v1/tasks` com `content-type: application/json` (403 real, falta `task:update`) e confere o status 403 legível, e não uma falha de rede. O desvio (c) e a exploração da matriz de papéis devem constar do relatório do BUILD.
- **O2. Mensagem de pouso antiga.** `landingRef` (`apps/web/src/App.tsx:239`, `:283`, `:335-337`) nunca é zerado. Um 401 posterior no `loadTrustedSession`, por exemplo depois de "Tentar novamente" a partir de "indisponível", volta a mostrar "Não foi possível entrar com esta conta." ou "Login indisponível…" de um pouso antigo. Sugestão: zerar depois do primeiro uso.
- **O3. Foco depois de falha do start.** Em `apps/web/src/App.tsx:430-452`, rede, 429 ou 5xx não mudam o estado; o botão fica desativado durante a tentativa e o foco não volta para "Entrar". Sugestão: devolver o foco explicitamente (acessibilidade da §4.8) e conferir isso na Q6.
- **O4. Fronteira e vazamento (Q10).**
  - `tests/oidc-hosts-support.test.ts:150-175` varre `apps`, `packages`, `legacy` e `deploy`, mas não `products/` nem `scripts/`.
  - Não há checagem de lockfile sem mudança.
  - O `leakCheck` (`tests/e2e-oidc-hosts/oidc-hosts.spec.ts:1138-1145`) não confere `secrets > 0` nem tem um canário positivo.

  Sugestão: acrescentar esses três controles.
- **O5. Caminho do relatório (desvio b).** O cabeçalho de `scripts/oidc-hosts-browser-proof-contract.mjs:1` ainda cita `certification/oidc-hosts-browser-proof.json`, mas o runner grava em `certification/logs/`. Sugestão: alinhar o comentário e registrar o desvio no relatório do BUILD e na promoção do contrato pelo lead.
- **O6. Morte do N6 no navegador.** No `mutants.json`, o N6 falha na Q9i num auxiliar: `setCookieValue(done, HOST_SESSION)` nulo leva a "reading 'identity'". A falha não vem do desfecho de cookie tossing. A morte pela Q3 é a que vale; vale anotar isso no relatório ou citar uma asserção de desfecho.
- **O7. Texto da i3.** A SPEC pede na i3 "os mesmos controles positivos de i2", que incluem "e não `__Host-cvg_oidc_pending`". Isso não vale na i3, porque o pendente vivo da vítima viaja no callback. O teste adapta corretamente (só confere o nome legado presente); vale registrar a adaptação no relatório.

## Julgamento dos desvios declarados

| Desvio | Julgamento |
| --- | --- |
| (a) spec em `tests/e2e-oidc-hosts/` | **Aceito.** `playwright.config.ts:23-25` pega `tests/e2e/**/*.spec.ts`; dentro de `tests/e2e/`, a prova entraria no Playwright padrão sem o ambiente. Fica fora do `include` do vitest (`.spec.ts`) e dentro do `typecheck` (`tests/**/*.ts`). |
| (b) relatório em `certification/logs/` | **Aceito**, com O5. `certification/logs/` está em `EXCLUDED_PREFIXES` de `scripts/ci-bar.mjs:54` e no `.prettierignore`. O `ci-bar` tira o snapshot do artefato por gate e confere a data. O runner valida o contrato com vínculo de run e candidato e sai com 1 em falha. |
| (c) 403 da Q9e pela borda | **Aceito**, com O1 e registro. `packages/shared/src/auth.ts:4-31` dá `*:view` a Operator, Approver e Supervisor; a UI esconde ações por papel (`App.tsx:1111-1119`). Nenhum 403 real de painel é alcançável pela UI com a matriz sintética. A SPEC deixou a escolha da rota ao BUILD, e o relatório registra a limitação. |
| (d) `ci-bar-contract.test.js`, `verifiedGateCount` 35 e sha do SKIP-PG-041 | **Aceito.** São consequências diretas da PB6 e do ajuste do teste de PG. Conferi o sha `a49d9158…` contra `HEAD:apps/api/src/__tests__/oidc-login-postgres.test.ts`; `tests/ci-bar-contract.test.js` passa (8/8). |
| (e) adendo à SPEC0107 não escrito | **Aceito.** A §4.12 diz "promoção pelo lead". Fica como pendência registrada antes do merge; não bloqueia o código. |
| (f) `node_modules` de outro worktree | **Aceito** para a evidência local, se o lockfile for idêntico (não há mudança de lockfile no diff). O relatório deve registrar o sha do lockfile usado; o CI instala limpo. |

## O que conferi

### 1. Segurança do contrato da API

- **CORS** (`http-security.ts`):
  - ACAC só quando `origin === credentialedOrigin`, posto no `onRequest`, logo antes do 204 do preflight e das respostas reais;
  - o 426 sai antes e fica sem CORS;
  - origem fora da allowlist recebe 403 antes de qualquer cabeçalho;
  - preflight credenciado limitado a `GET, POST, PATCH` e `accept, content-type`; as outras origens permitidas mantêm a lista atual sem ACAC;
  - `credentialedOrigin` vem só de `operatorLogin.consoleOrigin` em `buildServer` (`server.ts:495-499`), então nenhum chamador o liga sem OIDC;
  - os hooks têm nome, e o teste da Q2 fixa as posições 0 e 1;
  - o error handler do Fastify preserva os cabeçalhos, exceto `content-type` e `content-length`, então o 500 leva ACAO e ACAC (provado na Q2).
- **Cookies** (`operator-session.ts`, `oidc-login-transaction.ts`):
  - perfil `host-prefixed` só com OIDC e `enforceHttps`;
  - nome, serialização, limpeza e leitura recebem o perfil sem valor padrão (`policy` e `cookieProfile` obrigatórios no tipo, mais checagem em tempo de execução em `validateOptions`);
  - `Secure` sempre no `host-prefixed`, `Path=/`, sem `Domain`;
  - o `host-prefixed` exige redirect `https:`.
- **Comparação exata do nome:**
  - `readExactCookieValues` corta por `;`, ignora segmento sem `=`, apara só SP e HTAB e compara por igualdade;
  - os dois parsers usam essa função, e duplicata falha fechada;
  - a sonda S0 9 mostra que o Chromium 147 grava e envia `\xA0__Host-cvg_oidc_pending` com `Domain`, e o servidor não o lê (Q3 por `inject` e por socket cru com o byte `0xA0`, nos dois perfis).
- **Guarda de CSRF:** reconhece os dois nomes com o corte mais largo (`;` e `,`, `trim()` do JavaScript). Conferi que o corte da guarda sempre contém o do parser exato.
- **Cache:** com OIDC, `private, no-store` em todo `/v1/**` por um `onSend` registrado depois dos de `oidc-routes.ts:208` e `server.ts:857`. A Q4 cobre o inventário de rotas e os status 200, 303, 401, 403, 404, 429 e 503; as probes não mudam.
- **Callback:**
  - 303 com `login.consoleOrigin` fixo e só dois fragmentos; corpo vazio;
  - pendente conforme a tabela da §4.5 nos casos tabelados;
  - `return_to`, `Host`, `X-Forwarded-Host`, `Origin` e `Referer` não mudam o destino (Q5);
  - a saída padrão tem o problema do M1.
- **Configuração do perfil HTTPS** (`oidc-config.ts:377-389`): console `https:`, `hostname` diferente do host do redirect e redirect `https:`; a mensagem nomeia a variável sem o valor (Q1, por `parseOperatorLoginConfig`, `buildServerFromEnv` e `buildApiWithProductionSessions`).
- **Composição com perfis divergentes:** recusada em `server.ts:505-514` (Q3, N26).

### 2. Console

- **J1:** a origem é calculada uma vez e, com `configuration_error`, não há nenhuma chamada.
- **Transporte único:** `resolveApiUrl` e o único `fetch` do console (`client.ts:751`). No perfil OIDC, o cliente recusa cabeçalho fora de `accept` e `content-type` antes da requisição; `credentials: 'include'` em toda chamada.
- **J3:** o provider de token e o cabeçalho ficam atrás de `__CVG_OPERATOR_LOGIN__`, e o plugin `generateBundle` recusa os dois textos proibidos (Q7, N21). O console não usa storage nem `document.cookie`.
- **Textos da §4.8:** conferidos um a um.
- **J8:** rede, 429 e 5xx viram `unavailable` com "Tentar novamente"; 401 vira `authentication_required` ou `expired`; o logout mantém o comportamento atual.
- **Painel 403** em todos os perfis.
- **Foco:** vai para o botão de ação ou para o aviso (`tabIndex=-1`). O fragmento só é lido no valor exato e é limpo com `replaceState`.
- **Perfil de build** (`origin.ts:53-91`): perfil parcial, `trusted`, sem teste controlado, `NODE_ENV` diferente de `test`, origens `https:` exatas em hosts distintos.

### 3. J10

- Sem OIDC, `credentialedOrigin` é nulo, o perfil é `legacy` com o mesmo `Secure` de antes, a guarda e o `onSend` de cache não são instalados, e os textos atuais ficam.
- Mudanças de todos os perfis:
  - a comparação exata (inclui ignorar segmento sem `=`, conforme a regra 2 da §4.3);
  - o texto de 403;
  - `credentials: 'include'` fixo, sem chamador que passe outro valor.
- `http-security.test.ts` e `tests/e2e/http-security.spec.ts` sem mudança.
- Comparei cada teste alterado da A com a base:
  - `oidc-login-routes.test.ts`: troca 401/503 JSON por 303 com `Location` exato e corpo vazio e mantém pendente, cookie operacional, contagens e auditoria;
  - `oidc-login-postgres.test.ts`: mesma troca;
  - `oidc-login-guards.test.ts`: só o `cache-control` (aperto) e o perfil do stub;
  - os demais testes: só a assinatura nova (perfil explícito).
- Nenhuma asserção foi afrouxada.

### 4. Provas

- Q1 a Q7, Q8 (renderizador e NGINX real) e Q10 existem e provam o pedido, com as ressalvas do M2 e do O4.
- Q9 (a a o) conferida item a item contra a §9:
  - controles positivos da i1 e da i2 (plantio em `context.cookies()` com `.cvg.test` e nome na borda);
  - material vivo depois do desfecho na i2 e na i3, com limite de 50 s;
  - histórico pelo CDP;
  - leak check sobre a borda, a saída da API, o log do NGINX, o histórico e as anotações;
  - axe nos 7 estados;
  - ritmo DB10 com janela de 70 s, reservas, latência medida da soltura à resposta (O2 da SPEC) e falha no `afterEach`.
- Confiança TLS só por SPKI, sem `ignoreHTTPSErrors`; captura da i2 e da i3 por HTTP cru com a CA efêmera (O1 da SPEC).
- **Fronteira Q10:** nenhum arquivo de runtime importa o suporte (teste verde). O suporte só é importado por `tests/**`. `vite.config.mts` importa só `apps/web/src/api/origin.ts`.
- First red registrado em `build/first-red/`.

### 5. Conjunto de escrita (§7)

- Todos os 48 arquivos estão na §7 ou nos desvios julgados acima.
- Nada em migrations, `packages/**`, `apps/worker/**`, `products/**`, `legacy/**`, `apps/api/src/main.ts`, `Dockerfile`, `deploy/harness/**`, `deploy/nginx.web.conf`, `package-lock.json`, `playwright.config.ts`, `scripts/ci-bar.mjs` ou `scripts/lib/**`.
- `production-bootstrap.ts` não precisou mudar: a autoridade recebe o perfil de `config.cookieProfile`.

### 6. Mutantes

- Li `run-mutants.py` e `mutants.json`. Para os 28:
  - `shaMutated` difere de `shaBefore`;
  - `restored` é verdadeiro;
  - a falha citada casa com a regex da prova;
  - os itens de navegador citados falharam como `unexpected`.
- Os sha de base dos 10 arquivos-fonte mutados são iguais aos de `HEAD`.
- As mortes de navegador são pelo sintoma esperado (N2, N7, N8, N9, N10, N13, N14, N17, N19, N20, N22, N23 e N24), com a ressalva do N6 (O6).

### 7. Rebase com a U04

- Regra 1, ordem dos hooks: cumprida e testada.
- Regra 2, função única com perfil obrigatório: cumprida. O compilador recusa limpar o cookie sem perfil.
- Regra 3, saída padrão: parcial (M1).
- Riscos residuais:
  - a releitura do principal da U04 deve entrar dentro do `try` do callback e usar `refuse` ou `outage`, ou cair na saída padrão corrigida;
  - as funções v2 de sessão da U04 devem manter o parâmetro de perfil;
  - a Q9 roda de novo depois da U04 (PB14).

## Testes que rodei (somente leitura, vitest focal, Node 22.23.2)

- `oidc-console-hosts-api`, `oidc-login-routes`, `oidc-login-guards`, `oidc-console`, `panel-forbidden`, `tests/oidc-hosts-support` e `tests/oidc-hosts-browser-proof`: 7 arquivos, 183 testes verdes.
- `apps/web` inteiro mais `http-security`, `operator-session`, `operator-session-hook`, `oidc-login-transaction` e `operator-session-postgres`: 37 arquivos, 179 verdes e 16 pulados (PG sem `TEST_DATABASE_URL`, já catalogados).
- `tests/ci-bar-contract.test.js`: 8 de 8 verdes.

## O que não conferi

- A execução verde e integral de `npm run test:e2e:oidc-hosts` (Q8, Q9 e S0 no runner) e o relatório em `certification/logs/oidc-hosts-browser-proof.json`, que não existe neste worktree. Só vi as execuções parciais registradas nos mutantes e o S0 em `s0/`.
- `test:postgres`, `rem21-014`, `critical-flows`, Playwright padrão, cobertura, `coverage:critical`, mutation guard, `lint`, `typecheck`, `prettier`, `skip:governance`, `docs:check-links`, `npm audit` e o gate novo no CI.
- O comportamento real do NGINX além do que a evidência dos mutantes e da Q8 mostra.
- O relatório do BUILD, que ainda não existe.
