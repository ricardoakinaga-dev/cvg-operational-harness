# PAR-S05 — reparo dos seis P2 da revisão do Codex (S1+S2, `b993edd39`)

Revisão: `docs/04_audit/evidence/AUD0625-REVIEW-0295-S1-CODEX-20261031/REVIEW.md` (CHANGES_REQUESTED, F01–F06). Os oráculos do revisor entram como testes de regressão sem mudar asserção (só `observe` e gancho de trilha removidos).

| Achado | Reparo | Prova |
| --- | --- | --- |
| S1-F01 | A fonte da raiz do trace nunca repassa código nem texto: o `catch` só devolve `unavailable` fixo; a recusa por orçamento sai fora do `try` | 2 testes (aprovação e chave) |
| S1-F02 | Aborto conferido depois do efeito, depois de cada página de eventos e antes de publicar; no PG, depois de obter a conexão (libera e rejeita sem SQL) e antes do `COMMIT` (rollback, `AbortError`, nunca `source_unavailable`) | 2 puros + 2 PG |
| S1-F03 | Todo elo deixado de fora pelo teto (chamada, resultado ou fim) marca `budget_exhausted(links)` | 1 oráculo (33 turnos) + teto de 2, 3 e 4 elos |
| S1-F04 | Prazo conferido também ao concluir, antes de publicar | 1 oráculo |
| S2-F05 | Sem cache global: a admissão do índice é lida na transação que lê, no banco real | banco 2 com o mesmo nome de esquema; índice removido depois de aquecer |
| S2-F06 | A admissão confere `pg_index`: `indisvalid`, `indisready` e a definição (`btree (tenant_id, ((writer_lock_id)::bigint))` na tabela `session_streams` do esquema) | índice com o nome certo em `session_id`; `indisvalid=false`; `indisready=false` |

Custo: uma consulta de catálogo por janela, na mesma transação (a decisão de cache por nome era a causa do F05).

Gates: `typecheck`, eslint e prettier limpos; `skip:governance` PASS (SKIP-PG-S05-003, 7 testes); 132 testes passam (10 puros e 7 PG novos incluídos), cobertura 100% por arquivo de `query.ts` e `session-query-postgres.ts`; RED confirmado contra `bd98e0923` (6 puros e 4 PG falham); mutantes 8/8 mortos (`mutations-repair.json`, `mutation-results-repair.json`). Um oitavo ponto (guarda de aborto logo depois da leitura da raiz) era equivalente porque todo caminho seguinte já confere o sinal: removido em vez de declarado.
Produção NO_GO; dados sintéticos; sem push.
