# AUD20-005 — SPEC de least-privilege do rate limiter

## Problema e resultado desejado

`rate_limit_buckets` e uma tabela operacional nao-tenant criada pela migration
`0023_rate_limit_buckets.sql`. O caminho PostgreSQL injeta
`PostgresRateLimiter`, mas o preflight atual nao verifica a tabela, seu indice ou
os grants do papel runtime. Um papel runtime pode passar em `/health` e falhar
em qualquer rota ordinaria com `429` por erro de store.

Resultado: o startup deve falhar fechado antes de aceitar trafego quando a
estrutura do limiter estiver incompleta ou quando o papel runtime nao possuir
somente os DML necessarios; um papel runtime distinto deve conseguir executar
uma request ordinaria usando o limiter PostgreSQL.

## Evidencia atual

- CURRENT: a migration cria `rate_limit_buckets` e
  `idx_rate_limit_buckets_reset_at`, e revoga `PUBLIC`.
- CURRENT: a migration role e o owner das tabelas criadas; grants DML sao
  configurados explicitamente pela fixture de deployment/role.
- CURRENT: `assertRuntimeRoleIsLeastPrivilege` verifica tabelas tenant,
  quarentena e replay, mas nao `rate_limit_buckets`.
- CURRENT: `buildServerFromEnv` compoe `PostgresRateLimiter` em modo PostgreSQL
  e o teste de role existente verifica somente `/health`.

## Invariantes

1. A migration role continua sendo a owner DDL e permanece separada da runtime
   role.
2. A tabela do limiter existe como tabela regular, com colunas `key`, `count` e
   `reset_at`, constraint de contagem e os indices primary key/reset.
3. A runtime role possui `SELECT`, `INSERT`, `UPDATE` e `DELETE` na tabela,
   mas nao possui `TRUNCATE`, `TRIGGER` ou `REFERENCES`, nem e a owner.
4. `/health` nao e evidencia de que o caminho ordinario funciona; uma request
   rate-billed deve atingir o banco e nao retornar `429` por falta de grant.

## Design selecionado

- Adicionar a tabela operacional ao catalogo de ownership da migration role.
- Criar um preflight estrutural reutilizavel para tabela, colunas, constraints e
  indices do limiter, executado em todo modo PostgreSQL apos migrations.
- Estender o preflight de least-privilege da runtime role com o contrato DML do
  limiter.
- Manter `REVOKE ALL FROM PUBLIC` na migration; nomes de runtime roles sao
  dinamicos, portanto o grant explicito pertence ao setup de deployment/fixture,
  nao a um role hardcoded na migration.
- Testar: grant ausente falha startup; tabela/indice ausente falham o preflight;
  grant correto permite `/health` e request ordinaria.

## Fora de escopo

- Alterar a janela, cardinalidade, chave ou algoritmo do limiter.
- Criar RLS para a tabela operacional.
- Alterar `/health` para consumir o limiter.
- Qualquer provider, canal, dado real, deploy ou producao.

## Verificacao

- Testes unitarios do preflight para catalogos incompletos e privilegio indevido.
- Teste PostgreSQL descartavel com role migration/runtime distintas, grant
  explicito e request ordinaria.
- `npm run verify:phase4a` com `TEST_DATABASE_URL` no PostgreSQL da porta 55432.
- `npm run test:postgres`, typecheck, lint, format e certificacao integrada.
