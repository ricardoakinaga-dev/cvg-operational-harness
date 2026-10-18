# PostgreSQL do núcleo — papéis, schemas e verificação (C2, C3)

- Plano: [0374, Fase C](../../../docs/03_build/0374_plano_producao_harness.md), itens C2 e C3.
- Operação vigente: [0802](../../../docs/08_runtime/0802_harness_production_operations.md) (seção "Banco e papéis").
- Runbook da fase: [0805](../../../docs/08_runtime/0805_runbook_ambiente_real.md).
- Nada aqui foi executado num banco real. Todos os nomes abaixo são os
  defaults sintéticos do [.env.example](../.env.example).

## O que já existe e o que é novo

A receita executável dos papéis está no bloco "Roles and schemas" de
`scripts/production-stack-smoke.ts` (smoke 22/22 na imagem endurecida).
`scripts/baseline-postgres.ts` **não** cria papéis: ele registra a baseline de
um schema legado e não se aplica a banco novo. Por isso [roles.sql](roles.sql)
reproduz em SQL a mesma receita do smoke, para rodar num serviço gerenciado
sem Docker, e acrescenta o papel de backup.

| Papel            | Uso                                          | Onde a credencial vive                     |
| ---------------- | -------------------------------------------- | ------------------------------------------ |
| `cvg_migration`  | Dono do schema de dados; só o job `migrate`  | `DATABASE_MIGRATION_URL` (só no `migrate`) |
| `cvg_runtime`    | API e worker, sujeito a RLS                  | `DATABASE_URL`                             |
| `cvg_auth_owner` | Dono do schema de autenticação; só `migrate` | `CVG_OPERATOR_AUTH_MIGRATION_URL`          |
| `cvg_session`    | Sessão de operador na API (seis funções)     | `CVG_OPERATOR_SESSION_DATABASE_URL`        |
| `cvg_backup`     | `pg_dump` e âncoras; somente leitura         | `/etc/cvg-harness/backup.env`              |

Os quatro primeiros não têm `SUPERUSER`, `BYPASSRLS`, `CREATEDB`,
`CREATEROLE`, `REPLICATION` nem herança. O papel de backup é a única exceção a
`BYPASSRLS`: as tabelas usam `FORCE ROW LEVEL SECURITY` e o `pg_dump` recusa
gerar um dump que a política de linha filtraria em silêncio. Ele é somente
leitura (`default_transaction_read_only=on`), limitado a duas conexões e
nunca configurado no serving. Essa exceção precisa constar do parecer C10.

## Passo a passo num serviço gerenciado

1. **Instância.** PostgreSQL 16 (os preflights da API recusam outra major),
   TLS obrigatório, backup/PITR do provedor ligado como camada adicional.
   Baixe a CA do provedor para `/etc/cvg-harness/db-ca.pem` (modo 0644: o
   contêiner roda como uid 10001 e só precisa ler).
2. **Papéis e schema de dados** (administrador do serviço, uma vez):

   ```sh
   psql "<conexão do administrador>" -X \
     -v database=cvg -v data_schema=cvg_data \
     -v migration_role=cvg_migration -v runtime_role=cvg_runtime \
     -v auth_owner_role=cvg_auth_owner -v session_role=cvg_session \
     -v backup_role=cvg_backup \
     -f deploy/harness/postgres/roles.sql
   ```

   Na mesma sessão do `psql`, defina as senhas com `\password cvg_migration`
   (e assim para cada papel). O hash é feito no cliente; nada fica em
   histórico de shell nem em log do servidor. Gere cada senha com
   `openssl rand -hex 32` direto no cofre ([secrets](../secrets/README.md)).

3. **Remover pertencimentos implícitos.** No PostgreSQL 16, um administrador
   sem `SUPERUSER` recebe `ADMIN OPTION` em cada papel que cria. A API recusa
   um papel de sessão concedido a qualquer outro (`granted_to = 0`), então a
   consulta Q2 de [verify-roles.sql](verify-roles.sql) precisa voltar vazia.
   Para cada linha, como administrador: `REVOKE <papel> FROM <administrador>;`.
   Se o provedor não permitir, isso **bloqueia C2** e volta ao usuário (trocar
   de provedor/plano ou pedir mudança de código com SPEC).
4. **Primeira migração** com a janela do dono de auth (README do deploy, C3).
5. **Leitura do backup** (papel de migração, uma vez, depois da primeira
   migração):

   ```sh
   psql "<DATABASE_MIGRATION_URL>" -X \
     -v data_schema=cvg_data -v migration_role=cvg_migration \
     -v backup_role=cvg_backup \
     -f deploy/harness/postgres/backup-grants.sql
   ```

6. **Verificação** (papel de runtime basta; só catálogo e `schema_migrations`):

   ```sh
   psql "<DATABASE_URL>" -X -P pager=off \
     -v data_schema=cvg_data -v auth_schema=cvg_auth \
     -v migration_role=cvg_migration -v runtime_role=cvg_runtime \
     -v auth_owner_role=cvg_auth_owner -v session_role=cvg_session \
     -v backup_role=cvg_backup \
     -f deploy/harness/postgres/verify-roles.sql
   ```

## Saída esperada de verify-roles.sql

| Consulta | Esperado                                                                                                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1       | 5 linhas. Quatro papéis com `can_login=t` e `superuser`, `bypassrls`, `createdb`, `createrole`, `replication`, `inherit` = `f`. `cvg_backup`: só `bypassrls=t`; `config` com `default_transaction_read_only=on` |
| Q2       | 0 linhas                                                                                                                                                                                                        |
| Q3       | `cvg_auth` → `cvg_auth_owner`; `cvg_data` → `cvg_migration`                                                                                                                                                     |
| Q4       | `db_create=f` para os cinco (o dono de auth só tem `CREATE` dentro da janela da migração)                                                                                                                       |
| Q5       | migração dados `t/t`; runtime dados `t/f`; dono de auth auth `t/t`; sessão auth `t/f` e dados `f/f`; backup dados `t/f`; todo o resto `f/f`                                                                     |
| Q6       | 0 linhas (toda tabela com política tem `ENABLE` e `FORCE`)                                                                                                                                                      |
| Q7       | `tables_without_rls` igual ao do banco de ensaio (`--profile local-postgres`) no mesmo SHA; só tabelas de infraestrutura sem dado de tenant                                                                     |
| Q8       | `latest` = último arquivo de `packages/persistence/migrations` no SHA implantado (`0027_worker_operations` em `31dc1c3`)                                                                                        |

Os preflights da API e do worker repetem parte disso a cada boot e recusam
subir com desvio (papel com privilégio a mais, política incompleta, dono do
schema errado). O `verify-roles.sql` existe para a evidência de C2/C3 e para
achar o problema antes do boot.

## Se o provedor não permitir `BYPASSRLS`

No PostgreSQL 16 só cria um papel `BYPASSRLS` quem tem o atributo. Se o
administrador do serviço não tiver, há duas saídas, ambas decisão do usuário
registrada antes de C6:

1. Usar o snapshot/PITR do provedor como backup primário e manter as âncoras
   com `chain-anchors.mjs emit` no papel de runtime (ele lê sob o contexto do
   tenant e não precisa de `BYPASSRLS`), conferindo o restore do provedor com
   `chain-anchors.mjs verify`.
2. Dump por tenant com o papel de runtime e `pg_dump --enable-row-security`
   (cobre só as linhas do tenant e só as tabelas a que o runtime tem acesso).
   Precisa de um ensaio no `--profile local-postgres` antes de virar padrão.
