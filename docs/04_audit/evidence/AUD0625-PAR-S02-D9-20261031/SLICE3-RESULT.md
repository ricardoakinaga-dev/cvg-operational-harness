# PAR-S02 fatia 3 — o escritor grava o checkpoint (SPEC 0292 R1 §4, I8, PJ05, PJ08)

Autor: Claude D9. Branch `claude/aud0625-par-s02-build-d9`, sobre a fatia 2 `8b53c92e8`. Nota: [0292b](../../../02_spec/0292b_checkpoint_guard_and_stops_note.md).

## O que entrou (`packages/persistence/src/session-persistence.ts`)

- `projectionCheckpointEvery` (padrão 256, inteiro positivo, validado) e `SESSION_PROJECTION_CHECKPOINT_EVERY`.
- O handle do escritor mantém a cabeça do log e a projeção dobrada em memória: uma stream nova começa da projeção vazia; uma reaberta ou um fork começa sem projeção e a obtém uma vez, quando um checkpoint fica devido, por `project` (checkpoint + cauda, ou o log inteiro).
- Gatilho principal: o `append` (e o `append` da ponte do kernel) que faz `cabeça - checkpoint >= K`, **depois do commit**, no mesmo bilhete da fila do handle. `flush` e `close` tentam também quando está devido (inclusive um writer aberto e fechado sem anexar nada). A posição do último checkpoint é lida uma vez por handle.
- A gravação é uma transação própria no canal do dono: lê o cabeçalho e o digest do ponto e faz `INSERT … ON CONFLICT DO UPDATE … WHERE a posição nova é maior`. Qualquer falha (tabela ausente, sem privilégio, estado acima de 64 KiB, erro do gatilho) é contada em `projectionCacheStats()`, entregue ao observador e engolida; depois de uma tentativa que falha, o escritor só tenta de novo após mais `K` eventos. Um replay de evento já guardado não move nada.

## Provas

- PG 41/41 em `aud0625-par-s02-red-postgres.test.ts`; 14 novos nesta fatia, entre eles os RED da 07 com o **escritor real** no lugar do `seedCheckpoint`: o fechamento deixa um checkpoint, a projeção seguinte é `cache` com no máximo uma linha, uma cauda curta é `incremental` com cauda+1 linhas (K = 64; sessões de 200 eventos). Outros: o `append` que cruza K grava na hora (antes de flush e de close); uma sessão longa de writer aberto, 240 eventos de 8 em 8, é checkpointada a cada K sem **nenhuma** linha lida (PJ05), e o estado guardado em cada ponto é igual à projeção pura do prefixo; flush e close escrevem o que está devido, inclusive sem append neste handle; um close sem nada devido não escreve; a ponte do kernel conta e o replay não move nada nem conta falha; PJ08 (cache que não grava: append, flush e close seguem, 2 falhas contadas e reportadas em 28 eventos com K = 10, `verifyProjectionCache` as acusa; esquema sem a tabela; estado acima do teto recusado com `state_too_large`, projeção ainda correta); writer reaberto lê o checkpoint e só a cauda; append curto depois de um checkpoint no fim não escreve; fork; intervalo padrão 256; intervalo inválido.
- Falha de teste achada no caminho: o teste do "buraco nas páginas" (fatia 2) trocava `query` em clientes do pool compartilhado e contaminava os testes seguintes com "Session log has a gap"; passou a usar um pool próprio, encerrado no fim.
- Regressão S01+S04 em PG com o gancho do escritor ativo: 107/107, sem alteração nos testes. `SKIP-PG-S02-001` religado (41 esperados).
- Mutantes (`mutations-slice3.json`): 17/17 mortos. Três sobreviveram na primeira passada: o `append` que conta replay e a cabeça de fork zerada (agora o teste afirma que nenhuma falha de cache é contada), e uma checagem de "projeção atrás da cabeça" que era equivalente (a projeção em memória ou está na cabeça ou é indefinida) e foi simplificada.
- typecheck, eslint, prettier, links, skip:governance: ver o commit.

## Limites

O gatilho de `close` só tem efeito observável num escritor que abre e fecha sem anexar (o `append` já cobre o resto). `resumeSession` ler pelo checkpoint e o registro no cartão S02 ficam para a fatia 4.
