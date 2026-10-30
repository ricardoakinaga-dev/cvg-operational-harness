# PAR-K03 f4 — correção do P2 (TEMP homônima no preflight do worker)

Achado (Codex, via DF): as duas queries novas do preflight resolviam `to_regclass('operational_effect_journal')`
sem schema. `pg_temp` é procurado primeiro para relações; uma sessão com uma TEMP homônima "legada" (sem as 2 colunas e
sem trigger) fazia o preflight admitir um journal persistente ATIVADO. Mesma classe do P1 da 0034.

Correção: as duas resoluções usam `to_regclass(format('%I.%I', current_schema(), 'operational_effect_journal'))`, o
mesmo schema das checagens de RLS. A readiness do adapter (`operational-effect-result-readiness.ts`) já comparava
`schema` com `current_schema()` e recusa a TEMP (teste novo no teste do adapter, f5).

Prova: teste PG em `postgres-role-preflight.test.ts` (schema ativado, papel de worker válido; primeiro recusa o ativado
sem TEMP, depois cria a TEMP homônima na mesma conexão e continua recusando). Mutante T3 (as duas queries voltam ao
nome sem schema): MORTO. T1/T2 isolados sobrevivem por serem redundantes entre si (cada query sozinha ainda vê a outra
metade do estado e reprova); só o conjunto reabre a falha (`mutation-results-f4fix*.json`).
