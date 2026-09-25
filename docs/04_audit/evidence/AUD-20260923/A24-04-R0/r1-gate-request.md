# Pedido de gate corretivo BUILD — M07-S1-R1 — 23/09/2026

## Decisão solicitada

Aprovar ou pedir correções para **o adendo SPEC-M07-R1-v2 e o BUILD corretivo local** descritos neste pedido. Uma aprovação vale somente para A24-01, A24-03, A24-02, A24-05 e a nova A24-12, paths/comandos abaixo. Não autoriza outros manifests, M07-S2/S3/S4, CI, M05, serviços, banco real, rede externa, dados reais, ação sensível ou produção.

A resposta recente “Aprovo exatamente este gate” corresponde ao pedido antigo de M07-S1, já executado e registrado em [human-decision](../M07-BUILD-S1/human-decision-20260923.md). Ela não aprova este novo gate R1.

## Base e candidato

- SPEC base: [0128](../../../../02_spec/0128_m07_package_dependency_governance.md), SHA-256 `f2ea6eee7925188cfb5da5ed9170e9f90c96d050f37373f534326bff434d0f48`; adendo prospectivo: [SPEC-M07-R1-v2 proposto](spec-r1-amendment.md).
- Barra histórica preservada: [M07-S1-BUILD-v1](../M07-BUILD-S1/quality-bar.json), SHA-256 `65563f3478e305afecc3d98dca16c139c04b680171d877ff7cf82240613ed74d`. R1 cria critério complementar candidate-bound; não modifica arquivo nem resultado histórico.
- Ancestral: HEAD `05d1f33322a5b75e65ee3b6f0fa1a737c300d7bb`; baseline pré-M07 [manifest](../M07-SPEC/candidate-baseline.json), fingerprint `439e13cba5d32821fd57b5ba2c71160189667a8168bdb97c9eeb1df52211f404`, artefato SHA-256 `40b33ca1f63a2c263abcd621cb25d6c6fdf6aae0d0ab05be36b108717357675a`. A reauditoria 0569 verificou os 976/976 hashes do candidato histórico `a00127…a797`, mas mostrou que o digest publicado não se recalcula do JSON persistido. Use-o como histórico de inputs, nunca como fingerprint R1.
- O registro anterior 0569 observou os 976/976 inputs do candidato S1 históricos ainda correspondentes. Nesta retomada, a inspeção de paths confirmou os três additions antigos presentes, o novo teste unitário ausente e o diretório R1 ausente; os hashes atuais serão revalidados pelo preflight exato abaixo após a aprovação e antes de qualquer edição. Ele verifica o SHA-256 integral dos manifestos de baseline (`40b33ca1f63a2c263abcd621cb25d6c6fdf6aae0d0ab05be36b108717357675a`) e do candidato histórico (`6d2cc502d531115769884a3a693866d8d7d569c728b9f2cee68f44a76cdce305`), compara tamanho/SHA-256 dos 973 inputs, verifica os três paths antigos contra o manifesto S1 e exige que o novo teste e o diretório de saída ainda não existam. Qualquer divergência interrompe o gate antes de código; preservar o resultado e pedir novo gate para qualquer tentativa posterior, sem sobrescrever evidência.
- Os quatro paths autorizados para o delta são exatamente `config/workspace-dependency-policy.json`, `scripts/workspace-dependency-audit.mjs`, `tests/workspace-dependency-audit.test.js` e o novo `packages/conversation/src/__tests__/postgres-store.unit.test.ts`. O baseline antigo lista somente os três primeiros; não reutilizar essa lista como allowlist completa de R1.
- Depois da implementação, o primeiro comando de verificação deve congelar um manifesto R1 novo e canônico em `docs/04_audit/evidence/AUD-20260923/M07-S1-R1/execution-candidate-manifest.json`. O modo `--candidate-only` deve comparar novamente os 973 hashes de baseline, aceitar exatamente os quatro paths aprovados como delta, esperar 977 inputs totais e falhar sem gravar o manifesto se houver input adicional, ausente ou divergente. O manifesto deve incluir 25 owners, hashes ordenados, Node, TypeScript e versão npm lida de `npm-version.txt`, vinculando também o hash desse arquivo. O `fingerprint_basis` deve persistir em campo próprio a lista exata dos quatro paths autorizados para o delta. Seu fingerprint é calculado e verificado diretamente a partir do `fingerprint_basis` nele serializado. Nenhum fingerprint R1 é presumido neste pedido.
- O worktree contém alterações preexistentes; não limpar nem redefinir. O freeze R1 compara os inputs selecionados do baseline e os quatro paths permitidos, preservando todo o restante.

## Tasks e paths exatos

| Task | Paths de código/configuração permitidos | Entrega |
| --- | --- | --- |
| A24-01 | `config/workspace-dependency-policy.json`; `scripts/workspace-dependency-audit.mjs`; `tests/workspace-dependency-audit.test.js` | Acrescentar o path de teste aprovado ao binding; gerar e verificar manifesto reproduzível; provar detecção de input stale. |
| A24-12 | `scripts/workspace-dependency-audit.mjs`; `tests/workspace-dependency-audit.test.js` | Reconciliar a dependência de produção `PRODUCTION_TYPE_ONLY / DECLARED_RUNTIME_SAFE` com arestas TEST do mesmo owner-target, mantendo roles distintos e preservando mismatch em relação test-only isolada. |
| A24-03 | `packages/conversation/src/__tests__/postgres-store.unit.test.ts` (novo) | Cobrir comportamento de `packages/conversation/src/postgres-store.ts` com `ConversationSqlPool` sintético; sem alterar a fonte do adapter, `vitest.config.mts`, manifests ou configuração de coverage. A configuração lida inclui `packages/**/*.test.ts` na suíte e `packages/**/*.ts` na coleta de coverage, excluindo `*.test.ts`; portanto o teste é descoberto e a fonte do adapter é medida. |
| A24-02/A24-05 | Somente o novo diretório `docs/04_audit/evidence/AUD-20260923/M07-S1-R1/` para outputs e registros | Reexecutar, auditar e registrar o mesmo candidate R1. |

Não alterar `package.json`, lockfiles, manifests de workspace, `vitest.config.mts`, fontes de produto fora do scanner, testes preexistentes fora dos três paths indicados, CI, `.nvmrc`, barra v1 ou evidências históricas. Os outputs vão para o novo diretório R1. O comando de coverage deve direcionar `reportsDirectory` a R1 e preservar o `coverage/` ignorado que já existia antes do gate.

## Comandos autorizados e ordem

Executar cada linha separadamente, a partir da raiz do repositório e sob Node `v22.23.2`; registrar versões, duração, exit code, skips e stdout/stderr sanitizados. Para testes/typecheck/lint/coverage, remover variáveis de conexão PostgreSQL. Registrar cada exit não-zero e seguir para os próximos checks locais já autorizados quando não houver condição de segurança; executar o post-check final mesmo se um gate de qualidade falhar, desde que o ambiente continue local. Se qualquer etapa tentar acessar serviço, DB, rede externa ou credencial, parar essa etapa, registrar `NOT_RUN`/bloqueada e não contornar. O diretório de evidência é de tentativa única: se já existir, parar; não sobrescrever saída parcial nem histórica.

1. Pré-flight do runtime (cada linha é um comando separado):

   ```sh
   node --version
   ```

   Só continuar se `node --version` for exatamente `v22.23.2`; caso contrário, parar sem instalar/trocar runtime ou executar comandos seguintes.

   ```sh
   node -p "require('typescript').version"
   ```

   Registrar a versão TypeScript impressa; se o módulo local não resolver, parar sem instalar dependências.

2. Preflight read-only do baseline antes de qualquer alteração (comando único; só Node built-ins, sem pacote do workspace, shell filho, rede ou escrita):

   ```sh
   node --input-type=commonjs - <<'NODE'
   const fs = require("node:fs");
   const crypto = require("node:crypto");
   const sha256 = (path) => crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
   const baselinePath = "docs/04_audit/evidence/AUD-20260923/M07-SPEC/candidate-baseline.json";
   const priorPath = "docs/04_audit/evidence/AUD-20260923/M07-BUILD-S1/execution-candidate-manifest.json";
   const baselineFileSha256 = sha256(baselinePath);
   const priorFileSha256 = sha256(priorPath);
   const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
   const prior = JSON.parse(fs.readFileSync(priorPath, "utf8"));
   const baseInputs = baseline.candidate_input_manifest;
   const baselineMismatches = baseInputs.filter((entry) => {
     try { return fs.statSync(entry.path).size !== entry.size_bytes || sha256(entry.path) !== entry.sha256; }
     catch { return true; }
   }).map((entry) => entry.path);
   const expectedLegacy = ["config/workspace-dependency-policy.json", "scripts/workspace-dependency-audit.mjs", "tests/workspace-dependency-audit.test.js"].sort();
   const priorAdditions = prior.approved_additions;
   const priorPaths = priorAdditions.map((entry) => entry.path).sort();
   const priorMismatches = priorAdditions.filter((entry) => {
     try { return !fs.existsSync(entry.path) || sha256(entry.path) !== entry.sha256; }
     catch { return true; }
   }).map((entry) => entry.path);
   const newTest = "packages/conversation/src/__tests__/postgres-store.unit.test.ts";
   const outputDir = "docs/04_audit/evidence/AUD-20260923/M07-S1-R1";
   const result = {
     baseline_manifest_match: baselineFileSha256 === "40b33ca1f63a2c263abcd621cb25d6c6fdf6aae0d0ab05be36b108717357675a",
     baseline_manifest_sha256: baselineFileSha256,
     prior_candidate_manifest_match: priorFileSha256 === "6d2cc502d531115769884a3a693866d8d7d569c728b9f2cee68f44a76cdce305",
     prior_candidate_manifest_sha256: priorFileSha256,
     baseline_count: baseInputs.length,
     baseline_mismatches: baselineMismatches,
     historical_additions: priorPaths,
     historical_additions_match: JSON.stringify(priorPaths) === JSON.stringify(expectedLegacy) && priorAdditions.length === 3 && priorAdditions.every((entry) => entry.present === true) && priorMismatches.length === 0,
     historical_addition_mismatches: priorMismatches,
     new_test_absent: !fs.existsSync(newTest),
     r1_output_directory_absent: !fs.existsSync(outputDir)
   };
   console.log(JSON.stringify(result));
   if (!result.baseline_manifest_match || !result.prior_candidate_manifest_match || baseInputs.length !== 973 || baselineMismatches.length || !result.historical_additions_match || !result.new_test_absent || !result.r1_output_directory_absent) process.exitCode = 1;
   NODE
   ```

   O comando deve encerrar `0` e exibir zero divergências; caso contrário, parar sem editar código ou tentar reparar o baseline.

3. Criar o diretório vazio de evidência, registrar npm e preservar rollback local:

   ```sh
   mkdir docs/04_audit/evidence/AUD-20260923/M07-S1-R1
   npm --version > docs/04_audit/evidence/AUD-20260923/M07-S1-R1/npm-version.txt
   mkdir docs/04_audit/evidence/AUD-20260923/M07-S1-R1/rollback-baseline
   cp config/workspace-dependency-policy.json docs/04_audit/evidence/AUD-20260923/M07-S1-R1/rollback-baseline/workspace-dependency-policy.json
   cp scripts/workspace-dependency-audit.mjs docs/04_audit/evidence/AUD-20260923/M07-S1-R1/rollback-baseline/workspace-dependency-audit.mjs
   cp tests/workspace-dependency-audit.test.js docs/04_audit/evidence/AUD-20260923/M07-S1-R1/rollback-baseline/workspace-dependency-audit.test.js
   sha256sum docs/04_audit/evidence/AUD-20260923/M07-S1-R1/rollback-baseline/workspace-dependency-policy.json docs/04_audit/evidence/AUD-20260923/M07-S1-R1/rollback-baseline/workspace-dependency-audit.mjs docs/04_audit/evidence/AUD-20260923/M07-S1-R1/rollback-baseline/workspace-dependency-audit.test.js > docs/04_audit/evidence/AUD-20260923/M07-S1-R1/rollback-baseline.sha256
   ```

   Cada linha é um comando separado. `mkdir` falhará se o destino já existir. `npm-version.txt` deve conter uma única versão obtida localmente; o CLI R1 a lê sem subprocesso. Os três backups preservam os bytes dos additions anteriores. Se qualquer comando falhar, parar e preservar o que foi escrito; não repetir sobre a mesma pasta.

4. Congelar candidato (novo CLI e opção autorizados por esta gate):

   ```sh
   node scripts/workspace-dependency-audit.mjs --candidate-only --npm-version-file docs/04_audit/evidence/AUD-20260923/M07-S1-R1/npm-version.txt --format json --output docs/04_audit/evidence/AUD-20260923/M07-S1-R1/execution-candidate-manifest.json
   ```

5. Verificar o JSON persistido, basis, toolchain e hashes (novo CLI/opção autorizados por esta gate):

   ```sh
   node scripts/workspace-dependency-audit.mjs --verify-candidate docs/04_audit/evidence/AUD-20260923/M07-S1-R1/execution-candidate-manifest.json --npm-version-file docs/04_audit/evidence/AUD-20260923/M07-S1-R1/npm-version.txt
   ```

6. Inventário completo do mesmo worktree:

   ```sh
   node scripts/workspace-dependency-audit.mjs --policy config/workspace-dependency-policy.json --profile inventory --format json --output docs/04_audit/evidence/AUD-20260923/M07-S1-R1/workspace-dependency-report.json
   ```

   O relatório deverá repetir o fingerprint do manifesto. Com as 11 reconciliações aprovadas e implementadas, o resultado de domínio esperado é `VIOLATION` com as nove categorias realmente test-only e os dois vínculos ausentes ainda visíveis; `exitCode=1` é registrado como achado de domínio completo de B3, não como aprovação limpa. `exitCode=2`, `64`, gap/unresolved ou relatório ausente reprovam B3.

7. Conferir por leitura local que relatório e manifesto apontam ao mesmo fingerprint:

   ```sh
   node -e 'const fs=require("node:fs");const m=JSON.parse(fs.readFileSync("docs/04_audit/evidence/AUD-20260923/M07-S1-R1/execution-candidate-manifest.json","utf8"));const r=JSON.parse(fs.readFileSync("docs/04_audit/evidence/AUD-20260923/M07-S1-R1/workspace-dependency-report.json","utf8"));const expected=m.candidate_fingerprint_sha256;const actual=r.candidate?.fingerprint;console.log(JSON.stringify({expected,actual,match:expected===actual}));if(expected!==actual)process.exitCode=1;'
   ```

   O comando deve encerrar `0` com `match=true`; não corrigir ou reescrever relatório/manifesto para fazê-lo coincidir.

8. Testes focais da política, direção e adapter sintético:

   ```sh
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm test -- tests/workspace-dependency-audit.test.js tests/architecture/dependency-direction.test.ts packages/conversation/src/__tests__/postgres-store.unit.test.ts
   ```

9. Gates locais obrigatórios, no mesmo candidate:

   ```sh
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm test
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm run typecheck
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm run lint
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm run test:coverage -- --coverage.reportsDirectory docs/04_audit/evidence/AUD-20260923/M07-S1-R1/coverage
   ```

10. Revalidar candidate e toolchain depois de todos os checks:

   ```sh
   node scripts/workspace-dependency-audit.mjs --verify-candidate docs/04_audit/evidence/AUD-20260923/M07-S1-R1/execution-candidate-manifest.json --npm-version-file docs/04_audit/evidence/AUD-20260923/M07-S1-R1/npm-version.txt
   ```

   Exit diferente de `0` ou qualquer input/toolchain drift reprova B7 e interrompe a auditoria; preservar todos os outputs.

Não executar install, npx, build, builds de package, `test:postgres`, E2E, processo com DB, serviço, integração externa ou comando fora desta lista nesta fatia. Testes de PostgreSQL opcionais devem ficar sem conexão e seus skips serão registrados.

## Aceite, reviewer e rollback

- B1: preflight confirma baseline intacto e additions históricas corretas; delta de candidate contém apenas os quatro paths aprovados (977 inputs totais), além dos outputs documentais; worktree preexistente preservado.
- B2/B4: política/defaults anteriores preservados; basis registra exatamente os quatro paths autorizados; Node/TypeScript/npm são candidate-bound e verificáveis; fingerprint idêntico ao JSON salvo; stale input/basis/toolchain é rejeitado; roles por edge seguem distintos; reconciliação cobre positivo type-only compartilhado e negativos sem edge de produção.
- B3: inventário candidato cobre todos os owners/fontes ou expõe gap que bloqueia aceitação; nenhuma violação/unresolved é escondida; `inventory` exit 1 completo = `PASS_WITH_FINDINGS`, não `PASS` de conformance.
- B5: scanner continua local/read-only sem executar packages, shell, subprocesso, serviço, banco, rede ou instalar; teste de A24-03 usa somente doubles sintéticos.
- B6: teste focal, suite, typecheck e lint passam; coverage atinge thresholds imutáveis statements 90%, branches 85%, functions 90%, lines 90%, sem exclusão/skip oportunista.
- B7: candidate/report/commands no mesmo fingerprint; comparação explícita report/manifest passa; revalidação post-check passa e nenhum input/toolchain muda durante os checks.
- B8: Lead review contra bar R1 e crítico independente I1 fresh-context sobre o candidate e os raw records. Se I1 estiver indisponível, registrar `UNAVAILABLE`, não chamar lead de I1 e manter S1 `OPEN / CONDITIONAL_PASS` no máximo.
- B9: limites de escopo e rollback respeitados. Se rollback for necessário após registrar falha e verificar zero drift pós-check, restaurar os três additions antigos exclusivamente dos backups R1 e remover o teste novo somente se ele corresponder ao hash candidate R1 e era ausente no preflight. Comandos autorizados de rollback:

  ```sh
  sha256sum -c docs/04_audit/evidence/AUD-20260923/M07-S1-R1/rollback-baseline.sha256
  cp docs/04_audit/evidence/AUD-20260923/M07-S1-R1/rollback-baseline/workspace-dependency-policy.json config/workspace-dependency-policy.json
  cp docs/04_audit/evidence/AUD-20260923/M07-S1-R1/rollback-baseline/workspace-dependency-audit.mjs scripts/workspace-dependency-audit.mjs
  cp docs/04_audit/evidence/AUD-20260923/M07-S1-R1/rollback-baseline/workspace-dependency-audit.test.js tests/workspace-dependency-audit.test.js
  cmp docs/04_audit/evidence/AUD-20260923/M07-S1-R1/rollback-baseline/workspace-dependency-policy.json config/workspace-dependency-policy.json
  cmp docs/04_audit/evidence/AUD-20260923/M07-S1-R1/rollback-baseline/workspace-dependency-audit.mjs scripts/workspace-dependency-audit.mjs
  cmp docs/04_audit/evidence/AUD-20260923/M07-S1-R1/rollback-baseline/workspace-dependency-audit.test.js tests/workspace-dependency-audit.test.js
  rm packages/conversation/src/__tests__/postgres-store.unit.test.ts
  test ! -e packages/conversation/src/__tests__/postgres-store.unit.test.ts
  ```

  Executar o step 10 imediatamente antes do rollback e só continuar se ele confirmar zero drift; `sha256sum -c` deve confirmar os backups. Se algum hash não corresponder ou houver drift, não executar rollback automático; manter worktree e evidências intactos e solicitar adjudicação. Preservar todos os outputs R1, inclusive falhas/parciais. Não usar `git checkout`, `git reset`, `git clean` ou restauração ampla. Nova tentativa exige pedido/gate próprio. Histórico M07-S1 não é removido nem editado.
- R1 não altera manifests. As nove divergências independentes e dois imports sem declaração seguem para A24-06/A24-07, M07-S4 em gates próprios. Nenhum S2/S3, CI, M05 handoff, G21-5/G21-6 ou produção é liberado.

## Estado

Revisão do gate R1 nesta retomada: somente I0/Lead; a tentativa de iniciar um crítico I1 fresh-context foi recusada pelo serviço por limite de threads. Não há aprovação independente deste pacote, e I1 sobre o candidato R1 continuará obrigatório após eventual BUILD.

`PENDING_HUMAN_APPROVAL_A24_R1_SPEC_AND_BUILD`. A resposta necessária é aprovar exatamente o adendo SPEC-M07-R1-v2 e este escopo/comandos/rollback/aceite, ou pedir correções. Nesta preparação houve apenas leitura local de JSON/source e inspeção de presença dos paths; nenhum código de produto, scanner, teste, build, typecheck, lint, serviço, DB, rede ou integração foi executado.
