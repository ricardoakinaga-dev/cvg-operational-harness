# SPEC0295 — Consulta de sessões com rastreio (PAR-S05)

R0, 30/10/2026. Task `AUD0625-PAR-S05-SPEC-D9-20261030` (Claude Sonnet 5.5, D9), cartão PAR-S05 ([0380](../03_build/0380_backlog_paridade_100_deepseek.md); F2, P1, M, T3; depende do PAR-S01), capacidades PAR-CAP QUERY-01 e QUERY-02. Estado `PROPOSED_FOR_HUMAN_T3_REVIEW`: não há BUILD, não há aceite e nada aqui libera produção.

Evidência: [DISCOVERY](../04_audit/evidence/AUD0625-PAR-S05-SPEC-D9-20261030/DISCOVERY.md) e o RED `packages/sdk/src/__tests__/aud0625-par-s05-red.test.ts` (4 controles verdes, 4 testemunhas `it.fails`).

## 1. Problema

1. Só se lê o log de uma sessão cujo id já se conhece (`session.events`). Não há listagem, filtro, cursor de listagem nem forma de achar sessões.
2. Não há como responder "esta aprovação virou qual efeito, em qual sessão, em qual evento?". Os eventos não trazem `approvalId`; o elo é `operationKey`, e ele cruza dois esquemas de banco.
3. O contrato `SessionPersistence` declara "stat/list deferred". Qualquer listagem nova é a primeira superfície capaz de vazar tenant em massa.

## 2. Invariantes

Q1. **Tenant sempre da composição.** Nenhum parâmetro de requisição escolhe o tenant. A listagem de outro tenant é vazia; leitura ou rastreio de id de outro tenant é `not_found` (igual a inexistente). Nenhuma resposta traz contagem total, existência ou ordem de sessões de outro tenant.

Q2. **Somente leitura e derivada.** A consulta não escreve, não abre escritor, não toma lock de dono e não altera o log. Falha da consulta não afeta turno nem escritor.

Q3. **Cursor estável e vinculado.** A listagem usa chave de ordenação única e monotônica (`writer_lock_id`, decrescente), nunca offset. O cursor é opaco, carrega versão, digest do tenant e digest do filtro; cursor de outro filtro/tenant, adulterado ou de versão desconhecida é `invalid_params`, nunca recomeço silencioso.

Q4. **Limites duros.** `limit` 1..100 na listagem (500 na leitura, como hoje); filtros com no máximo `EXAMINE_CAP` linhas examinadas por página; ao atingir o teto devolve a página (pode ser menor) com cursor e `scanTruncated: true`, nunca varredura ilimitada.

Q5. **Só metadados na listagem.** Cada item: `sessionId`, `createdAt`, `isSeeded`, `parentSession?`, `origin?`, `agentPreset?`, `inheritedEventCount`. Sem texto de mensagem, sem entrada/saída de ferramenta, sem payload.

Q6. **Rastreio cita, não despeja.** Cada elo do rastreio é uma referência verificável `{kind, id, sessionId?, sequence?, eventId?}` mais fatos mínimos já presentes no registro (tipo do evento, `correlationId`, `toolId`, `outcome`, estado do efeito). Nunca `payload.input` nem texto.

Q7. **Lacuna explícita.** O rastreio nunca infere elo que o log e os registros não provam. Cada elo ausente vira uma entrada em `gaps` com razão tipada (§5). Ausência de evidência não é prova de ausência: `gaps` vazio só ocorre quando todos os elos foram encontrados.

Q8. **Limitado.** Um rastreio devolve no máximo `TRACE_LINK_CAP` (100) elos; excedente → `truncated: true`.

Q9. **Nada concede autoridade.** Listar ou rastrear não autoriza retomar, aprovar, delegar nem executar. Aprovar continua exclusivo do motor de aprovações.

Q10. **Uma lógica de turnos.** Qualquer fato de turno vem de `analyzeSessionLog` (S04); o S05 não cria segunda análise.

## 3. Porta e protocolo

`packages/contracts` (novo `session-query.ts`):

```ts
interface SessionListFilter {
  parentSession?: string
  origin?: 'subagent'
  agentPreset?: string
  isSeeded?: boolean
  createdAfter?: number
  createdBefore?: number
}
interface SessionSummary {
  sessionId
  createdAt
  isSeeded
  parentSession?
  origin?
  agentPreset?
  inheritedEventCount
}
interface SessionQuery {
  list(input: {
    filter?: SessionListFilter
    cursor?: string
    limit?: number
    signal?: AbortSignal
  }): Promise<{
    items: readonly SessionSummary[]
    nextCursor: string | null
    scanTruncated: boolean
  }>
  trace(input: {
    approvalId?: string
    operationKey?: string
    signal?: AbortSignal
  }): Promise<SessionTrace>
}
type SessionTrace = {
  root
  links: readonly TraceLink[]
  gaps: readonly TraceGap[]
  truncated: boolean
}
```

SDK (`packages/sdk`): métodos aditivos `session.list` e `session.trace`; `SDK_PROTOCOL_VERSION` continua 1 (decisão D7). `sdk.hello` anuncia os métodos só quando a composição tem a porta; sem porta, `capability_not_available`. Os parâmetros são validados como os de `session.events` (tipos, tamanhos, `\u0000`, chaves desconhecidas recusadas).

## 4. Listagem (PostgreSQL)

Implementada em `packages/persistence` sobre `session_streams` (0034), com o mesmo pool de leitura e o `cvg.tenant_id` da composição; sem migração nova na v1 (D1).

- Ordem: `writer_lock_id DESC`; cursor = último `writer_lock_id` visto. Sessão criada depois do início da paginação aparece na primeira página, nunca duplica nem pula uma já vista.
- Filtros por campo do `header_json` (cast `::jsonb`) dentro do tenant (RLS), com `EXAMINE_CAP` (1000) linhas por página (Q4).
- `statement_timeout` e `lock_timeout` de 5 s por transação de leitura, como o resto do adaptador; `READ ONLY`.
- Streams com `header_json` nulo (legado não adotado) não são listados: são omitidos e contados em `skippedUnadopted` (inteiro, só do próprio tenant), para não inventar metadado (D3).

## 5. Rastreio

Raízes aceitas: `approvalId` ou `operationKey` (exatamente uma). Algoritmo, uma volta em cada direção:

1. Aprovação (`ApprovalReadPort.get(tenant, id)`) → `operationKey`, `executionRef`, `status`, `origin?` (0291).
2. Efeito (`EffectJournalReadPort.get(tenant, operationKey)`) → `state`, `executionRef`, `resultDigest`.
3. Evento de origem: `tool/call` com `payload.operationKey` igual, procurado primeiro na sessão de `origin.sessionId` (quando existe), depois nas sessões que a consulta devolver até o teto; `tool/result` pareado por `correlationId`+`toolId`; `turn/end` do mesmo `correlationId` (mostra `APPROVAL_REQUIRED` etc.).

`TraceGap.reason`: `approval_not_found`, `effect_absent`, `origin_unbound` (aprovação legada sem origem), `event_not_found`, `tool_result_ambiguous` (mesmo `toolId` repetido no turno), `session_scan_capped`, `source_unavailable` (porta falhou: a falha é lacuna, não erro do rastreio inteiro).

A leitura cruza dois esquemas e não é um snapshot atômico; a resposta traz `observedAt` de cada fonte. Um efeito que muda entre as leituras aparece com o estado da leitura, não é reconciliado.

## 6. Fatias de BUILD (depois do aceite desta SPEC)

1. Contratos, cursor/filtro puros, rastreio puro sobre portas, implementação em memória. Testes e mutantes.
2. `PostgresSessionQuery.list` (keyset, RLS, teto, timeouts), teste PG com dois tenants e paginação sob criação concorrente.
3. Portas de leitura de aprovação/diário e `trace` ponta a ponta (PG), incluindo lacunas.
4. Métodos SDK, `sdk.hello`, validação, stdio, documentação e entrada no catálogo de capacidades.

Cada fatia: typecheck, eslint, prettier, links, `skip:governance`, cobertura 100% por arquivo nos pacotes harness/contracts, mutantes, revisão não autora.

## 7. Provas

RED atual (`aud0625-par-s05-red.test.ts`): C1 limites de `session.events`; C2 sessão de outro tenant = `session_not_found`; C3 pino do catálogo (sem `approvalId`, `tool/result` sem `operationKey`); C4 vocabulário atual de métodos; RED-1 listagem do tenant; RED-2 cursor forjado; RED-3 rastreio de aprovação; RED-4 sem porta = `capability_not_available`. Provas a escrever no BUILD: dois tenants lado a lado (listagem vazia, `not_found`, nenhum total); cursor reutilizado em outro filtro/tenant; criação concorrente durante a paginação; teto de varredura; rastreio com cada `gap`; `payload.input` ausente em toda resposta; consulta não toma lock de escritor.

## 8. Decisões T3 (recomendação em negrito)

| ID  | Decisão                                        | Opções                                                                                                                             | Recomendação                                                                           |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| D1  | Chave de ordem e filtros da listagem           | (a) `writer_lock_id` + filtros no `header_json` com teto; (b) migração com coluna indexada de `createdAt`/`agentPreset`            | **(a)** na v1, sem migração; (b) só se o teto for atingido na prática (medir no BUILD) |
| D2  | O que a leitura/rastreio mostram               | (a) só metadados e referências, payload só por `session.events`; (b) payload mascarado nos elos                                    | **(a)**                                                                                |
| D3  | Streams sem `header_json` (legado não adotado) | (a) omitir e contar em `skippedUnadopted`; (b) listar com `createdAt` nulo                                                         | **(a)**                                                                                |
| D4  | Cursor                                         | (a) opaco, vinculado a tenant+filtro, sem assinatura; (b) HMAC com segredo do host                                                 | **(a)** (a RLS impede escalada; o vínculo evita confusão)                              |
| D5  | Raízes e profundidade do rastreio              | (a) aprovação ou `operationKey`, uma volta; (b) também evento→aprovação e sessão inteira                                           | **(a)**; (b) como follow-up                                                            |
| D6  | Elo `approvalId`/`operationKey` nos eventos    | (a) não mexer no catálogo v1, lacuna `tool_result_ambiguous`; (b) catálogo v2 com `operationKey` em `tool/result` (e `approvalId`) | **(a)** agora; (b) como cartão ligado à evolução de formato (0203/S07)                 |
| D7  | Protocolo SDK                                  | (a) aditivo no v1, anunciado em `sdk.hello`; (b) protocolo v2                                                                      | **(a)**                                                                                |
| D8  | Controle de acesso por papel                   | (a) host decide (SDK é só tenant); (b) papel no contrato da consulta                                                               | **(a)** agora; papel entra no S06 (busca), que o cartão já exige                       |

Fora do escopo: busca textual (S06), projeções (S02), export/import (S07), retenção, seleção por nome (C100-S01), qualquer escrita.

## 9. Riscos aceitos

Leitura entre dois esquemas não é atômica; o filtro por `header_json` pode ser lento em tenants com muitas sessões (mitigado pelo teto e por D1-b); sem `approvalId` no log, o rastreio de aprovações legadas sem origem termina em lacuna.
