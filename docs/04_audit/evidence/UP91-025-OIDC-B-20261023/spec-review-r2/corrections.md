# Correções da SPEC0259 r2 → r3

- **Task:** `UP91-025-OIDC-B-20261023` (U08). Executor: Claude Code (CONT-20261018-D9EF).
- **Revisão de origem:** [review.md](review.md) (sha256 `167956201f0357a4020d9a3ba3025a9b8038507cd71ef37b33a0276048a3c5e6`) e [review.json](review.json) (sha256 `f6cf15a5a2af2d8b963ed52593a6bd0c196ad91743f927be8f462592971300f5`). Veredito `REVISE`, 1 obrigatório novo (M1 r2), opcionais O1–O8. M1 e M2 da r1 fechados (M2 na i1 e no desenho da i3).
- **SPEC:** r2 `5cb1bfb231b4cd32ff8e4bed0dfdeee0e7d10b9e3f11a393138245c9a018a10a` → r3 (sha256 em [spec-r3.json](../spec-r3.json)).
- **Regra desta rodada (segunda de retrabalho):** só o delta. Nenhum contrato, aceite ou corte novo. O aceite 11 só ganhou "e do material do atacante", que é o controle pedido pelo M1 (r2).
- **Gbrain:** timeline consultada antes da r3. Entradas usadas: crítica r2 (13:28 UTC), SPEC0262 r2 (13:11), crítica da 0262 r2 (13:20) e SPEC0262 r4 (13:27).

## Sonda citada (copiada para [probes/](probes/))

| Arquivo | sha256 | Resultado |
| --- | --- | --- |
| `probe-pacer-window.mts` (crítico r2) | `ccc91dedc56af09238465fc8ef32444a3b236e426918b177add69b13509d75eb` | `InMemoryRateLimiter` real contra o ritmo "9 por janela de soltura", 2.000 execuções de 40 starts |
| `probe-pacer-window.out.txt` | `e9f3aa37496bb6c9ea60723e26b7c9c2926a62bc83225060cfeb829606aaa8bd` | 60 s: 3 execuções com 429 (atraso até 300 ms) e 117 (até 2 s); 70 s: 0 (até 2 s e até 5 s) |

Não reexecutei a sonda. Ela importa o `rate-limit.ts` por caminho absoluto da worktree e roda com `--experimental-transform-types`. Uso o resultado registrado pelo crítico.

## Obrigatório

| ID | Correção | Onde |
| --- | --- | --- |
| M1 (r2) | A captura do code e do state do atacante sai do `page.route` no callback. O teste roteia o **POST ao `/authorize` do IdP** com `route.fetch({ maxRedirects: 0 })`, lê o `Location` do 302 e responde com `route.fulfill` (página neutra); o callback do atacante não abre. Alternativa equivalente: fluxo do atacante por HTTP cru. **Controle de material vivo** depois do "negado" da vítima: no contexto do atacante, com o pendente `__Host-` dele, o mesmo code e o mesmo state completam o login (identidade do atacante e uma chamada a mais ao token), dentro dos 60 s do code (`synthetic-oidc-issuer.ts:394`); o teste falha se a captura e o controle ficarem mais de 50 s separados. As vagas do ritmo são reservadas antes da captura. A i3 faz uma captura nova pelo mesmo método e repete o controle. O N10 passa a apontar para esse controle. | Q9i2, Q9i3; N10; aceite 11; DB10 |

## Opcionais

| ID | Tratamento | Onde |
| --- | --- | --- |
| O1 | Janela do ritmo de 70 s (60 s da janela ancorada mais duas vezes a latência máxima), contada pelo tempo de soltura. O teste falha se um start ou callback passar de 5 s. Fluxos com code reservam vagas antes. | §4.11 "Limite de taxa controlado"; DB10; §13 |
| O2 | Na Q9m, o caso "token endpoint 500" exige que o contador de token do IdP suba exatamente 1. | Q9m |
| O3 | PB14 atualizada: estado da SPEC0262 lido em 23/10/2026 às 10:29:44 -0300 (13:29:44 UTC), **R4**, `PROPOSED_FOR_TECHNICAL_REVIEW`, sha256 `65a0863e9974c97bf10551a0582433e6cac05e1d4a0c27ef8fa49a0372bfedeb`, com o aviso de que o hash pode mudar e a citação nova da §7. Conferido de novo às 10:32:29 -0300, sem mudança. Três acoplamentos: migração do Auth v2 com corte (cookies antigos exigem novo login), releitura do principal no callback antes do `Set-Cookie` e guarda a cada requisição (401 apaga o cookie, 503 mantém). O risco diz que não há exposição hoje (OIDC só em teste) e que a B1 é reversível (um PR, sem migração). | §14.1 PB14; §13 |
| O4 | Três regras de rebase: saída padrão do callback (falha nova 5xx → `indisponivel`, 4xx → `negado`, pendente pela I8); uma só função por cookie com o perfil obrigatório na assinatura, sem padrão; teste de que o hook HTTP é o primeiro `onRequest` depois do hook de alvo. | §4.2, §4.3, §4.5; Q2; PB14 "Ordem de rebase"; §13 |
| O5 | N28 aponta para o teste O8 da A (`oidc-login-guards.test.ts:266-290`). A borda passa a registrar o status (sem valores); na Q9h, o sintoma do N28 no navegador seria o status 400 em vez de 403, sem task. | §4.11 "Borda TLS"; Q9h; N28 |
| O6 | Q10: só entradas do host do IdP podem ter `state`, `nonce` e `code_challenge` (o TOTP errado da Q9m cria outra). | Q10 |
| O7 | S0 checagem 8 com o controle `cvg_probe_control8=1; Domain=cvg.test` na mesma resposta; a recusa só vale depois do controle em `context.cookies()` e no log em hex da borda. | §8 S0 8 |
| O8 | J8 com a exceção da ação explícita de logout (falha com rede ou 5xx: sai da tela como hoje, mensagem de falha, cookie mantido pela API). | J8 |

## Divergências

1. **Versão da SPEC0262.** O pedido falava em R3. No momento da leitura (13:29:44 UTC), o arquivo já era **R4** (timeline 13:27 UTC, "contrato0262 r4"), ainda em `PROPOSED_FOR_TECHNICAL_REVIEW`. Citei a R4 com data e hora. Os três acoplamentos pedidos estão na R4 (§5 e §6.2).
2. **N28 na Q9h.** A crítica pedia só apontar o N28 para o teste da A e corrigir a descrição. Também deixei o status na borda, para a Q9h ter sintoma observável (400 em vez de 403). Não muda contrato: é o log de teste.

Nenhuma outra divergência. Não incorporei nada além de M1 (r2) e O1–O8.

## Não feito

- Não reexecutei `probe-pacer-window.mts`.
- Sem código, teste, ledger, cartão, coordenação, lockfile, commit, push, PG, contêiner, navegador ou porta. CLOSE-CI-LOCAL não foi tocado. A SPEC0262 foi só lida.
