# SPEC0296 — Stream de eventos de sessão na API com cursor (PAR-A01)

R0, 31/10/2026. Task `AUD0625-PAR-A01-SPEC-D9-20261031` (Claude Sonnet 5.5, D9), cartão PAR-A01 ([0380](../03_build/0380_backlog_paridade_100_deepseek.md); F3, P0, G, T3; depende de PAR-S01 e PAR-M01), capacidades PAR-CAP API-02, API-03 e WEB-01. Estado `PROPOSED_FOR_NON_AUTHOR_REVIEW_AND_HUMAN_T3`: não há BUILD, não há aceite e nada aqui libera produção.

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

A4. **Tenant sempre da identidade.** O tenant vem da identidade do operador (`resolveDataPlaneTenant`); o cabeçalho `x-tenant-id` não escolhe. Sessão de outro tenant e sessão inexistente produzem a mesma resposta (§7), byte a byte exceto o eco do id. Nenhum cache, buffer ou leitor é compartilhado entre tenants.

A5. **O cursor é uma posição, não uma capacidade.** O cliente pode escolher qualquer posição **dentro de uma sessão que já pode ler**; isso só decide de onde reler histórico que ele já está autorizado a ver. Não há cursor opaco nem MAC: não há nada a forjar além da posição. Posição **além do fim** é `409 cursor_ahead` (A6); nunca espera silenciosa nem recomeço.

A6. **Pré-verificação do cursor.** Antes dos cabeçalhos, o servidor lê o evento `after` (`afterSequence = after-1`, `limit = 1`): ele existe com sequência igual a `after`, ou `after = 0`. Senão `409 cursor_ahead`. A mesma leitura confirma densidade no ponto de retomada.

A7. **Dois cursores diferentes são inválidos.** `?after=` e `Last-Event-ID` presentes com valores diferentes ⇒ `400`. Iguais ou só um deles ⇒ vale o presente. Sem nenhum ⇒ `after = 0` (início do log).

A8. **Orçamentos duros** (§6) por conexão, por operador, por tenant e global. Nenhum é vendido como limite de IO físico do PostgreSQL; o limite é do trabalho que a aplicação aceita fazer.

A9. **Backpressure pelo consumidor.** O servidor lê da fonte **no ritmo em que o cliente consome**: sem copiar eventos para uma fila ilimitada. Escrita que não drena no prazo encerra a conexão com `slow_consumer`.

A10. **Revalidação e vida curta.** A identidade é revalidada a cada `REVALIDATE_MS`; revogação, expiração ou perda de papel encerra com `session_revoked`. Toda conexão tem vida máxima `MAX_LIFETIME_MS`, depois do qual o servidor encerra com `lifetime` e o cliente retoma pelo cursor.

A11. **Só projeção segura sai.** O quadro de cada evento é uma projeção em lista branca (§5.2), nunca o registro bruto; `input` de ferramenta e erros brutos nunca saem. Um evento cuja projeção passa de `MAX_FRAME_BYTES` sai com `payloadOmitted: true`, mantendo a sequência (nunca é pulado).

A12. **Somente leitura e sem autoridade.** O stream não escreve, não abre escritor, não toma lock de dono e não concede autoridade para aprovar, executar, retomar ou delegar. Sua falha não afeta o turno.

A13. **Encerramento do servidor é limpo.** No fechamento do app todo stream recebe `end(server_closing)` e é fechado dentro de `CLOSE_GRACE_MS`; nenhuma conexão impede o `close()`.

## 4. Leitura do log: núcleo independente do transporte

Módulo puro `SessionEventTail` em `packages/harness` (nome provisório), sem HTTP: dado `SessionEventStore` preso a um tenant, `sessionId`, `after`, `signal` e orçamentos, devolve `AsyncIterable<TailItem>` com `event | end(reason)`. Ele cuida de A2, A3, A6, A8, A9 e do fim; os adaptadores só traduzem:

- **SSE na API** (esta SPEC);
- **notificações JSON-RPC no SDK** (A05) com a mesma semântica de cursor;
- **cliente web** (WEB-01) consome o SSE.

Fonte: `SessionEventStore.read` (incremental, uma transação curta por página, `limit` ≤ 100). O S01 `SessionHandle.read` (prefixo inteiro a cada leitura) **não** é usado. A pré-verificação do A6 e cada página validam `sequence === esperada`.

**Tenant × instância do store.** O `PostgresSessionEventStore` é preso a um tenant na construção. A API é multi-tenant por requisição, então a composição mantém um **registro limitado de stores por tenant** (criação sob demanda, no máximo `MAX_TENANT_STORES`, fechamento por ociosidade). Nunca uma instância compartilhada entre tenants (A4). Detalhe de pool em D6.

**Espera por novos eventos.** Quando a página volta vazia, o tail espera `POLL_MIN_MS` crescendo até `POLL_MAX_MS` (com jitter) e relê; novo evento reinicia o intervalo mínimo. É uma leitura de uma página, nunca uma varredura. Alternativas em D4 (LISTEN/NOTIFY exigiria migração e trigger).

## 5. Protocolo SSE

### 5.1 Requisição

`GET /v1/sessions/:sessionId/events/stream` com `?after=<inteiro ≥ 0>` (opcional) e `?maxEvents=<1..MAX_EVENTS>` (opcional; encerra com `max_events`, para catch-up limitado e testes). Cabeçalho `Last-Event-ID` conforme A7. Autenticação: cookie de sessão do operador ou os mecanismos já aceitos pelas rotas de dados; permissão de leitura de conversa/sessão (D8). `GET` não altera estado; sem corpo.

### 5.2 Resposta

Cabeçalhos: `200`, `content-type: text/event-stream; charset=utf-8`, `cache-control: no-store`, `x-accel-buffering: no`, sem compressão, mais os de segurança já aplicados pelas rotas. Quadros:

```
id: <sequence>
event: session.event
data: {"sequence":N,"eventId":"…","type":"tool/call","timestamp":"…","correlationId":"…","traceId":"…","payload":{…projeção…},"payloadOmitted"?:true}

: hb                                   (comentário a cada HEARTBEAT_MS, sem id)

event: end
data: {"reason":"<razão>","lastSequence":N}
```

Razões de `end`: `max_events`, `lifetime`, `session_revoked`, `server_closing`, `slow_consumer`, `sequence_gap`, `source_unavailable`, `corrupt_event`. `end` não tem `id:` (não é um evento do log, e o `Last-Event-ID` do cliente continua sendo o último evento).

Projeção por tipo (lista branca; D3): envelope sempre; `turn/start|end`: `correlationId`, `stopReason?`; `tool/call`: `toolId`, `operationKey` (sem `input`); `tool/result`: `toolId`, `outcome`; `model/request|result`: contadores e `outcome`, sem texto; `message/user|assistant`: `role` e **texto só para papéis com permissão de leitura de conteúdo** (D3); `context/compacted`: `strategy`, `throughSequence` (sem resumo).

## 6. Orçamentos (A8)

| Orçamento                      | Valor inicial                   | Ao atingir                                               |
| ------------------------------ | ------------------------------- | -------------------------------------------------------- |
| Conexões por operador          | 5                               | `429` antes dos cabeçalhos (`too_many_streams`)          |
| Conexões por tenant            | 50                              | `429`                                                    |
| Conexões globais               | 500                             | `503` com `Retry-After`                                  |
| Vida máxima da conexão         | 15 min                          | `end(lifetime)`                                          |
| Eventos por conexão            | 50 000                          | `end(max_events)`                                        |
| Página de leitura              | 100 eventos                     | —                                                        |
| Bytes por quadro               | 256 KiB                         | `payloadOmitted`                                         |
| Fila de escrita pendente       | 1 página (100 eventos ou 1 MiB) | espera `drain` até 15 s, depois `end(slow_consumer)`     |
| Heartbeat                      | 15 s                            | —                                                        |
| Revalidação da identidade      | 60 s                            | `end(session_revoked)`                                   |
| Intervalo de espera sem evento | 250 ms → 2 s, com jitter        | —                                                        |
| Timeout de leitura no PG       | 5 s por consulta                | 3 tentativas com recuo, depois `end(source_unavailable)` |
| Registro de stores por tenant  | 32                              | recusa a nova criação com `503`                          |

Todos configuráveis pelo anfitrião, com piso e teto validados (valor inválido derruba a partida, como a 0293). O `AbortSignal` da conexão fechada é repassado a toda leitura.

## 7. Matriz de erros

**Antes dos cabeçalhos (status HTTP):**

| Situação                                                       | Resposta                                    |
| -------------------------------------------------------------- | ------------------------------------------- |
| Sem identidade / papel sem permissão                           | `401` / `403` (como as outras rotas)        |
| `sessionId` inválido (tamanho, NUL)                            | `400`                                       |
| `after` ou `maxEvents` mal formados; `after` ≠ `Last-Event-ID` | `400`                                       |
| Sessão ausente **ou de outro tenant**                          | `404`, mensagem e forma idênticas           |
| Posição além do fim (A6)                                       | `409 cursor_ahead`                          |
| Limite de conexões                                             | `429` / `503 Retry-After`                   |
| Fonte indisponível na pré-verificação                          | `503 Retry-After` (nunca `404`)             |
| Porta de sessões não composta                                  | `501` ou `404` fixo (D7), sem tocar o banco |

**Depois dos cabeçalhos:** só `event: end` com a razão do §5.2 e fechamento. O status não muda. Cancelamento do cliente (fechar a conexão) é silencioso e libera os recursos; nunca vira `source_unavailable`.

## 8. Relação com outros cartões

- **0295 (consulta):** a listagem encontra a sessão e o rastreio aponta `{sessionId, sequence}`; o A01 acompanha **uma** sessão a partir de uma sequência (ex.: a de um elo do rastreio). Compartilham o registro de stores por tenant e o estilo de matriz de erros; nada de cursor comum (a 0295 pagina entre sessões, o A01 dentro de uma).
- **S02/0292 (projeções):** o cliente pode obter o estado atual pela projeção e abrir o stream em `throughSequence`; o A01 não depende da S02 (lê pela porta incremental) mas ganha com o checkpoint se um dia o tail precisar da projeção.
- **A02 (controle ao vivo):** pausa, retomada e troca de modo precisam virar **eventos do log** (catálogo v2, 0203); só então o stream os mostra. O A01 não inventa tipos.
- **A03 (contrato gerado):** a rota e o esquema de `session.event`/`end` entram no descritor gerado; CI quebra se divergirem.
- **A05 (push no SDK):** reusa o núcleo `SessionEventTail` com notificações JSON-RPC; o cursor é o mesmo.
- **M01:** os deltas continuam internos (D2).

## 9. Provas

RED atual (`aud0625-par-a01-red.test.ts`): C1 não há rota hoje; C2 o log só tem fatos confirmados, sem delta nem evento de controle; RED-1 stream com `id` = sequência; RED-2 retomada por `Last-Event-ID` sem perda nem repetição; RED-3 sessão alheia = ausente; RED-4 lacuna encerra sem emitir o evento posterior; RED-5 cursores diferentes e posição além do fim; RED-6 sem `input` de ferramenta. Hoje todos terminam em 404 (rota ausente), então provam ausência, não o algoritmo. Pares discriminantes para a BUILD:

| Risco           | Par discriminante                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1              | evento de transação sem COMMIT não aparece; depois do COMMIT aparece uma vez; escritor que cai no meio não deixa evento                            |
| A2              | lacuna `[1,2,4]` encerra em 2 com `sequence_gap`; sequência duplicada `[1,2,2]` idem; a fonte devolvendo fora de ordem idem                        |
| A3              | cortar a conexão após cada quadro: a soma das sequências recebidas em N reconexões é `1..M` sem repetir                                            |
| A4              | dois tenants assinando a mesma `sessionId` ao mesmo tempo: nenhum vê evento do outro; registro de stores com o limite atingido não troca de tenant |
| A5/A6/A7        | `after` além do fim ⇒ 409; `after=0` e cabeçalho `0` ⇒ iguais; `after=1` e cabeçalho `2` ⇒ 400                                                     |
| A9              | cliente que não lê: nenhuma leitura de fonte além de uma página enquanto não drena; fecha com `slow_consumer` no prazo                             |
| A10             | papel revogado no meio: `end(session_revoked)` em ≤ `REVALIDATE_MS`; vida máxima encerra                                                           |
| A11             | `tool/call` com `input` sensível: ausente do quadro; quadro grande ⇒ `payloadOmitted` com a sequência preservada                                   |
| A13             | `app.close()` com 3 streams abertos termina dentro de `CLOSE_GRACE_MS`                                                                             |
| Ordem de commit | PG: dois escritores na mesma sessão não conseguem confirmar fora de ordem; leitor concorrente nunca vê `n+1` sem `n`                               |

## 10. Decisões T3 (recomendação em negrito)

| ID  | Decisão                    | Opções                                                                                                                                                 | Recomendação                                                                                                                                                |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Transporte                 | (a) SSE (uma direção); (b) WebSocket (uplink e multiplexação)                                                                                          | **(a)**: cumpre o aceite, funciona com `EventSource`/`fetch`, retoma por `Last-Event-ID`; WebSocket só se o A02 provar que precisa de uplink no mesmo canal |
| D2  | Deltas de token (M01)      | (a) fora: só fatos confirmados; (b) canal efêmero `event: delta` sem `id`, não retomável                                                               | **(a)** agora; (b) em cartão próprio com kernel hook, declarando que não é reproduzível (não entra em "sem perda nem duplicação")                           |
| D3  | O que o quadro mostra      | (a) projeção em lista branca, texto de mensagem só com permissão de conteúdo; (b) evento bruto                                                         | **(a)**                                                                                                                                                     |
| D4  | Como esperar eventos novos | (a) releitura de uma página com recuo e jitter por conexão; (b) um leitor compartilhado por sessão com fan-out; (c) LISTEN/NOTIFY (migração e trigger) | **(a)** na v1, medindo custo no BUILD; (b)/(c) só se a medição exigir                                                                                       |
| D5  | Posição além do fim        | (a) `409 cursor_ahead`; (b) esperar o log chegar lá                                                                                                    | **(a)** (esperar esconderia cliente com cursor de outra sessão)                                                                                             |
| D6  | Stores por tenant          | (a) registro limitado de instâncias presas a tenant; (b) store que recebe o tenant por chamada (mudança no S01)                                        | **(a)** (sem tocar no S01); (b) como follow-up se o custo de pool pesar                                                                                     |
| D7  | Composição ausente         | (a) `404` fixo; (b) `501`                                                                                                                              | **(a)**: não revela configuração                                                                                                                            |
| D8  | Permissão                  | (a) reusar a de leitura de conversa; (b) permissão nova `sessions:read` e outra para conteúdo                                                          | **(a)** para o envelope e **(b)** só para o texto de mensagem (D3)                                                                                          |
| D9  | Orçamentos                 | tabela do §6                                                                                                                                           | **Aprovar como valores iniciais**, configuráveis, a medir                                                                                                   |
| D10 | Fatias de BUILD            | 1 núcleo puro + em memória; 2 PG (ordem de commit, registro de stores); 3 rota SSE + orçamentos + revalidação + encerramento; 4 cliente/SDK (A05) fora | **1 → 2 → 3**                                                                                                                                               |

Fora do escopo: WebSocket, uplink no canal, deltas de token, tipos de evento novos (A02), busca (S06), qualquer escrita, cliente web (G5).

## 11. Riscos aceitos

A leitura é por polling com recuo, então há latência de até `POLL_MAX_MS` entre o commit e o quadro. Papel revogado lê por até `REVALIDATE_MS`. O recorte de conteúdo (D3) depende de um papel de conteúdo ainda inexistente. A garantia de ordem de commit por sessão é lida do código e precisa da prova em PG da fatia 2. Proxies que armazenam resposta em buffer quebram a latência, não a correção.
