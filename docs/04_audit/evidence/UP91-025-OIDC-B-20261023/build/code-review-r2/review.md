# Revisão de código independente r2: BUILD da SPEC0259 r3 (U08, fatia B1)

- Task: `UP91-025-OIDC-B-20261023`
- SPEC: `docs/02_spec/0259_oidc_console_distinct_hosts.md` r3, sha256 `ad0282a096d9f9ed21c9294ddbe4f51d913823022c31411cc5ea642b55b4778a` (conferido no arquivo)
- Base: `f06a6613`. Candidata: `6fe1b3b85` (6 commits: S0, passo 1, passo 2, mutantes, sha do SKIP-PG-041 e correções da r1)
- Diff revisado:
  - completo: `git diff f06a6613..HEAD -- . ':(exclude)docs/04_audit/evidence'` (48 arquivos);
  - delta da r1: `git diff f558d998..6fe1b3b8` (9 arquivos de código e teste, mais a evidência da r1).
- Revisor: crítico independente, contexto novo, segunda e última rodada. Não escrevi a SPEC nem o código.
- Escrita: só estes dois arquivos. Nenhum outro arquivo do repositório foi alterado. Os testes de contraprova rodaram com uma configuração do vitest no scratchpad da sessão, fora do repositório.

## Veredito: APPROVE

Os dois obrigatórios da r1 estão corrigidos. Os testes novos do M1 falham com o código da r1, e as asserções novas do M2 separam a recusa dos caminhos de indisponibilidade. O delta não trouxe regressão nem contradição com a SPEC. A passada independente no diff completo não achou obrigatório novo.

Ficam três condições de gate, que não são obrigatórios de código, mas precisam estar na evidência antes do PR (§12 e aceite 17):

- **C1. Rodar a Q9 de novo.** As asserções novas em Chromium (M2, O1 e O4 da r1) ainda não têm execução registrada nesta candidata. Falta uma execução verde de `npm run test:e2e:oidc-hosts` na HEAD final, com o relatório validado pelo contrato: `passed = total`, zero `skipped` e zero `flaky`.
- **C2. Rodar de novo os mutantes dos arquivos alterados.** O delta mudou `apps/api/src/oidc-routes.ts` e `apps/web/src/App.tsx`. Os sha atuais desses dois arquivos não batem mais com o `baseline` de `build/mutants/mutants.json`. Precisam rodar de novo na HEAD final:
  - em `oidc-routes.ts`: N11, N13, N14, N15 e N28;
  - em `App.tsx`: N17, N19, N20 e N24.

  Os outros oito arquivos do `baseline` continuam com o mesmo sha.

  **Em andamento:** durante esta revisão, o executor gravou `build/mutants/mutants-6fe1b3b8.json` (ainda não versionado). Os 10 sha do `baseline` desse arquivo batem com a HEAD. Os 28 mutantes estão com `restored` verdadeiro e com saída 1 na prova unitária, e na de navegador quando ela existe.

  Ainda falta versionar o arquivo e citá-lo no relatório. Não conferi as falhas citadas uma a uma.
- **C3. Gates da §12 na candidata final:** `lint`, `typecheck`, `prettier`, `skip:governance`, `docs:check-links`, `test:postgres`, cobertura e E2E.

## Estado dos obrigatórios da r1

### M1 (saída padrão do callback): corrigido

- **Código:** `apps/api/src/oidc-routes.ts`:
  - `:187-198`, `failureStatus`: lê `statusCode` e depois `status` numéricos; sem classe, vale 500;
  - `:505-525`, o `catch` externo:
    - se a resposta já saiu, relança o erro;
    - senão, tira todos os `Set-Cookie`, recalcula a limpeza do pendente com `login.authority.clearPendingCookie()` (o perfil vem da autoridade) e pousa em `negado` para a classe 4xx e em `indisponivel` para o resto.
- **Teste:** `apps/api/src/__tests__/oidc-console-hosts-api.test.ts:1168-1215`. São quatro casos, com a falha injetada fora da tabela, no log de sucesso do passo 9, depois de a sessão existir e antes de qualquer `Set-Cookie`:
  - erro sem classe;
  - 5xx por `statusCode`;
  - 4xx por `statusCode`;
  - 4xx por `status`.

  O teste confere quatro coisas:
  - o `Location` exato;
  - corpo vazio;
  - um único `Set-Cookie`, que é a limpeza `__Host-cvg_oidc_pending` com `Path=/`, `Secure` e `Max-Age=0`;
  - nenhum cookie operacional.
- **Costura válida:** o `runtimeLogger` do `buildServer` é chamado fora do `safeTelemetry` (`apps/api/src/server.ts:1086`), então a exceção chega ao handler.
- **Contraprova (falha sem a correção):** carreguei o `oidc-routes.ts` de `f558d998` no lugar do atual, por um plugin `load` do Vite numa configuração do vitest fora do repositório, e rodei a Q5. Os quatro casos novos falham:
  - nos quatro, "expected [] to have a length of 1": a r1 não apagava o pendente;
  - nos dois casos de 4xx, também o `Location`: esperado `negado`, recebido `indisponivel`.

  Os outros 7 testes da Q5 passam nas duas versões.
- **Na HEAD:** `oidc-console-hosts-api.test.ts` com 31 de 31 verdes.

### M2 (Q9i3 sem prova do "negado"): corrigido no código; a execução em Chromium é a condição C1

- **Borda:** `tests/support/oidc-hosts/edge.ts:37-41`, `:246-255` e `:288-293`. A borda registra só a categoria fixa do `Location` do callback (`console`, `negado`, `indisponivel`, `other` ou `none`), nunca a URL. Ela usa o `Location` da resposta real da API, antes de repassar os cabeçalhos ao navegador.
- **Asserções novas no spec:**
  - `tests/e2e-oidc-hosts/oidc-hosts.spec.ts:854`: i2 com `negado`;
  - `:944-945`: i3 com `negado`, e o `__Host-cvg_oidc_pending` da vítima some de `context.cookies()`, pela I8;
  - `:1109`: Q9m, com o token endpoint 500, dá `indisponivel`.
- **Por que agora discrimina:** nos três caminhos que a r1 apontou (limite do callback, erro do limitador e store de state fora), a API responde 303 `indisponivel` e mantém o pendente. As duas asserções novas da i3 falham nesses três casos. Elas só passam no ramo de recusa dos passos 2 a 4. Esse ramo, junto com a contagem do token sem mudança e o controle de material vivo, isola a recusa por state.
- **Verificações:**
  - `edge.consoleOrigin` recebe `origins.console` (`tests/support/oidc-hosts/environment.ts:283`), a mesma origem normalizada que a API usa no `Location`;
  - o host da entrada da borda vem sem porta (`edge.ts:128`);
  - `GET /edge-log` devolve a entrada inteira, com `landing` (`environment.ts:518-529`).

  Um erro em qualquer um desses pontos faria o teste falhar; não faria o teste passar sem prova.

## Opcionais da r1 declarados como feitos

| Item | Onde | Conferência |
| --- | --- | --- |
| O1, 403 real legível | `oidc-hosts.spec.ts:602-619` | Um Supervisor faz `fetch` credenciado de `POST /v1/tasks` com JSON pela página do console e espera `{status: 403, code: 'forbidden'}`. A ordem em `server.ts:1857-1866` é `requireIdentity(..., 'task:update')` antes do parse do corpo, então o 403 vem da permissão e não da validação. Ritmo: o `login` reserva as próprias vagas. |
| O2, mensagem de pouso antiga | `App.tsx:274-275` e `:289` | A mensagem é zerada depois do primeiro uso, no sucesso e no 401. Com "indisponível", ela fica guardada até o próximo 401, o que é coerente. Não há teste próprio (aceitável num opcional). |
| O3, foco depois de falha do start | `App.tsx:238-240`, `:417` e `:455`; teste em `oidc-console.test.tsx:414` | A correção existe, mas o teste não a discrimina (ver o opcional O1 desta rodada). |
| O4, fronteira e vazamento | `tests/oidc-hosts-support.test.ts:139-156` e `oidc-hosts.spec.ts:1163-1170` | A varredura agora cobre `products/` e `scripts/`, com mínimo de 50 arquivos. O canário positivo e `secrets > 10` também estão lá. A checagem de lockfile não entrou (ver o opcional O3 desta rodada). |
| O5, caminho do relatório | `scripts/oidc-hosts-browser-proof-contract.mjs:1-3` | Comentário alinhado com `certification/logs/`. |
| O6 e O7 | relatório do BUILD | Continuam valendo como registro. |

## Obrigatórios novos

Nenhum.

## Opcionais desta rodada

- **O1. O teste do foco da r1 (O3) não discrimina.**
  - **Onde:** `apps/web/src/__tests__/oidc-console.test.tsx:414`.
  - **Contraprova:** carreguei o `App.tsx` de `f558d998`, sem `focusRequest`, pelo mesmo plugin. Os 42 testes de `oidc-console.test.tsx` passam, inclusive "offers the login again when the start fails with 503/429/network".
  - **Por quê:** o foco já estava em "Entrar" pelo efeito do estado `authentication_required`, e o `fireEvent.click` não move o foco. O jsdom também não aplica a regra de "focus fixup" quando o botão focado fica desativado. No Chromium, o foco sairia do botão desativado, e é isso que a correção trata.
  - **Sugestão:** antes do clique, tirar o foco do botão (por exemplo, `(document.activeElement as HTMLElement).blur()`) ou focar o aviso. Outra opção é conferir `toBeFocused()` em Chromium depois de um start com 503 injetado pela borda.
- **O2. A saída padrão apaga o pendente também quando a falha nasce no passo 1 ou no ramo de store fora do passo 3.**
  - **Onde:** `oidc-routes.ts:381-386` e `:414-415`. Se `deps.log` lançar nesses ramos, o `catch` (`:514-524`) devolve o pouso com a limpeza do pendente. Pela tabela da §4.5 e pela I8, o passo 1 deixa o pendente intocado e o store fora o mantém.
  - **Alcance:** só acontece se o `runtimeLogger` lançar (`server.ts:1086`).
  - **Efeito:** só obriga um novo login, no sentido seguro.
  - **Sugestão:** uma variável de estágio no handler (`untouched` antes do passo 2, `keep` no ramo de store fora, `clear` no resto) que o `catch` respeita. Outra opção é proteger o `log` com `try` nesses ramos.
  - **Nota sem risco:** uma falha depois do passo 8 deixa um registro de sessão sem cookie entregue, que ninguém conhece e que expira no `exp`.
- **O3. "Lockfile sem mudança" da Q10 sem checagem automática.** Conferi que `git diff f06a6613..HEAD -- package-lock.json` está vazio. Sugestão: registrar no relatório do BUILD o sha256 do `package-lock.json` na base e na HEAD.

## O que conferi

### Delta `f558d998..6fe1b3b8`, regressão e contradição com a SPEC

- **CORS** (`http-security.ts`): o delta não toca no arquivo; o sha é o mesmo do `baseline` dos mutantes. Continuam valendo:
  - ACAC só para `credentialedOrigin`, posto no `onRequest`;
  - preflight credenciado limitado a `GET, POST, PATCH` e `accept, content-type`;
  - 403 sem ACAO para origem negada.
- **Cookies e comparação exata** (`operator-session.ts`, `oidc-login-transaction.ts`): sem mudança no delta. A limpeza nova do `catch` usa a função da autoridade, que tem o perfil fixado na composição. A composição recusa perfis divergentes (`server.ts:505-514`).
- **CSRF:** a guarda não muda (`oidc-routes.ts:103-151`). Ela reconhece os dois nomes, com o corte mais largo.
- **Cache:** o pouso do `catch` passa pelos mesmos `onSend`. A Q4 e a Q5 conferem `private, no-store` nos 303.
- **Callback 303 com destino fixo:**
  - o `land` usa só `login.consoleOrigin` e os dois fragmentos;
  - o `catch` não lê nada da requisição;
  - o teste de destino fixo da Q5 continua verde.
- **Console J1, J3 e J8:**
  - o delta do `App.tsx` só zera a mensagem de pouso e reaplica o foco;
  - não muda a checagem de origem, o transporte nem os estados;
  - continua havendo um único `fetch` (`client.ts:751`), sem storage nem `document.cookie`.
- **J10:** sem mudança fora do modo OIDC.
- **Fronteira Q10:** o teste novo amplia a varredura, e a borda registra só a categoria do pouso, sem segredo.

### Passada independente no diff completo contra a SPEC

- **§3, invariantes J1 a J11:**
  - J2 e J5, nomes e guarda: `operator-session.ts`, `oidc-login-transaction.ts` e `oidc-routes.ts`;
  - J4: `http-security.ts:251-405`;
  - J6: `oidc-routes.ts:365-371` e `:497-499`, mais `origin.ts:127-137`;
  - J7: `server.ts:1096-1106`;
  - J9: só `NODE_ENV=test`, sem mudança na I4;
  - J11: sem migration e sem mudança no lockfile.
- **§4.1:** perfil HTTPS em `oidc-config.ts:377-389`; a mensagem nomeia a variável. `API_REQUIRE_HTTPS` é lido do mesmo jeito (`=== 'true'`) na configuração e em `parseBooleanEnv`.
- **§4.3:**
  - nome, serialização, limpeza e leitura recebem o perfil obrigatório;
  - `readExactCookieValues` apara só SP e HTAB e ignora segmento sem `=`;
  - duplicata falha fechada;
  - o pendente `__Host-` exige redirect `https:`.
- **§4.4:** o `onSend` é registrado depois do `onSend` das rotas OIDC. As probes não mudam.
- **§4.5:** a tabela foi conferida linha a linha no handler. Os testes da A trocam só o resultado do callback e o `cache-control`, sem afrouxar contagem, pendente, cookie operacional nem auditoria.
- **§4.6 e §4.7:**
  - validador do perfil de build: `origin.ts:53-91`;
  - guarda do bundle: `generateBundle` em `vite.config.mts`;
  - `apiUrl`: `origin.ts:99-118`;
  - cabeçalhos do perfil OIDC limitados a `accept` e `content-type`: `client.ts:717-738`;
  - `credentials: 'include'` fixo.

  As variáveis novas de build não aparecem em `Dockerfile`, CI nem deploy, então o build atual não muda.
- **§4.8:** os textos, os estados, o fragmento lido uma vez e limpo com `replaceState`, o "Entrar" com `fetch` e `location.assign` só para `https:` sem credenciais, o logout e o foco batem com a SPEC. Painel 403 em todos os perfis.
- **§4.9:**
  - o modelo NGINX repete CSP, `nosniff` e `Referrer-Policy` com `always` em cada `location`;
  - `/v1`, `/v1/`, `/health`, `/live` e `/ready` dão 404;
  - o SPA tem `no-store`;
  - o renderizador recusa origem não exata e placeholder restante.
- **§5 e §7:**
  - erros conferidos;
  - os 48 arquivos estão na §7 ou nos desvios aceitos pela r1;
  - nada em migrations, `packages/**`, `apps/worker/**`, `products/**`, `legacy/**`, `main.ts`, `Dockerfile`, `deploy/harness/**`, `deploy/nginx.web.conf` ou `package-lock.json`.
- **§9:** Q9a a Q9o conferidas contra o texto. A Q9i tem os controles positivos de i1, i2 e i3, o material vivo com limite de 50 s e as reservas de vaga. Com o delta, o "negado" da i3 também é provado. A Q10 tem histórico pelo CDP, `leakCheck` com canário e a fronteira.
- **§10:** os mutantes N1 a N28 estão registrados como mortos no `mutants.json`, com a ressalva da C2.
- **§11:** os aceites 1 a 16 são cobertos pelo código e pelos testes. Os aceites 17 a 19 dependem de C1, C2 e do gate de CI (PB6).
- **§14:**
  - regra de rebase 1, ordem dos hooks: cumprida e testada na Q2;
  - regra 2, função única com perfil obrigatório: cumprida;
  - regra 3, saída padrão do callback: cumprida agora (M1).
- **Governança:**
  - gate `browser-oidc-hosts` com `skipPolicy: 'none'`;
  - `verifiedGateCount` 35;
  - o job de CI já tem PostgreSQL em `TEST_DATABASE_URL` (`verify.yml:28-32`);
  - o sha do SKIP-PG-041 (`a49d9158…`) bate com o arquivo na HEAD.

### Testes que rodei (somente leitura, Node 22.23.2)

- **Na HEAD:**
  - `oidc-console-hosts-api`, `oidc-console` e `tests/oidc-hosts-support`: 3 arquivos, 96 testes verdes;
  - `oidc-login-routes`, `oidc-login-guards`, `oidc-login-transaction`, `operator-session`, `operator-session-hook`, `http-security`, todo o `apps/web`, `tests/oidc-hosts-browser-proof` e `tests/ci-bar-contract`: 40 arquivos, 276 testes verdes.
- **Contraprovas**, com o arquivo da r1 carregado por plugin `load` num `vitest.config` do scratchpad:
  - Q5 com o `oidc-routes.ts` da r1: os 4 casos novos falham, os 7 antigos passam;
  - `oidc-console` com o `App.tsx` da r1: 42 de 42 passam (base do opcional O1).

## O que não conferi

- A execução em Chromium das asserções novas: `npm run test:e2e:oidc-hosts`, com o relatório em `certification/logs/oidc-hosts-browser-proof.json` (C1). Pela regra da rodada, não rodei a prova de navegador.
- A nova rodada dos mutantes N11, N13, N14, N15, N17, N19, N20, N24 e N28 na HEAD final (C2).
- `test:postgres`, `rem21-014`, `critical-flows`, o Playwright padrão, cobertura, `coverage:critical`, mutation guard, `lint`, `typecheck`, `prettier`, `skip:governance`, `docs:check-links`, `npm audit` e o gate novo no CI (C3).
- O relatório do BUILD, que ainda não existe neste worktree.
