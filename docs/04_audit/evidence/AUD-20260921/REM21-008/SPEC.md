# REM21-008 — SPEC — contrato e execução da barra CI

## Identidade do runtime

- `.nvmrc` contém `22.23.2`;
- `package.json.engines.node` permanece `>=22 <23`;
- Actions usa `actions/setup-node` com `node-version-file: .nvmrc`;
- a imagem usa a mesma linha/versão major Node 22 e o self-test rejeita
  qualquer workflow que aceite explicitamente Node 20 ou 24;
- o manifesto do run registra `node --version` e `npm --version`.

## Catálogo obrigatório

O catálogo local `scripts/ci-bar-contract.mjs` é a fonte única de nomes,
comando, artefatos esperados e política de skip para a verificação estática do
workflow e para o executor `scripts/ci-bar.mjs`. Cada entrada tem `id`,
marcador, comando e, quando aplicável, artefatos/`skipPolicy`. O catálogo
implementado contém:

```text
runtime, install, readiness, format, typecheck, lint, build, unit, coverage,
coverage-critical, mutation, skip, worker-startup, postgres, phase2, phase3,
phase4a, phase4a-identity, chaos, evals, load, restore, docs, e2e, image,
sbom, licenses, security, certify, certification-verify, diff, artifacts
```

O workflow pode agrupar comandos em poucos jobs para reduzir tempo, mas cada
ID permanece visível e bloqueante. `verify` não substitui os IDs individuais.
O gate PostgreSQL exige relatório JSON fresco e zero teste skipped/todo; a
ausência do serviço, do relatório ou do catálogo faz o runner falhar. Os gates
de certificação continuam honestos: `certify` pode resultar `NO_GO` por
autoridade externa ausente, mas falha se qualquer gate local obrigatório não
passar; esse resultado não é convertido em `GO`.

## Identidade de run e artefatos

No CI, `CI_RUN_ID=run-${{ github.run_id }}-${{ github.run_attempt }}` e
`CI_ARTIFACT_DIR=$RUNNER_TEMP/cvg-ci/${CI_RUN_ID}`. O bootstrap calcula o
`candidateId` com a mesma regra do certificador e o exporta pelo estado do run;
`phase10-certify` consome o mesmo `CI_RUN_ID`/`CI_CANDIDATE_ID`. Localmente, os
valores podem ser sintéticos, mas devem ser não vazios. Um manifesto JSON
registra por gate: `id`, comando, Node, started/finished, exit code, status,
runId, candidateId, hashes e caminhos de log. Relatórios esperados devem ser
frescos e não vazios; upload é obrigatório e falha quando o diretório esperado
está vazio. Npm cache é separado e não é incluído no manifesto/candidate.

## Topologia controlada

1. checkout sem credenciais persistentes;
2. setup Node pelo `.nvmrc` e `npm ci --ignore-scripts`;
3. quality: format, typecheck, lint, build, unit, coverage, critical,
   mutation, skip, security, docs e diff;
4. PostgreSQL descartável: migration/persistence, chaos/evals que exigirem
   banco e catálogo zero-skip;
5. load/restore e worker smoke;
6. E2E Chromium declarado;
7. build/smoke da imagem non-root com tag por run, sem push, e SBOM/licenses;
8. certificação e verificação offline, com artefatos sempre anexados.

Cada bloco tem timeout próprio, `if: always()` somente para coleta/upload e
nenhum `continue-on-error` nos gates. O workflow continua sem secrets de
produção. Load/restore são explicitamente smoke tests in-memory e não medem
RPO/RTO ou capacidade produtiva.

## Self-tests negativos

O contrato deve provar quatro rejeições independentes: catálogo incompleto,
runtime fora da linha 22, workflow sem upload `if-no-files-found: error` e
workflow que contém apenas o agregador `npm run verify` sem os IDs explícitos.
O teste só aceita o workflow real quando todas as regras passam.

## Rollback e limitações

Rollback é reversão do workflow/runner e não requer banco de negócio. A
migration, ampliação de skip governance, mutation por risco, matriz de
browsers e mudanças de produto não fazem parte desta task. Evidências de
`docs/04_audit/evidence/` são artefatos históricos e ficam fora do
`format:check` para não serem reescritas por uma rodada posterior. O CI local
não prova a disponibilidade real de GitHub Actions, Docker Hub ou approval
humano; qualquer falha/ausência permanece evidência local parcial.

## Gate

`SPEC_APPROVED_CONTROLLED_BUILD / BUILD_AUTHORIZED_LOCAL`.
