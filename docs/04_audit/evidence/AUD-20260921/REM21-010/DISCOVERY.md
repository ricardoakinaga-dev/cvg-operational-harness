# REM21-010 — Discovery

## Escopo

Investigar a prova de carga, backup/restore e rollback/roll-forward do fluxo
PostgreSQL sob `G21-1`, usando apenas PostgreSQL 16 descartável, dados sintéticos
e modo controlado local. Nenhum provider, canal, IdP, segredo real ou ambiente
produtivo entra nesta task.

## Evidência do gap

- `scripts/phase10-load.ts` mede somente `InMemoryDatabase` e
  `OutboxRepository`.
- `scripts/phase10-restore-check.ts` restaura somente um snapshot de memória e
  declara explicitamente que não mede RPO/RTO de infraestrutura.
- Os testes PostgreSQL existentes exercitam adapters, RLS e migrations em
  schemas descartáveis, mas não formam um artefato único de
  `pg_dump -> nova instância -> pg_restore` com comparação de rows, checksums,
  journals, roles e grants.
- `runPostgresMigrations` possui checksum guard e roll-forward idempotente,
  porém não havia prova executável de retornar a um backup pré-migration e
  reaplicar a migration seguinte.
- Não há base técnica para chamar uma medição local de RPO/RTO de medição de
  produção; o relatório deve manter essa distinção fail-closed.

## Contrato descoberto

O slice mínimo verificável é:

1. um workload sintético que use o repository tenant-scoped como caminho de API,
   persista no PostgreSQL e seja drenado pelo adapter controlado de worker;
2. journals de outbox, runtime effect e channel effect preenchidos por seus
   adapters PostgreSQL;
3. dump lógico custom em uma instância source e restore em uma instância target
   descartável;
4. comparação de rows/checksums, RLS/policies, roles/grants e tabelas de
   outbox/journals;
5. leitura pós-restore pelo repository da aplicação e isolamento entre dois
   tenants;
6. corrupção intencional detectada por checksum;
7. rollback operacional por restauração do dump pré-`0026`, seguido de
   roll-forward da migration `0026_rate_limit_key_hardening`;
8. relatório candidate/run-bound quando executado pela barra, sem afirmar RPO,
   RTO ou readiness produtivos.

## Decisão de discovery

Implementar um runner específico de prova, sem alterar o contrato de produção
nem criar dados reais. A ausência de down-migrations genéricas é tratada
explicitamente: rollback é restore do backup versionado anterior à migration;
roll-forward é a reaplicação checksum-guarded da migration posterior.

