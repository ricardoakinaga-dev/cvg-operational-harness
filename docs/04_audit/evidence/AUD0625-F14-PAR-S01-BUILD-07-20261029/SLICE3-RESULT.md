# PAR-S01 fatia 3 — adaptador de sessão física, create/open/read e preflight

Task `AUD0625-F14-PAR-S01-BUILD-07-20261029`, Claude Sonnet sessão 07. Base: fatia 2 corrigida e aprovada
(Claude DF, `a0366d5f24dc`, APPROVE sem achados novos). Registro da fatia 1: APPROVE sem achados (DF, 29/10/2026).

## O que entrou

- `packages/persistence/src/session-connection-lease.ts`: porta `PostgresPhysicalSessionPool`/`PhysicalSessionLease` (query, `onLost`, `release`, `destroy` idempotentes) e adaptador `createPgPhysicalSessionPool` com um `pg.Client` dedicado por lease. Prazo e aborto são do adaptador; um lease que chega depois do prazo é destruído por ele.
- `packages/persistence/src/session-persistence.ts`: `createPostgresSessionPersistence(physical, readPool, { tenantId, schemaName, maxOpenWriters })` devolve `{ service }`.
  - **Preflight** que falha fechado, com mensagem própria por causa: tabelas, colunas da 0034, checksum da migration, RLS forçado, triggers habilitados, role (superuser, BYPASSRLS, dona das tabelas), primário (não standby) e `fsync`/`full_page_writes`/`synchronous_commit`.
  - `create`: valida e captura o header uma vez antes do primeiro await; INSERT do stream com header em texto e cut; exatamente um try-lock de sessão antes do COMMIT; handle só depois do COMMIT. COMMIT incerto vira `SessionCommitUnknownError`, a conexão é destruída e o handle nunca nasce. Duplicata é `SessionAlreadyExistsError` sem tocar o dono.
  - `open` write: metadados, try-lock em chamada separada e revalidação de chave, header, cut e head depois da claim e antes de publicar. `open` read usa o pool e nunca toma lock.
  - `read`: offset/length validados na admissão; snapshot `REPEATABLE READ READ ONLY` no pool; prefixo completo validado em páginas de 256 (digest, sequência, identidade, lacuna), mesmo fora da fatia; marca d'água por handle contra regressão.
  - `close`/`asyncDispose`: marca CLOSING antes do primeiro await, promise memoizada, libera o lock uma vez e nunca devolve ao pool uma sessão cujo unlock não foi confirmado (destrói). Sessão perdida: handle terminal, `append`/`flush` recusam com `SessionOwnershipLostError`, leitura segue.
  - `maxOpenWriters`: recusa a saturação sem claim parcial; a vaga volta em close, falha ou COMMIT incerto.
- `append` e `flush` ainda NÃO existem (fatia 4): o writer devolve erro explícito, e o reader devolve `SessionReadOnlyError`.

## Revisão DF da fatia 3 (CHANGES_REQUESTED) e correção

- **P2** (a conexão que escreve nunca passava pelo preflight): as checagens viraram `qualify()` e rodam também em CADA lease de escritor, logo depois da aquisição e antes de qualquer escrita: role (superuser, BYPASSRLS, dona das tabelas), standby, durabilidade, RLS, triggers, constraints e a identidade `to_regclass(...)::oid − 2^31 === keyBase` vista por aquela sessão. Falhou: `destroy` do lease, a vaga de `maxOpenWriters` volta e sai `SessionMigrationRequiredError` sem role nem chave. Testes: escritor superuser e escritor dono recusam `create` e `open` duas vezes com capacidade 1, sem gravar nada e sem conexão remanescente; escritor apontando para outro banco com as mesmas 0028+0034 recusa por identidade. Mutantes `writer-qualify-skipped`, `writer-key-identity` e `writer-qualify-destroy` mortos.
- **P3-1**: o preflight exige agora `session_streams_no_truncate` e `session_events_no_truncate` e as cinco constraints da 0034 validadas (`convalidated`); testes e três mutantes.
- **P3-2** (observação, candidato a emenda da SPEC): a SPEC manda validar o prefixo inteiro a cada `read`, em páginas de 256. Com eventos de até ~2 MiB em jsonb o pico é de ~512 MiB por página e o custo é O(head) por leitura. Proposta de emenda: paginar por bytes e validar só o delta depois do high-water, já que fatos imutáveis com PK preservam a contiguidade (SPEC l.178). Não implementado: a fatia segue fiel à SPEC aprovada.

## Provas (PG 16.15 descartável, role non-owner NOBYPASSRLS)

- `par-s01-session-adapter-postgres.test.ts`: 44 testes. Toda a pasta persistence PG da sessão: 26 (0034) + 9 (0028) + 44 = 79 verdes.
  - Duas aquisições simultâneas não compartilham backend; lease tardio é destruído.
  - Lock exato visto em `pg_locks`; queda do backend libera o lock e o handle não revive.
  - Outro serviço não reclama uma sessão com dono; outro tenant não vê nada.
  - Corrupção fora da fatia, lacuna, dígito, sequência, sessão e head em regressão são recusados; versão de header nova/antiga, identidade e não-JSON dão erros distintos.
- Mutação (`mutate-s3.py`, `mutations-s3.json`): 59 mutantes; 55 mortos e 4 equivalentes justificados (`event-tenant`: o tenant já está no digest; `admit-abort`: a fila reconfere o sinal antes do IO; `close-lost-destroy`: o unlock falha e o catch destrói; `close-drain`: o read não usa o lease, e será morto com append/flush na fatia 4).
- typecheck, eslint e prettier limpos.

## Limites

- Contêiner em tmpfs: crash/restart do PG fica para a fatia 6. Sem PgBouncer testado (proibido por contrato; o adaptador usa conexão dedicada).
- `SessionPersistence.flush()` agregado, `stat`/`list`, `owner.shutdown` e tickets continuam adiados pela recomposição.
- `skip-catalog` e `mutation-manifest` não foram tocados.
