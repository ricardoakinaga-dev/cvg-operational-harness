# Brownfield origin and migration posture

## Origin

- Source identity: `cvg-agent-secretary-v2`
- Candidate identity: `cvg-operational-harness`
- Base commit recorded for this controlled slice: `512bc11e80fbf7c7b8baf6263aacc811ff829309`
- Capture date: 2026-09-13 (America/Sao_Paulo)

The base commit is the repository `HEAD` observed before the refoundation
slice. The worktree already contained unrelated, user-owned dirty changes;
the baseline freeze records their fingerprints and they were not reset.

## Why the copy exists

The source repository contains valuable governed runtime, policy, approval,
audit, idempotency, outbox, tenant, model, persistence, and observability
components, but their public boundaries are Secretary-shaped and mixed. This
candidate creates a neutral contract and composition seam so future products
can consume reusable capabilities without moving the existing implementation
in bulk.

## Inherited components

The inherited surface includes `agent-runtime`, `agent-core`, `platform`,
`policy`, `policy-engine`, `approval-engine`, `model-gateway`, `tools`,
`persistence`, `observability`, `channel-gateway`, `adapters`, `memory`, `rag`,
and `workflows`. Their current role and intended future ownership are in
[`PACKAGE_CLASSIFICATION.md`](PACKAGE_CLASSIFICATION.md).

Preserved invariants include tenant scoping, inbound idempotency and durable
outbox behavior, immutable session agent/version binding, approval/effect
journaling, no automatic replay of uncertain effects, controlled external
effects, and correlation/trace propagation. The new packages do not replace
those paths.

## Inherited limits

The source still has two runtime paths, a large API composition root, mixed
packages, Secretary-specific policy ontology, and no single public neutral
composition root. The existing audit identified a strong governance posture
but low extraction readiness. These are migration constraints, not reasons to
pretend the legacy code is already framework core.

## Prior audit and decision

The prior harness audit scored the Secretary runtime at approximately **6/10**,
the embedded harness at **5/10**, and extraction readiness at **4/10**. Its
decision was **`GO_WITH_PREREQUISITES`**: contracts first, explicit boundaries,
and controlled evidence before extraction.

This candidate follows that decision. It is **not `MOVE_AS_IS`**. No existing
Secretary implementation is reclassified as neutral merely because it is
reachable from a new package.

## Migration rule

Keep the legacy product under an explicit boundary, add adapters incrementally,
and remove or split inherited code only in separately gated tasks. No real data,
credentials, unrestricted production release, or automatic clinical,
financial, scheduling, or record action is allowed by this refoundation.
