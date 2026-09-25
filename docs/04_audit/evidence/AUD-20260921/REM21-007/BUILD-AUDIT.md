# REM21-007 — BUILD/AUDIT — rate limiter HMAC e budgets

## Escopo e decisão

`REM21-007` (`A21-F10`, parte histórica de `AUD20-009`) foi executada sob
`G21-1` em escopo local, sintético e descartável. Produção continua `NO_GO`.
Nenhum IP real, segredo real, provider, canal, credencial, IdP ou serviço
externo foi usado.

Discovery, PRD, SPEC e decision record estão na mesma pasta. A decisão é:

- `budget_key = HMAC-SHA-256(budgetSecret, namespace + normalizedKey)` como
  identidade estável do budget;
- `key_version` e `key_digest = HMAC-SHA-256(currentSecret, namespace + keyId + normalizedKey)`
  como projeção versionada, sem chave bruta;
- rotação normal conserva `budgetSecret`, portanto atualiza a projeção sem
  resetar `count`/`reset_at`;
- limite de capacidade cheio com buckets ativos falha fechado; nenhum bucket
  ativo é removido para admitir churn;
- limpeza remove somente `reset_at <= now()`.

## BUILD realizado

- `apps/api/src/rate-limit.ts`: keyring validado, HMAC, material opaco,
  `RateLimitCapacityError`, memória sem eviction ativo e upsert PostgreSQL
  parametrizado com advisory lock de capacidade;
- `apps/api/src/server.ts`: composição PostgreSQL injeta
  `CVG_RATE_LIMIT_KEYRING`; fora de `NODE_ENV=test` a configuração ausente
  falha antes do startup do limiter;
- `packages/persistence/migrations/0026_rate_limit_key_hardening.sql`:
  migration forward-only que limpa somente o estado efêmero, remove `key`
  plaintext e cria `budget_key`, `key_version` e `key_digest` com checks;
- `apps/api/src/tenant-preflight.ts`: exige colunas/checks/índice novos e
  rejeita a coluna legada `key`;
- testes unitários, sintéticos e PostgreSQL cobrem RED/GREEN, expiração,
  churn/capacidade, ausência de plaintext, rotação, concorrência real,
  preflight, grants e request ordinária.

## Matriz de aceite

| Critério                                  | Resultado local | Evidência                                                                          |
| ----------------------------------------- | --------------- | ---------------------------------------------------------------------------------- |
| AC-01 — nenhum key/IP plaintext em SQL/DB | PASS            | teste distribuído captura valores; PostgreSQL real aplica migration 0026/preflight |
| AC-02 — rotação preserva budget           | PASS            | teste sintético com `previous`/`current`, uma linha e `key_version` corrente       |
| AC-03 — churn não desalojará bucket ativo | PASS            | teste memória RED/GREEN e condição SQL sem `ORDER BY ... DELETE`                   |
| AC-04 — janela expira antes de liberar    | PASS            | testes de janela em memória e PostgreSQL descartável                               |
| AC-05 — instâncias convergem              | PASS            | 7/7 testes PostgreSQL distribuídos; instâncias/restart compartilham budget         |
| AC-06 — schema/preflight hardening        | PASS            | migration smoke, preflight completo e role PostgreSQL 45/45                        |
| AC-07 — configuração fora de test         | PASS            | teste de keyring ausente/inválido; composição exige `CVG_RATE_LIMIT_KEYRING`       |
| AC-08 — regressão Node 22                 | PASS LOCAL      | suite completa, typecheck, lint, Prettier, links e diff                            |

## RED/GREEN e verificações

O teste inicial falhou exatamente nos dois controles ausentes: o limiter em
memória admitia `client-c` desalojando um bucket ativo e o SQL ainda emitia
`ORDER BY reset_at ASC`; os valores também continham `distributed-key`. Após o
BUILD, o slice focado passou.

| Comando                                                                                                                                                                                                                                                                                                                                              | Resultado                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH npx vitest run --no-file-parallelism apps/api/src/__tests__/rate-limit.test.ts apps/api/src/__tests__/rate-limit-distributed-postgres.test.ts apps/api/src/__tests__/postgres-persistence-mode.test.ts packages/persistence/src/__tests__/postgres-migration-smoke.test.ts --reporter=dot` | `4 files passed; 55 passed; 15 skipped`                                        |
| `TEST_DATABASE_URL=postgres://cvg_test:cvg_test_password@127.0.0.1:55434/cvg_test AUD19_PG_REQUIRED=1 PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH npx vitest run --no-file-parallelism apps/api/src/__tests__/rate-limit-distributed-postgres.test.ts --reporter=dot`                                                                   | `1 file; 9/9 passed; PostgreSQL 16 descartável; concorrência/capacidade`       |
| `TEST_DATABASE_URL=postgres://cvg_test:cvg_test_password@127.0.0.1:55434/cvg_test npx vitest run --no-file-parallelism apps/api/src/__tests__/postgres-persistence-mode.test.ts --reporter=dot`                                                                                                                                                      | `1 file; 45/45 passed; PostgreSQL 16 descartável`                              |
| `PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH npm test -- --reporter=dot`                                                                                                                                                                                                                                                                | `291 files passed; 20 skipped; 2067 passed; 146 skipped`                       |
| `PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH npm run typecheck`                                                                                                                                                                                                                                                                         | `PASS`                                                                         |
| `PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH npm run lint`                                                                                                                                                                                                                                                                              | `PASS`                                                                         |
| `PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH npx prettier --check <slice REM21-007>`                                                                                                                                                                                                                                                    | `PASS`                                                                         |
| `npm run docs:check-links`                                                                                                                                                                                                                                                                                                                           | `broken: []`; 11 absolute paths são históricos em critic-security preexistente |
| `git diff --check`                                                                                                                                                                                                                                                                                                                                   | `PASS`                                                                         |

O full run final foi reexecutado após a clonagem defensiva do keyring em
memória e após os testes PostgreSQL de concorrência/capacidade. O resultado
permanece `FINAL_CERT_DEFERRED` somente pelos gates candidate-wide/I1/G21-5/
G21-6, não por uma falha local desta task.

## Auditoria e limitações

- o banco usado foi o container local existente `cvg-aud20-04-postgres`, em
  porta `55434`, com schemas nomeados por teste e teardown; nenhum container
  de produção foi alterado;
- o `budgetSecret` é uma âncora operacional que deve permanecer durante uma
  rotação; trocá-lo exige migration explícita e não é tratado como rotação
  transparente;
- o keyring anterior é permitido somente como janela de rollout/configuração;
  não há sincronização de secrets entre instâncias;
- não houve deploy, HA externo, secret manager, observabilidade produtiva,
  I1, candidate freeze ou validação G21-5/G21-6;
- dois críticos fresh-context foram solicitados por orquestração, mas não
  devolveram parecer antes do timeout operacional; nenhum PASS independente foi
  contado como evidência. A decisão abaixo depende dos artefatos e checks
  reproduzíveis desta rodada;
- skips da suíte continuam governados pelo catálogo existente e não foram
  convertidos artificialmente em PASS.

## Decisão

`REM21-007 = VERIFIED_LOCAL / FINAL_CERT_DEFERRED`. O controle local fecha o
achado reproduzido; produção continua `NO_GO` e qualquer certificação final
candidate-bound fica para `REM21-019`/G21-6.
