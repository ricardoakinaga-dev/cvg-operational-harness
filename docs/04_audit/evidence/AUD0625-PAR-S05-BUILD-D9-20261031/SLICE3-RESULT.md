# PAR-S05 fatia 3 — as portas reais e o rastreio sobre PostgreSQL (SPEC 0295 R2 §5, §6)

Autor: Claude D9. Branch `claude/aud0625-par-s05-build-d9`, sobre a fatia 2 `b993edd39`.

## O que entrou

- `packages/persistence/src/trace-read-ports.ts`: `PostgresApprovalReadPort` (`get` e `listByOperationKey`, até 100, mais antigo primeiro) e `PostgresEffectJournalReadPort` (`get`). Cada chamada é uma transação curta `READ ONLY` de 5 s no esquema padrão, sob `withTenantContext` (RLS por tenant). Leem referências e estado, nunca a proposta, o payload ou a nota de decisão. O `origin_session_id` da SPEC 0291 é lido **se a coluna existir** (detectado uma vez por instância); sem ela a aprovação sai sem origem e o rastreio acusa `origin_unbound`. Erro de driver nunca sai cru: `TraceReadError` com `invalid_input`, `unavailable` ou `cancelled`.
- Composição: `createSessionQuery({ tenantId, directory: PostgresSessionDirectory, events: PostgresSessionEventStore, approvals, effects })`, com os eventos num esquema dedicado e as aprovações e o diário no esquema padrão (sem JOIN entre eles, como a SPEC manda).

## Provas

- PG 9/9 em `aud0625-par-s05-trace-postgres.test.ts`:
  - aprovação → efeito → eventos pela raiz `approvalId` e pela `operationKey`, sem a entrada da ferramenta, com `origin_unbound` quando não há a coluna;
  - a coluna de origem da 0291 adicionada: a sessão de origem é lida primeiro e a lacuna some;
  - aprovação alheia, ausente e chave alheia dão o mesmo `not_found`;
  - duas aprovações da mesma chave (ordem pela data do pedido), `ambiguous_approval` e `execution_ref_mismatch`, nada escolhido;
  - efeito ausente e aprovação sem chave;
  - evento copiado num fork marcado `inherited`, sem candidato duplicado;
  - fonte do efeito sem permissão vira lacuna e fonte da aprovação sem permissão vira `unavailable` sem vazar a mensagem do driver;
  - aborto;
  - recusas das portas (tenant malformado, limite fora de 1..100, chamada abortada, banco inalcançável, aborto durante a falha).
- `SKIP-PG-S05-002` cadastrado (9 esperados).
- Mutantes: 10 (`mutations-slice3.json`): 9 mortos e 1 equivalente declarado (R1, o predicado de tenant da consulta de aprovação, coberto pela RLS). Quatro sobreviveram na primeira passada: uma ordem que o teste não distinguia (as datas coincidiam com a ordem dos ids; trocadas), dois padrões que o prettier tinha reformatado, e o aborto durante a falha (teste novo).
- typecheck, eslint, prettier, links e skip:governance: ver o commit.

## Limites

O teste de PG roda com o esquema padrão da onda 5, em que `runtime_approvals` ainda não tem as colunas da 0291; a leitura da origem foi provada acrescentando a coluna no teste, não com a migração real (que é da 07). As portas não verificam privilégio mínimo do papel de leitura (o teste concede só `SELECT`). O SDK (`session.list` e `session.trace`) é a fatia 4.
