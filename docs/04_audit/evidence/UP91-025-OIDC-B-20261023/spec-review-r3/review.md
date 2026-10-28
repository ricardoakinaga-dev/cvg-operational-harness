# Crítica independente da SPEC0259 r3 — U08 / UP91-025 fatia B1

- **SPEC:** `docs/02_spec/0259_oidc_console_distinct_hosts.md`, r3, sha256 `ad0282a096d9f9ed21c9294ddbe4f51d913823022c31411cc5ea642b55b4778a`. Conferido antes e depois.
- **Correções:** `spec-review-r2/corrections.md`, sha256 `46d79470f88aff06835fdcc883cd814722171a64a4e30f1ed4f6631af0823f2e`. `spec-r3.json`, sha256 `38983c75…87ba6`.
- **Escopo:** só o delta r2 → r3. É a terceira rodada e a segunda de retrabalho.
- **Base:** worktree `/mnt/dados/cvg-work/cvg-d9ef-u08-oidc-b-20261023`, `main` `9a56a9c94`. Código só lido.
- **Crítico:** Claude Code, o mesmo da r1 e da r2. Não escrevi a SPEC nem as correções.
- **Data:** 23/10/2026.
- **Limites:** sem navegador real, Docker, PG, porta, commit, push ou lockfile. As sondas usam Node 22 e ficam no scratchpad, sem rede e sem porta.

## Veredito: `APPROVE`

O M1 da r2 está fechado. Não há obrigatório novo. Os opcionais abaixo são de precisão; nenhum leva a falha de segurança, prova falsa, contradição ou BUILD impossível.

## Os quatro pontos do coordenador

### 1. M1 (r2): captura no POST ao `/authorize` e controle de material vivo — fechado

- **O mecanismo funciona no Playwright 1.59.1.** Conferi pelo código, sem navegador:
  - `client/network.js:255-258`: `route.fetch(options)` chama `_innerFetch` com o pedido interceptado.
  - `client/fetch.js:135-194`: usa o método e os cabeçalhos do pedido. Sem `postData` explícito, usa `request.postDataBuffer()`, então o POST do formulário vai igual ao IdP.
  - `server/fetch.js:122-123`: `maxRedirects: 0` vira `-1`.
  - `server/fetch.js:282`: com `-1`, o redirect não é seguido, e o 302 volta com o `Location`.
  - O `page.route` no POST funciona porque o POST é a **primeira** URL da cadeia. A nota da `types.d.ts:4039` só exclui os saltos de redirect.
  - Com `route.fulfill`, o navegador nunca pede o callback. O state continua reservado e o code continua sem uso no IdP (`synthetic-oidc-issuer.ts:394-395`, `expiresAt: now + 60_000`, `used: false`).
- **A recusa correta não consome o material.** Na i2, a vítima só tem o pendente legado. No perfil HTTPS, o pendente legado é tratado como ausente, e `readOidcLoginCallback` recusa antes do `consume` (`oidc-login-transaction.ts:138-146`). Por isso o controle no contexto do atacante completa o login. Na i3, a vítima tem o próprio `__Host-` pendente. O state não bate e a recusa também vem antes do `consume` (`:178-183`). Então o controle da i3 também completa.
- **O N10 morre.** Com o mutante, a vítima lê o pendente legado, consome o state e troca o code. A i2 falha de dois jeitos:
  - o desfecho já falha (a vítima entra na conta do atacante e há chamada ao token);
  - o controle de material vivo falha (state gasto).

  A i3 faz uma captura nova e repete o controle. O controle separa a recusa certa do material vencido, que era o furo da r2.
- **Os tempos fecham.** O code vale 60 s, e o limite de 50 s entre a captura e o controle está dentro. O state e o pendente valem 5 min. As vagas reservadas antes da captura evitam espera do auxiliar no meio.
- **Detalhe que o BUILD precisa resolver (O1).** O `route.fetch` sai do processo Node do Playwright, não do Chromium. A confiança TLS dele vem de `ignoreHTTPSErrors` (`server/fetch.js:132-133`) ou da CA do processo, e não da flag SPKI do navegador. Se o BUILD seguir a §4.11 ao pé da letra (`NODE_EXTRA_CA_CERTS` só no filho), a captura falha com erro TLS. A prova fica vermelha, não falsa.

### 2. O1: ritmo com 70 s, limite de 5 s e vagas reservadas — determinístico

- **Prova analítica.** A janela de um limitador real abre no tempo de servidor `a` do primeiro pedido depois de expirar e vai até `a + 60 s`. É assim no `InMemoryRateLimiter` e no SQL do `PostgresRateLimiter`.
  - Um pedido contado nessa janela tem `a ≤ s_i < a + 60`. Com atraso `0 ≤ s_i − r_i ≤ D`, a soltura cai em `[a − D, a + 60)`, que mede `60 + D`.
  - Com `D = 5 s`, são 65 s, menos que os 70 s do auxiliar. Então a janela tem no máximo 9 starts (o limite é 10) e 25 callbacks (o limite é 30).
  - Isso vale para qualquer padrão de soltura que respeite o auxiliar e para qualquer atraso dentro de `D`.
- **Sonda nova** `probe-pacer-r3.mts`, com o `rate-limit.ts` real, em grupos reservados de 3 e atrasos aleatórios ou adversos até 5 s:
  - starts com 9/70 s: 0 de 3.000 execuções com 429;
  - callbacks com 25/70 s: 0 de 3.000;
  - starts com 9/70 s e 120 demandas: 0 de 3.000;
  - controle de sanidade com os parâmetros da r2 (9/60 s, até 2 s): 522 de 3.000. A sonda detecta o problema quando ele existe.
- **Condições escondidas, já atendidas no texto:**
  - o auxiliar conta todo start e callback que chega ao limitador (§4.11 diz "solta no máximo");
  - o relógio da API, do PG e do teste é o mesmo host.

### 3. O3: PB14 com a SPEC0262 R4 — correta e completa

- **Estado atual.** Às 13:38:03 UTC, a SPEC0262 no checkout compartilhado é R4, em `PROPOSED_FOR_TECHNICAL_REVIEW`, sha256 `65a0863e9974c97bf10551a0582433e6cac05e1d4a0c27ef8fa49a0372bfedeb`, com mtime 13:25:55 UTC. Bate com a citação da PB14, lida às 13:29:44 UTC.
- **Citação da §7.** É literal (`0262:404-409`).
- **Os três acoplamentos conferem com a R4:**
  - §6.2: migração `0002_principal_revision.sql`, funções v2 e corte com novo login;
  - §6.2: releitura do principal antes do `Set-Cookie`;
  - §5: guarda `preHandler` em modo trusted. O 401 que apaga o cookie e o 503 que o mantém estão na §3.
- **A R4 exclui start e callback da guarda** ("Bootstrap OIDC", §5). O callback, portanto, não ganha 401/503 de hook. O único caminho novo de falha no callback é a releitura, que cai na saída padrão da §4.5.
- **O resto também confere:** a frase de risco, "sem exposição" (J9), a reversibilidade e a condição de fecho. O "não" descreve bem o estado da U04 (revisão técnica pendente, sem revisão humana).
- **O aviso de que o hash pode mudar está certo.** A pergunta ao usuário deve citar o hash vigente no momento em que for feita.

### 4. O2, O4–O8 e divergências — sem regressão

- **O2:** a Q9m conta a chamada ao token.
- **O4:** três regras de rebase.
  - Ordem dos hooks na §4.2 e na Q2.
  - Função única com perfil obrigatório na §4.3.
  - Saída padrão na §4.5.
- **O5:** o N28 aponta para `oidc-login-guards.test.ts:266-290`, e a borda registra o status.
- **O6:** a Q10 restringe `state` ao host do IdP.
- **O7:** a checagem 8 do S0 tem controle na mesma resposta.
- **O8:** a J8 tem a exceção do logout.
- **Divergência 1 (R4 em vez de R3):** correta. A R3 já não existia na hora da leitura.
- **Divergência 2 (status na borda):** aceita. Só status e nomes de cookie em hex, sem valores, então não abre vazamento. A Q10 continua conferindo o log da borda.
- **Nenhum contrato, aceite ou corte novo.** O aceite 11 só ganhou "e do material do atacante".

## Obrigatórios

Nenhum.

## Opcionais

- **O1 — Confiança TLS da captura.** Dizer na §4.11 ou na i2 como o `route.fetch` confia no IdP. Uma opção é o contexto do **atacante** com `ignoreHTTPSErrors: true`, que só afeta esse contexto; a outra é a alternativa por HTTP cru com `ca` da CA efêmera no pedido. Nunca `NODE_EXTRA_CA_CERTS` global. Sem isso, a captura falha por TLS: a prova fica vermelha, não falsa.
- **O2 — Onde medir os 5 s.** A conta só precisa do atraso entre a soltura e a checagem do limitador, que no callback acontece no passo 1. Medir até a resposta inclui troca de token e PG, e pode reprovar sem motivo num runner lento. Medir até a borda encaminhar à API, ou subir `D` (com `W = 60 + D`, por exemplo 75 s para 15 s), reduz falha falsa sem perder a garantia.
- **O3 — Sintoma do N28 na Q9h.** O "400 em vez de 403" só aparece se a role logada tiver `task:update`. Senão, `requireIdentity` dá 403 antes do parse (`server.ts:1821-1827`). Fixar a role na Q9h, ou dizer que o N28 é morto só pelo teste da A.
- **O4 — Texto da regra de ordem.** A §4.2 diz que "a guarda por requisição da U04" entra como `onRequest` depois do hook HTTP, mas na R4 ela é `preHandler` (§5). Como todo `preHandler` roda depois dos `onRequest`, isso não muda nada; é só o texto.
- **O5 — Saída padrão e error handler.** A regra da §4.5 cobre "falha nova do handler". Uma exceção inesperada no callback vai ao error handler global e sai como 500 JSON no host da API. É comportamento, não segurança. Se quiser fechar, mapear também o error handler da rota do callback para `#cvg-login=indisponivel`.
- **O6 — J8 e logout por rede.** "A API mantém a sessão" vale para o 5xx. Numa falha de rede, a API pode ter revogado e a resposta se perdeu. Basta escrever "pode manter".

## Premissas e quem decide

- **Usuário:** PB1, PB3 e PB14. Na PB14, citar o hash vigente da SPEC0262 na hora da pergunta.
- **Dono do CI (Codex):** PB6.
- **Defaults técnicos sem objeção:** PB2, PB4, PB5 e PB7–PB13.
- **Premissas escondidas novas da r3:**
  - **H15:** o `route.fetch` herda a confiança TLS do Chromium. **Não herda** (O1).
  - **H16:** o tempo até a resposta é a latência que importa para o limitador. **Conservador demais** (O2).

## O que conferi

- `sha256sum` da SPEC0259 antes e depois: `ad0282a0…778a` nas duas vezes. Também `corrections.md`, `spec-r3.json` e as sondas em `spec-review-r2/probes/`, idênticas às minhas: `ccc91ded…75eb` e `e9f3aa37…a8bd`.
- Timeline do Gbrain de 23/10: r3 do executor às 13:34 UTC e SPEC0262 R4 às 13:27 UTC.
- Leitura da r3 nos pontos do delta:
  - histórico e J8;
  - §4.2 (ordem dos hooks);
  - §4.3 (função única);
  - §4.5 (saída padrão);
  - §4.11 (borda e ritmo);
  - S0 checagem 8;
  - Q2, Q9h, Q9i (i1, i2, i3), Q9m e Q10;
  - N10 e N28;
  - aceites 11, 18 e 19;
  - riscos, PB14 e DB10.
- Playwright 1.59.1 em `/mnt/dados/cvg-work/cvg-d9ef-first-release-20261023/node_modules/playwright-core`:
  - `lib/client/network.js:255-258` (sha256 `f4af0d2b…53f04`);
  - `lib/client/fetch.js:128-215` (`40d62064…5b2`);
  - `lib/server/fetch.js:115-140` e `:278-300` (`4763a8d6…3f04`);
  - `types/types.d.ts:4039`.
- API: `oidc-login-transaction.ts:138-201`, `synthetic-oidc-issuer.ts:390-399` e `server.ts:1818-1845`.
- SPEC0262 no checkout compartilhado, só leitura, às 13:38:03 UTC: cabeçalho, §5 (`:208-254`), §6.2 e §7 (`:400-409`).
- Sonda `probe-pacer-r3.mts` (sha256 `1ada9069…28c7`; saída `probe-pacer-r3.out.txt`, `914ea015…31ca1`), com `node --experimental-transform-types` e o `rate-limit.ts` real. Fica em `/mnt/dados/tmp/ricardo/claude-1000/-home-ricardo--rea-de-trabalho-cvg-operational-harness/d9ef2deb-79ba-4d9f-9adb-2a72f0539942/scratchpad/u08-critic/`.

## Não feito

- Navegador real, Docker, PG, porta, install, testes do repositório, commit, push e lockfile.
- O ambiente CLOSE-CI-LOCAL não foi tocado.
- Não alterei a SPEC0259, a SPEC0262, as correções, o cartão nem a coordenação.
