# PAR-S01 fatia 2 — migration 0034 (propriedade de escritor), guards e testes PG

Task `AUD0625-F14-PAR-S01-BUILD-07-20261029`, Claude Sonnet sessão 07. Revisão da fatia 1: APPROVE sem achados (Claude DF, 29/10/2026, sobre `fb15ae97fd8c9c152308e0e18a8bc5e469c27142`).

## O que entrou

- `packages/persistence/migrations/0034_session_writer_ownership.sql`: no esquema dedicado, depois da 0028.
  - Colunas `writer_lock_id` (identity `NO CYCLE`, único, positivo), `header_json` (texto, até 64 KiB) e `inherited_event_count`, pareadas.
  - Trigger de INSERT em `session_events`: try-lock transacional da chave `(oid(session_streams) − 2^31, writer_lock_id)`, sem espera (sem ciclo linha/advisory), e `sequence = next_sequence`.
  - Trigger de UPDATE em `session_streams`: `writer_lock_id` imutável, header/cut congelados, adoção NULL→metadata só pelo dono da tabela, cursor = MAX(sequence)+1.
  - DELETE e TRUNCATE de streams recusados.
  - Constraint triggers diferidos ao COMMIT em events e streams.
  - Stream criado pelo caminho legado ganha header honesto (unseeded, cut 0); os históricos ficam NULL (migration-required).
  - Funções sem EXECUTE público e com `search_path` fixo. Sem SECURITY DEFINER.
- `runSessionEventMigrations` aplica 0028 e 0034. A 0034 **não** entra em `POSTGRES_MIGRATIONS`; `postgres-migrations.ts` e `rem21-010` ficam inalterados (diff vazio), logo a prova REM21 não se move.
- Teste da 0028 ajustado: o INSERT direto que simula fato corrompido agora avança o cursor na mesma transação (a regra nova recusa o contrário).

## Provas (PG 16.15 descartável, contêiner próprio, role non-owner NOBYPASSRLS, UPDATE só em `next_sequence`)

- `par-s01-session-ownership-postgres.test.ts`: 26 testes; `pdsh-021-session-events-postgres.test.ts` (store legado inalterado): 9 testes. Todos verdes.
  - O store legado funciona sob os guards e recusa limpo enquanto outra conexão detém a chave.
  - A chave é a do `oid` (testada com travas vizinhas e com a trava exata).
  - A conexão dona escreve sob o próprio lock; leitores não bloqueiam.
  - Interleaving linha-antes-de-advisory termina em recusa 55P03, sem deadlock.
  - O lock some quando a conexão dona cai.
  - Cursor pulado, regredido, atrasado ou à frente é recusado, no comando e no COMMIT; `SET CONSTRAINTS ALL DEFERRED` não adia além do COMMIT.
  - Role sem dono não desativa triggers nem muda `session_replication_role`.
  - O header com `\u0000` escapado sobrevive byte a byte; tenants diferentes e esquemas diferentes dão chaves distintas.
  - Esgotamento do identity falha fechado.
- Mutação da SQL: `mutate-s2.py`, 26 mutantes. 21 mortos de primeira; 5 sobreviveram (`no-identity-nocycle`, `no-unique`, `stream-guard-cursor`, `commit-check-streams`, `revoke-public`) e viraram testes novos; reexecutados, 26/26 mortos (`mutations-s2.json`).
- typecheck, eslint e prettier limpos.

## Limites

- Só roda no PG descartável com `TEST_DATABASE_URL`; sem ele os testes PG são pulados, como na 0028. O contêiner usou tmpfs, então **não** prova crash/restart do PG (fica para S5, fatia 6).
- Sem adoção em lote nem teste de restore/rollback de aplicação (matriz da seção 9 da SPEC): fatia 7.
- Cinco testemunhos S1–S5, adaptador e preflight de grants/durabilidade ficam para as fatias 3–6.
