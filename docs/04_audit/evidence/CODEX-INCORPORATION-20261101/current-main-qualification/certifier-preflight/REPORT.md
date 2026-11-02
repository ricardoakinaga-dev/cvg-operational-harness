# Pré-condições da certificação do port

A inspeção estática da fonte `9ccb933fa7887f8775ea33f4aa61cab0b2c26037` confirmou o contrato que a próxima campanha precisa executar. Não houve execução de aplicação, teste, import de módulo de aplicação, PostgreSQL, browser, instalação ou nova certificação. O resultado desta etapa é admissão estática da preparação, não aceite funcional.

## Comandos e limites

O catálogo de dezesseis comandos é idêntico ao da fonte5be. A extração foi feita pelo AST do TypeScript6.0.3, sem importar o certificador. A [captura estruturada](contract.json) inclui os comandos literais, scripts npm, thresholds e vinte e dois arquivos fonte com hashes e snapshots.

| Gate | Comando do alvo |
| --- | --- |
| format | `npm run format:check` |
| typecheck | `npm run typecheck` |
| lint | `npm run lint` |
| build | `npm run build` |
| unit | `npm test -- --reporter=default --reporter=json --outputFile=certification/unit-test-report.json` |
| coverage | `npm run test:coverage && npm run coverage:critical && npm run mutation:guard` |
| security | `npm run audit:security` |
| worker_startup | `npm run test:worker:startup` |
| postgres | `npm run test:postgres -- --reporter=default --reporter=json --outputFile=certification/postgres-test-report.json` |
| e2e | `node scripts/run-e2e-evidence.mjs` |
| evals | `npx tsx scripts/phase10-eval-report.ts` |
| chaos | `npx vitest run packages/chaos --no-file-parallelism --maxWorkers=2 --reporter=json --outputFile=certification/chaos-report.json` |
| load | `npx tsx scripts/phase10-load.ts --events=10000` |
| restore | `npx tsx scripts/phase10-restore-check.ts` |
| sbom | `node scripts/generate-sbom.mjs` |
| licenses | `node scripts/check-licenses.mjs` |

Cada subgate nativo conserva3600s e buffer128MiB. O controlador externo previsto conserva9000s; isso não amplia o prazo de nenhum subgate. A futura campanha exige claim de todos esses gates, inclusive SBOM/licenças, e recursos próprios antes do início. Esta etapa não os executou nem reservou portas.

## Cobertura e fixtures

O escopo do harness é `CVG_TEST_SCOPE=core`, conforme ADR010 e o workflow. O certificador injeta `CVG_COVERAGE_PER_FILE=1` apenas no gate de cobertura. Contracts, harness, orchestrator e agent-runtime exigem100% statements/branches/functions/lines por arquivo. A checagem agregada independente conserva90/85/90/90; o manifesto crítico contém dezenove caminhos em seis grupos e exige95% de branches. Não importar thresholds, exclusões ou contagens de testes de outra candidata.

O script PostgreSQL do alvo enumera47arquivos completos, com timeout de teste60000ms. A campanha precisa disponibilizar seu banco descartável em todos os subgates, por `TEST_DATABASE_URL` e `DATABASE_URL`, além dos opt-ins sintéticos `PHASE4A_PG_REQUIRED=1` e `PHASE4A_DISPOSABLE_PG=1`. Número de testes e eventuais pendências serão extraídos dos relatórios atuais;482 ou10490 de outra fonte não são expectativas artificiais deste port.

No E2E, CI usa Chromium, um worker e não reutiliza servidores existentes. A configuração permite duas retries, mas o aceite exige resultado real sem retries/flaky/skips; a configuração não será alterada para fabricar essa condição. JSON, JUnit, log e UUID precisam corresponder ao mesmo run/candidato/execução. Portas API/web ainda não foram atribuídas para9ccb.

## Diferenças entre as bases

Dos vinte e dois insumos capturados, diferem lock, certificador, regras de certificação, ci-bar e seu contrato. O lock do alvo foi preservado. No producer do alvo, security classifica inicialmente pelo exit; o verifier final exige exit0 e o literal `found 0 vulnerabilities`. A candidata5be aplica essa mesma regra também no producer, acrescenta diagnóstico de processo e captura o log interno no ci-bar. A regra final de aceite de segurança é idêntica. A diferença não justifica importar a implementação do donor nem anunciar equivalência de todos os artefatos de CI.

`audit:security` é `npm audit --audit-level=high`: consulta o registry e precisa de resultado atual. Falha de transporte não concede PASS. O controlador deve conservar a allowlist de ambiente e não registrar credenciais. Nenhuma consulta ao registry foi feita por este preflight.

Os resultados gerados são invalidados antes de cada gate, incluindo critical-coverage e mutation-guard no início da cadeia de cobertura. Os logs nativos são escritos depois de cada subgate terminar. Portanto, durante a execução pode existir um log tracked histórico; só os headers atuais e o término do produtor permitem atribuir seu conteúdo à campanha.

## Próxima ação

Observar a certificação existente96143 da fonte5be até terminal e conferir sua limpeza própria. A seguir, consultar claims/GBrain, registrar a campanha de9ccb, conferir novamente HEAD/treze pins/árvore limpa e reservar recursos próprios. Executar o certificador original do alvo, preservar sua primeira falha e verificar os resultados atuais. Este preflight não cria certificado, não promove código e não fecha os18recortes,12comandosCLI ou CQ01–14.

Uma tentativa inicial do coletor usou um caminho incorreto para `ci-bar-contract.mjs` e terminouENOENT antes do JSON final. A [falha de coleta](collector-attempt-r1.json) e a preimagem do coletor foram preservadas. O import real de ci-bar resolveu o caminho correto; a coleta estática corrigida terminouexit0. Não houve execução de aplicação em nenhuma tentativa.
