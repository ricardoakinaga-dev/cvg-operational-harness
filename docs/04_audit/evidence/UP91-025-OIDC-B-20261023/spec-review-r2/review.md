# Crítica independente da SPEC0259 r2 — U08 / UP91-025 fatia B1

- **SPEC:** `docs/02_spec/0259_oidc_console_distinct_hosts.md`, r2, sha256 `5cb1bfb231b4cd32ff8e4bed0dfdeee0e7d10b9e3f11a393138245c9a018a10a`. Conferido antes e depois.
- **Correções:** `spec-review-r1/corrections.md`, sha256 `199f46a0d791eda3170cd12bc4a719f4102dafbed0d215389753845ed759e6a6`.
- **Base:** worktree `/mnt/dados/cvg-work/cvg-d9ef-u08-oidc-b-20261023`, `main` `9a56a9c94`. Código só lido.
- **Crítico:** Claude Code, o mesmo da r1. Não escrevi a SPEC nem as correções.
- **Data:** 23/10/2026.
- **Limites:** sem commit, push, PG, contêiner, porta, navegador real ou lockfile. As sondas usam Node 22 e dados sintéticos, só no scratchpad.

## Veredito: `REVISE`

A r2 fecha o M1 por completo e fecha o M2 na parte i1. O delta é bom: a regra do nome está precisa, as duas leituras de cookie do runtime estão cobertas, e a separação de quem decide está certa.

Há **um obrigatório novo**. Ele está na i2 (e na i3, que repete a i2): o mecanismo de captura escrito na SPEC não funciona no Playwright. Com isso, a prova de login CSRF volta a poder passar vazia, que era o problema do M2.

## Obrigatório

### M1 (r2) — Na i2 e na i3, a captura por `page.route` não pega o callback depois do 302; o state e o code do atacante são gastos, e a prova não mata o N10

- **Defeito.** A i2 diz: "captura do code e do state no `Location` do 302 do IdP. O pedido ao callback é abortado por `page.route`". O Playwright não chama o handler de rota nos saltos de redirect: o pedido ao callback que nasce do 302 segue sem passar pelo handler. Então acontece o seguinte:
  - o callback do atacante roda no contexto dele;
  - o state é consumido e o code é usado no IdP;
  - quando a irmã leva a vítima ao callback com esse code e esse state, a implementação correta recusa ("negado", `GET /v1/session` 401, zero chamadas ao token);
  - o mutante N10, que lê o pendente legado, também recusa. Ele decifra o pendente, mas o `consume` do state devolve `false`, e a recusa vem antes de chamar o token.

  Os controles positivos da r2 (pendente legado em `context.cookies()` e nome no log da borda) passam nos dois casos, porque não conferem se o material do atacante ainda vale. A i3 repete a i2 e herda o furo. O N10 continua morto pela Q3 em unidade, mas o lado do navegador do aceite 11 ("login CSRF recusado com controle positivo") fica vazio de novo.
- **Evidência.**
  - SPEC0259 r2 `:405` (texto da i2), `:411` (i3 repete i2) e `:435` (N10 apontado para a Q9i2).
  - Playwright 1.59.1, o do `package.json`:
    - `playwright-core/types/types.d.ts:4039`: "The handler will only be called for the first url if the response is a redirect";
    - `playwright-core/lib/server/chromium/crNetworkManager.js:297-303`: com `redirectedFrom`, o pedido recebe `Fetch.continueRequest` direto, sem criar rota.
  - O IdP sintético responde 302 ao POST (`synthetic-oidc-issuer.ts:399`), então o callback é um salto de redirect.
  - Na fatia A, pendente ausente ou inválido recusa **antes** de consumir o state (`oidc-login-transaction.ts:138-146` contra `:195-201`). Já o state gasto recusa no `consume`, também antes do token (`oidc-routes.ts:371-384`, passo 3).
- **Correção mínima.**
  1. Capturar sem seguir o redirect. Uma forma é rotear o **POST ao `/authorize` do IdP** (a primeira URL), chamar `route.fetch({ maxRedirects: 0 })`, ler o `Location` do 302 e responder com `route.fulfill`, com uma página neutra, sem abrir o callback. A outra é fazer o fluxo do atacante por HTTP cru no processo de teste.
  2. Controle de que o material está vivo, depois do "negado" da vítima: o mesmo code e o mesmo state, no contexto do atacante e com o `__Host-cvg_oidc_pending` dele, completam o login. Isso prova que o material valia e que a recusa da vítima não consumiu o state. Com o N10, a vítima consome o state, e esse controle falha.
  3. Tudo isso dentro dos 60 s de vida do code (`synthetic-oidc-issuer.ts`, `expiresAt: now + 60_000`). O auxiliar de ritmo não pode esperar entre a captura e o controle. Reservar as vagas antes da captura.
  4. Aplicar o mesmo na i3.

## Opcionais

- **O1 — O ritmo controlado ainda não é determinístico (divergência a).**
  - **Mecanismo.** O limitador real abre a janela na primeira requisição que chega depois de expirar. A janela vai de `s` até `s + 60 s`, nos dois limitadores: `InMemoryRateLimiter` em `rate-limit.ts` e o SQL do `PostgresRateLimiter`. Já o auxiliar conta "9 em qualquer janela de 60 s" pelo **tempo de soltura**, e solta no limite exato quando espera. O atraso de ponta a ponta varia de pedido para pedido. Por isso, um 10º e um 11º start soltos logo depois de `r1 + 60 s` podem cair na mesma janela do servidor.
  - **Sonda** `probe-pacer-window.mts`, com o limitador real e o mesmo ritmo, em 2.000 execuções de 40 starts:
    - atraso até 300 ms: 3 execuções com 429;
    - atraso até 2 s: 117 execuções com 429;
    - com janela de 70 s no auxiliar: 0 execuções com 429, tanto para 2 s quanto para 5 s de atraso.
  - **Correção.** Janela do auxiliar igual a 60 s mais duas vezes o atraso máximo (por exemplo, 70 s). O teste falha logo se um start ou callback passar desse atraso (por exemplo, 5 s). A ideia da divergência (ritmo em vez de `X-Forwarded-For` por contexto) é aceitável; o motivo dado também é real, porque cabeçalho extra por contexto dispararia preflight credenciado e cairia na PB12.
- **O2 — Q9m pode passar pelo motivo errado.** Um 429 no callback também leva a `#cvg-login=indisponivel`. Então o caso "token endpoint 500 → Login indisponível" passa sem chegar ao token. Exigir que o contador de token do IdP suba 1 nesse caso.
- **O3 — PB14: texto desatualizado e incompleto (corrigir antes de levar ao usuário).**
  - **Versão desatualizada.** A PB14 cita a SPEC0262 com sha256 `db0a72b9…da5ce`, em `DRAFT_HOW_INCOMPLETE`, e diz "tem HOWs abertos". No checkout compartilhado, a SPEC0262 já é R3, em `PROPOSED_FOR_TECHNICAL_REVIEW`. O hash mudou durante a revisão: `99dd25ea…bacb` às 13:10Z e `df6413f2…34ec` às 13:20Z.
  - **Citação.** A frase citada da §7 mudou para: "Shared server.ts/operator-session-hook.ts/callers com0259 são integrados um delta porvez/rebase e novo teste conjunto; não editar aSPECdoClaude. U04 não édispensada porB1 e nenhummock do console certifica autoridade real." O sentido é o mesmo. Citar o caminho e a versão vigente no momento da pergunta.
  - **Faltam três acoplamentos da R3:**
    - migração do schema Auth (`operator-session/0002_principal_revision.sql`, funções v2) com corte em que os cookies legados exigem novo login;
    - releitura do principal antes do `Set-Cookie` no callback, que é o caminho que a B1 remapeia na §4.5;
    - guarda por requisição com 401 que apaga o cookie e 503 que o mantém.
  - **Falta dizer, no risco,** que não há exposição: o modo OIDC só roda em `NODE_ENV=test` (J9). O custo de construir antes é retrabalho e uma nova Q9.
  - O risco em uma frase está correto. Ele bate com as entradas do Codex: corrida grant → escrita reproduzida, e 51 das 71 rotas protegidas por role sem consultar o principal atual.
- **O4 — Regras de rebase para não depender de cuidado manual.** Três regras deixam o rebase com a U04 seguro, nas duas ordens:
  - **Saída padrão na §4.5.** Uma falha nova do callback que não esteja na tabela vira 303 `#cvg-login=indisponivel` se for da classe 5xx, ou `negado` se for da classe 4xx. O pendente segue a I8.
  - **Uma só função de nome e limpeza do cookie,** com o perfil obrigatório na assinatura e sem valor padrão. Assim, um caminho novo da U04 que apague o cookie com o nome legado não compila.
  - **Teste de ordem dos hooks.** O hook HTTP é o primeiro `onRequest` depois do hook de alvo, para que 401 e 503 novos levem ACAC.

  Sem essas regras, o pior caso é regressão de comportamento, não de segurança: JSON no callback, laço de 401 sem limpar o cookie, ou "indisponível" no lugar de "expirada".
- **O5 — N28 não é observável no navegador como está.**
  - O `fetch` da `reports` não consegue ler o 403, porque a resposta não tem ACAC. A borda registra **só** nomes de cookie.
  - Com o mutante N28, o corpo `text/plain` vira texto e cai em `CreateInternalTaskSchema.parse` (`server.ts:1827`), que dá 400. Também não cria task, então "cria task" não é o sintoma.
  - O N28 já é morto pelo teste O8 da A (`oidc-login-guards.test.ts:266-290`, `allowedOrigins: [CONSOLE, SIBLING]`, 403 vindo do hook de CSRF). Apontar o N28 para esse teste, corrigir a descrição e fazer a borda registrar o status, sem valores.
- **O6 — Q10, "única entrada com state".** Na Q9m, um TOTP errado devolve a página do IdP no POST para a mesma URL com `state`, e isso cria outra entrada de histórico. Restringir a regra assim: só entradas do host do IdP têm `state`, `nonce` e `code_challenge`.
- **O7 — Controle da checagem 8 do S0.** Pôr um cookie de controle sem prefixo na mesma resposta da irmã, como na i1. Observar `context.cookies()` e o log em hex da borda. Isso prova que a resposta foi processada e que a recusa vem da regra do nome vazio com `__Host-`.
- **O8 — J8 e o logout (divergência b).** A J8 diz que um 5xx nunca "vira logout". O logout com 503 mantém o comportamento atual: sai da tela, com a mensagem de falha. Escrever na J8 a exceção da ação explícita de logout, para o texto ficar coerente.

## Os cinco pontos do coordenador

1. **M1 — fechado.**
   - A §4.3 (`:144-154`) define corte no primeiro `=`, segmento sem `=` ignorado, só SP e HTAB aparados, e igualdade exata de code units, que em latin1 é byte a byte.
   - Vale para os dois parsers e em todos os modos. Pela busca, são as **únicas** leituras de cookie do runtime: `operator-session.ts:95` e `oidc-login-transaction.ts:277`. Os demais pontos chamam essas duas funções.
   - Na Q3 (`:373`), os negativos incluem U+00A0 por socket cru e a troca de caixa. N27 em `:452`. S0 8 e 9 em `:356-357`. Aceite 4.
   - Reexecutei a sonda do executor (`probe-cookie-name-compare.cjs`): a saída é idêntica à registrada. As cópias das minhas sondas têm os mesmos sha256 dos originais.
2. **M2 — fechado na i1 e no desenho da i3. A i2 e a i3 reabrem pelo M1 (r2).**
   - A i1 tem controle na mesma resposta, com presença em `context.cookies()` e no log da borda.
   - A i3 cobre a SPEC0150 `:147-150`, e o N9 é morto pela duplicata.
   - Falta o material do atacante estar vivo (M1 r2).
3. **Divergências do executor.**
   - **(a) Ritmo em vez de XFF por contexto:** aceitável na ideia, mas não determinístico como escrito (O1).
   - **(b) Logout com o comportamento atual:** aceita. É o comportamento testado hoje, e a mensagem diz a verdade. Ajustar o texto da J8 (O8).
   - **(c) Regra exata em todos os modos:** aceita. É aperto invisível para nomes ASCII.
     - Os testes atuais não quebram: a lista de "malformado" em `oidc-login-routes.test.ts:522-528`, a lista da guarda em `oidc-login-guards.test.ts:309-316` e a duplicata em `operator-session.test.ts:298-304`.
     - Muda uma coisa: o segmento sem `=` deixa de derrubar a leitura e passa a ser ignorado. Para o navegador, é um cookie sem nome. A mudança tira um DoS (irmã plantando `=cvg_operator_session` no perfil legado) e não afrouxa nada, porque a guarda de CSRF continua vendo esse nome.
   - **(d) Cookie sem nome para o BUILD:** aceita. O servidor não distingue esse cookie de um `__Host-` legítimo, então parar é o certo. Falta só o controle do O7.
4. **PB14.**
   - O risco em uma frase está correto. A pergunta está bem posta, com condição de fecho e efeito do "não". A citação da SPEC0262 está desatualizada e faltam acoplamentos (O3).
   - **Dá para desfazer?** Sim. A B1 é um PR. O OIDC só roda em teste. A mudança que chega à produção é aperto: nome exato e texto de 403. Não há migração.
   - **Dá para rebasear sem afrouxar?** Sim, em segurança: a B1 não dá autoridade e a U04 só acrescenta checagens. Os riscos são de comportamento, cobertos pelo O4.
5. **Regressões e premissas novas da r2.**
   - **Premissa escondida e falsa:** o `page.route` intercepta o callback depois do redirect (M1 r2).
   - **"Ritmo deixa determinístico":** parcialmente falsa (O1).
   - **"A borda observa o 403 da guarda":** não observa (O5).
   - Mais dois detalhes de prova: O2 e O6.
   - Nenhuma regressão de segurança no delta.

## Premissas

| PB          | Quem decide            | Nota                                                                                                                          |
| ----------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| PB1         | **Usuário**            | Texto correto. Até a B2, a produção fica contra os itens 1 e 6 da SPEC0150.                                                   |
| PB3         | **Usuário**            | Justificativa corrigida (O1 da r1 atendido). Resíduo do C8 declarado.                                                         |
| PB14        | **Usuário**            | Pergunta e risco corretos. Atualizar a citação e os acoplamentos da SPEC0262 antes de perguntar (O3).                         |
| PB6         | Dono do CI (Codex)     | Depois do PR #27, sem tocar o reuso da SPEC0261.                                                                               |
| PB2, PB4, PB5, PB7–PB13 | Default técnico | Conferidos na r1. A r2 só precisou ajustes (PB10 e PB11). Sem objeção.                                                        |

**Premissas escondidas novas:**

- **H11.** O `page.route` intercepta salto de redirect. **Falsa** (M1 r2).
- **H12.** "No máximo 9 por 60 s pelo tempo de soltura" evita 429 no limitador de janela ancorada. **Falsa** sob latência variável (O1).
- **H13.** A borda vê o status da guarda. **Não vê** como está (O5).
- **H14.** O hash da SPEC0262 citado na PB14 é estável. **Não é**: a SPEC0262 mudou duas vezes durante esta revisão (O3).

## O que conferi

- `sha256sum` da SPEC0259 antes e depois: `5cb1bfb2…a10a` nas duas vezes. Também `corrections.md`, `spec-r2.json` e as sondas em `spec-review-r1/probes/`.
- Leitura integral da SPEC0259 r2 e de `corrections.md`.
- Timeline do Gbrain desde 23/10, por resumo: entradas do Codex de 12:41 (U04 → U08), 12:57 (rascunho 0262) e 13:11 (SPEC0262 r2), e do executor às 13:15.
- `grep -rn "headers.cookie|.split(';')"` no runtime: só `operator-session.ts:95` e `oidc-login-transaction.ts:277` leem cookie, e os demais chamam esses dois.
- Testes da A que poderiam quebrar com a regra exata: `operator-session.test.ts:298-304`, `oidc-login-guards.test.ts:240-330` e `oidc-login-routes.test.ts:511-540`.
- Playwright 1.59.1 no `node_modules` de `/mnt/dados/cvg-work/cvg-d9ef-first-release-20261023`:
  - `types.d.ts:4039` (sha256 `8324f386…af41`);
  - `crNetworkManager.js:286-312` (sha256 `c2c674c2…68b2`).
- `rate-limit.ts` (`InMemoryRateLimiter` e o SQL do `PostgresRateLimiter`), `oidc-login-transaction.ts:138-201`, `oidc-routes.ts:332-384`, `synthetic-oidc-issuer.ts:340-400` e `server.ts:1818-1830`.
- SPEC0262 no checkout compartilhado, só leitura: cabeçalho, §3, §6.2 e §7. O hash mudou durante a revisão.

Sondas, com `env -i HOME=$HOME PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin`, no scratchpad `/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/u08-critic/`:

- `r2-copy-compare.cjs`: cópia da sonda do executor. Saída idêntica a `probe-cookie-name-compare.out.txt`.
- `probe-cookie-name-trim.cjs`: reexecutada, mesmo resultado da r1.
- `probe-pacer-window.mts` (sha256 `ccc91ded…75eb`, saída `e9f3aa37…a8bd`), rodada com `node --experimental-transform-types` e importando o `rate-limit.ts` real da worktree. Sem rede e sem porta.

## Não feito

- Navegador real, Docker, PG, porta, install, testes do repositório, commit, push e lockfile.
- O ambiente CLOSE-CI-LOCAL não foi tocado.
- Não alterei a SPEC0259, a SPEC0262, as correções, o cartão nem a coordenação.
