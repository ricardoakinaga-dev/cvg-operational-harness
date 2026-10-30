# SPEC0292 — Projeções de sessão com cache de checkpoint (PAR-S02)

R1, 30/10/2026 (R0 616ab49d1; R1 incorpora a revisão não autora da D9, `AUD0625-REVIEW-0292-D9-20261030`: 2 P2 e 7 P3, nenhum P1). Task `AUD0625-PAR-S02-SPEC-07-20261030` (Claude Sonnet 5.5, sessão 07), cartão PAR-S02 ([0380](../03_build/0380_backlog_paridade_100_deepseek.md); F2, P1, depende do PAR-S01), capacidade PAR-CAP SESSION-04. Estado `PROPOSED_FOR_HUMAN_T3_REVIEW`. T3: cria uma tabela persistida nova (cache derivado) e um contrato público novo. **Sem BUILD até revisão humana explícita deste documento.** Sem ação clínica, sem dado real, sem rede.

Base: persistência pública de sessões do S01 ([0221](0221_pare100_public_session_persistence.md)) e a análise de turnos do S04 ([0287](0287_par_s04_session_fork_and_resume.md)). Evidência: [DISCOVERY](../04_audit/evidence/AUD0625-PAR-S02-SPEC-07-20261030/DISCOVERY.md), a sonda de custo e os testes RED `tests/aud0625-par-s02-red.test.ts` e `packages/persistence/src/__tests__/aud0625-par-s02-red-postgres.test.ts`. Escopo de código futuro: `packages/harness/src/session/projection.ts` (puro), `packages/persistence/src/session-persistence.ts` (serviço), uma migração opt-in da tabela de checkpoints, contratos aditivos. Nada novo em kernel, aprovações ou journal de efeitos.

## 1. Problema

1. Não há projeção de sessão. Quem precisa do "estado atual" (equipe na passagem de plantão, S03, S07, O08, O09) lê e interpreta o log.
2. Toda leitura valida o log inteiro: ler um evento custa o mesmo que ler todos (~85 µs por evento; 1,7 s para 20 mil eventos). Paginar ou consultar o estado de uma sessão longa é O(N) por chamada.
3. O catálogo v1 não tem evento de meta nem de todo; "metas e todos" do cartão não são projetáveis hoje.

## 2. Invariantes

I1. **Derivada, nunca fonte.** O log (PostgreSQL, ADR-011 no cartão S07) é a única fonte. A projeção e o cache podem ser apagados a qualquer momento: muda a latência, não o resultado.

I2. **Pura, determinística e incremental para logs analisáveis.** `projectSession(events)` e `foldSessionProjection(estado, cauda)` não têm IO, relógio nem aleatoriedade e não alteram a entrada. Para todo log **analisável** (contíguo, sem turnos intercalados, no máximo um `turn/end` por turno) e todo corte `k`, inclusive no meio de um turno e entre um `tool/call` e o seu `tool/result`: `fold(proj(1..k), k+1..n) = proj(1..n)`. Para um log **corrompido** (um `correlationId` que reaparece depois de encerrado, por exemplo) o `fold` pode aceitar o que a análise do zero recusaria; quem acusa é o `verifyProjectionCache` (§5), não o `fold`. O estado carrega para isso um **acumulador do grupo aberto** (§3).

I3. **Cada item cita o evento de origem.** Todo item de contagem de pausa, parada, efeito incerto ou compactação carrega `{sequence, eventId}` de um evento real do log; a referência é verificável por busca.

I4. **Cache nunca serve obsoleto nem adulterado.** Um checkpoint só vale se (a) a versão da projeção é a atual, (b) o digest do estado confere, (c) o evento do ponto do checkpoint existe com o mesmo `input_digest` e (d) o cursor é ≥ o ponto. Qualquer falha reconstrói do zero; o leitor não serve o checkpoint nem o repara.

I5. **Leitura incremental valida a cauda, não o prefixo.** A cauda lida depois do checkpoint é validada por inteiro (esquema, fingerprint, digest, contiguidade a partir do ponto); a validação completa do prefixo continua sendo da operação de verificação explícita (§5), não de toda leitura.

I6. **Sem texto de mensagem.** O estado projetado e o checkpoint guardam ids, contadores, sequências e referências; nunca texto de `message/*`, nem o resumo de `context/compacted`, nem entrada/saída de ferramenta.

I7. **Tenant sempre.** O checkpoint tem `tenant_id` na chave e RLS; o serviço lê o tenant da composição. Sessão de outro tenant é `SessionPersistenceNotFoundError`.

I8. **Escrita do cache é do escritor e nunca falha o turno.** Só o dono do stream (lock de escritor) grava o checkpoint. O gatilho principal é o **`append` que cruza `K` eventos desde o último checkpoint** (depois do commit, melhor esforço), com `flush` e `close` como gatilhos adicionais: uma sessão de plantão aberta por dias pode nunca dar `flush` nem fechar, e é o caso de maior custo. Falha, falta de privilégio ou tabela ausente: o append, o `flush` e o `close` seguem, a projeção cai para reconstrução, e a falha é **contada e registrada** (§4, PJ08).

I9. **Nada concede autoridade.** A projeção não autoriza retomar, delegar, aprovar nem executar.

I10. **Fork e retomada.** O fork não copia checkpoint; a projeção do filho até o corte é igual à do pai até o mesmo corte. A análise de turnos do S04 é a projeção `turns` desta SPEC, não uma segunda lógica.

## 3. Projeção v1 (pura, `packages/harness`)

```ts
interface SessionProjection {
  version: 1 // SESSION_PROJECTION_VERSION
  throughSequence: number // último evento dobrado
  turns: { total; completed; ended; open } // marcadores de compactação não são turnos
  lastTurn?: TurnReport // do S04: correlationId, intervalo, estado, stopReason, efeitos incertos
  stops: StopLog // SÓ fatos finais do log, com teto (abaixo)
  inheritableThrough: number // do S04
  compaction?: { throughSequence; source; count } // valor REGISTRADO da última compactação (abaixo)
  open?: OpenGroup // acumulador do grupo ainda aberto; é o que torna o fold exato
}
interface OpenGroup {
  correlationId: string
  firstSequence: number
  openCalls: Record<string, string[]> // toolId -> operationKeys sem resultado, em ordem
  uncertain: string[] // operationKeys já incertos (resultado deadline/cancelled/threw/confirm_failed)
  hasUser: boolean
  hasAssistant: boolean
  onlyMarkers: boolean
  end?: { stopReason: string; sequence: number }
}
type StopLog = {
  total: Record<FinalStopKind, number> // contagem total por tipo, sempre exata
  recent: Stop[] // os últimos N (proposta N=32) por tipo, mais novos por último
}
type FinalStopKind = 'approval_required' | 'needs_user_input' | 'human_takeover'
type Stop = {
  kind: FinalStopKind | 'open_turn' | 'uncertain_effect'
  correlationId: string
  operationKey?: string
  source: { sequence; eventId }
}
```

- **Fatos finais x transitórios.** `StopLog` guarda apenas paradas **finais**: turno encerrado em `APPROVAL_REQUIRED`/`NEEDS_USER_INPUT`/`HUMAN_TAKEOVER` (origem: o `turn/end`). `open_turn` e `uncertain_effect` são **transitórios** (um `tool/call` sem resultado deixa de ser incerto quando o resultado chega na cauda; o turno aberto deixa de sê-lo no `turn/end`): **não são gravados**, são **derivados na leitura** a partir de `open` (origem: o `turn/start` e o `tool/call`) por `currentStops(projeção)`, que devolve as paradas finais recentes mais as transitórias. O log **não sabe** se a aprovação foi decidida depois (a resolução vive no armazenamento de aprovações; o S05 fará o rastreio): a projeção afirma "o turno parou aqui", não "em aberto".
- **Teto do estado.** `recent` guarda no máximo `N` por tipo e `total` conta tudo. Se mesmo assim o estado serializado passar de `maxStateBytes` (proposta 64 KiB), o checkpoint **não é gravado** (fail-closed: `project` cai em `rebuild`, e o contador de falha de §4 sobe). Em plantão longo a lista deixa de crescer sem limite.
- **Análise de turnos como redutor.** `analyzeSessionLog` do S04 vira `foldTurnAnalysis(estado, eventos)` e `analyzeSessionLog = fold(inicial, eventos)`; `fork` e `resumeSession` continuam usando a função inteira. É uma refatoração de código já aprovado (S04, `fork.ts`) e, por isso, **entra na fatia 1 com os oráculos FP/FK do S04 como critério de aceite** (PJ11): nenhum teste existente muda. Uma lógica só (I10).
- **Intercalação.** O redutor do zero memoriza os `correlationId` já encerrados para recusar a intercalação; o checkpoint **não** os carrega (o conjunto cresceria com o nº de turnos). Isso é a ressalva do I2 (log corrompido): o `fold` não a vê e o `verifyProjectionCache` a acusa (PJ03, caso corrompido).
- **Marcador de compactação.** O acumulador guarda `onlyMarkers`; se um evento do mesmo `correlationId` chega depois de um grupo só de marcadores, o rótulo muda como mudaria do zero.
- **Compactação é valor registrado.** `compaction.throughSequence` é o valor **gravado no payload** do `context/compacted`, não uma posição no log: na C01 ele é hoje a posição na lista de mensagens da requisição, e o validador exige apenas `throughSequence < sequence` (desvio 5 da C01). A projeção o repete como "valor registrado" e **não** o afirma como cobertura do log até o cartão que o mapeia para a sequência real. "Última compactação" = o evento de **maior `sequence`** (o mais recentemente gravado); `count` conta todos. Uma estratégia v1 e uma `model-compaction-v1` podem coexistir; a projeção não escolhe entre elas.
- `foldSessionProjection` recusa cauda não contígua ou sobreposta com `SessionPersistenceCorruptionError` (fail-closed, como o S04).
- **Metas e todos ficam fora desta versão** (§8, SP-A): o registro de reducers por tipo de evento é o ponto de extensão que O08/O09 usarão ao introduzir os tipos novos, com `version` incrementada.
- **Teste golden:** a saída do redutor para um log de referência fica fixada; mudar a lógica sem subir `SESSION_PROJECTION_VERSION` falha a CI.

## 4. Cache de checkpoint e serviço (`packages/persistence`)

Tabela `session_projection_checkpoints` (migração opt-in, mesmo molde do 0034; fora de `POSTGRES_MIGRATIONS`):

`(tenant_id, session_id, projection_id, projection_version, through_sequence, tail_input_digest, header_digest, state jsonb, state_digest, created_at)`; `header_digest` é o digest do cabeçalho do stream (identidade do stream, como a guarda `Session header changed` da leitura S01), chave `(tenant_id, session_id, projection_id)`, RLS por tenant, `INSERT ... ON CONFLICT DO UPDATE` só avança `through_sequence`.

`SessionPersistence.project(id, options?) → { projection, origin: 'cache' | 'incremental' | 'rebuild', throughSequence }` (aditivo, contrato público):

0. `project` é método do **serviço**, não do handle: reutiliza as guardas da leitura do S01 (cabeçalho inalterado, `head` que não regride, ordem e cancelamento pelo mesmo admissor) para não ter menos proteção que `read`.
1. Lê o checkpoint e o cursor numa transação `REPEATABLE READ`.
2. Checkpoint íntegro (versão, `state_digest`, `header_digest`, evento do ponto com o mesmo `input_digest`, cursor ≥ ponto) e cursor = ponto → `cache` (lê no máximo a linha do ponto).
3. Checkpoint íntegro e cursor > ponto → lê e valida só a cauda, `fold` → `incremental`.
4. Sem checkpoint ou inválido → lê o prefixo inteiro pelo leitor validado do S01, `projectSession` → `rebuild`.
5. `project` **não escreve** o cache; o checkpoint nasce no escritor (I8) com `K` configurável (padrão proposto 256 eventos).

**Escritor.** O handle do escritor mantém o estado dobrado a cada `append` (ou faz um `project` incremental antes de gravar) e grava o checkpoint no `append` que cruza `K`, depois do commit, em melhor esforço; `flush` e `close` também tentam. Uma sessão adotada ou reaberta (`resumeSession`) parte do checkpoint existente mais a cauda. Alternativa de mesmo efeito: método explícito `checkpoint()` no handle do escritor (decisão SP-C).

**Falha do cache.** Cada falha de leitura ou escrita do checkpoint incrementa um contador e deixa um registro (sem texto de mensagem); `verifyProjectionCache` acusa a tabela que existe e nunca foi escrita. Engolir a falha para o turno é correto; engoli-la para sempre esconderia configuração errada.

**Garantia declarada (SP-G).** `project` **não** prova a integridade do prefixo: o log não tem cadeia de hashes, e o digest do evento do ponto não prova o que vem antes. Os gatilhos `session_events_no_mutation`/`no_truncate` e `session_streams_no_delete` tornam isso razoável; a prova é a leitura validada do S01 e o `verifyProjectionCache`.

**Contrato.** `project` entra na interface `SessionPersistence`: é mudança de contrato (aditiva), e implementações de terceiros e duplos de teste precisam acompanhá-la. **Sem a tabela** (ambiente sem a migração), `project` roda sempre em `rebuild`: correto e mais lento. **Migração:** número a renumerar na integração, depois de 0033 (K03) e 0034 (S01) e junto das opt-in do C03/0293 e da 0291, com a nota `…b` quando necessário.

## 5. Verificação

`verifyProjectionCache(service, id)` (aditivo): reconstrói do zero e compara com o checkpoint; devolve os problemas. É o aceite "reconstruída do zero é igual à do cache" (PJ04) e a única operação que valida o prefixo inteiro do cache. Também acusa um log corrompido que o `fold` aceitaria (I2) e a tabela que existe mas nunca foi escrita.

## 6. Provas

| ID   | Prova                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PJ01 | Pura: contadores, última volta, paradas, cobertura de compactação; log vazio; marcador não é turno.                                                                                                                                                                                                                                                                                                                         |
| PJ02 | Cada item de `stops` e `compaction` resolve para um evento real com mesmo `eventId` e tipo esperado.                                                                                                                                                                                                                                                                                                                        |
| PJ03 | Propriedade: para **todo** corte `k` de logs analisáveis, inclusive no meio de um turno e entre `tool/call` e `tool/result`, `fold(proj(1..k), k+1..n) = proj(1..n)`; cauda com lacuna ou sobreposição é recusada; caso **corrompido** (`correlationId` reaparece): o `fold` aceita e o `verifyProjectionCache` acusa. Um efeito incerto no prefixo que o resultado resolve na cauda não deixa `uncertain_effect` obsoleto. |
| PJ04 | PG: reconstruído do zero = cache, nos três `origin`; `verifyProjectionCache` verde.                                                                                                                                                                                                                                                                                                                                         |
| PJ05 | Custo: com checkpoint, `project` lê no máximo a linha do ponto (`cache`) ou cauda + 1 (`incremental`); sem ele lê N. Teste por contagem de linhas **e de validações (`checkEvent`) ≤ cauda + 1**, que é o que de fato paga (o custo medido é de JS, não de SQL); nunca por tempo.                                                                                                                                           |
| PJ06 | Adulteração: estado alterado, `projection_version` diferente, evento do ponto inexistente ou com digest diferente, **cabeçalho do stream diferente** → `rebuild`, nunca o cache.                                                                                                                                                                                                                                            |
| PJ07 | Isolamento: outro tenant não lê nem herda checkpoint; mesmo `sessionId` em dois tenants fica separado.                                                                                                                                                                                                                                                                                                                      |
| PJ08 | Falha do cache (tabela ausente, sem privilégio, escrita que falha) não falha `project`, `append`, `flush` nem `close`, **e a falha é contada e registrada**; `verifyProjectionCache` acusa a tabela que existe e nunca é escrita.                                                                                                                                                                                           |
| PJ09 | Sem texto: nenhum `message/*`, resumo ou payload de ferramenta no estado nem na tabela.                                                                                                                                                                                                                                                                                                                                     |
| PJ10 | Fork: projeção do filho até o corte = projeção do pai até o corte; o cache não é copiado. Compactação: `context/compacted` não muda contagens nem invalida checkpoint.                                                                                                                                                                                                                                                      |
| PJ11 | Oráculos S01 e S04 inalterados e verdes; cobertura 100% por arquivo em `projection.ts`.                                                                                                                                                                                                                                                                                                                                     |

Mutações no BUILD: `stops` transitórios gravados no estado, acumulador do grupo aberto descartado no checkpoint, checkpoint só em `flush`/`close`, teto de `recent` ignorado, dobrar a cauda fora de ordem, aceitar cauda não contígua, servir checkpoint sem conferir digest/versão/ponto, gravar checkpoint pelo leitor, ignorar o tenant na chave, deixar texto entrar no estado, falha do cache propagar, `incremental` que relê o prefixo.

## 7. Fatiamento proposto do BUILD (após T3)

1. Projeção pura, `foldSessionProjection`, **`analyzeSessionLog` como redutor (com os oráculos FP/FK do S04 como critério)**, teto do estado, erros e contratos; cobertura 100% (PJ01-PJ03, PJ09 puro, PJ10 puro).
2. Tabela, migração opt-in, `project` com os três `origin`, `verifyProjectionCache` (PJ04-PJ07).
3. Checkpoint no `append` que cruza `K` (e em `flush`/`close`), estado dobrado no handle do escritor, tolerância a falha com contador, provas de processo (PJ05 por contagem, PJ08).
4. Integração: `resumeSession` lendo do checkpoint e registro no cartão S02. Exposição no SDK fica fora (decisão SP-D).

## 8. Fora de escopo e limites

Metas e todos (precisam de eventos novos e de catálogo novo: PAR-O08/O09), estatísticas de tempo e esboço de turnos (S03), consulta com filtro e rastreio de aprovação (S05), busca (S06), export/import (S07), mudança no catálogo v1, projeção entre sessões, projeção por modelo (resumo), reescrita do caminho de leitura do S01 (a validação completa continua nele), qualquer mudança em aprovações ou journal de efeitos. Aprovar esta SPEC não libera produção nem release.

## 9. Decisões pedidas ao humano (T3)

| ID   | Pergunta                                                                                                                                 | Recomendação                                                                                                                                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SP-A | Entregar agora só o que o log v1 sustenta (estado, paradas, compactação) e deixar metas/todos para O08/O09 com tipos de evento próprios? | Sim; criar tipos de evento "vazios" agora sem consumidor seria dívida de catálogo.                                                                                                                         |
| SP-B | "Pendência" = parada registrada no log (sem afirmar resolução), com a resolução vindo do armazenamento de aprovações no S05?             | Sim; o log não sabe da decisão e afirmar "em aberto" seria falso.                                                                                                                                          |
| SP-C | Quem grava o checkpoint e quando: só o escritor, no `append` que cruza `K` (mais `flush`/`close`), ou também o leitor?                   | Só o escritor, no `append` que cruza `K` (ou um `checkpoint()` explícito); sem corrida e sem escrita em caminho de leitura. Gatilho só em `flush`/`close` descartaria a sessão de plantão aberta por dias. |
| SP-D | Expor `project` no SDK nesta onda ou só no serviço de persistência?                                                                      | Só no serviço (como FK-D do S04); SDK em fatia própria.                                                                                                                                                    |
| SP-E | O cache pode guardar texto de mensagem para acelerar `esboço`/`título` do S03?                                                           | Não; o estado guarda só ids e contadores (I6). O S03 decide o que precisa e pede uma projeção própria.                                                                                                     |
| SP-F | Cache em tabela dentro do mesmo esquema da sessão (opt-in) ou em armazenamento separado?                                                 | Mesmo esquema, mesma RLS e mesmo ciclo de migração opt-in; apagável sem perda.                                                                                                                             |
| SP-G | `project` é prova de integridade do prefixo?                                                                                             | Não: declarado no contrato. A prova é a leitura validada do S01 e o `verifyProjectionCache`; o log não tem cadeia de hashes.                                                                               |
