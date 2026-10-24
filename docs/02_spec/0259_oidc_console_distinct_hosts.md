# SPEC0259 — Console OIDC em hosts HTTPS distintos: ponte de navegador da UP91-025 (fatia B1, IdP sintético)

**PROPOSTA T3 (identidade, sessão e transporte do navegador), revisão r3.** O BUILD depende de três coisas: o APPROVE do crítico independente sem obrigatórios, a resposta do usuário às decisões da §14.1 e o acordo do dono do CI na §14.2. É a mesma regra de gate da fatia A ([decisão de 21/10/2026](../04_audit/evidence/UP91-018-CASE-SCOPE-20261021/user-decisions-20261021.json)). Premissa nova, migração ou dependência nova param a execução e voltam ao usuário.

Task `UP91-025-OIDC-B-20261023`. Unidade U08 do backlog 0399 (ainda fora da `main`). Cartões pais: [UP91-025](../03_build/0367_program_backlog_reaudit_2026-09-30.md#up91-025) e, em parte, [UP91-043](../03_build/0367_program_backlog_reaudit_2026-09-30.md#up91-043). Autoridade: [SPEC0150](0150_cross_origin_operator_console.md) (aprovada pelo usuário em 28/09, só texto), [SPEC0254](0254_oidc_login_case_principals.md) r2 (fatia A), [SPEC0144](0144_trusted_operator_session_production.md) e [SPEC0152](0152_corporate_oidc_authority_contract.md). Fatos e âncoras: [recon](../04_audit/evidence/UP91-025-OIDC-B-20261023/recon.md) (achados R1–R12).

Histórico:

- **r3** ([revisão r2](../04_audit/evidence/UP91-025-OIDC-B-20261023/spec-review-r2/review.md), [correções](../04_audit/evidence/UP91-025-OIDC-B-20261023/spec-review-r2/corrections.md)). Só o delta pedido, sem contrato, aceite ou corte novo:
  - M1 (r2): a captura do code e do state do atacante na Q9i2 e na Q9i3 sai do `page.route` no callback e vai para o POST ao `/authorize` do IdP (ou HTTP cru), com controle de material vivo depois do "negado";
  - ritmo dos logins com janela de 70 s e latência máxima de 5 s;
  - PB14 com o estado atual da SPEC0262 e os três acoplamentos dela;
  - opcionais O2 e O4–O8 da revisão r2.
- **r2** ([revisão r1](../04_audit/evidence/UP91-025-OIDC-B-20261023/spec-review-r1/review.md), [correções](../04_audit/evidence/UP91-025-OIDC-B-20261023/spec-review-r1/corrections.md)):
  - M1: regra de comparação exata do nome do cookie (§4.3), negativos com espaço Unicode na Q3, mutante N27 e registro no S0;
  - M2: controle positivo e caso "vítima já autenticada" na Q9i;
  - PB3 com a justificativa corrigida; PB14 virou pergunta ao usuário, com o risco residual e o acoplamento com o rascunho da SPEC0262;
  - premissas separadas por quem decide (§14);
  - opcionais O1–O15 incorporados (lista nas correções).
- **r1:** primeira proposta.

Base: `main` `9a56a9c94`. Âncoras desta base, com tolerância de ±2 linhas. Nenhum dado real, IdP real, conta real, provider, canal, deploy ou produção.

## 0. O que esta rodada entrega

A fatia B da SPEC0254 (`0254:24`) junta duas coisas de natureza diferente: a ponte de navegador, que roda em teste, e o empacotamento de produção da SPEC0150. Esta SPEC entrega só a primeira (B1).

| Fatia  | Entrega                                                                                                                                                                                                                                                                                                                                          | Estado                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 0254-A | Login OIDC com MFA pelo entrypoint, produtor de `case_principals`, store PG, CSRF por `Origin` (só `NODE_ENV=test`)                                                                                                                                                                                                                              | Feito (PR #20)                                                         |
| **B1** | API: CORS com credenciais só para o console, cookies `__Host-` em HTTPS, `private, no-store`, saída do callback para o console. Console: origem fixa, transporte único, login, logout, expiração, estados 401/403/404/503. Modelo NGINX do console com CSP. IdP sintético com página de login. Prova em Chromium com três hosts HTTPS sintéticos | Esta SPEC                                                              |
| B2     | Empacotamento de produção da SPEC0150: imagem web com origens no build, build de produção sem modo relativo, proxy do harness separado por host, compose e manifesto, rollout e rollback (`0150:116-134`)                                                                                                                                        | SPEC própria, depois da decisão de expor o console e do servidor (PB1) |
| C      | IdP real do hospital, produção (SPEC0152)                                                                                                                                                                                                                                                                                                        | Depende da escolha do IdP                                              |

Por que cortar assim:

- o estágio `build` do `Dockerfile:16` roda `build:web` para todos os alvos. Exigir origens no build de produção agora quebraria a imagem `runtime` do CI e do release (R7.3);
- produção recusa OIDC até a fatia C (I4 da A). Um console OIDC empacotado para produção não teria API para chamar;
- `deploy/harness/**` está nas unidades do Codex (U10, U11, U15), e expor o console é decisão pendente (`deploy/harness/README.md:413`).

Itens do cartão U08 e onde cada um fecha:

| Item do cartão                                 | Prova                |
| ---------------------------------------------- | -------------------- |
| Login                                          | Q9b                  |
| Recarga só com cookie                          | Q9d                  |
| Logout                                         | Q3, Q9f              |
| Expiração                                      | Q9g                  |
| CSRF incorreto recusa                          | Q3, Q9h              |
| Origem incorreta recusa                        | Q1, Q2, Q6, Q9h, Q9k |
| Redirect incorreto recusa                      | Q5, Q6, Q9j          |
| Tenant ou role indevidos recusam               | Q9e                  |
| UI distingue "indisponível" de "sem permissão" | Q6, Q9e, Q9n         |
| Navegador real em três hosts HTTPS sintéticos  | Q9                   |
| Teclado e acessibilidade                       | Q9b, Q9f, Q9o        |
| Matriz de autenticação                         | Q2, Q3, Q5, Q9       |
| Cookie tossing e login CSRF                    | S0, Q3, Q9i          |

Depois da B1, o cartão UP91-025 continua aberto (B2 e C). A UP91-043 continua aberta: Firefox, WebKit, viewports e UAT são dela (PB4). A U08 só fecha depois da U04 (PB14).

## 1. Decisões vigentes que esta SPEC aplica

- **21/10/2026 (usuário):** UP91-025 com IdP sintético local (HTTPS/MFA), sem conta real; mesma regra de gate. Não concedidos: deploy, produção, dado real, IdP ou conta real.
- **22/10/2026:** decisões P1–P4 do usuário e P5–P7 do lead ([registro](../04_audit/evidence/UP91-025-OIDC-20261022/user-decisions-20261022.json)). Nenhuma muda aqui. Nenhuma é perguntada de novo.
- **23/10/2026 (usuário):** o Claude Code assume a U08.
- **23/10/2026, 12:41 (Codex, timeline do Gbrain, "PROD0624 — esclarecimento U04→U08"):** a recon da U04 não dispensa a dependência U04 → U08 do backlog 0399. Construir a B1 antes de a U04 fechar exige autorização que cubra esse recorte e o risco residual (PB14).
- **28/09/2026 (usuário):** SPEC0150 aprovada para BUILD T3 sintético (`0150:5-7`; `0356_production_backlog_2026-09-26.md:630`). Esta SPEC é o delta dela sobre a `main`. Reaproveita o desenho de `7019422`/`ed012a4`, não os commits (R3.4). Onde a B1 se afasta do texto aprovado, a §14 diz o porquê; nada muda em silêncio.
- **D-09 e C8:** o ensaio C8 com token HMAC não muda de nome de cookie nem de CSRF (PB3).

## 2. CURRENT

Detalhe e âncoras em R4–R8 do [recon](../04_audit/evidence/UP91-025-OIDC-B-20261023/recon.md).

- O console chama caminhos relativos (`client.ts:727-731`) por um proxy de desenvolvimento (`vite.config.mts:17-22`). Não há origem de API fixa nem checagem de `location.origin`.
- Não existe botão de login. O bundle ainda lê e envia o token de bootstrap (`session.ts:55-81`, `client.ts:850-865`), que o modo OIDC recusa.
- A API não emite `Access-Control-Allow-Credentials` (`http-security.ts:339-359`). O preflight aceita cabeçalhos de identidade e de token para toda origem permitida (`:19-29`).
- Os cookies não têm `__Host-` (`operator-session.ts:4`, `oidc-login-transaction.ts:9`).
- Os parsers aparam o nome com `trim()` do JavaScript, que remove espaço Unicode: pendente em `oidc-login-transaction.ts:278`, operacional em `operator-session.ts:97` (M1 da revisão r1).
- Falhas do callback ficam em JSON no host da API (`oidc-routes.ts:354-363`).
- A configuração aceita console `http:` e no mesmo host da API (`oidc-config.ts:351-369`).
- Não há `private, no-store` em todo `/v1/**`.
- O NGINX do console encaminha `/v1/` e não tem CSP (`deploy/nginx.web.conf:8-13`).
- Os painéis mostram a mesma mensagem para 403 e para 503 (`App.tsx:54-58`).

## 3. Invariantes

- **J1 (origem fixa).** O console no perfil OIDC só chama a API pela origem compilada. Se `location.origin` difere da origem compilada do console, ele não faz nenhuma chamada e mostra erro de configuração. Nenhuma origem vem de query, fragmento, `postMessage`, storage ou resposta.
- **J2 (cookie só no host da API).** Os cookies operacional e pendente são host-only da API: `__Host-`, sem `Domain`, no perfil HTTPS. O servidor do console nunca os recebe. O servidor só reconhece o nome exato (§4.3): nenhum nome que o navegador não trate como prefixado vira `__Host-` no servidor.
- **J3 (nada de token no navegador).** O bundle OIDC não contém o caminho do token de bootstrap. O console não grava nada em `localStorage`, `sessionStorage`, IndexedDB ou `document.cookie`. Depois do login, a barra de endereço do console não tem code, state nem fragmento.
- **J4 (credenciais CORS só para o console).** `Access-Control-Allow-Credentials: true` só sai com `Origin` igual à origem do console, no preflight e na resposta real, em todo status dado depois do hook HTTP (o 426 de transporte vem antes e fica sem CORS). Outras origens permitidas não recebem ACAC. Origem negada recebe 403 sem ACAO. `*` nunca.
- **J5 (CSRF).** A I7 da fatia A continua. A guarda reconhece os dois nomes do cookie operacional (com e sem `__Host-`) e continua com o corte mais largo da A.
- **J6 (redirect fixo).** A API só redireciona o navegador para `<origem do console>/`, com fragmento fixo nas falhas. Nenhum parâmetro, cabeçalho ou cookie da requisição escolhe o destino. O console só navega para uma `authorizationUrl` `https:` sem usuário nem senha.
- **J7 (cache).** No modo OIDC, toda resposta em `/v1/**` sai com `cache-control: private, no-store`.
- **J8 (estados distintos).** Rede, CORS, 429 e 5xx são "indisponível": nunca viram logout e nunca apagam cookie. 401 é "sem sessão" ou "expirada". 403 é "sem permissão". 404 em item é "indisponível para você". **Exceção:** a ação explícita "Encerrar sessão". Se o logout falhar com rede ou 5xx, o console tira a sessão da tela, como hoje (`App.tsx:308-318`), e mostra "Não foi possível encerrar a sessão no servidor."; o console não apaga o cookie (é `HttpOnly`), e a API mantém a sessão (503 sem limpar o cookie).
- **J9 (só teste).** O modo OIDC continua só com `NODE_ENV=test` (I4 da A). Nada do suporte de prova (CA, mapeamento de nomes, borda TLS, NGINX em contêiner, IdP) entra no runtime ou no bundle.
- **J10 (HMAC e perfil HTTP intactos).** Sem OIDC, CORS, nomes de cookie, CSRF, cache e textos atuais do console seguem como hoje. `rem21-014`, `critical-flows`, o Playwright padrão e os testes atuais de `http-security` passam sem ajuste de asserção. Duas mudanças valem em todos os perfis, e nenhuma asserção atual as cobre:
  - a comparação exata do nome do cookie (§4.3), invisível para nomes ASCII;
  - o texto novo de 403 nos painéis (§4.8).
- **J11 (sem esquema e sem dependência).** Nenhuma migration. Nenhum pacote novo no lockfile.

## 4. PROPOSED — contrato

### 4.1 Configuração da API (adendo à §4.1 da A)

Chama-se **perfil HTTPS** o modo OIDC com `API_REQUIRE_HTTPS=true`. Nele, além das regras da A:

- `CVG_OPERATOR_CONSOLE_ORIGIN` é `https:`;
- o host do console é diferente do host de `CVG_OIDC_REDIRECT_URI` (o host da API);
- `CVG_OIDC_REDIRECT_URI` é `https:`.

Violação recusa o boot antes de `listen`, com a mensagem que nomeia a variável e não o valor (padrão da A).

No modo OIDC sem `API_REQUIRE_HTTPS=true` (**perfil HTTP**, só teste), valem as regras da A sem mudança. O O10 da A continua igual.

Mesmo site entre console e API não é checado no código (PB7). Nenhuma variável nova de ambiente.

### 4.2 CORS (`http-security.ts`)

`NormalizedHttpSecurityOptions` ganha `credentialedOrigin: string | null`. `buildServer` o preenche com `operatorLogin.consoleOrigin` quando o login OIDC está composto; senão, `null`. A A já exige que essa origem esteja em `API_ALLOWED_ORIGINS`.

| Requisição                                             | Resposta                                                                                                                                                                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| real, `Origin` = `credentialedOrigin`                  | ACAO exato, `Access-Control-Allow-Credentials: true`, `Vary: Origin`, `Access-Control-Expose-Headers` atual. Postos no `onRequest`: valem em 200, 303, 401, 403, 404, 429, 503 e nas respostas do error handler |
| preflight, `Origin` = `credentialedOrigin`             | 204 com ACAO, ACAC `true`, `Vary: Origin`, métodos `GET, POST, PATCH`, cabeçalhos `accept, content-type`, `max-age` 600. Método ou cabeçalho fora disso: 403 (PB12)                                             |
| real ou preflight de outra origem permitida            | como hoje: ACAO, `Vary`, allowlist atual, **sem** ACAC                                                                                                                                                          |
| `Origin` ausente                                       | como hoje: sem cabeçalho CORS                                                                                                                                                                                   |
| `Origin` `null`, repetida, malformada ou não permitida | como hoje: 403 sem ACAO                                                                                                                                                                                         |

Sem `credentialedOrigin` (modo HMAC, simulação), nada muda (J10).

**Ordem dos hooks (regra de rebase com a U04).** O hook HTTP é o primeiro `onRequest` depois do hook de alvo (`server.ts:544-553`). Todo `onRequest` novo, inclusive a guarda por requisição da U04, entra depois dele, para que os 401 e 503 novos levem ACAO e ACAC. Um teste confere essa ordem (Q2).

O navegador não entrega ao JavaScript uma resposta credenciada sem ACAO e ACAC. Por isso, um 403 de origem negada, ou uma resposta a outra origem permitida, chega ao console como falha de rede (status 0), e não como 403.

### 4.3 Cookies

**Perfil de cookie.** `host-prefixed` quando o login OIDC está composto **e** `enforceHttps` é verdadeiro. Senão, `legacy`.

| Cookie      | `host-prefixed`                                                                                | `legacy` (como hoje)   |
| ----------- | ---------------------------------------------------------------------------------------------- | ---------------------- |
| operacional | `__Host-cvg_operator_session`; `Path=/; HttpOnly; Secure; SameSite=Strict`; sem `Domain`       | `cvg_operator_session` |
| pendente    | `__Host-cvg_oidc_pending`; `Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`; sem `Domain` | `cvg_oidc_pending`     |

- A limpeza usa o mesmo nome e os mesmos atributos, com `Max-Age=0`. Um `Set-Cookie` de limpeza `__Host-` sem `Secure` seria descartado pelo navegador.
- **Leitura no `host-prefixed`.** Só o nome `__Host-` autentica: hook de sessão, `GET /v1/session`, logout, `previousSessionId` do start e leitura do pendente no callback. O nome legado nunca autentica, nunca vira `previousSessionId` e nunca é lido como pendente. Com só o nome legado, a requisição é tratada como sem cookie.
- **Duplicata.** Dois cookies com o mesmo nome exato falham fechados, como na A (`operator-session.ts:98`): sem sessão, sem pendente.
- **Guarda de CSRF.** No modo OIDC, em qualquer perfil, a detecção de nome (`oidc-routes.ts:91-102`) reconhece os dois nomes e continua com o corte da A (`trim()`, `;` e `,`). Pode exigir `Origin` a mais, nunca a menos.
- **Composição.** O perfil de cookie da autoridade OIDC (que serializa o pendente, `production-bootstrap.ts:213`) e o do servidor são o mesmo. Divergência recusa a construção.
- **Uma só função por cookie (regra de rebase com a U04).** Nome, serialização, limpeza e leitura de cada cookie saem de uma função única que recebe o perfil como parâmetro obrigatório, sem valor padrão. Um caminho novo (por exemplo, o 401 da guarda da U04) que tente limpar o cookie sem dizer o perfil não compila.
- **Perfil `legacy` no modo OIDC** só existe com HTTP, só em teste (PB8).

**Comparação do nome (M1).** Vale para os dois parsers que leem cookie para autenticar: o do operacional (`operator-session.ts:92-111`, usado pelo hook, por `GET /v1/session`, pelo logout e pelo start) e o do pendente (`oidc-login-transaction.ts:274-285`). Vale em todos os perfis e modos.

1. O cabeçalho `cookie` é cortado em segmentos por `;`.
2. Em cada segmento, o nome é o texto antes do primeiro `=`. Segmento sem `=` não é cookie com nome e é ignorado.
3. Do nome e do valor, só SP (0x20) e HTAB (0x09) são aparados, nas duas pontas. Nunca `String.prototype.trim()`, nunca normalização Unicode, nunca troca de caixa.
4. O nome resultante é comparado por igualdade exata de code units com o nome do perfil (`__Host-cvg_operator_session`, `__Host-cvg_oidc_pending` ou o legado). O Node decodifica o cabeçalho em latin1, então isso é comparação byte a byte.
5. Exemplos que **não** são o nome: o nome `__Host-…` precedido de U+00A0 (byte `0xA0`), U+FEFF, U+200B, U+2003, U+3000, U+0085, U+000B, U+000C ou U+2028, e as variantes de caixa `__HOST-…` e `__host-…`. Exemplos que são: o nome precedido de SP ou de HTAB.

Por que: o navegador só aplica as regras do prefixo a um nome que começa com `__Host-`. Um nome `\xA0__Host-cvg_oidc_pending` plantado pela irmã com `Domain` não é prefixado para o navegador. Se o servidor aparar o `\xA0`, ele lê esse cookie como `__Host-`, e o prefixo deixa de proteger. A sonda da revisão r1 provou isso no formato da A ([probe-cookie-name-trim.cjs](../04_audit/evidence/UP91-025-OIDC-B-20261023/spec-review-r1/probes/probe-cookie-name-trim.cjs)), e a sonda sem rede da r2 lista os casos ([saída](../04_audit/evidence/UP91-025-OIDC-B-20261023/spec-review-r1/probes/probe-cookie-name-compare.out.txt)).

**Cookie sem nome.** Um cookie com nome vazio e valor `__Host-cvg_oidc_pending=x` chega ao servidor com os mesmos bytes de um cookie `__Host-` legítimo. O servidor não consegue separá-los. A defesa é do navegador: o rfc6265bis manda recusar cookie sem nome cujo valor começa com `__Host-`. O S0 confere isso no Chromium fixado; se ele aceitar, o BUILD para (§8).

**Por que esses `SameSite` com hosts distintos.**

- Console e API ficam no mesmo site (mesmo domínio registrável) e em hosts distintos. Uma chamada `fetch` do console para a API é cross-origin, mas same-site. Por isso o cookie `Strict` viaja nela.
- O operacional é `Strict`: nenhuma requisição iniciada por outro site o leva, nem o callback que vem do IdP. `None` exporia o cookie a contextos de outro site sem necessidade.
- O pendente é `Lax`: o callback chega por navegação de topo GET iniciada por um documento do IdP, em outro site. Com `Strict`, o pendente não viajaria e todo login falharia. `Lax` só viaja em navegação de topo com método seguro, e o pendente vive 5 min.
- O prefixo `__Host-` faz o navegador recusar cookie com `Domain`, sem `Secure` ou com outro `Path`. Uma origem irmã do mesmo site não consegue plantar o operacional nem o pendente (cookie tossing, `0254:166`). O pendente plantado seria login CSRF: a vítima entraria na conta do atacante. O operacional plantado seria fixação de sessão, ou uma duplicata que derruba a sessão legítima.

### 4.4 Cache

No modo OIDC, um `onSend` põe `cache-control: private, no-store` em toda resposta cujo caminho começa com `/v1/`. Substitui o `no-store` das rotas. Vale para respostas dos hooks, do error handler e para o 303 do callback. O `onSend` é registrado depois dos `onSend` de `oidc-routes.ts:196` e `server.ts:833`. Probes (`/health`, `/live`, `/ready`, `/health/metrics`) não mudam. A regra da SPEC0150 (`0150:72-77`) fica restrita ao modo OIDC (PB11).

### 4.5 Saída do callback para o navegador (substitui a D8 da A)

O callback é uma navegação de topo. Hoje, numa falha, o operador fica numa página JSON no host da API. Passa a voltar ao console (PB2):

| Resultado na A (passos 1–9 de `0254` §4.3)                                                                                   | Resposta na B1                                    | Cookies                      |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------- |
| sucesso (303)                                                                                                                | 303 `Location: <console>/` (sem mudança)          | como na A                    |
| recusa (401, passos 2–7)                                                                                                     | 303 `Location: <console>/#cvg-login=negado`       | como na A: pendente apagado  |
| indisponível (503, passos 5, 7 e 8)                                                                                          | 303 `Location: <console>/#cvg-login=indisponivel` | como na A: pendente apagado  |
| store de state indisponível (503, passo 3)                                                                                   | 303 `Location: <console>/#cvg-login=indisponivel` | como na A: pendente mantido  |
| limite do callback (429, passo 1)                                                                                            | 303 `Location: <console>/#cvg-login=indisponivel` | como na A: pendente intocado |
| erro do limitador do callback (503, passo 1, `oidc-routes.ts:339-342`)                                                       | 303 `Location: <console>/#cvg-login=indisponivel` | como na A: pendente intocado |
| recusa de hook global antes do handler (426, 403 de `Origin`, 429 do limitador global `server.ts:617-651`, 503 de readiness) | sem mudança (JSON)                                | sem mudança                  |

Regras:

- o destino é fixo (`login.consoleOrigin`). Parâmetros extras (`return_to`, `next`, `redirect_uri`, `url`), `Host`, `X-Forwarded-Host`, `Origin`, `Referer` e cookies não mudam o `Location`;
- o fragmento só tem os dois valores acima. Nunca leva `reasonCode`, code, state, identidade ou mensagem. O fragmento não vai ao servidor do console nem aos logs dele;
- respostas 303 sem corpo, com `cache-control: private, no-store`. A API já manda `referrer-policy: no-referrer` (`http-security.ts:275`): o URL do callback, que tem o code, não vaza como `Referer` para o console;
- logs, `reasonCode` e telemetria não mudam. Nenhuma chamada a mais ao token endpoint. O status do callback nas métricas de requisição passa de 4xx/5xx para 3xx nas falhas; o motivo continua no log;
- o start (`POST /v1/auth/oidc/start`) não muda: continua 200 JSON, e as recusas dele continuam em JSON;
- **saída padrão (regra de rebase com a U04):** uma falha nova do handler do callback que não esteja na tabela, como a releitura do principal da SPEC0262, vira 303 `#cvg-login=indisponivel` se for da classe 5xx e `#cvg-login=negado` se for da classe 4xx. O pendente segue a I8 da A.

### 4.6 Perfil de build do console

Variáveis de build: `VITE_CVG_OPERATOR_LOGIN`, `VITE_CVG_CONSOLE_ORIGIN`, `VITE_CVG_API_ORIGIN`.

- **Perfil atual** (`VITE_CVG_OPERATOR_LOGIN` ausente ou vazio): como hoje (relativo, proxy de desenvolvimento, simulação ou HMAC). Com qualquer das duas origens presente, o build falha ("perfil parcial").
- **Perfil OIDC** (`oidc`): exige modo de identidade `trusted`, teste controlado desligado, `NODE_ENV` diferente de `test` e as duas origens como origens `https:` exatas (`new URL(v).origin === v`, sem usuário, senha, caminho, query ou fragmento), com hosts distintos. Senão, o build falha. Com `NODE_ENV=test`, o `__CVG_WEB_MODE__` viraria `'test'` (`vite.config.mts:13-15`) e o bundle ligaria o perfil de teste controlado (`App.tsx:98-99`).
- O build OIDC falha se a saída contiver o prefixo `__CVG_OPERATOR_BOOTSTRAP_TOKEN` (cobre também `__CVG_OPERATOR_BOOTSTRAP_TOKEN_PROVIDER__`, `session.ts:32,75`) ou `x-cvg-operator-token`. O caminho do token fica atrás de constante de compilação, para o bundler removê-lo.
- Constantes novas: `__CVG_OPERATOR_LOGIN__`, `__CVG_CONSOLE_ORIGIN__`, `__CVG_API_ORIGIN__`. Também em `vitest.config.mts:71-78`, para os testes do console.
- Manifesto de build com digest e vínculo à imagem ficam para a B2.

### 4.7 Transporte do console

Uma função única `apiUrl(path)`, usada por toda chamada (requisição, páginas, sessão, logout, start):

- perfil atual: devolve `path` sem mudança;
- perfil OIDC: `path` precisa começar com `/v1/`, não pode começar com `//`, não pode ter `\` nem caractere de controle (0x00–0x1F e 0x7F, inclusive TAB e LF, que o `new URL` remove em silêncio) e não pode ser absoluto. Calcula `new URL(path, apiOrigin)` e exige origem igual a `apiOrigin` e caminho que ainda começa com `/v1/` depois da normalização (`/v1/../x` e `/v1/%2e%2e/x` recusam; [sonda](../04_audit/evidence/UP91-025-OIDC-B-20261023/spec-review-r1/probes/probe-apiurl.out.txt)). Violação lança erro de programação, sem requisição.

Toda chamada usa `credentials: 'include'`. No perfil OIDC, nenhuma chamada leva token, `Authorization` ou cabeçalho de identidade.

**Boot.** Antes de qualquer chamada: se `location.origin !== __CVG_CONSOLE_ORIGIN__`, estado `configuration_error`, zero chamadas.

### 4.8 Console: login, recarga, logout, expiração e estados

**Login.**

1. O operador aciona "Entrar" (mouse ou teclado). O botão fica desativado e o status diz "Abrindo o login…".
2. `POST apiUrl('/v1/auth/oidc/start')`, sem corpo, sem `content-type`, `credentials: 'include'`, sem retry, sem o gancho global de 401.
3. 200: valida `authorizationUrl` (texto; `new URL`; `https:`; sem usuário nem senha). Falha: `configuration_error`, sem navegação. Sucesso: `location.assign(authorizationUrl)` (PB13).
4. Falhas do start: rede, 429 ou ≥ 500 → "Login indisponível no momento. Tente novamente." e "Entrar" de volta; 400 ou 403 → `configuration_error`.

**Volta do IdP.** No boot, antes da sessão:

- se `location.hash` é exatamente `#cvg-login=negado` ou `#cvg-login=indisponivel`, guarda a mensagem e limpa o fragmento com `history.replaceState`;
- qualquer outro fragmento é ignorado e não é limpo;
- depois, `GET /v1/session`. Não há retorno para rota anterior (sem deep link).

**Recarga.** `GET /v1/session` só com cookie (A, §4.6).

**Logout.** `POST /v1/session/logout` com `credentials: 'include'`. O comportamento local é o atual (`App.tsx:308-318`): a sessão sai da tela no `finally`; se a API falhar, aparece "Não foi possível encerrar a sessão no servidor.". No perfil OIDC, o sucesso mostra "Sessão encerrada." e o foco vai para "Entrar".

**Expiração.** Timer em `expiresAt` (já existe) e 401 de qualquer rota levam ao estado expirado.

**Estados e textos no perfil OIDC** (no perfil atual, os textos de hoje ficam, J10):

| Situação                                       | Estado                    | Texto                                              | Ação               |
| ---------------------------------------------- | ------------------------- | -------------------------------------------------- | ------------------ |
| primeira visita, `GET /v1/session` 401         | `authentication_required` | "Entre com sua conta para continuar."              | "Entrar"           |
| 401 depois de sessão, ou timer                 | `expired`                 | "A sessão expirou. Entre novamente."               | "Entrar"           |
| `GET /v1/session` com rede, 429 ou ≥ 500       | `unavailable`             | "Sessão indisponível no momento. Tente novamente." | "Tentar novamente" |
| `GET /v1/session` 403                          | `configuration_error`     | "A configuração do console não é aceita pela API." | nenhuma            |
| `#cvg-login=negado`                            | `authentication_required` | "Não foi possível entrar com esta conta."          | "Entrar"           |
| `#cvg-login=indisponivel`, falha do start      | `authentication_required` | "Login indisponível no momento. Tente novamente."  | "Entrar"           |
| origem divergente, `authorizationUrl` inválida | `configuration_error`     | "Configuração do console inválida."                | nenhuma            |

**Ramos que o navegador não alcança (O11).** Os ramos "`GET /v1/session` 403" e "start 400 ou 403" protegem contra resposta legível inesperada. No navegador, uma API que não aceita a origem do console responde sem ACAO ou sem ACAC; o `fetch` falha como rede, e a tela mostra "indisponível" (§4.2). Esses ramos são provados só em jsdom (Q6). A origem divergente (J1) é alcançável e é provada no navegador (Q9k).

**Painéis, em todos os perfis:**

- 403 → "Sem permissão para esta área." (novo; nenhuma asserção atual cobre 403 de painel);
- rede, 429 ou ≥ 500 → "Erro ao carregar dados operacionais." (texto atual, mantido por J10);
- 404 em item → texto atual (`App.tsx:85`);
- outros → texto atual.

**Acessibilidade.** Toda ação por teclado. Avisos em região `role="status"` (já existe). O foco vai para o botão de ação quando o estado muda (já existe em `App.tsx:297-306`; vale também para `configuration_error` sem botão: o foco vai ao aviso).

### 4.9 NGINX do console (modelo novo, só B1)

Arquivo novo `deploy/console/nginx.console.conf.template`. Não entra no `Dockerfile` nem no compose nesta fatia (B2). `deploy/nginx.web.conf` não muda (R7.4).

- `server_tokens off`; serve `/usr/share/nginx/html`;
- `location = /v1` e `location ^~ /v1/`: 404, sem proxy e sem cair no SPA;
- `/health`, `/live`, `/ready`: 404;
- `/`, `/index.html` e todo caminho de SPA são servidos pelo `index.html`, sempre com `cache-control: no-store`;
- em **toda** resposta, inclusive 404, com `add_header … always` e repetidos em cada `location` (por causa da herança de `add_header` do NGINX):
  - `Content-Security-Policy: default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src __CVG_API_ORIGIN__; form-action 'self'`;
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- `__CVG_API_ORIGIN__` é trocado na renderização. O renderizador recusa valor que não seja origem `https:` exata e recusa placeholder restante.
- Contêiner da prova: `--read-only`, `--tmpfs /tmp` (a imagem `nginx-unprivileged` grava pid e temporários em `/tmp`; `Dockerfile:4-5`), `--cap-drop ALL`, `--security-opt no-new-privileges`.

### 4.10 IdP sintético: página de login (só teste)

Em `apps/api/src/__tests__/support/synthetic-oidc-issuer.ts`:

- `GET /authorize` com a mesma validação do POST (inclusive `redirect_uri` exato, 400 se inválido) devolve uma página HTML `lang="pt-BR"` com formulário `method="post"` para o mesmo URL: campos rotulados "Usuário", "Senha" e "Código de verificação" e botão "Entrar". Sem script;
- `POST /authorize` como hoje, com 302 para o callback (`synthetic-oidc-issuer.ts:372,399`). TOTP errado: a página volta com "Código inválido" e não emite code;
- opção de emitir o certificado TLS a partir de uma CA efêmera comum à borda de teste (§4.11). O issuer continua `https://localhost:<porta>`.

### 4.11 Ambiente da prova de navegador (só teste)

Três hosts HTTPS sintéticos, mais quatro hosts auxiliares:

| Papel                              | Origem                             | Site                | Servido por       |
| ---------------------------------- | ---------------------------------- | ------------------- | ----------------- |
| console                            | `https://console.cvg.test:<porta>` | `cvg.test`          | NGINX real        |
| API                                | `https://api.cvg.test:<porta>`     | `cvg.test`          | entrypoint da API |
| IdP                                | `https://localhost:<porta>`        | `localhost` (outro) | IdP sintético     |
| espelho do console (origem errada) | `https://mirror.cvg.test:<porta>`  | `cvg.test`          | NGINX real        |
| segunda origem permitida, sem ACAC | `https://reports.cvg.test:<porta>` | `cvg.test`          | servidor do teste |
| origem irmã (atacante)             | `https://sibling.cvg.test:<porta>` | `cvg.test`          | servidor do teste |
| outro site (atacante)              | `https://evil.other.test:<porta>`  | `other.test`        | servidor do teste |

- **Certificados.** CA efêmera por `openssl` em diretório temporário removido no fim. Uma folha com SAN de todos os nomes `.test` acima; a folha do IdP com `localhost`. Nada versionado.
- **Nomes.** O Chromium resolve os nomes `.test` para `127.0.0.1` por `--host-resolver-rules`. Sem `/etc/hosts`, sem DNS. A API não precisa resolver `.test` (PB9).
- **Confiança TLS no navegador.** `--ignore-certificate-errors-spki-list` com o SPKI das duas folhas (PB10).
- **Borda TLS** (Node `https`, suporte de teste): termina o TLS dos nomes `.test` e roteia pelo `Host`. Console e espelho vão ao NGINX. A API vai ao processo da API com `X-Forwarded-Proto: https` e `X-Forwarded-For`. As outras são páginas do próprio teste. Registra, por host e por requisição, só os **nomes** de cookie recebidos, em hex, e o status da resposta, nunca valores. Aceita um controle de teste para responder 503 ou cortar a conexão num caminho escolhido (Q9n).
- **API.** Processo filho `tsx apps/api/src/main.ts`, como no O10 da A: PG de `TEST_DATABASE_URL` com papéis e schemas de `oidc-postgres-fixture.ts`; `NODE_ENV=test`; modo OIDC; `API_REQUIRE_HTTPS=true`; `API_TRUSTED_PROXY_ADDRESSES=127.0.0.1`; `API_ALLOWED_ORIGINS` com o console e `reports`; `CVG_OIDC_REDIRECT_URI=https://api.cvg.test:<porta>/v1/auth/oidc/callback`; `NODE_EXTRA_CA_CERTS` só no filho.
- **Console.** `vite build` no perfil OIDC, numa pasta temporária, depois que as portas são conhecidas, com `NODE_ENV=production` explícito. Servido pelo NGINX real: contêiner `nginxinc/nginx-unprivileged:1.27-alpine` no digest do `Dockerfile:48`, com o modelo renderizado e o bundle montados só leitura, com as opções da §4.9, porta só em `127.0.0.1` (PB5). Sem Docker, o teste falha; não pula.
- **Portas.** Efêmeras, registradas no claim do BUILD. Nunca 3483, 4483 ou 56383.
- **Execução.** `playwright.oidc-hosts.config.ts` (só Chromium, `workers: 1`, `retries: 0`, `forbidOnly`), script `npm run test:e2e:oidc-hosts`, runner `scripts/oidc-hosts-browser-proof.mjs` e relatório `certification/oidc-hosts-browser-proof.json` com validador de contrato, no padrão do `rem21-014`. **A Q8 e a Q9 rodam só nesse runner**, fora do `test:core`, da cobertura e do `certify` (O6). No CI, gate novo `browser-oidc-hosts` depois do `browser-proof` (PB6).
- **Limite de taxa controlado.** Todos os contextos saem pelo mesmo `X-Forwarded-For` da borda. Um auxiliar de ritmo solta no máximo 9 starts e 25 callbacks em qualquer janela de **70 s**, contada pelo tempo de soltura, e espera quando preciso. A janela de 70 s cobre a janela ancorada de 60 s dos limitadores reais mais duas vezes a latência máxima. **O teste falha se um start ou um callback levar mais de 5 s** entre a soltura e a resposta. Um fluxo que precisa de várias vagas sem espera no meio (Q9i2, Q9i3) as reserva de uma vez, antes de começar. O 429 em si é provado na Q5, por `inject` (DB10; [sonda do crítico](../04_audit/evidence/UP91-025-OIDC-B-20261023/spec-review-r2/probes/probe-pacer-window.out.txt): com 60 s, 3 e 117 execuções com 429 em 2.000; com 70 s, nenhuma).
- **Limpeza.** Contêiner removido, processos encerrados por PID (sem `pkill -f`), papéis e schemas removidos, diretórios temporários apagados.

### 4.12 Contrato público (adendo à SPEC0107, promoção pelo lead)

- Modo OIDC, perfil HTTPS: cookies `__Host-cvg_operator_session` e `__Host-cvg_oidc_pending`; nomes legados não autenticam.
- Todos os modos: o nome do cookie é comparado de forma exata, aparando só SP e HTAB.
- Modo OIDC: `GET /v1/auth/oidc/callback` responde 303 para `<console>/`, `<console>/#cvg-login=negado` ou `<console>/#cvg-login=indisponivel`.
- Modo OIDC: CORS com credenciais só para a origem do console; preflight credenciado com `GET, POST, PATCH` e `accept, content-type`.
- Modo OIDC: `cache-control: private, no-store` em todo `/v1/**`.

## 5. Erros

| Situação                                                                                         | Resposta                                | Efeito                                         |
| ------------------------------------------------------------------------------------------------ | --------------------------------------- | ---------------------------------------------- |
| perfil HTTPS com console `http:`, mesmo host da API ou redirect `http:`                          | boot falha, saída 1, antes de `listen`  | nenhum pool aberto; stderr sem valor           |
| build OIDC com origem inválida, hosts iguais, perfil parcial, `NODE_ENV=test` ou token no bundle | build falha                             | nenhum artefato                                |
| preflight credenciado com método ou cabeçalho fora da lista                                      | 403 `forbidden`                         | —                                              |
| só o cookie legado, perfil HTTPS                                                                 | como sem cookie (401 em rota protegida) | sessão não restaurada                          |
| nome com espaço Unicode, caixa diferente ou sem `=`                                              | como sem cookie                         | sessão e pendente não lidos                    |
| dois cookies com o mesmo nome exato                                                              | como sem cookie (A)                     | sessão e pendente não lidos                    |
| mutação com qualquer nome do cookie e `Origin` diferente do console                              | 403 `forbidden` (A)                     | nenhum efeito                                  |
| recusa no callback                                                                               | 303 `#cvg-login=negado`                 | sem sessão; pendente apagado                   |
| indisponibilidade ou limite no callback                                                          | 303 `#cvg-login=indisponivel`           | sem sessão; pendente conforme a tabela da §4.5 |
| console em origem divergente                                                                     | `configuration_error`                   | zero chamadas                                  |
| `authorizationUrl` não `https:` ou com credenciais                                               | `configuration_error`                   | sem navegação                                  |
| NGINX do console em `/v1/**`, `/health`, `/live`, `/ready`                                       | 404 com CSP e `nosniff`                 | nada encaminhado                               |

## 6. Fora de escopo e resíduos

- **B2:** origens no `Dockerfile` e build de produção sem modo relativo; separar `deploy/harness/proxy/nginx.conf` por host; compose; manifesto (imagem, origens, issuer, redirect, certificado, allowlists); rollout e rollback da SPEC0150 (`0150:116-134`); mesmo site no manifesto. Até a B2, a produção segue com proxy de mesmo host e bundle relativo, contra os itens 1 e 6 da SPEC0150. Isso não abre risco novo: produção não compõe OIDC.
- **Modo HMAC (PB3):** `__Host-` e CSRF por `Origin` exato no modo HMAC ficam fora. Resíduo no C8: uma origem irmã do mesmo site pode plantar `cvg_operator_session` com `Domain` (fixação de sessão, ou duplicata que derruba a sessão legítima). Mitigação atual: `SameSite=Strict`, allowlist de `Origin` e a comparação exata do nome (§4.3).
- **U04 / UP91-026 (PB14):** revogação fora das rotas de caso (até 15 min) e escrita concorrente com revogação de grant. A U08 só fecha depois da U04 e de uma nova execução da Q9.
- **UP91-043:** Firefox, WebKit, 375/768/1440 px, revisão humana com leitor de tela, UAT.
- **Fatia C:** IdP real, RFC 9207, limite do start atrás de NAT, TLS e DNS reais.
- **Cookie sem nome:** a defesa é do navegador (§4.3). Navegadores fora do Chromium ficam com a UP91-043.
- Deep link depois do login, logout no IdP, `tldts` ou outra checagem de site por lista pública de sufixos.

## 7. Conjunto de escrita (candidata)

- **API:** `apps/api/src/http-security.ts`, `operator-session.ts` (nome por perfil e comparação exata), `operator-session-hook.ts`, `oidc-login-transaction.ts` (nome por perfil e comparação exata), `oidc-authority.ts`, `oidc-routes.ts`, `oidc-config.ts`, `production-bootstrap.ts` (só o perfil de cookie da autoridade), `server.ts` (`credentialedOrigin`, perfil de cookie, `onSend` de cache, nomes em `/v1/session` e logout).
- **Console:** `vite.config.mts`, `vitest.config.mts` (constantes novas; arquivo compartilhado, com claim), `apps/web/src/vite-env.d.ts`, `apps/web/src/api/client.ts`, `apps/web/src/auth/session.ts`, `apps/web/src/App.tsx`, e módulos novos pequenos se o BUILD preferir (por exemplo, `apps/web/src/api/origin.ts`).
- **Deploy:** novo `deploy/console/nginx.console.conf.template`.
- **Testes e suporte:** testes novos de API e de console; `synthetic-oidc-issuer.ts` (§4.10); suporte novo da borda e do ambiente de três hosts sob `tests/support/` ou `apps/api/src/__tests__/support/`; `tests/e2e/oidc-hosts.spec.ts`; `playwright.oidc-hosts.config.ts`; `scripts/oidc-hosts-browser-proof.mjs` e o contrato do relatório; ajustes sem afrouxar asserção nos testes da A que codificam 401/503 JSON do callback e `no-store` exato.
- **Governança:** `package.json` (script novo); `scripts/ci-bar-contract.mjs` e `.github/workflows/verify.yml` (gate novo, PB6); `scripts/skip-catalog.json` se algum teste de PG novo pular sem banco; adendo à SPEC0107.
- **Nada em:** migrations, `packages/persistence/**`, `apps/worker/**`, `products/**`, `legacy/**`, `apps/api/src/main.ts`, `Dockerfile`, `deploy/harness/**`, `deploy/nginx.web.conf`, `package-lock.json`.
- O BUILD precisa de claim próprio sobre `server.ts`, `operator-session-hook.ts`, `vitest.config.mts`, `apps/web/**`, contêiner, portas e o gate de CI ([coordenação](../08_runtime/agent_coordination.md)). A ordem com a U04 está na PB14.

## 8. Ordem do BUILD

1. **S0 — sonda de semântica do navegador** (evidência em `docs/04_audit/evidence/UP91-025-OIDC-B-20261023/s0/`, fora do código). Servidores mínimos, sem código CVG, no padrão da [PR301-CROSS-ORIGIN-PROBE](../04_audit/evidence/PR301-CROSS-ORIGIN-PROBE-20260927/proof.json), com os hosts da §4.11. Cada checagem tem resultado esperado:
   1. o pendente `Lax` gravado pela resposta do `fetch` credenciado do start (same-site) fica no navegador;
   2. o pendente chega ao callback depois de POST no IdP, 302 e GET, numa navegação iniciada pelo documento do IdP;
   3. o operacional `Strict` não chega a esse callback;
   4. o operacional gravado pela resposta do callback fica no navegador;
   5. o operacional chega no `fetch` credenciado do console depois do pouso;
   6. um cookie sem prefixo com `Domain=cvg.test`, gravado pela irmã, fica no navegador e chega à API (base do controle positivo da Q9i);
   7. `__Host-…` com `Domain=cvg.test`, gravado pela irmã, é recusado;
   8. o cookie sem nome com valor `__Host-cvg_oidc_pending=x` (`Set-Cookie: =__Host-cvg_oidc_pending=x; Domain=cvg.test; Secure; Path=/`), gravado pela irmã, é recusado. Na mesma resposta, a irmã grava o controle `cvg_probe_control8=1; Domain=cvg.test; Secure; Path=/`. A recusa só vale depois de o controle aparecer em `context.cookies()` e no log em hex da borda;
   9. **registro, sem resultado esperado:** o que o Chromium fixado faz com `\xA0__Host-cvg_oidc_pending=x; Domain=cvg.test; Secure; Path=/` (byte `0xA0` cru no `Set-Cookie`): se grava, se envia, e os bytes do nome que chegam à borda.

   **Qualquer uma das checagens 1 a 8 que falhar para o BUILD e volta ao usuário.** O desenho de `SameSite`, de prefixo ou o modelo de ameaça muda. A 9 é evidência; a regra do servidor (§4.3) não depende dela.

2. **Passo 1 — API, console e modelo NGINX** com Q1–Q7, Q10 e Q11.
3. **Passo 2 — ambiente de três hosts, Q8 e Q9**, e o gate de CI (PB6).
4. Mutantes, gates e revisão de código independente (até duas rodadas). Um PR, na ordem de merge da PB14.

## 9. Provas

Cada teste novo falha na base (first red) e passa no BUILD. Fixtures sintéticas da A: tenants A e B; grupos `synthetic-a-operator`, `synthetic-a-approver`, `synthetic-a-supervisor`, `synthetic-a-disabled`, `synthetic-b-operator`; usuários com um grupo cada, um sem grupo da matriz, um com `exp` de 30 s.

| ID  | Teste                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | First red na base                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Q1  | Configuração, perfil HTTPS: console `http:`, console no host da API, redirect `http:` → recusa antes de `listen`, sem valor na mensagem. Perfil HTTP: casos da A aceitos como hoje (guarda).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | a base aceita                                    |
| Q2  | CORS por `inject`, com login OIDC composto: `Origin` do console em `GET /v1/session` 200 e 401, 403 de rota, 404, 429 (limitador global), 500 (error handler), 503 (store fora) → ACAO exato, ACAC `true`, `Vary: Origin`. Preflight do console com `POST`/`PATCH` e `content-type` → 204 com ACAC. Preflight com `x-tenant-id`, `x-operator-role` ou `x-cvg-operator-token` → 403. Segunda origem permitida → ACAO sem ACAC. Origem irmã não permitida → 403 sem ACAO. Ordem dos hooks: o hook HTTP é o primeiro `onRequest` depois do hook de alvo (§4.2). Sem login OIDC: testes atuais (ACAC ausente) passam sem mudança.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | ACAC ausente                                     |
| Q3  | Cookies, perfil HTTPS (`enforceHttps` com proxy confiável e `X-Forwarded-Proto`):<br>• sucesso grava `__Host-cvg_operator_session` com `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, sem `Domain`; start grava `__Host-cvg_oidc_pending` `Lax` 300; logout e 401 limpam pelo nome `__Host-` com `Secure`;<br>• só o cookie legado → 401 em rota protegida, `GET /v1/session` 401, logout não revoga; pendente legado com state válido → recusa, zero chamadas ao token; mutação com o nome legado sem `Origin` → 403; os dois nomes presentes → vale o `__Host-`;<br>• **comparação exata (M1):** operacional e pendente com o nome precedido de U+00A0, U+FEFF, U+200B, U+2003, U+3000, U+0085, U+000B, U+000C ou U+2028, e com `__HOST-`/`__host-` → tratados como sem cookie (pendente: recusa, zero chamadas ao token). O U+00A0 vai também por socket cru com o byte `0xA0`, além do `inject`. Controles: o nome precedido de SP ou HTAB é lido. O mesmo vale no perfil `legacy` com o nome legado;<br>• dois `__Host-cvg_operator_session` crus → sem sessão (O15);<br>• autoridade e servidor com perfis diferentes → construção recusada;<br>• perfil HTTP: nomes legados (testes da A sem mudança de nome). | nomes legados; `trim()` aceita `\xA0__Host-`     |
| Q4  | Cache: inventário das rotas `/v1/**` registradas, no modo OIDC, com respostas 200, 303, 401, 403, 404, 429 e 503 → `private, no-store`. Probes sem mudança. Sem OIDC: nada muda.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | rotas sem `private`                              |
| Q5  | Callback: cada recusa do O5 da A → 303 `<console>/#cvg-login=negado`, pendente apagado, as mesmas contagens de chamadas ao token; cada indisponibilidade → `#cvg-login=indisponivel`; store de state fora → `indisponivel` com pendente mantido; 31ª chamada e erro do limitador → `indisponivel`, pendente intocado; 429 do limitador global → JSON; `return_to`, `next`, `redirect_uri`, `url`, `Host`, `X-Forwarded-Host`, `Origin` e `Referer` não mudam o `Location`; `Location` nunca tem code, state ou motivo; `reasonCode` continua no log.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 401/503 JSON                                     |
| Q6  | Console (vitest + jsdom): validador do perfil de build (origens ausentes, `http:`, com caminho, hosts iguais, perfil parcial, `NODE_ENV=test`); `apiUrl` (`/v1/x` aceito; `//evil`, `https://evil/v1/x`, `/v1/../x`, `/v1/%2e%2e/x`, `\\evil`, `/v1/\nx`, `/v1/\tx`, `/x` recusados sem `fetch`); origem divergente → erro de configuração e zero `fetch`; estados e textos da §4.8 para 401, 403, 404, 429, 503 e rede; start com `javascript:`, `http:` ou credenciais → sem navegação; fragmentos `negado` e `indisponivel` → mensagem e `replaceState`; outro fragmento intocado; painel 403 → "Sem permissão para esta área."; logout com 503 → comportamento atual.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | funções e textos inexistentes                    |
| Q7  | Bundle: `vite build` no perfil OIDC → saída sem o prefixo `__CVG_OPERATOR_BOOTSTRAP_TOKEN` e sem `x-cvg-operator-token`; build atual sem mudança; build falha nos perfis inválidos de Q6, inclusive com `NODE_ENV=test`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | perfil inexistente; token presente               |
| Q8  | NGINX real (contêiner com as opções da §4.9, modelo renderizado), só no runner `test:e2e:oidc-hosts`: `/`, `/index.html`, um asset e um caminho de SPA → 200 com a CSP exata e os cabeçalhos; `/`, `/index.html` e o caminho de SPA com `no-store`; `/v1`, `/v1/session`, `/health`, `/live`, `/ready` → 404 sem `index.html` e **com** CSP e `nosniff`. Renderizador (teste puro, sem Docker, pode ficar no vitest): recusa placeholder restante e origem inválida.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | modelo inexistente                               |
| Q9  | Navegador, Chromium, ambiente da §4.11 (ver abaixo).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | o build OIDC não existe; a prova para no passo a |
| Q10 | Fronteira e redação: nenhum arquivo fora de testes importa o suporte de três hosts ou a borda; o build de runtime e o bundle não têm o suporte; o modelo NGINX não tem segredo; nenhum code, token, segredo, senha ou TOTP sintético em URL do console, log da borda, log da API ou relatório. **Histórico de navegação** (CDP `Page.getNavigationHistory`): nenhuma entrada tem `code=`; as entradas do console são exatamente `<console>/`; só entradas do host do IdP têm `state`, `nonce` e `code_challenge` (exceção I9 da A; o TOTP errado da Q9m cria mais uma entrada do IdP). Lockfile sem mudança.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | guarda (verde na base)                           |
| Q11 | Regressão: suítes da A (O1–O12) verdes, com ajuste só no resultado do callback (Q5) e no `cache-control` (Q4); `rem21-014` 18/18; `critical-flows`; Playwright padrão; `http-security.test.ts` e `tests/e2e/http-security.spec.ts` sem mudança.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | guarda                                           |

**Q9 — matriz no navegador.** Cada item roda em contexto de navegador novo, salvo quando diz o contrário.

- **a. Primeira visita.** Console mostra "Entre com sua conta para continuar." e "Entrar". A API recebeu `GET /v1/session` com `Origin` do console e respondeu com ACAC.
- **b. Login só por teclado.** Tab até "Entrar", Enter → página do IdP → usuário, senha e TOTP por teclado, Enter → callback iniciado pelo documento do IdP → console com a identidade. URL final exatamente `<console>/`. O callback nunca é aberto por `page.goto` (diagnóstico da PR301-CROSS-ORIGIN-PROBE).
- **c. Cookies por host.** Nenhuma requisição ao host do console levou cookie `cvg`. No segundo login do mesmo contexto, o callback levou o pendente e não o operacional. As chamadas do console à API levaram o operacional. O cookie do primeiro login, reenviado por requisição crua depois do segundo login, recebe 401.
- **d. Recarga.** `page.reload()` restaura a identidade só pelo cookie. `localStorage.length` e `sessionStorage.length` são 0, `indexedDB.databases()` é vazio e `document.cookie` é `''` no console.
- **e. Tenant e role.** OperatorA com grant no caso X vê X; num item fora do grant, vê "Este item não está mais disponível para você." OperatorB (tenant B) não vê recursos do tenant A. Uma rota que responde 403 para a role logada mostra "Sem permissão para esta área."; a mesma rota com 503 injetado pela borda mostra "Erro ao carregar dados operacionais.". O BUILD escolhe a rota pelo first red e registra.
- **f. Logout por teclado.** "Encerrar sessão" → 200; `__Host-cvg_operator_session` some de `context.cookies()`; recarga mostra "Entrar"; o valor antigo, reenviado por requisição crua, recebe 401.
- **g. Expiração.** Usuário com `exp` de 30 s. Primeiro, um `GET /v1/session` 200 explícito e a identidade na tela. Depois, sem ação do usuário, o console mostra "A sessão expirou. Entre novamente." pelo timer; o valor do cookie, reenviado por requisição crua depois de `expiresAt`, recebe 401. Relógios reais na API, no IdP e no console. Timeout de teste explícito ≥ 90 s.
- **h. CSRF e origem.**
  - Página da origem irmã faz `fetch` credenciado de `POST /v1/tasks` → bloqueado (403 da API, sem ACAO).
  - Requisições cruas com o cookie e `Origin` irmã, `null`, `http:` ou ausente → 403.
  - Página da segunda origem permitida (`reports`) faz um `POST /v1/tasks` simples (`text/plain`, `credentials: 'include'`, sem preflight) → o hook HTTP deixa passar (ACAO, sem ACAC) e a guarda de CSRF responde 403. O `fetch` não lê o 403 (sem ACAC); quem confere o status é o log da borda.
  - Nenhuma task criada em nenhum caso. Start a partir da origem irmã → 403.
- **i. Cookie tossing e login CSRF (M2).** Três partes. Nenhuma pode passar vazia: cada desfecho negativo só vale depois do controle positivo da mesma parte.
  - **i1. Vítima sem cookie da API.** Numa só resposta, a irmã grava:
    - `cvg_probe_control=1; Domain=cvg.test; Secure; Path=/` (controle);
    - `__Host-cvg_operator_session=evil; Domain=cvg.test; Secure; Path=/`;
    - `__Host-cvg_oidc_pending=evil; Domain=cvg.test; Secure; Path=/`.

    Exigido: `cvg_probe_control` em `context.cookies()` com domínio `.cvg.test`, e o nome dele no log da borda numa requisição à API. Só então: nenhum cookie `__Host-` com domínio `.cvg.test` no contexto.

  - **i2. Login CSRF.** Antes de começar, o auxiliar de ritmo reserva as vagas da i2 (start do atacante, callback da vítima e callback do controle), para não haver espera entre a captura e o controle.
    - **Captura sem abrir o callback.** No contexto do atacante: start pelo console e página do IdP. O teste roteia o **POST ao `/authorize` do IdP** (a primeira URL da cadeia): chama `route.fetch({ maxRedirects: 0 })`, lê o code e o state no `Location` do 302 e responde com `route.fulfill`, com uma página neutra. O callback do atacante não é aberto. O `page.route` no callback não serve: o Playwright 1.59.1 não chama o handler em salto de redirect (`playwright-core/types/types.d.ts:4039`). Alternativa equivalente: o fluxo do atacante por HTTP cru no processo de teste (start com `Origin` do console e POST ao IdP sem seguir o redirect). O pendente do atacante (`__Host-cvg_oidc_pending`) é lido em `context.cookies()`.
    - **Plantio.** No contexto da vítima, a irmã grava esse pendente com o nome legado: `cvg_oidc_pending=<pendente do atacante>; Domain=cvg.test; Secure; Path=/; SameSite=Lax`.

    Controles antes do desfecho:
    - `cvg_oidc_pending` em `context.cookies()` com domínio `.cvg.test`;
    - a borda viu o nome `cvg_oidc_pending`, e não `__Host-cvg_oidc_pending`, no pedido do callback.

    O pedido do callback sai de um link na página da irmã, com o code e o state do atacante. Desfecho: "Não foi possível entrar com esta conta.", `GET /v1/session` 401 e zero chamadas novas ao token endpoint do IdP.

    **Controle de material vivo, depois do desfecho.** No contexto do atacante, com o `__Host-cvg_oidc_pending` dele, o callback com o mesmo code e o mesmo state completa o login: identidade do atacante em `GET /v1/session` e uma chamada a mais ao token endpoint. Tudo dentro dos 60 s de vida do code (`synthetic-oidc-issuer.ts:394`); o teste falha se o tempo entre a captura e o controle passar de 50 s. Esse controle separa a recusa certa do mutante N10: com o N10, o callback da vítima lê o pendente legado, consome o state e troca o code, e o controle falha (além de a vítima entrar na conta do atacante).

  - **i3. Vítima já autenticada (SPEC0150 `:147-150`).** A vítima tem `__Host-cvg_operator_session` válido e um `__Host-cvg_oidc_pending` vivo (start feito, sem concluir). Os valores dos dois são guardados. A irmã repete i1 e i2, com uma captura nova do material do atacante pelo mesmo método da i2 (o code da i2 já foi gasto no controle) e com as vagas reservadas antes. Ela também grava, com o nome legado e `Domain=cvg.test`, o valor de uma sessão real do atacante (`cvg_operator_session=<sessão do atacante>`). Mesmos controles positivos de i1 e i2. Exigido:
    - os cookies `__Host-` do contexto continuam com os valores guardados até o callback;
    - o callback com o code do atacante dá "negado";
    - `GET /v1/session` devolve a identidade da vítima;
    - o login seguinte da vítima termina com a identidade da vítima, não com a do atacante;
    - o controle de material vivo da i2, com a captura nova: no contexto do atacante, o mesmo code e o mesmo state completam o login dentro dos 60 s.

- **j. Redirect.** Callback com `return_to=https://evil.other.test` → pousa no console. IdP recebe `redirect_uri` diferente do registrado → 400 no IdP, sem code.
- **k. Origem divergente.** O mesmo bundle servido no espelho `https://mirror.cvg.test` → "Configuração do console inválida." e zero requisições à API vindas dessa origem.
- **l. CSP.** A página do console tenta `fetch` para `https://evil.other.test` → bloqueado pela CSP antes da rede; o servidor `evil` recebeu 0 requisições.
- **m. Falhas de login.** TOTP errado → fica no IdP, sem code. Usuário sem grupo da matriz → "Não foi possível entrar com esta conta." e URL final exatamente `<console>/` (fragmento limpo). Token endpoint 500 → "Login indisponível no momento. Tente novamente.", com o contador de chamadas ao token do IdP subindo exatamente 1 (um 429 do callback daria a mesma tela sem chegar ao token).
- **n. Indisponibilidade.** Borda responde 503 em `/v1/session` → "Sessão indisponível no momento. Tente novamente." e cookie preservado; "Tentar novamente" recupera quando a borda volta. Conexão cortada → o mesmo estado.
- **o. Acessibilidade.** axe sem violação `serious` ou `critical` nos estados: primeira visita, autenticado, expirado, indisponível, sem permissão, login negado e erro de configuração. Foco no botão de ação depois de cada mudança de estado.

## 10. Mutantes que os testes matam

- N1 ACAC para toda origem permitida (Q2).
- N2 ACAC só em 2xx (Q2; Q9a: o console não lê o 401 e fica em "indisponível").
- N3 ACAO refletindo origem não permitida (Q2).
- N4 sem `Vary: Origin` (Q2).
- N5 preflight credenciado aceita cabeçalho de identidade ou de token (Q2).
- N6 operacional sem `__Host-` no perfil HTTPS (Q3, Q9i).
- N7 `__Host-` com `Domain` ou sem `Secure` (Q3; Q9b: o Chromium descarta e o login não completa).
- N8 limpeza com o nome legado (Q3, Q9f).
- N9 parser aceita o nome legado no perfil HTTPS (Q3; Q9i3: duplicata com o legado do atacante derruba a sessão da vítima).
- N10 pendente legado lido no perfil HTTPS (Q3; Q9i2: a vítima entra na conta do atacante, e o controle de material vivo falha).
- N11 guarda de CSRF só pelo nome `__Host-` (Q3: mutação com nome legado sem `Origin` dá 401 em vez de 403).
- N12 `private` ausente numa rota `/v1/**` (Q4).
- N13 falha do callback em JSON (Q5, Q9m).
- N14 destino do 303 lido da requisição: parâmetro, `Host`, `X-Forwarded-Host`, `Origin` ou `Referer` (Q5, Q9j).
- N15 fragmento com `reasonCode` (Q5).
- N16 `apiUrl` aceita URL absoluta, `//`, controle ou fuga de `/v1/` (Q6).
- N17 sem checagem de `location.origin` (Q6, Q9k).
- N18 navegação para `authorizationUrl` não `https:` (Q6).
- N19 503 tratado como 401 (Q6; Q9n: a tela mostra "Entrar" em vez de "Sessão indisponível").
- N20 403 com o texto de indisponível (Q6, Q9e).
- N21 bundle OIDC com o caminho do token (Q7).
- N22 NGINX encaminha `/v1/` ou cai no SPA (Q8).
- N23 `connect-src` amplo (`*`, `https:` ou `'self'` a mais) (Q8, Q9l).
- N24 fragmento não limpo (Q6; Q9m: URL final diferente depois de "negado").
- N25 configuração aceita console `http:` ou no host da API no perfil HTTPS (Q1).
- N26 composição aceita perfis de cookie diferentes na autoridade e no servidor (Q3).
- N27 parser apara espaço Unicode no nome, por `trim()` do JavaScript (Q3: `\xA0__Host-…` lido como `__Host-`).
- N28 guarda de CSRF compara com a allowlist em vez da origem do console. Já morto pelo teste O8 da A (`oidc-login-guards.test.ts:266-290`, com `SIBLING` na allowlist e 403 vindo da guarda). Na Q9h, o sintoma no navegador seria só o status registrado pela borda (400 em vez de 403), sem task criada.

## 11. Aceites

1. O perfil HTTPS recusa console `http:`, console no host da API e redirect `http:` antes de `listen` (Q1).
2. Só a origem do console recebe CORS com credenciais, em todo status depois do hook HTTP, com `Vary: Origin`; o preflight credenciado só aceita `GET, POST, PATCH` e `accept, content-type` (Q2).
3. No perfil HTTPS, os dois cookies têm `__Host-`, `Secure`, `HttpOnly`, `Path=/` e o `SameSite` da §4.3; nomes legados não autenticam nem viram pendente; a limpeza funciona (Q3).
4. O nome do cookie é comparado de forma exata, aparando só SP e HTAB; espaço Unicode, caixa diferente e duplicata não são lidos (Q3, N27).
5. Toda resposta `/v1/**` no modo OIDC tem `private, no-store` (Q4).
6. O callback volta sempre ao console, com destino fixo e só duas categorias de falha, sem mudar efeitos de cookie, chamadas ao token e logs da A (Q5).
7. O console no perfil OIDC só chama a origem compilada, recusa origem divergente e não carrega o caminho do token (Q6, Q7, Q9k).
8. Login, recarga só com cookie, logout e expiração funcionam no Chromium em três hosts HTTPS sintéticos, só por teclado (Q9b, Q9d, Q9f, Q9g).
9. O servidor do console nunca recebe cookie; o callback recebe o pendente e não o operacional (Q9c).
10. CSRF (inclusive da segunda origem permitida), origem irmã e redirect incorreto são recusados (Q9h, Q9j).
11. Cookie tossing e login CSRF são recusados com controle positivo do plantio e do material do atacante, sem e com a vítima autenticada (S0, Q9i).
12. Tenant e role indevidos são recusados, e a UI distingue "sem permissão", "indisponível" e "item indisponível para você" (Q9e, Q9n).
13. O NGINX real do console não encaminha `/v1/` e serve a CSP exata em toda resposta; a CSP bloqueia origem não aprovada no navegador (Q8, Q9l).
14. Nada de token em storage, cookie legível, URL ou log; no histórico, só a exceção da I9 (Q9d, Q10).
15. axe sem violação `serious` ou `critical` nos estados de login (Q9o).
16. Modo HMAC, perfil HTTP e suítes atuais sem regressão nem ajuste de asserção fora de Q4 e Q5 (Q11).
17. Mutantes N1–N28 mortos e registrados.
18. As checagens 1 a 8 do S0 passaram, e a 9 está registrada (§8).
19. A prova roda no CI no gate novo, sem `skipped` e sem `flaky` (PB6).

## 12. Gates de pronto

- Node 22: `npx prettier --check` nos tocados, `npm run -s lint`, `npm run -s typecheck`, `npm run -s skip:governance`, `npm run -s docs:check-links`.
- Testes focais Q1–Q7, Q10 e o renderizador da Q8; suítes `apps/api` e `apps/web`; `test:postgres` com PostgreSQL descartável próprio (porta no claim).
- Cobertura com o comando do CI (`test:core --coverage`), `coverage:critical` e mutation guard. Nenhum teste com Docker ou navegador entra no `test:core`.
- E2E: `critical-flows`, `rem21-014`, Playwright padrão e `test:e2e:oidc-hosts` (Q8 e Q9) na candidata.
- `npm audit --omit=dev` sem high ou critical. Sem mudança de lockfile: `licenses:check` e SBOM só se o lockfile mudar (não deve).
- S0 registrado e verde (checagens 1 a 8) antes do passo 1.
- Revisão de código independente (contexto novo), até duas rodadas. `certify` integrado no CI.
- Não autoriza deploy, produção, dado real, IdP ou conta real, nem release.

## 13. Riscos

- **Semântica de cookies na cadeia completa.** As provas de 27–28/09 não fizeram o caminho todo (IdP por POST → callback → pouso → `fetch`). O S0 vem antes de tudo e para o BUILD em qualquer falha das checagens 1 a 8.
- **Comportamento do Chromium com nomes estranhos.** O servidor não depende disso para o `\xA0` (§4.3). Para o cookie sem nome, depende: o S0 confere, e outros navegadores ficam com a UP91-043.
- **Instabilidade no CI.** O gate não aceita `flaky` nem retry. Pontos frágeis: `vite build` dentro do teste, pull da imagem NGINX, expiração, limite de taxa e vida de 60 s do code. Mitigação: timeouts explícitos, imagem por digest, `exp` de 30 s com 200 explícito antes da espera, esperas por evento e não por tempo, ritmo com janela de 70 s, latência máxima de 5 s e vagas reservadas nos fluxos com code.
- **Docker na prova.** Sem Docker, Q8 e Q9 falham. O CI tem Docker; o BUILD local precisa de claim de contêiner. Q8 e Q9 ficam fora do `test:core`.
- **Contrato do callback muda.** Testes da A que esperam 401/503 JSON mudam para 303. O crítico de código confere que nenhum efeito da A foi afrouxado.
- **`private, no-store`.** Asserções exatas de `no-store` nos testes da A mudam (aperto).
- **Construir antes da U04 (PB14).** Ver a frase de risco residual na PB14. Não há exposição hoje: o OIDC só roda com `NODE_ENV=test` (J9). A B1 é reversível: um PR, sem migração. O custo de construir antes é retrabalho e uma nova Q9 depois da U04.
- **Conflito de arquivos com a U04.** `server.ts`, `operator-session-hook.ts`, o callback e o formato da sessão (SPEC0262: Auth v2, releitura do principal no callback e guarda por requisição). Um delta por vez, com rebase e validação integrada, e as três regras de rebase (§4.2, §4.3, §4.5). O pior caso sem elas é regressão de comportamento, não de segurança.
- **Produção fora do desenho da SPEC0150 até a B2.** Proxy de mesmo host e bundle relativo continuam. Sem OIDC em produção, o risco é de cronograma, não de exposição.
- **`--ignore-certificate-errors-spki-list`.** Se o Chromium fixado ignorar a flag, cai no `ignoreHTTPSErrors` (PB10), e o relatório registra que a confiança TLS ficou sem prova nesta fatia.
- **Só Chromium.** Diferenças de `SameSite` e de cookies no WebKit e no Firefox ficam para a UP91-043.
- **Topologia sintética.** `.test` e `localhost` não são o DNS nem a CA do hospital. Mesmo site, DNS e certificado reais ficam para B2 e C.
- **Site diferente em produção.** Se console e API ficarem em sites diferentes, o `Strict` não viaja e o login entra em laço de 401. Falha fechada; a B2 checa no manifesto.
- **Configuração de origem errada vira "indisponível".** No navegador, a API que não aceita o console aparece como indisponível, não como erro de configuração (§4.8).
- **Fragmento forjado.** Qualquer página pode levar o operador a `<console>/#cvg-login=negado`. O efeito é só uma mensagem: nenhum estado, cookie ou chamada muda.

## 14. Premissas e decisões

Separadas por quem decide. A revisão r1 conferiu a classificação.

### 14.1 Decisões do usuário

- **PB1 — Corte B1/B2.** O empacotamento de produção da SPEC0150 (origens no `Dockerfile`, build de produção sem modo relativo, proxy do harness por host, compose, manifesto, rollout e rollback) fica para uma SPEC B2, depois da decisão de expor o console (`deploy/harness/README.md:413`) e do servidor. **Default proposto: sim.** Justificativa: `Dockerfile:16` acopla a imagem `runtime` ao build do console; produção recusa OIDC até a C (`oidc-config.ts:284-286`); `deploy/harness/**` está nas unidades do Codex. Custo: até a B2, a produção fica contra os itens 1 e 6 aprovados da SPEC0150 (`0150:48-56`, `:105-114`).
- **PB3 — Modo HMAC sem `__Host-` e sem CSRF por `Origin` exato.** É escolha de corte, não impedimento técnico. `__Host-` no modo HMAC com HTTPS não exige origem de console: no C8, console e API ficam no mesmo host atrás do proxy, e um cookie `__Host-` host-only funciona. O custo de fazer agora é trocar o nome no ensaio C8 (relogin com token de bootstrap) e ajustar os testes HMAC com HTTPS que fixam o nome. Só o CSRF por `Origin` exato no HMAC exigiria aceitar uma origem de console nesse modo, que a configuração hoje recusa. Fica fora da B1 também o que estava em `0254:307` e `0254:460`. **Resíduo de segurança no C8:** uma origem irmã do mesmo site pode plantar `cvg_operator_session` com `Domain`, para fixar uma sessão ou derrubar a legítima com duplicata. Mitigação: `SameSite=Strict`, allowlist de `Origin` e comparação exata do nome. **Default proposto: sim, fora da B1.**
- **PB14 — Construir a B1 antes de a U04 fechar?** O backlog 0399 põe a U08 depois da U04. O Codex confirmou (timeline, 23/10 12:41) que a recon da U04 não dispensa essa ordem. **Pergunta ao usuário:** autoriza o BUILD da B1 (código e prova sintética, só `NODE_ENV=test`) antes de a U04 fechar?
  - **Risco residual, em uma frase:** até a U04 fechar, o console funciona com a sessão atual, em que uma role trocada ou um operador desativado continua valendo até 15 min fora das rotas de caso, e uma revogação de grant concorrente pode deixar passar uma escrita (corrida reproduzida pelo Codex na `main` `9a56`).
  - **Exposição e reversão:** não há exposição hoje, porque o OIDC só roda com `NODE_ENV=test` e a produção o recusa (J9). A B1 é reversível: é um PR, sem migração. O que chega fora do modo OIDC é só aperto (comparação exata do nome do cookie e texto de 403).
  - **Estado da SPEC0262 (U04), lido em 23/10/2026 às 10:29:44 -0300 (13:29:44 UTC):** `docs/02_spec/0262_case_mutation_session_revocation.md` no checkout compartilhado, fora da `main`. Revisão **R4**, estado `PROPOSED_FOR_TECHNICAL_REVIEW`, sha256 `65a0863e9974c97bf10551a0582433e6cac05e1d4a0c27ef8fa49a0372bfedeb` (timeline do Gbrain, 13:27 UTC, "contrato0262 r4"). O hash mudou várias vezes no mesmo dia e pode mudar de novo: a pergunta ao usuário cita a versão vigente no momento em que for feita. A §7 diz: "Shared server.ts/operator-session-hook.ts/callers com0259 são integrados um delta porvez/rebase e novo teste conjunto; não editar aSPECdoClaude. U04 não édispensada porB1 e nenhummock do console certifica autoridade real."
  - **Três acoplamentos da SPEC0262 com a B1:**
    - **migração do Auth v2 com corte** (§6.2): `operator-session/0002_principal_revision.sql`, funções `operator_session_*_v2` e remoção das antigas; no corte, os cookies antigos exigem novo login. A B1 também força novo login no perfil HTTPS (nome `__Host-`); depois da U04, a Q9 roda de novo sobre as funções v2;
    - **releitura do principal no callback** antes do `Set-Cookie` (§6.2): é um caminho novo de falha no callback que a B1 remapeia; cai na saída padrão da §4.5;
    - **guarda a cada requisição** (§5): um `preHandler` em modo trusted que responde 401 (apaga o cookie) ou 503 (mantém o cookie). O console já trata 401 como expirada e 503 como indisponível (J8); a ordem dos hooks (§4.2) garante CORS nesses status, e a função única de cookie (§4.3) garante a limpeza pelo nome certo.
  - **Ordem de rebase:** quem entrar primeiro na `main` define a base; o outro faz rebase e roda de novo a validação integrada (suítes de API, `test:postgres` e Q9), com as três regras de rebase (§4.2, §4.3 e §4.5). A B1 não edita a SPEC0262, e a U04 não edita a SPEC0259.
  - **Condição de fecho:** com "sim", a U08 só fecha depois que a U04 fechar e a Q9 rodar de novo sobre a sessão da U04. Aprovação técnica não fecha a U08 nem dá GO.
  - **Default proposto: sim, com as condições acima.** Com "não", a B1 espera a U04, que depende da U03 (SPEC0257 com APPROVE técnico e T3 humana pendente) e ainda está em revisão técnica, sem revisão humana.

### 14.2 Decisão do dono do CI (Codex)

- **PB6 — Gate de CI novo.** `browser-oidc-hosts` em `scripts/ci-bar-contract.mjs` e `.github/workflows/verify.yml`, depois do `browser-proof`, só Chromium, `skipPolicy: 'none'`. O Codex conduz a SPEC0260 (concorrência da Verify, PR #27) e a SPEC0261 (reuso de medições no `certify`). **Default proposto:** o gate entra na B1 depois do merge do PR #27, com rebase, e não muda o reuso da SPEC0261. Se o dono do CI não concordar a tempo, a prova roda local com evidência, e o gate entra antes de fechar a U08. Justificativa: o gate `e2e` não comporta PG, Docker e zero `skipped`; prova fora do CI se perde.

### 14.3 Defaults técnicos (o crítico confere; não vão ao usuário)

- **PB2 — Callback volta ao console.** Falhas viram 303 com fragmento fixo, em vez de 401/503 JSON. Já previsto pela D8 da A (`0254:458`). Efeitos da A preservados (revisão r1, ponto 4).
- **PB4 — Só Chromium.** Firefox, WebKit, viewports e UAT ficam na UP91-043. O cartão pede "navegador real".
- **PB5 — NGINX real por Docker.** Imagem base fixada do `Dockerfile:48` com o modelo e o bundle montados, não a imagem web construída (consequência da PB1). Desvio declarado de `0150:151-155`.
- **PB7 — Sem checagem de site no código.** Sem `tldts`. Igual a `0150:42-44`; site errado falha fechado.
- **PB8 — `__Host-` só no modo OIDC com HTTPS.** Igual a `0150:99-101`; preserva o O10 da A.
- **PB9 — Hosts da prova.** `*.cvg.test` pelo Chromium; IdP em `https://localhost:<porta>`, outro site. O S0 reconfirma o mesmo site.
- **PB10 — Confiança TLS.** SPKI das duas folhas efêmeras por flag. Se cair no `ignoreHTTPSErrors`, o relatório registra que a confiança TLS ficou sem prova.
- **PB11 — `private, no-store` só no modo OIDC.** A regra da SPEC0150 (`0150:72-77`) pede todo `/v1/**`; aqui ela fica restrita ao modo OIDC. Impacto baixo: o modo HMAC já põe `no-store` na maioria das rotas, e `no-store` já impede cache.
- **PB12 — Preflight credenciado restrito.** `GET, POST, PATCH` e `accept, content-type` para o console; as outras origens permitidas mantêm a lista atual.
- **PB13 — Login por `fetch` e `location.assign`.** O console valida `https:` e ausência de credenciais na `authorizationUrl`, sem origem do IdP compilada. A API já prende o endpoint à origem do issuer (`oidc-login-transaction.ts:229-236`).

### 14.4 Defaults de detalhe

- **DB1** fragmentos `#cvg-login=negado` e `#cvg-login=indisponivel`.
- **DB2** textos da §4.8. O texto de indisponibilidade dos painéis fica igual ao atual (J10).
- **DB3** textos proibidos no bundle OIDC: o prefixo `__CVG_OPERATOR_BOOTSTRAP_TOKEN` e `x-cvg-operator-token`. Os cabeçalhos de simulação ficam no bundle, inertes no modo trusted e bloqueados pelo preflight (PB12).
- **DB4** CSP da §4.9, igual à do desenho isolado de 28/09 com `base-uri 'none'` e `font-src 'self'`.
- **DB5** portas efêmeras; bundle construído dentro do teste depois que as portas existem, com `NODE_ENV=production`.
- **DB6** 503 da UI provado pela borda de teste; o 503 real da API já está provado no O10 da A.
- **DB7** relatório `oidc-hosts-browser-proof.json` com contagem de testes, zero `skipped` e `flaky`, resumo do axe, resultado do S0 e vínculo de run e candidato, no padrão do `rem21-014`.
- **DB8** sem deep link e sem `return_to`.
- **DB9** limites do start e do callback sem mudança.
- **DB10** ritmo controlado dos logins na prova (no máximo 9 starts e 25 callbacks por janela de 70 s, latência máxima de 5 s, vagas reservadas nos fluxos com code), em vez de `X-Forwarded-For` por contexto: a borda não distingue contextos do mesmo navegador sem proxy por contexto, e um cabeçalho extra por contexto dispararia preflight credenciado (PB12).

### 14.5 Atos do usuário que esta SPEC não assume

- responder PB1, PB3 e PB14;
- autorizar o BUILD depois do APPROVE do crítico;
- fazer o merge do PR do BUILD;
- decidir expor o console, os hostnames e o certificado (B2), e o IdP do hospital (C);
- qualquer deploy, uso por equipe, dado real ou conta real.
