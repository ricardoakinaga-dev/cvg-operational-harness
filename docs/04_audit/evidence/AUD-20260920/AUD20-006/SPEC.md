# AUD20-006 — SPEC de deduplicação durável de approval decisions

## Problema e resultado desejado

`approval_decision` precisa convergir para um único evento por
`(tenant_id, approvalId, decision)`. O repositório faz uma leitura antes do
`INSERT` e depende do índice parcial único para fechar a corrida entre processos.
A migration `0021` atual emite `NOTICE` e registra sucesso mesmo quando não
consegue criar esse índice por causa de duplicatas legadas.

Resultado: duplicatas históricas não serão reconciliadas automaticamente; elas
bloquearão a migration sem alterar dados. O startup PostgreSQL também falhará
fechado se o índice estiver ausente, inválido, não pronto, não único ou com
definição diferente da especificada. Duas execuções concorrentes da migration
devem convergir sob o advisory transaction lock do runner.

## Evidência atual

- CURRENT: `0021_approval_decision_audit_dedupe.sql` usa
  `CREATE UNIQUE INDEX IF NOT EXISTS`, mas pula duplicatas com `NOTICE`.
- CURRENT: `runPostgresMigrations` mantém um advisory lock transacional por
  migration, porém 0021 contém `BEGIN/COMMIT` aninhado e pode encerrar a
  transação do runner antes do marcador de `schema_migrations`.
- CURRENT: `PostgresRuntimeRepository.appendAudit` depende da violação do índice
  para convergir uma corrida de append concorrente.
- CURRENT: `assertTenantIsolationSchema` verifica somente nomes de índices; o
  preflight não valida o índice de deduplicação fora do modo RLS.
- UNKNOWN: qualquer volume ou conteúdo de dados reais; esta rodada usa somente
  schemas PostgreSQL sintéticos e descartáveis.

## Invariantes

1. Duplicatas legadas não são apagadas, mescladas ou reassociadas
   automaticamente; a migration falha antes de gravar seu marcador.
2. `uq_audit_approval_decision` é um índice único, válido e pronto sobre
   `audit_events`, com três expressões `(COALESCE(tenant_id, ''),
payload->>'approvalId', payload->>'decision')` e predicado
   `type = 'approval_decision'`.
3. O preflight rejeita ausência, nome reaproveitado com definição errada,
   índice inválido ou índice não pronto antes de aceitar tráfego PostgreSQL.
4. Execuções concorrentes da migration deixam exatamente um índice válido e um
   marcador de migration, sem erro de estado parcial.
5. O tenant persistido no índice continua sendo a autoridade; payload e
   identificadores enviados pelo cliente não alteram o escopo.

## Design selecionado

- Remover os delimitadores `BEGIN/COMMIT` da migration 0021; o runner já possui
  a transação e o advisory lock, que devem cobrir a criação do índice e o
  `INSERT` de `schema_migrations`.
- Substituir os `NOTICE` por `RAISE EXCEPTION` para coluna ausente, duplicatas e
  índice incompatível. A política de dados é bloquear, não reconciliar.
- Validar semântica do catálogo em uma função de preflight reutilizável:
  `indisunique`, `indisvalid`, `indisready`, tabela, cardinalidade e expressões.
- Exigir o índice no inventário estrutural RLS e executar a validação também no
  caminho PostgreSQL sem RLS.
- Provar dados prévios com duplicatas, índice errado, índice inválido, ausência
  do índice e duas aplicações concorrentes da migration.

## Fora de escopo

- Reconciliação, exclusão, reatribuição ou backfill de duplicatas legadas.
- Alterar a semântica do endpoint de approval ou o algoritmo de retry.
- `CREATE INDEX CONCURRENTLY` dentro do runner transacional.
- Qualquer provider, canal, dado real, deploy ou produção.

## Verificação

- Testes PostgreSQL descartáveis com duplicatas legadas e migration bloqueada.
- Testes de preflight para índice válido, ausente, com definição errada e
  inválido/não pronto.
- Duas conexões aplicando 0021 simultaneamente no mesmo schema.
- `npm run test:postgres`, typecheck, lint, format, coverage crítica, mutation
  guard e certificação após a mudança.
