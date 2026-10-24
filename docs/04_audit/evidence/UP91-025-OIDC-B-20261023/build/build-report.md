# Relatório do BUILD — SPEC0259 r3, U08 fatia B1 (UP91-025-OIDC-B-20261023)

- **SPEC:** `docs/02_spec/0259_oidc_console_distinct_hosts.md` r3, sha256 `ad0282a096d9f9ed21c9294ddbe4f51d913823022c31411cc5ea642b55b4778a`, conferido no início e no fim; a SPEC não foi alterada.
- **Aprovação:** `spec-approval.json` (crítico r3 APPROVE; notas O1–O6) e `user-decisions-20261023.json` (PB1, PB3 e PB14 do usuário; PB6 do Codex).
- **Worktree:** `/mnt/dados/cvg-work/cvg-d9ef-u08-oidc-b-20261023`, detached. Base `f06a6613` (docs da SPEC) sobre a `main` `2e5a64de`. HEAD final `6c3e484a0`.
- **Executor:** Claude Code (CONT-20261018-D9EF). Data: 23/10/2026.
- **Escopo:** só `NODE_ENV=test`, IdP sintético, sem dado real, conta real, deploy, produção, push ou PR. A U08 não fecha nesta rodada: depende da U04 e de uma nova Q9 sobre a sessão da U04 (PB14).

## 1. Commits

| Commit | Conteúdo |
| --- | --- |
| `7499d1714` | S0: sonda de semântica de cookies do Chromium 147 (checagens 1–8 PASS, 9 registrada) |
| `71d5e5147` | Passo 1: API, console e modelo NGINX; Q1–Q7, renderizador da Q8, Q10; first red unitário |
| `24c38b9e5` | Passo 2: ambiente de três hosts, prova Chromium (Q8, Q9, S0), runner com contrato e gate `browser-oidc-hosts` |
| `d28ab4d75` | Mutantes N1–N28 (28/28) e start da irmã como POST simples na Q9h |
| `f558d9981` | `sourceSha256` do SKIP-PG-041 ajustado |
| `6fe1b3b85` | Correções da revisão de código r1 (M1, M2, O1–O5) |
| `6c3e484a0` | Revisão r2 (APPROVE) e opcionais O1/O2 dela; mutantes de novo |

Um último commit grava este relatório, `build.json` e as evidências finais.

## 2. S0 (antes de qualquer código)

Servidores mínimos em Node, sem código CVG, com os hosts da §4.11 numa borda HTTPS em porta efêmera, IdP em `https://localhost:<porta>`, CA efêmera por `openssl` e confiança TLS só pela flag `--ignore-certificate-errors-spki-list` (funcionou, sem `ignoreHTTPSErrors`). Evidência: `s0/probe-s0.mjs`, `s0/result.json`, `s0/proof.json`. Segunda execução igual.

| # | Esperado | Resultado |
| --- | --- | --- |
| 1 | pendente `Lax` gravado pelo `fetch` do start fica no navegador | PASS |
| 2 | pendente chega ao callback depois de POST no IdP, 302 e GET iniciado pelo documento do IdP | PASS (nos dois logins) |
| 3 | operacional `Strict` não chega a esse callback | PASS (segundo login, com o operacional já gravado) |
| 4 | operacional gravado pela resposta do callback fica no navegador | PASS |
| 5 | operacional chega ao `fetch` credenciado do console | PASS |
| 6 | cookie sem prefixo com `Domain=cvg.test` da irmã fica e chega à API | PASS |
| 7 | `__Host-…` com `Domain` da irmã é recusado (controle na mesma resposta) | PASS |
| 8 | cookie sem nome com valor `__Host-cvg_oidc_pending=x` recusado, com `cvg_probe_control8` no contexto e no log hex | PASS |
| 9 | registro | o Chromium grava `\xA0__Host-cvg_oidc_pending` com `Domain=cvg.test` e o envia com o byte `a0` cru; `context.cookies()` mostra o nome sem o `a0`. É o ataque que a comparação exata da §4.3 fecha no servidor |

A prova de navegador final repete 6–9 no ambiente real (item "S0" da Q9): PASS, e a API trata o `\xA0…` como ausência de cookie.

## 3. Mudanças

### API (`apps/api/src`)

- `http-security.ts`: `credentialedOrigin` (preenchido por `buildServer` com a origem do console só com o login OIDC); ACAC e `Vary: Origin` postos no `onRequest`, em todo status depois do hook HTTP; preflight credenciado só com `GET, POST, PATCH` e `accept, content-type`; hook com nome `httpSecurityOnRequest`.
- `operator-session.ts`: perfil `host-prefixed`/`legacy` obrigatório (sem padrão) em nome, serialização, limpeza e leitura; `__Host-cvg_operator_session` sempre `Secure`; `readExactCookieValues` com a regra M1 (corte por `;`, segmento sem `=` ignorado, só SP e HTAB aparados, igualdade por code units).
- `operator-session-hook.ts`: recebe `cookiePolicy` obrigatório.
- `oidc-login-transaction.ts`: `cookieProfile` obrigatório; `__Host-cvg_oidc_pending` no perfil HTTPS; leitura exata; `host-prefixed` exige redirect `https:`.
- `oidc-config.ts`: perfil HTTPS (`API_REQUIRE_HTTPS=true`) recusa console `http:`, console no host do redirect e redirect `http:`, nomeando a variável; expõe `cookieProfile`.
- `oidc-authority.ts`: expõe o perfil de cookie da autoridade (vem da configuração; `production-bootstrap.ts` não precisou mudar).
- `oidc-routes.ts`: guarda de CSRF reconhece os dois nomes com o corte mais largo; start usa o nome exato do perfil; callback responde 303 para `<console>/`, `#cvg-login=negado` ou `#cvg-login=indisponivel` conforme a tabela da §4.5; saída padrão (regra de rebase com a U04): classe 4xx → `negado`, resto → `indisponivel`, pendente apagado a partir do passo 2 e mantido no store de state fora (I8), nenhum outro cookie.
- `server.ts`: perfil de cookie do servidor e recusa de composição com perfil divergente da autoridade; `onSend` com `cache-control: private, no-store` em todo `/v1/**` no modo OIDC, registrado depois dos `onSend` de `no-store`; hook de alvo com nome `requestTargetOnRequest`; `/v1/session` e logout pelo perfil.

### Console (`apps/web`, `vite.config.mts`, `vitest.config.mts`)

- `api/origin.ts` (novo): validador do perfil de build, `resolveApiUrl`, `parseAuthorizationUrl` e leitura do fragmento.
- `api/console-profile.ts` (novo): perfil compilado (`__CVG_OPERATOR_LOGIN__`, `__CVG_CONSOLE_ORIGIN__`, `__CVG_API_ORIGIN__`).
- `api/client.ts`: transporte único por `resolveApiUrl`, `credentials: 'include'` sempre, cabeçalhos além de `accept`/`content-type` recusados no perfil OIDC antes da requisição, `startOidcLogin`; cabeçalho do token atrás da constante de compilação.
- `auth/session.ts`: provedor do token de bootstrap ausente no bundle OIDC; estado `configuration_error`.
- `App.tsx`: origem fixa (J1, zero chamadas de origem divergente), login por "Entrar", volta do IdP com fragmento limpo por `replaceState`, estados e textos da §4.8, expiração, logout, foco no botão ou no aviso; painel 403 → "Sem permissão para esta área." em todos os perfis.
- `vite.config.mts`: valida o perfil (a falha impede qualquer artefato) e, no perfil OIDC, recusa o bundle que contenha `__CVG_OPERATOR_BOOTSTRAP_TOKEN` ou `x-cvg-operator-token`.

### Deploy

- `deploy/console/nginx.console.conf.template` (novo): `/v1`, `/v1/**`, `/health`, `/live`, `/ready` → 404 sem proxy; SPA com `no-store`; CSP exata, `nosniff` e `no-referrer` repetidos em cada `location` com `always`. Não entra no `Dockerfile` nem no compose (B2).

### Suporte de teste e governança

- IdP sintético: `GET /authorize` com página `lang="pt-BR"` e formulário rotulado; TOTP errado → página com "Código inválido" e sem code; opção de folha da CA compartilhada.
- `tests/support/oidc-hosts/`: CA e folhas, borda TLS (só nomes de cookie em hex, status, `Origin`, ACAO/ACAC e categoria fixa do pouso do callback), ritmo de logins, renderizador do NGINX, ambiente (PG, IdP, API pelo entrypoint, `vite build` com `NODE_ENV=production`, NGINX real endurecido, canal de controle em loopback com token) e global setup.
- `tests/e2e-oidc-hosts/oidc-hosts.spec.ts`, `playwright.oidc-hosts.config.ts`, `scripts/oidc-hosts-browser-proof.mjs` e contrato, `npm run test:e2e:oidc-hosts`.
- Gate `browser-oidc-hosts` depois do `browser-proof` em `scripts/ci-bar-contract.mjs` e `.github/workflows/verify.yml` (lista aprovada e `verifiedGateCount` 34 → 35).

## 4. Provas e onde estão

| Prova | Arquivo | Resultado final |
| --- | --- | --- |
| Q1–Q5 | `apps/api/src/__tests__/oidc-console-hosts-api.test.ts` | 32/32 |
| Q6 | `apps/web/src/__tests__/oidc-console.test.tsx`, `panel-forbidden.test.tsx` | 42/42, 1/1 |
| Q7 | `apps/web/src/__tests__/oidc-bundle.test.ts` (`vite build` real) | 8/8 |
| Q8 (renderizador), Q10 (fronteira), ritmo, borda, IdP | `tests/oidc-hosts-support.test.ts` | 23/23 |
| Contrato do relatório (DB7) | `tests/oidc-hosts-browser-proof.test.js` | 18/18 |
| Q8 (NGINX real), S0, Q9a–n, Q10 (histórico e vazamento) | `tests/e2e-oidc-hosts/oidc-hosts.spec.ts` pelo runner | 15/15 |
| Q11 | suítes da A, `rem21-014`, `critical-flows`, Playwright padrão, `http-security` | ver §7 |

Notas sobre a Q9:

- **Rota do 403 (Q9e):** nenhuma rota de painel responde 403 a um papel da matriz sintética (exploração real em `q9e-route-choice.json`). O 403 e o 503 de `GET /v1/tasks` vêm da borda; além disso, a mesma Q9e prova um 403 real da API legível no console (Supervisor sem `task:update`, `POST /v1/tasks` pela página do console).
- **Captura da i2 e da i3:** por HTTP cru com a CA efêmera (alternativa da SPEC), sem `ignoreHTTPSErrors` e sem `NODE_EXTRA_CA_CERTS` global (nota O1). O controle de material vivo completa o login do atacante em menos de 50 s.
- **Pouso da i2/i3:** a borda registra só a categoria fixa do `Location` do callback; a i2 e a i3 exigem `negado` e a i3 exige o pendente da vítima apagado (M2 da revisão r1).
- **i3 e os controles da i2 (O7 da r1):** o pendente vivo da vítima viaja no callback da i3, então a i3 confere o nome legado presente, não a ausência de `__Host-cvg_oidc_pending`.
- **Ritmo (DB10 e nota O2):** a espera do ritmo acontece antes de cada fluxo (reserva de vagas); a borda solta na hora. A latência é medida da soltura à resposta (mais estrita que a O2) e o teste falha acima de 5 s; máximo observado 52 ms, 0 violações.
- **Q9h e N28 (nota O3):** a Q9h usa um Operator (`task:update`); a segunda origem permitida recebe 403 da guarda, registrado pela borda.
- **Confiança TLS (PB10):** só por SPKI; a flag funcionou no Chromium 147.

## 5. First red

Evidência: `first-red.json` e `first-red/firstred-api.json`, `first-red/firstred-web.json`.

- **Q1–Q5 na base:** 20 FAIL pelo motivo certo (sem `__Host-`, sem ACAC, hook sem nome, callback 401/503 JSON, `trim()` aceita `\xA0`, a base aceita console `http:` e mesmo host) e 7 guardas que passam por desenho (perfil HTTP da A, outras origens, J10, 429 global e start em JSON).
- **Q6:** o arquivo falha por módulo inexistente (`api/origin.ts`). O painel 403 falha pelo texto.
- **Q7:** 6 FAIL (token no bundle OIDC; perfis inválidos constroem) e 1 guarda (perfil atual).
- **Q8 (renderizador) e Q10:** o arquivo falha por suporte inexistente.
- **Navegador, contra a base com o suporte copiado:** sem o modelo NGINX, o setup falha (modelo inexistente). Com o modelo, Q8 passa e todo item Q9 para no passo a: o bundle da base é o perfil atual, chama `/v1/session` relativo no NGINX e não mostra "Entrar". A Q9j fica sem `__Host-cvg_oidc_pending` e a Q10 sem histórico.
- A Q11 é guarda e não tem first red.

## 6. Mutantes

Harness `mutants/run-mutants.py`: aplica um mutante por vez, roda a prova citada (vitest e, quando a SPEC cita item de navegador, o item da prova de três hosts), restaura os bytes e confere o sha256 antes e depois.

| Rodada | HEAD | Resultado |
| --- | --- | --- |
| 1 | `24c38b9e` (`mutants/mutants.json`) | 28/28 mortos; 15 execuções de navegador citadas falharam pelo sintoma esperado |
| 2 | `6fe1b3b8` (`mutants/mutants-6fe1b3b8.json`, worktree temporário próprio, removido) | 28/28 mortos |
| 3 | `6c3e484a`, só os de `oidc-routes.ts` (N11, N13, N14, N15, N28) (`mutants/mutants-6c3e484a-routes.json`) | 5/5 mortos |

Exemplos de sintoma no navegador: N10 a vítima entra na conta do atacante; N22 `/v1/session` 200 no NGINX; N23 o `fetch` a `evil` sai da CSP; N24 a URL fica com `#cvg-login=negado`; N14 o pouso vai a `evil.other.test`.

Ressalva O6 da r1: no N6 a falha da Q9i aparece num auxiliar (`setCookieValue` nulo), não no desfecho do cookie tossing. A morte que vale para o N6 é a da Q3. Um valor de sessão sintético foi redigido nas evidências dos mutantes.

## 7. Gates (§12), Node 22.23.2

Detalhe em `gates/gates.json`.

| Gate | Resultado |
| --- | --- |
| prettier nos tocados, `format:check` | PASS |
| `lint` | PASS, 0 erros e 0 avisos |
| `typecheck` | PASS |
| `skip:governance` | PASS depois de atualizar o `sourceSha256` do SKIP-PG-041; `certification/skip-inventory.json` restaurado do HEAD |
| `docs:check-links` | PASS (EVIDENCE_HYGIENE_OK) |
| `ci:bar:contract` e testes de contrato do CI | PASS |
| focais | 331/331 em 14 arquivos |
| suítes `apps/api` e `apps/web` | 986 PASS, 0 FAIL, 119 pulados sem banco (PG, catalogados) |
| `test:postgres` no PG próprio (56292) | 338/338 em 42 arquivos |
| cobertura com o comando do CI (`test:core --coverage`, per-file, com PG) | 7189/7189 em 509 arquivos; linhas 95,38, statements 94,55, funções 96,04, branches 91,27; exit 0 |
| `coverage:critical` | PASS |
| mutation guard | PASS, 10/10 mortos |
| Playwright padrão | 12/12 (API 3466, console 4466) |
| `critical-flows` | 1/1 |
| `rem21-014` | 18/18 (Chromium, Firefox e WebKit, 6 cada), axe 0 bloqueante |
| `browser-oidc-hosts` (runner) | 15/15, 0 pulados, 0 flaky, axe 0 em 7 estados, ritmo 40 pedidos, máximo 52 ms, contrato PASS (`browser-proof/oidc-hosts-browser-proof-6c3e484a.json`) |
| `npm audit --omit=dev` | **FALHA pré-existente:** 1 high em `zod` < 4.6.6 (GHSA-mrhx-c7xc-m3w5), já na `main` `2e5a64de`. O lockfile não mudou neste BUILD; a correção exige mudança de lockfile, que é decisão do usuário ou do dono do CI |
| `certify` | não rodado (≈ 90–150 min); fica para o CI |
| gitleaks (`origin/main..HEAD`) | exit 0 antes e depois de cada commit |

Lockfile: `package-lock.json` sha256 `50988157…0cbd9064`, sem mudança. O `node_modules` veio de `/mnt/dados/cvg-work/cvg-gitleaks-stable-20261023/candidate`, com o mesmo lockfile e `npm ls` limpo. O de `cvg-d9ef-first-release-20261023` estava defasado: faltava `openid-client`.

## 8. Revisão de código independente

| Rodada | Veredito | Pasta |
| --- | --- | --- |
| r1 (sobre `f558d998`) | REVISE: M1 (saída padrão do callback) e M2 (Q9i3 sem prova do "negado"), 7 opcionais; os 6 desvios aceitos | `code-review-r1/` |
| r2 (sobre `6fe1b3b8`) | APPROVE, sem obrigatórios novos; M1 e M2 corrigidos | `code-review-r2/` |

- **Feitos da r1:** M1, M2, O1 (403 real legível), O2 (mensagem de pouso uma vez), O3 (foco), O4 (fronteira em `products/` e `scripts/`, e canário positivo no leak check) e O5.
- **Feitos da r2:** O1 (teste de foco discriminante) e O2 (pendente só a partir do passo 2).
- **Condições da r2:** C1 (prova verde na HEAD final), C2 (mutantes do delta) e C3 (gates) estão cumpridas acima.

## 9. Desvios

1. **Spec E2E** em `tests/e2e-oidc-hosts/oidc-hosts.spec.ts`, não em `tests/e2e/`. O Playwright padrão pega `tests/e2e/**/*.spec.ts` e a prova entraria no gate `e2e` sem ambiente; mudar `playwright.config.ts` ficaria fora da §7.
2. **Relatório** em `certification/logs/oidc-hosts-browser-proof.json`, não em `certification/`. `certification/logs/` já fica fora do candidato, do drift e do prettier; o outro caminho exigiria mexer em `scripts/ci-bar.mjs`, `scripts/lib/certification-rules.mjs` e `.prettierignore`, fora da §7.
3. **403 do painel na Q9e** pela borda (ver §4). Há também a modalidade `403` na borda, além de 503 e corte.
4. **Gate** também exigiu ajustar `tests/ci-bar-contract.test.js` (lista de gates), o `verifiedGateCount` do `verify.yml` e o `sourceSha256` do SKIP-PG-041 em `scripts/skip-catalog.json` (listado na §7).
5. **Adendo à SPEC0107 (§4.12)** não escrito: "promoção pelo lead". Fica pendente antes do merge.
6. **`node_modules`** veio de outro worktree com o mesmo lockfile (ver §7).
7. **Saída do start com 400/403:** mostra "A configuração do console não é aceita pela API." (texto da linha "GET /v1/session 403"), porque a §4.8 não fixa o texto dessa linha.
8. **Opção de reuso do ambiente** (`CVG_OIDC_HOSTS_REUSE=1`) só para iteração local; o runner a recusa, então o relatório sempre vem de ambiente novo.
9. **Portas locais:** a SPEC pede portas efêmeras, que são o padrão do suporte. Aqui foram fixadas pelas variáveis `CVG_OIDC_HOSTS_*`, conforme o pedido: borda 4466, API 3466, NGINX `cvg-d9ef-u08-nginx` 8466 e PG 56292. As portas 3483, 4483 e 56383 são recusadas pelo código.

## 10. Testes da A ajustados (sem afrouxar asserção)

- **`oidc-login-routes.test.ts`:** recusas e indisponibilidades do callback passaram de 401/503 JSON para 303 com `Location` exato, corpo vazio e `private, no-store`. Pendente, cookie operacional, contagens de token, sessões e principais continuam conferidos. Os `no-store` exatos viraram `private, no-store`. Os títulos dos testes de 503 mudaram para "lands … on indisponivel".
- **`oidc-login-postgres.test.ts`:** recusas viram 303 `negado`.
- **`oidc-login-entrypoint-postgres.test.ts`:** sem mudança. O 503 do hook de readiness continua JSON, como a tabela da §4.5 manda.
- **`oidc-login-guards.test.ts`:** `no-store` virou `private, no-store` e o stub da autoridade ganhou `cookieProfile: 'legacy'`.
- **`oidc-login-transaction.test.ts`, `operator-session*.test.ts`, `operator-session-hook.test.ts`:** só o perfil explícito na assinatura nova.
- **`tests/ci-bar-contract.test.js`:** o gate novo entra na lista exata.

`http-security.test.ts` e `tests/e2e/http-security.spec.ts` ficaram sem mudança.

## 11. Notas de build O1–O6 da revisão da SPEC

- **O1:** captura por HTTP cru com a CA efêmera.
- **O2:** latência medida até a resposta, com espera do ritmo antes do fluxo.
- **O3:** Operator na Q9h.
- **O4:** texto apenas; a guarda da U04 é `preHandler` e roda depois de todo `onRequest`.
- **O5:** saída padrão mapeada (e corrigida pela r1 e pela r2).
- **O6:** o console não apaga cookie; a API pode manter a sessão no 5xx do logout.

## 12. O que só o CI ou a U04 provam

- **CI:** o gate `browser-oidc-hosts` no `ubuntu-latest` (pull da imagem por digest, Docker, PG de serviço e Chromium instalado), o `certify` integrado e a barra completa.
- **Barra do CI:** o `npm audit` vai falhar pelo `zod` pré-existente até alguém decidir o lockfile.
- **U04 (PB14):** revogação fora das rotas de caso, releitura do principal no callback (cai na saída padrão corrigida) e guarda por requisição. Depois da U04 é preciso rodar de novo a API, o `test:postgres` e a Q9; a U08 só fecha aí.
- **Fora desta fatia:** B2 (empacotamento de produção da SPEC0150), C (IdP real) e UP91-043 (Firefox, WebKit, viewports e UAT).

## 13. Recursos e limpeza

- **Contêineres:** PG `cvg-d9ef-u08-pg` (removido no fim) e NGINX `cvg-d9ef-u08-nginx` (removido a cada execução).
- **Processos:** API e IdP encerrados por PID.
- **Banco:** papéis e schemas `cvg_oidc0254_*` apagados pela fixture.
- **Arquivos:** diretórios temporários removidos; os worktrees temporários `cvg-d9ef-u08-firstred-base` e `cvg-d9ef-u08-mutants` também.
- **Ambientes de outros agentes:** nada tocado (CLOSE-CI-LOCAL, U13, `cvg-audit-*`, `cvg-idle-binding-*`).
- Sem `pkill -f`.
