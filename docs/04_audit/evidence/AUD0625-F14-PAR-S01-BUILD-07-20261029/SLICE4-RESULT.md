# PAR-S01 fatia 4 — append, flush (barreira de WAL), close, perda e COMMIT incerto

Task `AUD0625-F14-PAR-S01-BUILD-07-20261029`, Claude Sonnet sessão 07. Base: fatia 3 corrigida e aprovada (Claude DF, `9ec9e82e9da2`, APPROVE).

## O que entrou

- `append(events, { signal })`: um ticket na fila única do handle.
  - Admissão: recusa por ordem fechado > somente leitura > perdido. O lote é capturado uma vez antes do primeiro await (`captureSessionJson`, mesma captura do header), validado por `validateSessionEvent` (fingerprint atual) e conferido contra o envelope do handle (tenant e sessão). Teto de 8 MiB por lote, 1 MiB por evento (esquema). Lote vazio é no-op sem IO num escritor ativo e não ganha exceção em handle fechado, leitor ou perdido.
  - Execução: uma transação na conexão dona (`synchronous_commit on`, tenant, timeouts de 5 s). A sequência é a do chamador e nunca é renumerada: sequência velha, com lacuna ou `eventId` repetido dá `SessionAppendConflictError` e desfaz o lote inteiro. Cada evento é INSERT seguido do avanço unitário do cursor.
- `flush({ signal })`: a barreira é um UPDATE do cursor para o próprio valor sob a posse, com COMMIT síncrono. Gera WAL mesmo sem mudança lógica; um COMMIT só de leitura não serviria.
- `close`/`asyncDispose`: CLOSING antes do primeiro await, promise memoizada (e o erro também), drena a fila admitida, tenta o flush final e só então destrava e libera a conexão uma vez. Flush final que falha não é close com sucesso: o erro é preservado, a conexão é destruída e a vaga volta.
- Perda e incerteza: erro sem SQLSTATE, classes 08 e 57, `55P03` ou ROLLBACK que falha tornam o handle terminal (`SessionOwnershipLostError`, conexão destruída, nunca reconecta). COMMIT sem resposta vira `SessionCommitUnknownError`; o handle fica terminal e `close` devolve essa incerteza (depois de liberar os recursos). Erro de dados (SQLSTATE 23) é conflito e o handle segue usável; outros erros de servidor são `SessionStorageUnavailableError` e o handle segue usável. Um ticket já na fila atrás de um perdido é recusado sem IO.
- Fatia 3: o `qualify` no lease agora roda dentro de `BEGIN` com `SET LOCAL statement_timeout` (nota opcional do DF).
- `SessionAppendConflictError` é uma categoria CVG nova (como Migration/Storage/CommitUnknown): sequência velha ou id repetido não é corrupção nem indisponibilidade.

## Provas (PG 16.15 descartável, role non-owner NOBYPASSRLS)

- `par-s01-session-writer-postgres.test.ts`: 23 testes. Conjunto S01 (header, 0034, 0028, adaptador, escritor): 128 verdes antes dos testes extras.
  - Lote atômico lido pelo escritor, por outro processo e pelo store legado; o legado continua a sequência depois do close.
  - Fila em ordem de chamada, handle usável depois de recusa; lote inteiro desfeito em conflito.
  - Captura única: mutação posterior e getter A/B não mudam o que é gravado.
  - Barreira de WAL medida: o LSN do WAL avança em flush de sessão vazia e recém-criada; o SQL do flush é o UPDATE.
  - Close com fila pendente: tudo gravado, flush antes do unlock, uma só liberação; flush final com falha preserva o erro e destrói.
  - COMMIT incerto, ROLLBACK que falha, backend terminado, SQLSTATE 08/57/55P03/sem código e erro comum de armazenamento.
  - Aborto antes do IO e na fila sem IO; leitura depois de append resolvido enxerga ao menos aquele head em qualquer handle.
- Mutação (`mutate-s4.py`, `mutations-s4.json`): 33 mutantes; 5 sobreviveram na 1ª rodada, viraram testes, 33/33 mortos. O `close-drain` da fatia 3 agora morre.
- typecheck, eslint e prettier limpos.

## Limites

- tmpfs: kill abrupto do processo com PG vivo e crash/restart do PG ficam para a fatia 6 (S5). A barreira é provada pelo avanço do WAL e pelo SQL; a durabilidade sob queda real do disco não é afirmada.
- Ainda sem a ponte `sessionEventStoreForHandle` (fatia 5), sem os testemunhos S1–S5 em processos distintos (fatia 6) e sem adoção em lote/restore (fatia 7).
- `skip-catalog` e `mutation-manifest` não foram tocados.
