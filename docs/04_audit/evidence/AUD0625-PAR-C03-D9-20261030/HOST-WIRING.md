# C03 — ligação no host (pedido do DF para a onda 6)

Autor: Claude D9. Um commit sobre `a9319a10b`. Sem migração, sem lockfile.

## (1) houseReadOf

Achado de composição: **nenhum código de produção compõe `createModelCompactionControl` nem monta mensagens `tool` do pedido a partir de observações** (o worker do kernel passa só o plugin padrão; as mensagens `tool` só existem em testes). Não há ponto de composição para ligar; criei o elo que o host usará quando montar esse histórico:

- `toolHistoryFromObservations(observations, firstIndex)` (`packages/harness/src/spill/tool-history.ts`): devolve as mensagens `tool` dos resultados de ferramenta e a porta `houseReadOf`, ambas da mesma lista, de modo que a posição que a porta responde é a posição da mensagem. A resposta vem de `Observation.rendering.houseRead` (marca do runtime), nunca do texto; marca em observação que não é resultado de ferramenta é ignorada.
- Teste ponta a ponta (`aud0625-par-c03-host-wiring.test.ts`): uma execução real do `IterativeGovernedRuntime` com o `spill.read` genuíno produz a observação marcada; o histórico dela vai ao kernel com o controle de compactação: a leitura chega inteira ao resumo (canário central), um resultado grande comum no mesmo prefixo é podado (1 put), e sem a porta a mesma leitura perde o centro (controle).

## (2) Varredor na composição do worker

Achado: o `main.ts` do worker contínuo registra `worker.sweeps_disabled` (composição de aprovações pendente, AAA-21) e `createPeriodicSweepRunner` não é usado por nenhum worker. O varredor do spill é independente das aprovações, então ganhou composição própria:

- `apps/worker/src/spill-sweep-composition.ts`: `CVG_SPILL_SWEEP_DATABASE_URL` (login do job; o papel vem da URL), `CVG_SPILL_SWEEP_SCHEMA`, `CVG_SPILL_SWEEP_INTERVAL_MS` (padrão 300000, 1000..86400000, só dígitos). Sem as três: nenhuma porta, nenhum pool, nenhuma métrica. Parcial ou inválido: `SpillSweepConfigurationError` antes de abrir qualquer pool.
- `main.ts` (`runPostgresContinuousWorker`): passa o handle como `sweeps`, chama `verify()` no preflight de partida (falha fecha e faz a limpeza) e fecha o pool na parada.
- `PostgresSpillSweeper.verify()` (público): o preflight de privilégios do passo anterior, agora também no startup; `purgeExpired` continua verificando na primeira execução.
- Métricas: `worker_sweep_spill_purged_total`, `worker_sweep_failures_total` (falha registrada, nunca lançada, próximo tick segue). Runbook: `deploy/harness/postgres/README.md`.

## Provas

- Unidade: `spill-sweep-composition.test.ts` 29 casos (config, fail-closed, verify, intervalo, falha, sobreposição, stop/close); harness c01+c03 220/220 com cobertura 100% por arquivo em `tool-history.ts`, `prune.ts`, `model-compaction.ts`; `apps/worker` inteiro 216 passam (43 skips de PG/E2E do catálogo).
- PG: `aud0625-par-c03-spill-postgres.test.ts` 39/39 (novo: `verify()`); `SKIP-PG-C03-001` religado ao novo sha, 39 esperados.
- Mutantes: 18/18 de unidade (`mutations-wiring-unit.json`; S7 e S12 mortos depois de testes novos para `1e4`, `0x3e8` e o timer) e 2/2 de PG (`mutations-wiring-pg.json`).
- typecheck, eslint, prettier, links e skip:governance OK.

## Limites

O `main.ts` não é testável como unidade (executa na importação); a lógica de configuração, criação e ciclo de vida está em `composeSpillSweep`/`createSpillSweepComposition`, cobertas, e o `main.ts` só passa o handle, chama `verify()` e fecha. Sem prova do processo real com um PG de ponta a ponta: o varredor real foi provado contra PG no teste PG, e a composição contra um pool falso.
