<!-- Crítico independente da SPEC0249 r1 (Agent general-purpose, sem fork, somente leitura). Texto do relatório preservado; transcrição completa fica no runtime privado da sessão. -->
# Crítica independente — SPEC0249 r1

Hash revisado: `3a6ec122eee4baecf8177dc27a39deb4adc20d3420015b357e1b1d16277731ae` (conferido com sha256sum). Base: worktree `/mnt/dados/cvg-work/cvg-aud0621-persistence0249-20261020` em `6c9fc6517`, sem alterações.

## 1. Veredito: REVISE

Um único obrigatório, pequeno e no plano de prova. Fora ele, a SPEC está correta e fecha os seis achados. As âncoras `arquivo:linha` conferidas batem com a base.

## 2. Obrigatórios

**R1-01 — baixa/média — §6, AC12 e controle M6.** A SPEC diz que M6 ("inserir sem transação") morre em AC12, mas pelo desenho da §3.5 isso não acontece: com o mutante, o insert 1 commita, o insert 2 falha, `uncertain` fica ligado; o flush seguinte lê o maior `sequence` persistido (1), põe o cursor em 1 e reenvia 2..N; a cadeia fica válida e AC12 passa. AC13 com store falso também não mata o mutante. Correção mínima: em AC12, depois do turno 1 falhar e antes de remover o trigger, exigir zero linhas `kernelAudit` daquele `ledgerId` (prova o rollback do lote); ou declarar AC13 com store que só aplica escritas no COMMIT.

## 3. Opcionais (P3)

1. Bigint no token (§3.2.4): a regex aceita 19 dígitos acima de 2^63−1; o cast dá erro 22003 em vez de `validation_failed`. Limitar ou comparar como texto.
2. `exactOptionalPropertyTypes: true`: "passa `claimToken: event.claimToken`" não compila se o valor puder ser `undefined`; usar spread condicional.
3. `renewClaim(ctx, …)`: declarar `ctx` como `Pick<PostgresOutboxContext,'client'|'repositoryNow'>`, porque o contexto completo só existe num getter privado de `postgres.ts:246`.
4. Predicado de tenant explícito (`tenant_id = $1`) nas consultas do helper (linha da tentativa e "nenhuma mais nova").
5. No dublê em memória, `cloneEvent` espalha o token guardado em `findById`, `ack` e `fail`; explicitar, e dizer que o `commitAck` do dublê recheca o token.
6. §3.4.3: o registro terminal devolvido por `recoverExpired` faz o harness emitir `execution.recovered` (`execution-spine.ts:1294`); registrar ou excluir o terminal da lista.
7. Dizer o que acontece com `operational_effect_journal` em `EFFECT_STARTED` e com steps abertos (0019) de execução que vai a `FAILED_TERMINAL` na recuperação.
8. F19: um registro com falha determinística bloqueia o flush de todos os turnos e retém ledgers; registrar o risco na §5; definir que "nenhuma linha persistida" equivale a 0 na reconciliação.
9. F26: no smoke, o worker bate a cada 10 s e o limiar é 3 s, então `worker_down` oscila; alinhar os intervalos ou registrar o risco de flakiness.
10. `renewClaim`: usar `GREATEST(lease_until, agora+leaseMs)` para nunca encurtar o lease.
11. F20: acrescentar em AC08 o takeover controlado depois de parar o heartbeat.

## 4. Migração: concorda que não é necessária

`outbox_attempts.id` (0010:85) como token é equivalente a uma coluna de geração, e mais forte: PK identity, nenhum código insere id explícito (`postgres-outbox.ts:244` e `:640`), sem `setval`/`RESTART`; todo INSERT sob o lock da linha do evento; com CACHE>1 o pior caso é recusar o claim atual (fail-closed), nunca aceitar token velho; ABA depois de requeue fechado por `outcome IS NULL` e "nenhuma linha mais nova"; todo caminho de saída de `processing` fecha a tentativa aberta (ack, fail, `suppressOutboxForTakeover` em `postgres.ts:1313`, claim de lease vencido e a nova exaustão); RLS/grants do runtime já cobrem (`migrate-job.mjs:72–76`); `RETURNING id::text` sem perda de precisão. Sem mudança de esquema escondida nem premissa nova.

## Outras verificações (sem achado)

Chamadores PG de `ack`/`fail` completos (worker, rem21, outbox-durability, smoke de migração). Testes existentes não quebram além dos três da §3.7 (conferidos `continuous-worker.test.ts:851`, `:1058`, grants via `WORKER_CRITICAL_TABLES`, `restore-audit-chain-proof.ts`, contagens de `continuous-worker-entrypoint`). M1–M5, M7 e M8 morrem como afirmado.
