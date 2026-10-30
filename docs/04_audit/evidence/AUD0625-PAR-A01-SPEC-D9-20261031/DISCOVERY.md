# DISCOVERY — PAR-A01 stream de eventos na API com cursor (D9, 31/10/2026)

Task `AUD0625-PAR-A01-SPEC-D9-20261031`. Base: `claude/aud0625-par-s05-d9` @ `74623ba06` (onda 5 `9a8ab4c7a` + SPEC 0295 R1). Só leitura de código. RED: `apps/api/src/__tests__/aud0625-par-a01-red.test.ts` (2 controles verdes e 6 `it.fails`). Nenhum PG, nenhum processo da API foi iniciado.

## 1. O que existe hoje para eventos de sessão e de turno

| Peça | Onde | Fato | Lacuna para o A01 |
|---|---|---|---|
| Rotas HTTP | `apps/api/src/server.ts` (`/v1/executions`, `/v1/tasks`, `/v1/approvals`, `/v1/webhooks/...`, `/v1/admin/...`) | Só request/response. Nenhum `text/event-stream`, `EventSource`, WebSocket, `reply.hijack` ou `raw.write` em `apps/` ou `packages/` fora de testes | Não há canal de eventos |
| Leitura de eventos | `session.events` do SDK (`packages/sdk/src/server.ts`) | `afterSequence >= 0`, `limit` 1..500, tenant da composição, sessão alheia ou ausente = `session_not_found`; só no SDK, não há rota equivalente na API | Polling, sem ordem de entrega nem fim |
| Porta de leitura | `SessionEventStore.read({tenantId, sessionId, afterSequence, limit})` e `PostgresSessionEventStore` (`session-events.ts`, 0028) | Já é leitura **incremental**: `WHERE sequence > $after ORDER BY sequence LIMIT $limit`, uma validação por linha, uma transação curta. Instância **presa a um tenant** (`#bound`) | O tenant fixo da instância; o API é multi-tenant por requisição |
| Leitura do S01 | `SessionHandle.read` (`session-persistence.ts`, `#readSlice`) | `REPEATABLE READ`, valida **o prefixo inteiro** a cada leitura (O(N); medido na 0292: ~85 µs/evento, 1,7 s para 20 mil eventos) | Inviável para acompanhar uma sessão longa; o A01 lê pela porta incremental ou pelo checkpoint da S02 |
| Ordem de commit | `#appendNow`, `SELECT … FOR UPDATE`/lock de escritor + `next_sequence` na mesma transação | Dentro de **uma** sessão a sequência é atribuída sob lock do stream e o escritor seguinte só entra depois do COMMIT; leitor só vê o confirmado. Sequência densa e sem inversão de commit (a conferir em PG na fatia 2) | Diferente da 0295 (listagem entre sessões, onde `writer_lock_id` não segue o commit) |
| Catálogo de eventos | `session-event-schemas.v1.json` | 9 tipos: `turn/start|end`, `model/request|result`, `tool/call|result`, `message/user|assistant`, `context/compacted`. Sem delta de token, sem pausa/retomada/modo (pino no RED) | O A02 precisa de tipos novos (catálogo v2); o A01 só lê o que existe |
| Streaming do gateway (M01) | SPEC 0284 | **Só interno**: o chamador de `generate` recebe um `ModelResult`; "deltas expostos ficam para o PAR-A01" (decisão D1 do recibo 14) | O que o A01 faz com os deltas é decisão aberta (D2 desta SPEC) |
| Identidade | `requireIdentity`, `resolveDataPlaneTenant` (`server.ts`) | Tenant vem da identidade do operador (cabeçalho só confirma); `NODE_ENV!=='test'` exige tenant confiável. 51 das 71 rotas protegidas por papel **não** consultam o principal atual (resíduo 0254, citado na 0262) | Um stream de longa duração prolonga a janela em que um papel revogado continua lendo |
| Servidor | `Fastify({ bodyLimit, routerOptions })`; `onClose` na linha 6094 | Sem `connectionTimeout`, `requestTimeout` nem `forceCloseConnections` explícitos; sem registro de conexões abertas | `app.close()` espera respostas ativas; o stream precisa se encerrar sozinho |
| Limite de taxa | `rate-limit.ts` (por requisição) | Limita início de requisição, não conexões simultâneas nem bytes | Falta limite de conexões abertas |
| Cliente web | `WEB-01` (G5): REST com cliente resiliente, sem push | — | Consome o A01 |

## 2. O que o cartão e as capacidades pedem

- **0380, PAR-A01** (F3, P0, G, T3): "canal de eventos por sessão (SSE ou WebSocket) com cursor de retomada, cancelamento, backpressure e RLS". Aceite: dois tenants assinando ao mesmo tempo não veem eventos um do outro; queda e reconexão não perdem nem duplicam evento. Depende de S01 e M01. Absorve P100-040 e P100-041.
- **PAR-CAP:** API-02 (streams multiplexados com uplink, meio-fechamento, cancelamento e limite de caixa de entrada; hoje AUSENTE), API-03 (reconexão e eventos do Host encaminhados ao cliente; hoje AUSENTE), WEB-01 (entrega de eventos ao vivo com reconexão; hoje PARCIAL). SDK-01 (notificações push) depende do mesmo canal e é o A05.
- G4/G5 marcam streaming e reconexão como "maior risco de efeito duplicado e de vazamento entre tenants; exigem cursor, idempotência e RLS no canal desde o desenho".

## 3. Lições da revisão da 0295 que valem aqui

1. **Chave × ordem de commit:** aqui a chave (sequência da sessão) segue o commit; ainda assim a SPEC prova em PG, não presume.
2. **Cursor sem MAC:** o cursor é um número que o cliente pode escolher dentro da própria sessão, então não há o que "autenticar"; define-se o que uma posição arbitrária causa (reler histórico já autorizado, ou `409` se for além do fim).
3. **Orçamentos globais:** conexões, bytes, eventos e prazo por conexão, por operador, por tenant e global; nada de "janela" que não limita trabalho.
4. **Matriz de erros:** o que acontece **antes** dos cabeçalhos (status HTTP) e **depois** (só em banda) são dois contratos distintos.
5. **Fonte de verdade:** o log do S01; nada que não esteja confirmado é emitido.

## 4. Riscos que moldam a SPEC

1. Vazamento entre tenants por cache compartilhado de leitura ou por instância de store presa ao tenant errado.
2. Evento perdido ou repetido na reconexão; evento fora de ordem; lacuna silenciosa.
3. Cliente lento prendendo memória do servidor; muitos streams abertos esgotando o pool de leitura.
4. Papel revogado ou sessão expirada continuando a receber eventos.
5. Payload sensível (texto de mensagem, entrada de ferramenta) saindo para um navegador.
6. Encerramento do servidor travado por conexões longas; proxies que armazenam resposta em buffer.
7. Deltas de token (M01) tratados como eventos duráveis: não são reproduzíveis, quebrariam "sem perda nem duplicação".
