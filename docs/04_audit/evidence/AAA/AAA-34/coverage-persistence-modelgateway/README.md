# AAA-34 — Coverage hardening: persistence + model-gateway

Status: `COMPLETED_LOCAL` (evidência própria; sujeita a revisão independente).
Escopo: `packages/persistence` e `packages/model-gateway`. **Somente testes adicionados**;
nenhum arquivo de produção, contrato, `vitest.config.mts`, `package.json` ou tracking compartilhado alterado.

## Resultado

- `packages/persistence`: statements **85.26% → 97.80%**, branches **79.55% → 92.07%**
  (functions 94.35% → 98.94%, lines 85.77% → 98.06%).
- `packages/model-gateway`: statements **86.59% → 98.47%**, branches **78.87% → 96.56%**
  (functions 80.00% → 98.67%, lines 87.86% → 98.56%).
- Ambas as barras da task (stmts ≥90%, branches ≥85%) e os pisos da barra AAA-04 v2 §9.1
  (stmts/lines/functions ≥90%, branches ≥85%) foram atingidos no run full-suite.

## Arquivos de teste adicionados (6 arquivos, 101 testes novos)

| Arquivo | Testes | Foco |
| --- | --- | --- |
| `packages/persistence/src/__tests__/restore-integrity.test.ts` | 12 | estado completo por coleção, redação, integridade de digest, escopo por tenant, colisões append-only, checkpoints, drafts, outbox pai/filho |
| `packages/persistence/src/__tests__/outbox-edge.test.ts` | 22 | validação/limites de payload, lease/takeover/backoff, ack com journal e takeover, efeitos sync/async, handoff de sessão, dead-letter/requeue, rollback de auditoria, clock inválido |
| `packages/persistence/src/__tests__/conversation-repository.test.ts` | 13 | CRUD de conversa/sessão/mensagem, continuação elegível, bind de versão de agente, runtime inbound, takeover, timeline/paginação, busca por mensagem externa |
| `packages/persistence/src/__tests__/repository-error-paths.test.ts` | 6 | escopo por tenant e caminhos de erro de approval/task/audit, filtros de evidência e checkpoints |
| `packages/model-gateway/src/__tests__/gateway-hardening.test.ts` | 36 | defaults de clock/sleep/random, fallback e substituição de rota, classificação de dados, mapa de erros de prompt, router, budget, taxonomia de erros, circuit breaker, provider determinístico, prompt registry |
| `packages/model-gateway/src/__tests__/local-http-providers.test.ts` | 12 | servidores HTTP fake em `127.0.0.1:0` (porta efêmera) para OpenAI-compatible e Ollama: happy path, timeout, cancelamento, malformed, limite de resposta, guarda SSRF/host-pinning, leitura de corpo falha |

## Comandos e exit codes

Todos os runs de coverage usaram `--coverage.reportsDirectory` isolado em `/tmp/opencode/aaa34/`
para não colidir com outra lane que escrevia `coverage/` simultaneamente.

| # | Comando | Exit | Resultado |
| --- | --- | --- | --- |
| 1 | `npx vitest run packages/persistence --coverage --coverage.reportsDirectory=/tmp/opencode/aaa34/cov-before-persistence --coverage.reporter=json --coverage.reporter=json-summary --coverage.reporter=text --no-file-parallelism --maxWorkers=2` | 1 | 25 arquivos/134 testes PASS; exit 1 apenas pelos thresholds globais do config em run focused (`before-persistence-focused.log`) |
| 2 | `npx vitest run packages/model-gateway --coverage --coverage.reportsDirectory=/tmp/opencode/aaa34/cov-before-mg --coverage.reporter=json --coverage.reporter=json-summary --coverage.reporter=text --no-file-parallelism --maxWorkers=2` | 1 | 3 arquivos/45 testes PASS; exit 1 apenas por thresholds em focused (`before-model-gateway-focused.log`) |
| 3 | `TEST_DATABASE_URL=postgres://ricardo@127.0.0.1:55432/cvg_aaa16_test npx vitest run packages/persistence --coverage --coverage.reportsDirectory=/tmp/opencode/aaa34/cov-after2-persistence --coverage.reporter=json --coverage.reporter=json-summary --coverage.reporter=text --no-file-parallelism --maxWorkers=2` | 1 | 29 arquivos/187 testes PASS, **0 skips**; exit 1 apenas por thresholds em focused (`after-persistence-focused-postgres.log`) |
| 4 | `npx vitest run packages/model-gateway --coverage --coverage.reportsDirectory=/tmp/opencode/aaa34/cov-after2-mg --coverage.reporter=json --coverage.reporter=json-summary --no-file-parallelism --maxWorkers=2` | 1 | 5 arquivos/93 testes PASS; exit 1 apenas por thresholds em focused (`after-model-gateway-focused.log`) |
| 5 | `npx vitest run --coverage --coverage.reportsDirectory=/tmp/opencode/aaa34/cov-after-full --coverage.reporter=json --coverage.reporter=json-summary --no-file-parallelism --maxWorkers=2` | 0 | 225 arquivos PASS + 4 skipped; 1544 testes PASS + 57 skipped; thresholds globais OK (`after-full-coverage.log`) |
| 6 | `npm run typecheck` | 0 | `tsc -p tsconfig.typecheck.json --noEmit` limpo (`typecheck.log`) |
| 7 | `npm run lint` | 0 | `eslint .` limpo (`lint.log`) |
| 8 | `npm test` | 0 | 225 arquivos PASS + 4 skipped; 1544 testes PASS + 57 skipped; **zero falhas** (`full-npm-test.log`) |

Baseline citado pela task: 1160 PASS / 57 skipped. O total atual (1544) inclui também testes de
outras lanes ativas no working tree; a contribuição desta task é de 101 testes.

PostgreSQL: fixture descartável `127.0.0.1:55432`, database `cvg_aaa16_test`
(`/tmp/opencode/aaa-agent2-pg16`). Porta `5432` (`cvg-his-v4`) nunca foi usada. Com
`TEST_DATABASE_URL` definido os testes dependentes de PostgreSQL **não** são pulados
(run #3: 0 skips). Eles não foram adicionados ao `package.json`; o glob `packages/**/*.test.ts`
já os inclui.

## Bugs encontrados

- Nenhum bug de produção no escopo; nenhuma correção de produção foi necessária (nenhum RED test).
- Branches defensivos comprovadamente inalcançáveis por construção foram deixados sem cobertura e
  documentados em `manifest.json` (`deadBranches`), sem relaxar barra ou excluir código.
- Flake fora do escopo observado uma vez em `channel-effect-journal-postgres.test.ts` (lane
  AAA-12) sob concorrência pesada com o cluster descartável compartilhado; o arquivo passa
  isolado (12/12) e no run focado completo (29 arquivos/187 testes). Nenhuma alteração de produto
  foi feita por esta lane.
- Primeiro run full-suite desta lane teve 1 falha concorrente em
  `packages/agent-runtime/src/__tests__/runtime-journal.test.ts` (lane AAA-10); reexecutado
  isolado 18/18 PASS e o run full final fechou 0 falhas.

## Limitações

- O working tree é compartilhado com outras lanes; o baseline `before` usa o run full-suite de
  `AAA-13` em cópia isolada, validado por sha256 (`baseline-provenance-sha256.txt`: todos os
  fontes de produção dos dois pacotes idênticos; únicas diferenças são arquivos da lane AAA-12 e
  os testes novos).
- O denominador de cobertura segue o `vitest.config.mts` existente: adapters `*postgres*` e três
  repositórios de plataforma ficam excluídos. Helpers de RLS nesses adapters não entram no
  percentual; o comportamento PostgreSQL foi exercitado no run #3 (0 skips), fora do denominador.
- Cobertura mede presença de statements/branches; não substitui revisão independente nem prova de
  durabilidade física.
- O run full de coverage foi medido antes da formatação prettier dos 6 testes novos (mudança
  exclusivamente sintática); após a formatação, os 6 arquivos foram reexecutados (101/101 PASS),
  `typecheck`/`lint`/`npm test` voltaram a passar verdes.
- Nenhum commit/push/deploy; nenhuma alteração de thresholds/config; nenhum dado real ou egress
  externo (apenas servidores fake em loopback e fixture PostgreSQL descartável).
