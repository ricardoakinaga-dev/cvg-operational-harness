# Build plan — REF-20260913-PHASE-0-1

## Gate and authorization

`SPEC_APPROVED_CONTROLLED_BUILD` is recorded in `docs/02_spec/0127_harness_refoundation.md`. The task is local and reversible. No external effect, real data, provider, channel, deployment or production action is authorized.

## Milestones

1. Contracts: add dependency-free public types and ports.
2. Runtime seam: add deterministic orchestrator and governed single-pass factory/runtime.
3. Proof: add architecture, boundary and basic-agent tests.
4. Documentation: identity, provenance, package map, ADRs, public API and report.
5. Audit: run focused/regression checks, obtain fresh critique, fix material gaps, and publish the verdict.

## Ownership and sequencing

The Lead owns the root manifest, TypeScript references, global docs, and integration. Neutral package files are disjoint from existing production-assurance files. No worker may edit `.gauntlet`, runtime state, execution log or master backlog.

## Validation

Focused checks: contract typecheck/tests, architecture tests, basic-agent test, package import scan. Integrated checks: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:evals`, and `npm test` compared against the frozen baseline. Any baseline failure remains explicit; new failures block.

## Recovery

If a new package fails typecheck, remove only the new package from the project references or repair its contract; never reset unrelated changes. If a test attempts a network or real effect, stop and replace it with a local fake. If a review finds a shared-boundary conflict, pause the dependent lane and replan instead of moving legacy code.

