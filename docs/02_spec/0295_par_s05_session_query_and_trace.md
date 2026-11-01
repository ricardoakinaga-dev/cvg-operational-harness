# SPEC0295 — Consulta de sessões com rastreio (PAR-S05)

R2, 31/10/2026 (R0 `9d26b9e46`, R1 `74623ba06`; R2 corrige a contagem do orçamento de bytes e o exemplo da janela, conferência Codex `44de8e510`). Task `AUD0625-PAR-S05-SPEC-D9-20261030` (Claude Sonnet 5.5, D9), cartão PAR-S05 ([0380](../03_build/0380_backlog_paridade_100_deepseek.md); F2, P1, M, T3; depende do PAR-S01), capacidades PAR-CAP QUERY-01 e QUERY-02. Estado `AUTHOR_REPAIRED_PENDING_NON_AUTHOR_CONFERENCE_AND_HUMAN_T3`: não há BUILD, não há aceite e nada aqui libera produção.

Evidência: [DISCOVERY](../04_audit/evidence/AUD0625-PAR-S05-SPEC-D9-20261030/DISCOVERY.md), [resposta item a item à revisão Codex](../04_audit/evidence/AUD0625-PAR-S05-SPEC-D9-20261030/R1-RESPONSE.md) e o RED `packages/sdk/src/__tests__/aud0625-par-s05-red.test.ts`.

## 1. Problema

1. Só se lê o log de uma sessão cujo id já se conhece (`session.events`). Não há listagem, filtro, cursor de listagem nem forma de achar sessões.
2. Não há como responder "esta aprovação virou qual efeito, em qual sessão, em qual evento?". Os eventos não trazem `approvalId`; o elo é `operationKey`, que não é único e cruza dois esquemas de banco.
3. O contrato `SessionPersistence` declara "stat/list deferred". Qualquer listagem nova é a primeira superfície capaz de vazar tenant em massa.

## 2. Invariantes

Q1. **Tenant sempre da composição.** Nenhum parâmetro de requisição escolhe o tenant. A listagem de outro tenant é vazia. Leitura ou rastreio de id de outro tenant é indistinguível de id inexistente (matriz do §5.4). Nenhuma resposta traz contagem total, existência ou ordem de sessões de outro tenant.

Q2. **Somente leitura e derivada.** A consulta não escreve, não abre escritor, não toma lock de dono e não altera o log. Falha da consulta não afeta turno nem escritor.

Q3. **Paginação viva por chave única, sem promessa de snapshot.** A listagem usa a chave única `writer_lock_id`, decrescente, nunca offset. Ela é uma **navegação viva**: não há snapshot. Garantias: nenhum item aparece duas vezes na mesma paginação; todo item confirmado antes da primeira resposta com chave maior que a posição do cursor aparece. Limite declarado: `writer_lock_id` é atribuído no INSERT e não segue a ordem de commit, então uma sessão cuja transação confirma depois que o cursor passou da sua posição **pode não aparecer** naquela paginação; uma sessão criada depois da primeira resposta também pode não aparecer. Uma listagem nova, desde a primeira página, a mostra. A ordem é pela chave, não por `createdAt`; `createdAt` é um dado do item.

Q4. **O cursor é uma dica de posição, não uma capacidade.** Ver §4.2: o cliente pode escolher a posição de início dentro do próprio tenant; isso só muda de onde a lista começa e nunca amplia o que o tenant enxerga (RLS). A SPEC não promete detectar adulteração da posição; promete recusar cursor malformado, de versão desconhecida ou de outro filtro.

Q5. **Trabalho limitado.** Há janela lógica **antes do filtro** na listagem (§4.3) e orçamentos globais no rastreio (§5.3). Nenhum limite lógico é vendido como limite de IO físico do PostgreSQL; a BUILD mede o plano (§4.4).

Q6. **Só metadados na listagem.** Cada item: `sessionId`, `createdAt`, `isSeeded`, `parentSession?`, `origin?`, `agentPreset?`, `inheritedEventCount`. Sem texto de mensagem, sem entrada/saída de ferramenta, sem payload.

Q7. **Rastreio cita, não despeja, e não escolhe.** Cada elo é uma referência verificável com os fatos mínimos já presentes no registro. Nunca `payload.input`, texto, nem erro bruto de porta. Quando mais de um candidato casa, todos são devolvidos (até o teto) com lacuna de ambiguidade; nenhuma aprovação, execução ou sessão é escolhida por ordem.

Q8. **Lacuna explícita e leitura não atômica.** O rastreio nunca infere elo que o log e os registros não provam. Cada elo ausente, ambíguo, divergente, truncado ou indisponível vira entrada em `gaps` com razão tipada. A leitura cruza fontes sem snapshot: `observed` registra o instante de cada fonte e **não** transforma duas observações em um fato causal consistente; uma contradição entre fontes é lacuna (`source_conflict`), não reconciliação.

Q9. **Origem é pista, não prova.** `origin` da aprovação (0291) só ordena a busca. Um elo de evento exige um evento real do mesmo tenant com a `operationKey` igual.

Q10. **Nada concede autoridade.** Listar ou rastrear não autoriza retomar, aprovar, delegar nem executar.

Q11. **Uma lógica de turnos.** Qualquer fato de turno vem de `analyzeSessionLog` (S04).

## 3. Porta e formas públicas

`packages/contracts` (novo `session-query.ts`). Formas congeladas na BUILD; aqui o contrato de campos:

```ts
interface SessionListFilter {
  // todos opcionais; chaves desconhecidas recusadas
  parentSession?: string // 1..200, sem NUL
  origin?: 'subagent'
  agentPreset?: string // 1..200, sem NUL
  isSeeded?: boolean
  createdAfter?: number // epoch ms, inclusivo (>=)
  createdBefore?: number // epoch ms, exclusivo (<); after >= before => invalid_params
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
interface SessionListPage {
  items: readonly SessionSummary[]
  nextCursor: string | null // null = fim; ver §4.3
  examined: number // candidatos examinados nesta janela (0..EXAMINE_CAP)
  skippedUnadopted: number // desta janela, só do tenant da composição
}
interface SessionQuery {
  list(input: {
    filter?: SessionListFilter
    cursor?: string
    limit?: number
    signal?: AbortSignal
  }): Promise<SessionListPage>
  trace(input: {
    approvalId?: string
    operationKey?: string
    signal?: AbortSignal
  }): Promise<SessionTrace>
}
type TraceRoot =
  | { kind: 'approval'; id: string }
  | { kind: 'operationKey'; id: string }
type TraceLink =
  | {
      kind: 'approval'
      approvalId: string
      status: string
      executionRef?: string
      originSessionId?: string
    }
  | {
      kind: 'effect'
      operationKey: string
      state: string
      executionRef?: string
    }
  | {
      kind: 'event'
      sessionId: string
      sequence: number
      eventId: string
      type: string
      correlationId: string
      toolId?: string
      outcome?: string
      inherited: boolean
    }
type TraceGap = { reason: GapReason; subject?: { kind: string; id: string } } // sem texto livre
interface SessionTrace {
  root: TraceRoot
  links: readonly TraceLink[] // ordem determinística (§5.2)
  gaps: readonly TraceGap[]
  truncated: boolean // algum orçamento foi atingido
  observed: { approval?: string; effect?: string; events?: string } // ISO, relógio do serviço, por fonte consultada
}
```

Defaults e limites: `limit` default 50, máximo 100 (SDK recusa acima); cursor com no máximo 512 caracteres; `filter` canonicalizado no §4.2.

SDK (`packages/sdk`): métodos aditivos `session.list` e `session.trace`; `SDK_PROTOCOL_VERSION` continua 1 (D7). `sdk.hello` anuncia os métodos só quando a composição tem a porta; sem porta, `capability_not_available`. Parâmetros validados como os de `session.events` (tipos, tamanhos, NUL, chaves desconhecidas recusadas). A porta só é ligada a um tenant já validado pela composição e não é exposta a transporte sem decisão do host (D8).

## 4. Listagem (PostgreSQL)

### 4.1 Fonte e ordem

`session_streams` (0034) pelo pool de leitura, com `cvg.tenant_id` da composição, transação `READ ONLY`, `statement_timeout` e `lock_timeout` de 5 s. Ordem `writer_lock_id DESC`. Sem migração na v1 (D1), condicionada à medição do §4.4.

### 4.2 Cursor (F01)

Formato v1 congelado: `base64url` de JSON canônico `{"v":1,"k":<inteiro seguro positivo>,"f":"<sha256 hex do filtro canônico>","t":"<sha256 hex do tenant>"}`, no máximo 512 caracteres. A decodificação é estrita: base64url sem preenchimento, JSON com exatamente essas quatro chaves, `k` em `1..2^53-1`, re-codificação canônica igual ao texto recebido. Filtro canônico: objeto com chaves ordenadas, sem chaves ausentes, sem `undefined`, números inteiros seguros; filtro vazio e `{}` têm o mesmo digest.

Recusa (`invalid_params`): texto fora do formato, versão diferente de 1, `f` diferente do digest do filtro da requisição, `t` diferente do digest do tenant da composição.

**O que a SPEC não promete:** autenticidade da posição. `f` e `t` não são segredos: um cliente pode manter ambos e trocar `k`. Consequência definida: o chamador começa a lista em outra posição **do próprio tenant**; as linhas continuam filtradas pela RLS e pelo filtro. Não há vazamento, escalada, nem efeito fora da própria resposta. (Alternativa com MAC: D4-b.)

### 4.3 Janela lógica antes do filtro (F03)

Cada página examina no máximo `EXAMINE_CAP` = 1000 candidatos **por chave, antes do filtro**: a janela é `SELECT … WHERE tenant_id = $1 AND writer_lock_id < $k ORDER BY writer_lock_id DESC LIMIT 1000`, e só depois o filtro (e a omissão de streams sem `header_json`) é aplicado a essa janela. Regras:

- `items` = candidatos da janela que passam no filtro, até `limit`. Se `limit` itens foram preenchidos antes do fim da janela, `nextCursor` aponta o **último candidato examinado até ali** (o item de `limit`-ésimo lugar), e o restante da janela é reexaminado na página seguinte.
- Se a janela se esgotou sem preencher `limit` e tinha 1000 candidatos, `nextCursor` aponta o **último candidato examinado**, mesmo que `items` esteja vazio ou menor que `limit`. Uma página vazia com `nextCursor` não nulo é válida e o cliente continua.
- Fim: a janela teve menos de 1000 candidatos e foi toda percorrida ⇒ `nextCursor: null`.
- `examined` e `skippedUnadopted` contam só a janela desta página (omitidos por falta de `header_json` entram em `examined` e `skippedUnadopted`, não em `items`).

### 4.4 Plano físico (F03)

`UNIQUE(writer_lock_id)` não leva o tenant; a PK é `(tenant_id, session_id)`. Dependendo do plano, `ORDER BY writer_lock_id DESC` com RLS pode percorrer linhas de outros tenants antes de achar as do tenant. A janela de 1000 limita **candidatos do tenant decodificados**, não leituras físicas. A fatia 2 da BUILD tem por critério de saída: `EXPLAIN (ANALYZE, BUFFERS)` em tenant pequeno dentro de uma tabela com muitos tenants, e o resultado decide D1: (a) a consulta já é limitada pelo plano, ou (b) migração aditiva com índice `(tenant_id, writer_lock_id DESC)`. Sem a medição, nenhuma promessa de IO.

## 5. Rastreio

### 5.1 Raízes e porta reversa (F04)

Raiz `approvalId` ou `operationKey` (exatamente uma; ambas ou nenhuma ⇒ `invalid_params`). `operation_key` **não é único** em `runtime_approvals` (o índice único inclui `execution_ref`). Portas de leitura, todas com `tenantId` da composição e `signal`:

- `ApprovalReadPort.get(tenant, approvalId)` e `ApprovalReadPort.listByOperationKey(tenant, key, limit = 11)` (sobre `getByOperationKey`, ordenado por `requested_at, approval_id`; devolve até 11 para detectar excesso).
- `EffectJournalReadPort.get(tenant, operationKey)` (chave única do diário).
- `SessionEventStore.read` e a listagem do §4 para varrer sessões.

### 5.2 Algoritmo, uma volta, sem escolha

1. **Aprovações.** Por `approvalId`: uma. Por `operationKey`: todas as candidatas (até 10; 11ª ⇒ lacuna `candidates_capped`). Mais de uma ⇒ lacuna `ambiguous_approval` e cada uma vira um elo `approval`; nenhuma é preferida.
2. **Efeito.** `get(operationKey)` do diário. Para cada aprovação com `executionRef`, se o efeito tem `executionRef` diferente ⇒ lacuna `execution_ref_mismatch` com os dois elos preservados. Efeito com `executionRef` e aprovação sem ⇒ elos sem lacuna (não há o que comparar). Aprovação sem efeito ⇒ `effect_absent`.
3. **Eventos.** Sessões candidatas, em ordem determinística: primeiro as de `origin.sessionId` de cada aprovação (pista, Q9), depois a listagem do §4 (mais nova primeiro), tudo dentro dos orçamentos do §5.3. Em cada sessão, `tool/call` com `payload.operationKey` igual é um candidato; seu `tool/result` é pareado por `correlationId`+`toolId` (mais de um candidato ⇒ `tool_result_ambiguous`); o `turn/end` do mesmo `correlationId` entra como fato. **Herança:** um evento de sessão filha com `sequence ≤ inheritedEventCount` é cópia herdada: entra com `inherited: true` e não conta como origem; a origem é o mesmo evento na sessão ancestral, se achado. Mais de um `tool/call` não herdado em sessões distintas ⇒ lacuna `multiple_event_candidates`, todos devolvidos.
4. Os `links` saem ordenados por (`kind`, `sessionId`, `sequence`, `approvalId`) para que a mesma entrada dê a mesma saída.

Lacunas (`GapReason`): `approval_not_found`, `ambiguous_approval`, `candidates_capped`, `effect_absent`, `execution_ref_mismatch`, `origin_unbound`, `event_not_found`, `multiple_event_candidates`, `tool_result_ambiguous`, `source_conflict`, `source_unavailable`, `budget_exhausted` (com `subject.kind` ∈ `sessions|events|bytes|calls|deadline|links`).

### 5.3 Orçamentos globais (F03)

Por rastreio: no máximo 20 sessões, 5000 eventos decodificados, 4 MiB de eventos decodificados (soma de `Buffer.byteLength(JSON.stringify(record), 'utf8')`, bytes UTF-8 e não unidades UTF-16), 30 chamadas de leitura (portas e páginas de eventos), 5 s de prazo total (relógio monotônico), 100 elos. Cada orçamento atingido encerra a busca daquela dimensão, marca `truncated: true` e acrescenta `budget_exhausted` com a dimensão. O `AbortSignal` do chamador é repassado a toda leitura e conferido entre elas.

**Contagem em bytes (orçamento de 4 MiB).** O tamanho de um evento é `Buffer.byteLength(JSON.stringify(record), 'utf8')` (equivalente a `TextEncoder`), sempre em bytes UTF-8: `JSON.stringify(...).length` conta unidades UTF-16 e subestima texto multibyte (2 milhões de `漢` são 6 MB em UTF-8 e 2 milhões de `😀` são 8 MB, ambos abaixo de 4 194 304 unidades). Os eventos de uma página são examinados em ordem, somando o tamanho de cada um **antes** de examiná-lo. O primeiro evento que faria a soma passar de 4 MiB **não é examinado nem vira elo**: a busca daquela dimensão para, `truncated: true` e a lacuna `budget_exhausted` com `subject.kind = 'bytes'`. Um único evento maior que o orçamento inteiro produz o mesmo resultado sem nenhum elo. Resíduo aceito: a página já lida (até 100 eventos) está na memória quando o orçamento é conferido; o teto de um evento (1 MiB canônico, SPEC 0202) limita esse pico.

**Testes da BUILD para a contagem:** (a) ASCII: 4 MiB exatos de eventos pequenos passam e 1 byte a mais para na fronteira; (b) multibyte: eventos de `漢` e de `😀` cujo `.length` fica abaixo do teto mas cujos bytes o passam esgotam o orçamento (o oráculo `JSON.stringify(...).length` falha onde `Buffer.byteLength` acerta); (c) oversized: um evento sozinho maior que 4 MiB (ou o que cruza o teto no meio de uma página) não é examinado, não gera elo e deixa `budget_exhausted(bytes)` e `truncated`; (d) mutante: voltar para `.length` morre em (b). Um log grande sem nenhuma correspondência termina por orçamento, com lacuna `event_not_found` ou `budget_exhausted`, não por varredura ilimitada. Os orçamentos limitam trabalho **decodificado** pela aplicação, não leitura física do servidor (§4.4).

### 5.4 Matriz de erros (F05)

| Situação                                                                                                       | Resposta                                                                                               |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Raiz `approvalId` inexistente ou de outro tenant                                                               | Erro `session_not_found` (1002), mensagem e forma idênticas; nenhum elo secundário, nenhum `observed`. |
| Raiz `operationKey` sem aprovação, sem efeito e sem evento                                                     | Mesmo erro acima.                                                                                      |
| Raiz `operationKey` com efeito ou evento, sem aprovação                                                        | Trace válido com lacuna `approval_not_found`.                                                          |
| Raiz `approvalId` existente, elo secundário ausente                                                            | Trace com a lacuna do elo (`effect_absent`, `event_not_found`, …).                                     |
| Fonte secundária falha ou excede tempo                                                                         | Lacuna `source_unavailable` (sem texto do erro); o trace continua.                                     |
| Fonte da **raiz** falha                                                                                        | Erro `internal_error` com mensagem fixa; nunca `session_not_found`, nunca trace vazio.                 |
| Composição sem a porta                                                                                         | `capability_not_available` (1003).                                                                     |
| `AbortSignal` do chamador                                                                                      | A porta rejeita com cancelamento; nada parcial é devolvido e o aborto nunca vira `source_unavailable`. |
| Orçamento atingido                                                                                             | Trace com `truncated: true` e `budget_exhausted`.                                                      |
| Parâmetros inválidos (ambas as raízes ou nenhuma, filtro invertido, cursor malformado, `limit` fora de 1..100) | `invalid_params`, sem tocar a porta.                                                                   |

## 6. Fatias de BUILD (depois do aceite desta SPEC)

1. Contratos, cursor/filtro canônicos, janela e rastreio puros sobre portas, implementação em memória. Testes e mutantes.
2. `PostgresSessionQuery.list` (janela pré-filtro, timeouts, RLS) com teste PG de dois tenants, **INSERT sem commit com cursor além da posição** e `EXPLAIN` do §4.4; D1 fecha aqui.
3. Portas de leitura de aprovação/diário e `trace` ponta a ponta (PG), com ambiguidade, herança e orçamentos.
4. Métodos SDK, `sdk.hello`, validação, stdio, compatibilidade (cliente v1 antigo ignora métodos novos) e catálogo de capacidades.

Cada fatia: typecheck, eslint, prettier, links, `skip:governance`, cobertura 100% por arquivo em harness/contracts, mutantes, revisão não autora.

## 7. Provas

RED atual (`aud0625-par-s05-red.test.ts`), bruto preservado: controles C1–C4 e testemunhas RED-1 a RED-4 (roteamento). R1 acrescenta testemunhas de comportamento no SDK (RED-5 a RED-10: raiz ausente indistinguível de alheia, falha da fonte da raiz não é `not_found`, filtro invertido, cursor longo, `limit` fora da faixa e default, raízes ambas/nenhuma), que falham hoje com `method_not_found` e passam a asserções positivas na BUILD. Pares discriminantes planejados para a BUILD (não escritos antes do código):

| Achado | Par discriminante                                                                                                                                                                                                                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01    | cursor com `k` trocado e digests mantidos ⇒ aceito e só muda a posição (documentado); digest de tenant/filtro trocado, versão 2 e base64 não canônico ⇒ `invalid_params`                                                                                                                                                                |
| F02    | INSERT sem commit com id menor; avançar o cursor além; confirmar; a paginação em curso não o mostra e uma listagem nova mostra; sem duplicatas                                                                                                                                                                                          |
| F03    | 2001 candidatos onde só o 1500º casa: uma página vazia com cursor (janela de 1000 sem match), depois a página com o item (a segunda janela, 1001 a 2000), depois uma página final vazia com `nextCursor: null` (1 candidato, janela curta); fim só com janela curta; log de 10.001 eventos sem match ⇒ `budget_exhausted` e `truncated` |
| F04    | raiz por chave com 2 aprovações ⇒ 2 elos + `ambiguous_approval`; `executionRef` divergente ⇒ `execution_ref_mismatch`; chave em sessão filha herdada e na ancestral ⇒ `inherited` e sem `multiple_event_candidates` espúrio                                                                                                             |
| F05    | raiz alheia e inexistente: respostas idênticas byte a byte; falha da fonte da raiz ⇒ `internal_error`; aborto ⇒ sem `source_unavailable`                                                                                                                                                                                                |

## 8. Decisões T3 (recomendação em negrito)

| ID  | Decisão                                     | Opções                                                                                                                                                                    | Recomendação                                                                                                                                 |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Ordem e filtros da listagem                 | (a) `writer_lock_id`, navegação viva (Q3) e filtros no `header_json`, sem migração; (b) migração com índice `(tenant_id, writer_lock_id DESC)` e colunas indexadas        | **(a)**, condicionada ao `EXPLAIN` da fatia 2: se o plano não limitar a leitura, vira **(b)** sem nova decisão de produto                    |
| D2  | O que leitura/rastreio mostram              | (a) só metadados e referências; (b) payload mascarado                                                                                                                     | **(a)**; sem payload nem erro bruto de porta                                                                                                 |
| D3  | Streams sem `header_json`                   | (a) omitir e contar em `skippedUnadopted` da janela; (b) listar com `createdAt` nulo                                                                                      | **(a)**                                                                                                                                      |
| D4  | Cursor                                      | (a) dica de posição não autenticada, vinculada a versão/filtro/tenant, com o limite do §4.2 declarado; (b) cursor com MAC (chave do host, política de rotação e reinício) | **(a)** (posição controlável dentro do próprio tenant, sem efeito além da própria resposta); (b) só se o Ricardo quiser detectar adulteração |
| D5  | Rastreio                                    | (a) uma volta, sem escolha, ambiguidade devolvida, orçamentos do §5.3; (b) também evento→aprovação e sessão inteira                                                       | **(a)**; (b) como follow-up                                                                                                                  |
| D6  | Elo `approvalId`/`operationKey` nos eventos | (a) catálogo v1 intacto, ambiguidade declarada; (b) catálogo v2 com `operationKey` em `tool/result` (e `approvalId`)                                                      | **(a)** agora; (b) como cartão ligado à evolução de formato (0203/S07)                                                                       |
| D7  | Protocolo SDK                               | (a) aditivo no v1, anunciado em `sdk.hello`; (b) v2                                                                                                                       | **(a)**                                                                                                                                      |
| D8  | Controle de acesso por papel                | (a) host decide; porta ligada a tenant validado e não exposta a transporte sem decisão do host; (b) papel no contrato                                                     | **(a)** agora; papel entra no S06                                                                                                            |

Fora do escopo: busca textual (S06), projeções (S02), export/import (S07), retenção, seleção por nome (C100-S01), qualquer escrita.

## 9. Riscos aceitos

Leitura entre fontes não é atômica e `observed` não a torna causal. A paginação é viva e pode omitir commit tardio (Q3). O filtro por `header_json` e a ordem por chave podem ser lentos sem o índice de D1-b; a BUILD mede antes de prometer. Sem `approvalId` no log, aprovações legadas sem origem terminam em lacuna.
