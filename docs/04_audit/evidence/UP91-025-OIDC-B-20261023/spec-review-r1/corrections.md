# Correções da SPEC0259 r1 → r2

- **Task:** `UP91-025-OIDC-B-20261023` (U08). Executor: Claude Code (CONT-20261018-D9EF).
- **Revisão de origem:** [review.md](review.md) (sha256 `8f19551d4ccb6a85dfe05b7e52853be73e465eab304e88cb23baf2a8eb669cb7`) e [review.json](review.json) (sha256 `76cf2dbdd4a2268d59ff781e6a8a18509a4fd2bb0d175e88a7e7733637efa74e`). Veredito `REVISE`, 2 obrigatórios, 15 opcionais.
- **SPEC:** r1 `199886616da9904154096c318e1666e5bd99f65861a777aba5849720444e96c1` → r2 (sha256 em [spec-r2.json](../spec-r2.json)).
- **Base:** `main` `9a56a9c94`. Só documentos; sem código, commit, PG, contêiner ou porta.
- **Gbrain:** timeline consultada antes da r2. Entradas usadas: 12:41 (Codex, U04 → U08 não dispensada), 12:44 (PR #27, SPEC0260), 12:39 (SPEC0261), 12:57 (rascunho 0262 da U04), 13:03 (crítica r1) e 13:05 (plano de merges).

## Sondas citadas (copiadas para [probes/](probes/))

| Arquivo | Origem | sha256 | Resultado |
| --- | --- | --- | --- |
| `probe-cookie-name-trim.cjs` | crítico r1 | `7bd63a0c82b96d176e69f19b2c6f3772e987fca7facf1cbad035f6d9c3077111` | socket cru com byte `0xA0` antes de `__Host-`: o formato da A leu o pendente e o operacional do atacante; a comparação que apara só SP e HTAB devolveu `null` (resultado registrado pelo crítico; não reexecutei porque abre porta) |
| `probe-fastify-hooks.cjs` | crítico r1 | `12a221027073c64aafe0dbe7c8013b3e9e1f8a37c0985d1c25275250476719e6` | Fastify 5.12.7: ACAO, ACAC e `private, no-store` em 200, 404, 429 e 500 (resultado do crítico) |
| `probe-apiurl.cjs` + `probe-apiurl.out.txt` | crítico r1; saída reexecutada na r2, sem rede | `f2f1b830…a50` / `54d146f4…7dc2` | `/v1/../x`, `%2e%2e`, `.\t.`, `\`, `//` e URL absoluta saem de `/v1/` ou trocam a origem; `/v1/\nx` continua em `/v1/` (o parser remove o LF), daí a recusa de caractere de controle antes do parse na §4.7 |
| `probe-cookie-name-compare.cjs` + `.out.txt` | executor r2, sem rede nem porta | `915dff6c…1ccd` / `5303003c…25aa` | `trim()` aceita o nome precedido de U+00A0, U+FEFF, U+2003, U+3000, U+000B, U+000C e U+2028; a regra SP/HTAB recusa todos; SP e HTAB passam nas duas; `__HOST-` e `__host-` não passam em nenhuma |

## Obrigatórios

| ID | Correção na r2 | Onde |
| --- | --- | --- |
| M1 | Regra escrita: corte no primeiro `=`, segmento sem `=` ignorado, só SP e HTAB aparados nas pontas do nome e do valor, comparação exata de code units (byte a byte em latin1), sem `trim()`, sem normalização, sem troca de caixa. Vale para os dois parsers de autenticação (`operator-session.ts:92-111`, `oidc-login-transaction.ts:274-285`), em todos os perfis e modos. A guarda de CSRF mantém o corte largo da A. Negativos na Q3 com U+00A0 (também por socket cru), U+FEFF, U+200B, U+2003, U+3000, U+0085, U+000B, U+000C, U+2028, `__HOST-` e `__host-`; controles com SP e HTAB. Mutante N27. Registro no S0 (checagem 9) do que o Chromium faz com `\xA0__Host-…`. Cookie sem nome com valor `__Host-…` na checagem 8 do S0. Aceite 4. | §4.3 "Comparação do nome" e "Cookie sem nome"; §5; §8 S0 8–9; Q3; N27; aceite 4; §4.12 |
| M2 | Q9i reescrita em três partes, cada uma com controle positivo antes do desfecho negativo: i1 com `cvg_probe_control=1; Domain=cvg.test` (presença em `context.cookies()` e nome no log da borda numa requisição à API); i2 com o pendente legado do atacante presente em `context.cookies()` e visto pela borda no pedido do callback antes do "negado"; i3 com a vítima já autenticada e pendente vivo (SPEC0150 `:147-150`), incluindo o legado de uma sessão real do atacante, valores `__Host-` inalterados, identidade da vítima mantida e login seguinte com a identidade da vítima. A borda passa a registrar nomes de cookie por requisição (em hex, sem valores). S0 checagem 6 confirma o plantio de cookie sem prefixo com `Domain`. Aceite 11. | §4.11 "Borda TLS"; §8 S0 6–7; Q9i; N9, N10; aceite 11 |

## Opcionais

| ID | Tratamento | Onde |
| --- | --- | --- |
| O1 | PB3 reescrita: `__Host-` no HMAC com HTTPS não exige origem de console; o custo é trocar o nome no C8 e ajustar testes; só o CSRF por `Origin` exato exigiria origem de console. Resíduo de segurança do C8 declarado (tossing do legado: fixação ou duplicata). PB11 diz que a regra de cache da SPEC0150 fica restrita ao modo OIDC. | §14.1 PB3; §14.3 PB11; §4.4; §6 |
| O2 | Tabela da §4.5 com o 503 do erro do limitador no passo 1 (pendente intocado) e o 429 do limitador global (JSON). Nota de que o status do callback nas métricas passa de 4xx/5xx para 3xx. | §4.5; Q5 |
| O3 | `Host`, `X-Forwarded-Host`, `Origin` e `Referer` entre as entradas que não mudam o `Location`. | §4.5 regras; Q5; N14 |
| O4 | Q9g com `exp` de 30 s, 200 explícito antes da espera, relógios reais, timeout ≥ 90 s. "Relógio do IdP controlado" removido dos riscos. | Q9g; fixtures da §9; §13 |
| O5 | **Divergência parcial.** Em vez de `X-Forwarded-For` por contexto, ritmo controlado e incondicional dos logins (no máximo 9 starts e 25 callbacks por janela de 60 s). Motivo: a borda não distingue contextos do mesmo Chromium sem um proxy por contexto, o que somaria peças. O 429 é provado na Q5. O resultado deixa de depender da velocidade do runner, que era o objetivo do opcional. | §4.11 "Limite de taxa controlado"; DB10 |
| O6 | Q8 e Q9 rodam só no runner `test:e2e:oidc-hosts`, fora do `test:core`, da cobertura e do `certify`. O renderizador do modelo (puro) pode ficar no vitest. | §4.11 "Execução"; Q8; §12 |
| O7 | `--tmpfs /tmp` (com `--read-only`, `--cap-drop ALL`, `no-new-privileges`) e `add_header … always` em cada `location`. Q8 confere cabeçalhos no 404 e `no-store` em `/`, `/index.html` e caminho de SPA. | §4.9; Q8; §5 |
| O8 | `vitest.config.mts` no conjunto de escrita, com claim, para as três constantes novas. | §4.6; §7 |
| O9 | Perfil OIDC recusa build com `NODE_ENV=test`; o bundle da prova é construído com `NODE_ENV=production` explícito; DB3 usa o prefixo `__CVG_OPERATOR_BOOTSTRAP_TOKEN`. | §4.6; §4.11 "Console"; Q6; Q7; DB3, DB5 |
| O10 | Q10 declara a exceção I9 no histórico (só o `GET /authorize` do IdP tem `state`, `nonce` e `code_challenge`; nenhuma entrada tem `code=`) e o método (CDP `Page.getNavigationHistory`). | Q10; aceite 14 |
| O11 | Registrado: no navegador, `GET /v1/session` 403 e start 400/403 aparecem como falha de rede ("indisponível"); esses ramos são provados só em jsdom; a origem divergente é provada no navegador. Também nos riscos. | §4.2 (último parágrafo); §4.8 "Ramos que o navegador não alcança"; §13 |
| O12 | N24 morto pela Q9m (URL final `<console>/` depois de "negado"); N19 morto pelo texto da tela. | Q9m; N19, N24 |
| O13 | **Divergência na solução.** O logout fica com o comportamento atual (`App.tsx:308-318`: sai da tela no `finally`, com a mensagem de falha), em vez de "continua na tela"; nada muda nesse ponto. A J10 diz quais mudanças valem em todos os perfis (comparação exata do nome e texto de 403 dos painéis). | J10; §4.8 "Logout"; Q6 |
| O14 | Qualquer falha das checagens 1 a 8 do S0 para o BUILD e volta ao usuário. Checagens novas: Lax por POST → 302 → GET (2), plantio sem prefixo (6), recusa `__Host-` com `Domain` (7), cookie sem nome (8). A 9 é só registro. | §8; aceite 18; §12 |
| O15 | Q9h com `POST` simples (`text/plain`, sem preflight) vindo da segunda origem permitida (`reports.cvg.test`) → 403 da guarda, zero tasks; mutante N28. Q3 com dois `__Host-cvg_operator_session` crus → sem sessão. Q9c com o cookie do primeiro login → 401 depois do segundo login. | §4.11 (host `reports`); Q3; Q9c; Q9h; N28 |

## Pedidos do coordenador além da crítica

- **PB14** virou pergunta explícita ao usuário, com o risco residual em uma frase. Cita o esclarecimento do Codex de 12:41 e o rascunho da SPEC0262 (sha256 `db0a72b96be59176de72ea1ef376a7525c1c531c97536c2eca9eee51499da5ce`, §7: "Coordenar server.ts/operator-session-hook.ts e callers com Claude0259, um delta por vez/rebase e validação integrada"). Também fixa a ordem de rebase, a condição de fecho (a U08 só fecha depois da U04 e de nova Q9) e o efeito do "não". A SPEC0262 está fora da `main`; foi lida no checkout compartilhado, só leitura.
- **§14 separado por quem decide:** (a) usuário: PB1, PB3, PB14; (b) dono do CI (Codex, SPEC0260 e SPEC0261, PR #27): PB6; (c) defaults técnicos: PB2, PB4, PB5, PB7–PB13. Defaults de detalhe DB1–DB10.
- **PB10:** se cair no `ignoreHTTPSErrors`, o relatório registra que a confiança TLS ficou sem prova.
- **PB11:** a regra de cache da SPEC0150 fica restrita ao modo OIDC.
- **PB6:** o gate entra depois do merge do PR #27 e não muda o reuso da SPEC0261.

## Divergências em relação à crítica

1. **O5:** ritmo controlado em vez de `X-Forwarded-For` por contexto (motivo acima).
2. **O13:** logout mantém o comportamento atual em vez de "continuar na tela".
3. **M1, escopo:** a comparação exata vale em todos os modos, inclusive HMAC, e não só no perfil `host-prefixed`. É aperto invisível para nomes ASCII e mantém um parser só.
4. **M1, cookie sem nome:** a crítica pedia registro; a r2 põe parada do BUILD (S0 checagem 8) se o Chromium aceitar cookie sem nome com valor `__Host-…`, porque o servidor não tem defesa para esse caso.
5. **M1, `\xA0` no Chromium:** fica como registro (S0 checagem 9), sem parada, como a crítica pediu: a regra do servidor já fecha o caso.

## Não feito

- Não reexecutei `probe-cookie-name-trim.cjs` nem `probe-fastify-hooks.cjs`: abrem porta ou dependem do `node_modules` do crítico. Uso os resultados registrados na revisão.
- Sem código, teste, ledger, cartão, coordenação, lockfile, commit, push, PG, contêiner, navegador ou porta. CLOSE-CI-LOCAL não foi tocado.
