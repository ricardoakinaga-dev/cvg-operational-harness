# PAR-S01 fatia 7 — adoção, compatibilidade, restore, mutação e barra local

Branch `claude/aud0625-par-s01-07`. SP19 da SPEC 0221 §9.

## Código novo

`packages/persistence/src/session-adoption.ts` (exportado pelo índice do pacote; fora da API pública de sessões):

- `adoptSessionStreams(client, {schemaName, batchSize ≤ 100, onBatchCommitted}, manifest)`: roda como autoridade de migração (dono da tabela) com writers parados. Manifesto por tenant/sessão com header, cut, cursor esperado, digest ordenado esperado e proveniência; nada é inferido do primeiro evento nem de NOW.
  - Valida o manifesto inteiro antes de tocar em qualquer coisa (duplicata, proveniência, cursor, digest, header via `validateSessionHeader`, id do header = id da sessão).
  - Ordem estável tenant/sessão; uma transação por lote (≤ 100), `lock_timeout`/`statement_timeout` de 5 s.
  - Por stream: `FOR UPDATE`, try-lock advisory da chave do stream (writer vivo → `writer_active`), CAS de cursor e de digest SHA-256 do corpo ordenado, `header_json IS NULL` no UPDATE. Já adotado idêntico é no-op; divergente é `conflict` e para. Eventos nunca são tocados.
  - Falha no lote faz ROLLBACK do lote inteiro; lotes anteriores ficam. COMMIT sem resposta vira `outcome_unknown`; a reexecução reconcilia (no-op nos já adotados).
- `verifySessionAdoption`: reconcilia header, cut, cursor e digest e nomeia cada divergência. `countUnadoptedSessionStreams`: a API só liga quando é 0.
- `SessionAdoptionError` é erro de ferramenta de migração, não categoria da API pública de sessões (SPEC l.208 intacta).

## Testes (`par-s01-session-adoption-postgres.test.ts`, 30 verdes, PG 16.15 ext4)

- Matriz de compatibilidade: app nova + schema velho recusa no preflight; app velha + schema velho é o baseline e, no schema expandido, lê fatos idênticos (hash dos eventos igual antes/depois); app nova + schema expandido sem adoção dá `migration-required` e nada é inventado; app nova + schema completo opera; rollback de app mantém fatos novos legíveis pelo leitor v1 e o writer legado continua a sequência sob os guards.
- Fixture povoada: 2 tenants × 130 streams históricos; adoção em lotes 100/100/60; hash de todos os eventos igual antes/depois; `verify` vazio; 0 sem metadata.
- Reexecução idempotente; header/cut adotados imutáveis (55000) até para a autoridade de migração.
- Interrupção no meio (250 streams, lote 1 comitado, restart termina o resto sem refazer), COMMIT perdido, falha de armazenamento com rollback do lote, writer vivo recusado, cursor/digest/stream ausente recusados com lote tudo-ou-nada, 10 manifestos inválidos, ordem estável, cut divergente, orçamento de lock.
- Restore: o schema de pré-imagem é reconstruído em recurso próprio, a adoção é repetida e produz headers/cut idênticos aos do original; o original preserva os fatos novos (restore nunca sobrescreve).

## Mutação (`mutate-s7.py`, `mutations-s7.json`)

32 mutantes: 29 mortos, 3 equivalentes justificados (`cursor-cas`, `update-null-guard`, `update-rowcount`: cada um é redundante com o CAS do UPDATE sob o mesmo `FOR UPDATE`). Nove sobreviveram na 1ª rodada; seis viraram testes (ordem estável, cut divergente, os três tipos de divergência da verificação, orçamento de lock).

## Barra local (o que foi rodado aqui)

- `npm run typecheck` 0; eslint e prettier nos 35 arquivos alterados da branch limpos; `docs:check-links` limpo.
- Cobertura de `packages/harness/src/session/persistence.ts`: 100% statements/branches/funções/linhas com o teste de header (dois testes novos fecharam `exotic array` e `sparse array`); é o único arquivo de `packages/harness/src/**` tocado.
- Suíte sem PG de harness, persistence, contracts e sdk: 905 verdes, 0 falhas.
- Conjunto S01 em PG (header, ownership, adapter, writer, bridge, processos, adoção): verde; crash/restart do postmaster opt-in e isolado, verde.
- `test:postgres:proof`: PASS (0034 é opt-in, o runner `POSTGRES_MIGRATIONS` não mudou; dumpPre `6e9318ca…`, dumpPost `d79d485e…`, 53/53 tabelas).
- `skip-catalog`/`mutation-manifest`: nenhum arquivo catalogado foi tocado. Os três testes PG novos seguem o padrão `describe.skipIf(!TEST_DATABASE_URL)` do PDSH-021, que também não está na lista de `test:postgres`; incluí-los na barra é decisão do DF.

## Não feito / limites

- Os 5 checks do PR (REM21 CI bar ~2h45, codeql, secret-scan, supply-chain, image-scan) rodam no PR; localmente rodei a parte determinística acima. A barra completa e a cobertura global `test:core --coverage` ficam para o PR de integração.
- A 0034 continua opt-in (fora de `POSTGRES_MIGRATIONS`); entra na main só depois da 0033 (K03 fase 1) e qualquer mudança nisso passa pelo DF.
- Sem volumes ou janela de produção: tudo sintético e local.

## Correções da revisão DF (af5b483b)

- P2-1: as três funções validam `schemaName` com `^[a-z][a-z0-9_]{0,62}$` antes de qualquer query (`invalid_manifest` no adopt; rejeição nas outras duas). Teste: nome com aspas e `DROP SCHEMA` é recusado sem nenhuma query nas três. Mutantes `schema-adopt`, `schema-count`, `schema-verify` e `schema-regex` mortos.
- P2-2: `scripts/skip-catalog.json` ganhou `SKIP-PG-S01-001..006` (ownership 29, adapter 47, writer 23, adoption 32, bridge 17, processes 10; sourceSha256 de cada fonte). O teste de crash do postmaster agora só é registrado quando `PAR_S01_PG_CONTAINER` está definido (antes aparecia como 1 teste pulado e `numPendingTests` divergia da lista de linhas). `skip:governance` com um relatório unit gerado só sobre os arquivos S01, sem PG: PASS (158 pulados = 158 esperados). `certification/` restaurado antes do commit. Observação: `pdsh-021-session-events-postgres.test.ts` (9 pulados sem PG) segue fora do catálogo, como na base; um unit completo sem PG o apontaria, não é desta branch.
- P3: `verifySessionAdoption` usa SAVEPOINT por entrada; uma leitura que falha é reportada como `error <SQLSTATE>` e as entradas seguintes continuam verificadas. Teste com falha real (`SELECT 1/0`) que aborta a transação; mutante `verify-savepoint` morto.
