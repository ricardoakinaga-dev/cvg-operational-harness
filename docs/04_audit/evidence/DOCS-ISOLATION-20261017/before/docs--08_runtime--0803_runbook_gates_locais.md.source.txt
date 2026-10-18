# 0803 — Runbook dos gates locais do harness

- Data: 07/10/2026. Task: `PLAN0374-A-20261007` (plano [0374](../03_build/0374_plano_producao_harness.md), item B4).
- Objetivo: qualquer pessoa ou agente reproduz, num clone limpo, tudo o que o CI e a
  certificação exigem, sem descobrir armadilhas na hora. As armadilhas abaixo foram
  reproduzidas em [FULLTEST-20261007](../04_audit/evidence/FULLTEST-20261007/summary.md).

## Pré-requisitos

- Node 22 (`.nvmrc` = 22.23.2). O preflight recusa Node 24.
- Docker com acesso ao socket (PostgreSQL descartável, imagem, smokes).
- `npm ci` no clone. Nunca rode gates no checkout compartilhado de outro agente: use
  `git worktree add --detach <dir> <sha>` e `npm ci` lá.
- Um PostgreSQL 16 próprio em porta livre de loopback (55598/55599/55449 são do Codex):

```sh
docker run -d --name <seu-prefixo>-pg -p 127.0.0.1:<porta>:5432 \
  -e POSTGRES_PASSWORD=postgres postgres:16-alpine
# aguarde uma consulta real, não só pg_isready (a imagem reinicia uma vez após o init)
docker exec <seu-prefixo>-pg psql -U postgres -tAc 'select 1'
```

Use um banco por gate (`create database cvg_suite; create database cvg_pg; ...`) para
rodar gates em paralelo sem interferência.

## Ordem e variáveis

| Gate                                   | Comando                                                                      | Variáveis obrigatórias                         | Observação                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Formato, tipos, lint, build            | `npm run format:check typecheck lint build`                                  | —                                              | ~1 min                                                                          |
| Suíte com cobertura                    | `npm run test:coverage`                                                      | `TEST_DATABASE_URL`                            | ~10 min; 1 skip catalogado (SKIP-PG-021) sem `PHASE4A_DISPOSABLE_PG`            |
| Suíte PostgreSQL                       | `npm run test:postgres`                                                      | `TEST_DATABASE_URL`                            | ~3 min                                                                          |
| Cobertura crítica, mutação, skips      | `npm run coverage:critical mutation:guard skip:governance`                   | —                                              | Depende de `coverage/` e `certification/*-report.json` da suíte                 |
| E2E (Playwright)                       | `npm run test:e2e:prepare && npm run test:e2e`                               | portas 3199 e 4173 livres                      | **Sem o `prepare`, o dev server do Vite não resolve `@cvg/*` e 10/12 falham**   |
| Prova de browser REM21-014             | `npm run test:e2e:rem21-014`                                                 | —                                              |                                                                                 |
| Worker, chaos, evals, load, restore    | `npm run test:worker:startup test:chaos test:evals test:load test:restore`   | —                                              | `test:load` é contrato em memória, não benchmark                                |
| Provas rem21-010 / rem21-011           | `npm run test:postgres:proof test:observability:proof`                       | `TEST_DATABASE_URL` (010)                      |                                                                                 |
| Fases 2 e 3                            | `npm run verify:phase2 verify:phase3`                                        | `TEST_DATABASE_URL`                            | Sem a variável terminam `environment_blocked` (exit 2) por desenho              |
| Fase 4A                                | `npm run test:phase4a verify:phase4a verify:phase4a:identity`                | `TEST_DATABASE_URL`, `PHASE4A_DISPOSABLE_PG=1` | Sem a flag o gate PostgreSQL falha fechado, não pula                            |
| Docs, fronteira, licenças, SBOM, audit | `npm run docs:check-links licenses:check sbom audit:security`                | —                                              | `boundary:products` ver abaixo                                                  |
| Certificação agregada                  | `npm run certify`                                                            | `TEST_DATABASE_URL`, `PHASE4A_DISPOSABLE_PG=1` | ~25 min; o gate `format` reprova qualquer arquivo seu não formatado no worktree |
| Smoke da pilha de produção             | `npx tsx scripts/production-stack-smoke.ts --image <ref> --output <json>`    | —                                              | Sobe PostgreSQL, job de migração, API e worker próprios; 22 checks              |
| Restore com cadeia de auditoria        | `NODE_ENV=test npx tsx scripts/restore-audit-chain-proof.ts --output <json>` | —                                              | Espera por `select 1` duas vezes (corrigido em PLAN0374-A)                      |
| Segredos e vulnerabilidades da imagem  | gitleaks `git` mode com `.gitleaks.toml`; Trivy na imagem `--target runtime` | —                                              | `gitleaks dir` não aplica os allowlists por caminho (caminhos absolutos)        |

## Armadilhas conhecidas

1. **E2E em clone limpo.** `npm run build` só faz typecheck e `build:web`; não produz
   `packages/*/dist`. O dev server do Vite usado pelo Playwright resolve `@cvg/shared`
   pelo `exports` do pacote, que aponta para `dist`. Rode `npm run test:e2e:prepare`.
   Não use `tsc -b tsconfig.json` na raiz: ele emite `.js/.d.ts` soltos em `examples/`
   e `legacy/` e reprova o gate `format`.
2. **`pg_isready` mente uma vez.** A imagem oficial do PostgreSQL responde ao
   `pg_isready` durante o init e depois reinicia o servidor. Espere uma consulta real.
3. **Variáveis das fases.** Fases 2/3/4A e a prova rem21-010 não pulam quando falta o
   banco: falham fechado com mensagem explícita. Isso é intencional (AUD20 skip
   governance).
4. **`boundary:products`.** O checker percorre `node_modules` e termina `INCOMPLETE`
   (0 violações, milhares de `UNVERIFIED_INSTALLED_DEPENDENCY`) após ~20 min. Está em
   qualificação no HISO-005; não o encadeie com outros gates e não o trate como prova
   de fronteira aceita.
5. **Gates concorrentes no mesmo worktree.** `certify` reescreve
   `certification/*-report.json`; um `skip:governance` disparado ao mesmo tempo falha
   com `skip_report_missing_input`. Rode um de cada vez por worktree.
6. **Arquivos auxiliares.** Qualquer script ou config temporário dentro do worktree
   entra no `format:check`. Guarde auxiliares fora da árvore.

## Fluxo de publicação com o `main` protegido

Desde 07/10/2026 o `main` exige os checks `REM21 CI bar (Node 22)`, `codeql`,
`secret-scan` e `supply-chain` verdes **no SHA enviado**, sem force-push, sem exclusão
e com histórico linear; administradores não estão isentos. Um push direto de um commit
sem checks é recusado. Fluxo:

```sh
git push origin HEAD:refs/heads/candidate/<task>    # dispara Verify e Security
gh run watch                                        # espere os quatro checks verdes
git push origin HEAD:main                           # mesmo SHA, fast-forward
git push origin --delete candidate/<task>
```

Push continua exigindo autorização do usuário, conforme
[coordenação](agent_coordination.md).
