# SPEC0292 — Projeções de sessão com cache de checkpoint (PAR-S02)

R0, 30/10/2026. Task `AUD0625-PAR-S02-SPEC-07-20261030` (Claude Sonnet 5.5, sessão 07), cartão PAR-S02 ([0380](../03_build/0380_backlog_paridade_100_deepseek.md); F2, P1, depende do PAR-S01), capacidade PAR-CAP SESSION-04. Estado `PROPOSED_FOR_HUMAN_T3_REVIEW`. T3: cria uma tabela persistida nova (cache derivado) e um contrato público novo. **Sem BUILD até revisão humana explícita deste documento.** Sem ação clínica, sem dado real, sem rede.

Base: persistência pública de sessões do S01 ([0221](0221_pare100_public_session_persistence.md)) e a análise de turnos do S04 ([0287](0287_par_s04_session_fork_and_resume.md)). Evidência: [DISCOVERY](../04_audit/evidence/AUD0625-PAR-S02-SPEC-07-20261030/DISCOVERY.md), a sonda de custo e os testes RED `tests/aud0625-par-s02-red.test.ts` e `packages/persistence/src/__tests__/aud0625-par-s02-red-postgres.test.ts`. Escopo de código futuro: `packages/harness/src/session/projection.ts` (puro), `packages/persistence/src/session-persistence.ts` (serviço), uma migração opt-in da tabela de checkpoints, contratos aditivos. Nada novo em kernel, aprovações ou journal de efeitos.

## 1. Problema

1. Não há projeção de sessão. Quem precisa do "estado atual" (equipe na passagem de plantão, S03, S07, O08, O09) lê e interpreta o log.
2. Toda leitura valida o log inteiro: ler um evento custa o mesmo que ler todos (~85 µs por evento; 1,7 s para 20 mil eventos). Paginar ou consultar o estado de uma sessão longa é O(N) por chamada.
3. O catálogo v1 não tem evento de meta nem de todo; "metas e todos" do cartão não são projetáveis hoje.

## 2. Invariantes

I1. **Derivada, nunca fonte.** O log (PostgreSQL, ADR-011 no cartão S07) é a única fonte. A projeção e o cache podem ser apagados a qualquer momento: muda a latência, não o resultado.

I2. **Pura e determinística.** `projectSession(events)` e `foldSessionProjection(estado, cauda)` não têm IO, relógio nem aleatoriedade e não alteram a entrada. `fold(projeção(1..k), k+1..n) = projeção(1..n)` para todo `k` (prefixo + cauda = do zero).

I3. **Cada item cita o evento de origem.** Todo item de contagem de pausa, parada, efeito incerto ou compactação carrega `{sequence, eventId}` de um evento real do log; a referência é verificável por busca.

I4. **Cache nunca serve obsoleto nem adulterado.** Um checkpoint só vale se (a) a versão da projeção é a atual, (b) o digest do estado confere, (c) o evento do ponto do checkpoint existe com o mesmo `input_digest` e (d) o cursor é ≥ o ponto. Qualquer falha reconstrói do zero; o leitor não serve o checkpoint nem o repara.

I5. **Leitura incremental valida a cauda, não o prefixo.** A cauda lida depois do checkpoint é validada por inteiro (esquema, fingerprint, digest, contiguidade a partir do ponto); a validação completa do prefixo continua sendo da operação de verificação explícita (§5), não de toda leitura.

I6. **Sem texto de mensagem.** O estado projetado e o checkpoint guardam ids, contadores, sequências e referências; nunca texto de `message/*`, nem o resumo de `context/compacted`, nem entrada/saída de ferramenta.

I7. **Tenant sempre.** O checkpoint tem `tenant_id` na chave e RLS; o serviço lê o tenant da composição. Sessão de outro tenant é `SessionPersistenceNotFoundError`.

I8. **Escrita do cache é do escritor e nunca falha o turno.** Só o dono do stream (lock de escritor) grava o checkpoint, ao `flush`/`close` quando passaram ao menos `K` eventos desde o último. Falha, falta de privilégio ou tabela ausente: o append e o `close` seguem, e a projeção cai para reconstrução.

I9. **Nada concede autoridade.** A projeção não autoriza retomar, delegar, aprovar nem executar.

I10. **Fork e retomada.** O fork não copia checkpoint; a projeção do filho até o corte é igual à do pai até o mesmo corte. A análise de turnos do S04 é a projeção `turns` desta SPEC, não uma segunda lógica.

## 3. Projeção v1 (pura, `packages/harness`)

```ts
interface SessionProjection {
  version: 1 // SESSION_PROJECTION_VERSION
  throughSequence: number // último evento dobrado
  turns: { total; completed; ended; open } // marcadores de compactação não são turnos
  lastTurn?: TurnReport // do S04: correlationId, intervalo, estado, stopReason, efeitos incertos
  stops: Stop[] // fatos de parada do log, cada um com source {sequence, eventId}
  inheritableThrough: number // do S04
  compaction?: { throughSequence; source } // última cobertura de context/compacted
}
type Stop = {
  kind:
    | 'approval_required'
    | 'needs_user_input'
    | 'human_takeover'
    | 'open_turn'
    | 'uncertain_effect'
  correlationId: string
  operationKey?: string
  source: { sequence; eventId }
}
```

- `stops` são **fatos do log**: turno encerrado em `APPROVAL_REQUIRED`/`NEEDS_USER_INPUT`/`HUMAN_TAKEOVER` (origem: o `turn/end`), turno aberto (origem: o `turn/start`), efeito incerto (origem: o `tool/call`). O log **não sabe** se a aprovação foi decidida depois: a resolução vive no armazenamento de aprovações (S05 fará o rastreio). A projeção não afirma "em aberto"; afirma "o turno parou aqui".
- Reutiliza `analyzeSessionLog` do S04 para turnos, efeitos incertos e `inheritableThrough` (uma lógica só, I10).
- `foldSessionProjection` recusa cauda não contígua ou sobreposta com `SessionPersistenceCorruptionError` (fail-closed, como o S04).
- **Metas e todos ficam fora desta versão** (§8, SP-A): o registro de reducers por tipo de evento é o ponto de extensão que O08/O09 usarão ao introduzir os tipos novos, com `version` incrementada.

## 4. Cache de checkpoint e serviço (`packages/persistence`)

Tabela `session_projection_checkpoints` (migração opt-in, mesmo molde do 0034; fora de `POSTGRES_MIGRATIONS`):

`(tenant_id, session_id, projection_id, projection_version, through_sequence, tail_input_digest, state jsonb, state_digest, created_at)`, chave `(tenant_id, session_id, projection_id)`, RLS por tenant, `INSERT ... ON CONFLICT DO UPDATE` só avança `through_sequence`.

`SessionPersistence.project(id, options?) → { projection, origin: 'cache' | 'incremental' | 'rebuild', throughSequence }` (aditivo, contrato público):

1. Lê o checkpoint e o cursor numa transação `REPEATABLE READ`.
2. Checkpoint íntegro e cursor = ponto → `cache` (lê no máximo a linha do ponto para conferir o digest).
3. Checkpoint íntegro e cursor > ponto → lê e valida só a cauda, `fold` → `incremental`.
4. Sem checkpoint ou inválido → lê o prefixo inteiro pelo leitor validado do S01, `projectSession` → `rebuild`.
5. `project` **não escreve** o cache; o checkpoint nasce no `flush`/`close` do escritor (I8) com `K` configurável (padrão proposto 256 eventos).

`handle.close()`/`flush()` do escritor ganha o passo de checkpoint, depois do flush atual, tolerando falha (I8).

## 5. Verificação

`verifyProjectionCache(service, id)` (aditivo): reconstrói do zero e compara com o checkpoint; devolve os problemas. É o aceite "reconstruída do zero é igual à do cache" (PJ04) e a única operação que valida o prefixo inteiro do cache.

## 6. Provas

| ID   | Prova                                                                                                                                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PJ01 | Pura: contadores, última volta, paradas, cobertura de compactação; log vazio; marcador não é turno.                                                                    |
| PJ02 | Cada item de `stops` e `compaction` resolve para um evento real com mesmo `eventId` e tipo esperado.                                                                   |
| PJ03 | Propriedade: para todo corte `k`, `fold(proj(1..k), k+1..n) = proj(1..n)`; cauda com lacuna ou sobreposição é recusada.                                                |
| PJ04 | PG: reconstruído do zero = cache, nos três `origin`; `verifyProjectionCache` verde.                                                                                    |
| PJ05 | Custo: com checkpoint, `project` lê no máximo a linha do ponto (`cache`) ou cauda + 1 (`incremental`); sem ele lê N. Teste por contagem de linhas, não por tempo.      |
| PJ06 | Adulteração: estado alterado, `projection_version` diferente, evento do ponto inexistente ou com digest diferente → `rebuild`, nunca o cache.                          |
| PJ07 | Isolamento: outro tenant não lê nem herda checkpoint; mesmo `sessionId` em dois tenants fica separado.                                                                 |
| PJ08 | Falha do cache (tabela ausente, sem privilégio, escrita que falha) não falha `project`, `append`, `flush` nem `close`.                                                 |
| PJ09 | Sem texto: nenhum `message/*`, resumo ou payload de ferramenta no estado nem na tabela.                                                                                |
| PJ10 | Fork: projeção do filho até o corte = projeção do pai até o corte; o cache não é copiado. Compactação: `context/compacted` não muda contagens nem invalida checkpoint. |
| PJ11 | Oráculos S01 e S04 inalterados e verdes; cobertura 100% por arquivo em `projection.ts`.                                                                                |

Mutações no BUILD: dobrar a cauda fora de ordem, aceitar cauda não contígua, servir checkpoint sem conferir digest/versão/ponto, gravar checkpoint pelo leitor, ignorar o tenant na chave, deixar texto entrar no estado, falha do cache propagar, `incremental` que relê o prefixo.

## 7. Fatiamento proposto do BUILD (após T3)

1. Projeção pura, `foldSessionProjection`, erros e contratos; cobertura 100% (PJ01-PJ03, PJ09 puro, PJ10 puro).
2. Tabela, migração opt-in, `project` com os três `origin`, `verifyProjectionCache` (PJ04-PJ07).
3. Checkpoint no `flush`/`close` do escritor, tolerância a falha, provas de processo (PJ05 por contagem, PJ08).
4. Integração: `resumeSession` lendo do checkpoint e registro no cartão S02. Exposição no SDK fica fora (decisão SP-D).

## 8. Fora de escopo e limites

Metas e todos (precisam de eventos novos e de catálogo novo: PAR-O08/O09), estatísticas de tempo e esboço de turnos (S03), consulta com filtro e rastreio de aprovação (S05), busca (S06), export/import (S07), mudança no catálogo v1, projeção entre sessões, projeção por modelo (resumo), reescrita do caminho de leitura do S01 (a validação completa continua nele), qualquer mudança em aprovações ou journal de efeitos. Aprovar esta SPEC não libera produção nem release.

## 9. Decisões pedidas ao humano (T3)

| ID   | Pergunta                                                                                                                                 | Recomendação                                                                                                                      |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| SP-A | Entregar agora só o que o log v1 sustenta (estado, paradas, compactação) e deixar metas/todos para O08/O09 com tipos de evento próprios? | Sim; criar tipos de evento "vazios" agora sem consumidor seria dívida de catálogo.                                                |
| SP-B | "Pendência" = parada registrada no log (sem afirmar resolução), com a resolução vindo do armazenamento de aprovações no S05?             | Sim; o log não sabe da decisão e afirmar "em aberto" seria falso.                                                                 |
| SP-C | Quem grava o checkpoint: só o escritor (`flush`/`close`, a cada `K` eventos) ou também o leitor na primeira consulta?                    | Só o escritor; sem corrida e sem escrita em caminho de leitura. Sessão nunca fechada recalcula (`rebuild`), correto e mais lento. |
| SP-D | Expor `project` no SDK nesta onda ou só no serviço de persistência?                                                                      | Só no serviço (como FK-D do S04); SDK em fatia própria.                                                                           |
| SP-E | O cache pode guardar texto de mensagem para acelerar `esboço`/`título` do S03?                                                           | Não; o estado guarda só ids e contadores (I6). O S03 decide o que precisa e pede uma projeção própria.                            |
| SP-F | Cache em tabela dentro do mesmo esquema da sessão (opt-in) ou em armazenamento separado?                                                 | Mesmo esquema, mesma RLS e mesmo ciclo de migração opt-in; apagável sem perda.                                                    |
