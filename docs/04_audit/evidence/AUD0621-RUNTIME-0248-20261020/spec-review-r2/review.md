# Crítica independente da SPEC0248 r2 (rodada 2)

- SPEC revisada: `materialized/0248_runtime_budget_cancel_limits.md.txt`, sha256 `bbd86c184809dda8427de660d8c710bc53a3038e0b09541f41a67966e652c274`.
- Mesmo crítico da r1 (general-purpose, não-fork, só leitura), retomado com o contexto da r1.
- Veredito: **REQUEST_CHANGES**, 1 obrigatório (R2-01) e 5 P3. Os 4 obrigatórios da r1 foram dados como fechados.

Transcrição fiel do parecer (registrada pelo lead da frente):

## Fechamento da r1

- R1-01 fechado: transporte de modelo como subconjunto da D011 (2xx acima do teto resolve a Response com corpo que falha com `ResponseTooLargeError`; não 2xx e 3xx saem com status e corpo nulo; pré-abort como subconjunto da D009 com `AbortSignal.any`; causa do prazo e MF02 na HISO-011; §5.3 cobre conflito com a 0180). Confirmado em Node 22.23.2 que `reader.read()` e `text()` de corpo errado rejeitam com o próprio erro e que `new Response(null, {status: 302 ou 500})` é válido. AC21 confere com o código (302 com `maxRedirects` 0 → `UnsafeUrlError` → `invalid_request`). `local-http-providers` 191–201 e 365–371 continuam passando.
- R1-02 fechado: camadas explícitas em AC20–AC23; AC23 correto como regressão.
- R1-03 fechado: validação dos quatro campos antes de qualquer soma; relatos completos dos testes existentes continuam válidos (iterative-runtime 367/387/1487/1507).
- R1-04 fechado: checagem antes de `this.dispatch` (878), depois do `safeAudit` (873); AC14 é first red real; conformance aud0599 não muda.
- Âncoras novas conferidas: 856, 873, 878, 1133–1141 e iterative-dispatch 1022–1028. PDSH-016 continua passando.

## Itens

- **R2-01 — OBRIGATÓRIO.** AC13 contradiz a §3.3: no listener de abort a porta ainda está aberta (o fechamento vem no `finally` depois do `await race`), e a §3.3 só recusa `beginCall` com turno cancelado. Correção proposta: `beginRepair` com turno cancelado dá falso; `recordCall` com turno cancelado ainda contabiliza `u` válido por `recordModelResult` (R4) e dá falso; porta fechada: as três dão falso sem contar.
- **R2-02 — P3.** Lacunas do subconjunto da D011: transporte sem teto continua ilimitado (D011 l.108) — listar como aberto; provider cancelar o corpo de não 2xx (D011 l.125); preservar a mensagem "Provider response exceeded <B> bytes" (D011 l.144) no `readBoundedText`.
- **R2-03 — P3.** Ler `usage` só de objeto não nulo, protegido contra getter que lança; `throw null` ou primitivo mantém "…: unknown failure.".
- **R2-04 — P3.** Fixar a mensagem do `MODEL_FAILURE` de `recordCall` ("Orchestrator reported invalid model usage.").
- **R2-05 — P3.** Na corrida da chamada inteira dos canais, a promessa abandonada do `fetchWithSsrfGuard` precisa de `.catch`; incluir "zero unhandled rejections" no AC24.
- **R2-06 — P3.** "Nenhum efeito começou" (§3.2 item 6) não vale para decisão pendente retomada; reescrever ou restringir.

## O que o crítico conferiu e não conferiu

Conferiu o sha da r2, o `r1-corrections.json`, a r2 inteira, iterative-runtime 850–880 e 1097–1141, iterative-dispatch `evaluate`, `exam-egress` 318–380, PDSH-016, `channel-gateway.test` 300–330, conformance aud0599 140–230 e 477–500, testes com uso relatado e a SPEC0180 l.86–151. Experimento próprio `exp2.mjs`. Não rodou suítes, cobertura nem typecheck; não testou a corrida de DNS dos canais nem a ordem exata das microtarefas do listener.
