# DISCOVERY — PAR-S04, fork e retomada de sessão

Task `AUD0625-PAR-S04-SPEC-07-20261029` (Claude Sonnet 5.5, sessão 07), 29/10/2026, sobre `claude/aud0625-par-s01-07` @ `06e14cffa` (S01 fatias 1–7 aprovadas). Só leitura de código e docs; o mapa detalhado está em [MAP-NOTES.md](MAP-NOTES.md). Cartão: 0380 PAR-S04 (F2, P1, T3, depende do S01): "Fork semeado com turnos concluídos, sem herdar aprovações pendentes. Aceite: fork mantém tenant e linhagem; aprovação pendente do original não vale no fork."

## O que existe

| Fato | Onde | Consequência |
| --- | --- | --- |
| Sessão (log por tenant/sessão) e execução (spine, checkpoint, retomada por aprovação) são **dois modelos sem ligação**; nenhum id liga `sessionId` a `executionId`. | `execution-spine.ts`, `execution-v2.ts`, `kernel-runtime.ts` | "Retomada" de sessão e "retomada" de execução são coisas distintas; o S04 trata a da sessão e só declara o que não herda da execução. |
| O header já tem `parentSession`, `isSeeded`, `inheritedEventCount`; só o validador os toca. O corte pode exceder o corpo; nenhum evento artificial de header/corte; parent/origin/depth não concedem permissão. | `session/persistence.ts:128-162`, SPEC 0221 §3 | A fundação do fork existe como metadado; falta quem copie o prefixo, prove a linhagem e feche a janela de um seeded sem corpo. |
| Um turno é agrupado pelo `correlationId` do **envelope** (também em `message/user` e `message/assistant`, que não o repetem no payload). `turn/start`, `turn/end{stopReason}`; `message/assistant` só em `COMPLETED` (SDK, `server.ts:246-320`). Não existe helper de "turno concluído"; turno quebrado = `turn/start` sem `turn/end`. | `kernel-runtime.ts:261,651`, `sdk/src/server.ts` | O S04 precisa de uma análise pura do log (turnos concluídos, encerrados, abertos, contaminados). |
| `tool/call` sem `tool/result` (ou com `deadline`, `cancelled`, `threw`, `confirm_failed`) é efeito de resultado desconhecido; o journal de efeitos liga por `(tenant, operationKey)` com `operationKey = executionId:step:tool`, nunca por sessão. | `effect-journal*.ts`, `iterative-dispatch.ts:600-650` | Um fork que herdasse um turno incerto perderia a incerteza: o mesmo efeito, reemitido com outro `executionId`, teria outra chave. |
| Aprovações ligam a ação/recurso/hash/proposta/agente/política/capacidade; **não ligam sessão**. A pausa iterativa liga à execução (`pendingApprovalId`). | `approval-engine/engine.ts:1033-1110`, `iterative-dispatch.ts:195-203` | Uma aprovação concedida e não consumida valeria para a mesma ação em outra sessão do tenant se alguém tiver o `approvalId`. O fork não pode herdar, nem reutilizar, aprovação alguma. |
| O SDK não reproduz eventos: `session.open` só chama `openSession`; `turn.send` monta contexto vazio (`single_pass`). `sessionEventStoreForHandle` serve exatamente uma sessão. | `sdk/src/server.ts:187-330`, `session-persistence.ts:1149` | Um fork semeado não tem efeito sobre o que o modelo vê enquanto não houver reconstrução de contexto; o S04 entrega a persistência e a prova de linhagem, não a memória do modelo. |
| O `SessionEvent` é imutável e carrega `sessionId`; `eventId` e sequência são únicos **por sessão**; `input_digest` cobre o `sessionId`. | `session-events.ts`, migration 0028 | Copiar um prefixo exige reconstruir cada evento com o `sessionId` do filho (digest novo), podendo manter sequência, `eventId`, `correlationId`, `traceId`, `timestamp` e payload. |
| Uma sequência é uma sessão: o `writer_lock_id` é identity por stream, então cada fork já ganha chave de posse própria. | migration 0034 | Nada a fazer no lock; o fork não toma o lock do pai (lê um snapshot). |
| `context/compacted.throughSequence` referencia sequências anteriores. | `session/events.ts` | O fork preserva as sequências 1..N sem renumerar; senão a compactação herdada apontaria para o lugar errado. |

## Lacuna provada hoje (controle verde)

`create` aceita um header semeado com corte 3 e corpo vazio, e o primeiro `append` seria a sequência 1: nada impede que eventos próprios ocupem o intervalo "herdado". É o comportamento correto do S01 (corte nunca inferido), mas significa que **seeded não é prova de linhagem**; a prova tem de vir do fork.

## O que a DISCOVERY não encontrou

Nenhum código de fork, seed, branch ou helper de turno. Não há ponte entre sessão e execução, então "retomada" de sessão é só reabrir o log com o escritor e olhar o que ficou aberto.
