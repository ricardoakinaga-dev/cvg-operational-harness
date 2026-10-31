# SPEC 0291 BUILD, fatia 2: a origem da aprovação no PostgreSQL (migração 0035, AP05)

Task `AUD0625-APPROVAL-ORIGIN-BUILD-07-20261030` (Claude Sonnet 5.5, sessão 07). Recibo [human-decisions-25](../USER-DECISIONS-20261028/human-decisions-25.json). Sobre a fatia 1 (`83c4c3d54`). RED primeiro em `579d74c99` (5 de 6 falhando; o 6º era o controle). Sem push.

## Entregue

- **Migração `0035_runtime_approval_origin.sql`** (número reservado pelo DF; 0033 é do K03 e 0034 é a opt-in do S01): duas colunas anuláveis (`origin_conversation_id`, `origin_session_id`), CHECK de forma (ambos nulos, ou conversa de 1 a 200 caracteres com sessão nula ou de 1 a 200; sessão sem conversa é recusada), e um gatilho `BEFORE UPDATE` (`cvg_runtime_approvals_origin_immutable`, `search_path = pg_catalog, pg_temp`, sem `SECURITY DEFINER`) que recusa qualquer mudança, remoção ou surgimento de origem (`55000`, "origin is immutable"), seja pelo armazenamento, pelo papel de runtime ou por conexão direta. Sem backfill: o legado fica `NULL`.
- `runtime-approval-store.ts`: as duas colunas entram em `persistedColumns`, na lista de leitura, no tipo da linha, em `recordValues` e no mapeamento de volta para `origin` (sem chave `undefined`). O `UPDATE` com CAS reescreve a linha inteira e passa pelo gatilho porque os valores não mudam.
- Listas de migração em passo com a nova: `defaultPostgresMigrations`, o preflight do tenant da API, o oráculo `postgres-persistence-mode` e a ordem no teste da 0033 (que supunha ser a última); o drill de roll-forward `scripts/rem21-010-postgres-proof.ts` passou a rolar a 0035 sobre o dump que termina na 0033, com o SQL de reversão da 0035. **A prova de recuperação (`test:postgres:proof`) rodou e deu PASS** com a 0035.
- `SKIP-PG-AO-001` no skip-catalog (6 testes, conferido sem banco).

## Provas (AP05) e verificação

| Prova | Resultado |
| --- | --- |
| a origem persiste com e sem sessão e volta no `get` e no `list` | verde |
| `submit` e `approve` (reescrevem a linha) preservam a origem | verde |
| `UPDATE` direto recusado: outra conversa, outra sessão, sessão removida, origem removida, origem surgindo num registro legado | verde |
| CHECK: conversa vazia, sessão sem conversa, id de 201 caracteres, sessão vazia; uma origem válida entra | verde |
| aditiva: linha anterior à 0035 continua com origem nula | verde (esquema montado até a 0015, linha inserida, migrado até o fim) |
| persistência completa com PG real: `complete-effect-result-journal` 57, `effect-journal` 10, `operational-execution` 5, `par-s01-session-adapter` 47, migração 0033 10, `runtime-approval-store` 13, `postgres-persistence-mode` 71 | verdes |
| mutação (`mutate-s2.py`, `mutations-s2.json`) | **10/10 mortos**: origem não gravada ou sem sessão, mapeamento que perde a sessão ou a origem, gatilho removido, cego à sessão, cego à conversa ou que deixa um legado ganhar origem, CHECK removido ou que aceita sessão sem conversa |
| typecheck, eslint, prettier | 0 / limpos |

Nota de execução: a suíte inteira de `packages/persistence` em paralelo, com a máquina carregada pela cobertura da onda 5, estourou o tempo de vários testes de PG por contenção (não por falha); rodei cada arquivo afetado isoladamente com os tempos ampliados e todos passaram.

## Próximo

Fatia 3: o worker do kernel (AP09, `buildKernelTurnInput` + `runTurn`, conversa A pede e conversa B apresenta o mesmo `approvalId`), `origin_mismatch` em `outboxOutcomeReasons` (AP10), AP06 e AP07, o registro no cartão do S04 e a declaração de que nenhum efeito real entra no worker do kernel antes desta fatia.
