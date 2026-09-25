# Manifesto de verificacao — AUD19-015

- task: `AUD19-015`; onda: `W3`; status: `VERIFIED`.
- runtime: Node `v22.23.2`; PostgreSQL descartavel `postgres:16-alpine`
  (`aud19-pg`, porta 5434); Docker `29.1.3`.
- escopo: somente local/sintetico/descartavel; producao `NO_GO`.

## Provas

| Prova                                   | Resultado                                                             |
| --------------------------------------- | --------------------------------------------------------------------- |
| carga outbox, 10.000 eventos, 2 workers | 10.000 processados, perda 0, duplicatas 0                             |
| carga throughput                        | 587,42 eventos/s; p50 2,883 ms; p95 6,032 ms; p99 7,865 ms            |
| snapshot/restore in-memory              | digest, outbox e isolamento por tenant PASS; 250 eventos              |
| RTO controlado do restore in-memory     | 0,021 s                                                               |
| backup/restore PostgreSQL               | dump 1.194.952 bytes; dump 0,541 s; restore 4,592 s; 221/221 tabelas  |
| rollback por composicao                 | override PG incompleto recusado; memory `/live` PASS; processo parado |
| usuario da imagem no rollback           | `cvg` (nao-root)                                                      |

## Limites

- `rpoMeasured=false` no relatorio de restore: RPO/RTO de infraestrutura de
  producao nao foi alegado nem medido.
- O ensaio PostgreSQL compara estrutura restaurada, nao simula failover,
  exporter ou janela de backup de producao.
- Procedimento operacional: `docs/08_runtime/rollback_playbook.md`.

## Arquivos desta evidencia

`SPEC.md`, `MANIFEST.md`, `load-10000.txt`, `restore-check.txt`,
`pg-backup-restore.txt`, `rollback-simulation.txt`.
