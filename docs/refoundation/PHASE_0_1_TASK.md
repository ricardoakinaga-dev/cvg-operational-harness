# Task REF-20260913-PHASE-0-1 — Phase 0/1 refoundation

Status: `IN_PROGRESS`  
Stage: `BUILD` (controlled, after Discovery/PRD/SPEC gates)  
Owner: Lead/integrator  
Origin: attached master prompt plus `docs/harness-audit/` evidence.

## Objective

Turn the brownfield Secretary copy into an explicit CVG Operational Harness foundation without destructive relocation, while preserving the current product as a compatibility consumer.

## Owned scope

- `docs/refoundation/`
- `docs/architecture/`
- `docs/architecture/adrs/`
- `packages/contracts/`
- `packages/orchestrator/`
- `packages/harness/`
- `examples/basic-agent/`
- `examples/secretary-compat/`
- `legacy/secretary-product/` boundary documentation only
- root identity metadata and TypeScript workspace references
- architecture/demo tests

## Forbidden scope

Do not rewrite or delete current runtime/persistence/policy/approval/channel code, change external integration behavior, add real data or credentials, deploy, publish, alter production, or claim `AAA-21` complete. Preserve unrelated dirty worktree changes.

## Entry evidence

- Discovery gate: `docs/00_discovery/0016_harness_refoundation.md`.
- PRD gate: `docs/01_prd/0027_harness_refoundation.md`.
- SPEC gate: `docs/02_spec/0127_harness_refoundation.md`.
- Baseline: `docs/refoundation/BASELINE_FREEZE.md` and `BASELINE.json`.
- Human authorization: the current user request explicitly asks to execute the attached Phase 0/1 prompt; this authorizes only the controlled local scope above.

## Acceptance

The requirements `REF-PRD-01` through `REF-PRD-10` are required. Completion additionally requires the final report, package classification, architecture docs/ADRs, public API, scorecard and current evidence. Existing baseline failures must remain explicit and no new failure may be introduced by the slice.

## Sequence

1. Create neutral contracts and package exports.
2. Create the orchestrator seam and governed single-pass runtime/factory.
3. Add architecture and demo tests with known-bad checks.
4. Add identity/provenance/classification and architecture documentation.
5. Run focused checks, current baseline/regression checks and independent criticism.
6. Fix material findings, rerun affected checks, integrate and publish the Phase 0/1 report.

## Evidence return

Each material round records commands, exit status, artifact path, digest where useful, limitations and whether the evidence belongs to the current candidate. Builders do not self-approve; the Lead obtains a fresh critic before a final verdict.
