# Reparo da BUILD 0296 após a revisão da 07 (aab25d0a9)

Revisão: CHANGES_REQUESTED, P2 ×2, P3 ×6. Este commit repara todos, na `claude/aud0625-par-a01-build-d9`, sobre `6a9d88219`.

| Achado | Reparo | Prova |
| ------ | ------ | ----- |
| P2-1 página bruta retida | `frameOf` no tail: o quadro é montado quando a página é lida e só quadros (≤ 64 KiB) esperam o cliente; o registro bruto não sobrevive ao `readEntries` | 30 tails parados com páginas de 10 × 1 MiB: pico retido abaixo de 30 × 10 × 64 KiB × 1,5; controle sem projeção retém > 150 MiB; mutantes R1, R2 |
| P2-2 `end` forçado sem prazo | todo `end` tem `CLOSE_GRACE_MS` para ser consumido; vencido, `onStuck` derruba o socket e o corpo é destruído, a vaga volta | cliente TCP real parado (perOperator 1): vaga volta em < 2,5 s; mutantes R3, R4, R5 |
| P3-1 chave do 204 | a chave usa o `lastSequence` do `end` | reconexão com `Last-Event-ID: 2` ⇒ 204, de 0 ⇒ 200; mutante R6 |
| P3-2 nome da permissão | documentado no SPEC (D8) e no código: é leitura do tenant, sem atribuição por sessão | SPEC |
| P3-3 conexão durante o `preClose` | flag `closing` e `return503OnClosing: false` quando o stream está instalado (o Fastify respondia 503 antes de qualquer gancho) | servidor real: a conexão tardia recebe 200 + `end(server_closing)`; mutantes R7, R9 |
| P3-4 `: hb` ocioso | o heartbeat que não drena arma o prazo de `slow_consumer` | teste de corpo ocioso; mutante R8 |
| P3-5 414 | SPEC alinhado: o roteador recusa acima de 100 caracteres (`maxParamLength`), o handler cobre vazio/NUL/≤ 200 | teste 414/404 |
| P3-6 HEAD com a store de sessão fora | teste: 405 da rota, não 503 do gancho | teste |

Gates: typecheck, eslint, prettier, docs:check-links; 100% por arquivo em `session-event-stream.ts`, `session-event-frames.ts`, `event-tail.ts`; suíte `apps/api` 864 passed. Mutantes em `mutations-repair.json` / `mutation-results-repair.json`: 9/9 mortos.

Limite: a mudança de `return503OnClosing` vale para o servidor inteiro quando `sessionEventStreams` está configurado; as outras rotas passam a terminar durante a espera do `preClose` como as requisições em voo.

## P3 da conferência da DF: o desligamento das outras rotas

`return503OnClosing: false` valia para todas as rotas. Agora um `onRequest` (instalado junto com o stream) responde `503` com `connection: close` a toda rota que não seja a do stream enquanto o `preClose` espera; o stream segue recebendo `200` + `end(server_closing)`. Teste no servidor real: rota comum ⇒ 503 + `connection: close` durante o `preClose`, stream ⇒ 200 + `server_closing`. Mutantes O1–O3 (`mutations-onrequest.json`) mortos.
