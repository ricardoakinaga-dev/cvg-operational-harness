# Crítica independente da SPEC0259 r1 — U08 / UP91-025 fatia B1

- **SPEC:** `docs/02_spec/0259_oidc_console_distinct_hosts.md`, r1, sha256 `199886616da9904154096c318e1666e5bd99f65861a777aba5849720444e96c1`. Conferido antes e depois da revisão.
- **Recon:** `docs/04_audit/evidence/UP91-025-OIDC-B-20261023/recon.md`, sha256 `f2c4af629ad07ce40d616bb07a0d1c1c716a7524fdc98d4c74c27f2cc7c0c869`.
- **Base:** worktree `/mnt/dados/cvg-work/cvg-d9ef-u08-oidc-b-20261023`, `main` `9a56a9c94`. Código só lido.
- **Crítico:** Claude Code, contexto independente. Não escrevi a SPEC nem o recon.
- **Data:** 23/10/2026.
- **Limites:** sem commit, push, PG, contêiner, porta de serviço, navegador real ou lockfile. As três sondas abaixo usam Node 22, dados sintéticos e o scratchpad da sessão.

## Veredito: `REVISE`

O desenho é bom e, na maior parte, fiel ao código. Conferi os pontos que o executor pediu:

- o modelo de navegação entre sites está certo;
- o CORS com credenciais vale em todos os status depois do hook HTTP (provei no Fastify 5.12.7);
- a troca da D8 por 303 não afrouxa efeito da fatia A;
- os cortes PB1 e PB3 contradizem texto aprovado, mas estão declarados.

Há **dois obrigatórios**. Os dois atacam a mesma promessa central da B1: uma origem irmã não consegue plantar o cookie operacional nem o pendente (J2, §4.3).

- **M1.** A SPEC não fixa como o servidor compara o nome `__Host-`. Os parsers da fatia A, que a B1 vai estender, usam `String.prototype.trim()`, e esse método tira espaço Unicode. Provei o lado do servidor: um nome com o byte `0xA0` antes de `__Host-` é lido como o cookie `__Host-`.
- **M2.** A Q9i, única prova de navegador contra cookie tossing e login CSRF, não tem controle positivo. Ela passa mesmo se o cookie plantado nunca chegar à API. Também falta o caso "quando já há cookie da API", que a SPEC0150 aprovada exige.

As duas correções são pequenas e não mudam premissa.

## Obrigatórios

### M1 — Nome `__Host-` sem regra de comparação exata; a implementação de referência aceita prefixo com espaço Unicode

- **Defeito.** A §4.3 diz: "Só o nome `__Host-` autentica… O nome legado nunca autentica". Mas não diz **como** o nome é comparado. A B1 vai parametrizar os parsers atuais, e os três aparam o nome com `trim()` do JavaScript. Esse método remove U+00A0, U+FEFF e a categoria Zs, não só SP e HTAB. O Node decodifica cabeçalho em latin1, então um byte `0xA0` vira U+00A0.

  O navegador só aplica as regras do prefixo (sem `Domain`, `Secure`, `Path=/`) a um nome que **começa** com `__Host-`. Um nome `\xA0__Host-cvg_oidc_pending`, plantado pela irmã com `Domain=cvg.test`, não é tratado como prefixado. Se o Chromium aceitar e enviar esse byte, o servidor o lê como `__Host-`, e isso abre dois ataques:
  - **pendente plantado:** login CSRF, ou seja, a vítima entra na conta do atacante;
  - **operacional plantado:** fixação de sessão. Se a vítima já tem o cookie legítimo, o par vira duplicado, e o hook responde 401 e apaga o cookie legítimo.

  A classe de ataque é conhecida: servidor que apara espaço Unicode no nome do cookie desfaz o `__Host-`. Eu **não** provei o lado do Chromium, porque navegador real estava fora do meu escopo. Mas a garantia J2 não pode depender disso.
- **Evidência.**
  - `apps/api/src/oidc-login-transaction.ts:278`: `segment.trim().split('=')`, leitura do pendente.
  - `apps/api/src/operator-session.ts:97`: `rawName?.trim() !== OPERATOR_SESSION_COOKIE`, leitura do operacional.
  - `apps/api/src/oidc-routes.ts:99`: `segment.split('=')[0]?.trim()`, guarda de CSRF. Aqui aparar a mais não faz mal, porque a guarda só fica mais estrita.
  - SPEC0259 `:121` (regra de leitura), `:131` (promessa contra cookie tossing), `:322` (Q3), `:342` (Q9i) e `:360-361` (N9, N10). Nenhuma delas cobre nome com espaço Unicode.
  - Sonda `probe-cookie-name-trim.cjs` (Node 22.23.2, socket cru com `Cookie: \xA0__Host-cvg_oidc_pending=…; \xA0__Host-cvg_operator_session=…`):
    - o servidor recebeu o code point `a0`;
    - a leitura no formato da A devolveu `SYNTHETIC_ATTACKER_PENDING` e `opsess_SYNTHETIC_ATTACKER`;
    - a comparação exata, que apara só SP e HTAB, devolveu `null` nos dois.
  - `' x'.trim()`, `'﻿x'.trim()` e `' x'.trim()` dão `x`.
- **Correção mínima.**
  1. Na §4.3, escrever a regra. O nome do cookie é cortado no primeiro `=`. Só SP (0x20) e HTAB (0x09) são aparados. A comparação é byte a byte com `__Host-cvg_operator_session` ou `__Host-cvg_oidc_pending`. Vale para o hook, `GET /v1/session`, o logout, o `previousSessionId` e o pendente. A guarda de CSRF pode continuar mais larga.
  2. Na Q3, adicionar um negativo com nome precedido de `\xA0` e outro com `﻿`, enviados em latin1 por `inject` ou socket cru: os dois tratados como sem cookie. Na lista de mutantes, adicionar N27: "parser apara espaço Unicode no nome (Q3)".
  3. No S0, ou na Q9i, registrar o que o Chromium fixado faz quando a irmã grava `\xA0__Host-…; Domain=cvg.test` e o cookie sem nome `=__Host-…; Domain=cvg.test`. O resultado vira evidência e não muda a regra do servidor.

### M2 — A Q9i não tem controle positivo e omite o caso "quando já há" da SPEC0150

- **Defeito.** A Q9i só afirma o desfecho negativo. Na primeira parte, o Chromium recusa `__Host-` com `Domain` ("nada em `context.cookies()`"). Na segunda, a vítima levada ao callback com o pendente legado do atacante cai em `#cvg-login=negado`.

  Na implementação correta, esse desfecho é **o mesmo** em dois cenários: quando o cookie legado foi plantado e chegou ao callback, e quando ele nunca foi gravado (por `Domain`, `Secure` ou `SameSite` errado, ou por recusa de `Domain=cvg.test` sob `.test`). Por isso, a prova de navegador do aceite 9 ("cookie tossing e login CSRF recusados") pode passar vazia.

  Nem a PR301 nem a PR302 tiveram controle positivo de cookie sem prefixo com `Domain` vindo da irmã. Elas só provaram a recusa do `__Host-`. Além disso, a SPEC0150 aprovada pede a tentativa "quando não há cookie da API **e quando já há**". A Q9i roda em contexto novo e cobre só o primeiro caso. O desvio não está declarado na §14.1.
- **Evidência.**
  - SPEC0259 `:342` (Q9i) e `:389` (aceite 9).
  - SPEC0150 `:147-150` ("Uma origem irmã tenta injetar cookie operacional/pending com `Domain` quando não há cookie da API e quando já há").
  - `PR302-HTTPS-BROWSER-20260928/probe.mjs:197-204`: a irmã só grava `__Host-cvg_operator_session=evil; Domain=example.test`, sem controle.
  - `PR301-CROSS-ORIGIN-PROBE-20260927/proof.json`: observa só a recusa (`siblingDomainInjection…Rejected`).
  - N10 também é morto pela Q3, em unidade. O que fica sem prova é o lado do navegador do aceite 9.
- **Correção mínima.** Na Q9i:
  - **controle positivo do plantio:** na mesma resposta da irmã, gravar também um cookie sem prefixo, por exemplo `cvg_probe_control=1; Domain=cvg.test; Secure; Path=/`. Exigir que ele apareça em `context.cookies()` com domínio `.cvg.test` e chegue ao host da API (log de nomes da borda). Assim fica provado que a recusa do `__Host-` vem do prefixo;
  - **controle do pendente legado:** antes de exigir `#cvg-login=negado`, exigir que `cvg_oidc_pending` esteja em `context.cookies()` com domínio `.cvg.test` e que a borda tenha visto esse nome no pedido do callback;
  - **caso "quando já há":** repetir as duas tentativas num contexto em que a vítima já tem `__Host-cvg_operator_session` válido e um `__Host-cvg_oidc_pending` vivo. Esperado: os cookies `__Host-` continuam os da API, e `GET /v1/session` devolve a identidade da vítima (o login seguinte não vira a do atacante).

## Opcionais

- **O1 — PB3 com justificativa imprecisa (corrigir antes de levar ao usuário).** A PB3 diz que mudar o modo HMAC "exigiria aceitar origem de console no modo HMAC". Isso vale para o CSRF por `Origin` exato. Não vale para o `__Host-`. No HMAC com HTTPS (C8), console e API ficam no mesmo host atrás do proxy, e um cookie `__Host-` host-only funciona sem origem de console. O custo real é outro: trocar o nome no C8 (relogin com token de bootstrap) e ajustar testes HMAC com HTTPS que fixam o nome. O usuário precisa dessa informação para aceitar o resíduo de C8. No mesmo item, dizer que a PB11 estreita para o modo OIDC o `private, no-store` que a SPEC0150 pede para todo `/v1/**` (`0150:72-77`). O impacto é baixo: o HMAC já põe `no-store` na maioria das rotas (por exemplo, `case-routes.ts:574` e seguintes), e `no-store` já impede qualquer cache.
- **O2 — Tabela da §4.5 incompleta.** Faltam duas linhas:
  - o 503 por erro do limitador no passo 1, com pendente intocado (`oidc-routes.ts:339-342`). Sem essa linha, o BUILD pode mapeá-lo para "indisponível, pendente apagado" e contrariar a I8 da A;
  - o 429 do limitador global (`server.ts:617-651`), que é hook antes do handler e continua em JSON.

  Registrar também que o status do callback em métricas passa de 4xx para 3xx nas falhas. O `reasonCode` continua no log.
- **O3 — Q5 e N14.** Incluir `Host`, `X-Forwarded-Host` e `Origin` entre as entradas que não podem mudar o `Location`. São as fontes mais prováveis de um destino "derivado da requisição".
- **O4 — Q9g pode ficar instável.** Com `exp` de 5 s, a cadeia é callback, troca de token, produtor, sessão, 303, NGINX, boot do bundle e `GET /v1/session`. Num runner lento, ela pode passar de 5 s. Aí o primeiro `GET` já dá 401 e o console mostra "Entre com sua conta" em vez de "A sessão expirou", sem retry. Duas saídas: subir para 20–30 s e exigir antes um 200 explícito, ou deixar o relógio do console avançar. A "relógio do IdP controlado" (§13) também precisa sair: a API checa `exp` e `auth_time` com o relógio real (`0254` §4.4).
- **O5 — Limite de taxa determinístico.** Tornar incondicional o `X-Forwarded-For` sintético por contexto (§4.11 diz "se precisar"). Com 10 starts por minuto por IP, o resultado da matriz passa a depender da velocidade do runner.
- **O6 — Onde roda a Q8.** Se a Q8 for teste vitest em `apps/**`, ela entra no `test:core`, na cobertura e no `certify`. E, pela própria regra "sem Docker, falha", ela quebra esses gates em ambiente sem Docker. Fixar a Q8 dentro do runner `test:e2e:oidc-hosts`, ou num script próprio fora do `test:core`.
- **O7 — NGINX do modelo.**
  - `--read-only` exige `--tmpfs /tmp`. A imagem `nginx-unprivileged` grava pid e temporários em `/tmp`, e o próprio `Dockerfile:4-5` recomenda o tmpfs.
  - "Em toda resposta" (§4.9) exige `add_header … always`. Sem `always`, a CSP e o `nosniff` não saem no 404 de `/v1/`.
  - A Q8 deve conferir os cabeçalhos também no 404 e o `no-store` em `/` e num caminho de SPA, que caem no `index.html`.
- **O8 — Conjunto de escrita sem `vitest.config.mts`.** A raiz define as constantes do console para os testes (`vitest.config.mts:71-78`). As três constantes novas (`__CVG_OPERATOR_LOGIN__`, `__CVG_CONSOLE_ORIGIN__`, `__CVG_API_ORIGIN__`) precisam entrar ali. Senão, os testes atuais do console falham com `ReferenceError`. Incluir o arquivo na §7, com claim, porque é compartilhado.
- **O9 — Build OIDC igual ao de produção.**
  - O perfil OIDC deve recusar build com `NODE_ENV=test`. Se o runner herdar esse valor, `__CVG_WEB_MODE__` vira `'test'` (`vite.config.mts:13-15`), e o bundle provado liga o perfil de teste controlado (`App.tsx:98-99`).
  - A lista de textos proibidos (DB3) deve usar o prefixo `__CVG_OPERATOR_BOOTSTRAP_TOKEN`. Assim ela cobre também `__CVG_OPERATOR_BOOTSTRAP_TOKEN_PROVIDER__` (`session.ts:32,75`).
- **O10 — Q10 e "histórico de navegação".** A entrada da `authorizationUrl` do IdP fica no histórico da aba, com `state`, `nonce` e `code_challenge`. É a exceção da I9. Do jeito que está, a Q10 falha se inspecionar o histórico (CDP `Page.getNavigationHistory`) ou fica vazia se não inspecionar. Declarar a exceção e o método.
- **O11 — Ramos da UI que o navegador não alcança.** Dois casos:
  - `GET /v1/session` 403 e start 400/403 levam a `configuration_error`, mas o navegador nunca lê esses status. O 403 de origem negada sai sem ACAO. A origem permitida que não é o console recebe ACAO sem ACAC. Nos dois casos, o `fetch` credenciado falha como rede (status 0) e a tela mostra "indisponível";
  - a Q6 prova esses ramos em jsdom, mas o Chromium não chega a eles.

  Registrar que uma configuração errada de origem aparece como "indisponível", ou cobrir isso na Q9.
- **O12 — Mapa de mutantes.**
  - N24 (fragmento não limpo) não é morto pela Q9b, porque o login com sucesso não tem fragmento. Usar a Q9m, com URL final `<console>/` depois de `negado`.
  - Em N19, "o cookie some" não acontece, porque o cookie é HttpOnly e o console não o apaga. O texto da tela é o que mata o mutante.
- **O13 — Coerência interna.**
  - A J10 diz que os textos sem OIDC não mudam. A §4.8 põe "Sem permissão para esta área." em todos os perfis.
  - O logout com 503 que "continua na tela" muda o atual: `App.tsx:308-318` limpa a sessão no `finally`.
  - Dizer em que perfil cada mudança vale. Não achei asserção atual que quebre.
- **O14 — Regra de parada do S0.** Qualquer uma das quatro confirmações que falhar deve parar o BUILD, não só a do operacional. Se o pendente `Lax` não chegar ao callback depois de POST, 302 e GET, o `SameSite` do pendente muda e volta ao usuário. A PR301 e a PR302 só provaram a chegada por link GET.
- **O15 — CSRF no navegador.** Na Q9h, a guarda de CSRF só é exercida com "Origin ausente", porque a irmã já cai na allowlist. Faltam dois casos:
  - uma mutação com cookie vinda da segunda origem permitida. Ela passa o hook HTTP com ACAO e sem ACAC, e deve receber 403 da guarda, com zero tasks;
  - da SPEC0150 (`0150:149-150`): dois `__Host-cvg_operator_session` crus falham fechados (Q3), e o cookie do primeiro login responde 401 depois do segundo login (Q9c).

## Respostas aos seis pontos do executor

1. **S0 e Q9 modelam a navegação entre sites?** Sim.
   - O IdP sintético responde **302** ao POST (`synthetic-oidc-issuer.ts:372,399`). Então o callback chega como GET de topo, iniciado por um documento de outro site (`localhost`).
   - A Q9c é o detector certo. Se o callback fosse aberto por `page.goto`, o `Strict` iria junto (diagnóstico da PR301).
   - O S0 cobre o que nunca foi provado: a cadeia POST, 302 e GET, e o `Strict` gravado por essa navegação e usado depois no `fetch`. Falta só a regra de parada completa (O14).
2. **ACAC só para o console e em todos os status, inclusive nos hooks?** Sim, pelo desenho.
   - A sonda no Fastify 5.12.7, na mesma ordem de `server.ts:523-617`, deu ACAO, ACAC e `private, no-store` em 200, 404 (handler de não encontrado), 429 (hook posterior) e 500 (error handler).
   - O hook de alvo (`server.ts:544`) vem antes do hook HTTP. Por isso a frase "depois do hook HTTP" da J4 está correta.
   - O novo `onSend` de cache deve ser registrado depois de `oidc-routes.ts:196` e `server.ts:833`. A Q4 pega se não for.
3. **Login CSRF com pendente legado; legado nunca autentica (N9, N10).** A regra está certa e a Q3 mata N9 e N10 em unidade. Os furos são M1 (comparação do nome) e M2 (prova de navegador vazia).
4. **A troca da D8 por 303 afrouxou algo?** Não, pelos três critérios:
   - **cookies:** mesmos efeitos, linha por linha da §4.5 contra `oidc-routes.ts:332-467`;
   - **chamadas ao token:** nenhuma a mais;
   - **logs:** inalterados, e o `deps.log` não registra o `Location`.

   O destino é fixo (`login.consoleOrigin`), sem open redirect. O `referrer-policy: no-referrer` sai no 303 (`http-security.ts:275`). Ficam só as lacunas de tabela e de teste (O2, O3).
5. **PB1 e PB3 contradizem texto aprovado?** Sim, e as duas estão declaradas:
   - **PB1:** contraria `0150:48-56` e `:105-114` na produção até a B2;
   - **PB3:** contraria `0150:99-101` no C8 e `0254:307`/`:460`.

   Não é contradição silenciosa. Mas a PB3 precisa de justificativa correta (O1), e a falta do "quando já há" é desvio não declarado de `0150:147-150` (M2).
6. **Estabilidade e vazamento.**
   - **Estabilidade:** os riscos reais estão em O4, O5 e O6. O resto (`workers: 1`, `retries: 0`, imagem por digest, portas efêmeras) está bem.
   - **Vazamento:** não achei caminho de suporte de teste para o runtime ou o bundle.
     - O estágio `build` do `Dockerfile:16` roda `build:web` sem as variáveis novas, então cai no perfil atual.
     - O suporte fica em `__tests__` ou `tests/`, fora do `build:runtime`.
     - A Q10 é a guarda.
     - O O9 fecha o único atalho, o `NODE_ENV=test` no build do bundle.

## Premissas

### PB1–PB14

| PB   | Avaliação                                                                                                                                                                                                                                                                                                                        | Quem decide                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| PB1  | A justificativa confere: `Dockerfile:16` acopla a imagem `runtime` ao `build:web`, e a produção recusa OIDC (`oidc-config.ts:284-286`). Mas a PB1 mantém a produção contra itens aprovados da SPEC0150 (1 e 6) até a B2.                                                                                                         | **Usuário**                                         |
| PB2  | Pré-autorizada pela D8 (`0254:458`). Os efeitos da A foram conferidos e estão preservados. Faltam O2 e O3.                                                                                                                                                                                                                      | Default técnico seguro                              |
| PB3  | Aceita resíduo de segurança no caminho C8 (cookie legado plantável por irmã, sem CSRF por `Origin`). A justificativa do `__Host-` está imprecisa (O1).                                                                                                                                                                         | **Usuário** (depois de corrigir o texto)            |
| PB4  | Coerente com a UP91-043. O cartão pede "navegador real", e o Chromium é um.                                                                                                                                                                                                                                                      | Default técnico                                     |
| PB5  | Consequência da PB1: a imagem `web` do candidato ainda faz proxy de `/v1/` (`deploy/nginx.web.conf:8-13`). Desvia de `0150:151-155` ("imagem NGINX do candidato"), mas está declarada.                                                                                                                                          | Default técnico (segue a PB1)                       |
| PB6  | Coordenação com o dono do CI (Codex, SPEC0260). O fallback está declarado, e a U08 só fecha com o gate.                                                                                                                                                                                                                          | Dono do CI, não o usuário                           |
| PB7  | Igual a `0150:42-44`. Site errado falha fechado.                                                                                                                                                                                                                                                                                 | Default técnico                                     |
| PB8  | Igual a `0150:99-101`. Preserva o O10 da A.                                                                                                                                                                                                                                                                                      | Default técnico                                     |
| PB9  | A PR301/PR302 com Chromium 147 mostra `*.example.test` como mesmo site (o `Strict` viajou no `fetch`), e `.test` é registro desconhecido. O S0 reconfirma.                                                                                                                                                                      | Default técnico                                     |
| PB10 | Ok. Se cair no `ignoreHTTPSErrors`, o relatório deve dizer que a confiança TLS não foi provada (a PR302 já usou esse caminho).                                                                                                                                                                                                  | Default técnico                                     |
| PB11 | É aperto: `private` é redundante com `no-store` para caches. Deve dizer que estreita a SPEC0150 para o modo OIDC (O1).                                                                                                                                                                                                         | Default técnico                                     |
| PB12 | Seguro. No modo trusted, o console só manda `content-type` (`client.ts:83-90`, `:916-920`). Start e logout são pedidos simples, sem preflight.                                                                                                                                                                                  | Default técnico seguro                              |
| PB13 | Seguro o bastante. A API prende o endpoint de autorização à origem do issuer (`oidc-login-transaction.ts:229-236`), e o console só aceita `https:` sem credenciais.                                                                                                                                                              | Default técnico                                     |
| PB14 | A recon do Codex registra que a U08 pode seguir com o resíduo (timeline de 23/10, "U08Claude podeusarresíduo"). Mesmo assim, muda a dependência declarada no cartão 0399 (`U08 → U04`).                                                                                                                                        | **Usuário** (decisão leve; ordem de merge com o Codex) |

### Premissas escondidas

- **H1.** `.test` é registro desconhecido e vira site `cvg.test`. Apoiada pela PR301/PR302 (Chromium 147). Ok.
- **H2.** O pendente `Lax` viaja em POST, 302 e GET a partir de outro site. Nunca foi provado: a PR301/PR302 usaram link GET. O S0 cobre (ver O14).
- **H3.** O `Strict` gravado por navegação de topo iniciada em outro site viaja no `fetch` depois do pouso. Nunca foi provado. O S0 cobre, e a SPEC já manda parar se falhar.
- **H4.** Os cabeçalhos postos no `onRequest` sobrevivem a 404, 429 e error handler. Confirmado pela sonda.
- **H5.** O Chromium recusa ou não envia nome com `0xA0`. Não provado; ver M1.
- **H6.** O Chromium aceita `Domain=cvg.test` da irmã para cookie sem prefixo. Não provado; ver M2.
- **H7.** O `vite build` do teste não herda `NODE_ENV=test`. Ver O9.
- **H8.** O relógio controlado do IdP convive com a API. Não convive; ver O4.
- **H9.** As constantes novas do console funcionam nos testes sem mexer em `vitest.config.mts`. Não funcionam; ver O8.
- **H10.** O IdP sintético responde 302, e não 307. Confirmado em `synthetic-oidc-issuer.ts:372,399`.

### Defaults DB1–DB9

Concordo com todos. Duas ressalvas:

- **DB3:** usar o prefixo (O9);
- **DB5:** fixar onde roda a Q8 (O6).

## O que conferi

Comandos, todos na worktree, só leitura:

- `sha256sum docs/02_spec/0259_oidc_console_distinct_hosts.md docs/04_audit/evidence/UP91-025-OIDC-B-20261023/recon.md docs/02_spec/0150_cross_origin_operator_console.md docs/02_spec/0254_oidc_login_case_principals.md`, antes e depois. A SPEC0259 deu `199886616d…6c1` nas duas vezes.
- Leitura integral de SPEC0259, recon, SPEC0150 e SPEC0254 (§0–§5, D7–D11), e da SPEC0152 nos trechos de callback e cookie.
- Código da API:
  - `apps/api/src/http-security.ts` (1-140, 180-513);
  - `oidc-routes.ts` inteiro;
  - `operator-session.ts` e `operator-session-hook.ts` inteiros;
  - `oidc-login-transaction.ts` inteiro;
  - `oidc-config.ts:270-402`;
  - `production-bootstrap.ts:180-288`;
  - `server.ts:490-700` e `:825-1060`;
  - `operator-session-route-boundary.ts`;
  - `case-authorization/case-routes.ts` (cache).
- Console: `apps/web/src/api/client.ts` (55-130, 690-960), `auth/session.ts`, `App.tsx` (1-420 e 1000-1100), `vite.config.mts`, `vitest.config.mts`.
- Testes atuais que fixam textos e CORS: `tests/e2e/rem21-014-qualification.spec.ts`, `tests/e2e/ux-accessibility.spec.ts`, `apps/web/src/__tests__/app.test.tsx`, `apps/api/src/http-security.test.ts:225-304`, `tests/e2e/http-security.spec.ts:20-45`, e os testes `oidc-*` da A (uso de `API_REQUIRE_HTTPS`).
- Deploy: `Dockerfile` (1-51), `deploy/nginx.web.conf`, `deploy/harness/README.md:405-413`.
- Provas históricas: `PR302-HTTPS-BROWSER-20260928/probe.mjs` e `result.json`, `PR301-CROSS-ORIGIN-PROBE-20260927/proof.json`.
- IdP sintético: `synthetic-oidc-issuer.ts:340-400` (status do redirect).
- Cartões U08 e U04 no backlog 0399, no checkout compartilhado, só leitura.
- Timeline do Gbrain (`projects/cvg-operational-harness`, desde 22/10), lida por resumo antes de começar.

Sondas, com `env -i HOME=$HOME PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin`. O `node_modules` veio de `/mnt/dados/cvg-work/cvg-d9ef-first-release-20261023` por symlink no scratchpad, sem cópia.

- `probe-fastify-hooks.cjs`: Fastify 5.12.7, cabeçalhos do primeiro `onRequest` em 200, 404, 429 e 500, mais `onSend` de cache. Resultado: ACAO, ACAC e `private, no-store` nos quatro.
- `probe-cookie-name-trim.cjs`: socket cru com byte `0xA0` antes de `__Host-`. Resultado: a leitura no formato da A aceitou; a comparação exata recusou.
- `probe-apiurl.cjs`: normalização do `new URL` para o `apiUrl` da §4.7. Resultado: `%2e%2e`, `.\t.`, `\` e `//` saem de `/v1/` ou trocam a origem, e a checagem depois de normalizar pega todos. `https://console.cvg.test:443`, host em maiúsculas e barra final não passam em `new URL(v).origin === v`. Sem defeito.

As sondas estão em `/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/u08-critic/`, fora do repositório.

## Não feito

- Navegador real, Docker, PG, porta de serviço, `npm install`, testes do repositório, commit, push e lockfile.
- O ambiente CLOSE-CI-LOCAL (3483, 4483, 56383) não foi tocado.
- Não alterei a SPEC, o recon, o cartão nem o quadro de coordenação.
