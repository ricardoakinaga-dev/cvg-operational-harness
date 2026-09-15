# Phase 4 — Task Registration (AAA-41)

- Task: `CVG-PHASE4-CAPABILITY-BOUNDARY` / `AAA-41`
- Authority: explicit user Phase 4 master prompt and current user request.
- Entry gate: `PHASE3_HANDOFF=VERIFIED` in `docs/phase4/PHASE_3_HANDOFF.md`.
- Scope: local controlled/synthetic only; production remains `NO_GO`.
- Current mode: `BUILD_RUN` after handoff verification; fresh critic and final
  sentinel remain mandatory.

## Objective

Deliver a domain-agnostic external capability boundary that can compose
native, Skill-origin, Plugin-origin, knowledge-origin, and optional simulated
MCP-origin capabilities through one explicit registry and one governed Runtime
path. The boundary owns no policy or approval authority.

## In scope

1. Neutral capability descriptors and implementation ports in
   `@cvg/harness-contracts`.
2. Immutable, explicitly populated, exact-version capability registry and
   composition fingerprint in `@cvg/harness`.
3. A single adapter from the capability registry to the existing Runtime
   `ToolRegistry` port; no second execution authority.
4. Public `createOperationalHarness` composition support for the capability
   registry, with ambiguous/missing composition failing closed.
5. Input/output validation, bounded cloning, origin metadata, provider
   identity, tenant-scoped Runtime context, policy, approval, journal, audit,
   and telemetry preservation.
6. Controlled synthetic demonstrations for origin parity and provider swap.
7. Negative, concurrency, restart/replay, isolation, conformance, and
   dependency-direction evidence.

## Out of scope

- Real Skills, Plugins, MCP servers, providers, channels, RAG, credentials,
  patient data, clinical/financial actions, deployment, release, or production.
- Dynamic loading, marketplace discovery, remote installation, or an arbitrary
  untrusted-code sandbox claim.
- Making Skill text, Plugin metadata, MCP responses, model output, or knowledge
  authoritative.
- Rewriting the Phase 2/3 execution spine, approval authority, or effect journal.
- Multi-agent execution, DAG workflow support, or a full Skill Runtime.

## Required sequence

1. Freeze the Phase 4 quality bar and technical specification.
2. Implement the neutral registry and public composition adapter.
3. Add tests for descriptor/implementation separation, exact versioning,
   validation, origin parity, provider replacement, and fail-closed paths.
4. Add the governed Runtime vertical proof and adversarial evidence.
5. Run focused and regression gates, then obtain a fresh independent critic.
6. Repair any finding, rerun affected gates, freeze the sentinel, and publish
   the final report with limitations and production status.
