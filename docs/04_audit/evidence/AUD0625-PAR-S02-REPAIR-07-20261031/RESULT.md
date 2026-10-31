# Reparo da S02/0292 (PAR-S02), 3 P2 da Codex — sessão 07

Branch `claude/aud0625-par-s02-repair-07` a partir de `claude/aud0625-par-s02-build-d9` @ `5304cce72` (código igual ao `dc4036e30` da revisão da Codex).
Relatórios: `codex/aud0625-review-s02-{s12,s23,s234}-20261031` (S02-S12-F01, S02-S12-F02, S02-S23-F03; mantidos em `dc4036e30`). Sem push.

## Reparos

| Achado | Onde | O que mudou |
|---|---|---|
| F01 admissão | `session-persistence.ts`, `project()` | Mesma admissão do `read` (`#admit`): o sinal é conferido de novo uma microtask depois da chamada, antes de tocar o pool, e outra vez depois do julgamento do checkpoint, antes do trabalho de qualquer origem (cache, incremental ou reconstrução). Não cancela SQL em voo. |
| F02 forma do estado | `harness/src/session/projection-cache.ts` | `isProjectionShape` valida a estrutura inteira que o redutor lê: contadores, `lastTurn`, `stops.total` das três paradas finais, `stops.recent`, `compaction`, `open` (inclusive `openCalls` como lista de pares, `uncertain`, `start`, booleanos, `end`) e `closed`. Estado inválido continua sendo `state is malformed` e leva à reconstrução pelo log. |
| F03 escritor | `session-persistence.ts`, `#transaction(body, derived)` | O checkpoint é escrito como transação "derivada": um `57014` (statement timeout) ou `55P03` (lock timeout) **com ROLLBACK que passou** vira `SessionStorageUnavailableError` e não encerra a posse; o `catch` de melhor esforço conta a falha. Falha de ROLLBACK, `57P01`/`08*`/outros `57*` e **qualquer** falha de escrita canônica seguem pelo `#classify` (perda terminal). |

## Provas

- **RED contra `dc4036e30`.** Os oráculos da Codex entram como regressão (`par-s02-repair-{abort,malformed,writer}.test.ts`, só trocados os caminhos de import e retirada a escrita de rastro): 5 falhas (F01 cache e incremental, F02 cache e incremental, F03) e 3 controles; depois do reparo, 8 de 8.
- **Testes novos.** `par-s02-repair-abort` (11): as três origens, a origem com checkpoint inválido, aborto que cai depois da admissão e prova de que o aborto imediato não toca o pool (mesma garantia do `read` do S01). `par-s02-repair-writer-faults` (10), com injeção de falha na conexão do dono: contenção `57014`/`55P03` isolada; ROLLBACK que falha, `57P01`/`08006`/`57P03` e a mesma contenção numa escrita canônica continuam perda terminal; erro comum do cache (`42501`) não toca o escritor. `tests/par-s02-repair-projection-shape` (54+): o estado de toda projeção real, em todos os prefixos de um log que cobre todas as partes, é aceito; cada campo exigido removido ou com tipo errado é recusado mesmo com o digest recalculado.
- **Mutantes: 19/19 mortos** (`mutations.json`, `mutate-s02-repair.py`): F01 3 (sem salto de admissão, salto sem conferência, sem conferência antes do trabalho da origem), F03 6 (contenção não isolada, checkpoint não derivado, tudo derivado, qualquer `57*`, qualquer erro, só `57014`), F02 10 (cada grupo de checagens). Na primeira rodada 2 sobreviveram (o salto de admissão era mascarado pela conferência posterior); o teste "o aborto imediato não toca o pool" os mata.
- **Cobertura.** `projection-cache.ts` em 100% de declarações, ramos, funções e linhas (ferramenta por arquivo do núcleo, seleção dos testes da S02).
- **Regressão.** S01, S04 e S02 em PG 16 real: 17 arquivos e 332 testes passam (S01 ownership, adapter, writer e adoption; S04 fork e resume; S02 RED e fatia 2; ponte e processos S01 e S04; mais os 5 arquivos do reparo). typecheck, eslint e prettier PASS nos arquivos tocados; `skip:governance` PASS com as quatro entradas novas (`SKIP-PG-S02R-001` a `004`; 11, 2, 2 e 10 testes pulados sem banco).

## Limites e achados

- O `ROLLBACK` que passou prova que a conexão está viva, não que a transação derivada não deixou rastro: a atomicidade da linha do cache é da própria transação.
- O DF conferiu que os testes de PG de sessão rodam nos gates de unidade e de cobertura (o `verify.yml` define `TEST_DATABASE_URL` no nível do job e os testes usam `describe.skipIf(!url)`); a lista `test:postgres` é só um acréscimo explícito. Não há buraco; nada a mudar no `package.json`.

## Acréscimo: `lock_timeout` curto só na transação derivada (pedido do DF)

A escrita do checkpoint roda na fila do escritor; com a linha do cache travada ela atrasava o turno até o `statement_timeout` de 5 s. Agora `#transaction(..., derived = true)` faz
`SET LOCAL lock_timeout = '250ms'` (constante `DERIVED_LOCK_TIMEOUT_MS`) depois dos `SET LOCAL` padrão; o `55P03` resultante é o caminho derivado do F03. Escrita canônica
mantém os 5 s. O registro de falha do cache passou a reportar o `code` da causa quando a falha vem embrulhada (`55P03`).

- Testes (`par-s02-repair-writer`, PG real): com a linha do cache travada por outra conexão, o append custa bem menos de 2,5 s (medido na casa de 300 ms), `writeFailures` sobe em 1, o registro traz `code: '55P03'` e o append seguinte e o `flush` passam (a posse fica); uma escrita **canônica** com a linha do fluxo travada por 1 s ainda espera e passa (a restrição curta é só da derivada).
- Mutantes (`mutations-lock-timeout.json`): sem o `SET LOCAL` (L-1), limite de 4000 ms (L-2), limite curto para toda escrita (L-3) e sem o `code` da causa (L-4): 4/4 mortos.
- Ataques pedidos pela Codex (`par-s02-repair-writer-faults`): `08006` no COMMIT da escrita derivada (o append que gravou os eventos já devolveu sucesso e o log está em 8; a posse é perdida e o append seguinte é recusado) e a conexão depois de uma falha derivada por contenção: o `SET LOCAL lock_timeout` não sobrevive à transação, e uma escrita canônica seguinte que espera mais de 250 ms pelo bloqueio passa. Regressão S01/S04/S02 em PG real depois do `lock_timeout`: 17 arquivos, 334 testes.
