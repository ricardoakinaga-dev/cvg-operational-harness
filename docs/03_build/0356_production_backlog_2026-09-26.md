# Backlog — programa PROD-20260926 — harness em produção controlada

- Status: PR-001 a PR-004, PR-006, PR-108, PR-109, PR-012, PR-L01 a
  PR-L03 e PR-L05 `COMPLETED` em 26/09/2026. PR-010/011 têm correção
  implementada localmente, mas continuam abertas até Verify e Security
  passarem no GitHub sobre o mesmo SHA. As demais ainda não iniciadas
  continuam `PROPOSED`.
- Plano executivo: [0354](0354_production_executive_plan_2026-09-26.md).
  Roadmap e gates de fase: [0355](0355_production_roadmap_2026-09-26.md).
  Baseline: [AUD-0577](../04_audit/0577_production_readiness_score_audit_2026-09-26.md).
- Itens herdados mantêm o ID de origem entre parênteses: RA26 em
  [0353](0353_score_backlog_2026-09-26.md) e RA25 em
  [0351](0351_audit0573_backlog.md). Ao concluir, atualizar os dois registros.
- Etapa CVG: `DOC` (documental), `DISC` (discovery), `PRD`, `SPEC+BUILD`
  (SPEC curta e gate de BUILD próprios), `OPS` (operação/infra com gate
  próprio), `HUMAN` (decisão humana registrada com hash).
- Prioridade: P0 bloqueia a fase seguinte; P1 bloqueia o `GO`; P2 é melhoria
  que pode seguir após o piloto se assim for decidido em F1.

## F0 — Base verificável e higiene

### PR-001 — Resolver o worktree sujo (RA26-01) · P0 · DOC

- Estado: `COMPLETED` em 26/09/2026. O commit `f9f84c9` absorveu
  `postgres.ts` e `postgres-audit.ts`. Gates sobre `001fc6f` (que contém
  `f9f84c9`) em Node 22 com PostgreSQL: `typecheck` e `lint` exit 0; suíte
  completa 323 arquivos / 2 294 testes PASS; `test:postgres` 35 / 258 PASS.

### PR-002 — Fixar a toolchain em Node 22 · P0 · SPEC+BUILD

- Estado: `COMPLETED` em 26/09/2026.
- Fato: `package.json` já declarava `engines.node` `>=22 <23`, mas nada
  impedia rodar `verify`/`certify` em outra versão.
- Entregue: `scripts/node-version-preflight.mjs` lê o `.nvmrc`; major
  diferente aborta (exit 1), patch diferente só avisa. `verify` e `certify`
  passam a começar pelo preflight. Teste em
  `tests/node-version-preflight.test.js` (6 casos). Verificado: Node 22.23.2
  exit 0; Node 24.20.0 exit 1 com mensagem.

### PR-003 — Certificado reproduzível (RA26-02) · P0 · SPEC+BUILD

- 28/09/2026, [negativo de HEAD](../04_audit/evidence/PR003-HEAD-DRIFT-20260928/reproduction.json) reproduziu P1 do verificador: commit vazio `60bbf22` sobre `7ef74e7`, zero diff de arquivos e mesmo candidato `47440863…`, mas `certification:verify` saiu 0 e qualificou o commit atual apesar de três campos registrados apontarem o pai. Crítica independente [I1 `ACCEPT_REPRO`](../04_audit/evidence/PR003-HEAD-DRIFT-20260928/I1-review.md). A [SPEC 0157](../02_spec/0157_certificate_live_head_binding.md) T3 aguarda revisão humana; nenhum BUILD de segurança iniciado, produção `NO_GO`.
- 28/09/2026, [SPEC-PR003-006](../02_spec/0157_certificate_live_head_binding.md) T3 pronta para revisão humana: o verificador corrente deve vincular resultado, manifesto, registro do candidato e Git HEAD, com negativos de drift e metadados forjados. Nenhum BUILD desta fatia foi iniciado; certificado isolado `7ef74e7` permanece válido só para seu próprio SHA e produção segue `NO_GO`.
- 28/09/2026, fatia T2 [SPEC-PR003-005](../02_spec/0156_worker_startup_smoke_node_env.md) concluída no branch isolado: `7ef74e7` define `NODE_ENV=test` apenas nos filhos controlados dos dois smokes; preflight do produto intacto. Primeiro certificado `ae0344f` teve 14/16 PASS por build sem origens HTTPS e fixture antiga. Segundo certificado de `7ef74e7` teve 16/16 PASS, 340/2.582, PG 35/261, E2E 12/12, zero skips; verificador 38/38 PASS e decisão local `AAA_CONTROLLED / CONDITIONAL_GO`. [Prova](../04_audit/evidence/PR003-COMPOSITE-20260928/proof.json). O root tem SHA diferente; CI/atestação, IAM/staging e decisão humana continuam pendentes. Estado `ISOLATED_CERTIFIED / ROOT_AND_EXTERNAL_PENDING / PRODUCTION_NO_GO`.
- 28/09/2026, fatia T2 [SPEC-PR003-004](../02_spec/0155_isolated_skip_catalog_rebind_004_006.md) concluída **somente** no worktree de composição: `ae0344f` reconciliou `SKIP-PG-004/006` após medir hashes e 8/7 casos condicionais. Guard PASS, 340/2.582, PG 35/261 e E2E 12/12; [prova](../04_audit/evidence/PR301-COMPOSITE-20260928/proof.json). O inventário versionado usa relatórios antigos: certificado do SHA atual pendente. O checkout root continua sob claim PR-L04; revalidar no SHA definitivo. Estado `ISOLATED_BUILD_PASS / CURRENT_SHA_CERTIFICATION_PENDING / ROOT_PENDING / NO_GO`.
- 27/09/2026, branch isolado OIDC+root `0b4a95b`: `SKIP-PG-004/014` reconciliados com os arquivos integrados; `skip:governance` PASS, suíte 331/2.437 e PG 35/258 sem skips. [Prova](../04_audit/evidence/PR301-ROOT-INTEGRATION-20260927/proof.json). O certificado do candidato principal não foi reemitido; PR-L04 e SHA integrado/CI remoto permanecem P0, `NO_GO`.
- 27/09/2026, diagnóstico isolado: `npm run certify` no commit limpo `c634fcd` (candidato `20256549…`, Node 22/PostgreSQL 16) executou os 16 comandos com exit 0; adjudicação 15 PASS/1 FAIL (`unit`) e `NO_GO`. Um teste Phase 4A foi pulado porque `PHASE4A_DISPOSABLE_PG=1` faltou no ambiente diagnóstico; repetição focada passou, e a suíte unitária completa com o ambiente correto passou 324 arquivos/2.374 testes, zero skips. O catálogo permanece com `SKIP-PG-014` ligado ao hash antigo `207335…` contra o arquivo atual `a27d2f…`, sob claim PR-L04. E2E em simulação 12/12 e PostgreSQL 35/258 PASS, mas não qualificam OIDC confiável. [Prova e bundle completo](../04_audit/evidence/PR003-INTERIM-20260927/proof.json), com 38/38 hashes de artefatos conferidos e I14 `ACCEPT_FACTS`. Reemitir certificação **após** liberação/correção do catálogo e integração do candidato; produção `NO_GO`.
- AUD-0579 / fatia `AUD-0579-SKIP-014` `SPEC_READY / BUILD_WAITING_FOR_PATH_CLAIM`: `skip:governance` falhou no HEAD `5c0b791` porque `SKIP-PG-014` ainda guarda o SHA-256 anterior do teste de homologação do worker. [SPEC-PR003-003](../02_spec/0143_skip_pg014_source_rebind.md) define recon, regra e pronto. `scripts/skip-catalog.json` está no claim ativo PR-L04; atualizar só após a liberação do caminho. O certificado também está desatualizado (`certification:verify` exit 1), portanto PR-003 permanece aberta para o candidato integrado.
- Estado corrente da nova fatia: `IN_PROGRESS` após a certificação AUD-0578, que teve 16 comandos exit 0 e adjudicação `NO_GO` por dois hashes obsoletos no catálogo de skips. [SPEC-PR003-002](../02_spec/0138_skip_catalog_rebind.md) limita a reconciliação a esses dois contratos e exige nova certificação e verificador.
- Estado: `COMPLETED` em 26/09/2026, com uma ressalva registrada.
- Causa da divergência da AUD-0577: ambiente, não regressão. Sem PostgreSQL
  e em Node 24 a suíte pulava 20 arquivos (146 testes).
- Certificado reemitido: `npm run certify` com
  `CI_RUN_ID=run-prod26-pr003-20260926`, Node 22.23.2 e PostgreSQL
  descartável → 16 gates PASS, `CONDITIONAL_GO / AAA_CONTROLLED`, candidato
  `94d7a211…`; `npm run certification:verify` exit 0 (37 hashes). Commit
  `6e1a072`.
- Ressalva: duas execuções limpas seguidas do mesmo candidato deram cobertura
  92,57/87,62/94,93/93,57 (manual) e 92,54/87,58/94,93/93,54 (certify), uma
  variação de até 0,04 pp. O critério "métricas iguais" não foi atingido
  literalmente; a investigação da variação entra na PR-007.

### PR-301-FENCING-CONSTRAINT-PREFLIGHT — catálogo do webhook · P1 · SPEC+BUILD

- 28/09/2026: [SPEC 0158](../02_spec/0158_webhook_fencing_constraint_preflight.md)
  T3 pronta para revisão humana; [prova sintética](../04_audit/evidence/PR301-FENCING-PREFLIGHT-SPEC-20260928/proof.json)
  em PostgreSQL 16 reproduziu que o preflight atual encontra uma constraint
  homônima em outra tabela e aceita `CHECK (true)` na tabela correta. O BUILD
  deve vincular OID, tipo, validação, definição e nulabilidade às migrations
  0002/0025, com negativos reais e boot fail-closed. Nenhum código de
  segurança foi alterado; root/PR-L04, cert do SHA final, CI/atestação e
  IAM/staging permanecem pendentes. Produção `NO_GO`.

### PR-004 — Tirar o estado Gauntlet do versionamento · P0 · HUMAN + DOC

- Estado: `COMPLETED` em 26/09/2026 (D-02, opção A).
- Entregue: 102 arquivos (102 664 474 bytes) saíram do índice com
  `git rm --cached`; continuam no disco e são ignorados por `.gitignore`
  (`.gauntlet/`, `.gauntlet-*/`). Os 102 SHA-256 conferiram com o
  [manifesto](../04_audit/evidence/AUD-20260926/gauntlet-state-manifest.json)
  antes da remoção. Os dois links de docs para arquivos arquivados viraram
  referência em código com ponteiro para o manifesto. O histórico git não foi
  reescrito; cópia em armazenamento externo não foi feita (os arquivos seguem
  só na máquina local).

### PR-005 — Rotacionar ledgers e reescrever o README (RA26-03/04/06) · P1 · DOC

- Estado: `COMPLETED` em 27/09/2026 sob D-12. Os ledgers vigentes têm
  13, 13 e 15 linhas; o README mantém uma seção de estado corrente.
- Histórico integral em [runtime](../08_runtime/archive/prod20260926_runtime_state_history.md),
  [log](../08_runtime/archive/prod20260926_execution_log_history.md) e
  [backlog](../08_runtime/archive/prod20260926_backlog_history.md). Fontes originais
  da revisão `4aac877`: SHA-256 `d8092246…`, `576ac3f7…` e `fedc1c99…`,
  respectivamente. Os links relativos foram rebaseados e a reversão do
  prefixo reproduz o hash de cada arquivo original.
- RA25 reconciliada no [backlog mestre](../30_backlog_master.md) com 0574/0575;
  o catálogo 0351 conserva o estado de sua data. Critério de pronto:
  `docs:check-links`, `format:check` e reconstrução hash dos três arquivos — todos PASS.

### PR-006 — Reconciliar arquivos vazios versionados · P2 · DOC

- Estado: `COMPLETED` em 26/09/2026 junto com a PR-004: os 11 vazios fora do
  catálogo eram `artifacts.jsonl` dos diretórios `.gauntlet*` e saíram do
  índice; os 231 restantes seguem catalogados em
  `docs/04_audit/evidence/empty-artifact-status.json`.

### PR-007 — Cobertura com denominador completo e lint type-aware (RA26-15) · P1 · SPEC+BUILD

- 28/09/2026, [medição no branch OIDC isolado](../04_audit/evidence/PR301-CORP-I1-20260928/critical-coverage.json): suíte com cobertura 340/2.578 sem skips e pisos globais PASS, mas `coverage:critical` `FAIL` no grupo RLS, 165/197 branches (83,76%) contra piso 95%. A fatia `ed012a4` não alterou `tenant-preflight.ts`. Abrir negativos de privilégio, policy e inventário com valor de segurança demonstrável, reexecutar o gate no candidato integrado e preservar o denominador; não baixar o piso para emitir PASS.
- 28/09/2026, subtask T2 [PR-301-RLS-NEGATIVE-COVERAGE](../02_spec/0154_rls_preflight_negative_coverage.md) concluída localmente em `42e69f4`: negativos reais de catálogo, policy, owner e privilégios elevaram RLS a 191/197 branches (96,95%) sem mudar denominador/guard; 340/2.581, PG 35/261 e E2E 12/12 PASS. [Prova](../04_audit/evidence/PR301-RLS-20260928/proof.json). Integrar no candidato após PR-L04 e reconciliar `SKIP-PG-004/006`; o BUILD amplo da PR-007, CI e certificação continuam abertos, produção `NO_GO`.
- Estado: `SPEC_READY / BUILD_WAITING_PR003_AND_PATH_CLAIM` em 27/09/2026.
  [SPEC-PR007-001](../02_spec/0148_coverage_denominator_and_typed_lint.md)
  fixa inventário sem exclusão silenciosa, dois relatórios, margem de 3 pp,
  investigação da variação e lint tipado em etapas. Nenhum BUILD foi
  iniciado: `vitest.config.mts` pertence ao claim PR-L04 e a baseline
  integrada da PR-003 ainda está pendente.
- O que/onde: `vitest.config.mts` exclui `apps/web/src/**` e `*postgres*.ts`
  (~23% do código); branches com margem de 0,88 pp; `eslint.config.js` só com
  `recommended`.
- Como: segundo relatório de cobertura para web e adaptadores PostgreSQL com
  thresholds próprios; ativar `recommendedTypeChecked` em etapas
  (`no-floating-promises`, `no-misused-promises` primeiro).
- Dependência: PR-003.
- Pronto: dois relatórios verdes; margem ≥ 3 pp em todas as métricas;
  `npm run lint` exit 0 com as regras novas.
- Achado de 26/09 (PR-003): duas execuções do mesmo candidato variaram até
  0,04 pp na cobertura. Identificar a fonte da não determinação (testes com
  tempo ou concorrência) antes de subir thresholds.

### PR-008 — Imagem web fixada e nome de imagem corrente · P2 · SPEC+BUILD

- Estado: `BUILD_VERIFIED_LOCAL / CERTIFICATION_PENDING` em 27/09/2026.
  [SPEC-PR008-001](../02_spec/0146_web_image_digest_and_name.md) fixa o
  índice OCI multiarch observado no registry. O Dockerfile foi corrigido;
  build web, smoke estático HTTP 200 com alias sintético, gate `image`
  runtime, Node 22, PostgreSQL e E2E passaram no candidato isolado
  `2a11435` ([prova](../04_audit/evidence/PR008-20260927/proof.json)).
  A configuração NGINX ainda exige o host `secretary-api` no arranque;
  PR-L10 detém a nomenclatura de deploy. Certificado/CI remoto no SHA
  integrado e produção permanecem pendentes.

### PR-009 — Coerência do E2E e JUnit (RA26-16) · P2 · SPEC+BUILD

- Fatia 3 `E2E_CI_BAR_VERIFIED_ISOLATED / I2_RECHECK_PENDING` em 27/09/2026:
  [SPEC-PR009-003](../02_spec/0145_e2e_junit_json_run_binding.md). Recon
  confirmou que o JSON e o XML atuais vêm de tentativas distintas, sem
  `runId`/`candidateId` internos; a nova evidência deverá incluir também um
  `executionId` único por invocação e validar inventário/totais. Código
  implementado; Node 22: `typecheck`, `lint`, `format:check`, self-test,
  `npm test` 299/2.177 e PostgreSQL 35/258 PASS. E2E real 12/12 PASS no
  commit `6bc3bfc` em worktree isolado, com [par JSON/JUnit e hashes](../04_audit/evidence/PR009-20260927/proof.json).
  A crítica I2 rejeitou o vínculo de `executionId` com o log e a validação
  dos snapshots; as três falhas foram corrigidas sob a mesma SPEC. Segunda
  rodada local: `npm test` 299/2.178, PostgreSQL 35/258, self-test C30–C32,
  typecheck, lint e formato PASS. A prova 12/12 anterior vale para `6bc3bfc`;
  E2E/ci-bar no commit `1413809` passou 12/12 com
  [log, snapshots, hashes e caso negativo da finalização](../04_audit/evidence/PR009-20260927-r2/proof.json).
  Naquele ponto ainda faltavam crítica adicional e certificado do SHA integrado após PR-L04.
- Rodada final local da fatia 3 `BUILD_VERIFIED_LOCAL / EXTERNAL_PROVENANCE_PENDING`:
  I3/I4 fecharam lacunas do mapa de hashes e do log na finalização;
  regressão de mistura entre gates de runs diferentes incluída. Candidato
  `2a11435`: E2E 12/12 e gate `image` PASS, [prova r3](../04_audit/evidence/PR009-20260927-r3/proof.json);
  Node 22 `npm test` 300/2.182 e PostgreSQL 35/258 PASS. I5 manteve
  `REJECT` para substituição coerente do diretório de artefatos mutável:
  falta âncora de proveniência externa ao workspace, sob revisão de
  segurança própria. Certificado e CI remoto do SHA integrado seguem
  pendentes; produção `NO_GO`.
- Fatia 1 `VERIFIED_LOCAL` em 26/09/2026: [SPEC-PR009-001](../02_spec/0137_e2e_artifact_isolation.md); quatro screenshots agora em `test-results/`, hashes históricos iguais, E2E 12/12. A task inteira continua aberta para JUnit/runId, jornadas de aprovação e estabilidade visual.
- Fatia 2 `VERIFIED_LOCAL` em 27/09/2026: [SPEC 0139](../02_spec/0139_visual_font_fallback.md); fonte Inter variável local, snapshots mobile/tablet inspecionados, visual 2/2 no Ubuntu isolado e E2E 12/12 no host. A prova remota do novo SHA ainda é necessária.
- Pronto: `playwright-results.xml` e o relatório E2E da certificação com o
  mesmo `runId`; specs para aprovações e jornada completa.
- Achado de 26/09: `tests/e2e/ux-accessibility.spec.ts` grava screenshots em
  `docs/04_audit/evidence/AUD-20260919/AUD19-013/` a cada execução,
  sobrescrevendo evidência histórica cujos hashes estão nos estados Gauntlet.
  Na rodada PR-003 os três PNGs foram restaurados. Pronto também exige que o
  E2E grave em `test-results/` e nunca em `docs/04_audit/evidence/`.
- Achado de 26/09 (SPEC-LEGACY-002): `tests/e2e/visual-shell.spec.ts` falhou
  uma vez na comparação de screenshot e passou nas duas repetições seguintes;
  tratar a instabilidade visual antes de usar o E2E como gate de release.

### PR-009-PROV — Âncora externa da prova do ci-bar · P0 para promoção · SPEC T3

- 27/09/2026, commit `cae1c2a` corrigiu `GH_TOKEN` ausente no passo independente de `gh attestation verify` sob SPEC 0147 aprovada. [Prova local](../04_audit/evidence/PR009-GH-TOKEN-20260927/proof.json): negativo sem token falha, 16 testes focados, suíte Node 22 305/2.229 PASS (20/162 skipped sem banco), PostgreSQL 35/258 e E2E 12/12 PASS, tipo/lint/actionlint/formato PASS. Run remoto do SHA integrado, bundle/digest OCI, proteção de `main` e certificação ainda `PENDENTE / NO_GO`.

- 27/09/2026, [auditoria remota](../04_audit/evidence/PR009-REMOTE-AUDIT-20260927/proof.json): Verify `36309111340` e Security `36309111343` passaram no SHA `8ee6fa2`, com manifesto de 37 gates PASS e 60 arquivos presentes. Esse run é anterior aos jobs da SPEC 0147, não contém bundle de atestação, tem SHA divergente do checkout atual e `main` continua sem branch protection/rulesets. É evidência histórica de CI, não selo do candidato integrado. `REMOTE_PROOF_PENDING / NO_GO`.

- Estado: `SPEC_APPROVED / BUILD_T3_IN_PROGRESS` em 27/09/2026, após
  aprovação explícita do usuário. Selo em output de passo e workflow de
  atestação implementados localmente; críticas I1–I3 corrigidas, I4
  `ACCEPT_LOCAL`; 24 testes focados, actionlint 1.7.12, tipo, lint e build
  PASS. [Prova local](../04_audit/evidence/PR009-PROV-20260927/proof.json)
  inclui suíte completa 301 arquivos/2.196 testes PASS, 20 arquivos/146
  skipped sem banco. O GitHub não mostra
  branch protection nem ruleset para `main`; exigir o check `Provenance
policy` ainda é mudança externa pendente. Imagem OCI publicável ainda
  não existe para atestação. Prova remota no SHA integrado pendente.
  Nenhum push, certificação ou release autorizado.
  [SPEC-PR009-PROV-001](../02_spec/0147_ci_bar_external_provenance.md)
  registra a ameaça de troca coerente de estado/log/relatórios após o gate,
  o limite dos hashes no mesmo diretório e a proposta de selo via output do
  runner com atestação do manifesto.
- Pronto: teste negativo troca todos os arquivos após selar e falha;
  Verify/Security no mesmo SHA, manifesto e imagem com proveniência
  verificável fora do job; política de retenção e revisão de segurança.

- 28/09/2026, [AUD-0585](../04_audit/0585_remote_ci_release_bar_2026-09-28.md): o PR remoto ainda aponta `8ee6fa2`, enquanto root local e candidato certificado têm SHAs diferentes. Quatro checks do PR passaram, mas o check CodeQL separado falhou; `main` não tem branch protection/ruleset e o `secret-scan` do seu SHA falhou. Prova de mesmo SHA/digest, check obrigatório e atestação externa continua `P0 / NO_GO`.

### PR-010 — Fazer o CI rodar no GitHub · P0 · SPEC+BUILD

- Atualização de 27/09/2026: o Verify do SHA `996233e` executou os jobs;
  documentação passou, mas E2E falhou no screenshot mobile por fallback de
  fonte (SPEC 0139). O novo candidato ainda exige Verify verde; o critério de
  aceite em `main` permanece pendente.
- Estado local anterior: `COMPLETED_LOCAL / WAITING_PUSH` (`3382286`). Causa: `runner.temp` no `env` do job (contexto indisponível ali), que fazia o GitHub rejeitar o arquivo inteiro. `CI_ARTIFACT_DIR` agora vem de `RUNNER_TEMP` num passo; `actionlint` 1.7.7 sem erros; `tests/ci-workflow-contract.test.js` rejeita a forma antiga. O push posterior permitiu que a barra rodasse no GitHub.

- Estado em 26/09/2026: `IN_PROGRESS`; implementação local no commit
  `3382286`; o último run remoto ainda é de `02f586b…` e falhou sem jobs.
  A [AUD-0578](../04_audit/0578_program_comprehensive_audit_2026-09-26.md)
  preserva o P0 até execução verde no SHA corrente.

- Fato (26/09/2026, `gh run list`): o `verify.yml` falha em 0 s com "This run
  likely failed because of a workflow file issue" desde pelo menos 17/09; a
  barra de 29 gates nunca rodou no remoto nesse período.
- Como: validar o workflow (por exemplo com `actionlint`), corrigir a causa e
  rodar a barra completa no GitHub.
- Pronto: `verify.yml` verde em `main` no GitHub.

### PR-011 — Triagem do Gitleaks · P0 · SPEC+BUILD

- Atualização de 27/09/2026: Security (secret-scan, supply-chain e CodeQL)
  passou no SHA `996233e` do PR #1. Repetir no mesmo SHA do Verify corrigido;
  o aceite final em `main` ainda está pendente.
- Estado local anterior: `COMPLETED_LOCAL / WAITING_PUSH` (`503ded7`). `.gitleaks.toml` mantém todas as regras padrão e só acrescenta allowlists à regra `generic-api-key` (SHA-256 em `docs/04_audit/evidence/` e arquivos de teste); caso negativo provado (chave com formato AWS em teste continua detectada); 6 achados isolados por fingerprint em `.gitleaksignore`; `GITLEAKS_VERSION: 8.28.0` no `security.yml`; varredura do histórico: sem vazamentos; contrato em `tests/security-scan-config.test.js`.

- Estado em 26/09/2026: `IN_PROGRESS`; implementação local no commit
  `503ded7`; teste local de configuração passa, mas o scan real ainda não
  rodou no remoto nesse SHA. A [AUD-0578](../04_audit/0578_program_comprehensive_audit_2026-09-26.md)
  preserva o P0 até execução verde e revisão das exclusões.

- Fato: o job `secret-scan` do `security.yml` falha (exit 1). Varredura local
  com a mesma ferramenta, `--redact`: 480 achados, todos da regra genérica
  `generic-api-key`, em arquivos de impressão digital de evidência (nome de
  arquivo seguido de SHA-256), `idempotencyKey`/`operationKey` de teste e
  segredos sintéticos de testes de redação. Nenhuma credencial real
  identificada.
- Como: `.gitleaks.toml` com allowlist estreita (caminhos de evidência com
  hash, fixtures de teste nomeadas e o padrão de hash hexadecimal), revisada
  item a item; manter o scan bloqueante.
- Pronto: `security.yml` verde; allowlist documentada.

### PR-011-CODEQL — Triagem de alerta alto no CI · P1 · SPEC T3 + BUILD

- 28/09/2026, [AUD-0586](../04_audit/0586_codeql_alert_triage_2026-09-28.md): 15 alertas high = sete cópias históricas + oito paths ativos. O auditor de alias aceitou config que `tsc` recusou com TS5062; duas expressões compartilhadas por cinco alertas mostraram custo sintético crescente; publish/rollback passam pelo limitador global (429 no 301º POST), mas falta orçamento autenticado/PostgreSQL por operação. Corrigir fontes ativas sob SPEC T3 e dar disposição formal aos históricos; check no SHA final ainda pendente.
- Estado: `OPEN / NO_GO` em 28/09/2026. [AUD-0585](../04_audit/0585_remote_ci_release_bar_2026-09-28.md) capturou check CodeQL reprovado no PR #1 por `js/incomplete-sanitization` em `scripts/workspace-dependency-audit.mjs:921`; o `main` remoto mostra 15 alertas high abertos, incluindo cópias históricas. Nenhum exploit foi demonstrado.
- O que/onde: revisar origem de `target` e `captured`, padrões de alias e contenção de path; classificar os alertas remotos entre código ativo, histórico e falso positivo com justificativa auditável. Criar SPEC T3 para qualquer correção de segurança antes do BUILD.
- Como: teste negativo com múltiplos `*` e caminho adversarial, correção restrita, CodeQL e testes de regressão no mesmo SHA, revisão da lista de alertas e dos checks externos. Não suprimir check para obter verde.
- Pronto: check CodeQL aprovado no SHA definitivo e zero alertas altos aplicáveis sem disposição formal; evidência de negativos, review T3 e certificado/CI de mesmo SHA.

### PR-012 — Testes de processo sobre código compilado antigo · P0 · SPEC+BUILD

- Estado: `COMPLETED` em 26/09/2026 na fatia 3 de SPEC-LEGACY-002.
- Fato: o worker real, rodado via `tsx`, resolvia `@cvg/*` pelo `dist/`
  local (de 22/09); num clone limpo não subia. Corrigido com o `tsconfig.json`
  raiz herdando os `paths` da base.
- Pendente: a certificação `94d7a211` usou o `dist` antigo nesses testes; ela
  será substituída na próxima reemissão.

## FL — Limpeza e isolamento do legado

O legado é a Esmeralda V2 (`cvg-agent-secretary-v2`), secretária de hospital
veterinário da qual o harness foi extraído. Decisões DL-01 a DL-04 já foram
tomadas pelo usuário em 26/09/2026 ([0357](0357_production_decision_packet_2026-09-26.md)).
Regra de todas as tasks FL: o legado pode depender do harness; o harness
nunca depende do legado. Cada fatia de código tem SPEC curta e só fecha com
`typecheck`, `lint`, `npm test`, `test:postgres` e E2E verdes em Node 22.

### PR-L01 — Inventário e classificação do legado · P0 · DOC

- Estado: `COMPLETED` em 26/09/2026 — [`legacy/LEGACY_INVENTORY.md`](../../legacy/LEGACY_INVENTORY.md).

- O que/onde: todos os arquivos de `apps/`, `packages/`, `scripts/`, `tests/`,
  `docs/`, configuração e raiz.
- Como: classificar cada item em `HARNESS`, `LEGACY_ISOLATE` (vital hoje,
  vai para `legacy/`), `LEGACY_DELETE` (não vital, apagar) ou `HISTORY`
  (histórico vinculado por hash, fica no lugar e é marcado). Ponto de partida
  medido em 26/09: termos `secretary|esmeralda|tutor|pet|patient|appointment|veterin`
  em 40 arquivos de produção (~19,5 mil linhas, incluindo `server.ts`).
- Pronto: `legacy/LEGACY_INVENTORY.md` com cada item, classe, motivo e task
  de destino; revisado pelo usuário.

### PR-L02 — Apagar pacotes sem consumidor (DL-02) · P0 · SPEC+BUILD

- Estado: `COMPLETED` em 26/09/2026 sob [SPEC-LEGACY-001](../02_spec/0135_legacy_dead_packages_and_boundary.md).

- O que/onde: `packages/workflows` (266 linhas), `packages/tools` (395) e
  `packages/memory` (13), sem nenhum importador em `apps/` ou `packages/`.
- Como: remover os diretórios e as referências em `tsconfig.json`,
  `tsconfig.base.json`, `apps/worker/tsconfig.json`, `vitest.config.mts`,
  `scripts/phase3-candidate-digest.mjs` e `package-lock.json` (as entradas
  `packages/<nome>` do lock também precisam sair).
- Pronto: `git grep` sem referências fora do histórico; `npm ci`,
  `typecheck`, `lint`, `npm test` e `sbom` verdes.

### PR-L03 — Estrutura de `legacy/` e regra de dependência · P0 · SPEC+BUILD

- Estado: `COMPLETED` em 26/09/2026 sob [SPEC-LEGACY-001](../02_spec/0135_legacy_dead_packages_and_boundary.md). A inclusão de `legacy/packages/*` nos workspaces ficou para a PR-L04 (depende de D-13).

- Como: workspace `legacy/packages/*` com pacotes `@cvg/legacy-*`;
  `legacy/README.md` explica origem, regra e prazo de remoção; teste de
  arquitetura (extensão de `tests/architecture/dependency-direction.test.ts`)
  falha se `packages/` importar `legacy/` e se `apps/` importar `legacy/` fora
  de um único ponto de composição declarado.
- Pronto: teste de arquitetura verde e com caso negativo provado.

### PR-L04 — Isolar o domínio de jornadas (tutor, pet, consulta) (DL-01) · P0 · SPEC+BUILD

- O que/onde: `packages/persistence/src/journeys.ts` (998 linhas) e
  `journeys-postgres.ts` (1 148), rotas de jornada em
  `apps/api/src/server.ts`, `apps/web/src/features/journeys`, entradas de
  jornada em `restore.ts` e `tenant-schema.ts`.
- Como: mover para `legacy/packages/secretary-journeys` como plugin Fastify e
  módulo web registrados pelo ponto de composição; a migration
  `0014_journeys.sql` fica na cadeia (histórico de schema) marcada como
  `LEGACY`; a remoção das tabelas só acontece em PR-L11 com migration
  expand/contract e backup.
- Pronto: nenhuma referência a jornadas fora de `legacy/` exceto a
  migration marcada; `test:postgres` e E2E verdes.

### PR-L05 — Isolar o perfil da secretária (DL-01) · P0 · SPEC+BUILD

- Estado: `COMPLETED` em 26/09/2026 sob [SPEC-LEGACY-002](../02_spec/0136_legacy_secretary_profile_isolation.md) (T3, aprovada pelo usuário). O vocabulário de agenda que resta nas guardas do `platform` segue para a PR-L07.

- O que/onde: `packages/platform/src/secretary-preset.ts`, grants da
  secretária em `packages/policy-engine/src/grants.ts` e `capabilities.ts`,
  resumo de handoff tutor/pet em
  `packages/agent-core/src/commands/create-handoff-summary.ts`, bootstrap da
  secretária na API (`apps/api/src/__tests__/secretary-bootstrap.test.ts`).
- Como: mover para `legacy/packages/secretary-profile`; o harness expõe só o
  mecanismo de perfil/preset e grants genéricos.
- Pronto: `platform`, `policy-engine` e `agent-core` sem vocabulário da
  secretária; testes verdes.

### PR-L06 — Isolar os datasets de evals da secretária (DL-01) · P1 · SPEC+BUILD

- Estado: `COMPLETED` em 27/09/2026 (`2533153`) sob [SPEC-LEGACY-003](../02_spec/0140_legacy_secretary_evals_isolation.md).

- O que/onde: `packages/agent-evals/src/datasets/core.ts` e cenários de
  evals do harness que usam tutor/pet/consulta.
- Como: mover os cenários para `legacy/`; criar dataset neutro para o gate
  `test:evals` cobrindo policy, approval, handoff, prompt injection e ação
  proibida.
- Pronto: `test:evals` verde só com o dataset neutro.

### PR-L07 — Fluxo de referência neutro · P0 · SPEC+BUILD

- O que: hoje o único fluxo ponta a ponta exercitado pelos testes, E2E e
  certificação é a jornada da secretária. Sem substituto, apagar o legado
  esvazia a certificação.
- Como: produto de referência sintético e neutro (ex.: "solicitação
  operacional" com coleta de dados, efeito externo em rascunho com approval,
  tarefa e handoff), escrito como consumidor do harness pelos contratos
  públicos, dentro de `examples/` ou de um pacote de referência.
- Pronto: E2E, `test:postgres`, `verify:phase2/3/4a` e certificação passam
  com o fluxo neutro, sem carregar `legacy/`.

### PR-L08 — Mover a documentação de produto para `legacy/docs` (DL-03) · P1 · DOC

- O que/onde: `docs/00_discovery/0001–0009`, `docs/01_prd/0010–0020` e
  `aaa_decision_brief.md`, `docs/blueprint/`, `docs/CODEX_MASTER_INSTRUCTIONS.md`
  e demais documentos de produto identificados em PR-L01.
- Como: `git mv` para `legacy/docs/` com índice; o histórico de auditoria
  (`docs/04_audit/**`, evidências com hash) fica no lugar, marcado como
  `HISTORY` no inventário. Ajustar `tests/docs-readiness.test.js` (lê
  `0013_requisitos_funcionais.md` e a matriz `0304`) e os links.
- Pronto: `docs:check-links` e `npm test` verdes; `docs/` vigente só com
  documentação do harness.

### PR-L09 — Constituição e instruções de agente do harness · P0 · DOC

- O que/onde: `AGENTS.md` da raiz (título `cvg-agent-secretary-v2`),
  `docs/07_agents/AGENTS.md` ("construir a Esmeralda V2"), skills em
  `.agents/`, `.codex/` e `.agent/` que citam o produto legado.
- Como: reescrever para o harness, preservando pipeline, estados e regras de
  segurança; a versão antiga vai para `legacy/docs`.
- Pronto: nenhuma instrução de agente vigente cita o legado como produto;
  aprovação humana da nova constituição registrada.

### PR-L10 — Resíduos de nome · P2 · SPEC+BUILD

- O que/onde: tag `cvg-agent-secretary:local` no `Dockerfile`, banco
  `cvg_agent_secretary_v2` no `.env.example`, chave
  `cvg-agent-secretary:migrations` do advisory lock em
  `packages/persistence/src/postgres-migrations.ts`, nomes de teste.
- Como: renomear; a chave do advisory lock só muda com janela de
  compatibilidade (as duas chaves adquiridas durante uma versão) para não
  permitir migrações concorrentes durante o deploy.
- Pronto: `git grep -i secretary` fora de `legacy/` e do histórico vazio.

### PR-L11 — Apagar o legado isolado (DL-05) · P1 · SPEC+BUILD

- O que: remover `legacy/packages/*` e as tabelas de jornada quando PR-L07
  estiver verde e DL-05 autorizar.
- Como: migration expand/contract para descartar as tabelas legadas, com
  backup verificado antes; `legacy/` fica só com README, inventário e
  `legacy/docs`.
- Pronto: build, testes, E2E e certificação verdes sem `legacy/packages`.

### PR-L12 — Guarda de CI contra resíduo do legado · P1 · SPEC+BUILD

- Como: gate `legacy-residue` em `scripts/ci-bar.mjs` que falha se termos do
  legado aparecerem fora de `legacy/` e de uma allowlist de histórico
  versionada; pacote sem consumidor também falha o gate.
- Pronto: gate no `verify.yml`, com caso negativo provado.

## F1 — Decisões de plataforma e escopo

### PR-101 — Discovery de plataforma · P0 · DISC

- `IN_PROGRESS / NOT_VALIDATED` em 27/09/2026: [discovery 0019](../00_discovery/0019_platform_first_consumer_pilot.md)
  registra a hipótese, critérios e dados ainda necessários. D-04 determina
  que o primeiro consumidor seja definido nesta etapa; o usuário informou
  que ainda não há candidatos a produto.
- O que: quais produtos vão consumir o harness, qual é o primeiro, que
  capacidades eles precisam (runtime, approvals, handoff, canal, conhecimento,
  efeito externo), volumes, operadores e restrições legais. O legado
  (Esmeralda V2) não é insumo de escopo.
- Pronto: documento em `docs/00_discovery/` e validação aprovada.

### PR-102 — PRD adendo de plataforma (D-03) · P0 · PRD

- D-03 foi decidida pelo usuário em 27/09/2026: opção A, núcleo governado
  completo. A decisão fixa o escopo pretendido; não substitui o PRD validado
  nem autoriza capacidades sensíveis ou produção.
- O que: capacidades da plataforma liberadas para produção, contrato público
  que os produtos consomem, SLOs da plataforma, métricas de sucesso e
  não-objetivos permanentes do plano 0354. Substitui, para o harness, o PRD
  original da secretária, que vai para `legacy/docs` (PR-L08).
- Pronto: PRD adendo aprovado e `01_prd/0090_prd_validation.md` atualizado.

### PR-103 — Primeiro consumidor, tenant piloto e níveis de serviço (D-04) · P0 · HUMAN

- O usuário determinou em 27/09/2026 que o primeiro consumidor e o contexto
  do piloto sejam definidos no discovery PR-101. Produto, tenant, volumes,
  horário humano e SLA ainda não estão decididos.
- Pronto: produto consumidor do piloto, tenant, volume, horário de cobertura
  humana, SLA de handoff e metas numéricas de sucesso registrados.

### PR-104 — Provider de LLM (D-05) · P0 · HUMAN

- Critérios: DPA com retenção zero para dados de entrada, região de
  processamento, custo, latência, suporte a endpoint compatível com o gateway
  `openai-compatible` já existente.
- Pronto: decisão e contrato registrados.

### PR-105 — Canal (D-06) · P0 · HUMAN

- Opções: WhatsApp Business API oficial, Evolution, Chatwoot (os dois
  últimos já têm adapter em `packages/channel-gateway`).
- Pronto: decisão registrada com análise de risco de bloqueio de número,
  custo e termos de uso.

### PR-106 — Fontes de conhecimento aprovadas (D-07) · P1 · HUMAN

- Pronto: dono das fontes do primeiro consumidor, processo de
  publicação/revogação na plataforma e lista inicial aprovada.

### PR-107 — Nuvem, região e orçamento (D-08) · P0 · HUMAN

- Pronto: provedor, região (preferência Brasil), orçamento mensal e conta
  de produção separada registrados.

### PR-108 — Governança proporcional (D-12) · P0 · HUMAN + DOC

- Estado: `COMPLETED` em 26/09/2026 — trilhas T1–T4 e regras de baseline incorporadas a [`07_agents/AGENTS.md`](../07_agents/AGENTS.md).

- O que: o processo atual exige gate hash-bound por edição e deixou C1L cair
  por drift de `0190_spec_validation.md`, que estava fora do escopo.
- Como: gate hash-bound por release candidate e por capacidade sensível;
  baselines de gate só com os inputs daquele gate; SPEC curta + CI + revisão
  para refatorações sem efeito externo. Atualizar `07_agents/AGENTS.md`.
- Pronto: constituição atualizada e aprovada; um exemplo de cada trilha.

### PR-109 — Encerrar M07-S1/C1M (RA26-17) · P0 · HUMAN

- Estado: `COMPLETED` em 26/09/2026 — D-13 opção B: M07-S1 `ACCEPTED_WITH_RISK`, registrada em [0344](0344_reaudit_m07_backlog.md); findings na PR-208.

- Como: D-13; completar o packet C1M com baseline rederivada e executar, ou
  reclassificar M07-S1 com justificativa e riscos aceitos.
- Pronto: `final-gate-result.md` gravado ou reclassificação assinada;
  RA25-05 desbloqueado ou encerrado.

## F2 — Fundação de engenharia

### PR-201 — Decompor `apps/api/src/server.ts` (RA26-11) · P1 · SPEC+BUILD

- O que: 5 857 linhas e 74 handlers.
- Como: padrão RA25-07 (extração mecânica verificada byte a byte, uma fatia
  por SPEC); domínios candidatos: jornadas, admin/control plane, webhooks,
  aprovações.
- Pronto: nenhum módulo acima de 1 500 linhas; testes, cobertura e
  `test:postgres` sem queda.

### PR-202 — Decompor `runTurn` em `packages/agent-runtime/src/runtime.ts` · P1 · SPEC+BUILD

- 28/09/2026, primeira fatia [SPEC 0153](../02_spec/0153_pr202_approval_request_slice.md) integrada ao root em `69d08d3` após commit isolado `f787ad9`: `runTurn` de cerca de 655 para 592 linhas; AST 3/3, regressão de autoridade/telemetria capturadas e crítica independente I2 `ACCEPT` após P1 corrigido. [Prova](../04_audit/evidence/PR202-SLICE-20260928/proof.json): Node 22 325/2.393, PostgreSQL 35/258, Chromium 12/12, cobertura acima dos thresholds e root 13/275, tipo/lint/formato PASS. Catálogo `SKIP-PG-014` tem hash vencido em caminho PR-L04, gate de skips `FAIL`; integração composta/certificação pendentes, produção `NO_GO`. `#runExecutionTurn` (~629 linhas), recuperação/replay e o arquivo de 2.636 linhas mantêm a PR‑202 aberta.
- Baseline histórica de 26/09: 2.603 linhas, com `runTurn` de 2.233; substituída pela medição de 28/09 acima.
- Pronto: `runTurn` dividido em etapas nomeadas com testes por etapa; mesmo
  comportamento provado pela suíte de evals.

### PR-203 — Fatias 3 e 4 de `postgres.ts` (RA25-07) · P1 · SPEC+BUILD

- 27/09/2026, fatia 4 local `LOCAL_PASS` no commit isolado `9e949d7`:
  `postgres.ts` 1.455 linhas, novo `postgres-inbound.ts` 813; AST 7 métodos
  e 2 helpers preservados, crítica independente `ACCEPT`. Node 22: suíte
  final com cobertura 325/2.392, PostgreSQL 35/258, Chromium 12/12, zero
  skips, tipo/lint/formato PASS. [Prova](../04_audit/evidence/PR203-20260927/proof.json).
  Integrado ao checkout compartilhado em `7b3871d` com hashes iguais e
  tipo/lint/negativo focado PASS. Compor com OIDC/PR-L04 e repetir
  certificação/CI no SHA final; produção `NO_GO`.
- 27/09/2026, recon: a fatia 3 já está no commit `f9f84c9` (`postgres-audit.ts` 612 linhas). O alvo atual `postgres.ts` tem 2.106 linhas no checkout `79f28cc`. A [SPEC 0134 revisada](../02_spec/0134_postgres_slice_extraction.md) autoriza BUILD local T2 da fatia 4 em branch isolado, com extração inbound/sessão sem mudar SQL, transação ou exports públicos; gates ainda `NOT_RUN`. Meta: ambos os módulos abaixo de 1.500 linhas e testes de PostgreSQL/E2E verdes.
- Dependência: PR-001.
- Pronto: `postgres.ts` abaixo de 1 500 linhas; `test:postgres` PASS.

### PR-204 — Configuração única validada no boot (RA26-08) · P0 · SPEC+BUILD

- 28/09/2026, branch T3 isolado `7019422` compõe o modo corporativo e recusa todo override de produção exceto telemetria; [prova](../04_audit/evidence/PR301-CORP-T3-20260928/proof.json) com unit 319/2.410, PG 35/258 e OIDC PG 2/20. Positivo do entrypoint produtivo, integração root, rollback B2 e certificação final pendentes. `LOCAL_PASS / NO_GO`.
- 28/09/2026, follow-up B2 isolado `643f6ad` adicionou aviso sem valor secreto para dev/test quando um release B2 existir. [Prova](../04_audit/evidence/PR204-B2-PREP-20260928/proof.json): 333/2.478 com cobertura, PG 35/258, Chromium 12/12, tipo/lint/formato/skip PASS; imagem API B1 sobe e rejeita spoof de fase B2 antes do listener sem vazamento. Crítica independente `REJECT_B2_RELEASE`: B1 permanece pinado, então o aviso B2 ainda não é exercitável no entrypoint publicado. Drenar A, certificar B1, configurar cofre, publicar/testar B2 e rollback em staging continuam P0; produção `NO_GO`.
- 27/09/2026, BUILD T3 sintético aprovado e implementado no branch isolado `codex/pr204-boot-20260927` (`99692e3`): snapshot do boot da API, produção fechada sem autoridade OIDC corporativa, preflight do worker, autenticação do gateway e bundle web com inventário/hashes; imagem Docker limpa arquivos padrão do Nginx. [Prova local](../04_audit/evidence/PR204-BUILD-20260927/proof.json): suíte 333/2.477, PostgreSQL 35/258 e Chromium 12/12 sem skips; artefato web com 10 arquivos; cobertura 333/2.477 PASS (92,28% statements, 87,45% branches). Estado `ISOLATED_BUILD_LOCAL_PASS / ROOT_INTEGRATION_PENDING / NO_GO`. P0 remanescentes: PR-L04 libera integração, B2 operacional do segredo, IdP corporativo, SPEC 0150, decisões de provider e certificação/CI/atestação do SHA final.
- 27/09/2026, [AUD-0581](../04_audit/0581_production_boot_configuration_gap_2026-09-27.md) confirmou que `parseEnv` aceita em produção flags `ENABLE_REAL_*` sem consumidor, identidade implícita e inbound durável desligado; o builder da API tem guards separados. O preflight do worker aceitou `NODE_ENV` ausente ou inválido em modo controlado. A [SPEC-PR204-001](../02_spec/0151_production_boot_configuration_contract.md) define snapshot tipado, gate do bundle web, seleção OIDC sem HMAC legado, rollout A/B1/B2 de segredo e negativos de entrypoint. I1 rejeitou quatro P1; I2 aceitou a revisão para análise humana T3. Estado `SPEC_REVIEW_READY / HUMAN_T3_REVIEW_PENDING`; nenhum BUILD ou GO.
- O que/onde: `ENABLE_REAL_*` sem consumidor em `packages/shared/src/env.ts`;
  segredo do provider chamado `OPENAI_API_KEY` num gateway neutro;
  `POSTGRES_RLS_ENFORCEMENT` e `OUTBOX_DURABLE_INBOUND` opcionais.
- Como: um schema de configuração por processo, validado no boot, com perfil
  `production` que exige RLS, inbound durável, HTTPS, identidade `trusted`,
  keyrings e flags coerentes; renomear o segredo para `MODEL_PROVIDER_API_KEY`
  com compatibilidade temporária.
- Pronto: testes negativos provam que cada combinação inválida aborta o boot
  em produção.

### PR-205 — Dependências e duplicações (RA26-12/14) · P2 · SPEC+BUILD

- O que: `drizzle-orm`, `pino` e `dotenv` sem uso; `ssrf-node.ts` duplicado;
  fixture duplicado.
- Pronto: `npm ls` coerente; SBOM sem dependência órfã; uma única cópia do
  código SSRF.

### PR-206 — Destino de `conversation`, `rag`, `channel-gateway` e Drizzle (RA26-12/13, D-11) · P1 · HUMAN + SPEC+BUILD

- O que: `@cvg/conversation` (7 917 linhas, camada Phase 4A do harness, sem
  importador em apps), `@cvg/rag` e `@cvg/channel-gateway` sem consumidor de
  runtime; `drizzle-orm` sem uso. `workflows`, `tools` e `memory` saíram
  deste item: são legado e são apagados na PR-L02 (DL-02).
- Pronto: cada pacote `WIRED`, `SPEC_ONLY` ou `ARCHIVED`, conforme o PRD
  adendo de plataforma.

### PR-207 — Contrato de API publicado e versionado · P2 · SPEC+BUILD

- 28/09/2026: [AUD-0584](../04_audit/0584_isolated_admin_rbac_2026-09-28.md)
  observou que `/v1/admin/capability-approvals/:approvalId` e seu `execute`
  são acessíveis ao papel `Operator` por `approval:view`/`approval:execute`,
  enquanto outras rotas do prefixo exigem permissões diferentes. O contrato
  publicado deve declarar permissão/tenant por operação e não inferir
  autorização do prefixo. A prova é local/sintética; produção `NO_GO`.
- Como: gerar OpenAPI a partir dos schemas zod existentes; teste de contrato
  que falha em quebra não versionada.
- Pronto: documento OpenAPI gerado em CI e diff de contrato como gate.

### PR-208 — Declarar as dependências de teste da M07-S1 · P2 · SPEC+BUILD

- O que: os 11 findings `TEST_ONLY` aceitos na reclassificação da M07-S1
  (lista em [0344](0344_reaudit_m07_backlog.md)): testes de `@cvg/api`,
  `@cvg/worker` e `@cvg/chaos` importam workspaces não declarados em
  `devDependencies`, e `api` ↔ `worker` se importam mutuamente em testes.
- Como: declarar as `devDependencies` corretas; para `api` ↔ `worker`, mover
  os testes cruzados para `tests/` na raiz em vez de criar dependência cíclica.
- Pronto: `node scripts/workspace-dependency-audit.mjs` sem findings.

## F3 — Segurança e identidade

### PR-301 — Autenticação de operador por OIDC com MFA na API (D-09) · P0 · SPEC+BUILD

- 28/09/2026, [AUD-0584](../04_audit/0584_isolated_admin_rbac_2026-09-28.md) sondou 48 pares `/v1/admin` com sessão `Operator` no candidato isolado: 45 retornaram 403, três de capability approval retornaram 400 depois de permissões `approval:view/execute` válidas. Controle funcional sintético emitiu approval com `Supervisor`, executou uma vez com `Operator` (200, ferramenta `succeeded`) e recusou replay (400); tenant divergente e role falsificada foram recusados. [Prova](../04_audit/evidence/AUD0584-ADMIN-RBAC-20260928/summary.json). Sessões criadas diretamente no store local não validam IdP corporativo, PG, root/PR-L04 ou staging; `NO_GO`.
- 28/09/2026, [AUD-0583](../04_audit/0583_isolated_route_authentication_2026-09-28.md) inventariou 111 pares rota/método no candidato isolado `7ef74e7` e sondou ausência de sessão, `Origin` permitido e spoof de headers legados. Os 98 pares protegidos retornaram 401 em cada cenário; três GETs com sessão válida deram 200, e o logout sem cookie não revogou sessão. [Prova](../04_audit/evidence/AUD0583-ROUTES-20260928/summary.json). O teste é local OIDC/dev e não qualifica boot corporativo de produção, root/PR-L04, IAM/staging ou SHA final; `NO_GO`.
- 28/09/2026, no SHA composto isolado `7ef74e7`, [prova local real de Keycloak/Chromium/API/PostgreSQL](../04_audit/evidence/PR301-LOCAL-ENTRYPOINT-20260928/proof.json) passou com OTP errado sem sessão, OTP válido com sessão persistida, state de uso único, replay 401 e cookie antigo revogado após logout. Noether rejeitou I1 por três P1 de prova; nova execução corrigida recebeu [I2 `ACCEPT_LOCAL_PROOF`](../04_audit/evidence/PR301-LOCAL-ENTRYPOINT-20260928/I2-review.md), 10/10 hashes e limpeza zero. O harness está fora do commit e o console é sintético; não substitui staging corporativo HTTPS, IAM real, root/CI ou certificado do SHA final. `LOCAL_ENTRYPOINT_ACCEPTED / PRODUCTION_NO_GO`.
- 28/09/2026, follow-up T3 isolado `ed012a4` corrige sites HTTPS incompatíveis com `SameSite=Strict`, host de autorização diferente do issuer, callback com cookie legado/malformado e espera DNS sem limite. [Prova](../04_audit/evidence/PR301-CORP-I1-20260928/proof.json): Node 22 + PostgreSQL 16 340/2.578, gate PG 35/258, Chromium 12/12, cobertura global PASS, crítica independente `ACCEPT`; cobertura crítica RLS `FAIL` (83,76% branches, piso 95%). [Transporte HTTPS](../04_audit/evidence/PR302-HTTPS-BROWSER-20260928/proof.json) passou na imagem NGINX do mesmo commit com API/IdP sintéticos. `skip:governance` falha no hash de `postgres-persistence-mode.test.ts` sob claim PR-L04. Integração root, issuer público controlado, IAM real, staging com MFA/PG, rollback e certificado/CI do SHA final permanecem P0; produção `NO_GO`.
- 28/09/2026, SPEC 0152 aprovada para BUILD T3 sintético: `7019422` implementa client confidencial OIDC corporativo, PKCE/state/nonce, TLS/DNS/allowlist, MFA e mapeamento ativo de grupos, sessão PostgreSQL e boot fechado. [Prova](../04_audit/evidence/PR301-CORP-T3-20260928/proof.json): unit 319/2.410, PG 35/258, OIDC PG 2/20, tipo/lint/build PASS. Positivo do entrypoint com issuer público HTTPS, IAM real, browser do mesmo digest, rollback e root/CI pendentes; `ISOLATED_SYNTHETIC_BUILD_PASS / NO_GO`.
- 28/09/2026, [AUD-0582](../04_audit/0582_corporate_oidc_boot_gap_2026-09-27.md) delimitou o boot corporativo ausente no branch PR‑204; [SPEC 0152](../02_spec/0152_corporate_oidc_authority_contract.md) define configuração, client confidencial, MFA/grupo/tenant, prova do mesmo digest em Chromium/PG/issuer HTTPS sintético e rollback com drenagem integral. Críticas I1–I3 rejeitaram P1 corrigidos; I4 `ACCEPT_SPEC_REVIEW_READY`. Estado `HUMAN_T3_REVIEW_PENDING / BUILD_NOT_AUTHORIZED / NO_GO`; IAM real, SPEC 0150 e prova de staging seguem abertos.
- 27/09/2026, merge isolado do root `d43d3f5` com OIDC `85c2c7d` sem conflitos (`dd954ab`), commit de ajuste `0b4a95b`. [Prova local](../04_audit/evidence/PR301-ROOT-INTEGRATION-20260927/proof.json): Node 22, PostgreSQL 16, suíte 331/2.437 e gate PG 35/258 sem skips, catálogo/tipo/lint/links PASS; Chromium/Keycloak MFA real, OTP errado negado, callback entre sites, sessão só por cookie, logout e replays negados. Contêineres e inventário sintético limpos. Branch fora do checkout compartilhado enquanto PR-L04 está ativo; IdP corporativo, SPEC 0149/0150, certificado/CI final e release continuam `PENDENTE / NO_GO`.

- 27/09/2026, [prova sintética Chromium](../04_audit/evidence/PR301-CROSS-ORIGIN-PROBE-20260927/proof.json) em hosts HTTPS distintos validou escopo host-only, CORS com credenciais, cookie operacional `Strict` só na API, cookie pendente `Lax` no callback iniciado por documento do IdP e rejeição de cookie `__Host-` injetado por host irmão. O diagnóstico de navegação direta com redirect imediato, que enviou `Strict`, está registrado na prova. Não exercitou código CVG, IdP, banco, CDN ou NGINX; SPEC 0150 T3, BUILD e E2E integrado seguem `PENDENTE / NO_GO`.

- 27/09/2026, [AUD-0580](../04_audit/0580_cross_origin_oidc_gap_2026-09-27.md) reproduziu `GET 200` e `OPTIONS 204` com `Access-Control-Allow-Origin` correto, mas sem `Access-Control-Allow-Credentials`, em Node 22 no hook real do branch `85c2c7d`. O cliente web usa URL relativa e proxy Vite; o NGINX web também faz proxy `/v1`, então o E2E atual não exercita API/console em hosts distintos. A [SPEC-PR301/302-002](../02_spec/0150_cross_origin_operator_console.md) define origem de API fixada no bundle, CORS com credenciais só para console, CSRF por `Origin`, cookies `__Host-`, `/v1` sem cache compartilhado, CSP e prova HTTPS sintética. I27/I28 `ACCEPT_SPEC_REVIEW_READY` após corrigir injeção por origem irmã, cache entre tenants e rollback antigo; revisão humana T3, BUILD e prova continuam pendentes. `NO_GO`.

- 27/09/2026, I26 `ACCEPT_LOCAL` após rechecagem adversarial das rotas: a revogação por digest antigo é o contrato explícito da SPEC 0144 para serializar logout e `replace`, com risco de disponibilidade conhecido, sem bypass novo. Ficou um P3 apenas no harness sintético: API e Vite em portas diferentes do mesmo hostname recebem o mesmo cookie host-only `Path=/`, como prevê a [RFC 6265 §8.5](https://www.rfc-editor.org/rfc/rfc6265.html#section-8.5). Antes de produção, escolher hosts HTTPS distintos no mesmo site para console/API, manter cookie host-only `Secure; HttpOnly; SameSite=Strict` emitido só pela API e provar em navegador que o servidor web não o recebe, a API o recebe e o callback IdP depende só do cookie pendente Lax. O IdP local já é recusado fora de dev/test; essa prova de topologia corporativa segue P0 de GO.

- 27/09/2026, rollout da purge: a [SPEC 0149](../02_spec/0149_operator_auth_purge.md) agora define A0–A4, com release de preflight que aceita somente inventários `0001` e `0002` completos, drenagem verificada do binário antigo antes da migration, runner com alvo explícito, restart para repetir preflight após DDL e rollback apenas até o release compatível. Ainda é proposta T3 em revisão; nenhum binário compatível, migration `0002` ou job de purge foi construído. `PENDENTE / NO_GO`.

- 27/09/2026, purge da autenticação: [SPEC-PR301/402-001](../02_spec/0149_operator_auth_purge.md) recebeu I24 `ACCEPT_SPEC_REVIEW_READY` para revisão T3, sem autorização de BUILD. Ela cobre state expirado, sessões e famílias, role/job separados, ausência de DML da API, lote limitado, concorrência com replace/logout, alerta e rollout compatível com o preflight exato. O [inventário DB-09](../platform/09-personal-data-inventory.md) registra as categorias e a lacuna de retenção. Decisões DP-01 a DP-06 do controlador/DPO, inclusive idade máxima da família, backup/PITR e prova de staging seguem `PENDENTE / NO_GO`.

- 27/09/2026, startup de produção sem DDL no branch isolado `codex/pr301-oidc-client` (`85c2c7d`): API rejeita `DATABASE_MIGRATION_URL`/auto-migration; job externo aplica migrations e serving verifica catálogos com URL runtime, owner distinto, login direto, ownership/ACL e nenhum `CREATE` efetivo para runtime em banco ou schemas persistentes. I23 `ACCEPT_LOCAL` após negativo de `CREATE` em `public`. Node 22: suíte 331/2.437 sem skips, `test:postgres` 35/258, E2E Keycloak/Chromium entre sites PASS, tipo/lint/formato/links/higiene PASS. Prova no branch `docs/04_audit/evidence/PR301-PROD-STARTUP-20260927/proof.json`. Ainda fora do checkout compartilhado por PR-L04; IdP corporativo, dados/rollout e certificado/CI do SHA integrado pendentes. `BUILD_LOCAL_ACCEPTED / NO_GO`.

- 27/09/2026, rotas e composição local no branch isolado `codex/pr301-oidc-client` (`b41cff2`): startup com preflight read-only de role/schema/RLS e stores PostgreSQL, `POST /v1/auth/oidc/start`, callback com assinatura/nonce/MFA, replace transacional, reload apenas por cookie e logout revogado. I19/I20 `ACCEPT_LOCAL` após correções de cookie Strict entre sites e cookie duplicado no logout. Suíte PG 330/2.428, `test:postgres` 35/258, Keycloak OTP real, tipos/lint/links/audit PASS. Prova no branch isolado `docs/04_audit/evidence/PR301-OIDC-ROUTES-20260927/proof.json`. PR-L04 detém API/web no checkout compartilhado; integrar branch após liberação, ligar PR-302, retenção/purge, IdP corporativo, E2E confiável e recertificar SHA integrado. `BUILD_LOCAL_ACCEPTED / NO_GO`.

- 27/09/2026, cliente OIDC local no branch isolado `codex/pr301-oidc-client` (`30d3ca4`): discovery e endpoints restritos ao Keycloak de loopback, Code + PKCE, assinatura/JWKS, nonce, MFA e tenant verificados. O negativo de assinatura falsa exigiu `enableNonRepudiationChecks`; I18 `ACCEPT_LOCAL`. Prova em navegador com OTP e replay negado, 41/41 focados, suíte sem banco 306/2.240 PASS (20/162 skipped), typecheck/lint/audit/links PASS. Evidência no próprio branch em `docs/04_audit/evidence/PR301-OIDC-CLIENT-20260927/proof.json`. PR-L04 ainda reivindica package/lockfile/contrato, rotas e web no checkout compartilhado; integração e certificado permanecem pendentes. `BUILD_PARTIAL / NO_GO`.
- 27/09/2026, state OIDC compartilhado: migration incremental `0001` em schema de autenticação, funções `SECURITY DEFINER` de reserva/consumo único, adapter com pool limitado e preflight fechado de colunas/ACL/RLS/PK-FK/índices/corpos. I16 corrigiu cutover/relógio (`ACCEPT_LOCAL_DESIGN`); I17 corrigiu FK extra e timeout (`ACCEPT_LOCAL`). [Prova](../04_audit/evidence/PR301-OIDC-STATE-PG-20260927/proof.json): Node 22, focados PostgreSQL 26/26, suíte com banco 325 arquivos/2.391 testes sem skips, `test:postgres` 35/258, typecheck/lint PASS. Store/API/rotas/web ainda não compostos, purge/retensão/rollback real e OIDC/JWKS/E2E/certificação ainda pendentes. `BUILD_PARTIAL / NO_GO`.
- 27/09/2026, transação OIDC isolada: [módulo de login](../../apps/api/src/oidc-login-transaction.ts) gera state/nonce/PKCE S256 e cookie de callback AES-256-GCM por cinco minutos, com contrato de `reserve`/`consume` atômicos para state; URI de callback exato do Keycloak local. I15 rejeitou replay e URI divergente na primeira versão, aceitou a correção `ACCEPT_LOCAL`. Node 22: 6/6 focados, suíte geral 305/2.226 PASS (20/154 skipped sem banco), PostgreSQL descartável 35/258 PASS, typecheck/lint PASS. [Prova](../04_audit/evidence/PR301-OIDC-TRANSACTION-20260927/proof.json). Store distribuído real, discovery, code exchange, JWKS/ID token, rotas, web e E2E confiável continuam abertos. `BUILD_PARTIAL / NO_GO`.
- 27/09/2026, índices PostgreSQL: preflight do schema de autenticação agora confere cinco índices canônicos e rejeita índice ausente, trocado, parcial ou extra. Node 22: PostgreSQL 16 descartável 9/9 focados, suíte geral 304/2.220 e PostgreSQL completo 35/258 PASS; I13 `ACCEPT_LOCAL`. [Prova](../04_audit/evidence/PR301-PG-INDEX-20260927/proof.json). Composição no serving, rotas OIDC, E2E confiável e certificação ainda pendentes. `BUILD_PARTIAL / NO_GO`.
- 27/09/2026, mapeamento local: [vínculo de claims OIDC verificados](../../apps/api/src/oidc-identity.ts) exige `pwd`+`otp`, `auth_time` recente, issuer/audience/`azp` coerentes e um único grupo de tenant/papel; gera operador estável por issuer+subject e limita sessão a 15 minutos ou `exp`. Keycloak real confirmou `pwd`, `otp` e `auth_time` no token; Node 22: 22 testes focados, suíte geral 304/2.220 e PostgreSQL 35/258 PASS; I12 `ACCEPT_LOCAL` após correção da lista unitária de audience. [Prova](../04_audit/evidence/PR301-OIDC-MAP-20260927/proof.json). O mapeador só pode receber token previamente verificado; assinatura/JWKS/nonce, rotas, store composto e E2E seguem abertos. `BUILD_PARTIAL / NO_GO`.
- 27/09/2026, IdP local: [Keycloak em loopback](../../deploy/local-oidc/README.md) com versão/digest fixos, realm sem usuários e fluxo senha+OTP `REQUIRED`, client Code + PKCE S256, direct grant desativado, AMR/grupo no ID token. [Prova real em navegador](../04_audit/evidence/PR301-OIDC-LOCAL-20260927/proof.json) PASS para PKCE ausente, redirect errado, setup OTP, OTP errado e token após OTP válido com `amr: otp` e grupo sintético. I11 `ACCEPT_LOCAL`; não representa integração API/web nem produção.
- 27/09/2026, fatia PostgreSQL: migration isolada de autenticação e adapter com digest SHA-256 do cookie de 256 bits, quatro funções `SECURITY DEFINER`, RLS/FORCE, revogação por família e preflight de role/ACL/funções/constraints implementados sob [SPEC 0144](../02_spec/0144_trusted_operator_session_production.md). PostgreSQL 16 descartável: 8 testes do store e 16 focados com hook/sessão PASS, incluindo grants, RLS, alteração de função, constraint de expiração, `SET ROLE`, herança, trigger malicioso e recusa de `Pool` como cliente DDL. Críticas I7–I9 corrigidas; I10 `ACCEPT_LOCAL` da fatia isolada. [Evidência](../04_audit/evidence/PR301-PG-20260927/proof.json). Ainda faltam composição do servidor, UI/rotas confiáveis, migração operacional, OIDC + PKCE na API, ligação ao IdP local, E2E e gates integrados. `BUILD_PARTIAL / NO_GO`.
- D-09 esclarecida pelo usuário: desenvolvimento e homologação usam IdP OIDC **local com MFA obrigatório** e identidades sintéticas; issuer corporativo para produção será informado depois. Login próprio usuário/senha não foi autorizado.
- 27/09/2026: usuário aprovou explicitamente [SPEC 0144](../02_spec/0144_trusted_operator_session_production.md) e D-09 (IdP corporativo OIDC com MFA obrigatório). BUILD T3 iniciado em claim próprio: falha temporária do store preserva cookie para retomada. [Prova local](../04_audit/evidence/PR301-20260927/proof.json) e revisão I2: a tentativa isolada de recarga web foi retirada após revelar estados 401/503 incorretos no `App.tsx`; exige mudança integrada após liberação do claim PR-L04. Revisão de segurança I1 exige owner/schema/preflight e troca transacional antes da migration; composição do entrypoint também aguarda `apps/api/src/server.ts`. Issuer, client, claims MFA e mapeamento de grupos ainda não informados. `IN_PROGRESS / NO_GO`.
- AUD-0579: [SPEC-PR301/302-001](../02_spec/0144_trusted_operator_session_production.md) `PROPOSED / WAITING_HUMAN_SPEC_REVIEW`. O entrypoint publicado não compõe `operatorSessionStore` fora dos testes; `/v1/session` responde 503. Definir D-09, store durável e fronteira de lookup/tenant antes do BUILD T3.
- O que/onde: hoje a identidade é token HMAC por keyring
  (`apps/api/src/operator-identity.ts`).
- Como: validar tokens OIDC (issuer, audience, JWKS com cache e rotação);
  mapear grupos do IdP para papéis e tenants; manter o keyring só para
  tráfego serviço-a-serviço.
- Pronto: testes com IdP de teste para token expirado, audience errada,
  tenant ausente e MFA ausente; replay continua bloqueado.

### PR-302 — Login web por OIDC · P0 · SPEC+BUILD

- 28/09/2026, [prova de transporte do produto](../04_audit/evidence/PR302-HTTPS-BROWSER-20260928/proof.json) em Chromium 147 usa o bundle/NGINX real de `ed012a4`, hosts HTTPS distintos do mesmo site e hook de segurança da API: cookie não chegou ao console, API restaurou duas sessões sintéticas, 200/401/503 com CORS/no-store, CSRF e CSP negaram origens indevidas, callback Lax sem Strict e injeção `__Host-` recusada. Imagem local `sha256:e6d0f257…`; API/IdP/PG corporativos e staging público ainda não exercitados. `SYNTHETIC_TRANSPORT_PASS / PRODUCTION_NO_GO`.
- 28/09/2026, SPEC 0150 aprovada para BUILD T3 sintético: `7019422` fixa origem API no bundle de produção, recusa proxy NGINX `/v1`, habilita CORS com credenciais só ao console, valida `Origin` em mutação com cookie, emite cookies `__Host-` e protege cache. Testes web focados 2/35 e build de 10 arquivos com digest PASS; [prova](../04_audit/evidence/PR301-CORP-T3-20260928/proof.json). Topologia HTTPS/Chromium do mesmo digest, root/CI e release pendentes; `ISOLATED_SYNTHETIC_BUILD_PASS / NO_GO`.
- A [SPEC 0150](../02_spec/0150_cross_origin_operator_console.md) é gate T3 para o console chamar a API no host HTTPS correto sem enviar cookie ao servidor estático; deve preservar recarga, 401/503 e logout com `credentials: include`. O build de produção não pode depender do proxy Vite. Revisão humana, BUILD e prova de navegador em hosts distintos pendentes.

- 27/09/2026, I22 rechecagem `ACCEPT_LOCAL_PROOF` após reforço entre sites (`8b0f92d`). O commit isolado `0b57416` corrigiu a descrição de sessão antiga e só emite E2E PASS após comprovar cleanup de usuário e zero roles/schemas; uma tentativa com timeout deixou objetos sintéticos, removidos manualmente antes da execução final verde em Node 22. Prova: `docs/04_audit/evidence/PR301-302-TRUSTED-E2E-20260927/proof.json` no branch. Compatibilidade de rollout, integração após PR-L04, IdP corporativo, dados e certificação do SHA integrado ainda pendentes. `ACCEPT_LOCAL_PROOF / NO_GO`.

- 27/09/2026, crítica I22 `REJECT_LOCAL_PROOF` da prova anterior: 401 sem cookie após logout não provava revogação e IdP/API no mesmo host não testavam o callback entre sites. O branch isolado `8b0f92d` corrigiu o verificador: Node 22/Chromium/Keycloak com IdP `localhost` e API/web `127.0.0.1`, segunda sessão com cookie pendente Lax e operacional Strict omitido no callback, troca de sessão e replays antigos 401, inclusive cookie salvo antes do logout. Prova em `docs/04_audit/evidence/PR301-302-TRUSTED-E2E-20260927/proof.json` no branch; rechecagem independente pendente. Integração após PR-L04, rollout e gates de produção abertos. `CROSS_SITE_E2E_PASS_LOCAL / NO_GO`.

- 27/09/2026, E2E confiável isolado `cb943e8`: Chromium percorreu console, API, PostgreSQL 16 e Keycloak MFA real; OTP errado não criou sessão, OTP válido emitiu cookie HttpOnly/Strict, recarga por cookie e logout revogado. Node 22.23.2 (alvo) e Node 24.20.0 PASS; roles/schemas/operador e contêineres sintéticos removidos. Prova no branch: `docs/04_audit/evidence/PR301-302-TRUSTED-E2E-20260927/proof.json`. Revisão independente, integração após PR-L04 e certificado/CI no SHA integrado pendentes; IdP corporativo e gates de dados/rollout/serving de produção ainda abertos. `E2E_LOCAL_PASS / NO_GO`.

- 27/09/2026, branch isolado `codex/pr301-oidc-client` (`531ef2a`, `1c1ae32`): console inicia login OIDC/MFA por POST, recarrega sessão por cookie, diferencia 401 inicial/503, mantém acesso travado na indisponibilidade e preserva identidade local se o logout falha. Revisão interna corrigiu retry após falha 503 do início. Suíte web 26/96, typecheck, lint, build e links PASS. Prova no próprio branch: `docs/04_audit/evidence/PR302-OIDC-WEB-20260927/proof.json`. Crítica independente, E2E confiável web/API/PostgreSQL/Keycloak, integração no checkout após PR-L04 e certificado no SHA integrado pendentes. `BUILD_VERIFIED_LOCAL / NO_GO`.

- 27/09/2026: SPEC 0144 e D-09 aprovadas. Tentativa de recarga por cookie rejeitada na crítica I2: `App.tsx` trata 503 como autenticação necessária e a primeira visita 401 pode aparecer como sessão expirada. Código web da tentativa retirado. Implementar recarga, estados da UI e callback 401 juntos quando PR-L04 liberar `App.tsx`/`client.ts`; depois E2E confiável e IdP. `OPEN / NO_GO`.
- AUD-0579: a web exige token antes de tentar restaurar cookie válido. A mesma [SPEC T3](../02_spec/0144_trusted_operator_session_production.md) define recarga por cookie, expiração, logout e E2E em modo confiável; implementação aguarda revisão humana e D-09.
- O que/onde: `apps/web/src/auth/session.ts` depende de
  `__CVG_OPERATOR_BOOTSTRAP_TOKEN__` injetado.
- Como: Authorization Code + PKCE, sessão com cookie `HttpOnly`/`Secure`/
  `SameSite`, logout e expiração.
- Pronto: E2E de login, expiração e logout em staging.

### PR-303 — Cofre de segredos e rotação · P0 · OPS + SPEC+BUILD

- O que: keyrings de identidade e rate limit, segredo de webhook, credenciais
  do banco e do provider.
- Pronto: nenhum segredo em env file ou imagem; rotação de cada segredo
  exercitada em staging sem downtime; runbook de rotação.

### PR-304 — Borda endurecida · P1 · OPS

- O que: TLS ponta a ponta (incluindo PostgreSQL), `API_REQUIRE_HTTPS=true`,
  CORS com allowlist de produção, proxies confiáveis corretos, WAF e limites
  de payload.
- Pronto: varredura de configuração TLS sem achado alto; testes de CORS e
  HTTPS em staging.

### PR-305 — Supply chain de release · P1 · SPEC+BUILD

- Como: assinatura de imagem (cosign), SBOM e proveniência anexados à
  release, atualização automática de dependências com revisão.
- Pronto: deploy recusa imagem sem assinatura válida.

### PR-306 — Threat model para integrações reais · P1 · DOC

- Estado: `DOCUMENTED_LOCAL / FACT_CHECK_ACCEPTED` em 27/09/2026.
  O [modelo de ameaças](../10_phase10/PHASE10_THREAT_MODEL.md) agora vincula
  canal, provider, RAG, agenda, IdP/sessão e evidência de CI a controle,
  teste negativo existente e prova ainda necessária em staging. Ele
  diferencia explicitamente testes sintéticos de integração real e remove
  a aparência de risco P2 aceito. A crítica I1 encontrou quatro lacunas
  factuais corrigidas; I2 aceitou o inventário local. Produção `NO_GO`.
- O que/onde: atualizar `docs/10_phase10/PHASE10_THREAT_MODEL.md` com canal,
  provider, RAG, agenda e IdP (prompt injection, exfiltração por ferramenta,
  spoofing de webhook, abuso de custo).
- Pronto: cada ameaça com controle e teste associado.

### PR-307 — Pentest externo · P0 · OPS

- Dependência: F5 em staging.
- Pronto: relatório sem crítico/alto aberto; médios com plano.

## F4 — Dados, privacidade e LGPD

### PR-401 — Inventário de dados pessoais da plataforma (D-10) · P0 · DOC + HUMAN

- Estado em 27/09/2026: `INVENTORY_DRAFT / DPO_APPROVAL_PENDING`.
  [Inventário técnico](../platform/09-personal-data-inventory.md) e
  [modelo de RIPD](../platform/10-ripd-template.md) versionados com categorias
  de schema, fluxos e lacunas; crítica factual I4 `ACCEPT` após três correções
  iterativas; links, higiene e formato PASS. Nenhum
  dado real foi inspecionado, base legal decidida ou aprovação DPO presumida.
- O que: mapear que dado pessoal a plataforma guarda por tabela, log,
  telemetria, provider e canal (remetente, texto de mensagem, identidade de
  operador), independentemente do produto; cada produto consumidor declara
  as categorias que traz e a base legal. Tabelas do legado (jornadas) entram
  como `LEGACY` até a remoção.
- Pronto: inventário versionado; modelo de RIPD para produtos consumidores
  aprovado pelo DPO.

### PR-402 — Retenção e descarte aplicados · P0 · SPEC+BUILD

- Subfatia de autenticação PR-301/402: [SPEC 0149](../02_spec/0149_operator_auth_purge.md) pronta para revisão humana (`I24 ACCEPT_SPEC_REVIEW_READY`). Após decisões DP-01 a DP-06 e aprovação T3, fechar o contrato de idade da família, implementar migration incremental, função com privilégio mínimo, job isolado, telemetria, teste de concorrência/retorno de backup e E2E. A migration atual não apaga states não consumidos nem sessões expiradas; não confundir expiração lógica com descarte físico.
- O que: POL-EVIDENCE-001 registrada e não aplicada; não há retenção de
  dados operacionais.
- Pronto: jobs de expurgo com teste; retenção por categoria configurada;
  evidência de execução em staging.

### PR-403 — Minimização antes do provider e nos logs · P0 · SPEC+BUILD

- Como: redação/pseudonimização de PII antes do provider quando a finalidade
  permitir; logs e telemetria sem PII; teste negativo em CI com dados
  fictícios.
- Pronto: teste prova que CPF, telefone, e-mail e texto livre fictícios não
  chegam ao provider nem aos logs.

### PR-404 — Direitos do titular · P1 · SPEC+BUILD

- Pronto: acesso, correção e eliminação por titular, com registro em
  auditoria e prazo operacional definido.

### PR-405 — RLS obrigatório e roles separadas · P0 · SPEC+BUILD

- O que/onde: `POSTGRES_RLS_ENFORCEMENT` é `false` por padrão e só o worker
  de homologação exige `true`.
- Pronto: API e worker abortam em produção sem RLS; role de migração
  separada da role de aplicação; teste de isolamento entre tenants em
  staging.

### PR-406 — Backup, PITR, RPO e RTO · P0 · OPS

- Pronto: PITR gerenciado; RPO/RTO aprovados; restore exercitado em staging
  dentro do RTO, com evidência.

### PR-407 — Contratos, DPO e plano de incidente · P0 · HUMAN + DOC

- Pronto: DPA com provider, canal e nuvem; encarregado nomeado; plano de
  resposta a incidente com comunicação à ANPD e aos titulares conforme a
  regulamentação vigente.

## F5 — Integrações reais controladas

### PR-501 — Provider de LLM real no worker · P0 · PRD + SPEC+BUILD

- O que/onde: `apps/worker/src/kernel-composition.ts` compõe
  `DeterministicModelProvider`; o gateway `openai-compatible` existe, mas não
  é usado.
- Como: composição atrás de flag, com orçamento, circuit breaker, timeout e
  fallback para handoff; prompt versionado no registry; custo por turno
  medido.
- Dependência: PR-104, PR-204, PR-303, PR-403.
- Pronto: staging com dados sintéticos; falha do provider sempre gera
  handoff; custo e latência dentro das metas.

### PR-502 — Evals de produção e red team · P0 · SPEC+BUILD

- Como: golden set por intenção liberada, casos de prompt injection, pedido
  de ação proibida, pedido sem fonte; barra mínima definida na SPEC.
- Pronto: `test:evals` com provider real em staging acima da barra; gate de
  regressão antes de trocar modelo ou prompt.

### PR-503 — Canal real no worker (RA26-09) · P0 · PRD + SPEC+BUILD

- Como: adapter escolhido em D-06 instanciado atrás de flag; webhook assinado
  com replay fencing; idempotência e effect journal durável; lista de
  contatos permitidos no piloto.
- Dependência: PR-105, PR-303.
- Pronto: mensagens ponta a ponta em staging com número de teste;
  duplicidade e reentrega provadas sem efeito duplicado.

### PR-504 — Conhecimento com fonte aprovada (RA26-10) · P1 · PRD + SPEC+BUILD

- Achado PR-306: sem evidência aprovada, a conversa atual emite texto de
  indisponibilidade e permanece `ACTIVE`; o handoff exigido abaixo ainda
  precisa de teste e implementação no caminho publicado. O catálogo local
  não vincula conteúdo a aprovador/hash institucional.
- Pronto: resposta só com fonte publicada e citada; fonte revogada bloqueia;
  ausência de fonte gera handoff.

### PR-505 — Efeito externo genérico com rascunho e approval · P1 · PRD + SPEC+BUILD

- Achado PR-306: validação e tamanho do input de tool não restringem destino
  externo. A SPEC deve incluir allowlist de egress por capability/tenant e
  teste negativo de tool que tenta enviar segredo a domínio não permitido.
- O que: a plataforma oferece aos produtos um padrão único para efeitos em
  sistemas externos (leitura livre; escrita sempre como rascunho com approval
  humano, idempotência e effect journal). Substitui o fluxo de agenda da
  secretária, que é legado (PR-L04).
- Pronto: teste negativo prova que nenhum efeito de escrita externo ocorre
  sem approval; exemplo de uso no fluxo de referência neutro (PR-L07).

### PR-506 — Handoff humano operacional · P0 · SPEC+BUILD

- Pronto: fila com SLA, notificação ao operador, takeover na UI, retorno ao
  agente; métricas de tempo até atendimento.

### PR-507 — Kill switch e modo degradado · P0 · SPEC+BUILD

- Pronto: desligamento global, por tenant e por capacidade em menos de 1
  minuto, sem deploy; modo degradado só com handoff; drill registrado.

## F6 — Infraestrutura e operação

### PR-601 — Infraestrutura como código (D-08) · P0 · OPS

- O que/onde: `deploy/` só contém `nginx.web.conf`.
- Pronto: dev, staging e produção criados por IaC revisado; nenhum recurso
  manual.

### PR-602 — Entrega contínua por digest · P0 · OPS

- Pronto: build único, promoção do mesmo digest entre ambientes, aprovação
  manual para produção, rollback em um comando testado.

### PR-603 — Migrações no pipeline · P1 · OPS

- Pronto: migrações com role dedicada, compatibilidade expand/contract,
  rollback documentado; `POSTGRES_AUTO_MIGRATE` desligado em produção.

### PR-604 — Observabilidade de produção · P0 · OPS + SPEC+BUILD

- Como: exportar OpenTelemetry para backend gerenciado; dashboards de API,
  worker, outbox, provider, canal e custo; alertas com dono.
- Pronto: SLOs de disponibilidade, latência, taxa de handoff, erro de
  provider e custo com alertas testados.

### PR-605 — Runbooks e on-call · P0 · DOC + OPS

- O que/onde: `docs/runbooks/` tem apenas dois runbooks de homologação.
- Pronto: runbooks de incidente, provider fora, canal fora, rotação de
  segredo, restore, kill switch e vazamento de dados; escala de on-call
  definida.

### PR-606 — Carga e soak em staging · P1 · OPS

- Pronto: perfil do piloto × 3 por 24 h dentro do SLO; capacity planning
  registrado.

### PR-607 — Drill de DR · P1 · OPS

- Pronto: perda de banco e de região simuladas em staging, dentro de RPO/RTO.

### PR-608 — Suporte e comunicação · P2 · DOC

- Pronto: canal de suporte, página de status e modelo de comunicação de
  incidente.

## F7 — Homologação, piloto e GA

### PR-701 — Staging completo com E2E da jornada de referência · P0 · OPS + SPEC+BUILD

- Pronto: jornada completa do fluxo de referência neutro (canal → agente →
  approval/handoff → resposta) em staging com dados sintéticos, automatizada,
  sem nenhum componente de `legacy/`.

### PR-702 — UAT e treinamento de operadores · P0 · HUMAN

- Pronto: roteiro de UAT do primeiro produto consumidor aprovado; operadores
  treinados; manual de uso da console do harness.

### PR-703 — Auditoria independente pré-piloto · P0 · AUDIT

- Pronto: auditoria de segurança, LGPD e aderência PRD/SPEC com evidência
  executável, conforme as regras de AUDIT da constituição.

### PR-704 — Go/no-go do piloto (D-14) · P0 · HUMAN

- Pronto: decisão registrada com hash do candidato, da configuração e do
  escopo.

### PR-705 — Piloto controlado · P0 · OPS

- Escopo: primeiro produto consumidor, um tenant, contatos permitidos,
  horário de operação com humano, approval em 100% das ações sensíveis,
  hypercare diário.
- Pronto: critérios de saída do roadmap 0355 atingidos por duas semanas.

### PR-706 — Avaliação do piloto · P0 · AUDIT

- Pronto: relatório com métricas, incidentes, feedback e backlog de
  correções priorizado.

### PR-707 — Go/no-go da produção controlada (D-15) · P0 · HUMAN

- Pronto: decisão registrada; plano de expansão aprovado.

### PR-708 — Expansão gradual por tenant · P1 · OPS

- Pronto: cada novo tenant com checklist de onboarding, RIPD revisado e
  janela de hypercare.

### PR-709 — Auditoria de 30 dias pós-GA · P1 · AUDIT

- Pronto: SLOs, custo, incidentes e qualidade revisados; roadmap seguinte
  proposto.

## Resumo

| Fase      | Tasks        | P0     | P1     | P2    |
| --------- | ------------ | ------ | ------ | ----- |
| F0        | PR-001 a 012 | 7      | 2      | 3     |
| FL        | PR-L01 a L12 | 7      | 4      | 1     |
| F1        | PR-101 a 109 | 8      | 1      | 0     |
| F2        | PR-201 a 208 | 1      | 4      | 3     |
| F3        | PR-301 a 307 | 4      | 3      | 0     |
| F4        | PR-401 a 407 | 6      | 1      | 0     |
| F5        | PR-501 a 507 | 5      | 2      | 0     |
| F6        | PR-601 a 608 | 4      | 3      | 1     |
| F7        | PR-701 a 709 | 7      | 2      | 0     |
| **Total** | **79**       | **49** | **22** | **8** |
