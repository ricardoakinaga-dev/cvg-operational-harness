# Auditoria do repositório por gates executados — 24/09/2026

## Escopo e método

Esta auditoria é distinta da [avaliação 0572](0572_repository_score_assessment_2026-09-24.md), que
se apoiou em leitura dirigida. Aqui os gates foram **executados** sob
`node v22.23.2` e `npm 10.9.8`, a toolchain exigida por `.nvmrc` e
`engines.node` (`>=22 <23`). O shell original desta sessão estava em Node
`v24.20.0`, fora do suportado; todos os resultados abaixo foram obtidos após
`nvm use 22`.

Procedimentos executados nesta rodada:

| Gate                      | Comando                                      | Resultado                                                          |
| ------------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| Typecheck                 | `npm run typecheck`                          | `PASS` (exit 0)                                                    |
| Lint                      | `npm run lint`                               | `PASS` (exit 0)                                                    |
| Formatação                | `npm run format:check`                       | **`FAIL` (exit 1, 24 arquivos)**                                   |
| Testes unitários          | `npm test`                                   | `PASS` — 303 arquivos, 2.137 pass, 146 skipped                     |
| Cobertura                 | `npm run test:coverage`                      | `90,86%` stmts / `85,88%` branch / `92,91%` funcs / `91,81%` lines |
| Build                     | `npm run build`                              | `PASS` (typecheck + vite build)                                    |
| Readiness                 | `npm run readiness`                          | `PASS` (4/4)                                                       |
| Cobertura crítica         | `npm run coverage:critical`                  | `PASS`                                                             |
| Mutation guard            | `npm run mutation:guard`                     | `PASS`                                                             |
| Governança de skips       | `npm run skip:governance`                    | `PASS` (0 skips nos gates certificados)                            |
| Auditoria de dependências | `npm run audit:security`                     | `PASS` (0 vulnerabilidades)                                        |
| Links da documentação     | `npm run docs:check-links`                   | **`FAIL` (exit 1, 5 ocorrências)**                                 |
| Higiene de evidências     | `npm run evidence:check-hygiene`             | `PASS` — `EVIDENCE_HYGIENE_OK`, 231/231                            |
| Diff check                | `npm run diff:check`                         | `PASS`                                                             |
| E2E de navegador          | `npx playwright test`                        | `PASS` — 12/12 (inclui axe e teclado)                              |
| Git                       | `git status --porcelain`, `git diff --check` | 344 entradas não commitadas; `git diff --check` `PASS`             |

Nenhum dado real foi usado, nenhum serviço externo foi acessado, nenhuma ação
clínica/financeira foi executada e nenhum arquivo de produto foi alterado por
esta auditoria.

## Notas por item (0–100)

Escala: `0` ausente, `50` parcial, `75` demonstrado localmente, `90` robusto
no escopo controlado, `100` qualificado para o uso pertinente.

|   # | Item                              | Peso |   Nota | Evidência e limite                                                                                                                                                                                                                                                                                                                                                 |
| --: | --------------------------------- | ---: | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|   1 | Testes e cobertura                |  12% | **89** | 2.137 pass / 146 skipped em 303 arquivos; coverage 90,86/85,88/92,91/91,81 acima dos thresholds 90/85/90/90; `coverage:critical` e `mutation:guard` `PASS`. Limite: 146 skips condicionais e nenhum gate PostgreSQL re-executado nesta rodada.                                                                                                                     |
|   2 | E2E e acessibilidade              |   5% | **88** | 12/12 Playwright `PASS` em 27s, incluindo axe sem violações serious/critical, foco por teclado e troca de tenant. Limite: sem operador real nem IdP externo.                                                                                                                                                                                                       |
|   3 | Dados, migrations e transações    |   8% | **82** | 27 migrations (`0000`–`0026`), RLS, outbox, effect journal e provas PostgreSQL históricas. Limite: restore/RPO/RTO não re-executados aqui; `test:postgres` exige banco descartável e não rodou nesta rodada.                                                                                                                                                       |
|   4 | Segurança e privacidade           |  13% | **79** | `npm audit` 0 vulnerabilidades; gitleaks + CodeQL no CI; actions pinadas por SHA; `permissions: contents: read`; `.env` ignorado e só `.env.example` trackeado; segredos encontrados são fixtures sintéticas de teste. Limite: IdP/egress/RLS-backfill não qualificados e `apps/worker/src/main.ts` ainda registra `error.message` cru em alguns catchs (RA24-05). |
|   5 | Arquitetura e modularidade        |  10% | **76** | Monorepo com 3 apps e 22 packages, 889 arquivos TS, ~94k LOC fora de testes, fronteiras explícitas entre `harness`, `persistence`, `platform` e apps. Contra: hotspots `apps/api/src/server.ts` 5.857 linhas, `packages/persistence/src/postgres.ts` 3.354, `packages/agent-runtime/src/runtime.ts` 2.603.                                                         |
|   6 | Confiabilidade e concorrência     |   8% | **76** | Testes de idempotência, lease, fencing, heartbeat, sweep e restart executam verdes. Limite: nenhuma carga, falha parcial ou restart medido nesta rodada; `test:load` não executado aqui.                                                                                                                                                                           |
|   7 | Observabilidade                   |   6% | **72** | Logs estruturados pino, correlation ID, métricas e runbook sintético de observabilidade. Limite: collector durável, retenção, dashboards, paging e SLO de produção sem evidência operacional.                                                                                                                                                                      |
|   8 | Documentação e governança         |   8% | **70** | Pipeline `DISCOVERY → PRD → SPEC → BUILD → AUDIT` com gates `0090`/`0090`/`0190` presentes e aprovações hash-bound explícitas; glossário, índice operacional e quatro ledgers mestres. Contra: 231 arquivos de evidência vazios (todos catalogados), 47 MB só em `04_audit/evidence` e 914 arquivos `.md`.                                                         |
|   9 | CI/CD e certificação              |   7% | **70** | `verify.yml` com ~40 gates encadeados, serviço Postgres 16, timeout de 180 min, artefatos versionados e `security.yml` com gitleaks/CodeQL/SBOM. Contra: **o CI está vermelho hoje** — `format:check` e `docs:check-links` retornam exit 1, então o gate `format` falharia.                                                                                        |
|  10 | Qualidade de código               |   8% | **68** | `typecheck` e `lint` `PASS`. Contra: `format:check` falha em 24 arquivos e persistem arquivos monolíticos acima de 2.000 linhas.                                                                                                                                                                                                                                   |
|  11 | Consistência e frescor documental |   6% | **62** | `README.md` raiz ainda declara `Estado atual — 2026-09-20` (4 dias defasado); `0344` já opera em AUD53/C1M enquanto `README`/índice abrem em AUD52/C1L; checker de links exit 1 com 5 ocorrências de parser na SPEC L03 (artefatos de sintaxe, não arquivos ausentes).                                                                                             |
|  12 | Higiene do repositório (git)      |   5% | **42** | 344 entradas não commitadas: 179 modificados (+31.784 / −7.673) e 165 não rastreados (~22k LOC), cerca de 54k linhas sem commit; último commit `05d1f33` de 17/09/2026 (7 dias); apenas 17 commits; sem arquivo `LICENSE` apesar de `license: ISC` no `package.json`.                                                                                              |
|  13 | Prontidão para produção           |   4% | **28** | `NO_GO` consistente em todos os ledgers; G21-5/G21-6 fechados; M07-S1 `FAIL / OPEN` (C1L parou no candidate freeze por drift de `0190_spec_validation.md`); revisões I1 e Final Critic `UNAVAILABLE`.                                                                                                                                                              |

### Nota geral ponderada

**73/100** (72,79 arredondado).

Pesos: 12/5/8/13/10/8/6/8/7/8/6/5/4%, na ordem da tabela, somando 100%.

O resultado converge com o auto-score `73/100` da [0572](0572_repository_score_assessment_2026-09-24.md),
mas foi derivado de execução de gates, não de leitura. A prontidão para
produção permanece `28/100` e `NO_GO`.

## Achados priorizados

| ID      | Prioridade | Observação e evidência                                                                                                                                                                                                                | Encaminhamento e aceite                                                                                                                                                                                                                                       |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RA25-01 | **P0**     | 344 entradas não commitadas (~54k linhas) com último commit em 17/09; inclui testes e features novos (`operator-session`, `homolog-worker`, `TraceViewer`, `apps/web/src/auth/`).                                                     | Revisar, separar e commitar em lotes coerentes ou registrar `git stash` explícito; nenhum gate de BUILD é necessário para commit de trabalho já verificado, mas a decisão de escopo é humana. Aceite: `git status --porcelain` vazio ou com escopo declarado. |
| RA25-02 | **P0**     | `npm run format:check` exit 1 em 24 arquivos, entre eles `docs/20_master_execution_log.md`, `docs/99_runtime_state.md` e `packages/conversation/src/__tests__/postgres-store.unit.test.ts`. O gate `format` do `verify.yml` falharia. | Aplicar `npx prettier --write` apenas nos arquivos listados e reexecutar `npm run format:check` até exit 0. Aceite: exit 0 sem alterar semântica.                                                                                                             |
| RA25-03 | **P0**     | `npm run docs:check-links` exit 1 com 5 ocorrências de extração na SPEC L03 e na crítica `L03-generator-spec` — falsos positivos de exemplos de sintaxe, não links ausentes. É a `RA24-04-CHECKER` ainda aberta.                      | Task e gate de BUILD próprios para `scripts/check-doc-links.mjs` + testes; não editar a SPEC L03 draft. Aceite: exit 0 e link propositalmente quebrado ainda rejeitado.                                                                                       |
| RA25-04 | Alta       | `README.md` raiz defasado em 4 dias e divergência AUD52/C1L nos ledgers contra AUD53/C1M em `0344`.                                                                                                                                   | Sincronizar ponteiros de navegação após concluir o packet C1M, preservando históricos. Aceite: README, índice e ledgers apontam o mesmo ciclo corrente.                                                                                                       |
| RA25-05 | Alta       | C1L não criou candidate nem executou a matriz; o último `PASS` (C1J) é histórico e está stale contra a baseline atual.                                                                                                                | Concluir o packet C1M, obter decisão hash-bound e executar matriz fresca sob gate próprio. Aceite: candidate novo, matriz completa e reviews I1/Final Critic disponíveis.                                                                                     |
| RA25-06 | Média      | `apps/worker/src/main.ts` registra `error.message` diretamente em catchs de startup, fora da redação do `CompositeTelemetry` (RA24-05 ainda aberta).                                                                                  | Caso negativo com mensagem sintética contendo segredo/PII e política de redação no boundary. Exige task/gate de BUILD. Aceite: saída JSON sem exposição.                                                                                                      |
| RA25-07 | Média      | Hotspots `server.ts` 5.857 linhas, `postgres.ts` 3.354 e `runtime.ts` 2.603 elevam custo de manutenção.                                                                                                                               | Extrair módulos por domínio em slices pequenas, sem mudar comportamento, sob gates existentes. Aceite: gates verdes e tamanho por arquivo abaixo de ~1.500 linhas nas fatias tocadas.                                                                         |
| RA25-08 | Média      | Sem arquivo `LICENSE` apesar de `license: ISC` no `package.json`; `npm run licenses:check` existe no CI.                                                                                                                              | Adicionar `LICENSE` compatível com a declaração e incluir no escopo de diff check. Aceite: arquivo presente e `licenses:check` `PASS`.                                                                                                                        |
| RA25-09 | Média      | `test:postgres`, `test:load` e `test:restore` não foram executados nesta rodada; a evidência disponível é histórica.                                                                                                                  | Reprovar a matriz completa sob Node 22 com Postgres descartável antes de qualquer afirmação de gates atuais. Aceite: relatórios novos em `certification/` com data desta rodada.                                                                              |
| RA25-10 | Baixa      | 231 arquivos de evidência vazios (todos catalogados em `empty-artifact-status.json`) e 47 MB de evidência versionada.                                                                                                                 | Avaliar política de retenção/arquivamento de evidência antiga sem apagar histórico auditado. Aceite: política registrada e `evidence:check-hygiene` permanece exit 0.                                                                                         |

## Aderência e limites da auditoria CVG

- **PRD/SPEC:** os gates documentais `0090`/`0090`/`0190` foram lidos e
  conferidos; `0190` registra `SPEC_APPROVED_FOR_M07_S1_GATE_PREPARATION`
  com veredito `CONDITIONAL_PASS` por I1 indisponível. Nada aqui aprova BUILD.
- **Runtime, logs e métricas:** os gates executados foram os de pacote
  (testes, build, E2E locais); nenhum serviço foi implantado, nenhum banco
  externo foi usado e nenhuma métrica de produção foi medida.
- **Integrações e dados:** sem integração externa, sem credencial real e sem
  dado real. O E2E usa API e web locais descartáveis.
- **Revisão independente:** esta auditoria é single-context; não substitui I1
  nem Final Critic, que continuam `UNAVAILABLE` no ciclo M07-S1.
- **Produção:** `NO_GO` inalterado. Nenhuma nota desta tabela autoriza
  rollout, dado real, provider/canal ou ação sensível.

## Próxima ação

A sequência corrigida, gates e critérios de pronto estão no
[roadmap 0350](../03_build/0350_audit0573_roadmap.md) e no
[backlog 0351](../03_build/0351_audit0573_backlog.md). A prioridade técnica
única imediata é RA25-01 (commit do trabalho pendente) antes de qualquer
outra mudança.
