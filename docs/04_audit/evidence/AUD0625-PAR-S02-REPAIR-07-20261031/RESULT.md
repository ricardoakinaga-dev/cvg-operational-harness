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
- Uma contenção na linha do cache ainda **atrasa** o escritor até `statement_timeout` de 5 s por tentativa (uma tentativa por K eventos), porque a escrita derivada roda na fila do escritor. Não muda correção; se importar, uma `lock_timeout` curta só para a transação derivada resolve. Fica como P3 para a revisão.
- **Os testes de PG de sessão (S01, S04 e S02, inclusive os novos) não estão na lista `test:postgres` do `package.json`**, então a barra de PG não os chama; mesma classe do buraco da 0291 que a D9 fechou na onda 6. Não toquei no `package.json` aqui para não conflitar com a onda; o DF decide onde entra.
