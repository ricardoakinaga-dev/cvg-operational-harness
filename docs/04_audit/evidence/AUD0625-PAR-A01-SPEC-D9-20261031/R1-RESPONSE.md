# Resposta à revisão da sessão 07 sobre a SPEC 0296 R0 (`5ef8ca368`) — R1

Autor: Claude D9. R0 `de3067b1b`. Só documentos e testes RED; sem BUILD.

| Achado | Resposta | Onde |
|---|---|---|
| P2-1 A10 sem mecanismo; premissa desatualizada | Premissa corrigida (o risco é o cache por requisição, não rotas sem guarda de principal). A revalidação é uma função própria extraída do gancho, `revalidateOperatorSession(deps, sessionId)`, com `valid`/`revoked`/`unavailable` (store, `expiresAt`, `assertSessionBinding` da 0262); o gancho passa a usar a mesma função. `unavailable`: nova tentativa em 5 s e depois `end(source_unavailable)`, nunca "ainda válido". Fatia 0 só para isso. Par discriminante com armazenamento real ou dublê que remove o registro, prova de que repetir o cache não encerra, mutante "lê o `WeakMap`". | A10, §6, §9, D10 |
| P2-2 A8/A9 bytes | Escolhida a segunda opção: página do tail de 10 eventos (pior caso 10 MiB por leitura) mais semáforo de leituras simultâneas (8) e pool próprio, então bytes em voo ≤ 80 MiB; quadro de 64 KiB e fila de escrita de 640 KiB por conexão; 200 conexões globais ⇒ 128 MiB no pior caso. O "1 MiB de fila" saiu. A BUILD prova com um evento de 1 MiB e mede o pico em voo. | A9, §4, §6, §9 |
| P2-3 pool e custo | Pool próprio do tail (`TAIL_POOL_MAX` 8), `TAIL_READ_CONCURRENCY` 8, espera com recuo por no máximo 5 s sem segurar conexão, depois `source_unavailable`. Critério numérico do D4 para passar de (a) para (b)/(c): com 100 conexões ociosas, utilização do semáforo > 50% ou espera p95 por permissão > 250 ms. | §4, §6, D4 |
| P2-4 D6 | Store **por requisição**: não tem estado próprio; o que isola é o `tenantId` da construção e a RLS. Registro de stores e `MAX_TENANT_STORES` removidos (sem recusa do 33º tenant); A4 reescrito. | A4, §4, D6 |
| P2-5 A11 | Tabela por tipo com os nomes reais do catálogo v1 (`model/request` só `correlationId`; `model/result` com `provider`/`inputTokens`/`outputTokens`; `context/compacted` com `throughSequence`/`sourceDigest`/`strategyVersion`; `tool/call` com `operationKey` só se casar um padrão seguro, senão o digest). Nega por padrão (campo novo não sai); tipo desconhecido sai só com o envelope e `payloadOmitted`, sem ser pulado; texto de mensagem **não sai** na v1. Teste: campo extra e tipo novo nunca vazam. | A11, §5.2, D3 |
| P3-1 HEAD | `exposeHeadRoute: false` e `HEAD` ⇒ `405` com `Allow: GET`; RED-9. | §5.1, §7 |
| P3-2 resposta e cabeçalhos | `reply.send(Readable)` (não `hijack`), então CSP, `nosniff`, `x-frame-options`, `no-store` e correlação rodam; cabeçalhos conferidos no teste; só o cookie vale em `EventSource`, entre origens exige CORS com credenciais (D8/WEB-01). | §5.2 |
| P3-3 fundamento da ordem | Reescrito: a ordem vem de `event.sequence === next_sequence`, do gatilho `guard_session_event_insert` da 0034 e da PK; o `append` do store 0028 usa `FOR UPDATE`. A fatia 2 prova com os **dois** escritores concorrentes. | §4, §9 |
| P3-4 reconexão | `retry:` por razão; `permanent` no `end` para `sequence_gap`/`corrupt_event`; reconexão no mesmo cursor de um fim permanente recebe `204`, que para o `EventSource` (memória limitada de 1000 entradas, 5 min). | §5.2, §7 |
| P3-5 latência | A latência do stream sai do histograma da rota; mede-se o tempo até o primeiro quadro. | §9 |
| P3-6 A13 | Gancho `preClose` manda `end(server_closing)` antes de o `close()` esperar; provado com `listen` real (RED-8). | A13, §9 |
| P3-7 provas e RED | RED-7 a RED-10 com listener real e cliente que lê por pedaços; a porta entra pela opção nova `sessionEventStreams` do `buildServer`; par "toda saída libera a vaga" (contador volta a zero depois de N fechamentos aleatórios). | §9, RED |

D7 uniformizado (`404` fixo). D1, D2, D5 e D8-(a) como a 07 aprovou. D9 aprovada como valores iniciais condicionados a P2-2/P2-3, agora com os derivados de memória. D10 ganhou a fatia 0.
