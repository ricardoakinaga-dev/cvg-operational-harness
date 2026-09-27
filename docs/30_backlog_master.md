# Backlog mestre corrente — 27/09/2026

As 79 tasks de produção e seus critérios de aceite estão no [backlog canônico 0356](03_build/0356_production_backlog_2026-09-26.md). O [índice AUD-0578](03_build/0359_aud0578_execution_backlog.md) vincula os nove achados às tasks. Este arquivo registra só a fila corrente; produção permanece `NO_GO`.

| Item                 | Estado verificável                                                                              | Próximo critério                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| PR-003 / AUD-0578 R1 | Certificação local 16/16 PASS no digest `b1189914…`; `certification:verify` conferiu 37 hashes. | Verify remoto no mesmo SHA e nova emissão após mudanças R2.                  |
| PR-005               | `IN_PROGRESS` na branch isolada R2; originais dos três ledgers e README arquivados.             | Ledgers <300 linhas, links e formato verdes, SHA-256 originais conferidos.   |
| PR-007               | `PROPOSED` após baseline R1; branch coverage atual 87,61%, margem 2,61 pp.                      | Relatórios web/PostgreSQL próprios, margem ≥3 pp e lint type-aware.          |
| PR-009               | Duas fatias `VERIFIED_LOCAL`; E2E 12/12 e prova visual Ubuntu 2/2.                              | JUnit/runId, jornadas de aprovação e estabilidade visual no remoto.          |
| PR-010               | CI efetivamente executado no GitHub; Verify do SHA `5ee02e8` em andamento.                      | Verify verde no candidato e depois em `main`.                                |
| PR-011               | Security verde no SHA `5ee02e8`.                                                                | Repetir no SHA final do PR e em `main`.                                      |
| PR-101 / F1          | Discovery documental; D-03 = A; D-04 sem produto candidato.                                     | Identificar produto, responsável, fluxo, tenant, volume, SLA e validar gate. |
| Frente FL            | Claude Code executa PR-L04 e demais tarefas próprias.                                           | SPEC/gates por fatia e integração sem resíduo ativo de legado.               |

Demais tarefas continuam com os estados e dependências de [0356](03_build/0356_production_backlog_2026-09-26.md). O histórico integral deste ledger está no [arquivo navegável](08_runtime/archive/2026-09-27-pr005-backlog-master.md) e na [cópia exata](08_runtime/archive/2026-09-27-pr005-backlog-master-source.txt), SHA-256 `fa7d02af68f930959ba352e4c20fff14a171f0ee4fa504381b0a939927779c73`.
