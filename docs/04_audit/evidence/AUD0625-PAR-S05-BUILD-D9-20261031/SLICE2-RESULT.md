# PAR-S05 fatia 2 — o diretório em PostgreSQL e a decisão D1 (SPEC 0295 R2 §4, §6)

Autor: Claude D9. Branch `claude/aud0625-par-s05-build-d9`, sobre a fatia 1 `0d3676218`.

## O que entrou

- `packages/persistence/src/session-query-postgres.ts`: `PostgresSessionDirectory` (a janela de até 1000 streams do tenant da composição abaixo de uma chave, em ordem decrescente, **antes do filtro**), `sessionWindowSql`, o resumo vindo do `header_json` (recusa cabeçalho ilegível, inválido ou de outra sessão com `SessionPersistenceCorruptionError`; stream sem metadado adotado vira `null`). Transação `READ ONLY` de 5 s, `cvg.tenant_id` na transação, aborto antes de ler.
- **Migração 0038** (reservada no `agent_coordination`), `0038_session_streams_tenant_order_index.sql`: índice `session_streams_tenant_order_idx` em `(tenant_id, ((writer_lock_id::bigint)))`, aditivo, opt-in, depois de 0028 e 0034. `runSessionQueryMigrations` aplica as três. O diretório **recusa rodar** (`SessionMigrationRequiredError`) em esquema sem o índice, e só lembra do esquema que passou.

## D1: o EXPLAIN pediu (b), e a forma da consulta faz parte do contrato

Medido em PostgreSQL 16.15 com 120 mil streams (`explain/`):

| Caso | Sem índice | Índice composto simples `(tenant_id, writer_lock_id)` | Índice `(tenant_id, writer_lock_id::bigint)` + `ORDER BY writer_lock_id::bigint` |
|---|---|---|---|
| tenant grande e antigo (60 mil), primeira página | Index Scan Backward no índice único global, **60 000 linhas de outros tenants descartadas** | idem (o planejador continua no índice global) | Index Scan Backward no índice novo, 1000 entradas, 0 descartadas |
| mesmo tenant, cursor acima das suas chaves | 39 999 descartadas | 39 999 descartadas | 1000 entradas, 0 descartadas |
| tenant pequeno (600) | Sort do tenant inteiro | Index Scan | Index Scan Backward |

O índice único em `writer_lock_id` não conhece o tenant, e o planejador o prefere quando estima o tenant como denso, mesmo quando todas as suas linhas estão no passado. Um índice composto simples não resolve (continua escolhendo o global). A solução é o par **índice sobre a expressão `writer_lock_id::bigint` + consulta que ordena por essa mesma expressão**: o índice único não serve essa ordenação, então o único caminho ordenado é o do tenant. Por isso `sessionWindowSql` é exportada e um teste de PG lê o plano da consulta real (sem `Seq Scan`, sem `Sort`, sem `Rows Removed by Filter`, índice novo, `Backward`) para três cursores, e um controle mostra a forma "ingênua" descartando mais de 10 000 linhas. A autorização do D1-b é a do recibo human-decisions-27.

## Provas

- PG 11/11 em `aud0625-par-s05-directory-postgres.test.ts`: migração duas vezes e índice; só o tenant da composição, mais novo primeiro, resumo do cabeçalho; ordem pela chave e não pela data do cabeçalho; paginação sem buraco nem repetição com filtro; streams sem metadado adotado contados na janela; o exemplo de 2001 streams com o match no 1500º sobre PostgreSQL; **F02** (um stream que confirma depois de o cursor passar da sua posição some daquela paginação e aparece numa nova, sem repetição); o plano limitado; recusa sem o índice; cabeçalho ilegível; aborto, banco inalcançável, ligação inválida.
- `SKIP-PG-S05-001` cadastrado (11 esperados).
- Mutantes: 11 (`mutations-slice2.json`): 10 mortos, 1 equivalente declarado (D10, o predicado de tenant da consulta, coberto pela RLS do papel de serviço). Quatro candidatos sobreviveram ou não se aplicavam na primeira passada e foram corrigidos (dois eram mutantes mal escritos, um é o equivalente, um deles — o índice lembrado como verificado antes da checagem — ganhou o par certo e morre).

## Limites

A contagem física limita-se ao plano das três formas medidas; o índice não substitui o `statement_timeout` de 5 s, que continua. A ordem de commit entre sessões continua não garantida (F02, declarado na SPEC). A fatia 3 liga o rastreio às portas reais de aprovação e diário.
