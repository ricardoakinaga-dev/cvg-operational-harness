# PAR-S01 fatia 6 — testemunhos S1–S5 em processos distintos

Branch `claude/aud0625-par-s01-07`. Cobre SP03, SP04, SP08, SP09, SP15, SP16, SP17 e SP20 da SPEC 0221 §10.

## O que existe

- `tests/support/par-s01-child.ts`: processo filho sintético (`fork` + `tsx`) com RPC por IPC sobre o serviço público (create/open/append/flush/close/read, turno real do SDK, SQL cru sob o role do filho).
- `tests/par-s01-session-processes-postgres.test.ts`: 11 testemunhos.
- Prazos da SPEC: operação 5 s (erro se estourar), filho 180 s (SIGKILL do pai), teardown TERM 1 s / KILL 2 s / join 5 s. Esperas por condição observável (`pg_locks`, resposta IPC), nenhum sleep como prova.
- `tests/par-s01-session-bridge-postgres.test.ts` (fatia 5) foi movido de `packages/persistence/src/__tests__/` para `tests/`, por pedido do DF: persistence não depende do SDK. Sem mudança em package.json/lockfile.
- Recibo `human-decisions-16.json` copiado byte a byte (sha256 `38414aee…eeac`) e citado no SLICE4-RESULT.

## Testemunhos

| Id | Prova (processos distintos) |
| --- | --- |
| S1 | Dono em A; B recusado com `SessionAlreadyOwnedError`, lê o prefixo exato, escreve outra sessão ao mesmo tempo; handle de leitura não escreve. Corrida de dois processos pelo mesmo log: exatamente um vence e há um só detentor em `pg_locks`. |
| S2 | Store legado recusado com dono vivo (nada gravado, cursor intacto) e volta a funcionar após o close. Interleaving linha-antes-do-advisory: transação legada segura a linha do stream (com `cvg.tenant_id`), append do dono fica em espera de Lock observada em `pg_stat_activity`, o INSERT legado falha na hora com SQLSTATE 55P03 (sem ciclo), o dono conclui. |
| S3 | Dois tenants com o mesmo `sessionId` em dois processos, role não-owner: logs separados, `writer_lock_id` distintos, leitura por processo fresco isolada; ALTER, UPDATE de header, UPDATE de `writer_lock_id`, DELETE e TRUNCATE recusados. |
| S4 | ACK do flush, SIGKILL, novo processo abre e lê exatamente o prefixo e continua a sequência; criação vazia sobrevive; turno real do SDK é relido idêntico por outro processo e continuado sem novo modelo; lote grande em voo na hora do kill deixa só lote inteiro (4 ou 204 eventos), cursor = último + 1. |
| S5 | `pg_terminate_backend` do dono: handle velho recusa com `SessionOwnershipLostError`; outro processo assume, escreve e libera; o handle velho continua recusando (não revive) e o log tem só os fatos do novo dono. Crash do postmaster (`docker kill` + `start`, volume ext4 real): prefixo ACKado intacto, nenhum detentor, handle velho morto, novo processo lê e continua. Recuperação medida e impressa. |

## Ambiente

- PG 16.15 (`postgres:16.15`) em contêiner próprio `par-s01-07-pg2`, porta 55871 loopback, bind mount `/mnt/dados/cvg-work/par-s01-07-pgdata` em ext4 (`/dev/sdb2`), `fsync`, `full_page_writes` e `synchronous_commit` ligados. Não é tmpfs.
- O crash/restart é opt-in (`PAR_S01_PG_CONTAINER=<contêiner>`) porque derruba o PG compartilhado: rodar esse arquivo sozinho. Sem a variável, o teste fica `skipped` (1 skip). Rodado junto de outros arquivos em paralelo ele interferiu em dois testes da fatia 3 (efeito esperado do crash); sozinho e sem ele, tudo verde.

## Resultados

- Arquivo da fatia 6: 11 verdes, duas rodadas seguidas, com crash/restart.
- Conjunto S01 sem o crash: 150 verdes + 1 skip (header 24, ownership 29, adapter 47, writer 23, bridge 17, processos 10 + crash opt-in).
- eslint e prettier limpos nos arquivos novos.

## Mutação (`mutate-s6.py`, `mutations-s6.json`)

9 mutantes, 9 mortos; 6 pelos testemunhos de processo, 3 pelas fatias anteriores (sobreviveram aos de processo e foram religados às suítes das fatias 2–4):

- Mortos aqui: lock fingido no create e no open, unlock fingido, guard desligado, guard com chave errada. 
- Mortos por fatia anterior: `#lost` não registrado em `onLost` e em `#lose` (são caminhos redundantes entre si e a conexão morta já recusa; a fatia 4 testa cada um), flush sem UPDATE (a barreira de WAL é medida na fatia 4; o ACK de COMMIT já garante durabilidade), cursor do guard desligado (fatia 2, ao lado do gatilho diferido).

## Limites

- "Durabilidade sob queda de energia/disco" não é afirmada: o teste mata o processo do PG, não o kernel.
- Sem `stat/list`, flush agregado nem shutdown de dono (adiados pela SPEC); adoção em lote, restore e compatibilidade de rollback ficam para a fatia 7.
- `skip-catalog` e `mutation-manifest` não foram tocados.
