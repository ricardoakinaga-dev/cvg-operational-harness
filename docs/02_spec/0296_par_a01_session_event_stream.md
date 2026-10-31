# SPEC0296 — Stream de eventos de sessão na API com cursor (PAR-A01)

R1, 31/10/2026 (R0 `de3067b1b`; R1 responde a revisão da sessão 07, `5ef8ca368`: 5 P2 e 7 P3, item a item em [R1-RESPONSE](../04_audit/evidence/AUD0625-PAR-A01-SPEC-D9-20261031/R1-RESPONSE.md)). Task `AUD0625-PAR-A01-SPEC-D9-20261031` (Claude Sonnet 5.5, D9), cartão PAR-A01 ([0380](../03_build/0380_backlog_paridade_100_deepseek.md); F3, P0, G, T3; depende de PAR-S01 e PAR-M01), capacidades PAR-CAP API-02, API-03 e WEB-01. Estado `AUTHOR_REPAIRED_PENDING_NON_AUTHOR_CONFERENCE_AND_HUMAN_T3`: não há BUILD, não há aceite e nada aqui libera produção.

Evidência: [DISCOVERY](../04_audit/evidence/AUD0625-PAR-A01-SPEC-D9-20261031/DISCOVERY.md) e o RED `apps/api/src/__tests__/aud0625-par-a01-red.test.ts` (2 controles verdes, 6 `it.fails`). Consumidores: SPEC [0295](0295_par_s05_session_query_and_trace.md) (consulta), S02 [0292](../03_build/0380_backlog_paridade_100_deepseek.md) (projeções), A02, A03, A05.

## 1. Problema

1. A API só tem request/response. Para ver o que um turno está fazendo, o cliente repete `session.events` (SDK) ou nada (API): polling sem ordem de entrega, sem fim e sem reconexão definida.
2. O M01 deixou os deltas do modelo internos ao gateway e remeteu "o que é exposto" ao A01.
3. Um canal de longa duração é a primeira superfície em que um papel revogado, um cliente lento ou um erro de cursor causam efeito prolongado ou vazamento entre tenants.

## 2. Decisões de forma (recomendadas; D1–D10 no §10)

- **Transporte:** SSE sobre HTTP, `GET /v1/sessions/:sessionId/events/stream`. Uma direção (servidor → cliente); o uplink continua nas rotas POST existentes e o cancelamento é fechar a conexão. WebSocket fica fora (D1).
- **O que trafega:** os **fatos confirmados do log de sessão** (catálogo v1), nunca deltas de token (D2) e nunca evento ainda não confirmado.
- **Cursor:** a **sequência do evento na sessão** (inteiro denso e sem lacuna), no `id:` do SSE e no `Last-Event-ID`/`?after=`.

## 3. Invariantes

A1. **Fonte de verdade é o log do S01.** Só se emite evento lido do log, já confirmado (COMMIT). Evento escrito mas não confirmado, ou de escritor que caiu no meio da transação, não existe para o stream. O stream não guarda estado do qual dependa a verdade.

A2. **Ordem e densidade.** O servidor emite as sequências `after+1, after+2, …` exatamente nessa ordem. Se a leitura devolve uma sequência diferente da esperada, o stream **para sem emitir esse evento** e encerra com razão `sequence_gap`. Nenhuma lacuna é pulada, nenhuma é preenchida.

A3. **Sem perda e sem repetição por sequência.** Ao reconectar com a última sequência recebida, o servidor continua da seguinte. A entrega é "pelo menos uma vez" no fio; o cliente deduplica por sequência (contrato do cliente). O servidor nunca reemite uma sequência `<= after`.

A4. **Tenant sempre da identidade.** O tenant vem da identidade do operador (`resolveDataPlaneTenant`); o cabeçalho `x-tenant-id` não escolhe. Sessão de outro tenant e sessão inexistente produzem a mesma resposta (§7), byte a byte exceto o eco do id. O que isola é o `tenantId` fixado na **construção** do store (e a RLS pelo `cvg.tenant_id` de cada transação): o store é criado **por requisição**, barato e sem estado próprio, sobre o pool compartilhado de leitura do tail; nenhum registro de stores por tenant, nenhum cache, buffer ou leitor compartilhado entre tenants.

A5. **O cursor é uma posição, não uma capacidade.** O cliente pode escolher qualquer posição **dentro de uma sessão que já pode ler**; isso só decide de onde reler histórico que ele já está autorizado a ver. Não há cursor opaco nem MAC: não há nada a forjar além da posição. Posição **além do fim** é `409 cursor_ahead` (A6); nunca espera silenciosa nem recomeço.

A6. **Pré-verificação do cursor.** Antes dos cabeçalhos, o servidor lê o evento `after` (`afterSequence = after-1`, `limit = 1`): ele existe com sequência igual a `after`, ou `after = 0`. Senão `409 cursor_ahead`. A mesma leitura confirma densidade no ponto de retomada.

A7. **Dois cursores diferentes são inválidos.** `?after=` e `Last-Event-ID` presentes com valores diferentes ⇒ `400`. Iguais ou só um deles ⇒ vale o presente. Sem nenhum ⇒ `after = 0` (início do log).

A8. **Orçamentos duros** (§6) por conexão, por operador, por tenant e global, **e** para o que está em voo: leituras simultâneas e bytes materializados. Nenhum é vendido como limite de IO físico do PostgreSQL; o limite é do trabalho que a aplicação aceita fazer.

A9. **Backpressure pelo consumidor, com memória limitada de verdade.** O servidor lê da fonte **no ritmo em que o cliente consome**. `SessionEventStore.read` limita eventos, não bytes, e um evento chega a 1 MiB (SPEC 0202); por isso a página do tail é de **10 eventos** (pior caso 10 MiB materializados por leitura), as leituras simultâneas são limitadas por um semáforo (`TAIL_READ_CONCURRENCY`, §6) e os bytes em voo ficam em no máximo `TAIL_READ_CONCURRENCY × 10 MiB`. Cada quadro é cortado em 64 KiB (`payloadOmitted` acima disso), então a fila de escrita pendente de uma conexão é de no máximo uma página de quadros (10 × 64 KiB = 640 KiB); escrita que não drena em 15 s encerra com `slow_consumer`. A BUILD prova com um evento de 1 MiB.

A10. **Revalidação com mecanismo, e vida curta.** O pré-voo e o gancho de sessão da API leem a sessão do operador uma vez por requisição e a guardam num cache por requisição (`sessionIdentityByHeaders`); repetir `requireIdentity` dentro do stream leria esse cache e **nunca veria a revogação**. A revalidação é, por isso, uma função própria **extraída do gancho** (fatia 0, §6): `revalidateOperatorSession(deps, sessionId)`, que consulta o armazenamento de sessões (`operatorSessionStore.get`), confere `expiresAt` e a revisão do principal (`assertSessionBinding`, SPEC 0262) e devolve `valid`, `revoked` (registro ausente, expirado ou revisão velha) ou `unavailable` (o armazenamento falhou). O gancho passa a usar a mesma função, com as mesmas saídas. A cada `REVALIDATE_MS` o stream a chama com o id da sessão do pré-voo: `revoked` ⇒ `end(session_revoked)`; `unavailable` ⇒ **falha fechada**: uma nova tentativa depois de 5 s e, se ainda indisponível, `end(source_unavailable)` (o pré-voo de uma reconexão devolve `503`). Toda conexão tem vida máxima `MAX_LIFETIME_MS`, depois do qual o servidor encerra com `lifetime` e o cliente retoma pelo cursor. Premissa corrigida: o risco não é "rotas sem guarda de principal" (a 0262 pôs o guarda em toda rota `operator`), é o cache por requisição num canal de 15 min.

A11. **Só projeção segura sai, negando por padrão.** O quadro de cada evento é uma projeção em lista branca por tipo e por campo (§5.2, com os **nomes reais do catálogo v1**), nunca o registro bruto. Um campo novo num tipo conhecido **não sai**. Um tipo desconhecido (catálogo v2 do A02) **não pode ser pulado** (quebraria A2): sai o envelope (`sequence`, `eventId`, `type`, `timestamp`, `correlationId`, `traceId`) com `payloadOmitted: true`. Um evento cuja projeção passa de `MAX_FRAME_BYTES` sai do mesmo modo, mantendo a sequência.

A12. **Somente leitura e sem autoridade.** O stream não escreve, não abre escritor, não toma lock de dono e não concede autoridade para aprovar, executar, retomar ou delegar. Sua falha não afeta o turno.

A13. **Encerramento do servidor é limpo, e toda saída libera a vaga.** No fechamento do app um gancho `preClose` do Fastify (antes de o `close()` esperar as respostas ativas) manda `end(server_closing)` a todo stream e o fecha dentro de `CLOSE_GRACE_MS`; o `close()` do Fastify sozinho esperaria por elas. Todo caminho de saída (fim normal, cancelamento do cliente, erro, `slow_consumer`, revogação, fechamento do servidor) devolve a vaga do operador, do tenant e a global: o contador de conexões volta a zero depois de N fechamentos aleatórios (§9).

## 4. Leitura do log: núcleo independente do transporte

Módulo puro `SessionEventTail` em `packages/harness` (nome provisório), sem HTTP: dado um `SessionEventStore` preso a um tenant, `sessionId`, `after`, `signal` e orçamentos, devolve `AsyncIterable<TailItem>` com `event | end(reason)`. Ele cuida de A2, A3, A6, A8, A9 e do fim; os adaptadores só traduzem: **SSE na API** (esta SPEC), **notificações JSON-RPC no SDK** (A05) com a mesma semântica de cursor, e o **cliente web** (WEB-01) consome o SSE.

Fonte: `SessionEventStore.read` (incremental, uma transação curta por página, `limit` ≤ 10 neste canal). O S01 `SessionHandle.read` (prefixo inteiro a cada leitura) **não** é usado. A pré-verificação do A6 e cada página validam `sequence === esperada`.

**Fundamento da ordem de commit (A2).** O escritor do S01 (`#appendNow`) não toma `FOR UPDATE`: lê `next_sequence`, exige que `event.sequence` seja igual a ele e avança o cursor na mesma transação, e o gatilho `guard_session_event_insert` (0034) e a chave primária `(tenant, session, sequence)` recusam uma segunda inserção na mesma posição (o segundo escritor falha com conflito, nunca renumera). O `append` do store 0028 usa `SELECT … FOR UPDATE` no fluxo. Dos dois caminhos resulta o mesmo: uma sequência `n` só é confirmada depois da `n-1`, e um leitor em READ COMMITTED nunca vê `n+1` sem `n`. A fatia 2 prova isso em PG com **os dois escritores**, concorrentes na mesma sessão.

**Store por requisição.** O `PostgresSessionEventStore` guarda o pool e o `tenantId` e mais nada; cria-se um por requisição com o `tenantId` da identidade. O pool é o **pool próprio do tail** (`TAIL_POOL_MAX`, §6), separado do pool das rotas de dados e do de readiness.

**Leituras simultâneas.** Antes de cada leitura de uma página o tail adquire uma permissão de `TAIL_READ_CONCURRENCY`; sem permissão, espera com recuo e jitter (a espera não segura conexão de PG nem memória) por no máximo `TAIL_GATE_WAIT_MS`, e depois encerra com `source_unavailable`. A fila de espera é limitada pelo número de conexões abertas, que já tem teto.

**Espera por novos eventos.** Quando a página volta vazia, o tail espera `POLL_MIN_MS` crescendo até `POLL_MAX_MS` (com jitter) e relê; uma página cheia (10) relê sem esperar; novo evento reinicia o intervalo mínimo. Cada leitura custa hoje cerca de sete idas ao banco (`BEGIN`, dois `SET LOCAL`, `set_config`, `SELECT` do fluxo, `SELECT` dos eventos, `COMMIT`). O critério numérico que faz passar de D4-(a) para (b)/(c) está na D4.

## 5. Protocolo SSE

### 5.1 Requisição

`GET /v1/sessions/:sessionId/events/stream` com `?after=<inteiro ≥ 0>` (opcional) e `?maxEvents=<1..MAX_EVENTS>` (opcional; encerra com `max_events`, para catch-up limitado e testes). Cabeçalho `Last-Event-ID` conforme A7. Autenticação: cookie de sessão do operador (modo confiável); `EventSource` não envia cabeçalhos próprios, então só vale o cookie, e entre origens o navegador exige CORS com credenciais, que a D8 e o WEB-01 registram. Permissão de leitura de conversa/sessão (D8). Sem corpo. A rota é registrada com `exposeHeadRoute: false` e `HEAD` responde `405` com `Allow: GET`: o `HEAD` derivado pelo Fastify executaria o laço do tail e seguraria uma vaga.

### 5.2 Resposta

A resposta é um `Readable` entregue por `reply.send(stream)`, **não** `reply.hijack()`: assim o Fastify mantém os ganchos `onSend` (CSP, `nosniff`, `x-frame-options`, `no-store`, correlação de resposta) e o CORS configurado, e trata a contrapressão e o fechamento pelo próprio `Readable`. Cabeçalhos: `200`, `content-type: text/event-stream; charset=utf-8`, `cache-control: no-store`, `x-accel-buffering: no`, sem compressão, mais os de segurança aplicados pelas outras rotas (a BUILD os confere no teste). Quadros:

```
retry: <ms>                            (uma vez, no início; valor por razão de fim esperada: ver abaixo)

id: <sequence>
event: session.event
data: {"sequence":N,"eventId":"…","type":"tool/call","timestamp":"…","correlationId":"…","traceId":"…","payload":{…projeção…},"payloadOmitted"?:true}

: hb                                   (comentário a cada HEARTBEAT_MS, sem id)

event: end
data: {"reason":"<razão>","lastSequence":N,"permanent":false}
```

Razões de `end` e política de reconexão (`retry:` em ms, que o cliente usa ao reconectar):

| Razão                                                    | `permanent` | `retry`                  | Observação                                                                        |
| -------------------------------------------------------- | ----------- | ------------------------ | --------------------------------------------------------------------------------- |
| `max_events`                                             | não         | 0                        | o cliente decide                                                                  |
| `lifetime`, `server_closing`                             | não         | 1000 + jitter do cliente | reconexão pelo cursor                                                             |
| `slow_consumer`, `source_unavailable`, `session_revoked` | não         | 5000                     | `session_revoked` ainda exige nova sessão; a reconexão falha no pré-voo com `401` |
| `sequence_gap`, `corrupt_event`                          | **sim**     | 60000                    | reconectar no mesmo cursor repete o defeito                                       |

Para um cliente que não lê `permanent` (um `EventSource` reconecta para sempre), o servidor guarda, em memória e limitado (1000 entradas, 5 min), o par (tenant, sessão, cursor) que terminou com uma razão permanente e responde `204` à reconexão no mesmo cursor, o que faz o `EventSource` parar. `end` não tem `id:` (não é um evento do log).

**Projeção por tipo (lista branca por campo; nega por padrão).** Envelope sempre: `sequence`, `eventId`, `type`, `timestamp`, `correlationId`, `traceId`. Campos do `payload` que saem, pelos nomes reais do catálogo v1:

| `type`                              | sai do `payload`                                                                                                                                | não sai                                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `turn/start`                        | `correlationId`                                                                                                                                 | —                                                                                                                     |
| `turn/end`                          | `correlationId`, `stopReason`                                                                                                                   | —                                                                                                                     |
| `tool/call`                         | `correlationId`, `toolId`, `operationKey` (só se casar `^[A-Za-z0-9._:@-]{1,200}$`; senão `operationKeyDigest`, os 16 primeiros hex do SHA-256) | `input`                                                                                                               |
| `tool/result`                       | `correlationId`, `toolId`, `outcome`                                                                                                            | —                                                                                                                     |
| `model/request`                     | `correlationId`                                                                                                                                 | `request` (o pedido inteiro ao modelo)                                                                                |
| `model/result`                      | `correlationId`, `provider`, `inputTokens`, `outputTokens`                                                                                      | —                                                                                                                     |
| `message/user`, `message/assistant` | — (`payloadOmitted: true`)                                                                                                                      | `text`: na v1 o texto de mensagem **não sai**; só sairá com uma permissão de conteúdo que ainda não existe (D3, D8-b) |
| `context/compacted`                 | `throughSequence`, `sourceDigest`, `strategyVersion`                                                                                            | `summary`                                                                                                             |
| tipo desconhecido                   | — (`payloadOmitted: true`)                                                                                                                      | tudo                                                                                                                  |

Um campo novo num tipo conhecido não está nesta tabela, logo não sai. Teste: um evento com campo extra e um de tipo novo nunca vazam o campo nem o valor.

## 6. Orçamentos (A8)

| Orçamento                                              | Valor inicial                                                               | Ao atingir                                                                       |
| ------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Conexões por operador                                  | 5                                                                           | `429` antes dos cabeçalhos (`too_many_streams`)                                  |
| Conexões por tenant                                    | 20                                                                          | `429`                                                                            |
| Conexões globais                                       | 200                                                                         | `503` com `Retry-After`                                                          |
| Vida máxima da conexão                                 | 15 min                                                                      | `end(lifetime)`                                                                  |
| Eventos por conexão                                    | 50 000                                                                      | `end(max_events)`                                                                |
| Página de leitura                                      | 10 eventos                                                                  | —                                                                                |
| Bytes por quadro                                       | 64 KiB                                                                      | `payloadOmitted`                                                                 |
| Fila de escrita pendente por conexão                   | 1 página de quadros (10 × 64 KiB = 640 KiB)                                 | espera `drain` até 15 s, depois `end(slow_consumer)`                             |
| Memória pendente no pior caso                          | 200 conexões × 640 KiB = 128 MiB                                            | — (consequência dos três tetos acima)                                            |
| Leituras simultâneas do tail (`TAIL_READ_CONCURRENCY`) | 8                                                                           | espera com recuo até `TAIL_GATE_WAIT_MS` (5 s), depois `end(source_unavailable)` |
| Bytes de eventos em voo                                | 8 × 10 MiB = 80 MiB (pior caso de 10 eventos de 1 MiB por leitura)          | — (consequência)                                                                 |
| Pool próprio do tail (`TAIL_POOL_MAX`)                 | 8                                                                           | a espera por conexão é o semáforo acima, sem fila própria                        |
| Heartbeat                                              | 15 s                                                                        | —                                                                                |
| Revalidação da identidade                              | 60 s; indisponível: nova tentativa em 5 s, depois `end(source_unavailable)` | `end(session_revoked)`                                                           |
| Intervalo de espera sem evento                         | 250 ms → 2 s, com jitter; página cheia: sem espera                          | —                                                                                |
| Timeout de leitura no PG                               | 5 s por consulta                                                            | 3 tentativas com recuo, depois `end(source_unavailable)`                         |
| Prazo de fechamento do servidor (`CLOSE_GRACE_MS`)     | 5 s                                                                         | fecha à força                                                                    |

Todos configuráveis pelo anfitrião, com piso e teto validados (valor inválido derruba a partida, como a 0293). O `AbortSignal` da conexão fechada é repassado a toda leitura. Os valores são iniciais, a medir na fatia 3.

## 7. Matriz de erros

**Antes dos cabeçalhos (status HTTP):**

| Situação                                                       | Resposta                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| Sem identidade / papel sem permissão                           | `401` / `403` (como as outras rotas)                                |
| `HEAD`                                                         | `405` com `Allow: GET`                                              |
| `sessionId` inválido (tamanho, NUL)                            | `400`                                                               |
| `after` ou `maxEvents` mal formados; `after` ≠ `Last-Event-ID` | `400`                                                               |
| Sessão ausente **ou de outro tenant**                          | `404`, mensagem e forma idênticas                                   |
| Posição além do fim (A6)                                       | `409 cursor_ahead`                                                  |
| Reconexão no cursor de um fim permanente (§5.2)                | `204`                                                               |
| Limite de conexões                                             | `429` / `503 Retry-After`                                           |
| Fonte indisponível na pré-verificação                          | `503 Retry-After` (nunca `404`)                                     |
| Porta de sessões não composta                                  | `404` fixo, o mesmo de uma rota inexistente (D7), sem tocar o banco |

**Depois dos cabeçalhos:** só `event: end` com a razão do §5.2 e fechamento. O status não muda. Cancelamento do cliente (fechar a conexão) é silencioso, libera a vaga e nunca vira `source_unavailable`.

## 8. Relação com outros cartões

- **0295 (consulta):** a listagem encontra a sessão e o rastreio aponta `{sessionId, sequence}`; o A01 acompanha **uma** sessão a partir de uma sequência (ex.: a de um elo do rastreio). Compartilham o registro de stores por tenant e o estilo de matriz de erros; nada de cursor comum (a 0295 pagina entre sessões, o A01 dentro de uma).
- **S02/0292 (projeções):** o cliente pode obter o estado atual pela projeção e abrir o stream em `throughSequence`; o A01 não depende da S02 (lê pela porta incremental) mas ganha com o checkpoint se um dia o tail precisar da projeção.
- **A02 (controle ao vivo):** pausa, retomada e troca de modo precisam virar **eventos do log** (catálogo v2, 0203); só então o stream os mostra. O A01 não inventa tipos.
- **A03 (contrato gerado):** a rota e o esquema de `session.event`/`end` entram no descritor gerado; CI quebra se divergirem.
- **A05 (push no SDK):** reusa o núcleo `SessionEventTail` com notificações JSON-RPC; o cursor é o mesmo.
- **M01:** os deltas continuam internos (D2).

## 9. Provas

RED (`aud0625-par-a01-red.test.ts`): controles C1 (nenhuma rota hoje) e C2 (o log só tem fatos confirmados); testemunhas por `inject` RED-1 a RED-6 (stream com `id` = sequência, retomada sem perda nem repetição, tenant alheio = ausente, lacuna encerra, cursores conflitantes ou além do fim, sem `input`) e, na R1, testemunhas com **listener real e cliente que lê por pedaços** (RED-7 a RED-9: cancelar libera a vaga, `app.close()` com stream aberto, `HEAD`). O `inject` espera o fim da resposta e só alcança `maxEvents`; A3, A9, A10 e A13 pedem listener real. A porta entra na composição pela opção nova `sessionEventStreams` do `buildServer` (`{ pool, schemaName, ... }`), que o RED passa por cast até existir. Pares discriminantes para a BUILD:

| Risco    | Par discriminante                                                                                                                                                                                                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1       | evento de transação sem COMMIT não aparece; depois do COMMIT aparece uma vez; escritor que cai no meio não deixa evento                                                                                                                                                                                                                                |
| A2       | lacuna `[1,2,4]` encerra em 2 com `sequence_gap`; sequência duplicada `[1,2,2]` idem; a fonte fora de ordem idem. PG: **os dois escritores** (S01 e store 0028), concorrentes na mesma sessão, nunca confirmam `n+1` antes de `n`; leitor concorrente nunca vê `n+1` sem `n`                                                                           |
| A3       | cortar a conexão após cada quadro (listener real): a soma das sequências em N reconexões é `1..M` sem repetir                                                                                                                                                                                                                                          |
| A4       | dois tenants assinando a mesma `sessionId` ao mesmo tempo: nenhum vê evento do outro; o store é criado por requisição com o tenant da identidade (33 tenants ativos, todos abrem)                                                                                                                                                                      |
| A5/A6/A7 | `after` além do fim ⇒ 409; `after=0` e cabeçalho `0` ⇒ iguais; `after=1` e cabeçalho `2` ⇒ 400                                                                                                                                                                                                                                                         |
| A8/A9    | 500 tentativas de conexão: 200 entram, o resto leva 429/503; um evento de 1 MiB: o quadro sai com `payloadOmitted`, o pico de bytes em voo observado fica ≤ `TAIL_READ_CONCURRENCY × 10 MiB`, nunca mais de 8 leituras simultâneas; cliente que não lê: nenhuma leitura além de uma página enquanto não drena e `slow_consumer` no prazo               |
| A10      | armazenamento de sessões **real ou dublê que remove o registro**: o stream encerra com `session_revoked` em ≤ `REVALIDATE_MS`; repetir a leitura do cache por requisição NÃO encerra (mutante: revalidar lendo o `WeakMap` sobrevive e é o que o teste mata); armazenamento indisponível ⇒ nova tentativa e `source_unavailable`, nunca "ainda válido" |
| A11      | `tool/call` com `input` sensível ausente do quadro; evento com campo extra e de tipo novo nunca vazam; `message/*` sem texto; quadro grande ⇒ `payloadOmitted` com a sequência preservada                                                                                                                                                              |
| A13      | `listen` real com 3 streams abertos: `app.close()` termina em ≤ `CLOSE_GRACE_MS` e os três recebem `end(server_closing)`; N fechamentos aleatórios (fim, cancelamento, erro, lentidão, revogação) deixam o contador de vagas em zero                                                                                                                   |
| P3       | `HEAD` ⇒ 405; cabeçalhos de segurança presentes na resposta do stream; fim permanente seguido de reconexão no mesmo cursor ⇒ 204; a latência do stream não entra no histograma da rota (mede-se o tempo até o primeiro quadro)                                                                                                                         |

## 10. Decisões T3 (recomendação em negrito)

| ID  | Decisão                    | Opções                                                                                                                                                                                                                                                | Recomendação                                                                                                                                                                                              |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Transporte                 | (a) SSE; (b) WebSocket                                                                                                                                                                                                                                | **(a)**                                                                                                                                                                                                   |
| D2  | Deltas de token (M01)      | (a) fora; (b) canal efêmero sem `id`                                                                                                                                                                                                                  | **(a)** agora; (b) em cartão próprio                                                                                                                                                                      |
| D3  | O que o quadro mostra      | (a) projeção em lista branca por campo, negando por padrão; (b) evento bruto                                                                                                                                                                          | **(a)**; na v1 o **texto de mensagem não sai** (sem permissão de conteúdo), tipo desconhecido sai só com o envelope                                                                                       |
| D4  | Como esperar eventos novos | (a) releitura de uma página (10) com recuo e jitter, atrás do semáforo e do pool próprios; (b) um leitor compartilhado por sessão com fan-out; (c) LISTEN/NOTIFY                                                                                      | **(a)** na v1. **Critério numérico para passar a (b)/(c):** com 100 conexões ociosas, a utilização do semáforo de leituras acima de 50% ou a espera p95 por permissão acima de 250 ms, medidas na fatia 3 |
| D5  | Posição além do fim        | (a) `409 cursor_ahead`; (b) esperar                                                                                                                                                                                                                   | **(a)**                                                                                                                                                                                                   |
| D6  | Stores por tenant          | (a) **por requisição**, sobre o pool próprio do tail; (b) registro com LRU; (c) pool por tenant                                                                                                                                                       | **(a)** (o store não tem estado; sem recusa de tenant)                                                                                                                                                    |
| D7  | Composição ausente         | (a) `404` fixo, igual ao de rota inexistente; (b) `501`                                                                                                                                                                                               | **(a)**                                                                                                                                                                                                   |
| D8  | Permissão                  | (a) reusar a de leitura de conversa para o envelope; (b) permissão nova de conteúdo                                                                                                                                                                   | **(a)** agora; (b) só quando existir, e só então texto de mensagem                                                                                                                                        |
| D9  | Orçamentos                 | tabela do §6                                                                                                                                                                                                                                          | **Aprovar como valores iniciais**, com os derivados de memória do §6 e medição na fatia 3                                                                                                                 |
| D10 | Fatias de BUILD            | 0 extrair a revalidação de sessão do gancho e prová-la sozinha (A10); 1 núcleo puro + memória; 2 PG (ordem de commit nos dois escritores, pool e semáforo); 3 rota SSE + orçamentos + revalidação + encerramento + métricas; 4 cliente/SDK (A05) fora | **0 → 1 → 2 → 3**                                                                                                                                                                                         |

Fora do escopo: WebSocket, uplink no canal, deltas de token, tipos de evento novos (A02), busca (S06), qualquer escrita, cliente web (G5).

## 11. Riscos aceitos

A leitura é por polling com recuo, então há latência de até `POLL_MAX_MS` entre o commit e o quadro. Papel revogado lê por até `REVALIDATE_MS`. O recorte de conteúdo (D3) deixa o chat sem texto na v1. A garantia de ordem de commit por sessão é lida do código e precisa da prova em PG da fatia 2 com os dois escritores. Proxies que armazenam resposta em buffer quebram a latência, não a correção. Cada leitura de página custa sete idas ao banco: o critério da D4 mede se isso basta. Estados de reconexão permanentes dependem da memória do servidor (1000 entradas, 5 min); um reinício a esquece e o cliente tenta uma vez mais.
