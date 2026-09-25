# REM21-010 — PRD controlado

## Problema

A barra atual consegue dizer que adapters PostgreSQL isolados funcionam, mas não
prova que um workload atravessa API → PostgreSQL → worker e que o estado
operacional, incluindo outbox e journals, pode ser recuperado em outra instância
sem perder integridade. Também não distingue uma prova local de uma promessa de
RPO/RTO produtivo.

## Resultado desejado

Entregar um comando repetível que produza um relatório determinístico no nível
da lógica dos dados, com verdict `PASS` somente quando todas as verificações
locais passarem:

- workload sintético enfileirado pelo repository e processado por dois workers;
- outbox e os dois journals PostgreSQL restaurados e comparados;
- checksums e contagens de todas as tabelas do schema iguais entre source e
  target;
- RLS/policies e grants/roles sintéticos comparáveis;
- leitura da aplicação após restore e bloqueio de leitura cross-tenant;
- corrupção controlada identificada como divergência;
- rollback para o dump pré-`0026` e roll-forward até `0026` novamente.

## Fora de escopo

- produção, piloto, serviços externos, dados pessoais ou clínicos;
- benchmark de capacidade ou SLO produtivo;
- medição real de RPO/RTO;
- alteração irreversível em banco persistente;
- criação de uma família genérica de down-migrations sem owner de schema;
- confirmar, cancelar ou reagendar consultas ou qualquer ação sensível.

## Critérios de aceite

1. A execução usa Node 22.x e PostgreSQL 16 descartável.
2. Uma execução limpa retorna `PASS` e não depende de artefato editado à mão.
3. A corrupção de uma linha altera o checksum e o gate registra detecção.
4. O restore em uma nova instância mantém rows, checksums, RLS/policies,
   roles/grants, outbox e journals.
5. O rollback restaura a versão anterior (`0025`) e o roll-forward reaplica
   `0026` com checksum guard.
6. Uma divergência de `runId`, `candidateId`, report, corrupção não detectada,
   RLS/grants ou claim de RPO/RTO é rejeitada.
7. O relatório registra limitações: `RPO/RTO_NOT_MEASURED_IN_PRODUCTION` e
   `PASS_LOCAL / FINAL_CERT_DEFERRED`.

