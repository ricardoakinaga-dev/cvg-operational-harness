# Revisão independente — SPEC 0257 R2, fatia 1 (F07), branch `claude/aud0625-0257-07` @ `15381179`

Revisora: sessão Claude D9. Somente leitura sobre a worktree da 07 (cópia descartável detached). PostgreSQL 16.15 em contêiner próprio (`claude-d9-f08b-pg`, carga 5–9 nas rodadas PG), Node 22.23.2, `--maxWorkers=1`, timeout 180 s. Sem push.

## Veredito: REVISE (um obrigatório, quatro P3)

A persistência em si está correta nos pontos que você pediu (itens 1–4): não achei janela de recurso sem evento, nem de evento sem recurso, nem falha de COMMIT incerto, de migration ou de perfil. **Mas a mudança do perfil para `read-insert` quebra 16 testes PG existentes que a 07 não listou** (O1), e as mutações mostram testes que passariam sem a correção (P3).

## O1 (obrigatório) — dois helpers de teste ainda concedem UPDATE em todas as tabelas do inventário

`apps/api/src/__tests__/production-bootstrap-postgres-own.test.ts:122` e `apps/api/src/__tests__/support/oidc-postgres-fixture.ts:107` percorrem `TENANT_SCHEMA_TABLES` com `GRANT SELECT,INSERT,UPDATE`. Com o inventário novo, o preflight da API recusa o role (`PostgreSQL runtime role must satisfy least-privilege separation`). O fixture é usado por `oidc-login-postgres.test.ts` e `oidc-login-entrypoint-postgres.test.ts`.

- Sem a correção ([pg-unreported-before-fix.txt](proofs/pg-unreported-before-fix.txt)): 3 arquivos, **16 falhas**, 2 passam, 2 pulados.
- Com `GRANT ${table === 'api_creation_receipts' ? 'SELECT,INSERT' : 'SELECT,INSERT,UPDATE'}` nos dois lugares ([fix-grants.diff](proofs/fix-grants.diff)): **20 de 20 passam** ([pg-unreported-after-fix.txt](proofs/pg-unreported-after-fix.txt)).
- Causa de processo: a lista de "testes PG afetados" foi feita à mão (7 arquivos). Teria saído de `git grep -l TENANT_SCHEMA_TABLES` (28 ocorrências; só esses dois ficaram de fora). Sugestão: usar `tenantRuntimeGrantPrivileges(table)` nos dois (o helper já existe) e rodar os três arquivos.

## Itens pedidos

1. **Memória: seção crítica e ponteiro único.** `InMemoryApiCreation.#critical` é síncrona (nenhum `await` entre ler o estado vivo e publicar), os repositórios reatribuem arrays em vez de dar `push` (copy-on-write sobre o objeto `detached`), e a publicação é uma atribuição do ponteiro. Resultado: **sem janela de recurso sem evento ou evento sem recurso**; uma falha antes da publicação deixa o vivo intacto (MEM7, `detached = live`, mata 9 testes). Duas observações:
   - **P3-a (provado, [mem-probe.txt](proofs/mem-probe.txt)):** `publish` só confere as 6 coleções que a operação leu; `{...live}` leva as outras por referência. Um escritor que mexe em outra coleção (por exemplo `outboxEffects`) entre o snapshot e a publicação **é sobrescrito sem erro** (`P2 ... => created outbox after=[]`). Em produção não há intercalação possível (síncrono), então só vale para o seam de teste, mas a garantia "nunca sobrescreve" do §5 não vale por inteiro. Correção: capturar todas as chaves de `live` (`Object.keys`).
   - **P3-b:** nenhum teste troca o ponteiro inteiro; remover `if (this.#state !== expected) return false` (MEM1) **sobrevive**. A sonda P1 mostra que o código está certo (`threw Creation aborted`), falta fixar num teste. Também sobrevive MEM8 (sessão de outro tenant na aprovação em memória): falta um teste de sessão estrangeira para a aprovação.
2. **PG: `runCreationTransaction`.** Lock `pg_advisory_xact_lock(hashtextextended(json(['api-creation-lock-v1', tenant, route, key_digest]), 0))` depois do contexto de tenant; contexto limpo e verificado antes do COMMIT; COMMIT enviado + erro destrói o client; `release` guardado por flag. Mutações mortas: PG1 (sem lock), PG3 (COMMIT incerto reaproveita o client), PG5 (sem limpeza do contexto), PG6 (perdeu a chave legada), PG8 (digest ignorado). Sobrevivem, todas sem efeito de segurança:
   - PG2 (lock sem a rota) e PG4 (sem o guarda de `release` duplo): equivalentes hoje (rotas têm recibos independentes; nenhum caminho libera duas vezes).
   - **P3-c, PG7:** falha do `ROLLBACK` que devolve o client ao pool sem destruí-lo não tem teste (AC11 só cobre a limpeza do contexto).
   - **P3-d, PG10:** sem `assertSession` o INSERT falha pela FK composta (erro 500 em vez de `invalid_action`), sem vazamento entre tenants; falta teste do código de erro.
3. **Migration 0030.** `ENABLE`+`FORCE RLS`, política por tenant, `REVOKE ... FROM PUBLIC`, triggers que recusam UPDATE/DELETE (por linha) e TRUNCATE (por comando), PK `(tenant, route, key_digest)`, UNIQUEs de suporte só se ausentes (por nome de constraint), numeração livre (a base termina em 0029; nenhuma outra branch usa 0030) e forward-only (nada publicado foi tocado). Mutações: DB1 (sem FORCE) e DB2 (sem trigger de UPDATE/DELETE) e DB5 (CHECK de forma) morrem. **P3-e, sobrevivem:** DB3 (trigger de TRUNCATE), DB4 (UNIQUE de audit), DB6 (UNIQUE de task), DB8 (FK do audit); DB7 (política sem `WITH CHECK`) é equivalente (o `USING` vale como check no `INSERT`). Nenhuma das ausências é falha do código, são lacunas do AC07. Nota: o FK do audit e os de task/session bloqueiam qualquer retenção que apague essas linhas (não há `DELETE FROM` delas no repositório hoje).
4. **Perfil read-insert.** Inventário (`runtimePrivileges`, `TENANT_READ_INSERT_TABLES`), API e worker exigem exatamente o perfil, `migrate-job` concede `SELECT, INSERT` (nada além). O `backup-grants.sql` só concede SELECT. **Fora o O1**, não achei outro lugar que conceda UPDATE em todo o inventário. P3-f: o preflight usa `has_table_privilege`, então um `GRANT UPDATE (coluna)` passaria; o trigger ainda o recusa.
5. **Os 3 PG pesados que a 07 mudou sem rodar** (mais `continuous-worker-entrypoint`, que também mudou): `kernel-composition-postgres`, `continuous-worker-postgres`, `case-assignment-authorization-postgres`, `continuous-worker-entrypoint`: **4 arquivos, 25 de 25 passam** ([pg-heavy-unrun-by-07.txt](proofs/pg-heavy-unrun-by-07.txt)).
6. **Testes que passariam sem a correção.** Mutações de memória ([mem-mutations.txt](proofs/mem-mutations.txt)): 6 mortas, 2 sobrevivem (P3-b). Mutações de PG e migration ([pg-mutations.txt](proofs/pg-mutations.txt)): 8 mortas, as sobreviventes estão em P3-c/d/e.

## Pedido à 07

1. **Obrigatório:** O1 (os dois grants) e rodar os três arquivos PG.
2. P3-a: capturar todas as coleções; P3-b/c/d/e: um teste para cada sobrevivente (ponteiro trocado, sessão estrangeira na aprovação em memória, ROLLBACK com falha, erro de sessão ausente, TRUNCATE, UNIQUEs de task/audit, FK do audit).

Nada disto muda a conclusão de que o desenho da fatia está certo. Produção segue `NO_GO`.
