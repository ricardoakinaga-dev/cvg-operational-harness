# Delta de ledgers — C100-FND-ROOT-INTEGRATION-20261018 (CONT-20261018-D9EF)

Texto proposto pelo executor para o Lead integrar. Este arquivo não editou
99/20/30, coordenação, 0380 ou 0383. Evidência: [claim](claim.json),
[resoluções do merge](merge-resolutions.json), [correções](fixes/),
[gates](gates/), [revisões R1](review-r1/verdict.json) e
[R2](review-r2/verdict.json), [liberação de recursos](resource-release.json).

## docs/99_runtime_state.md (bloco C100-FND-ROOT-INTEGRATION-20261018)

- `status`: IN_PROGRESS — candidata local pronta para fast-forward da raiz em
  `c8ff057f`, aguardando a correção de portabilidade dos testes b6 (Lead)
  para rodar npm test completo, certify e a revisão final. Nada promovido.
- `last_completed_action`: worktree `/mnt/ia/cvg-c100-integration-20261018`,
  branch `integrate/c100-foundation-20261018`, HEAD `951c22ad`. Cherry-pick de
  `ae5538cf`; merge da linha Claude100 `a72422be..219061a3` com 32 conflitos
  resolvidos sobre base efetiva `38f3e18d` (R4), mais a correção de um
  auto-merge que duplicava um bloco em `iterative-runtime.ts`; seis correções
  (15 de `complete-process-support`, tipos de dist SPEC0225, corpus de pins
  históricos SPEC0215/0216, pin Python de `contracts.ts`, reclassificação da
  prova bound-fence, exclusão de provas de integração do denominador de
  cobertura) e merges da raiz `4fdf938f` e `c8ff057f`. Na `951c22ad`:
  format, typecheck sem dist, lint, build:harness sem dist, build:runtime,
  test:postgres 302/302, Python 47/47 e E2E 12/12 verdes. Na `f18b6ba6`:
  npm test 6443 PASS/0 FAIL/70 pendentes herdados/0 suítes falhas. PG próprio
  removido.
- `next_action`: ao receber o SHA da correção de portabilidade, merge na
  candidata, npm test completo, cobertura/certify e revisão independente
  focada em `fb5e72d1` e nos merges; depois fast-forward da raiz pelo Lead.

## docs/20_master_execution_log.md (entrada 18/10/2026)

C100-FND-ROOT-INTEGRATION-20261018, executor da CONT-20261018-D9EF. Candidata
nova em `/mnt/ia/cvg-c100-integration-20261018` a partir de `6cb965ff`, com
`node_modules` copiado do root, sem install. Cherry-pick de `ae5538cf`
(`e2f5479c`). O merge `--no-ff` de `219061a3` (`12cd269c`) teve 32
conflitos: 10 evidências PARE100 add/add com bytes diferentes (o root ficou no
caminho original, e a cópia da worktree em `*.from-pare100-worktree-a72422be.json`),
14 código/teste add/add, 1 conteúdo de código, 6 docs/ledgers e o catálogo de
vazios (união de 835 registros). Como `38f3e18d` (root) e `a72422be` são dois
snapshots do mesmo PARE100, e a raiz trazia a integração R4 (113 arquivos,
todos iguais à R4), os 40 paths alterados pelos dois lados foram refeitos com
base `38f3e18d`. Isso corrigiu um bloco duplicado de 52 linhas em
`packages/harness/src/iterative-runtime.ts`. Os ledgers resolveram iguais aos
do root, sem perda de linhas.

Correções:

- `a051c9d3`: cadeia virtual até o runtime PARE100 em `complete-process-support`;
  15→0 falhas, 83/83.
- `6b8a5eea`: imports de dist dos testes nativos SPEC0225 tipados a partir de
  src; o typecheck sem dist tinha 103 erros e passou a 0; JS idêntico após
  remoção de tipos.
- `410e0111`: corpus versionado `tests/fixtures/pare100-historical-pins`
  (29 blobs = pins selados) para as suítes SPEC0215/0216; 57→0 falhas, 93/93,
  sem dist.
- `ba9b70fe`: repin de `contracts.ts` no contrato Python (SPEC0218), 46/47→47/47.
- `598ce7d8`: `complete-checkpoint-bound-fence` passa a `.integration.ts`,
  bytes idênticos.
- `fb5e72d1`: `**/*.integration.ts` e 2 fixtures fora do denominador de
  cobertura (2455 statements a 0%).

Merges da raiz: `f18b6ba6` (`4fdf938f`) e `951c22ad` (`c8ff057f`), sem conflito.

Revisão independente: R1 REVISE com R1-M1 (pin Python) e R1-M2 (raiz avançou);
R2 REVISE com R2-M1 (cobertura). Todos tratados; R2-M1 aguarda confirmação no
certify.

Incidentes:

- `/mnt/ia` cheio, ENOSPC transitório, reexecutado.
- Os testes b6 da raiz escrevem em `/mnt/ia/cvg-hiso005-*` e `/tmp` e leem uma
  candidata alheia; três execuções da suíte fizeram isso. O Lead decidiu
  corrigir a portabilidade na raiz (opção c).

Sem push, produção, dado real ou provider.

## docs/30_backlog_master.md

- C100-FND-ROOT-INTEGRATION-20261018: aberta até npm test completo, certify e
  revisão após a correção de portabilidade; depois fast-forward da raiz.
- Débitos novos ou vinculados:
  - (a) portabilidade dos testes b6 e de outros caminhos desta máquina
    (unidade do Lead);
  - (b) 70 testes pendentes herdados da linha PARE100, por recurso/env:
    PARE217 store 39, fenced-outbox 14, worker 5; SPEC0224 checkpoint 2,
    process-restart 2, public-restart 8. Não estão no `scripts/skip-catalog.json`
    e a governança de skips do certify deve recusá-los (`skip_unknown`).
    Decidir entre recurso atribuído próprio, catálogo com gate dedicado real
    ou outra classificação;
  - (c) as 11 provas `*.integration.ts` não têm gate no repositório (R2-O1);
  - (d) 8 testes `complete-{admission,checkpoint}-capacity-public` falharam
    sob cobertura v8: prazo interno estoura e o timeout de 60s é atingido;
    reavaliar no certify;
  - (e) 25 arquivos vazios de evidência sem registro no catálogo
    (HISO005-P2-BUILD-0240 e commits da raiz `e6ba0e46`/`4fdf938f`); higiene
    de evidência e `docs:check-links` falham;
  - (f) o texto SPEC0217 em `docs/architecture/PUBLIC_API.md` diz "sem promoção
    ao checkout principal", o que fica desatualizado após o fast-forward;
  - (g) a suíte Python do SDK não está ligada a npm test, certify nem CI;
  - (h) a migração 0031 do plano 0383 não faz parte desta linha (só 0029 e 0030).

## docs/08_runtime/agent_coordination.md (claim C100-FND-ROOT-INTEGRATION-20261018)

- Recursos: PG `cvg-c100-integration-pg`, ID `7d7e0aaf059b…`, 127.0.0.1:56250,
  label `cvg.task=C100-FND-ROOT-INTEGRATION-20261018`, LIBERADO; API 3436 e web
  4436 livres. `certify`, E2E, SBOM e licenças somente nesta candidata; o
  certify ainda não rodou.
- A worktree `/mnt/ia/cvg-c100-integration-20261018` (HEAD `951c22ad`, limpa) e
  o runtime `/mnt/ia/cvg-c100-integration-runtime-20261018` permanecem até o
  fast-forward.
- Os diretórios de fixture b6 em `/mnt/ia/cvg-hiso005-build0237-runtime-20261018/lead`
  e `/tmp/cvg-hiso005-*` deixados pelas execuções da suíte ficam para a limpeza
  do Lead.

## docs/03_build/0383 e 0380

0383: a fundação 0029/0030 do Claude100 está integrada na candidata, ainda não
na raiz. Nenhuma capacidade ou controle é creditado por esta integração.
0380: sem mudança de PAR.

## Promoção para a raiz (não executada)

A raiz em `c8ff057f` é ancestral de `951c22ad`. O fast-forward muda 2887 paths:
2830 A e 57 M. A lista completa está em
[root-would-change-c8ff057f..951c22ad.tsv](root-would-change-c8ff057f..951c22ad.tsv).
Código e config: `apps/worker` (21), `packages/persistence` (46),
`packages/harness` (22), `packages/platform` (8), `packages/contracts` (6),
`packages/orchestrator` (2), `packages/agent-core`, `packages/sdk/python`,
`scripts` (ci-bar, phase10-certify, run-core-coverage), `tests` (~65, com o
corpus de pins), `vitest.config.mts`, `package-lock.json` e
`packages/persistence/package.json` (2 devDependencies de workspace já
instaladas), migrações 0029/0030, `certification/{sbom.cyclonedx.json,license-report.json}`
vindos da linha PARE100 e `docs/architecture/PUBLIC_API.md`. O restante é
evidência PARE100/Claude100.
