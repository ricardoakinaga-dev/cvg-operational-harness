# CVG Operational Harness

CVG Operational Harness is a governed runtime foundation for reusable operational AI agents across the CVG ecosystem.

## Estado atual — 2026-09-26 — PROD-20260926

- Programa de produção controlada proposto: [plano executivo](docs/03_build/0354_production_executive_plan_2026-09-26.md),
  [roadmap](docs/03_build/0355_production_roadmap_2026-09-26.md) e
  [backlog PR-001–PR-709](docs/03_build/0356_production_backlog_2026-09-26.md),
  a partir da [auditoria AUD-0577](docs/04_audit/0577_production_readiness_score_audit_2026-09-26.md)
  (nota geral 68/100; prontidão para produção 25/100).
- Todas as tasks estão `PROPOSED` e aguardam decisão humana. Produção `NO_GO`.

## Estado anterior — 2026-09-26 — AUD-0576

- A [auditoria AUD-0576](docs/04_audit/0576_repository_score_audit_2026-09-26.md)
  emiti nota de 0–100 por item: documentação 65, código 72, qualidade/CI 79,
  processo 58, nota geral `69/100`. Remediação em
  [roadmap R0–R5](docs/03_build/0352_score_roadmap_2026-09-26.md) e
  [backlog RA26-01–17](docs/03_build/0353_score_backlog_2026-09-26.md),
  todas as tasks `PROPOSED` até decisão humana.
- Estado verificado na rodada: `prettier`, `typecheck`, `lint`,
  `docs:check-links` e `evidence:check-hygiene` exit 0; porém
  `node scripts/phase10-verify.mjs` retorna 5 falhas (`CANDIDATE_DRIFT` pelo
  worktree sujo e `coverage/coverage-summary.json` ausente) — a certificação
  não é reproduzível neste instante.

## Estado anterior — 2026-09-25 — AUD-0573 / AUD53

- O ciclo [AUD-0573](docs/04_audit/0573_repository_audit_executed_gates_2026-09-24.md)
  foi executado: RA25-01, RA25-02, RA25-03, RA25-06, RA25-08, RA25-09 e RA25-10
  concluídos; RA25-05 segue `BLOCKED_BY_C1M`; RA25-07 (fatias de hotspot) e
  RA25-04 permanecem abertos. Evidência em
  [0574](docs/04_audit/0574_aud0573_execution_evidence_2026-09-25.md).
- O certificado foi corrigido em AUD53: a adjudicação dos 26 findings de
  `AUD-20260921/REM21-019` permanece imutável e o vínculo de candidato/runId
  passou a ser gerado por execução. `npm run certify` (16 gates) e
  `npm run certification:verify` passaram a verde. Ver
  [0575](docs/04_audit/0575_aud53_closure_rebind_decision_packet.md) e
  [SPEC-CERT-001](docs/02_spec/0132_run_bound_closure_registry.md).
- Gates correntes: `npm test` 324 arquivos / 2 293 testes; cobertura
  92,6 / 87,71 / 94,95 / 93,58; `test:postgres`, `test:chaos`, `test:restore`,
  `test:load` e `test:evals` exit 0; `audit:security` 0 vulnerabilidades.
- Certificado mecânico `CONDITIONAL_GO / AAA_CONTROLLED`. M07-S1 continua
  `FAIL / OPEN` e o packet `A24-03-C1M-PACKET` segue documental, sem gate
  aprovado — a baseline C1M precisa ser rederivada porque
  `docs/02_spec/0190_spec_validation.md` mudou para `443f6a…`.
- Navegação: [`docs/README.md`](docs/README.md),
  [`docs/99_operational_index.md`](docs/99_operational_index.md),
  [`docs/30_backlog_master.md`](docs/30_backlog_master.md) e
  [`docs/99_runtime_state.md`](docs/99_runtime_state.md).
- Produção permanece `NO_GO`: nenhum dado real, provider/canal, credencial,
  deploy ou ação sensível está autorizado neste repositório.

## Histórico — Estado em 2026-09-20

- Runtime V1 (single-pass governado), Runtime V2 (loop iterativo), fronteira
  de capacidade Phase 4 (`PHASE_4_HANDOFF=VERIFIED`, controlada/sintética) e
  camada conversacional Phase 4A estão entregues em escopo controlado e
  cobertas por gates automatizados (`npm run verify:phase2`,
  `npm run verify:phase3`, `npm run verify:phase4a`, `npm run test:phase4a`
  com PostgreSQL descartável obrigatório e zero skips).
- `AUD19-016` encerrou o programa anterior com candidato `d7f5d06a…`,
  certificado mecânico `CONDITIONAL_GO / AAA_CONTROLLED` e produção `NO_GO`.
  A nova [auditoria `0565`](docs/04_audit/0565_code_reaudit_2026-09-20.md)
  retornou `REJECT` sob a barra QAUD20 por gaps contratuais e de composição.
- O programa proposto `AUD-20260920-REAUDIT` está
  `WAITING_HUMAN_APPROVAL`; nenhuma task de código foi autorizada. Acompanhe
  pelo [plano executivo](docs/03_build/0331_audit20_executive_plan.md),
  [roadmap](docs/03_build/0332_audit20_roadmap.md),
  [backlog](docs/03_build/0333_audit20_backlog.md),
  [`docs/30_backlog_master.md`](docs/30_backlog_master.md) e
  [`docs/99_runtime_state.md`](docs/99_runtime_state.md).
- Produção permanece `NO_GO`: nenhum dado real, provider/canal, credencial,
  deploy ou ação sensível está autorizado neste repositório.
- As seções `Scope`, `Non-goals` e `Roadmap` abaixo descrevem a fundação
  Phase 0/1 histórica; o estado vigente é o desta seção.

## Purpose

The harness provides neutral contracts, a governed single-pass runtime, an
orchestrator seam, and explicit ports for models, tools, policy, approvals,
audit, telemetry, state, knowledge, and channels. Products supply profiles and
adapters; the harness owns sequencing and safety boundaries.

## Scope

Phase 0/1 establishes the public contracts and composition root while keeping
the existing Secretary runtime as a brownfield compatibility consumer. The
current runtime remains the operational V1 path. The new `@cvg/harness`,
`@cvg/harness-contracts`, and `@cvg/harness-orchestrator` packages are additive
and synthetic-data-only.

## Non-goals

This repository does not yet implement a full agent loop, an LLM planner,
autonomous or multi-agent execution, full MCP support, agentic RAG, vector
memory, self-modification, distributed deployment, or unrestricted production
effects. Sensitive actions require policy, approval, or human handoff.

## Maturity and brownfield status

The project is a controlled foundation slice, not a production release. It is
derived from `cvg-agent-secretary-v2`; the origin and migration constraints are
recorded in [`docs/refoundation/BROWNFIELD_ORIGIN.md`](docs/refoundation/BROWNFIELD_ORIGIN.md).
The legacy product remains in place and is not treated as a neutral harness.

## Architecture principles

- Products depend on the Harness; the Harness never depends on Products.
- Decouple → contract → compose → verify → evolve cognition.
- Runtime, orchestrator, tools, skills, model gateway, policy, approval, audit,
  observability, state, knowledge, and channel adapters are separate concerns.
- Policy precedes approval, and approval precedes any governed tool effect.
- Audit evidence is distinct from operational telemetry.
- The current single-pass runtime is preserved before any V2 loop is attempted.

See [`docs/architecture/HARNESS_OVERVIEW.md`](docs/architecture/HARNESS_OVERVIEW.md),
[`docs/architecture/PUBLIC_API.md`](docs/architecture/PUBLIC_API.md), and the
ADRs under [`docs/architecture/adrs/`](docs/architecture/adrs/).

## Roadmap

1. Complete the controlled refoundation and independently audit its contracts.
2. Add product adapters without importing Secretary rules into core packages.
3. Strengthen durable cross-process audit/telemetry and runtime compatibility.
4. Specify a bounded Runtime V2 loop only after the V1 invariants and gates are
   proven.

The current production posture remains `NO_GO`. The proposed remediation
program `AUD-20260920-REAUDIT` owns the next gates; `AUD19-016` and earlier
AAA references are preserved as immutable history, not current authorization.
