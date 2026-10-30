# DISCOVERY — PAR-S05 consulta de sessões com rastreio (D9, 30/10/2026)

Task `AUD0625-PAR-S05-SPEC-D9-20261030`. Base: onda 5 `9a8ab4c7a`. Só leitura de código; nenhuma prova de runtime além do RED
(`packages/sdk/src/__tests__/aud0625-par-s05-red.test.ts`, 4 controles verdes + 4 testemunhas `it.fails`).

## 1. O que existe hoje para listar e consultar sessões

| Peça | Onde | O que faz | Lacuna para o S05 |
|---|---|---|---|
| Leitura por stream | `SessionEventStore.read({tenantId, sessionId, afterSequence, limit})` (`contracts/session-events.ts`) | Eventos de UMA sessão, por sequência | Sem listagem, sem filtro por tipo/turno/correlação |
| Método SDK | `session.events` (`sdk/server.ts`, `handleSessionEvents`) | `afterSequence ≥ 0`, `limit` 1..500, tenant da composição; sessão inexistente ou de outro tenant → `session_not_found` | Só ele; `SDK_METHODS` tem 4 métodos |
| Serviço público | `SessionPersistence` (`contracts/session-persistence.ts`) | `create/open/fork/resumeSession` | O próprio contrato diz "stat/list deferred" |
| Metadados | `session_streams.header_json` (texto, ≤64 KiB) + `inherited_event_count` + `writer_lock_id` (identity única, monotônica) — migração 0034 | `createdAt`, `parentSession`, `origin`, `agentPreset`, `isSeeded` no JSON | Nada indexado além da PK `(tenant_id, session_id)`; `createdAt` está dentro de texto |
| Isolamento | RLS FORCE em `session_streams`/`session_events` por `cvg.tenant_id`; serviço ligado a UM tenant (`options.tenantId`) | Outro tenant não enxerga linhas | Listagem precisa herdar isso, sem contagem/total que vaze |
| Análise de turnos | `analyzeSessionLog` (S04, `TurnReport`) | Turnos, efeitos incertos, `inheritableThrough` | É por sessão, O(N) por chamada |
| Projeções | SPEC 0292 (S02, proposta) | Estado atual com cache de checkpoint | Ainda não existe; S05 não pode depender dela |

## 2. O que existe para rastrear aprovação → efeito → evento

- **Aprovação:** `runtime_approvals` (0015/0017) tem `operation_key`, `execution_ref`, `proposal_hash`, `status`; com a SPEC 0291 ganha
  `origin_conversation_id/origin_session_id` (aprovação → sessão onde foi pedida).
- **Efeito:** `effect_journal` PK `(tenant_id, operation_key)` com `state`, `execution_ref`, `result_digest`.
- **Evento:** `tool/call.payload.operationKey` existe; `tool/result` NÃO tem `operationKey` (só `correlationId` + `toolId`);
  **nenhum** evento do catálogo v1 tem `approvalId` (pinado no RED, teste "baseline pin"). `turn/end` pode ter parado em `APPROVAL_REQUIRED`.
- **Elo comum:** `operationKey` (aprovação ↔ efeito ↔ `tool/call`) e `correlationId+toolId` (`tool/call` ↔ `tool/result`).
- **Esquemas diferentes:** os eventos vivem em esquema dedicado (0028 recusa `conversations/sessions/messages` no mesmo esquema);
  aprovações e diário vivem no esquema padrão. Não há JOIN SQL nem snapshot atômico entre os dois; a composição precisa de duas portas
  com o mesmo tenant e aceitar leitura não atômica.
- **Ambiguidade conhecida:** o mesmo `toolId` duas vezes no mesmo turno torna `tool/result` ambíguo sem `operationKey`
  (pareamento só por ordem). O rastreio declara isso como lacuna, não adivinha.

## 3. Relação com outros cartões

- **S01** (feito): base de persistência/tenant. **S04**: reutilizar `analyzeSessionLog`, sem segunda lógica.
- **S02/0292:** projeções são a leitura rápida de "estado"; o S05 lista e navega. A listagem pode, no máximo, *anexar* um resumo de
  projeção quando existir; v1 do S05 não exige.
- **S06** (busca textual) depende dos filtros e do cursor do S05; **T09** (registro de workspaces e sessões por tenant) usa a listagem;
  **O08/O09** (goal, todos) leem por esta porta.
- **PAR-CAP:** QUERY-01 (listar, filtrar, ler com cursor; "leituras preferem sessão viva e devolvem cópias" no DeepSeek) e QUERY-02
  (rastrear relações com contexto limitado por evento). QUERY-03 fica no S06. Absorve P100-020.
- **F14 mínimo:** o S05 é paridade, não continuidade (SCOPE 07: "fora do mínimo" salvo se o rastreio for exigido).

## 4. Riscos que moldam a SPEC

1. Listagem é o primeiro ponto onde um erro de RLS/tenant vira vazamento em massa (contagem, existência, ordem).
2. Cursor por offset repete/pula linhas com sessões novas; precisa de chave estável (`writer_lock_id`).
3. Filtro por campo do `header_json` sem índice é varredura do tenant; precisa de teto.
4. Eventos carregam texto de mensagens e entradas de ferramenta (PII potencial): leitura e rastreio não podem despejar payload por padrão.
5. Rastreio cruza esquemas e pode terminar em lacuna; fingir completude seria o erro.
6. "Sessão viva" (escritor aberto) vs. log: a leitura do log é a única verdade; nenhuma cópia em memória.
