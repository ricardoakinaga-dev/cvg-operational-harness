# Crítica de código — BUILD SPEC0248, rodada 1

- Delta revisado: `build-r1.diff` sha256 `d5f89e2771b57ff2907bcd25b1df3bf5c8f0902980f76c8a4d6b5ad7826d3912` sobre a base `6c9fc651`; SPEC r3 `d4392f0b…`.
- Crítico: agente general-purpose novo, não-fork, separado do crítico da SPEC, só leitura, sem descendentes.
- Veredito: **REQUEST_CHANGES** — 3 obrigatórios (C1-01 a C1-03) e 7 P3 (C1-04 a C1-10).

Transcrição fiel (registrada pelo executor):

## Obrigatórios

- **C1-01.** Teto não finito ainda autoriza a chamada (R8, §3.4 item 2), `gateway.ts:268-272`: `!(estimatedCost <= ceiling)` nega NaN, mas deixa passar `profile.maxCostUsd = Infinity` sem teto na request, `Infinity <= Infinity` e estimativa `-Infinity` (confirmado em Node 22). `ModelProfile` não passa por validação. Correção: `Number.isFinite(ceiling) && Number.isFinite(estimatedCost) && estimatedCost <= ceiling`, com testes de perfil `Infinity` e estimativa `Infinity`.
- **C1-02.** Uso validado num objeto e somado a partir de releituras (R4, §3.2 item 5): `failureUsage` valida e depois copia relendo getters; o caminho de sucesso valida e passa o mesmo objeto a `accountBeyondGate`; `recordCall` valida um spread e usa o original. Reproduzido com getter que devolve 5 e depois NaN: NaN entra em `run.usage` e `checkAfterUsage` não detecta. Correção: copiar uma vez, validar a cópia e usar só a cópia; teste de getter alternado na exceção e no sucesso.
- **C1-03.** Ramo `: error` de `hybrid-orchestrator.ts:279-281` provavelmente sem cobertura (barra PDSH-031 de 100% por arquivo) e cláusula "exceção do modelo sobe sem mudança" sem prova. Correção: teste com getter `text` que lança, com `maxDecisionRepairs: 0` e com porta `repair: [false]`, conferindo a identidade do erro.

## P3

- C1-04: títulos AC14–AC17 do teste do gateway correspondem a AC16–AC19 da SPEC.
- C1-05: `networkError` cria mensagem nova sem os bytes; repassar o teto a partir do catch dos providers ou declarar.
- C1-06: o teste "abort logo depois do backoff" não confere `model.call.failed` `cancelled` nem a ausência de segundo `started`; nenhum teste confere que o provider herda o reason do caller.
- C1-07: quando o abort ganha o backoff, o `setTimeout` padrão de `#sleep` continua armado (sem erro; segura o loop de eventos).
- C1-08: AC12 com `maxDurationMs: 40` pode virar "while building the decision context" sob carga; subir para 150–200 ms.
- C1-09: `bounded-body.ts` `status === 429` e `if (!body) return` provavelmente não exercitados.
- C1-10: `drainBoundedBody` com corpo nulo pula o teste de tamanho num adaptador falso só com `text()`; com `Response` real nada muda.

## Conferido como correto pelo crítico

Porta da decisão (reserva e contabilização pelas funções do turno, primeira parada vale, porta fechada no `finally`, contador único de reparos, `max(0, relatado − contado)` sem dupla contagem nem resíduo de ponto flutuante); prazo e cancelamento (race do kernel, `AbortSignal.any` com o evento da origem antes do dependente, R6 depois do `safeAudit`, sem rejeição não tratada, sem caminho novo para COMPLETED); gateway; transportes; testes existentes que poderiam quebrar (nenhum previsto); AC01–AC25 com asserções que matariam a regressão, salvo C1-03 e C1-06. Escopo: só os 16 arquivos declarados; nada em `packages/contracts`, `packages/shared`, `packages/persistence`, `apps` ou `products`; sem `v8 ignore`, `.skip`, `.only`, `ts-ignore` ou `eslint-disable` novos; tokens proibidos ausentes.

Não conferido pelo crítico: suítes, cobertura, PostgreSQL, typecheck, lint, mutantes. Experimentos: `codecritic0248/exp/toctou.mjs` e `codecritic0248/exp/order.mjs` no scratch da sessão.
