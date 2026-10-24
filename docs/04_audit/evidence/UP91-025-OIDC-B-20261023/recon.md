# Recon da U08 — UP91-025 fatia B (console OIDC em hosts HTTPS distintos)

- **Task:** `UP91-025-OIDC-B-20261023`. Executor: Claude Code (CONT-20261018-D9EF), por decisão do usuário de 23/10/2026.
- **Base:** `main` `9a56a9c94` (contém a fatia A, PR #20 `1e96e3657`). Worktree detached `/mnt/dados/cvg-work/cvg-d9ef-u08-oidc-b-20261023`.
- **Método:** leitura de código e documentos, `git show` dos commits isolados de 28/09 e `sha256sum`. Nada foi executado: sem teste, PG, contêiner, porta, install, rede ou navegador.
- **Âncoras:** `arquivo:linha` na base `9a56a9c94`, com tolerância de ±2 linhas. O backlog 0399 ainda não está na `main`; foi lido no checkout compartilhado, só leitura (sha256 `58b24e9b5b24b33386394a572ce0f1c062c2fa11ef440395346a024d30aee9a4`).

## Resumo

1. A fatia A entrega login, principal e sessão PG só com `NODE_ENV=test`. O console não consegue usar esse login em outro host por dez motivos concretos (R8).
2. A SPEC0150 está aprovada pelo usuário desde 28/09, só em texto. Nada dela está na `main`. Os builds de 28/09 são objetos soltos, sem ref, e não podem ser reaproveitados como commit (R3).
3. O CI atual tem o que a prova precisa (Chromium, PostgreSQL, `openssl`, Docker). A prova não roda hoje: falta um gate que a chame depois da instalação dos navegadores (R10).
4. A U08 não precisa da U04 para a ponte de navegador. Precisa só de ordem de merge em `server.ts` e no hook de sessão (R11).

## R1 — Cartão U08 e pais

1. **U08** (`0399_backlog_producao_aud0624.md:164-178`, checkout compartilhado): "SPEC0254-B/0150, console, cookies/CORS/CSP/NGINX". Como: reusar a fatia A e implementar só a ponte de navegador, com origem fixa e sessão por cookie, sem token em storage ou URL. Pronto: login, recarga só com cookie, logout e expiração; CSRF, origem ou redirect incorretos e tenant ou role indevidos recusados; a UI distingue "indisponível" de "sem permissão". Prova: navegador real em três hosts HTTPS sintéticos, teclado, acessibilidade e matriz de autenticação. Dependência no recorte: U04.
2. **UP91-025** (`0367_program_backlog_reaudit_2026-09-30.md:458-473`): pronto em `:469` ("autentica pelo entrypoint e hosts distintos"). O progresso de `:473` registra a fatia A e deixa abertas a B (console e hosts distintos) e a C (IdP real e produção).
3. **UP91-043** (`0367:721-733`): Chromium, Firefox e WebKit em 375, 768 e 1440 px, axe, revisão humana de teclado e leitor de tela, UAT. Depende de UP91-018, 020, 025, 026 e 042 (`:729`). A U08 entrega só a parte de login e sessão desse cartão.
4. Contratos da execução do Codex (`docs/04_audit/evidence/PROD0624-EXEC-20261023/unit-contracts.json`, checkout compartilhado): U08 copia o cartão; U04 depende de U03.

## R2 — SPEC0254 (fatia A) e o que ela deixou para a B

1. SPEC0254 r2, sha256 `3c804dc22c34b736b6d0c6bb5d683b6144a1d7d34dd083d33926d34afef49694`, aprovada pelo crítico na r2 ([spec-approval.json](../UP91-025-OIDC-20261022/spec-approval.json)). BUILD no PR #20.
2. Deixado explicitamente para a 0254-B:
   - tabela de fatias, `0254:21-25`: botão de login, transporte da SPEC0150 (origem de API fixa no bundle, CORS com credenciais, cookies `__Host-`, NGINX sem `/v1`, CSP) e Chromium com console, API e IdP em hosts HTTPS distintos;
   - "hosts distintos" sem prova na A, `0254:34`;
   - cookie tossing do pendente sem `__Host-`, `0254:166`;
   - resíduos, `0254:307`: inclui "CSRF no modo HMAC" e "defesa contra cookie tossing do pendente";
   - D8, `0254:458`: falhas do callback em JSON; "a 0254-B pode mudar para redirecionamento de erro no console";
   - D11, `0254:460`: CSRF por `Origin` só no modo OIDC; mudar o modo HMAC é da B.
3. Decisões de 22/10 ([user-decisions-20261022.json](../UP91-025-OIDC-20261022/user-decisions-20261022.json)): P1 `openid-client`; P2 grupos alheios ignorados; P3 deriva de role recusa; P4 o login só reduz; P5 versão inteira crescente; P6 credencial de migração no serving só em teste; P7 produção sem caso até a C. Nenhuma delas muda com a B. Nenhuma precisa ser perguntada de novo.
4. Relatório do BUILD da A ([build-report.md](../UP91-025-OIDC-20261022/build/build-report.md)): `:124` repete o escopo da B; `:118` deixa o RFC 9207 para a C; `:64` mostra que o O10 roda a API em `http://127.0.0.1:3456` (HTTP, sem `Secure`, sem `__Host-`).

## R3 — SPEC0150 e AUD-0580: aprovado, histórico e construído

1. **Aprovado.** `0150:5-7`: "BUILD_T3_APPROVED_USER", aprovação do usuário em 28/09 para BUILD e testes sintéticos. Também em `0356_production_backlog_2026-09-26.md:630`. A aprovação é só texto, sem hash. Hash atual `6d145311374a313ca637615f2a6c4ae3c390a3aca8fe0386c0e7a1fc55482473`, sem mudança desde `36c9166c4` (28/09).
2. **Contrato aprovado (resumo):**
   - item 1 (`0150:48-56`): build de produção exige origens HTTPS de console e API, hosts distintos; `location.origin` igual à origem compilada; só o perfil local sintético usa URL relativa;
   - item 2 (`:57-63`): transporte único com `credentials: 'include'`; falha de rede ou CORS é indisponibilidade; sem token persistido;
   - item 3 (`:64-77`): ACAO exato, ACAC e `Vary: Origin` só para a origem do console, inclusive em 401 e 503; `Cache-Control: private, no-store` em todo `/v1/**`;
   - item 4 (`:78-90`): `Origin` exato em mutação com cookie; o nome do cookie, mesmo malformado, não pula a checagem;
   - item 5 (`:91-104`): `__Host-cvg_operator_session` (`Strict`) e `__Host-cvg_oidc_pending` (`Lax`, 5 min) em HTTPS; produção rejeita os nomes antigos; nomes sem prefixo só no perfil HTTP sintético;
   - item 6 (`:105-114`): NGINX do console sem `/v1/`, CSP com `connect-src` da API do manifesto;
   - rollout e prova (`:116-168`): rollback só para bundle que já chama o host da API; prova de NGINX real, cache, cookie tossing e Chromium com dois hosts no mesmo site e IdP em outro site.
3. **Site.** `0150:39-44`: console e API no mesmo site; "o código não tenta inferir eTLD+1 por uma regra caseira". O follow-up isolado `ed012a4` fez o contrário: adicionou `tldts` 7.0.29 e uma checagem de mesmo site no `vite.config.mts` (`git show ed012a4 -- package.json`).
4. **Construído só fora de ref.** `7019422` e `ed012a4` (28/09) existem como objetos, mas `git for-each-ref --contains` é vazio e nenhum é ancestral do HEAD. A AUD0599 condição 4 já descartou integrá-los ([recon da A, R3](../UP91-025-OIDC-20261022/recon.md)). O desenho deles serve de referência; o código, não.
5. **Provas históricas** (não se atribuem à `main`):
   - [PR302-HTTPS-BROWSER](../PR302-HTTPS-BROWSER-20260928/proof.json): bundle e NGINX reais de `ed012a4`, hook HTTP real, mas sessão, IdP e handlers sintéticos. Veredito `SYNTHETIC_PRODUCT_TRANSPORT_PASS / CORPORATE_ENTRYPOINT_NOT_RUN`. O `probe.mjs` (`:216-222`) usa `--host-resolver-rules`; `:197-206` planta cookie de origem irmã; `:272-281` prova bloqueio por CSP; `:223` usa `ignoreHTTPSErrors`.
   - [PR301-CROSS-ORIGIN-PROBE](../PR301-CROSS-ORIGIN-PROBE-20260927/proof.json): diagnóstico importante para a prova nova. Um `page.goto` para um endpoint do IdP que redireciona na hora enviou o cookie `Strict` ao callback. A navegação precisa partir de um documento do IdP.
6. **AUD-0580** (sha256 `aa6ca2e69f50265aaac0f137896a821587e1c57bdf14b460c3ed5f97ec64eeec`): reproduziu a falta de `Access-Control-Allow-Credentials` (`0580:30-36`, `:53-56`) e o proxy `/v1` no NGINX (`:43-46`). Os hashes de arquivo da auditoria são do ramo isolado `85c2c7d`. O achado de ACAC continua verdadeiro na `main` (R5).

## R4 — Console (`apps/web`) hoje

1. Transporte relativo: `client.ts:727-731` faz `fetch(path, { credentials: 'include' })` com `path` como `/v1/session`. Não existe origem de API configurável (`vite-env.d.ts:1-5` só declara modo de identidade, teste controlado e modo web).
2. Proxy de desenvolvimento: `vite.config.mts:17-22` encaminha `/v1` e `/health` para `127.0.0.1:<porta>`. Não há perfil de produção com origens.
3. Sem botão de login. No modo trusted, o botão chama `loadTrustedSession('reauthenticating')` com o texto "Reautenticar" ou "Tentar novamente" (`App.tsx:1036-1056`).
4. Token de bootstrap ainda no bundle: `session.ts:55-81` lê `__CVG_OPERATOR_BOOTSTRAP_TOKEN__` de `window`; `client.ts:850-865` envia `x-cvg-operator-token`; `client.ts:100-116` (`tokenAuthHeaders`). No modo OIDC a API recusa esse cabeçalho com 401 (R6).
5. Estados de sessão: 401 inicial vira "Uma sessão confiável é necessária" (`App.tsx:216-229`); 0, 429 e ≥ 500 viram "indisponível" (`App.tsx:70-75`); expiração por timer e por 401 global.
6. **Painéis não distinguem "sem permissão" de "indisponível".** `App.tsx:54-58` usa a mesma mensagem ("Erro ao carregar dados operacionais.") para qualquer falha. Só existe o 404 de item (`App.tsx:81-85`). Nenhum tratamento de 403.
7. Sem `localStorage`, `sessionStorage`, IndexedDB, `document.cookie`, service worker ou leitura de `location.search`/`location.hash` em `apps/web/src` (busca sem resultado fora de testes).

## R5 — API: CORS, cookies, CSRF e cache hoje

1. **CORS sem credenciais.** `http-security.ts:339-359` (`applyCorsHeaders`) emite ACAO e `Vary: Origin`, nunca ACAC. Sem ACAC, o navegador não entrega ao JavaScript uma resposta credenciada de outra origem. Testes atuais exigem ACAC ausente quando não há origem de console: `http-security.test.ts:228` e `tests/e2e/http-security.spec.ts:33-35`.
2. **Allowlist de preflight ampla.** `http-security.ts:12-29`: métodos GET, POST, PATCH, OPTIONS; cabeçalhos incluem `x-cvg-operator-token`, `x-operator-id`, `x-operator-role` e `x-tenant-id`. Vale para toda origem permitida.
3. **`Origin` ausente passa** no hook HTTP (`http-security.ts:263-268`). No modo OIDC, a fatia A instalou a guarda de CSRF por nome do cookie (`oidc-routes.ts:91-102`, `:131-139`).
4. **Cookies sem `__Host-`.** `operator-session.ts:4` fixa `cvg_operator_session`; `:113-127` e `:129-139` serializam e limpam com `Secure` só em HTTPS. O pendente é `cvg_oidc_pending` (`oidc-login-transaction.ts:9`, `:287-297`), com `Secure` decidido pelo esquema do redirect (`:128`, `:209`). O parser lê um nome só (`operator-session.ts:92-111`).
5. **`Secure` do cookie operacional** vem de `httpSecurity.enforceHttps` (`server.ts:1047`, logout `:1016-1036`). `API_REQUIRE_HTTPS` e `API_TRUSTED_PROXY_ADDRESSES` ligam `trustProxy` (`server.ts:506`) e o 426 (`http-security.ts:231-246`).
6. **Cache.** Cada rota decide; muitas põem `no-store` (`server.ts:635`, `:859`, `:876`), mas não há regra para todo `/v1/**` nem a diretiva `private`. 44 asserções de teste esperam exatamente `no-store`.
7. **CSP da API**: `default-src 'none'` (`http-security.ts:39-40`). Serve para JSON; não afeta o console.

## R6 — Rotas OIDC e configuração da fatia A

1. Start: `oidc-routes.ts:233-311`. `Origin` exato num `onRequest` da rota (`:213-231`); devolve `{ authorizationUrl }` em JSON 200 e o `Set-Cookie` do pendente.
2. Callback: sucesso é 303 fixo para `<consoleOrigin>/` (`oidc-routes.ts:458-467`), sem parâmetro de retorno. Falhas respondem 401 ou 503 em JSON no host da API (`:354-363`). No navegador, o operador ficaria numa página JSON da API.
3. Configuração: `oidc-config.ts:351-369` exige console na allowlist e diferente do issuer, mas aceita console `http:` e o mesmo host da API. O redirect aceita `https:` ou `http:` em loopback (`:339-349`). Só `NODE_ENV=test` (`:284-286`).
4. Hook de sessão isenta as rotas de login (`operator-session-hook.ts:19`, `:51`).

## R7 — Deploy, NGINX e imagem

1. `deploy/nginx.web.conf:8-13` encaminha `/v1/` para `secretary-api:3000` (nome legado) e não tem CSP. Sem esse alias, o NGINX nem sobe ([0146](../../../02_spec/0146_web_image_digest_and_name.md)).
2. `deploy/harness/proxy/nginx.conf:78-97`: o proxy de produção serve API (`/v1/`) e console (`/`) no **mesmo host**. Isso contraria o item 6 da SPEC0150. Expor ou não o console é decisão pendente (`deploy/harness/README.md:413`).
3. `Dockerfile:16`: o estágio `build` roda `npm run build:web` para todos os alvos. Se o build de produção do console passar a exigir origens, a imagem `runtime` quebra. O CI só constrói o alvo `runtime` (`scripts/ci-bar.mjs:614`), e o release também (`.github/workflows/release-image.yml:186`).
4. O ambiente local CLOSE-CI-LOCAL do Codex usa a imagem web construída do snapshot `9a56a9c9`, na porta 4483. Mudar `deploy/nginx.web.conf` na `main` afetaria rodadas futuras desse fluxo de mesmo host.

## R8 — O que impede hoje o console de usar o login da fatia A em outro host

1. O bundle chama caminhos relativos (R4.1); sem proxy, as chamadas vão ao host do console.
2. Não há origem de API fixa no build nem checagem de `location.origin` (R4.1, R4.2).
3. A API não emite ACAC (R5.1): o navegador bloqueia a leitura de `GET /v1/session` e de toda resposta credenciada.
4. Não existe botão nem fluxo de login no console (R4.3).
5. O bundle ainda carrega o caminho do token de bootstrap, que o modo OIDC recusa (R4.4).
6. Os cookies não têm `__Host-` (R5.4): sem isso, uma origem irmã planta o pendente e faz login CSRF.
7. Falhas do callback ficam em JSON no host da API (R6.2).
8. A configuração aceita console HTTP e o mesmo host da API (R6.3).
9. O NGINX do console encaminha `/v1/` e não tem CSP (R7.1). O proxy de produção é de mesmo host (R7.2).
10. Os painéis não distinguem 403 de 503 (R4.6).

Fora da ponte, mas pré-condição de produção: o OIDC só compõe com `NODE_ENV=test` (R6.3). Isso fica para a fatia C.

## R9 — Ferramentas de prova que já existem

1. `@playwright/test` ^1.59.1 e `@axe-core/playwright` ^4.13.0 (`package.json:100-101`).
2. Config padrão (`playwright.config.ts:50-64`): só Chromium, modo simulação, mesmo host em HTTP. Config `rem21-014` (`playwright.rem21-014.config.ts:39-71`): HMAC, mesmo host em HTTP, três navegadores. Nenhuma das duas serve para hosts distintos.
3. IdP sintético da A (`apps/api/src/__tests__/support/synthetic-oidc-issuer.ts`):
   - `/authorize` só aceita POST com formulário já preenchido (`:341-399`). Não há página HTML. Para o navegador, falta um `GET /authorize` com formulário acessível;
   - HTTPS em `127.0.0.1`, CA efêmera por `openssl`, SAN `localhost` e `127.0.0.1` (`:510-560`); issuer `https://localhost:<porta>` (`:616`);
   - `redirect_uri` registrado e exato (`:351-363`): serve para o negativo de redirect.
4. Padrão do O10 (`oidc-login-entrypoint-postgres.test.ts:35-36`, `:87-163`): processo filho `tsx main.ts`, PG, `NODE_EXTRA_CA_CERTS` só no filho, porta fixa 3456 por variável. Suporte de PG: `__tests__/support/oidc-postgres-fixture.ts`.
5. `probe.mjs` da PR302 (R3.5): padrão de `--host-resolver-rules`, cookie de origem irmã e bloqueio por CSP. Está em evidência e aponta para `/tmp` e para o commit isolado; não roda como está.

## R10 — "Três hosts HTTPS sintéticos" no CI atual

1. Runner `ubuntu-latest` (`.github/workflows/verify.yml:20`), PostgreSQL de serviço em 5432 com `TEST_DATABASE_URL` no ambiente do job (`:28-43`), `openssl` disponível (a A já depende disso), Docker disponível (o gate `image` faz `docker build`).
2. Os navegadores só são instalados em `verify.yml:179-180`, depois dos gates de PostgreSQL. Um teste vitest de PG não pode abrir navegador no CI.
3. O gate `e2e` exige zero falhas, zero `skipped` e zero `flaky` (`scripts/ci-bar.mjs:313-318`; `scripts/lib/e2e-report-binding.mjs`). Uma prova instável derruba o gate.
4. Gates novos se declaram em `scripts/ci-bar-contract.mjs` (modelo: `browser-proof`, `:230-236`) e em `verify.yml`.
5. **Conclusão.** Dá para rodar três hosts HTTPS sintéticos no `ubuntu-latest` sem Docker extra para DNS: nomes `*.test` resolvidos pelo próprio Chromium (`--host-resolver-rules`), IdP em `https://localhost:<porta>` e CA efêmera. Docker só entra se a prova usar o NGINX real (exigência da SPEC0150, `0150:151-155`). Hoje a prova não roda no CI: falta o gate (item 4), que é área do dono do CI.

## R11 — Dependência U04

1. U04 (0399 §U04, checkout compartilhado): fechar a janela entre leitura do grant e commit; revogação de sessão fora das rotas de caso; troca e revogação com queda segura. Depende da U03. A SPEC0257 (U03) teve APPROVE técnico na r2 e espera a revisão T3 humana (timeline do Gbrain de 23/10, 12:28). A recon da U04 do Codex (timeline, 12:34 e 12:36) reproduziu a corrida grant → escrita na `main` e registrou que "U08 Claude pode usar resíduo".
2. O roadmap explica a seta como ordem de revisão de contratos de identidade (`0398_roadmap_producao_aud0624.md:60`) e põe a preparação da U08 na primeira janela (`0397_plano_executivo_producao_aud0624.md:110`).
3. O que a ponte de navegador usa e já existe na `main`: logout revoga a família (`server.ts:1016-1036`); novo login aposenta a sessão anterior por `switchIdentity` (`oidc-routes.ts:439-456`); expiração ≤ 15 min; desativação corta na hora as rotas de caso (`case-routes.ts:116-130`).
4. O que a U08 **não** pode afirmar sem a U04: revogação imediata fora das rotas de caso depois de troca de role ou desativação (resíduo de até 15 min); escrita concorrente com revogação de grant.
5. **Conclusão.** Dá para fatiar: a ponte (B1) não depende da U04. A prova registra o comportamento atual como guarda, e a U04 aperta depois. O único acoplamento é de arquivo: `server.ts` e `operator-session-hook.ts` devem entrar um de cada vez, com rebase.

## R12 — Coordenação

1. Claim `UP91-025-OIDC-B-20261023` registrado no quadro (`docs/08_runtime/agent_coordination.md:169`, checkout compartilhado) e na timeline do Gbrain. Nenhum outro agente declara `apps/web`, `http-security.ts`, `oidc-routes.ts` ou `deploy/nginx.web.conf`.
2. CLOSE-CI-LOCAL (Codex): portas 3483, 4483 e 56383 e Compose `cvg-close-local-20261023`. Não tocar. A prova da B usa portas efêmeras ou outras, registradas no claim do BUILD.
3. PROD0624-EXEC (Codex): U04 e o CI (U02) são dele. A ligação da prova a um gate novo precisa da concordância do dono do CI.
4. CLOSE-CI-LOCAL (Codex) reservou a SPEC0260 para mudar `.github/workflows/verify.yml` (grupo de concorrência) e prepara um contrato de reuso do certify (timeline, 12:32). O gate novo da U08 toca o mesmo arquivo: entra depois da SPEC0260, com rebase.
