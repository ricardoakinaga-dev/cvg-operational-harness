# SPEC0287 — Fork e retomada de sessão (PAR-S04)

R0, 29/10/2026. Task `AUD0625-PAR-S04-SPEC-07-20261029` (Claude Sonnet 5.5, sessão 07), cartão PAR-S04 ([0380](../03_build/0380_backlog_paridade_100_deepseek.md); F2, P1, depende do PAR-S01). Estado `PROPOSED_FOR_HUMAN_T3_REVIEW`. T3: cria novos fatos duráveis a partir de outra sessão e define o que não atravessa a linhagem. **Sem BUILD até revisão humana explícita deste documento.** Sem ação clínica, sem dado real, sem rede.

Base: a persistência pública de sessões do PAR-S01 ([SPEC0221](0221_pare100_public_session_persistence.md), fatias 1–7 aprovadas pelo DF). Evidência: [DISCOVERY](../04_audit/evidence/AUD0625-PAR-S04-SPEC-07-20261029/DISCOVERY.md), [mapa](../04_audit/evidence/AUD0625-PAR-S04-SPEC-07-20261029/MAP-NOTES.md) e testes RED `tests/aud0625-par-s04-red.test.ts`. Escopo de código futuro: `packages/harness/src/session/*` (funções puras), `packages/persistence/src/session-persistence.ts` (operações), contratos públicos aditivos. Nada novo em kernel, aprovações ou journal de efeitos.

## 1. Problema

1. Não existe fork. O header carrega `parentSession`/`isSeeded`/corte, mas nada copia o prefixo nem prova a linhagem; um seeded com corte 3 e corpo vazio é válido no S01, então "seeded" não prova que as sequências 1..3 vieram do pai.
2. Não existe a noção de "turno concluído" no log, e é ela que o cartão exige. O crash no meio de um turno deixa `turn/start` sem `turn/end`, e ninguém analisa isso.
3. Aprovações não ligam a sessão e efeitos incertos ligam a `(tenant, operationKey)`: um fork ingênuo herdaria autoridade ou perderia incerteza.
4. A retomada depois de crash do dono não tem contrato: o que se lê, o que se recusa, o que se herda do turno interrompido.

## 2. Invariantes

I1. **Fork é cópia de um prefixo de turnos concluídos.** O filho recebe os eventos 1..N do pai, **sem renumerar**, onde N é o último evento de um turno concluído e todos os turnos de 1..N são concluídos e sem efeito incerto (§3). Turno não concluído (encerrado por outro motivo, aberto ou contaminado) nunca entra, e nada depois dele entra, ainda que haja turnos concluídos mais adiante (renumerar quebraria `context/compacted.throughSequence`).

I2. **Atômico.** O filho nasce completo ou não nasce: criação do stream, N eventos e avanço do cursor numa única transação sobre um snapshot `REPEATABLE READ` do pai. Não existe estado "fork em andamento" visível. Prefixo acima do teto de lote (8 MiB, como o append) é recusado (`fork_too_large`); a cópia em pedaços é fora de escopo.

I3. **Mesmo tenant, sempre.** O tenant vem da composição autenticada. Fork entre tenants não existe: o pai é lido pelo mesmo serviço, no mesmo tenant.

I4. **Linhagem provável.** O header do filho é `isSeeded: true`, `inheritedEventCount: N`, `parentSession: <pai>` e um bloco de metadado `lineage` (sem valor de autorização) com `{source, cutSequence, sourceDigest, depth, root}`. `sourceDigest` é o SHA-256 da lista ordenada `sequência:input_digest` do prefixo do pai. `verifySessionFork(filho, pai)` recompõe tudo: header coerente, N eventos iguais ao prefixo do pai com `sessionId` trocado, corte ≤ corpo. Profundidade máxima 16.

I5. **Nenhuma autoridade atravessa.** Não se copia nem se religa: aprovação pendente ou concedida, execução, checkpoint, lease de writer, linha do journal de efeitos, grant de ferramenta. `parentSession`, `origin`, `delegationDepth` e `lineage` continuam sem conceder permissão de retomar, delegar ou executar (SPEC0221 §3). O filho começa sem execução e sem aprovação.

I6. **Aprovação do original não vale no fork.** Um `approvalId` do pai, pendente ou concedido, não destrava turno do fork: o fork não possui a execução que o criou (`pendingApprovalId` liga à execução), e uma ação idêntica proposta no fork cria **novo** pedido. A prova disso é do BUILD (§7, FP07).

I7. **Efeito incerto não atravessa.** Um turno com `tool/call` sem `tool/result`, ou com `tool/result` em `deadline`, `cancelled`, `threw` ou `confirm_failed`, está contaminado e fecha o prefixo herdável (I1). O fork nunca contém um efeito que o journal do pai considere desconhecido.

I8. **Posse própria.** O filho é um stream novo com seu `writer_lock_id`; o fork não toma o lock do pai (lê snapshot) e funciona com o pai aberto por outro escritor. Fork não torna o chamador dono do pai.

I9. **Retomada nunca reabre posse viva.** `resumeSession(id)` abre como escritor só com o `pg_try_advisory_lock`: dono vivo dá `SessionAlreadyOwnedError`, sem espera nem tomada. Handle `LOST` nunca revive (S01); retomar é um handle novo. A retomada não escreve evento algum: devolve o handle e a análise do log.

I10. **Turno interrompido é fato, não é apagado nem fechado por inferência.** O turno aberto continua no log como está. A análise o reporta (`openTurn`, com os efeitos incertos), o próximo turno usa novo `correlationId`, e o fork o exclui (I1). Nenhum `turn/end` sintético.

## 3. Análise do log (função pura, `packages/harness`)

`analyzeSessionLog(events): SessionLogAnalysis`, ordem do log, sem IO:

```ts
interface TurnReport {
  correlationId: string
  firstSequence: number
  lastSequence: number
  state: 'completed' | 'ended' | 'open' // ended = turn/end com stopReason ≠ COMPLETED
  stopReason?: string
  uncertainEffects: readonly string[] // operationKeys incertos (I7)
}
interface SessionLogAnalysis {
  turns: readonly TurnReport[]
  inheritableThrough: number // 0 quando nenhum turno é herdável
  openTurn?: TurnReport
}
```

- Turno = eventos com o mesmo `correlationId` de envelope (inclui `message/user` e `message/assistant`, que não repetem o id no payload). `context/compacted` e eventos de um turno sem `turn/start` seguem a mesma regra por `correlationId`.
- `completed` exige `turn/end COMPLETED` e, se o turno tem `message/user`, também `message/assistant` (o SDK escreve o segundo depois do primeiro; um crash no meio não é concluído).
- `uncertainEffects`: `operationKey` de todo `tool/call` sem `tool/result` do mesmo turno, ou cujo resultado é `deadline`, `cancelled`, `threw` ou `confirm_failed`. Um turno `completed` com efeito incerto continua `completed`, mas fecha `inheritableThrough` (I7).
- `inheritableThrough` = última sequência do maior prefixo de turnos `completed` sem efeito incerto, contíguos a partir da sequência 1; log vazio ou primeiro turno não herdável dá 0. Eventos sem `correlationId` agrupável tornam o log não analisável (`SessionLogUnanalyzableError`).

## 4. Fork

`planSessionFork(events, {targetSessionId, through?}): SessionForkPlan` (pura): escolhe o corte (padrão `inheritableThrough`; `through: {correlationId}` aceita só o fim de um turno herdável; qualquer outro valor é recusado com `fork_cut_not_inheritable`, `fork_cut_unknown_turn`, `fork_nothing_to_inherit` ou, para destino igual à origem, `fork_target_is_source`), reconstrói cada evento com `sessionId = targetSessionId` e a mesma sequência, `eventId`, `correlationId`, `traceId`, `timestamp` e payload (digest e fingerprint recalculados pelos helpers CVG existentes) e devolve `{inherited, cutSequence, lineage}`.

`SessionPersistence.fork(sourceId, header, options?)` (aditivo; contrato público em `packages/contracts`):

1. Valida o header do filho com `validateSessionHeader` já com `isSeeded: true`, cut = N e `parentSession = sourceId`; rejeita `lineage` fornecido pelo chamador (só o serviço o escreve).
2. Numa transação `REPEATABLE READ` do tenant: lê e valida o prefixo do pai pelo mesmo leitor do S01 (todas as páginas, high-water mark), roda `analyzeSessionLog` e `planSessionFork`, insere stream e eventos e avança o cursor, tomando o `pg_try_advisory_lock` do filho antes do COMMIT, como o `create`.
3. Só publica o handle depois do COMMIT. Resultado ambíguo: reconcilia pelo ID original, nunca com novo ID, como o `create` (S01).
4. Erros novos, categorias aditivas CVG (decisão FK-C): `SessionForkRefusedError` com `code` (`fork_nothing_to_inherit`, `fork_cut_not_inheritable`, `fork_cut_unknown_turn`, `fork_target_is_source`, `fork_too_large`, `fork_depth_exceeded`). Pai ausente → `SessionPersistenceNotFoundError`; destino existente → `SessionAlreadyExistsError`.

`create` com `isSeeded: true` e corte > 0 **continua válido** (compatível com o S01 e a adoção), mas sem `lineage`: só o fork produz linhagem provável, e consumidores que exigirem linhagem usam `verifySessionFork`.

## 5. Retomada

`resumeSession(id): {handle, analysis}`: `open(id, 'write')` (I9) e `analyzeSessionLog` sobre o log lido pelo leitor validado do S01. O handle é o de sempre; a análise diz `inheritableThrough` e o `openTurn` (com `uncertainEffects`). A decisão sobre o que fazer com o turno aberto (reconciliar efeito, nova pergunta ao usuário) é do consumidor e do journal de efeitos; a persistência não escreve, não apaga e não fecha nada. Uma batida de append repetida depois do crash converge pela busca por `eventId`/digest do S01, desde que os ids de evento do SDK não se repitam entre processos (limitação do SDK registrada em §8).

## 6. Interação com o SDK e com a ponte

- `sessionEventStoreForHandle(handle)` do filho funciona sem mudança: serve uma sessão, e `readEvents` devolve herdados mais próprios. Não há enum novo no wire do SDK; `fork` e `resumeSession` são operações do serviço de persistência, e uma exposição no SDK (`sessions.fork`) é aditiva e fica para fatia própria.
- O SDK **não reconstrói contexto de modelo a partir do log** (`single_pass`, contexto vazio). Um fork semeado só afeta o que o modelo vê quando existir essa reconstrução; esta SPEC não a cria e não afirma o contrário.

## 7. Aceite e provas

| ID   | Prova                                                                                                                                                                                                                                        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FP01 | `analyzeSessionLog`: turno concluído, encerrado por outro motivo, aberto por crash (com e sem `turn/end`), `message/user` sem `message/assistant`, compactação, log vazio.                                                                   |
| FP02 | Efeito incerto: `tool/call` sem resultado e cada resultado incerto fecham o prefixo; `failed`, `succeeded`, `not_started` não.                                                                                                               |
| FP03 | `planSessionFork`: sequências, `eventId`, `correlationId` e payload preservados, `sessionId` trocado, digest e fingerprint válidos; recusas de corte (meio de turno, turno aberto, turno desconhecido, vazio, depois de turno não herdável). |
| FP04 | PG: fork de pai povoado com 2 tenants; filho completo, `verifySessionFork` verde, mutação do filho ou do pai detectada.                                                                                                                      |
| FP05 | Atomicidade: kill do processo entre o INSERT do stream e o COMMIT (barreira observável) não deixa filho; COMMIT sem ACK reconcilia pelo ID original.                                                                                         |
| FP06 | Fork com o pai aberto por outro escritor funciona e não toma o lock do pai; `writer_lock_id` do filho é distinto; o filho aceita append depois do corte.                                                                                     |
| FP07 | Aprovações: aprovação pendente ou concedida do pai não destrava o fork; ação idêntica no fork gera novo pedido; efeito incerto do pai fica fora do fork (I5-I7).                                                                             |
| FP08 | Retomada: dono vivo → `AlreadyOwned`; depois do kill, handle novo lê o prefixo exato e a análise aponta o turno aberto; nenhum evento escrito; handle velho continua `LOST`.                                                                 |
| FP09 | Limites: profundidade 16, prefixo grande acima do lote, id de destino repetido, header com `lineage` forjado.                                                                                                                                |
| FP10 | Oráculos S01 (header, ownership, adaptador, escritor, ponte, processos, adoção) inalterados e verdes.                                                                                                                                        |

Mutações no BUILD: contar um turno não concluído, aceitar corte no meio do turno, renumerar, não trocar o `sessionId`, copiar sem snapshot, tomar o lock do pai, fork sem transação única, `resume` que escreve `turn/end`.

## 8. Fatiamento proposto do BUILD (após T3)

1. Funções puras: `analyzeSessionLog`, `planSessionFork`, erros, contratos; cobertura 100% em `packages/harness/src/**`.
2. `fork` transacional e `verifySessionFork` no adaptador PG, com testes PG e de processos.
3. `resumeSession`, provas de crash e de aprovação/efeito (FP07, FP08).
4. Exposição opcional no SDK (fatia própria, decisão FK-D).

## 9. Fora de escopo e limites

Merge de sessões, fork de execução (checkpoint, passos, aprovação), cópia em pedaços de prefixos acima do lote, reconstrução de contexto do modelo a partir do log, `stat`/`list` de sessões (S05), recuperação por ticket de COMMIT desconhecido (adiada pelo S01), IDs de evento do SDK únicos entre reinícios (hoje `newEventId` é injetado pelo chamador), qualquer mudança em aprovações ou journal de efeitos. Aprovar esta SPEC não libera produção nem release.

## 10. Decisões pedidas ao humano (T3)

| ID   | Pergunta                                                                                                                                        | Recomendação                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| FK-A | Prefixo estrito de turnos concluídos (turno não concluído fecha o prefixo para sempre) ou permitir pular turnos não concluídos com renumeração? | Estrito; renumerar quebra a compactação e a prova de linhagem. |
| FK-B | Turno concluído com efeito incerto: fica fora do fork (I7) ou entra marcado?                                                                    | Fora; marca exigiria religar o journal.                        |
| FK-C | `SessionForkRefusedError` como categoria CVG adicional (como `SessionAppendConflictError`, recibo 16)?                                          | Sim, com códigos fechados.                                     |
| FK-D | Expor `fork`/`resume` no SDK já nesta onda ou só no serviço de persistência?                                                                    | Só no serviço; SDK em fatia própria.                           |
| FK-E | `create` seeded com corte > 0 sem `lineage` continua válido?                                                                                    | Sim (compatibilidade S01 e adoção); só o fork prova linhagem.  |
| FK-F | Teto de profundidade da linhagem?                                                                                                               | 16.                                                            |
