# FULLTEST-20261007 — bateria completa de testes do harness local

- Task `FULLTEST-20261007`, Claude Code, 07/10/2026. Pedido do usuário: "ele está
  instalado localmente, faça todos os testes possíveis nele e me traga um plano para
  alcançar produção". Plano resultante: [0374](../../../03_build/0374_plano_producao_harness.md).
- Alvos: (a) instância local do Codex `cvg-harness-local-20261006` em
  http://127.0.0.1:3410 (API `NODE_ENV=test`, persistência memory, identidade
  simulation, modelo fake), usada sem parar/reiniciar/reconstruir; (b) worktree
  descartável do snapshot `31dc1c3` com `npm ci` próprio, Node 22.23.2; (c) imagem
  própria `cvg-operational-harness:fulltest-31dc1c3` (`--target runtime`); (d)
  PostgreSQL 16.15 próprio `claude-fulltest-pg-20261007` em loopback 55741, bancos
  separados por gate.
- Nenhum dado real, provider, canal, push, deploy ou release. Recursos próprios
  removidos ao final; a instância 3410 e o PostgreSQL do Codex não foram tocados além
  de requisições HTTP/browser com dados sintéticos (agentes `fulltest-*` e fixtures dos
  specs E2E ficaram na memória da API até o próximo reinício dela).

## 1. Instância local (3410)

| Verificação                                                                 | Resultado                                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Contêineres (`docker inspect`)                                              | API `user=cvg`, web `user=101`; ambos `read_only`, `cap_drop ALL`, `no-new-privileges`, tmpfs `/tmp`, healthy |
| `/live`, `/ready`                                                           | 200; `/ready` declara `persistence` e `durability` degraded (memory), coerente com o perfil                   |
| Cabeçalhos de segurança                                                     | CSP `default-src 'none'`, `X-Frame-Options DENY`, `nosniff`, `referrer-policy no-referrer`, `cache-control no-store` |
| CORS com origem hostil                                                      | sem `Access-Control-Allow-Origin`                                                                              |
| Corpo de 2 MB em `/v1/tasks`                                                | 413                                                                                                           |
| Rota inexistente / método errado                                            | 404 JSON envelopado                                                                                           |
| Sem identidade em rotas protegidas                                          | 401 em `/v1/admin/agents`, `/v1/tasks`, `/v1/approvals`                                                       |
| 150 requisições anônimas seguidas                                           | 150 × 401, sem 429 (observação registrada no plano)                                                           |
| `/v1/session` em modo simulation                                            | 503 `configuration_error` (bootstrap trusted indisponível, esperado)                                          |
| Token trusted em modo simulation                                            | 401                                                                                                           |
| Papel inexistente / tenant ausente                                          | 401 / 401                                                                                                     |
| Admin cria agente; slug duplicado; payload inválido                          | 200 / 400 / 400 `validation_failed`                                                                           |
| Outro tenant lê versões do agente                                           | 403                                                                                                           |
| Viewer e Operator criam agente                                              | 401 (papel não reconhecido) / 403 `Role cannot perform agent:configure`                                       |
| Versão DRAFT + dry-run no Test Lab                                           | 200; trace com intent `institutional_question` 0.94, `approved_source_missing` → handoff controlado           |
| Versão com `provider: openai`                                               | criação aceita em DRAFT; dry-run recusado 400 `Configured model provider is unavailable in controlled runtime` |
| Transições DRAFT→TESTING→APPROVED; APPROVED→DRAFT                            | 200 / 200 / 400 `invalid_action`                                                                              |
| Publicar sem release candidate; RC sem gate results                          | 400 / 400                                                                                                     |
| Latência `/ready` (200 req)                                                 | p50 1,1 ms, p95 1,5 ms, máx 3,8 ms via nginx                                                                   |
| Browser (Playwright, 9 specs contra 3410: control center, visual shell, acessibilidade axe, teclado, estados, troca de tenant, falhas, reduced motion) | **9/9 PASS** ([raw/e2e-3410-report.json](raw/e2e-3410-report.json)) |

## 2. Gates do repositório no worktree `31dc1c3`

| Gate                                     | Resultado                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `format:check`, `typecheck`, `lint`, `build` | PASS                                                                                     |
| `test:coverage` (PG próprio)             | **359 arquivos / 2.952 PASS**, 1 skip catalogado (SKIP-PG-021); global S 91,73 / B 87,29 / F 94,09 / L 92,82 |
| `test:postgres`                          | **37 arquivos / 302 PASS**, zero skips (175 s)                                              |
| `coverage:critical`                      | PASS                                                                                        |
| `mutation:guard`                         | PASS, 10/10 mutantes mortos                                                                 |
| `skip:governance`                        | PASS                                                                                        |
| `docs:check-links` + higiene de evidência | PASS                                                                                       |
| `audit:security`                         | 0 vulnerabilidades                                                                          |
| `licenses:check`                         | 380 componentes, 0 negados, 0 sem classificação                                             |
| `sbom`                                   | CycloneDX gerado, 380 componentes                                                           |
| `ci:bar:contract`, `readiness`           | PASS                                                                                        |
| `test:worker:startup`                    | PASS (startup smoke + controlled smoke)                                                     |
| `test:chaos`                             | 3 arquivos / 20 PASS                                                                        |
| `test:evals`                             | 2 arquivos / 12 PASS                                                                        |
| `test:load`                              | 10.000 eventos, 2 workers, 510,7 ev/s (contrato em memória, não é benchmark de produção)   |
| `test:restore` (phase10)                 | PASS                                                                                        |
| `test:postgres:proof` (rem21-010)        | PASS                                                                                        |
| `test:observability:proof` (rem21-011)   | PASS                                                                                        |
| `test:e2e:rem21-014` (browser proof)     | PASS                                                                                        |
| `test:e2e` (Playwright, dev servers)     | 1ª execução **10/12 FAIL** (Vite não resolve `@cvg/*` sem `packages/*/dist`); após `tsc -b`: **12/12 PASS** ([raw/e2e-worktree.txt](raw/e2e-worktree.txt)) |
| `verify:phase2`                          | PASS (focado, demo e catálogo PostgreSQL) — exige `TEST_DATABASE_URL`                       |
| `verify:phase3`                          | ver §5                                                                                      |
| `test:phase4a` + `verify:phase4a`        | 14 arquivos / 102 PASS com `PHASE4A_DISPOSABLE_PG=1`; sem a flag falha por desenho          |
| `verify:phase4a:identity`                | PASS                                                                                        |
| `boundary:products`                      | ver §5                                                                                      |
| `certify` (agregado phase10)             | ver §5                                                                                      |

## 3. Imagem própria `cvg-operational-harness:fulltest-31dc1c3`

| Verificação                                   | Resultado                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `production-stack-smoke.ts`                   | **22/22 PASS**: job de migração, papéis separados, recusa de credencial DDL, live/ready, 401/login/protegida, perda de conexão 503 sem cookie com API viva e recuperação, worker kernel em produção, healthchecks, webhook assinado, aprovação com um efeito, reuso sem duplicata, replay recusado após restart, pausa retém/retomada drena, alerta `worker_down` assinado ([raw/production-stack-smoke.json](raw/production-stack-smoke.json)) |
| `restore-audit-chain-proof.ts`                | script oficial **FAIL 2/2** ("Connection terminated unexpectedly": `pg_isready` responde antes do restart pós-init do contêiner postgres); cópia com espera por `select 1` duas vezes: **PASS**, cadeia íntegra antes e depois do restore, adulteração de metadado e de payload detectadas ([raw/restore-audit-chain.json](raw/restore-audit-chain.json)) |
| gitleaks no sistema de arquivos da imagem     | **0** achados                                                                                                |
| gitleaks no worktree (fonte)                  | 6.557 achados: 6.548 em `docs/04_audit/evidence` (histórico sintético) e 9 fixtures sintéticas fora dela ([raw/gitleaks-summary.json](raw/gitleaks-summary.json)); nenhum segredo real |
| Trivy HIGH/CRITICAL                           | **1 HIGH**: `libssl3 3.0.20-1~deb12u2`, `CVE-2026-84782`, sem versão corrigida ([raw/trivy-image-summary.json](raw/trivy-image-summary.json)) |

## 4. Achados

Nenhum achado de código do kernel. F-01 a F-07 e a observação sobre rate limit estão
tabelados no [plano 0374 §2](../../../03_build/0374_plano_producao_harness.md).
Resumo: `main` sem proteção (P1 de processo); 1 HIGH na base distroless sem correção
(P2 de dependência); quatro armadilhas de ferramental de teste reproduzíveis em clone
limpo (P3): E2E precisa de `dist`, prova de restore depende de `pg_isready`, fases
2/3/4A exigem variáveis não documentadas, `boundary:products` lento.

## 5. Gates concluídos após o fechamento inicial

Preenchido na mesma rodada; ver entrada correspondente nos ledgers.

- `verify:phase3`: **PASS** (focado, demo e catálogo PostgreSQL), com `TEST_DATABASE_URL`.
- `boundary:products`: terminou após ~22 min com `status: INCOMPLETE`, `passed: false`, **0 violações** e 8.856 diagnósticos `UNVERIFIED_INSTALLED_DEPENDENCY` (7.608 arquivos, 39.121 arestas: o checker percorre `node_modules` e falha fechado quando não verifica a dependência instalada). No checkout principal, `timeout 900` expirou. O checker segue em qualificação no HISO-005 (R64/R70); não é prova de fronteira aceita.
- `certify` (phase10, worktree limpo, PG próprio): **16/16 gates PASS**, `decision=CONDITIONAL_GO`, `certification=AAA_CONTROLLED` ([raw/certify-phase10-result.json](raw/certify-phase10-result.json)). A primeira tentativa falhou em `format` por arquivos auxiliares meus e saídas soltas do `tsc -b`; o worktree foi limpo e a certificação repetida. Um `skip:governance` disparado às 11:21 em paralelo ao `certify` falhou por `skip_report_missing_input` enquanto o `certify` regenerava `certification/*-report.json`; a execução isolada das 11:09 passou e é a válida.

## 6. Estado remoto verificado nesta rodada

- `origin/main` = `31dc1c3`; Verify `37559546904` e Security `37559546872` concluídos
  com sucesso em 07/10/2026 01:56 UTC.
- `branches/main/protection` → 404; rulesets `[]`.

## 7. Limites

- A instância 3410 roda em memória com modelo fake: não exercita PostgreSQL, worker nem
  provider; essas partes foram cobertas pela imagem própria e pelos gates do worktree.
- `tsc -b tsconfig.json` (usado só para produzir `dist` para o E2E) emite saídas soltas em
  `examples/` e `legacy/`; o worktree foi limpo com `git clean -fd` antes do `certify`.
- Nada foi commitado ou enviado; ledgers e esta evidência ficam no checkout para
  commit explícito do usuário.
