# CVG Operational Harness

CVG Operational Harness is a governed runtime foundation for reusable operational AI agents across the CVG ecosystem.

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

The current production posture remains `NO-GO` until the separate operational
AAA-21 program closes its own evidence and gates.
