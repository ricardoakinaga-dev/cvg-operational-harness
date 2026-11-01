# PAR-S02 fatia 2 — tabela, `project` e `verifyProjectionCache` (SPEC 0292 R1 §4-§5, §7)

Autor: Claude D9. Branch `claude/aud0625-par-s02-build-d9`, sobre a fatia 1 `493e8ed29`.

## O que entrou

- `packages/persistence/migrations/0036_session_projection_checkpoints.sql` (opt-in, depois de 0028 e 0034, mesmo esquema dedicado): tabela `session_projection_checkpoints` `(tenant_id, session_id, projection_id, projection_version, through_sequence, tail_input_digest, header_digest, state jsonb, state_digest, created_at)`, chave `(tenant_id, session_id, projection_id)`, FK para `session_streams`, RLS forçada por `cvg.tenant_id`, e um gatilho que só deixa escrever o **dono do stream** (try-lock do mesmo par de chaves do S01, reentrante na conexão do dono), exige que o ponto seja um evento real com o mesmo `input_digest`, que o `header_digest` seja o do cabeçalho do stream, que a posição só avance e nunca passe do fim do log. `TRUNCATE` recusado. O SQL não confere o conteúdo do estado (SP-G). `runSessionProjectionMigrations` aplica 0028, 0034 e 0036.
- `packages/harness/src/session/projection-cache.ts` (puro): `sessionCheckpointRow`, `judgeSessionCheckpoint` (versão, forma do estado, posição do estado, digest do estado, digest do cabeçalho, posição dentro do log), `sessionHeaderDigest`, `sessionProjectionStateDigest` (sobre o JSON canônico).
- `SessionPersistence.project(id, options?) → { projection, origin, throughSequence, cache }` (contrato aditivo): numa transação `REPEATABLE READ READ ONLY` lê o stream, o checkpoint (sob `SAVEPOINT`, para um erro de leitura não abortar a transação) e só o que precisa do log. `cache` (checkpoint íntegro no fim, lê só a linha do ponto), `incremental` (cauda validada + `foldSessionProjection`) ou `rebuild` (log inteiro pela mesma validação do `read`). Um checkpoint que passa no digest mas não continua o log (o `fold` recusa) é ignorado e o log decide. O campo `cache` (`hit`, `absent`, `invalid`, `unavailable`) diz por que foi preciso ler tudo. `project` não escreve.
- Falha do cache (tabela ausente, sem privilégio): contada em `projectionCacheStats()` e entregue ao observador opcional `onProjectionCacheFailure` (sem texto de mensagem); um observador que lança não muda nada.
- `verifyProjectionCache(service, id)`: reconstrói do zero pelo leitor validado, compara com o que `project` serve, e acusa projeção divergente, checkpoint inválido, cache ilegível, escritas que falharam e um log que a análise completa recusa mas o `fold` aceita (I2).

## Provas (PJ04–PJ10; PJ05 por contagem de linhas)

- PG 27/27 em `aud0625-par-s02-red-postgres.test.ts` (1 controle de custo, 8 testemunhas da fase 1 agora verdes, 18 novos): três `origin` iguais ao rebuild e verificação vazia; contagem de linhas (rebuild N, incremental cauda+1, cache 1); quatro adulterações (ponto com outro digest, cabeçalho diferente, posição além do log, posição que é outro evento) → `rebuild` com `cache: invalid`; mesmo `sessionId` em dois tenants; RLS nos dois sentidos pelo papel de serviço; cache ilegível contado e reportado, observador que lança, esquema sem a tabela; checkpoint **consistente mas errado** servido por `project` e achado pelo `verify` (SP-G); log com turno que volta (do zero recusa, o `fold` no corte aceita, o `verify` acusa); fork sem o cache e compactação só dobrada; checkpoint que passa no digest mas não continua o log; buraco nas páginas = corrupção; sessão ausente, id inválido, aborto; as guardas do gatilho (só o dono, ponto real, nunca para trás, nunca além do log, sem `TRUNCATE`, precisa do stream); RLS forçada no catálogo.
- Puro: `tests/aud0625-par-s02-slice2-cache.test.ts` 19 casos, cobertura 100% por arquivo em `projection-cache.ts`.
- Regressão: S01 e S04 em PG (adapter, writer, adoção, resume) 107/107 sem alteração. `SKIP-PG-S02-001` religado ao novo hash com 27 esperados.
- Mutantes: 31 (`mutations-slice2.json`): 30 mortos e 1 equivalente declarado (S10: o predicado de tenant da consulta do checkpoint é redundante com a RLS do papel de serviço, que o preflight impede de contornar; fica como defesa em profundidade). Cinco sobreviveram na primeira passada (S4, S8, S11, M7 e o S10) e geraram testes novos: checkpoint que não continua o log, buraco nas páginas, aborto com resposta em cache, e RLS forçada.
- typecheck, eslint e prettier limpos, `skip:governance` PASS.

## Reparametrização dos testes de PG da fase 1 (R1 prevalece sobre o molde da R0)

Os testes da 07 foram escritos no molde da R0: assumiam um `project` que cria o checkpoint. A R1 §4.5 diz que `project` não escreve e que o escritor grava a cada `K` (padrão 256). A fatia 2 não tem escritor; os testes que precisam de um checkpoint o guardam com `seedCheckpoint`, que faz o que o dono do stream fará (linha derivada da projeção pura, pelo papel da migração, sem sessão aberta). **Nenhuma asserção mudou.** Só o setup:

| Teste | Antes (R0) | Depois (R1, fatia 2) |
|---|---|---|
| first projection is a rebuild equal to the pure projection | `seeded(10)`, `close`, `project` | igual (sem checkpoint, `rebuild` por construção) |
| after the writer closes, the next projection comes from the checkpoint and reads at most the tail row | `seeded(50)`, `close`, **`project(id)`** cria o cache, `project(id)` | `seeded(50)`, `close`, **`seedCheckpoint(id, events, events.length)`**, `project(id)` |
| events appended after the checkpoint are folded incrementally | `seeded(50)`, `close`, **`project(id)`**, reabrir, anexar, fechar | `seeded(50)`, `close`, **`seedCheckpoint(...)`**, reabrir, anexar, fechar |
| a tampered checkpoint is never served | `seeded(20)`, `close`, **`project(id)`**, `UPDATE state` | `seeded(20)`, `close`, **`seedCheckpoint(...)`**, `UPDATE state` |
| a checkpoint of another projection version is ignored | `seeded(20)`, `close`, **`project(id)`**, `UPDATE projection_version` | idem com **`seedCheckpoint(...)`** (agora também desestrutura `events`) |
| checkpoints never cross tenants | `seeded(5, tenantA)`, `close`, **`a.svc.project(a.id)`** | `seeded(5, tenantA)`, `close`, **`seedCheckpoint(a.id, a.events, ..., tenantA)`** |
| a cache that cannot be read or written never fails the projection | `seeded(10)`, `close`, **`project(id)`**, `REVOKE` | `seeded(10)`, `close`, **`seedCheckpoint(...)`**, `REVOKE`, e o `GRANT` de volta num `finally` (teardown, para os testes seguintes) |
| the stored checkpoint holds no message text | `seeded(5)`, `close`, **`project(id)`** | `seeded(5)`, `close`, **`seedCheckpoint(...)`** |

Duas observações. (1) O molde da R0 com K padrão também não se sustentava: a sessão de 40 eventos devia dar `rebuild` e a de 200 `cache`, sem nenhum K entre os dois. (2) A fatia 3 troca o `seedCheckpoint` pelo escritor real (K pequeno por opção, sessões maiores que K) e acrescenta os testes do gatilho no `append`; os de `project` acima continuam como estão.

## Desvios e achados

1. O gatilho do SQL é mais forte que a SPEC (dono, ponto real, cabeçalho, só avança, não passa do log): fecha escrita por outro papel ou fora da posse do stream. Sem ele um papel com INSERT na tabela poderia plantar um checkpoint apontando para qualquer ponto.
2. O avanço-só da R1 §4 (`ON CONFLICT … só avança`) ficou também no gatilho de UPDATE, então a adulteração de teste por `UPDATE state` ainda passa (posição igual) e a que anda para trás é recusada; `UPDATE` de teste que muda ponto ou cabeçalho usa `session_replication_role = replica`.
3. `project` devolve o campo extra `cache` (`hit`/`absent`/`invalid`/`unavailable`), pedido pelo `verifyProjectionCache`; é aditivo.

## Não feito (próximas fatias)

Gatilho no `append` que cruza `K` (e `flush`/`close`), estado dobrado no escritor, contador de escrita (`writeFailures` existe e fica em zero até lá) e PJ05/PJ08 do lado do escritor (fatia 3); `resumeSession` pelo checkpoint (fatia 4).
