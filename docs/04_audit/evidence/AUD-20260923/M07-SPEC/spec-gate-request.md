# Human SPEC gate request — M07 — 2026-09-23

## Decision requested

Review [SPEC-M07-001](../../../../02_spec/0128_m07_package_dependency_governance.md) and choose:

1. Approve it for preparation of the bounded M07-S1 local BUILD gate request, using the proposed defaults listed below; or
2. Request corrections and identify the decision or section to change.

This approval would cover technical design and documentary preparation of a candidate freeze/local BUILD request only. It would not authorize code, tests, builds, typecheck, lint, service/database execution, integrations, real data, sensitive actions, or production. A separate local BUILD gate remains required before any implementation or test execution.

## Proposed decisions for this SPEC

- Public workspace compatibility candidate: @cvg/harness, @cvg/harness-orchestrator, and @cvg/harness-contracts only; keep every other package UNKNOWN until separately classified.
- TypeScript project references: required only for explicitly named owners in an approved build-graph profile; do not mass-add references based on Discovery’s historical count.
- Classification: use explicit source-role rules; production, tests, build scripts, type-only use, and unresolved imports remain separate. Unknown file roles fail closed.
- Exceptions: none active by default. Each exception needs the exact edge, owner role, reason, approval reference, candidate scope, and review/exit trigger.

These are proposals, not existing approvals. The SPEC lists the effect of leaving each decision open.

## Review evidence and limitations

- Lead review: D1–D9 PASS_LEAD_ONLY; D10 UNAVAILABLE.
- Gauntlet verdict: CONDITIONAL_PASS.
- Independent I1 critic: unavailable because the agent service rejected the fresh-context request with “agent thread limit reached”. No independent approval is claimed.
- Integrated verification: NOT_RUN. No tests, builds, code, services, databases, or runtime checks were run.
- PRD gate: human “Approve for SPEC”; only documentary SPEC preparation was authorized.
- Candidate: worktree remains dirty; refresh and freeze the exact candidate before any BUILD gate or verification.

Evidence: [review record](spec-review-record.json), [lead review](spec-review-lead.md), [frozen quality bar](quality-bar.json), and [critic packet](critic-packet.md).

Safety limits remain: G21-5/G21-6 closed; production NO_GO; synthetic/local scope only; sensitive actions require human approval or handoff.

## Decision recorded

The user replied “eu aprovo a Spec e as propostas”. This approves SPEC-M07-001 and its four recommendations only for preparing the separate M07-S1 local BUILD gate and candidate baseline. The decision is recorded in [human-decision-20260923.md](human-decision-20260923.md) and the [P1-S1 human-decision ledger](../P1-S1/human-decisions-20260923.md). The concrete [M07-S1 BUILD request](../M07-BUILD-S1/build-gate-request.md) is pending its own human approval. No implementation or checks are authorized by the SPEC approval.
