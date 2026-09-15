# AAA-41 Phase 4 CAPABILITY BOUNDARY — evidence and certification closure — 2026-09-15T10:25:18-03:00

- id: `CVG-PHASE4-CAPABILITY-BOUNDARY` / `AAA-41`
- status: `IN_PROGRESS_CONTROLLED_AUDIT`; owner: `cvg-operational-harness`;
  production `NO_GO`.
- acceptance closure: neutral registry and governed public Runtime path are
  implemented; recursive authority-spoof rejection, exact-version/negative
  safety, provider swap, origin parity, concurrency, public conformance,
  durable worker/approval PostgreSQL recovery, fresh-pool replay, and
  uncertain-effect evidence are covered by current regressions. Archived
  `.gauntlet-*` state is outside the candidate scope.
- verification so far: focused `4/41`; full unit `258/1,811/115`; PostgreSQL
  `27/200/0`; typecheck/lint/build PASS.
- certification: final catalog passed all required gates except repository-wide
  `format` (440 brownfield files); generated hashes and decision are coherent
  and production remains `NO_GO`.
- remaining: finish the controlled Gauntlet at `CONDITIONAL_PASS`; the fresh
  critics did not return a report, so no unconditional approval is claimed.
- limits: synthetic/disposable local only; no real provider, channel, MCP
  network, credential, patient/financial data, sensitive action, deploy or
  production release.

# AAA-31 Phase 3 RUNTIME-V2 — iterative governed agent loop — 2026-09-15

- status: `AUDIT_COMPLETE_CONTROLLED / CONDITIONAL_PASS`; independent critic
  round 6 `APPROVE`; owner: `cvg-operational-harness`; production `NO_GO`.
- scope: Runtime V2 iterative loop over the Phase 2 durable execution spine;
  hybrid orchestrator, context engine, completion/sufficiency evaluation,
  durable step checkpoints, budgets, loop detection, pause/resume, grounding,
  trajectory export, and synthetic operational/knowledge certification.
- acceptance: multi-step loop, semantic replan, tool chain, durable
  WAITING_USER and WAITING_APPROVAL, checkpoint restart, effect safety, budget
  stops, loop detection, mid-loop policy denial, zero unauthorized/duplicate
  effects, tenant isolation, Runtime V1 compatibility.
- delivered: contracts, runtime, orchestrator, context engine, evaluators,
  migration `0019`, PostgreSQL step store, worker/API integration, evals,
  demo/verify commands, docs and evidence.
- verification: 256 files / 1,785 passed / 111 skipped; PostgreSQL 26/196/0;
  E2E 6/6; evals 10/10; static gates PASS.
- next_action: Phase 4 Skill Runtime + Capability Composition (or Phase 4A
  Conversational Intelligence Layer) under a new gate.
- limits: synthetic/controlled only; no real data/provider/channel/RAG/
  deploy/external effect.

# AAA-21-R4 — controlled vertical-effect repair audited — 2026-09-14

- status: `AUDIT_COMPLETE_CONTROLLED / FINAL_CRITIC_BLOCKED_NO_REPORT`; owner:
  `cvg-operational-harness`; mode: controlled BUILD + independent AUDIT;
  production `NO_GO`.
- scope: guarded synthetic phase-2 tool through the public operational worker,
  PostgreSQL effect-journal confirmation/replay, HTTP/status evidence, and
  bounded `demo:phase2`/`verify:phase2` commands.
- dependency: `AAA-21-R3`, frozen `docs/phase2/QUALITY_BAR.md`, and the R4
  contract in `docs/phase2/TASK.md`/`PRD.md`/`SPEC.md`.
- acceptance: one durable `CONFIRMED` journal authority, no duplicate
  synthetic invocation on replay, fail-closed production/config guards, and
  focused/full/static/evidence checks with environment blockers explicit.
- delivered: R4 memory and PostgreSQL vertical proofs, one confirmed journal
  authority, replay without a second invocation, fail-closed guards, and
  bounded `demo:phase2`/`verify:phase2` commands.
- verification: focused `5/31`, full `250/1,727/110`, E2E `6/6`, and
  PostgreSQL `24/190/0`; static/build/evidence gates passed.
- current_result: `CONDITIONAL_PASS`; fresh R4 critic returned no report within
  its bounded window and the matching mutation sentinel is recorded.
- next_action: finish the Gauntlet; retain R3's controlled D4/D5 evidence and
  all production/real-effect blocks.

# AAA-21-R3 — controlled restart/fault proof complete — 2026-09-14

- status: `AUDIT_COMPLETE_CONTROLLED / FINAL_CRITIC_PENDING`; owner:
  `cvg-operational-harness`; mode: controlled BUILD + independent AUDIT.
- delivered: post-claim fault hook, production/unknown-value fail-closed
  guards, bounded worker idle/poll controls, and a real two-child disposable
  PostgreSQL restart/reclaim proof with attempt/fence/event/effect assertions.
- verification: R3 integration `1/1`; PostgreSQL `23 files / 189 tests / 0
skips`; full regression `249 files / 1,724 passed / 109 skipped`; E2E `6/6`;
  typecheck/lint/build/evals/startup smoke PASS.
- current_result: `CONDITIONAL_PASS` pending the final fresh critic; D4/D5 are
  proven only for the controlled disposable-PostgreSQL empty-tool harness;
  production remains `NO_GO`.
- blockers: no external-provider exactly-once proof, global 430-file
  brownfield formatting drift, and Node 24 versus Node 22 target remain
  documented limitations.
- next_action: commission the final fresh read-only critic, record the bounded
  outcome, finish the Gauntlet, and do not promote to production or real
  effects.
- evidence: `docs/phase2/evidence/AAA-21-R3_PROCESS_RESTART.json`,
  `docs/phase2/PHASE_2_RESULT.json`, `docs/phase2/evidence/FINAL_SENTINEL.json`.

# AAA-21-R3 — durability proof task opened — 2026-09-14

- status: `SUPERSEDED_BY_AUDIT_ENTRY_ABOVE`; owner: `cvg-operational-harness`;
  mode: controlled BUILD + independent AUDIT.
- scope: satisfy the original Phase 2 restart/fault requirements with a
  test-only post-claim child-process interruption, real PostgreSQL lease
  recovery, and competing-worker proof; no external effects.
- acceptance: `docs/phase2/TASK.md` R3 acceptance, including process identity,
  attempt/fence, recovery event, one terminal outcome/effect authority,
  production fail-closed behavior, and focused/full regression evidence.
- next_action: completed by the audit entry above; only final critic and
  publication bookkeeping remain; retain `NO_GO`.
- evidence: `docs/phase2/TASK.md`, `docs/phase2/SPEC.md`,
  `docs/phase2/QUALITY_BAR.json`.

# AAA-21-R2 — final controlled backlog status — 2026-09-14

- status: `REVIEW`; owner: `cvg-operational-harness`; mode: controlled BUILD +
  independent AUDIT.
- delivered: bounded retry/dead-letter, tenant/auth-scoped safe cancellation,
  neutral worker concurrency and graceful stop, fail-closed execution
  invariants, queue mutation guards, operational PostgreSQL preflight, focused
  tests, full regression, E2E, disposable PostgreSQL D3 evidence, and a
  least-privilege role/worker proof.
- current_result: `CONDITIONAL_PASS`; focused `8/45`, full `249/1,720/108`,
  E2E `6/6`, PostgreSQL `22/188/0`; sentinel `MATCH`. The four fresh critic
  attempts returned no report, so this item is not promoted to `DONE`.
- blockers: frozen `P2-CRITIC` report unavailable, D4/D5 not proven, global
  formatting debt and Node-target mismatch remain; production and real effects
  stay `NO_GO`.
- next_action: commission a responsive fresh critic, then reassess the
  quality-bar verdict and separately execute D4/D5 when authorized.
- evidence: `docs/phase2/PHASE_2_RESULT.json`,
  `docs/phase2/evidence/EVIDENCE_MANIFEST.json`,
  `docs/phase2/evidence/FINAL_SENTINEL.json`.

# AAA-21-R2 — controlled repair task — 2026-09-14

- status: `IN_PROGRESS`; owner: `cvg-operational-harness`; mode: controlled
  BUILD + independent AUDIT.
- scope: bounded retry/dead-letter, safe tenant/auth-scoped cancellation,
  neutral worker concurrency and graceful stop, state invariants, focused
  HTTP/worker/failure tests, and evidence refresh.
- dependencies: `AAA-21-R1`, `docs/phase2/TASK.md`, `SPEC.md`, and frozen
  `QUALITY_BAR.md`.
- acceptance: R2 acceptance in `docs/phase2/TASK.md`; live PostgreSQL,
  process restart, RLS and D3–D5 remain environment-gated and cannot be
  inferred from memory tests.
- next_action: implement only the registered neutral controlled slice; keep
  `PHASE_2_RESULT.json`/production `NO_GO` until fresh audit integration.

# AAA-21-R1 — durable approval pause/resume repair — 2026-09-13

- status: `AUDIT_COMPLETE_CONTROLLED / FINAL_CRITIC_PENDING`; owner: `cvg-operational-harness`; mode: controlled BUILD with independent AUDIT.
- objective: bind `WAITING_APPROVAL` to the existing durable approval authority, expose authenticated decision/resume, and preserve tenant/policy/effect-journal invariants across restart-equivalent processing.
- acceptance: registered in `docs/phase2/TASK.md`; no production or real-effect authorization; PostgreSQL D3–D5 remains mandatory before any release verdict.
- next_action: record the fresh critic verdict; then obtain live PostgreSQL D3–D5 evidence and address the existing baseline debt.
- evidence target: `docs/phase2/evidence/AAA-21-R1-*` plus updated phase2 report/manifest after audit.

# AAA-21-PHASE2-DURABLE-EXECUTION-SPINE — final backlog status — 2026-09-13

- status: `FAIL / REPAIR_REQUIRED`; owner: `cvg-operational-harness`; mode: controlled BUILD + independent AUDIT completed.
- delivered: neutral HTTP submission, identity/idempotency, queue/outbox adapter, worker claim/recovery/heartbeat/fence token, public factory, synthetic effect journal, SQL migration/RLS shape, causal execution audit payload, reports and evidence sentinel.
- blockers: authenticated durable approval pause/resume; real PostgreSQL migration/RLS/grant/restart/concurrency/fault proof; fresh approval critic after repair; global baseline debt remains.
- next_action: register a new repair task under the CVG pipeline; no `DONE`, production release, or sensitive action is authorized by this entry.
- evidence: `docs/phase2/PHASE_2_RESULT.json` (`FAIL`), `docs/phase2/PRODUCTION_READINESS_MATRIX.md` (`NO_GO`), `docs/phase2/evidence/FINAL_SENTINEL.json` (`MATCH` consistency only).

# AAA-21-PHASE2-DURABLE-EXECUTION-SPINE — Phase 2 backlog item — 2026-09-13

- status: `IN_PROGRESS`; owner: `cvg-operational-harness`; mode: controlled BUILD + independent AUDIT.
- scope: canonical neutral HTTP submission, durable execution identity/state/queue, lease-fenced worker, public `createOperationalHarness` invocation, governed Runtime V1 outcome, audit/telemetry/effect evidence.
- dependencies: Phase 0/1 neutral packages; pre-flight and frozen quality bar in `docs/phase2/`.
- acceptance: `docs/phase2/QUALITY_BAR.md`; production remains `NO_GO` regardless of local result.
- next_action: implement the neutral execution-spine contract and in-memory proof; then integrate PostgreSQL/API/worker and execute the frozen audit matrix.
- limits: no real data/provider/channel/effect, no RAG/MCP/V2 loop, no deploy, no production release; PostgreSQL currently environment-blocked.

# REF-20260913-PHASE-0-1 — CVG Operational Harness Phase 0/1 — 2026-09-13

- status: `IN_PROGRESS`; stage `BUILD` controlado; origem: master prompt anexado + `docs/harness-audit/`.
- acceptance: baseline/provenance/identity; neutral contracts; canonical factory; explicit orchestrator; governed single-pass Runtime V1; tool/policy/approval/model/audit/observability/state/knowledge/channel boundaries; dependency-direction tests; basic demo; docs/ADRs/report; no external effects.
- gate: `SPEC_APPROVED_CONTROLLED_BUILD` em `docs/02_spec/0127_harness_refoundation.md`; Discovery/PRD gates específicos em `docs/00_discovery/0016_harness_refoundation.md` e `docs/01_prd/0027_harness_refoundation.md`.
- evidence: `docs/refoundation/BASELINE_FREEZE.md`, `BASELINE.json`, `QUALITY_BAR.json`, `PHASE_0_1_TASK.md`, `PACKAGE_CLASSIFICATION.md`.
- progress: contracts, descriptor-safe orchestrator, governed factory/runtime, bounded deadlines, demo, architecture tests, identity, provenance, package classification, architecture docs and ADRs implemented; focused `13/13`, typecheck/lint/build/evals and isolated package build PASS; full test delta recorded.
- status: `CONDITIONAL_PASS`; report published at `docs/refoundation/PHASE_0_1_REPORT.md`; score `7.0/10`; production `NO-GO`.
- next_action: open separately gated `PHASE-2/AAA-21` for durable HTTP→SQL→worker→runtime composition, then obtain a complete fresh post-fix audit.
- limits: `AAA-21` continua lane separada; produção, dados reais, canais/providers, Docker, RAG institucional e ações sensíveis continuam `NO-GO`.

# PROD-20260913 — rodada 4 — 2026-09-13

- D02 (draft-only), D03 (alvos de laboratório), D04 (integrações reais bloqueadas), D05-3/4 (retenção/TTL aprovados) registradas; D05-SIG adiada. [Pacote](../02_spec/prod20260913_decision_packet.md).
- **PROD-04 `VERIFIED`**: ApprovalStore durável com CAS SQL sob FOR UPDATE, migration 0015, revisão fresca PASS; gates 248 arquivos/1.775 testes/0 skips e PostgreSQL 20/174/0.
- Próxima ação: AAA-21 (fronteira/composição HTTP→SQL→worker→kernel→efeito falso→audit), depois PROD-07/08/09. D04=A mantém AAA-37/38/39 bloqueados; produção NO-GO. [Relatório](../04_audit/0563_prod_round3_2026-09-13.md).

# PROD-20260913 — rodada 3 — 2026-09-13

- M1 encerrado com crítico fresco **PASS**; D01 registrada (opção C); [contrato de composição v2](../02_spec/aaa_composition_contract.md) congelado; AAA-19/20 `VERIFIED`; WAVE3-01 P1 corrigido e verificado.
- `READY`: AAA-21 (composição) e PROD-04 (ApprovalStore durável; SPEC rota A + migration 0015). Próxima execução: PROD-04 → AAA-21 → PROD-07/08/09.
- Gates finais: 247 arquivos/1.764 testes/0 skips; PostgreSQL 19/163/0; typecheck/build/startup PASS. D02–D05 seguem PENDING; produção NO-GO. [Relatório](../04_audit/0563_prod_round3_2026-09-13.md).

# PROD-20260913 — reauditoria M1 round2 — 13/09/2026

- status: `WAITING_HUMAN_APPROVAL` para D01–D05; lote técnico com revisão `CONDITIONAL PASS`, produto `NO-GO`.
- last_completed_action: oito achados reproduzidos (seis P1/dois P2) corrigidos; readiness, sessão/formulário, tarefa+audit/replay, cleanup e preflight. Regressão independente:69 testes e77 perturbações de grants; sentinel2.659 arquivos limpo. Qualificação Node22: npm test1.645 passes/88 skips condicionais; cobertura1.733 testes sem skips, PostgreSQL163 sem skips, typecheck/lint/build/startup e E2E6/6; npm ci + build limpo PASS.
- next_action: obter revisão com contexto novo para fechar M1; registrar D01 no pacote de decisões para iniciar ADR/PROD-04/AAA-06/21. Preparar contratos PROD-07/08/09 conforme dependências; seguir D03–D05 para operação/homologação/release.
- Tarefas PROD-02/03/05/06 e AAA-22: `REVIEW`; histórico VERIFIED anterior preservado, não promovido nos bytes novos. PROD-14: `REVIEW`, pacote preparado, decisões PENDING.
- [Relatório atual](04_audit/0562_prod_m1_reaudit_2026-09-13.md), [pacote D01–D05](02_spec/prod20260913_decision_packet.md), [evidência](04_audit/evidence/PROD-20260913/reaudit-round2/manifest.json).
- Limites: crítico final independente dos builders mas sem contexto totalmente novo; Docker sem permissão, nenhum restore físico/SLO aprovado/mutação integral/holdout/homologação/signoff novo. Nenhuma nota global AAA/State of Art. O baseline2525/2531 do registro anterior era pré-BUILD M1.

# PROD-20260913 — execução do lote M1 — 2026-09-13

- [Contrato M1](../02_spec/prod20260913_m1_corrections_contract.md) congelado `7cff313d…`; [PROD-01](04_audit/evidence/PROD-20260913/PROD-01/manifest.json) revalidou o baseline (0 fontes de produto alteradas vs auditoria) e o mapa 80/80+156/156.
- `VERIFIED` no [delta](03_build/tracking/production_delta_backlog.json): PROD-01/02/03/05/06, com [revisão](../04_audit/evidence/PROD-20260913/independent-review/REVIEW.md), [resposta](../04_audit/evidence/PROD-20260913/independent-review/RESPONSE.md) e [revalidação](../04_audit/evidence/PROD-20260913/independent-review/revalidation.md) independentes. PROD-04 `BLOCKED` por D01/AAA-06. AAA-22 segue `REVIEW` (D13-04 verificado; composição consumer pendente).
- Próximos passos: `PROD-14` (decisões D01–D05), `PROD-04` após D01, `PROD-07/08/09` (console/jornadas) e comprovação de composição AAA-06/21. Nenhuma capacidade real ou autorização de produção foi criada.

# PLAN-PROD-20260913 — plano para produção — 2026-09-13

- Entrega de planejamento `COMPLETED`. [Backlog consolidado](BACKLOG_PRODUCAO.md): 42 IDs AAA existentes + 14 IDs PROD complementares. Status AAA preservados no JSON existente; status PROD no [JSON delta](03_build/tracking/production_delta_backlog.json). Pré-requisitos novos de fechamento são cumulativos, sem renumerar histórico.
- Cobertura planejada: D13-01..09, A01..20, 80 critérios e 156 linhas de requisitos identificados. Mapeamento não é prova de implementação. [Plano](PLANO_EXECUTIVO_PRODUCAO.md), [roadmap](ROADMAP_PRODUCAO.md), [validação](04_audit/evidence/PLAN-PROD-20260913/validation.json).
- `next_action`: PROD-01 — revalidar candidato e preparar contratos/revisão das correções P1; conferir autorização aplicável antes de código. Programa PLANNED; nenhum BUILD/qualificação/release concedido por estes documentos.

# AUD-20260913-DOCS — comparação docs × implementação — 2026-09-13

- Task de auditoria: `COMPLETED`; artefato canônico [relatório 0560](04_audit/0560_docs_implementation_audit_2026-09-13.md). Código preservado; sem BUILD ou gate de produção concedido.
- Achados novos/atuais D13-01..09 registrados no relatório com fonte, prioridade, responsável sugerido e aceite. D13-01 atomicidade SQL e D13-02 estado UI: P1, pendentes de correção revisada. D13-03 composição/D01, D13-04 readiness e D13-05 ApprovalStore durável permanecem impeditivos da qualificação integrada.
- `next_action`: registrar/revisar task de correção D13-01 (mutação de jornada + audit na mesma transação), incluindo reprodução preservada e teste rollback/replay; executar BUILD somente no gate aplicável. D13-02 é frente independente possível. Tasks AAA não recebem DONE por esta auditoria.
- Nota61/100; produção20/100 e NO-GO. Evidências e limites no relatório; não herdar o PASS histórico de P1 para código posterior.

# AAA-20260912 — próxima tarefa do Agente 3

- status: `IN_PROGRESS`; last_completed_action: verificação isolada da imagem runtime Node22 registrada em AAA-14, ainda REVIEW; nenhum resultado novo de imagem alegado.
- next_action: **Agente 3 / imagem runtime AAA-14**, [prompt](04_audit/evidence/AAA/AAA-14/runtime-image-assignment/next-task-agent-3.md). Build explícito target runtime, instalação prod-only e smoke sintético; se Docker indisponível, preservar bloqueio sem equiparar fallback à imagem. Evidências somente, sem alterar produto/publicar imagem.
- coordenação: Agente 1 mantém cobertura crítica AAA-07; Agente 2 mantém mutação dirigida AAA-12. Ensaio AAA-13 aprovado permanece histórico daquele snapshot; sem full certify novo ou gates/DONE concedidos.

# AAA-20260912 — próxima tarefa do Agente 2

- status: `IN_PROGRESS`; last_completed_action: tarefa de mutação dirigida AAA-12 registrada após cobertura aprovada; seleção deve ser congelada antes da execução, conforme AAA-04 v2 §9.1.
- next_action: **Agente 2 / guards críticos do canal**, [prompt](04_audit/evidence/AAA/AAA-12/mutation-assignment/next-task-agent-2.md). Mutantes somente em cópia isolada; origem permite testes/evidências próprios. Nenhum resultado de mutação ainda medido ou aprovado.
- coordenação: Agente 1 mantém cobertura crítica AAA-07; Agente 3 aguarda atribuição. AAA-12 REVIEW, sem DONE/G_QUALITY/SQL/AAA-21; não repetir cobertura já aceita como tarefa nova.

# AAA-20260912 — auditoria das três entregas / próxima ação única — 2026-09-12

- status: `IN_PROGRESS`; last_completed_action: AAA-07 C6-F01/F02 fechados; AAA-12 subset/branches críticos medidos aprovados; AAA-13 ensaio isolado aprovado. Três tasks em REVIEW, sem DONE. [Parecer](04_audit/evidence/AAA/coordinator-batch-review/REVIEW.md).
- evidência independente: hashes AAA07 3/3, testes canal4/4+pinados14/14, ensaio52/52; approval+canal153 PASS; canal isolado105 PASS e coverage98,39/96,18/96,11/99,61; probe C6 exit0; verifier do snapshot exit0/27hashes. Full certify e suites globais não reexecutados.
- next_action: **somente Agente 1 / cobertura crítica AAA-07**, [prompt](04_audit/evidence/AAA/coordinator-batch-review/next-task-agent-1.md). Agentes 2/3 aguardam atribuição do coordenador, sem repetir entregas aceitas nem iniciar outra task. AAA-09 não iniciada.
- limites: shared-before/after têm metadados diferentes, linhas de hashes iguais. Snapshot Node24 não qualifica árvore atual/Node22 alvo. Cobertura global/mutação/durabilidade/composição/gates externos continuam pendentes; nenhum gate de produção ou G_QUALITY concedido.

# AAA-20260912 — aceite AAA12-C4-F01 / cobertura do canal — 2026-09-12

- status: `IN_PROGRESS`; last_completed_action: C4-F01 fechado independentemente; 14 hashes/digest 70311445… conferidos, canal 7/57 PASS; probe de 6 versões rejeita sem alterar bytes/permitir claim. AAA-12 **REVIEW**, sem DONE.
- next_action: somente **Agente 2 / cobertura comportamental AAA-12**, [prompt](04_audit/evidence/AAA/AAA-12/review-coordinator-c4/next-task-agent-2.md), testes/evidências próprios e código do produto preservado. Frentes 1/3 mantidas.
- evidência: [parecer](04_audit/evidence/AAA/AAA-12/review-coordinator-c4/REVIEW.md), checks/logs/probe adjacentes. Subset functions 79,61% FAIL e branches críticos abaixo da barra permanecem abertos; PASS global não compensa. Coverage e suites globais não reexecutados nesta auditoria focada.
- limites: sem SQL/migrations/AAA-21, durabilidade física, produção ou gate concedido; nenhum código do produto alterado pelo coordenador.

# AAA-20260912 — aceite AAA-13 R4 / ensaio isolado — 2026-09-12

- status: `IN_PROGRESS`; last_completed_action: R4 aprovado no recorte corrigido; C5-F01/F02 fechados, C3-F01 continua fechado. 3 hashes conferidos; 37/37 checks + R1/R2 do coordenador PASS (39/39 no harness estendido); histórico 27 hashes PASS. AAA-13 **REVIEW**, sem DONE/qualificação atual.
- next_action: somente **Agente 3 / ensaio integrado AAA-13**, [prompt](04_audit/evidence/AAA/AAA-13/review-coordinator-r4/next-task-agent-3.md). Full certify autorizado exclusivamente em cópia consistente/isolada com dependências sintéticas, seguido do verificador; sem editar produto/certificados compartilhados. Frentes 1/2 preservadas.
- evidência: [parecer](04_audit/evidence/AAA/AAA-13/review-coordinator-r4/REVIEW.md), hashes/logs/reprodução adjacentes. 37 checks incluem 9 helpers e 28 CLI; C0 sintético não comprova integração do produtor completo. Chaos obrigatório conferido com suíte real.
- limites: full certify, suites globais, Docker e benchmark não executados nesta auditoria. Nenhuma autoridade de produção, signoff ou G_QUALITY inferida. Débitos declarados dos demais parsers permanecem registrados.

# AAA-20260912 — auditoria AAA-07 lifecycle — 2026-09-12

- status: `IN_PROGRESS`; last_completed_action: 4 hashes conferidos e pacote 4/42 PASS. AAA-07 **REWORK** por AAA07-C6-F01/F02 P1: sweep antigo modifica reserva nova; token liberado pode ser reutilizado para EXECUTING. Probes públicos sintéticos, zero efeitos.
- next_action: somente **Agente 1 / fencing entre gerações AAA-07**, [prompt](04_audit/evidence/AAA/AAA-07/review-coordinator/next-task-agent-1.md). AAA-09 aguarda correção revisada. Frentes 2/3 preservadas.
- evidência: [parecer](04_audit/evidence/AAA/AAA-07/review-coordinator/REVIEW.md), hashes/logs/probe no mesmo diretório. Suítes globais do executor não reexecutadas nesta revisão; coverage crítica 84,48% abaixo da barra congelada 95%, sem dispensa. Store local não prova durabilidade.
- limites: nenhum código de produto ou artefato antigo alterado pelo coordenador; sem SQL/ação real/commit/push/deploy, gate ou DONE.

# AAA-20260912 — auditoria AAA-13 rework R3 — 2026-09-12

- status: `IN_PROGRESS`; last_completed_action: três hashes conferidos, self-test 19/19 PASS, histórico 27 hashes PASS. AAA13-C3-F01 fechado no recorte de evidência ausente.
- AAA-13: **REWORK** por AAA13-C5-F01/F02 P1. CLI público aceita coverage sem pct e chaos com 14 assertions skipped; ambos exit 0 sem failures em fixtures isoladas. [Parecer](04_audit/evidence/AAA/AAA-13/review-coordinator-rework-r3/REVIEW.md).
- next_action: somente **Agente 3 / validação dos resultados brutos AAA-13**, [prompt](04_audit/evidence/AAA/AAA-13/review-coordinator-rework-r3/next-task-agent-3.md). Frentes 1/2 e locks preservados. Nova hipótese com RED executado, sem relaxar barra/limite de tentativas.
- limites: nenhum produto/certificado compartilhado alterado nesta revisão; full certify, Docker e suites globais não executados. Nenhum gate, DONE ou qualificação atual concedido.

# AAA-20260912 — auditoria AAA-12 canonicalização/versionamento — 2026-09-12

- status: `IN_PROGRESS`; last_completed_action: candidato 8d49cb2a… conferido (13 hashes/digest), regressão canal 6/51 PASS. Core canonicalização corrigido; **AAA-12 REWORK** por AAA12-C4-F01 P2: versão explícita malformada interpretada como legado permite reserva/mutação/claim na API pública do journal com caller legado.
- next_action: somente **Agente 2 / AAA12-C4-F01**, [prompt](04_audit/evidence/AAA/AAA-12/review-coordinator-hash-version/next-task-agent-2.md). Corrigir ausência vs versão inválida, preservar bytes e provar falha fechada. Frentes 1/3 não redistribuídas.
- limites: gateway shared atual rejeita esses registros, sem envio externo na prova; subset coverage FAIL preservado, global PASS não o compensa. SQL/migrations/actor/AAA-21 continuam fora do recorte. Nenhum gate ou DONE concedido.
- evidência: [parecer](04_audit/evidence/AAA/AAA-12/review-coordinator-hash-version/REVIEW.md), probe/log/checks no mesmo diretório. Suites completas/PostgreSQL não reexecutadas na revisão focada; código do produto não alterado pelo coordenador.

# AAA-20260912 — aceite do rework AAA-08 / próximo AAA-07 — 2026-09-12

- status: `IN_PROGRESS`; last_completed_action: AAA08-C1-F01 fechado; correção funcional aprovada independentemente. Cinco hashes conferidos, 6 arquivos/62 testes PASS; probe de aceite DENY/action_capability_mismatch/0 nos três casos, exit 0. AAA-08 REVIEW de qualificação integral, sem DONE.
- contrato: AAA-03 rev2 + adendo AAA03-R-ACT-v1 aprovados e congelados tecnicamente por hash; AAA-03 VERIFIED documental. Coverage/qualificação integrada e negação de adapter real (AAA-09/T-19) não foram declaradas concluídas.
- next_action: somente **Agente 1 / AAA-07 lifecycle de aprovação local**, [prompt](04_audit/evidence/AAA/AAA-08/review-coordinator-rework/next-task-agent-1.md). Insumos AAA-03/04/05 disponíveis; READY restrito a fixture sintética/correção local, sem autoridade para SQL/BUILD real/produção. Outras frentes preservadas.
- evidência: [parecer](04_audit/evidence/AAA/AAA-08/review-coordinator-rework/REVIEW.md), checks/log/probe no mesmo diretório. Suíte global do autor mantida como histórica; sem reexecução de gates globais nesta auditoria focada, nenhum código de produto alterado pelo coordenador.

# AAA-20260912 — revisão independente AAA-05 v3 — 2026-09-12

- status: `IN_PROGRESS`; last_completed_action: v3 `cebeddab…` aprovada tecnicamente, **AAA-05 VERIFIED documental**, C2-F01/F02/F03 fechados no contrato. Congelamento técnico por hash registrado; nenhuma aprovação humana, SQL, produção ou DONE concedida.
- validação: hashes de artefatos e v1/v2 conferidos, patch reproduz bytes exatos da v3 em cópia descartável, prettier do contrato PASS; 12 hashes AAA-12 intactos. Gap de canonicalização de código permanece aberto; suíte produto não reexecutada para revisão documental.
- next_action: somente **Agente 2 / AAA-12 canonicalização e versão de hash**, [prompt](04_audit/evidence/AAA/AAA-05/review-coordinator-v3/next-task-agent-2.md). Recorte de rework local e locks registrados, sem SQL/migrations/composição. Agentes 1/3 preservam suas tarefas vigentes.
- evidência: [parecer](04_audit/evidence/AAA/AAA-05/review-coordinator-v3/REVIEW.md), checks.json e log de formato no mesmo diretório. Dependências/gates completos seguem exigidos para promoção; nenhuma autorização inferida por status.

# AAA-20260912 — auditoria do handoff Agente 3 — 2026-09-12

- status: `IN_PROGRESS`; last_completed_action: auditoria direta das quatro entregas. **AAA-13 REWORK**, AAA13-C3-F01 P1: CLI público qualificou fixture sem gates executados/logs/artefatos; N1–N9 passaram apesar do contraexemplo.
- AAA-04 v2: VERIFIED documental e congelamento técnico por hash, condições F01/F02 atendidas; nenhuma aprovação humana/G_SPEC/produção concedida. AAA-14: REVIEW, licenças isoladas 372/21 internos/0 bloqueadas; imagem NOT_RUN. AAA-15: REVIEW, prettier do arquivo PASS e equivalência AST completa revalidada; gate global pendente.
- next_action: somente **Agente 3 / rework AAA-13**, [prompt](04_audit/evidence/AAA/AAA-13/review-coordinator-r3/next-task-agent-3.md). Agentes 1/2 preservam AAA-08 e AAA-05 v3 respectivamente. Não iniciar full certify antes de correção revisada e janela estável.
- evidência: [parecer](04_audit/evidence/AAA/AAA-13/review-coordinator-r3/REVIEW.md), probe CLI isolado, hashes, logs de barra/licenças/histórico/AST no mesmo diretório. Docker, full certify, audit de rede atual e suites completas não reexecutados. Nenhum arquivo de produto/certificado anterior alterado pelo coordenador.

# AAA-20260912 — auditoria do retorno Agente 1 / rodada 2 — 2026-09-12

- status: `IN_PROGRESS`; last_completed_action: hashes AAA-08 conferidos, suíte policy 3/29 PASS e reprodução F15 DENY/0 reexecutadas. Novo contraexemplo: modify + draft + action confirm/reschedule/cancel retorna ALLOW com 1 ferramenta falsa por caso. **AAA-08 REWORK**, AAA08-C1-F01 P1.
- next_action: somente **Agente 1 / rework AAA-08**, [prompt](04_audit/evidence/AAA/AAA-08/review-coordinator-r2/next-task-agent-1.md). Outras frentes preservadas; Agente 2 continua AAA-05 v3. Coordenador integra registros comuns após o retorno.
- reconciliação: AAA-03 rev2 `9df1a05f…` já tem APPROVE independente estático; AAA-04 v2 já publicada, 6 hashes conferidos, revisão específica pendente. Não transferir parecer de v1 nem inventar freeze/BUILD. AAA-05 permanece REWORK; aprovação local AAA-16 já registrada não equivale a DONE.
- evidência: [parecer](04_audit/evidence/AAA/AAA-08/review-coordinator-r2/REVIEW.md), logs/probes/checks no mesmo diretório. Suíte completa, coverage e gates globais não reexecutados nesta auditoria; números anteriores permanecem históricos. Nenhum código de produto alterado, nenhum efeito real ou gate concedido.

# AAA-20260912 — auditoria do retorno Agente 2 / v2 — 2026-09-12

- status: `IN_PROGRESS`; last_completed_action: auditoria direta de AAA-05 v2 e handoffs; **AAA-05 REWORK** por C2-F01..F03. Probe executado comprova divergência de hashes com metadata válida; release ausente na porta e plano SQL divergente das decisões existentes.
- AAA-12: REVIEW, APPROVE independente limitado ao host-local; 12 hashes intactos e errata do digest reproduzida (AAA12-R3-F01 fechado). AAA12-R3-F02 aberto, critério persistido em AAA-21; cobertura/canonicalização pendentes. AAA-16: REVIEW, APPROVE independente funcional local confirmado no log 84/84 exit 0; promoção depende dos gates/dependências existentes.
- next_action: **somente Agente 2 / AAA-05 v3 documental**, conforme [prompt](04_audit/evidence/AAA/AAA-05/review-coordinator-v2/next-task-agent-2.md). Outras frentes não redistribuídas. O coordenador integra registros; executor entrega evidência própria.
- evidência: [parecer](04_audit/evidence/AAA/AAA-05/review-coordinator-v2/REVIEW.md), probe executado e checks.json no mesmo diretório. Suítes completas não reexecutadas nesta rodada documental; logs independentes inspecionados. Nenhum código do produto alterado, nenhum gate ou DONE concedido. Fsync desligado não comprova durabilidade física; produção permanece NO-GO.

# AAA-20260912 — recebimento documentado da frente 2 — 2026-09-12

- status: `IN_PROGRESS`; last_completed_action: manifestos AAA-05/12/16 recebidos e hashes declarados conferidos; três entregas `IMPLEMENTED`, revisão independente pendente, promoção bloqueada. Não equivale a DONE ou fechamento de achados.
- next_action: Agente 3 revisa as três entregas; Agente 1 revisa AAA-04 e integra contratos/pareceres; Agente 2 prepara respostas e desenho SQL. Instruções vigentes: [adendo e prompts 0327](03_build/0327_aaa_round2_coordination.md).
- coordenação: migration 0012 reservada ao Agente 2 para planejamento; paths/task dos adapters SQL e gates ainda necessários. Integração outbox/postgres/runtime permanece com Agente 1. Registros comuns retornam ao owner Agente 1 após esta atualização solicitada pelo usuário.
- limites: journal single-host sem fsync; PG 84/84 reportado em cluster descartável com fsync desligado; cobertura crítica abaixo da barra. Testes do produto não reexecutados neste recebimento. Nenhum gate, nota AAA ou autorização de produção concedido.
- evidências: `docs/04_audit/evidence/AAA-20260912-AGENT2-RECEIPT/manifest.json`. Os registros abaixo são históricos e preservados.

# AAA-20260912 — rodada 2: estado reconciliado — 2026-09-12

- fonte canônica: [JSON](03_build/tracking/aaa_program_backlog.json); ledger: [execução](03_build/tracking/aaa_execution_ledger.json); instruções/prompts: [0327](03_build/0327_aaa_round2_coordination.md).
- AAA-01: VERIFIED para baseline histórico, sem qualificar working tree atual. AAA-03: REVIEW com APPROVE técnico condicionado; AAA-04: REVIEW com manifesto presente; AAA-05: REVIEW para reconciliação; AAA-16: REVIEW da prova 84/84; AAA-12: BLOCKED para promoção até contratos/dependências/aceite, sem descarte do código produzido.
- próximos responsáveis: Agente 1 revisa AAA-04 e coordena 03/05; Agente 2 entrega mapping e manifestos 12/16; Agente 3 revisa hashes finais e evidência, avança 14/15/13 após gates. Suas alterações exigem outro revisor.
- prontidão granular: AAA-08 exige 03/04; AAA-07 exige 03/04/05; AAA-09 exige 07/08/04; AAA-10 exige também 05/16; AAA-11 segue 10/04. Nenhum gate BUILD ou final concedido pela atualização de status.
- configuração corrente: três agentes, revisão alternada, recurso compartilhado com owner único. Planejamento original de quatro slots permanece baseline.
- achados permanecem abertos até fechamento específico. Snapshot, logs e pareceres históricos preservados.

# AAA-20260912 — rodada 2: revisão, reconciliação e AAA-08 — 2026-09-12

- `AAA-04` revisada independentemente pelo agent-1: `APPROVE_WITH_CONDITIONS` (F01 cobertura/mutação e F02 performance exigem barra v2; escopo de AAA-08 liberado). Evidência: `docs/04_audit/evidence/AAA/AAA-04/review-agent-1/`.
- `AAA-03` revisão 2 `9df1a05f…`: reconciliada com AAA-05 (identidade de operação, payload, journal, outbox, exemplos de retry/colisão) e condições do parecer fechadas; revisão final pendente.
- `AAA-08` implementada e em `REVIEW`: draft×real separados, `confirm`/`reschedule` negadas, `modify` restrito a draft; reprodução F15 `ALLOW`+1 → `DENY`+0; suíte 176 arquivos/895 testes PASS. Evidência: `docs/04_audit/evidence/AAA/AAA-08/`.
- `AAA-05`/`AAA-12`/`AAA-16` entregues pelo agent-2 (`IMPLEMENTED`, revisão pendente); decisões de migration/ownership `D05-1`/`D05-2` e composição `idempotencyKey=operationKey` no [ledger](03_build/tracking/aaa_execution_ledger.json). `AAA-07` aguarda AAA-05; `AAA-10` aguarda AAA-16 + handoff. Produção e integrações externas seguem `NO-GO`.

# AAA-20260912 — rodada 1: baseline e contratos — 2026-09-12

- status: `IN_PROGRESS`; `AAA-01` e `AAA-03` em `REVIEW`; nenhum código de produto alterado.
- `AAA-01`: candidato pinado (858 arquivos, digest `9ed0777a…`), `reproduce.mjs` idêntico à auditoria (`cdb6032a…`), typecheck/lint/`npm test` PASS, `format:check` FAIL (F13), PostgreSQL 58 PASS/26 skips (F14); 15/15 achados `OPEN`. Evidência: `docs/04_audit/evidence/AAA/AAA-01/manifest.json`.
- `AAA-03`: contrato `docs/02_spec/aaa_execution_contract.md` (sha256 `b8da48a6…`) com proposta imutável, estados de aprovação com reserva/incerteza, matriz de crash, journal de efeito, limites e separação draft×real. Evidência: `docs/04_audit/evidence/AAA/AAA-03/manifest.json`.
- coordenação e bloqueios: [aaa_execution_ledger.json](03_build/tracking/aaa_execution_ledger.json). `AAA-04`/`AAA-05`/`AAA-16` sem artefato atual; `AAA-07`–`AAA-11` bloqueadas por dependência. Produção e integrações externas seguem `NO-GO`.

### Adendo 2026-09-12T20:37Z — execução concorrente detectada

- Agent 2 iniciou AAA-05 (`docs/02_spec/aaa_data_api_contract.md` PROPOSTO), AAA-12 (journal do canal) e AAA-16 (PostgreSQL descartável em `/tmp/opencode/aaa-agent2-pg16`, porta 55432; 84/84 testes PASS exit 0). Tudo aguarda revisão independente; a integração com o `operationKey`/`EffectJournalPort` do AAA-03 precisa ser reconciliada antes de congelar.
- Agent 1 re-hasheou `runtime.ts`, `approval-engine`, `policy-engine` e `persistence/outbox-postgres` sem alteração; o `certification/license-report.json` gerado por `licenses:check` foi restaurado.

# AAA-20260912 — planejamento executivo multiagente

- entrega documental: `COMPLETED`; programa de implementação: planejado, nenhum BUILD executado nesta rodada.
- origem: pedido do usuário para plano executivo, roadmap e backlog de todos os itens da auditoria 0558, visando qualidade State of Art/Triplo AAA demonstrada.
- fonte canônica: [42 tasks e DAG](03_build/tracking/aaa_program_backlog.json); [visão detalhada 0326](03_build/0326_aaa_backlog.md), [plano 0324](03_build/0324_aaa_executive_plan.md), [roadmap 0325](03_build/0325_aaa_roadmap.md).
- cobertura: 20/20 áreas e 15/15 achados; seis fases/sprints; lead + dois builders + crítico fresco, com ownership e gates explícitos.
- próximo item: `AAA-01`, revalidação read-only; preparar AAA-02/03/04 e SPECs antes de BUILD. Todos os gates novos de implementação/externos/humanos continuam não concedidos.
- rastreabilidade: P10-B01–B10, RF-011/REM-02 e limites REM-29 mapeados; histórico preservado. Status mutável das tasks pertence somente ao JSON canônico.

# AUD-20260912-001 — auditoria de código atual

- status: `COMPLETED` para a entrega da auditoria; 15 achados abertos, sem BUILD de correções.
- autorização: pedido do usuário para auditoria completa com notas de 0–100; escopo de inspeção, verificações sintéticas, relatório e atualização operacional.
- task: auditar API/worker/web/pacotes, rastrear entrypoints e invariantes, executar gates disponíveis e registrar evidência; dependência: sistema controlado funcional; aceite: notas justificadas, reprodução dos achados e limitações explícitas.
- resultado: `60/100` consolidado (média 60,45), produção `20/100`; `NO_GO_PRODUCTION_AND_NEW_EXTERNAL_EFFECTS`.
- evidência canônica e critérios de fechamento: [relatório 0558](04_audit/0558_code_audit_2026-09-12.md), [evidência 0559](04_audit/0559_code_audit_evidence_2026-09-12.json).
- próxima lane proposta: F01/F02 binding e estado de aprovação; F03/F04 idempotência; F15 separação draft/ação real. Definir contratos e registrar tasks antes do BUILD.
- demais achados: F05 limites, F06 readiness, F07 observabilidade, F08 composição/identidade, F09 jornadas PostgreSQL, F10 worker contínuo, F11 certificado versus candidato, F12 dependências/licenças, F13 formato, F14 suficiência de testes/evals/operação.
- gates externos/humanos anteriores continuam obrigatórios; este relatório não libera dados reais, integrações reais, piloto ou produção.

# OPS-20260912-002 — Full local CVG chain

- status: `COMPLETED_CONTROLLED`; entrega: `Evolution API -> Gateway -> Connect Desk -> Agent Secretary`, sem Chatwoot.
- aceite observado: HMAC Gateway/Desk, persistência e IDs correlacionados, invocação Secretary bem-sucedida e serviços bindados somente em loopback.
- próximo gate: conexão de um número exclusivamente de teste via QR; para piloto/produção real continuam pendentes TLS/IdP, PostgreSQL RLS, backup/RPO-RTO, observabilidade central, fonte institucional, revisão LGPD/security e signoff humano.

# OPS-20260912 — Local production simulation

- id: `OPS-20260912-001_DOCKER_LOCKFILE_AND_RUNTIME`
- status: `COMPLETED_CONTROLLED`
- owner: `runtime/supply-chain`
- entrega: imagem Docker reproduzivel da Secretary e smoke integrado na suite local isolada.
- aceite: `npm ci` deterministico, build Docker PASS, `/live` e `/ready` observados no runtime; capacidades externas e sensiveis permanecem desligadas.
- evidencia: lockfile deterministico, imagem API/web construida, `/live` e `/ready` observados, suite integral 172/864 PASS e fluxo sintetico Desk -> adapter HMAC -> Secretary PASS.
- proximo gate: TLS/IdP, PostgreSQL e RPO/RTO, provider/canal/fonte institucional e signoff humano continuam obrigatorios antes de piloto ou producao real.

# PHASE 10 — backlog de produção assurance — 2026-09-11

- status: `READY_FOR_NEXT_STEP`; itens rastreáveis em `docs/10_phase10/PHASE10_BACKLOG.json`.
- bloqueadores de produção: `P10-B01` gate PostgreSQL real; `P10-B04` RPO/RTO medidos; `P10-B05` provider/canal/identidade validados; `P10-B08` signoff humano.
- itens de evolução: `P10-B02` migrar runtime legado ao kernel governado; `P10-B03` propagação OTel nativa; `P10-B06` load 100k; `P10-B07` audit ledger persistido; `P10-B09` UI de dead letters; `P10-B10` rotação de segredo.
- decisão: `CONDITIONAL_GO`/`AAA_CONTROLLED`; nenhum item deste backlog autoriza produção; P0=0 e P1=0.
- evidência: `certification/phase10-result.json` e `docs/10_phase10/PHASE10_FINAL_AUDIT.md`.

# AUD-20260911-001 — backlog derivado da auditoria atual — 2026-09-11

- status: `COMPLETED_WITH_OPEN_FINDINGS`; fase: `AUDIT`; veredicto: `CONDITIONAL_PASS_CONTROLLED_NO_GO_EXTERNAL`.
- evidência: [relatório 0556](04_audit/0556_project_audit_2026-09-11.md) e [evidência 0557](04_audit/0557_project_audit_evidence_2026-09-11.json).
- notas: consolidada `65/100`; controlado `74/100`; produto real `43/100`; prontidão para piloto/produção `20/100`.
- gates executados: unit 152/657 com 3/25 skips; coverage 85,51/81,02/91,10/86,41; build 159 módulos; E2E 6/6; PostgreSQL incompleto 8/58 com 2/24 skips; `format:check`/`verify` passaram; audit moderado falhou com 3 vulnerabilidades.
- próximos itens: `AUD-20260911-F01` caminho de produção; `F02` journeys no factory PostgreSQL; `F03` worker contínuo; `F04` RAG/integrações; `F05` evidência PostgreSQL; `F06` política de dependências; `F07` safety semântico; `F08` release/documentação; `F09` feature flags sem consumidor.
- decisão: nenhuma integração real ou BUILD de produto é liberada por esta auditoria; produção, piloto real, dados reais e automações sensíveis continuam `NO-GO`.

# AUD-20260905-001 — parecer integral atual — 2026-09-05T21:14:49-03:00

- status: `COMPLETED_WITH_OPEN_FINDINGS`; relatório: `docs/04_audit/0554_project_full_audit_2026-09-05.md`; evidência: `0555_project_full_audit_evidence_2026-09-05.json`.
- notas: consolidada `73/100`; técnico controlado `80/100`; produto real `64/100`; produção/piloto `25/100`.
- findings abertos: `AUD-20260905-F01` caminho de produção; `F02` worker contínuo; `F03` RAG/jornadas reais; `F04` operação/RPO-RTO; `F05` drift/higiene; `F06` limites de evidência; `F07` generalização semântica do safety.
- decisão: manter `REM-29` `NO_GO_CONTROLLED` e não abrir BUILD de integração sem RF-011, owners, identidade/provider/canal/fonte aprovados, signoff humano e RPO/RTO.
- próxima ação autorizada: registrar os gates externos/humanos e repetir REM-27–29 em ambiente aprovado; nenhum dado real, deploy ou efeito externo.

# REM-0539 — backlog pós-R7 — 2026-09-05T20:24:19-03:00

- R7 fechou tecnicamente os blockers de redaction/ack/migration/bridge em escopo controlado; REM-10–12 e REM-28 permanecem `COMPLETED_CONTROLLED_REVALIDATED`.
- Evidência: `docs/04_audit/0552_rem0539_r7_revalidation_evidence.json`; dossiê: `docs/04_audit/0553_rem0539_r7_final_dossier.md`; crítico fresh-context `01a073e0-1d26-7872-a196-3c22d1d39014` capturado com `PASS_CONTROLLED`.
- Gates locais passaram: suíte 152/657, PostgreSQL local 10/82, coverage acima de 80%, E2E 6/6 e gates estáticos/worker pass.
- REM-29 continua `NO_GO_CONTROLLED`: faltam RF-011, identidade/provider/canal, fonte institucional aprovada, signoff humano e RPO/RTO. Produção/piloto real e ações sensíveis continuam bloqueados.
- Próxima ação autorizada: registrar o parecer independente R7 e aguardar gates externos/humanos antes de repetir REM-27–29 em ambiente aprovado.

# REM-0539 — backlog pós-R6 — 2026-09-05T17:46:53-03:00

- Estado: REM-01/03 implementadas; REM-04–28 `COMPLETED_CONTROLLED` após revalidação aplicável; REM-29 `NO_GO_CONTROLLED`; REM-02 `PENDING_HUMAN_DECISION`; REM-30 `DEFERRED_OPTIONAL`.
- R6 revalidou consumer fechado do worker, sanitização de outbox, boundary PostgreSQL e shell web responsiva/semântica em ambiente local. Evidência: `docs/04_audit/0550_rem0539_r6_revalidation_evidence.json`; dossiê: `0551_rem0539_r6_final_dossier.md`.
- Gates automatizados: suíte 150/638 pass com 3/23 skips; E2E 6/6 pass; visual 375/768/1440 pass; PostgreSQL final 7/54 pass com 2/22 skips por ausência de `TEST_DATABASE_URL`.
- Próxima ação: capturar crítica R6, registrar RF-011 e aprovar identidade/provider/canal/fonte institucional, signoff humano e RPO/RTO; só então repetir REM-27–29. Produção, dado real e ações sensíveis continuam bloqueados.

# REM-0539 — backlog após BUILD/AUDIT controlado — 2026-09-05T11:40:00-03:00

- Estado: REM-01/03 implementadas; REM-04–28 `COMPLETED_CONTROLLED`; REM-29 `NO_GO_CONTROLLED`; REM-02 `PENDING_HUMAN_DECISION`; REM-30 `DEFERRED_OPTIONAL`.
- Qualificação: R5 local mediu 45 ms/420 ms p95, zero perda e zero duplicação, mas não concede piloto.
- Evidências: `docs/04_audit/0546_rem0539_r3_evidence.json`, `0547_rem0539_r4_evidence.json`, `0548_rem0539_r5_qualification_evidence.json`; backlog detalhado em `docs/03_build/0313_backlog_pos_auditoria.md`.
- Próxima ação: registrar RF-011 e aprovar gates externos/humanos/RPO-RTO antes de repetir REM-27–29. Produção, dado real e ações sensíveis continuam bloqueados.

# REM-0539 — estado executável R1 — 2026-09-05T08:17:03-03:00

- REM-04, REM-05 e REM-06: `COMPLETED` com evidência em `docs/04_audit/0543_rem0539_r1_evidence.json`.
- REM-07: `CONDITIONAL`; memória/API e estrutura transacional passam, mas a corrida real PostgreSQL e rollback por trigger aguardam `TEST_DATABASE_URL` isolada.
- REM-08: `BLOCKED` até REM-07 fechar; REM-09 em diante permanecem `PENDING` por regra de gate.
- A implementação usa apenas fixtures e observabilidade sintética. Nenhum dado real, canal/provider/RAG, deploy ou piloto foi executado.

# REM-0539 / R2 — preparação documental e gate controlado — 2026-09-05

- REM-09: `COMPLETED_CONTROLLED`; Discovery/PRD/SPEC aprovados para BUILD local.
- REM-10/11/12: `READY_FOR_BUILD`; execução seguirá em fixtures e PostgreSQL local, sem broker/provider/canal externo.

# REM-0539 / R1-CLOSURE — 2026-09-05

- REM-07 e REM-08: `COMPLETED_CONTROLLED`, com evidência em `docs/04_audit/0544_rem0539_r1_closure_evidence.json`.
- A corrida PostgreSQL e as suítes integral/PostgreSQL passaram; R2 tem Discovery/PRD/SPEC aprovados e BUILD controlado liberado.

# BACKLOG MASTER — CVG

## REM-0539 — execução autorizada em andamento — 2026-09-05T10:35:31.994051+00:00

- status: IN_PROGRESS; engine: BUILD; fase: R1; tasks REM-04..07.
- autorização: usuário solicitou implementar integralmente 0311/0312/0313 com Gauntlet/orchestrate. Os contratos R1 foram registrados e validados antes do BUILD; nenhum aceite de produção é inferido.
- evidência de baseline: `docs/04_audit/0542_rem0539_r0_evidence.json`; tracking: `docs/03_build/tracking/rem0539_execution.json`; SPEC: `docs/02_spec/0122_rem0539_r1_contract.md`.
- quality bar: `.gauntlet/bar.json`, 30 tasks + qualidade integrada obrigatórias. Histórico Gauntlet PLAT-S48 preservado por hash em `.gauntlet/legacy/PLAT-S48`.
- próximos passos: RED/GREEN risco, proxy e approvals; crítica independente fresca e integração. REM-02 e demais ondas continuam no escopo, não concluídas.
- limites: fixtures, sem dado real, canal/provider externo, RAG institucional, deploy ou piloto. Decisões externas/humanas permanecem requisitos pendentes, não critérios removidos.

## PLAN-0539-001 — Planejamento executivo pós-auditoria — 2026-09-05T01:07:40-03:00

- status: `COMPLETED` (entrega documental); programa REM-0539 proposto, execução não iniciada.
- autorização: usuário solicitou plano executivo, roadmap e backlog com base em 0539.
- entregas: [plano executivo](03_build/0311_plano_executivo_pos_auditoria.md), [roadmap](03_build/0312_roadmap_pos_auditoria.md), [30 tasks REM](03_build/0313_backlog_pos_auditoria.md).
- próximo passo: revalidar baseline (REM-01) e submeter contratos corretivos (REM-03); conciliar arquitetura/documentação em REM-02.
- limites: nenhum achado fechado, código/lockfile alterado ou gate de BUILD/produção concedido; F01/F05/F07 continuam abertos.

## AUD-DOC-001 — Revisão integral solicitada pelo usuário

- id: `AUD-DOC-001_FULL_DOCUMENTATION_IMPLEMENTATION_REVIEW`
- status: `COMPLETED`
- fase: `AUDIT`
- escopo: leitura dos 227 arquivos originais de docs, confronto com código/runtime e relatório com notas 0–100 por item
- gate: auditoria autorizada pelo usuário; nenhum BUILD de produto
- aceite: inventário de leitura completo, evidência atual, notas justificadas, gaps e remediação
- evidência: `docs/04_audit/0539_documentation_implementation_review.md`
- achado novo: `AUD-F01`, P1, precedência de scheduling oculta triagem high-risk em mensagem composta; reprodução controlada confirmada; correção depende de lane DISCOVERY/PRD/SPEC própria
- limite: fixtures somente, sem provider/canal real, RAG real, dados reais ou deploy

## Remediações derivadas de AUD-DOC-001 — abertas

| Item    | Prioridade                  | Estado             | Próximo gate / aceite                                                                                                   |
| ------- | --------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| AUD-F07 | P2                          | DISCOVERY_REQUIRED | Approval de atendimento: CAS pending→decisão e teste de snapshots concorrentes; não confundir com capability approval   |
| AUD-F01 | P1                          | DISCOVERY_REQUIRED | Risco independente da intenção; caso consulta+sangue deve solicitar handoff high e não executar tool; ampliar preflight |
| AUD-F05 | P2                          | DISCOVERY_REQUIRED | Atualizar Fastify e substituir proxy numérico; provar rejeição de HTTPS forjado por origem direta                       |
| AUD-F04 | P2 documental               | OPEN               | Conciliar autoridades, caminhos de código, migrations e estados históricos; índices de audit atualizados nesta rodada   |
| AUD-F02 | P2 produto                  | SPEC_REQUIRED      | Worker/outbox com claim/ack/retry/recuperação e prova de não perda em fixture                                           |
| AUD-F03 | P2 produto                  | SPEC_REQUIRED      | Cadastro/agenda duráveis e integrações por lanes próprias; gates reais continuam obrigatórios                           |
| AUD-F06 | P2 operação / P3 manutenção | SPEC_REQUIRED      | Evidenciar carga/p95, restore, observabilidade, identidade e operação antes de piloto                                   |

Detalhes, provas e owners sugeridos: `docs/04_audit/0539_documentation_implementation_review.md`.
O JSON de readiness de construção mede o baseline histórico de debug; seu 100 não é nota atual de produto ou encerramento destes achados. Nenhuma remediação de código foi iniciada ou aprovada por este registro.

## PLAT-S48 — Controlled Baseline Determinism

- id: `PLAT-S48_CONTROLLED_BASELINE_DETERMINISM`
- prioridade: P0
- status: `COMPLETED_CONTROLLED`
- fase: `AUDIT`
- owner: `platform/security/test-infrastructure`
- dependências: `PLAT-S47-001`, `PLAT-S45-001`
- tasks:
  `PLAT-S48-001_CONTROLLED_DETERMINISTIC_APPROVAL_CLOCK` e
  `PLAT-S48-002_CONTROLLED_SEMANTIC_TIMELINE_ASSERTION`
- contrato: compartilhar clock injetável entre gateway e autoridade nos
  fixtures, preservar fail-closed/consumo único e escopar a asserção da
  timeline sem mudar a UI
- aceite: os dois REDs deixam de falhar; regressão e gates controlados passam
  com coverage >= 80% em todas as métricas
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem produção real, provider/canal, RAG, rede, schema, deploy, dado
  real ou side effect
- evidência planejada:
  `docs/04_audit/0538_plat-s48_controlled_deterministic_clock_and_test_contract_evidence.md`

### Registro controlado S48 — 2026-09-02T07:03:00-03:00

Discovery encontrou divergência temporal entre gateway e autoridade de
approval e ambiguidade de query no teste web; ambos foram reproduzidos no
checkout atual. Próximo passo: RED focado.

### Fechamento controlado S48 — 2026-09-02T07:32:00-03:00

As duas tasks passaram por RED/GREEN e auditoria: o gateway usa clock
injetável compartilhável com a autoridade, mantém fail-closed e não consome
approval inválida/expirada; a asserção web usa escopo semântico da timeline.
Regressão 127/537 pass com 2/19 skipped; coverage 84.87/80.12/84.98/85.98;
PostgreSQL 8/72; E2E 4/4; readiness 4/4; worker smoke; build 158 módulos;
audit 0; typecheck/lint/format/diff PASS. Evidência:
`docs/04_audit/0538_plat-s48_controlled_deterministic_clock_and_test_contract_evidence.md`.
Produção permanece `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## PLAT-S47 — Controlled Multi-Agent Creation Mode

- id: `PLAT-S47-001_CONTROLLED_MULTI_AGENT_CREATION_MODE`
- prioridade: P0
- status: `COMPLETED_CONTROLLED`
- fase: `AUDIT`
- owner: `platform/control-center`
- dependências: `PLAT-S46-001`, `PLAT-S01-001`
- contrato: oferecer modo explícito `Novo agente`, limpar estado derivado sem
  apagar identidade e permitir Agent A/B distintos no mesmo Control Center,
  tenant e kernel
- aceite: criação A/B pela UI/API, configurações independentes, troca sem
  state bleed (inclusive respostas tardias) e clone versionado intacto para
  agentes existentes
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem provider/canal real, RAG, rede, deploy, dado real ou side effect
- evidência planejada:
  `docs/04_audit/0537_plat-s47_controlled_multi_agent_creation_evidence.md`

### Auditoria corretiva S47 — 2026-08-26

O ciclo corretivo fechou os achados de isolamento do Trace Viewer, leitura sem
`agentId`, reutilização de escopo após A→B→A, redaction de traces no cliente e
payload legado com `spans` não-array. Os critérios CTRL-180 a CTRL-185 estão
`PASS controlled`. A regressão passou 127 arquivos/534 testes, com 2 arquivos/
19 testes skipped; coverage 84,86/80,12/84,97/85,97; build 158 módulos; E2E
4/4; PostgreSQL 8/72; readiness 4/4; worker smoke; audit 0; typecheck, lint,
format e diff check PASS. A crítica independente compatível final retornou
`PASS_CONTROLLED`, sem P0/P1/P2/P3; nenhum arquivo foi alterado pelo revisor.
Produção permanece `NO-GO`/`WAITING_HUMAN_APPROVAL` e a próxima ação segura é
nova `DISCOVERY -> PRD -> SPEC` controlada.

## PLAT-S46 — Controlled Execution Trace Correlation Boundary

- id: `PLAT-S46-001_CONTROLLED_EXECUTION_TRACE_CORRELATION_BOUNDARY`
- prioridade: P1
- status: `COMPLETED_CONTROLLED`
- fase: `AUDIT`
- owner: `platform/observability/agent-core`
- dependências: `PLAT-S45-001`, `PLAT-S44-001`, `PLAT-S42-001`
- contrato: criar/validar um `traceId` único no início de cada execução e
  propagá-lo para eventos, hooks, tools, auditorias e trace persistido sem
  substituir IDs locais de evento/call
- aceite: propagação única no Test Lab/runtime publicado, gateway standalone
  controlado, rejeição de ID inválido antes de efeito, sinks preservam a
  referência e nenhum payload sensível é adicionado
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem tracing externo, OTel/exporter, broker, rede, provider/canal real,
  RAG, deploy, dado real ou side effect
- evidência planejada:
  `docs/04_audit/0536_plat-s46_controlled_execution_trace_correlation_boundary_evidence.md`

### Fechamento controlado S46 — 2026-08-26T11:22:54-03:00

RED: 4 arquivos/33 testes, 8 falhas esperadas; GREEN de fechamento: 6
arquivos/25 testes pass. Regressão 126 arquivos/523 testes pass, 2 arquivos/
19 testes skipped; coverage 85,07/80,06/85,95/86,10; PostgreSQL 8/72; readiness
4/4; worker smoke; E2E 4/4; build 70 módulos; audit 0; typecheck, lint, format
e diff check PASS. Revisão independente compatível read-only: `PASS` sem
P0/P1/P2. Produção permanece `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## PLAT-S45 — Controlled Tool Invocation Boundary

- id: `PLAT-S45-001_CONTROLLED_TOOL_INVOCATION_BOUNDARY`
- prioridade: P0
- status: `COMPLETED_CONTROLLED`
- fase: `AUDIT`
- owner: `platform/security/plugin-runtime`
- dependências: `PLAT-S44-001`, `PLAT-S35-001`
- entrega: validators server-side de input/output por tool compilada,
  autorização efetiva do actor, validação bounded de actor/input e projeção
  segura de resultado de handler no Capability Gateway
- aceite: input inválido, actor malformado, validator ausente/excedente ou
  resultado inválido falham fechado antes de approval/handler; nenhum input ou
  output bruto atravessa a boundary; approval requer autoridade durável e
  single-use; falha de auditoria não repete execução; fixtures válidas mantêm
  compatibilidade
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem import dinâmico, marketplace, provider/canal real, rede, RAG,
  broker, outbox, egress, deploy, dado real ou side effect
- evidência planejada:
  `docs/04_audit/0535_plat-s45_controlled_tool_invocation_boundary_evidence.md`

### Registro controlado S45

Discovery read-only reproduziu `null` encaminhado ao handler e resultado com
`data.raw` devolvido sem projeção; actor com `permissions` ausente gerou
`TypeError`. O BUILD foi concluído e os gates controlados passaram. A revisão
independente compatível read-only retornou `PASS sem P0/P1`, e a evidência foi
fechada como `COMPLETED_CONTROLLED`.

Fechamento: focused 6/41; `npm test` 125 arquivos/512 testes pass, 2 arquivos/
19 testes skipped; coverage 85,01/80,14/85,82/86,03; PostgreSQL controlado
6/53 com 2/19 skipped; E2E 4/4; readiness 4/4; worker smoke; build 70 módulos;
typecheck, lint, format, audit 0 e diff check PASS. Produção permanece
`NO-GO`/`WAITING_HUMAN_APPROVAL`.

## PLAT-S44 — Controlled Trace Stage Timing

- id: `PLAT-S44-001_CONTROLLED_TRACE_STAGE_TIMING`
- prioridade: P1
- status: `COMPLETED_CONTROLLED`
- fase: `AUDIT`
- owner: `platform/observability/agent-core`
- dependências: `PLAT-S43-001`, `PLAT-S42-001`
- entrega: clock monotônico local injetável, ledger bounded e durações de
  estágios no executor/trace
- aceite: etapas executadas têm duração medida finita; skipped zero; soma
  bounded; sem payload ou integração externa
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem OTel, exporter, broker, rede, provider/canal real, RAG, deploy,
  dado real ou side effect
- evidência planejada:
  `docs/04_audit/0534_plat-s44_controlled_trace_stage_timing_evidence.md`

### Registro controlado S44

Discovery confirmou zero estático em todos os spans e ausência de clock/ledger
injetável. O lane foi implementado e auditado; produção real permanece
`NO-GO`/`WAITING_HUMAN_APPROVAL`.

### Fechamento S44

Focused 2/17, regressão 124/501 com 2/19 skipped, coverage
85,18/80,44/85,70/86,16, PostgreSQL 8/72, E2E 4/4, readiness 4/4, build 70
módulos, audit 0 e checks estáticos passaram. Evidência:
`docs/04_audit/0534_plat-s44_controlled_trace_stage_timing_evidence.md`.

## PLAT-S43 — Controlled Trace Temporal Integrity

- id: `PLAT-S43-001_CONTROLLED_TRACE_TEMPORAL_INTEGRITY`
- prioridade: P1
- status: `COMPLETED_CONTROLLED`
- fase: `AUDIT`
- owner: `platform/observability/security`
- dependências: `PLAT-S42-001`, `PLAT-S41-001`
- entrega: invariantes de timestamps/latência e ordem/status de spans no
  parser compartilhado, sem telemetria externa
- aceite: incoerências temporais/ordinais falham fechado; traces sem campos
  opcionais continuam compatíveis
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem OTel, exporter, broker, rede, provider/canal real, RAG, deploy,
  dado real ou side effect
- evidência planejada:
  `docs/04_audit/0533_plat-s43_controlled_trace_temporal_integrity_evidence.md`

### Registro controlado S43

Discovery encontrou `durationMs: 0` estático nos spans e ausência de invariantes
temporais/ordinais. O lane foi construído e auditado; a instrumentação medida
fica para uma próxima lane controlada.

### Fechamento S43

Focused 1/14, regressão 124/499 com 2/19 skipped, coverage
85,08/80,41/85,45/86,08, PostgreSQL 8/72, E2E 4/4, readiness 4/4, build 70
módulos, audit 0 e checks estáticos passaram. Evidência:
`docs/04_audit/0533_plat-s43_controlled_trace_temporal_integrity_evidence.md`.

## PLAT-S42 — Controlled Trace Provenance Boundary

- id: `PLAT-S42-001_CONTROLLED_TRACE_PROVENANCE_BOUNDARY`
- prioridade: P0
- status: `COMPLETED_CONTROLLED`
- fase: `AUDIT`
- owner: `platform/persistence/security`
- dependências: `PLAT-S41-001`, `PLAT-S40-001`, `PLAT-FOUNDATION-009`
- entrega: parser/projeção runtime allowlist do `TestRunTrace`, validação
  bounded de IDs/estruturas/datas/spans, provider controlado e
  `externalCall: false`, redaction/output policy e aplicação uniforme em
  sinks diretos, suites aninhadas e leituras PostgreSQL
- aceite: campos extras não sobrevivem; trace malformado, provider externo,
  `externalCall: true`, IDs inválidos ou output inconsistente falham fechado
  antes de INSERT/retorno; nenhum dado bruto inseguro é devolvido
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem provider/canal real, RAG, broker, outbox, egress, secret manager,
  deploy, migração estrutural, dados reais ou side effect
- evidência planejada:
  `docs/04_audit/0532_plat_s42_controlled_trace_provenance_boundary_evidence.md`

### Registro controlado S42

Discovery confirmou que o contrato de trace era apenas TypeScript, que a suite
clonava traces aninhados sem chamar `sanitizeTraceForPersistence` e que
listagens PostgreSQL devolviam JSON sem revalidação. O lane foi construído,
testado e auditado; produção real continua `NO-GO`/`WAITING_HUMAN_APPROVAL`.

### Fechamento S42

Focused 6/76, regressão 124/492 com 2/19 skipped, coverage
84,99/80,24/85,41/86,00, PostgreSQL 8/72, E2E 4/4, readiness 4/4, build 70
módulos, audit 0 e checks estáticos passaram. Evidência:
`docs/04_audit/0532_plat_s42_controlled_trace_provenance_boundary_evidence.md`.

## PLAT-S41 — Controlled Output Safety Boundary

- id: `PLAT-S41-001_CONTROLLED_OUTPUT_SAFETY_BOUNDARY`
- prioridade: P0
- status: `COMPLETED_CONTROLLED`
- fase: `AUDIT`
- owner: `platform/agent-core/security`
- dependências: `PLAT-S40-001`, `PLAT-S36-001`, `PLAT-FOUNDATION-009`
- entrega: output policy server-side para validar tipo, limite, redaction e
  conteúdo da completion antes de `response.after`/trace; fallback seguro e
  eventos bounded de decisão
- aceite: saída segura segue; output não textual, vazio, excessivo ou com
  diagnóstico, prescrição, medicação/dose, tratamento, prontuário, pagamento
  ou mutação de agenda é reescrito para fallback seguro; mode/handoff/evento
  permanecem consistentes e nenhum texto rejeitado é refletido
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem provider/canal real, RAG, broker, outbox, egress, secret manager,
  deploy, dados reais ou side effect
- evidência planejada:
  `docs/04_audit/0531_plat_s41_controlled_output_safety_boundary_evidence.md`

### Registro controlado S41

Discovery read-only confirmou que `approvedKnowledge.answer` e
`responseTemplates` chegam ao provider determinístico como `fallbackText`, mas
não existe uma validação pós-modelo. O próximo passo obrigatório é RED focado;
nenhuma integração externa ou conteúdo real será usado.

### Correção após revisão independente

A revisão encontrou bypasses de variantes no detector e execução de
tools/approval depois de output rejeitado, além de lacunas de motivo/eventos,
trace e redaction. O focused corretivo reproduziu 11 falhas em 1 arquivo/21
testes antes do GREEN; a correção agora normaliza Unicode/confusáveis, bloqueia
capabilities após qualquer rewrite, emite handoff coerente e persiste decisão
bounded. A validação também foi aplicada antes de outbound/handoff/auditoria
na conclusão transacional PostgreSQL.

### Auditoria final S41

`PLAT-S41-001 = COMPLETED_CONTROLLED`. Focused de fechamento: 7 arquivos/76
testes PASS. Regressão: 123 arquivos PASS, 2 skipped; 483 testes PASS, 19
skipped. Coverage: 85,08% statements, 80,29% branches, 85,39% functions e
86,12% lines. Readiness 4/4, worker smoke, PostgreSQL 8/72, E2E 4/4, build
70 módulos, typecheck, lint, format, audit 0 e diff check PASS. Evidência:
`docs/04_audit/0531_plat_s41_controlled_output_safety_boundary_evidence.md`.

A revisão independente encontrou P0/P1 e os achados foram fechados por
regressões e correções locais. A tentativa final assíncrona não retornou no
limite e não foi tratada como aprovação. Não há achado aberto conhecido no
escopo controlado; produção real segue `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## PLAT-S40 — Controlled Model Provider Identity Boundary

- id: `PLAT-S40-001_CONTROLLED_MODEL_PROVIDER_IDENTITY_BOUNDARY`
- prioridade: P0
- status: COMPLETED_CONTROLLED
- fase: AUDIT
- owner: platform/agent-core/security
- dependências: `PLAT-S39-001`, `PLAT-FOUNDATION-003`, `PLAT-FOUNDATION-009`
- entrega: registry server-side compilado para `fake/deterministic-v1`,
  resolução exata no executor controlado e rejeição fail-closed de provider,
  modelo ou fallback não suportado
- aceite: identidade válida mantém resposta determinística e
  `externalCall: false`; identidade desconhecida ou `fallbackProvider` presente
  falha antes da pipeline de eventos/modelo; Test Lab, API, runtime publicado e
  worker reutilizam a mesma regra; registry/listas permanecem imutáveis
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem provider/canal real, chamada de rede, fallback/retry operacional,
  secret manager, RAG, broker, egress, deploy, dados reais ou side effect
- evidência planejada:
  `docs/04_audit/0530_plat_s40_controlled_model_provider_identity_evidence.md`

### Registro controlado S40

Discovery read-only confirmou que `ModelProviderRegistry` existe, mas não é
consultado pelo executor; `createDryRunModelProvider` instancia diretamente o
provider determinístico e `fallbackProvider` é aceito pelo schema sem ser
executado. O próximo passo obrigatório é RED antes de qualquer BUILD.

### RED observado S40

O focused executou 1 arquivo/4 testes e falhou como esperado: provider/model
desconhecido foi aceito, `fallbackProvider` foi ignorado e o runtime completou
com uma identidade externa fictícia depois de emitir eventos. Nenhuma chamada
externa ou side effect ocorreu; o próximo passo é GREEN compartilhado.

### GREEN focado S40

O registry compilado e a resolução pré-pipeline foram implementados. O focused
inicial passou 2 arquivos/6 testes e a regressão publicada/worker ampliada
passou 4 arquivos/19 testes; `fake/deterministic-v1` é o único binding
executável, e provider/model não suportado ou fallback configurado falha com
`invalid_action`. Gates completos e revisão independente foram concluídos.

### Auditoria final S40

`PLAT-S40-001 = COMPLETED_CONTROLLED`. Focused 4/19; `npm test` 121/446 com
19 skips; coverage 85,08/80,11/85,17/86,07; readiness 4/4; worker smoke;
PostgreSQL 8/72; E2E 4/4; build 70 módulos; typecheck, lint, format, audit 0
e diff check PASS. Revisão independente follow-up: `PASS sem achados
estáticos`. Evidência em
`docs/04_audit/0530_plat_s40_controlled_model_provider_identity_evidence.md`.
Produção real permanece `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## PLAT-S39 — Controlled Release Candidate Lifecycle Integrity

- id: `PLAT-S39-001_CONTROLLED_RELEASE_CANDIDATE_LIFECYCLE_INTEGRITY`
- status: `COMPLETED_CONTROLLED`
- prioridade: P0
- fase: `AUDIT`
- owner: `platform/persistence/security`
- dependências: `PLAT-S37-001`
- contrato: transição para `VALIDATED` exige schema estrito dos quatro gates,
  todos `PASS`, digest recomputado, validador diferente do criador e binding do
  próprio candidate; mapper PostgreSQL rejeita gates corrompidos
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: somente ledger/lifecycle controlado; sem deploy, provider/canal, RAG,
  egress, broker, outbox, dados reais ou side effect
- evidência planejada:
  `docs/04_audit/0529_plat_s39_controlled_release_candidate_lifecycle_integrity_evidence.md`
- próximo passo: nova discovery/SPEC controlada

### GREEN focado S39

`assertReleaseCandidateEvidenceIntegrity` shared foi implementada e aplicada
antes da mutação em InMemory/PostgreSQL; publish reutiliza a mesma regra. O
focused 2/6 passou, com typecheck/lint PASS. Gates integrados ainda pendentes.

### Correção após crítica independente S39

Autoatestação pelo criador foi bloqueada e o mapper PostgreSQL passou a rejeitar
`gate_results` inválido com erro controlado. A autoridade de publish/rollback
revalida a mesma independência, e a migration `0009` protege o banco contra
autoatestação persistida.

### Auditoria final S39

`PLAT-S39-001 = COMPLETED_CONTROLLED`. Focused final: 7 arquivos/23 testes/1
skip. Gates: npm test 120/438/19 skips; coverage 85,08/80,16/85,18/86,08;
readiness 4/4; worker smoke; PostgreSQL 8/72; E2E 4/4; build, typecheck, lint,
format, audit 0 e diff check PASS. A revisão independente final foi
`PASS sem achados`. Evidência em
`docs/04_audit/0529_plat_s39_controlled_release_candidate_lifecycle_integrity_evidence.md`.
Produção real continua `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## PLAT-S38 — Controlled Worker Knowledge Input Parity

- id: `PLAT-S38-001_CONTROLLED_WORKER_KNOWLEDGE_INPUT_PARITY`
- status: `COMPLETED_CONTROLLED`
- prioridade: P0
- fase: `AUDIT`
- owner: `worker/agent-core/platform/security`
- dependências: `PLAT-S37-001`, `PLAT-S36-001`, `PLAT-S33-001`
- contrato: `PublishedAgentJobSchema` reutiliza
  `ApprovedKnowledgeForTestSchema` e o worker encaminha apenas o payload
  parseado para o executor publicado
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem broker, provider/canal, RAG, egress, outbox, dados reais, deploy
  ou side effect
- evidência:
  `docs/04_audit/0528_plat_s38_controlled_worker_knowledge_input_parity_evidence.md`
- resultado: schema shared strict/bounded, forwarding ao runtime pinned e
  history aligned em 50; crítica independente sem CRITICAL/HIGH, drift médio
  corrigido e cobertura baixa ampliada; gates 120/432/19 skips, coverage
  84,92/80,09/85,08/85,92, readiness 4/4, E2E 4/4, PostgreSQL 8/71,
  worker smoke, build, format, lint, audit 0 e diff check PASS
- próximo passo: nova discovery/SPEC controlada

## PLAT-S37 — Controlled Publish Evidence Authority Boundary

- id: `PLAT-S37-001_CONTROLLED_PUBLISH_EVIDENCE_AUTHORITY_BOUNDARY`
- status: `COMPLETED_CONTROLLED`
- prioridade: P0
- fase: `AUDIT`
- owner: `platform/api/persistence/security`
- dependências: `PLAT-S36-001`, `PLAT-FOUNDATION-009`
- contrato: publish/rollback exigem `releaseCandidateId` validado, digest
  íntegro, quatro gates PASS e vínculo tenant/agente/versão; preflight
  server-side continua obrigatório
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem dados reais, deploy, provider/canal, RAG, egress, broker,
  outbox, rollout gradual ou side effect
- evidência:
  `docs/04_audit/0527_plat_s37_controlled_publish_evidence_authority_evidence.md`
- resultado: candidato `VALIDATED` com digest/gates/binding revalidados no
  servidor; API, InMemory, PostgreSQL e UI alinhados; gates finais 119/427/19
  skips, coverage 84,92/80,08/85,08/85,92, readiness 4/4, E2E 4/4,
  PostgreSQL 8/71, worker smoke, build, format, lint, audit 0 e diff check PASS
- próximo passo: nova discovery/SPEC controlada

## PLAT-S36 — Controlled Knowledge Input Provenance Boundary

- id: `PLAT-S36-001_CONTROLLED_KNOWLEDGE_INPUT_PROVENANCE_BOUNDARY`
- status: `COMPLETED_CONTROLLED`
- prioridade: P0
- fase: `AUDIT`
- owner: `platform/agent-core/api/security`
- dependências: `PLAT-S35-001`, `PLAT-FOUNDATION-009`
- contrato: `approvedKnowledge` strict e bounded, source somente
  `controlled://`, validação no runtime e schema compartilhado na API
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem RAG/ingestão/conteúdo real, provider/canal, URL externa, egress,
  broker, outbox, deploy ou side effect
- evidência:
  `docs/04_audit/0526_plat_s36_controlled_knowledge_input_boundary_evidence.md`
- resultado: verify 117/422/19 skips, coverage 85,05/80,31/85,11/86,07,
  readiness 4/4, worker smoke, E2E 4/4, PostgreSQL 8/71, audit 0 e revisão
  independente sem CRITICAL/HIGH; produção real `NO-GO` /
  `WAITING_HUMAN_APPROVAL`

## PLAT-S35 — Controlled Tool Registry Identity Boundary

- id: `PLAT-S35-001_CONTROLLED_TOOL_REGISTRY_IDENTITY_BOUNDARY`
- status: `COMPLETED_CONTROLLED`
- prioridade: P0
- fase: `AUDIT`
- owner: `platform/api/agent-core/security`
- dependências: `PLAT-S34-001`, `PLAT-FOUNDATION-009`
- contrato: planner e API resolvem somente handlers compilados por binding
  habilitado com versão exata; colisão, ausência e catálogo metadata-only falham
  fechado; permissão é server-owned
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem import dinâmico, marketplace, provider/canal, egress, broker,
  outbox, deploy, dados reais ou side effect
- evidência:
  `docs/04_audit/0525_plat_s35_controlled_tool_registry_identity_evidence.md`
- resultado: registry compilado, versão exata, planner por intent,
  deduplicação/colisão fail-closed e approval/API server-owned auditados; gates
  integrados concluídos em ambiente controlado

## PLAT-S34 — Controlled CI Gate Parity and Worker Startup Smoke

- id: `PLAT-S34-001_CONTROLLED_CI_GATE_PARITY`
- status: `COMPLETED_CONTROLLED`
- prioridade: P0
- fase: `AUDIT`
- owner: `CI/worker/security`
- dependências: `PLAT-S33-001`, `PLAT-FOUNDATION-009`
- contrato: workflow reproduz gates disponíveis, instalação sem lifecycle
  scripts, permissões/concurrency mínimos e smoke bounded do worker
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- evidência:
  `docs/04_audit/0524_plat_s34_controlled_ci_gate_parity_evidence.md`
- limite: sem imagem/container scan executável até existir artefato, sem deploy,
  broker, provider/canal, dados reais ou side effect
- resultado: workflow com gates explícitos, instalação sem lifecycle scripts,
  permissões/concurrency mínimos, smoke fail-closed do worker e diff check;
  gates integrados concluídos em ambiente controlado

## PLAT-S33 — Controlled Worker Published-Runtime Boundary

- id: `PLAT-S33-001_CONTROLLED_WORKER_RUNTIME_BOUNDARY`
- status: `COMPLETED_CONTROLLED`
- prioridade: P0
- fase: `AUDIT`
- owner: `worker/agent-core/security`
- dependências: `PLAT-S32-001`, `PLAT-S03-001`, `PLAT-FOUNDATION-009`
- contrato: worker aceita somente job bounded com tenant/agent/version pinned,
  delega ao executor publicado e não inicia com bootstrap fictício
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- evidência:
  `docs/04_audit/0523_plat_s33_controlled_worker_runtime_boundary_evidence.md`
- resultado: schema strict/bounded, executor pinned, negativos de legacy/limite/
  mismatch, entrypoint sem bootstrap e gates integrados concluídos sem side
  effect externo
- limite: sem broker/retry distribuído, outbox, provider/canal real, deploy,
  dados reais ou side effect

## PLAT-S32 — Controlled Session Agent-Version Pinning

- id: `PLAT-S32-001_CONTROLLED_SESSION_AGENT_VERSION_PINNING`
- status: `COMPLETED_CONTROLLED`
- prioridade: P0
- fase: `AUDIT`
- owner: `agent-core/persistence/api/security`
- dependências: `PLAT-S31-001`, `PLAT-S08-001`, `PLAT-FOUNDATION-009`
- contrato: sessão runtime deve fixar o par tenant/agent/version uma única vez;
  continuations usam `PUBLISHED` ou `ARCHIVED` do mesmo agent e nenhum publish
  posterior troca o trace/version da conversa
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- evidência:
  `docs/04_audit/0522_plat_s32_controlled_session_version_pinning_evidence.md`
- limite: migration aditiva e fixtures controladas; sem dados reais,
  provider/canal/RAG, IdP/RBAC real, worker distribuído, deploy ou side effect

## P0 — Critico

### Item 1 — Aprovar gates documentais

- titulo: aprovar gates de Discovery, PRD e SPEC
- descricao: revisar documentacao e confirmar que ela pode orientar Build Phase 0
- modulo: governanca
- dependencia: revisao humana
- fase: pre-build
- risco: alto
- impacto: alto

### Item 2 — Definir regras finais de agenda

- titulo: formalizar confirmacao de consulta
- descricao: definir quando a Esmeralda V2 pode sugerir, criar draft ou confirmar consulta
- modulo: policy
- dependencia: decisao operacional
- fase: pre-workflow-agendamento
- risco: alto
- impacto: alto

### Item 3 — Iniciar Build Phase 0

- titulo: criar fundacao do monorepo
- descricao: implementar estrutura `apps` e `packages`, shared contracts e teste base
- modulo: repository
- dependencia: aprovacao humana explicita da Phase 0
- fase: build_phase_0
- risco: alto
- impacto: alto

### Item 4 — Mapear cargos reais para RBAC

- titulo: validar matriz de permissoes operacional
- descricao: mapear cargos reais do hospital para Operator, Approver, Supervisor e Admin
- modulo: security
- dependencia: decisao operacional
- fase: pre-panel-approvals
- risco: alto
- impacto: alto

### Item 5 — Implantar gates automatizaveis

- titulo: criar test, typecheck, lint, coverage e CI local
- descricao: garantir que toda sprint de codigo tenha verificacao executavel e repetivel
- modulo: repository
- dependencia: Build Phase 0
- fase: build_phase_0
- risco: alto
- impacto: alto

### Item 6 — Resolver vulnerabilidade transitiva moderada

- titulo: atualizar ou mitigar `uuid` transitivo em LangGraph/LangChain
- descricao: avaliar versoes compatíveis e evitar `npm audit fix --force` sem teste de regressao
- modulo: dependencies
- dependencia: Build Phase 0
- fase: build_phase_0
- risco: medio
- impacto: medio

## P1 — Alta prioridade

### Item 1 — Definir fonte RAG institucional

- titulo: selecionar base autorizada para duvidas institucionais
- descricao: definir documentos, responsavel, versao e politica de atualizacao
- modulo: rag
- dependencia: decisao de conteudo
- fase: build_phase_4
- risco: medio
- impacto: alto

### Item 2 — Definir politica de retencao

- titulo: governanca de retencao de dados
- descricao: definir retencao para mensagens, audit events, memory facts e tool calls
- modulo: dados
- dependencia: decisao de governanca
- fase: build_phase_6
- risco: medio
- impacto: alto
- status: parcialmente atendido por CC-S9 e auditado em `docs/09_debug_corrections/0909_cc_s9_audit_governance_review.md`; CC-S12 registra `docs/08_runtime/data_governance_signoff.md` com `APPROVED_FOR_REAL_DATA: false`; audit evidence em construcao controlada tem politica, minimizacao e redacao de PII comum, mas dados reais/piloto real ainda exigem decisao humana de retencao

## P2 — Medio

### Item 1 — Preparar audit runtime

- titulo: definir queries e dashboards de auditoria
- descricao: transformar criterios de audit em consultas e metricas operacionais
- modulo: audit
- dependencia: runtime funcional
- fase: hardening
- risco: medio
- impacto: medio
- status: atendido para construcao controlada por CC-S12; queries, resumo, export metadata, UI interna de revisao, governanca de retencao controlada, redacao de payload/PII, indices, paginacao de evidencia, pedido de export via aprovacao humana interna, idempotencia PostgreSQL, evidencia final reproduzivel, runbooks e boundary de release candidate existem; exporter externo real segue bloqueado

## PLAT-S03 — fronteira tenant/RLS pré-produção

- id: PLAT-S03-001
- status: COMPLETED_CONTROLLED
- entrega: migration PostgreSQL versionada com checksum, baseline legado explícito e aprovado, quarentena persistente de linhas nulas/incompatíveis, `FORCE ROW LEVEL SECURITY`, preflight de marker/policy, pool tenant-scoped com reset e role runtime DML-only
- evidência: `docs/04_audit/0494_plat_s03_tenant_isolation_evidence.md`
- limite: fixture fictícia; nenhum backfill, dado real, ativação irrestrita ou decisão humana foi executado

## PLAT-S04 — approval capability durável e gateway legado

- id: PLAT-S04-001
- status: COMPLETED_CONTROLLED
- entrega: issuer/verifier durável com hash de input, nonce, expiry, revocation e single-consume; adapter allowlist-only do `ToolRegistry` para `find_available_slots` em dry-run; conexão tenant-scoped e transação checked-out
- dependências: PLAT-S03 controlado; infraestrutura/IdP/provider real permanecem fora do escopo
- evidência: `docs/04_audit/0495_plat_s04_durable_approval_and_webhook_evidence.md`

- id: PLAT-S04-002
- status: COMPLETED_CONTROLLED
- entrega: verifier HMAC-SHA256 sobre raw body com janela temporal, rotação controlada de segredo, replay lease/purge e store abstrata; fixtures em memória e PostgreSQL controlado
- dependências: HA/observabilidade operacional, provider/canal real e rollout de replay distribuído permanecem fora do escopo
- evidência: `docs/04_audit/0495_plat_s04_durable_approval_and_webhook_evidence.md`

- id: PLAT-S04-003
- status: COMPLETED_CONTROLLED
- entrega: retry idempotente de inbound com `messages.runtime_status`, finalização PostgreSQL atômica de outbound/tool audit/trace/integration audit e lease HMAC liberado ou recuperável após falha/crash
- dependências: rollout RLS/backfill, fila distribuída, provider/canal real e compensação de side effects permanecem fora do escopo
- evidência: `docs/04_audit/0495_plat_s04_durable_approval_and_webhook_evidence.md`

## P3 — Baixo

### Item 1 — Planejar agentes futuros

- titulo: Billing, Medical Context e Quality Supervisor
- descricao: planejar agentes pos-MVP sem contaminar o escopo inicial
- modulo: future
- dependencia: MVP validado
- fase: pos-MVP
- risco: baixo
- impacto: medio

## PLAT-S05 — fechamento do Test Lab controlado

- id: `PLAT-S05-001`
- status: COMPLETED_CONTROLLED
- entrega: trace seguro com risco/prompt/timestamps/latência/tokens/spans, caso de medicamento veterinário explicitamente seguro, validação de IDs no gateway e correções de binding/renderização no Control Center
- evidência: `docs/platform/final-technical-audit.md`; testes unitários platform/policy, API/UI, `npm run verify`, readiness, E2E e smoke PostgreSQL
- limite: nenhum provider/canal/RAG/agenda real, dado real, side effect ou release de produção

- id: `PLAT-S05-002`
- status: COMPLETED_CONTROLLED
- entrega: preset idempotente `CVG Secretary` publicado somente no bootstrap de desenvolvimento e coberto por teste de lifecycle
- evidência: `packages/platform/src/secretary-preset.ts`, testes de preset/bootstrap, `npm run verify`, readiness e E2E; sem bootstrap automático em `NODE_ENV=test`
- limite: nenhum bootstrap automático em produção ou em tenant real

- id: `PLAT-S06-001`
- status: COMPLETED_CONTROLLED
- entrega: catálogo tenant-aware persistente de `TestCase`/`TestSuite`, clone versionado imutável, histórico redigido de avaliações e comparação A/B exclusivamente no Test Lab
- evidência: `docs/04_audit/0496_plat_s06_suite_catalog_evidence.md`; migration `0003_test_suite_catalog.sql`; API/UI, verify, readiness, E2E e smoke PostgreSQL controlado
- dependência: próximo lane exige novo SPEC; nenhum rollout, provider/canal ou tráfego real

## PLAT-S07 — conflito otimista do Control Center

- id: `PLAT-S07-001`
- status: COMPLETED_CONTROLLED
- entrega: precondition `expectedStatus` no lifecycle de AgentVersion, erro de conflito HTTP 409 sem mutação parcial, ausência de audit de sucesso no conflito e integração do status observado na UI
- evidência: `docs/04_audit/0497_plat_s07_optimistic_conflict_evidence.md`; verify, readiness, E2E, smoke PostgreSQL controlado, format e diff check
- limite: não representa HA, lock distribuído, ETag de proxy, IdP, coordenação multi-região ou autorização de produção

## PLAT-S08 — integridade de manifests e version pinning controlado

- id: `PLAT-S08-001`
- status: COMPLETED_CONTROLLED
- entrega: validação semântica de `PluginManifest`, versões imutáveis por nome, `version` opcional no `PluginBinding` e resolução determinística no gateway
- evidência: `docs/04_audit/0498_plat_s08_plugin_manifest_versioning_evidence.md`; verify, readiness, E2E, smoke PostgreSQL controlado, format e diff check
- limite: handlers permanecem fake/local; marketplace, rede, código de terceiros e integração externa continuam bloqueados

## PLAT-S09 — catálogo declarativo tenant-aware de plugins

- id: `PLAT-S09-001`
- status: COMPLETED_CONTROLLED
- entrega: persistência de manifests validados sem handlers, lifecycle DRAFT/APPROVED/ARCHIVED com precondition, isolamento tenant/RLS e API admin controlada
- evidência: `docs/04_audit/0499_plat_s09_plugin_catalog_evidence.md`; migration `0004_plugin_manifest_catalog.sql`; verify, readiness, E2E, smoke PostgreSQL, format, diff check e audit
- dependência: novo SPEC controlado; aprovação de metadata não concede execução, instalação, permission ou provider/canal

## Regras de uso

- Atualizar continuamente.
- Adicionar novos itens imediatamente.
- Priorizar por risco e impacto.
- Nao esconder debitos tecnicos.

## PLAT-S10 — Control Center do catálogo declarativo de plugins

- id: `PLAT-S10-001`
- status: COMPLETED_CONTROLLED
- entrega: client/API e seção do Control Center para listar, criar e transicionar
  metadata de plugins com tenant/identidade e precondition stale
- dependência: `PLAT-S09-001` e novo SPEC `docs/platform/06-platform-spec.md`
- evidência: `docs/04_audit/0500_plat_s10_plugin_catalog_control_center_evidence.md`
- limite: `APPROVED` continua metadata-only; sem instalação, handlers, rede,
  provider/canal, dados reais ou produção irrestrita

## PLAT-S11 — event bus e hooks de plugins controlados

- id: `PLAT-S11-001`
- status: COMPLETED_CONTROLLED
- entrega: event bus allowlisted, tenant-scoped e process-local; hooks de
  plugins locais exigem declaração no manifest, recebem payload redigido e
  imutável e não interrompem o pipeline em caso de erro
- dependência: `PLAT-S10-001`, `PLAT-S08-001` e SPEC registrada em
  `docs/platform/06-platform-spec.md`
- evidência: `docs/04_audit/0501_plat_s11_event_bus_hooks_evidence.md`,
  testes RED/GREEN do bus/registry e integração Test Lab, verify, readiness,
  E2E, audit e inspeção de que nenhum efeito externo foi adicionado
- limite: catálogo S09 continua metadata-only; sem broker, retry durável,
  webhook, marketplace, código de terceiros, provider/canal, dado real ou
  produção irrestrita

## PLAT-S12 — prompt profile e templates no Control Center

- id: `PLAT-S12-001`
- status: COMPLETED_CONTROLLED
- entrega: editor controlado de `promptBlocks`/`responseTemplates` com
  validação de formato, limites, duplicidade e segredo; nova AgentVersion para
  cada alteração; checksum/status do perfil no trace do Test Lab
- dependência: `PLAT-S11-001`, `PLAT-FOUNDATION-003`, `PLAT-FOUNDATION-006`
- aceite: blocos `system`/`safety` e respostas kernel não podem ser removidos
  ou alterados pelo editor; templates de baixa confiança, ausência de
  knowledge, handoff e scheduling sem evidência têm caminho controlado; edição
  preserva snapshots; checksum é determinístico; nenhum provider/canal ou
  efeito externo é adicionado
- evidência: `docs/04_audit/0502_plat_s12_prompt_profile_template_control_center_evidence.md`; suíte, coverage, readiness, build, E2E, PostgreSQL controlado, audit e diff check PASS
- limite: sem catálogo mutável separado, migration, RAG institucional, dados
  reais, ações clínicas/financeiras/prontuário, side effect ou produção
  irrestrita

## Agent Platform — sprint controlado `PLAT-S01`

O prompt de plataforma foi registrado como uma nova linha de produto compatível com o data plane da Secretary. O inventário, gaps, PRD, SPEC, ExecPlan e ADRs estão em `docs/platform/`.

### Tasks registradas

- `PLAT-FOUNDATION-001` — corrigir harness Vitest para aliases locais; **COMPLETED_CONTROLLED**
- `PLAT-FOUNDATION-002` — contratos/store tenant-aware de Agent e AgentVersion; **COMPLETED_CONTROLLED**
- `PLAT-FOUNDATION-003` — prompts, model refs, policies, feature flags e response templates; **COMPLETED_CONTROLLED**
- `PLAT-FOUNDATION-004` — manifest/registry/capability gateway; **COMPLETED_CONTROLLED**
- `PLAT-FOUNDATION-005` — Test Lab dry-run, trace, eval e regression; **COMPLETED_CONTROLLED**
- `PLAT-FOUNDATION-006` — API/UI Control Center, version list e rollback; **COMPLETED_CONTROLLED**
- `PLAT-FOUNDATION-007` — migração/repositório PostgreSQL tenant-aware; **COMPLETED_CONTROLLED**
- `PLAT-FOUNDATION-008` — state machine de takeover e silêncio do bot; **COMPLETED_CONTROLLED**
- `PLAT-FOUNDATION-009` — hardening, auditoria, headers, rate limit e CI/E2E; **COMPLETED_CONTROLLED**
- `PLAT-FOUNDATION-010` — integrar IdP confiável, tenant binding operacional e replay store distribuída; **WAITING_HUMAN_INFRA_DECISION**
- `PLAT-FOUNDATION-011` — tenant/RLS do data plane legado e adapter único para capability gateway; **COMPLETED_CONTROLLED**
- `PLAT-FOUNDATION-012` — rate limiter distribuído e política de retenção/PII para produção; **WAITING_HUMAN_INFRA_DECISION**
- `PLAT-FOUNDATION-013` — runtime publicado, histórico de traces redigidos, Trace Viewer e scheduling controlado via CapabilityGateway; **COMPLETED_CONTROLLED**
- `PLAT-FOUNDATION-014` — continuidade por sessão, takeover humano explícito, silêncio/retomada e escopo tenant-aware de tarefas/aprovações/auditoria; **COMPLETED_CONTROLLED**

O gate `IMPLEMENTATION_READY` foi satisfeito somente para construção controlada de `PLAT-FOUNDATION-001..014` e PLAT-S03/S04. Provider/canal/RAG/dados reais, produção irrestrita e ações sensíveis permanecem bloqueados; `PLAT-FOUNDATION-010` e `PLAT-FOUNDATION-012` ainda exigem decisão humana/infraestrutura.

### Fechamento da rodada de auditoria

`docs/04_audit/0493_platform_controlled_mvp_evidence.md` registra os gates finais: `npm run verify` com 166 testes aprovados e 5 skips, coverage acima de 80%, readiness, Playwright E2E, smoke PostgreSQL real com 11 testes e audit de dependências sem vulnerabilidades. PLAT-S02 fecha clone/edit versionado, approval/provenance fail-closed, ownership de trace, locks/rollback PostgreSQL e Trace Viewer com identidade do snapshot. O backlog controlado está pronto para o próximo passo; IdP/infraestrutura real, RLS/auditoria tenant-aware, approval durável, conflitos multioperador e qualquer provider/canal/RAG/ação sensível permanecem bloqueados.

## Agent Platform — sprint controlado `PLAT-S02`

Hardening derivado da auditoria do `PLAT-S01`, ainda restrito a fixtures controladas e sem autorização de produção real:

- `PLAT-HARDENING-001` — edição versionada pelo Control Center sem mutar snapshots; **COMPLETED_CONTROLLED**
- `PLAT-HARDENING-002` — approval e trace fail-closed; **COMPLETED_CONTROLLED**
- `PLAT-HARDENING-003` — publish PostgreSQL serializado; **COMPLETED_CONTROLLED**
- `PLAT-HARDENING-004` — Trace Viewer operacional completo e redigido; **COMPLETED_CONTROLLED**

O gate autoriza somente a construção controlada dos quatro itens acima, agora concluídos nesse limite. IdP tenant-bound, RLS/backfill do data plane legado, limiter/replay store distribuídos, retenção/PII, expansão do ToolRegistry, providers/canais/RAG reais e ações sensíveis continuam bloqueados.

## Agent Platform — sprint de fronteira pré-produção `PLAT-S03`

Task registrada antes do BUILD para fechar o maior risco técnico observável sem ampliar a autorização operacional:

- `PLAT-S03-001` — migration versionada, contexto tenant por conexão, `FORCE ROW LEVEL SECURITY` no data plane legado e auditoria/outbox tenant-aware; **COMPLETED_CONTROLLED**

O aceite desta sprint é exclusivamente controlado: schema fictício de fixture, pool/conexão dedicada por escopo, reset/verificação de contexto, roles migration/runtime separadas, quarentena fail-closed de auditoria/outbox e bloqueio cross-tenant comprovados. Backfill, IdP confiável, role mapping operacional, retenção, secrets manager e ativação em banco real continuam dependentes de decisão humana/infraestrutura.

## PLAT-S13 — Handoff Policy Studio controlado

- id: `PLAT-S13-001_HANDOFF_POLICY_STUDIO`
- status: `COMPLETED_CONTROLLED`
- entrega: thresholds configuráveis com limites, clarificações,
  destinos múltiplos, prioridade e trace redigido no Test Lab
- dependências: `PLAT-S12-001`, `PLAT-FOUNDATION-003`, `PLAT-FOUNDATION-008`
- SPEC/gate: `docs/platform/06-platform-spec.md` /
  `SPEC_APPROVED_CONTROLLED_BUILD`
- gates: 79 arquivos/284 testes pass/16 skips, coverage 84,98%/80,44%/86,00%/85,92%, readiness 4/4, E2E 1/1, PostgreSQL 49 pass/16 skips, audit sem vulnerabilidades, format e diff check PASS
- evidência: `docs/04_audit/0503_plat_s13_handoff_policy_studio_evidence.md`
- limite: sem canal/provider/RAG/dado real/migration/side effect/produção

## PLAT-S14 — Controlled Safety Publish Preflight

- id: `PLAT-S14-001_CONTROLLED_SAFETY_PUBLISH_PREFLIGHT`
- status: COMPLETED_CONTROLLED
- entrega: suíte crítica fixa e redigida executada no candidato antes de
  publish/rollback, endpoint de preflight, bloqueio fail-closed sem mutação e
  audit seguro
- dependências: `PLAT-S06-001`, `PLAT-S07-001`, `PLAT-S13-001`
- SPEC/gate: `docs/platform/06-platform-spec.md` /
  `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: somente Test Lab fake/fixtures; sem cases arbitrários, provider,
  canal, RAG, migration, dado real, side effect ou produção irrestrita
- evidência: `docs/04_audit/0504_plat_s14_controlled_safety_publish_preflight_evidence.md`
- gates: 80 arquivos/289 testes pass/16 skips, coverage 85,06%/80,38%/85,97%/85,98%, readiness, E2E, PostgreSQL controlado, audit e diff check PASS

## PLAT-S15 — Controlled Knowledge Source Catalog

- id: `PLAT-S15-001_CONTROLLED_KNOWLEDGE_SOURCE_CATALOG`
- status: COMPLETED_CONTROLLED
- entrega: catálogo tenant-aware metadata-only de source/version/label/
  description, lifecycle, unique/RLS, API/UI e audit redigido
- dependências: `PLAT-S05-001`, `PLAT-S06-001`, `PLAT-S14-001`
- SPEC/gate: `docs/platform/06-platform-spec.md` /
  `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem conteúdo, ingestão, embeddings, vector store, RAG, crawler,
  upload, URL externa, provider, canal, dado real ou side effect
- evidência: `docs/04_audit/0505_plat_s15_controlled_knowledge_source_catalog_evidence.md`
- gates finais: 83 arquivos/294 testes pass/17 skips, coverage 85,03%/80,26%/
  85,41%/85,88%, readiness, E2E, PostgreSQL controlado, audit e diff check PASS

## PLAT-S16 — Controlled Release Candidate Evidence Ledger

- id: `PLAT-S16-001_CONTROLLED_RELEASE_CANDIDATE_EVIDENCE_LEDGER`
- status: COMPLETED_CONTROLLED
- entrega: ledger tenant-aware imutável de quatro gates controlados,
  evidence refs bounded, digest determinístico, lifecycle/CAS, migration/RLS,
  API/UI e audit metadata-only
- dependências: `PLAT-S14-001`, `PLAT-S15-001`, `PLAT-FOUNDATION-006`
- SPEC/gate: `docs/platform/06-platform-spec.md` /
  `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: `VALIDATED` não publica, não faz deploy, não altera AgentVersion ou
  activeVersionId e não habilita provider/canal/RAG/dado real/side effect
- evidência: `docs/04_audit/0506_plat_s16_controlled_release_candidate_evidence_ledger_evidence.md`
- gates finais: 88 arquivos/303 testes pass/18 skips, coverage 84,81%/80,03%/
  84,87%/85,65%, readiness, E2E, PostgreSQL controlado, audit, format e diff
  check PASS

## PLAT-S17 — Controlled Audit Evidence Checkpoint

- id: `PLAT-S17-001_CONTROLLED_AUDIT_EVIDENCE_CHECKPOINT`
- status: COMPLETED_CONTROLLED
- entrega planejada: checkpoint tenant-aware imutável de até 200 IDs de
  auditoria, filtros bounded, digest canônico, lifecycle SEALED/ARCHIVED,
  migration/RLS, API/client/UI e audit metadata-only
- dependências: `PLAT-S16-001`, `PLAT-FOUNDATION-006`
- SPEC/gate: `docs/platform/06-platform-spec.md` /
  `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem payload bruto, export externo, retenção real, alteração de
  eventos, provider/canal, RAG, dado real ou side effect
- evidência: `docs/04_audit/0507_plat_s17_controlled_audit_evidence_checkpoint_evidence.md`
- gates finais: `npm run verify` PASS; 95 arquivos/317 testes pass/18 skips;
  coverage 84,95%/80,00%/84,52%/85,82%; readiness 4/4; E2E 2/2;
  PostgreSQL controlado 51 pass/18 skips; audit e diff check PASS
- resultado: `CONTROLLED_MVP_READY`; produção `NO-GO`/
  `WAITING_HUMAN_APPROVAL`

## PLAT-S18 — Controlled HTTP Security Boundary

- id: `PLAT-S18-001_CONTROLLED_HTTP_SECURITY_BOUNDARY`
- status: COMPLETED_CONTROLLED
- entrega planejada: boundary Fastify de origin/CORS/preflight (`GET/POST/PATCH/OPTIONS`), HTTPS com proxy
  explícito, headers CSP/HSTS e bootstrap fail-closed por env
- dependência: `PLAT-S17-001`, `PLAT-FOUNDATION-009` e SPEC registrada em
  `docs/platform/06-platform-spec.md`
- aceite: sem wildcard/`null`/origins não normalizadas; preflight e headers
  allowlisted; transporte HTTP rejeitado quando exigido; production bootstrap
  exige origins e `API_REQUIRE_HTTPS=true`; nenhuma chamada externa ou mudança
  no data plane legado
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: não substitui host CORS/HTTPS/CSP, IdP, proxy real, deploy, provider,
  canal, RAG, dado real ou side effect
- evidência: `docs/04_audit/0508_plat_s18_controlled_http_security_boundary_evidence.md`

### Resultado controlado PLAT-S18

- `PLAT-S18-001_CONTROLLED_HTTP_SECURITY_BOUNDARY` = `COMPLETED_CONTROLLED`.
- Gates: `npm run verify` PASS; 97 arquivos/330 testes pass/18 skips;
  coverage 85,16%/80,44%/84,75%/86,06%; readiness 4/4; E2E 3/3;
  PostgreSQL controlado 51 pass/18 skips; audit 0; format e diff check PASS.
- `CONTROLLED_MVP_READY` permanece; produção real é `NO-GO`/
  `WAITING_HUMAN_APPROVAL`.

## PLAT-S19 — Controlled Request Observability Metrics

- id: `PLAT-S19-001_CONTROLLED_REQUEST_OBSERVABILITY_METRICS`
- status: COMPLETED_CONTROLLED
- entrega planejada: collector process-local bounded por template de rota,
  método/status/latência, fallback de 404/security rejection e endpoint
  read-only `/health/metrics`
- dependência: `PLAT-S18-001`, `PLAT-FOUNDATION-009` e SPEC registrada em
  `docs/platform/06-platform-spec.md`
- aceite: snapshot redaction-safe e defensivo, cardinalidade limitada,
  nenhuma informação de path/query/body/header/identidade e gates existentes
  preservados
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: não substitui Prometheus/OTel/broker/storage distribuído, retenção,
  alerting, HA, deploy, provider/canal, RAG, dado real ou side effect
- evidência: `docs/04_audit/0509_plat_s19_controlled_request_observability_metrics_evidence.md`

### Resultado controlado PLAT-S19

- `PLAT-S19-001_CONTROLLED_REQUEST_OBSERVABILITY_METRICS` =
  `COMPLETED_CONTROLLED`.
- Gates: `npm run verify` PASS; 98 arquivos/333 testes pass/18 skips;
  coverage 85,24%/80,63%/84,99%/86,16%; readiness 4/4; E2E 3/3;
  PostgreSQL controlado 51 pass/18 skips; audit 0; format e diff check PASS.
- `CONTROLLED_MVP_READY` permanece; produção real é `NO-GO`/
  `WAITING_HUMAN_APPROVAL`.

## PLAT-S20 — Controlled Rate Limit Memory Safety

- id: `PLAT-S20-001_CONTROLLED_RATE_LIMIT_MEMORY_SAFETY`
- status: COMPLETED_CONTROLLED
- entrega planejada: limiter process-local com capacidade bounded, purge de
  expirados, evicção determinística, validação fail-closed e 429 sem cache
- dependência: `PLAT-S19-001`, `PLAT-FOUNDATION-009` e SPEC registrada em
  `docs/platform/06-platform-spec.md`
- aceite: `bucketCount <= maxBuckets`, nenhum snapshot expõe chaves/IPs/tokens,
  policy e key inválidas falham, contrato `Retry-After` permanece compatível e
  `Cache-Control: no-store` é emitido no 429
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: não substitui limiter distribuído/edge, IdP, HA, provider/canal, RAG,
  dado real, deploy ou side effect
- evidência planejada:
  `docs/04_audit/0510_plat_s20_controlled_rate_limit_memory_safety_evidence.md`

### Resultado controlado PLAT-S20

- `PLAT-S20-001_CONTROLLED_RATE_LIMIT_MEMORY_SAFETY` =
  `COMPLETED_CONTROLLED`.
- Gates: `npm run verify` PASS; 98 arquivos/335 testes pass/18 skips;
  coverage 85,31%/80,72%/85,07%/86,23%; readiness 4/4; E2E 3/3;
  PostgreSQL controlado 51 pass/18 skips; audit 0; format e diff check PASS.
- O limiter local ficou bounded, mas produção segue bloqueada por rate
  limiting distribuído/edge, identidade operacional e demais critérios PROD.
- Evidência: `docs/04_audit/0510_plat_s20_controlled_rate_limit_memory_safety_evidence.md`.

## PLAT-S21 — Controlled Metrics Exposure Boundary

- id: `PLAT-S21-001_CONTROLLED_METRICS_EXPOSURE_BOUNDARY`
- status: COMPLETED_CONTROLLED
- entrega planejada: `/health/metrics` enabled only in test/development,
  fail-closed 404 elsewhere and `Cache-Control: no-store`
- dependência: `PLAT-S20-001`, `PLAT-S19-001` e SPEC registrada em
  `docs/platform/06-platform-spec.md`
- aceite: production/staging/unknown não exportam snapshot mesmo com override;
  `/health` e collector permanecem inalterados
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: não substitui auth/IdP, allowlist de rede, Prometheus/OTel, HA,
  provider/canal, RAG, dado real, deploy ou side effect
- evidência: `docs/04_audit/0511_plat_s21_controlled_metrics_exposure_boundary_evidence.md`

### Resultado controlado PLAT-S21

- `PLAT-S21-001_CONTROLLED_METRICS_EXPOSURE_BOUNDARY` =
  `COMPLETED_CONTROLLED`.
- Gates: `npm run verify` PASS; 99 arquivos/337 testes pass/18 skips;
  coverage 85,33%/80,74%/85,07%/86,25%; readiness 4/4; E2E 3/3;
  PostgreSQL controlado 51 pass/18 skips; audit 0; format e diff check PASS.
- `/health/metrics` não exporta snapshot fora de test/development; produção
  continua bloqueada por auth/edge/observabilidade operacional e demais PROD.
- Evidência: `docs/04_audit/0511_plat_s21_controlled_metrics_exposure_boundary_evidence.md`.

## PLAT-S22 — Controlled Correlation Response Boundary

- id: `PLAT-S22-001_CONTROLLED_CORRELATION_RESPONSE_BOUNDARY`
- status: COMPLETED_CONTROLLED
- entrega planejada: publicar `meta.correlationId` em `X-Correlation-Id` sem
  aceitar ou refletir header externo; expor o header somente em CORS aprovado
- dependência: `PLAT-S21-001`, `PLAT-S18-001` e SPEC registrada em
  `docs/platform/06-platform-spec.md`
- aceite: respostas JSON envelopadas, erros de boundary e server-to-server
  correlacionam; preflight/non-envelope não inventam header; CORS expõe apenas
  o header; nenhum body, identidade ou tenant é alterado
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: não substitui tracing distribuído, OTel, IdP, observabilidade HA,
  provider/canal, RAG, dado real, deploy ou side effect
- evidência:
  `docs/04_audit/0512_plat_s22_controlled_correlation_response_boundary_evidence.md`

### Resultado controlado PLAT-S22

- `PLAT-S22-001_CONTROLLED_CORRELATION_RESPONSE_BOUNDARY` =
  `COMPLETED_CONTROLLED`.
- Gates: `npm run verify` PASS; 100 arquivos/343 testes pass/18 skips;
  coverage 85,37%/80,81%/85,10%/86,29%; readiness 4/4; E2E 3/3;
  PostgreSQL controlado 51 pass/18 skips; audit 0; format e diff check PASS.
- O header é derivado do envelope e não altera auth, tenant, body ou
  observabilidade distribuída; produção continua bloqueada pelos critérios
  PROD.
- Evidência: `docs/04_audit/0512_plat_s22_controlled_correlation_response_boundary_evidence.md`.

## PLAT-S31 — Controlled Approval Decision Note Field Boundary

- id: `PLAT-S31-001_CONTROLLED_APPROVAL_DECISION_NOTE_FIELD_BOUNDARY`
- status: COMPLETED_CONTROLLED
- owner: api/agent-core/security
- dependências: `PLAT-S30-001`, `PLAT-S24-001`, `PLAT-FOUNDATION-009`
- descoberta: `ResolveApprovalSchema.note` era opcional e sem máximo; uma
  decisão fictícia em `/v1/approvals/:approvalRequestId/decision` aceitou
  `note` com 5.000 caracteres e persistiu `approved`, sem ecoar ou persistir a
  nota
- entrega planejada: limitar `note` a 4.000 no schema compartilhado antes de
  `approvals.save`, preservando decisão, operador, approval state, handoff e a
  semântica atual de não persistência de `note`
- aceite: `note` acima do limite retorna `validation_failed`/400 sem chamar o
  repositório e sem mudar estado; valor no limite mantém decisão válida
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: somente validação de entrada com fixtures; sem mudança de auth,
  tenant, identidade, decisão humana, provider/canal, RAG, dado real, deploy ou
  side effect
- evidência: `docs/04_audit/0521_plat_s31_controlled_approval_decision_note_field_boundary_evidence.md`

### Registro controlado PLAT-S31

- A lacuna foi reproduzida antes do BUILD com approval, sessão e tenant
  fictícios; o lane trata somente o tamanho da nota no contrato de decisão.
  RED/GREEN, regressão próxima, verify e gates externos foram concluídos como
  `COMPLETED_CONTROLLED`.

### Resultado controlado PLAT-S31

- O schema compartilhado agora rejeita `note` acima de 4.000 com
  `validation_failed`/400 antes de `approvals.save`, sem echo e sem mudar o
  approval pending; nota no limite mantém decisão `approved`.
- Verify passou com 109 arquivos/397 testes pass/18 skips; coverage
  85,45%/80,83%/85,26%/86,45%; readiness 4/4; E2E 3/3; PostgreSQL 51/18;
  audit 0; format, JSON e diff check PASS. Evidência:
  `docs/04_audit/0521_plat_s31_controlled_approval_decision_note_field_boundary_evidence.md`.
- Produção real permanece `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## PLAT-S30 — Controlled Approval Request Field Boundary

- id: `PLAT-S30-001_CONTROLLED_APPROVAL_REQUEST_FIELD_BOUNDARY`
- status: COMPLETED_CONTROLLED
- owner: api/agent-core/security
- dependências: `PLAT-S29-001`, `PLAT-S24-001`, `PLAT-FOUNDATION-009`
- descoberta: `RequestHumanApprovalSchema` não tinha máximos; uma fixture
  tenant-scoped persistiu `summary` com 5.000 caracteres em `/v1/approvals`
- entrega: limites no schema compartilhado antes de `approvals.save`:
  `sessionId` 160, `proposedAction` 200 e `summary` 4.000
- aceite: cada campo acima do limite retorna `validation_failed`/400 sem chamar
  o repositório e sem echo; payload válido preserva tenant, auth, handoff,
  approval pending e decisão humana
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: somente validação de entrada com fixtures; sem mudança de decisão de
  approval, provider/canal, RAG, dado real, deploy ou side effect
- evidência: `docs/04_audit/0520_plat_s30_controlled_approval_request_field_boundary_evidence.md`

### Registro controlado PLAT-S30

- A lacuna foi reproduzida antes do BUILD com dados fictícios e sessão/tenant
  controlados; RED/GREEN, regressão próxima, verify e gates externos foram
  concluídos como `COMPLETED_CONTROLLED`.

### Resultado controlado PLAT-S30

- Verify passou com 108 arquivos/394 testes pass/18 skips; coverage
  85,45%/80,83%/85,26%/86,45%; readiness 4/4; E2E 3/3; PostgreSQL 51
  pass/18 skips; audit 0; format e diff check PASS.
- Os três campos acima do limite falham com `validation_failed`/400 antes do
  repositório; valores nos máximos continuam válidos. Evidência:
  `docs/04_audit/0520_plat_s30_controlled_approval_request_field_boundary_evidence.md`.
- Produção real permanece `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## PLAT-S29 — Controlled Internal Task Field Boundary

- id: `PLAT-S29-001_CONTROLLED_INTERNAL_TASK_FIELD_BOUNDARY`
- status: COMPLETED_CONTROLLED
- owner: api/agent-core/security
- dependências: `PLAT-S28-001`, `PLAT-S24-001`, `PLAT-FOUNDATION-009`
- descoberta: `CreateInternalTaskSchema` aceitava campos livres sem máximo; uma
  fixture com sessão/tenant fictícios persistiu quatro campos com 5.000
  caracteres em `POST /v1/tasks`
- entrega: limites no schema compartilhado antes de `tasks.create`:
  `sessionId` 160, `title` 200, `description` 4.000, `source` 120 e
  `idempotencyKey` 200, preservando o mínimo 8 da chave
- aceite: cada campo acima do limite retorna `validation_failed`/400 sem chamar
  o repositório; payload válido continua criando tarefa e preserva tenant,
  auth, idempotência e Secretary
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: somente validação de entrada com fixtures; sem mudança de auth/tenant,
  persistência estrutural, provider/canal, RAG, dado real, deploy ou side effect
- evidência: `docs/04_audit/0519_plat_s29_controlled_internal_task_field_boundary_evidence.md`

### Registro controlado PLAT-S29

- A lacuna foi reproduzida antes do BUILD com dados fictícios e escopo tenant
  controlado; a correção será limitada ao contrato de entrada de criação de
  tarefa.
- RED/GREEN, regressão próxima, verify e gates externos foram concluídos como
  `COMPLETED_CONTROLLED`; nenhum contrato de produção foi ampliado.

### Resultado controlado PLAT-S29

- Verify passou com 107 arquivos/389 testes pass/18 skips; coverage
  85,45%/80,83%/85,26%/86,45%; readiness 4/4; E2E 3/3; PostgreSQL 51
  pass/18 skips; audit 0; format e diff check PASS.
- Os cinco campos acima do limite falham com `validation_failed`/400 antes do
  repositório; valores nos máximos continuam válidos. Evidência:
  `docs/04_audit/0519_plat_s29_controlled_internal_task_field_boundary_evidence.md`.
- Produção real permanece `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## PLAT-S28 — Controlled Audit Filter Duplicate Boundary

- id: `PLAT-S28-001_CONTROLLED_AUDIT_FILTER_DUPLICATE_BOUNDARY`
- status: COMPLETED_CONTROLLED
- owner: api/audit/security
- dependências: `PLAT-S27-001`, `PLAT-S25-001`, `PLAT-FOUNDATION-009`
- entrega: rejeição fail-closed de filtros repetidos de audit evidence
  antes de `summarizeEvidence`/`listEvidence`
- aceite: filtro único permanece válido; array/repetição de `sessionId`,
  `correlationId`, `actorId` ou `type` retorna `validation_failed`/400 sem
  chamada ao repositório
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem mudança de offset/limit, auth/tenant/identity, Secretary,
  persistência, provider/canal, RAG, dado real, deploy ou side effect
- evidência: `docs/04_audit/0518_plat_s28_controlled_audit_filter_duplicate_boundary_evidence.md`

### Registro controlado PLAT-S28

- `sessionId=a&sessionId=b` foi reproduzido como 200; somente `a` chegou ao
  repositório, criando ambiguidade silenciosa.
- RED/GREEN, regressão próxima, verify e gates externos foram concluídos como
  `COMPLETED_CONTROLLED`; nenhum contrato de produção foi ampliado.

### Resultado controlado PLAT-S28

- Verify passou com 106 arquivos/382 testes pass/18 skips; coverage
  85,45%/80,83%/85,26%/86,45%; readiness 4/4; E2E 3/3; PostgreSQL 51
  pass/18 skips; audit 0; format e diff check PASS.
- Filtros repetidos falham antes de summary/page; filtro único e paginação
  permanecem válidos. Evidência:
  `docs/04_audit/0518_plat_s28_controlled_audit_filter_duplicate_boundary_evidence.md`.
- Produção real permanece `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## PLAT-S27 — Controlled Pagination Offset Boundary

- id: `PLAT-S27-001_CONTROLLED_PAGINATION_OFFSET_BOUNDARY`
- status: COMPLETED_CONTROLLED
- owner: api/persistence/security
- dependências: `PLAT-S26-001`, `PLAT-S24-001`, `PLAT-FOUNDATION-009`
- entrega: offset máximo explícito de 10.000 e rejeição de números
  não seguros antes do repositório em conversas/audit evidence
- aceite: offset 0..10.000 aceito; negativo, não inteiro, não seguro ou maior
  que 10.000 retorna `invalid_pagination`/400 sem chamada ao repositório
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem mudança de limit/cursor, auth/tenant/identity, Secretary,
  persistência estrutural, provider/canal, RAG, dado real, deploy ou side effect
- evidência: `docs/04_audit/0517_plat_s27_controlled_pagination_offset_boundary_evidence.md`

### Registro controlado PLAT-S27

- A reprodução aceitou `offset=1e100` e `offset=9007199254740992` com 200 no
  endpoint de conversas; o valor também alimenta `OFFSET` PostgreSQL.
- RED/GREEN, regressão próxima, verify e gates externos foram concluídos como
  `COMPLETED_CONTROLLED`; nenhum contrato de produção foi ampliado.

### Resultado controlado PLAT-S27

- Verify passou com 105 arquivos/376 testes pass/18 skips; coverage
  85,43%/80,80%/85,25%/86,44%; readiness 4/4; E2E 3/3; PostgreSQL 51
  pass/18 skips; audit 0; format e diff check PASS.
- Offsets inválidos falham antes do repositório em conversas e audit evidence;
  offset 10.000 e `limit=1` permanecem válidos. Evidência:
  `docs/04_audit/0517_plat_s27_controlled_pagination_offset_boundary_evidence.md`.
- Produção real permanece `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## PLAT-S26 — Controlled Prompt Profile Error Message Boundary

- id: `PLAT-S26-001_CONTROLLED_PROMPT_PROFILE_ERROR_MESSAGE_BOUNDARY`
- status: COMPLETED_CONTROLLED
- owner: platform/api/security
- dependências: `PLAT-S25-001`, `PLAT-S12-001`, `PLAT-FOUNDATION-009`
- entrega: mensagens constantes para erros de chave/ID do Prompt
  Profile, sem echo de valores fornecidos no payload
- aceite: response-template key inválido, prompt block ID duplicado ou protected
  não aparece na resposta; código/status/envelope/correlation e ausência de
  clone permanecem corretos
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem auth/tenant/identity, Secretary, persistência, provider/canal,
  RAG, dado real, deploy ou side effect
- evidência: `docs/04_audit/0516_plat_s26_controlled_error_message_boundary_evidence.md`

### Registro controlado PLAT-S26

- A reprodução encontrou `error.message` contendo um `responseTemplates` key
  inválido fornecido pelo operador (`token=fixture-secret<script>`).
- O próximo passo obrigatório é escrever RED; nenhuma implementação S26 foi
  iniciada e nenhum contrato de produção foi ampliado.

### Resultado controlado PLAT-S26

- `PLAT-S26-001_CONTROLLED_PROMPT_PROFILE_ERROR_MESSAGE_BOUNDARY` =
  `COMPLETED_CONTROLLED`.
- Gates: focused 4/4; regressão 3 arquivos/21 testes; verify 104 arquivos/371
  testes pass/18 skips; coverage 85,41%/80,77%/85,24%/86,42%; readiness 4/4;
  E2E 3/3; PostgreSQL 51 pass/18 skips; audit 0; format e diff check PASS.
- Evidência: `docs/04_audit/0516_plat_s26_controlled_error_message_boundary_evidence.md`.
  Produção real continua bloqueada.

## PLAT-S25 — Controlled HTTP Request-Target Boundary

- id: `PLAT-S25-001_CONTROLLED_HTTP_TARGET_BOUNDARY`
- status: COMPLETED_CONTROLLED
- owner: api/security/operations
- dependências: `PLAT-S24-001`, `PLAT-S18-001`, `PLAT-FOUNDATION-009`
- entrega: request-target raw bounded em 8192 bytes, maxParamLength
  explícito de 100 e not-found handler com envelope/correlation ID sem echo de
  path/query
- aceite: unknown route 404 `not_found` genérico; target acima de 8 KiB 414
  `request_uri_too_long`; nenhum path/query/segredo é refletido; rotas atuais
  e Secretary permanecem compatíveis
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem auth/tenant/identity, body/parser, Secretary, persistência,
  provider/canal, RAG, dado real, deploy ou side effect
- evidência: `docs/04_audit/0515_plat_s25_controlled_http_target_boundary_evidence.md`

### Resultado controlado PLAT-S25

- `PLAT-S25-001_CONTROLLED_HTTP_TARGET_BOUNDARY` = `COMPLETED_CONTROLLED`.
- Gates: verify 103 arquivos/367 testes pass/18 skips; coverage
  85,41%/80,76%/85,24%/86,42%; readiness 4/4; E2E 3/3; PostgreSQL 51
  pass/18 skips; audit 0; format e diff check PASS.
- O 404 agora é envelope `not_found` correlacionado e target acima de 8192
  bytes falha com 414 sem refletir path/query; produção continua bloqueada.

## PLAT-S24 — Controlled HTTP Parse and Payload Boundary

- id: `PLAT-S24-001_CONTROLLED_HTTP_PARSE_PAYLOAD_BOUNDARY`
- status: COMPLETED_CONTROLLED
- owner: api/security/operations
- dependências: `PLAT-S23-001`, `PLAT-S18-001`, `PLAT-FOUNDATION-009`
- entrega: bodyLimit explícito de 1 MiB, parser JSON bounded, classificação
  segura de parse/media type/body excessivo e envelope global com correlation ID
- aceite: JSON inválido 400 `validation_failed`, media type 415
  `unsupported_media_type`, body excessivo 413 `payload_too_large`; erro
  desconhecido 500 genérico; sem raw body, stack, cause ou mensagem arbitrária
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: sem upload, streaming, provider/canal, RAG, dado real, deploy,
  alteração de auth/tenant ou side effect
- evidência: `docs/04_audit/0514_plat_s24_controlled_http_parse_payload_boundary_evidence.md`

### Resultado controlado PLAT-S24

- `PLAT-S24-001_CONTROLLED_HTTP_PARSE_PAYLOAD_BOUNDARY` =
  `COMPLETED_CONTROLLED`.
- Gates: `npm run verify` PASS; 102 arquivos/359 testes pass/18 skips;
  coverage 85,46%/80,85%/85,21%/86,40%; readiness 4/4; E2E 3/3;
  PostgreSQL controlado 51 pass/18 skips; audit 0; format e diff check PASS.
- O boundary retorna envelope seguro para parse/media type/body excessivo e
  não altera o Secretary; produção continua bloqueada pelos critérios PROD.

## PLAT-S23 — Controlled Startup Failure Redaction

- id: `PLAT-S23-001_CONTROLLED_STARTUP_FAILURE_REDACTION`
- status: COMPLETED_CONTROLLED
- entrega: formatter de falha de startup bounded/redaction-safe, saída JSON
  mínima no entrypoint e ausência de serialização de stack/cause
- dependência: `PLAT-S22-001`, `PLAT-FOUNDATION-009` e SPEC registrada em
  `docs/platform/06-platform-spec.md`
- aceite: URL com credencial, bearer/token, password/secret/apiKey, PII,
  newline e mensagens excessivas não vazam nem permitem log injection; erro
  desconhecido é genérico; exit code e fail-closed permanecem
- gate: `SPEC_APPROVED_CONTROLLED_BUILD`
- limite: não substitui logger/alerting distribuído, IdP, tenant binding,
  providers/canais, RAG, dados reais, deploy ou side effect
- evidência:
  `docs/04_audit/0513_plat_s23_controlled_startup_failure_redaction_evidence.md`

### Resultado controlado PLAT-S23

- `PLAT-S23-001_CONTROLLED_STARTUP_FAILURE_REDACTION` =
  `COMPLETED_CONTROLLED`.
- Gates: `npm run verify` PASS; 101 arquivos/351 testes pass/18 skips;
  coverage 85,42%/80,84%/85,16%/86,33%; readiness 4/4; E2E 3/3;
  PostgreSQL controlado 51 pass/18 skips; audit 0; format e diff check PASS.
- O smoke do entrypoint preservou exit 1 e produziu somente JSON redigido;
  produção continua bloqueada pelos critérios PROD.
