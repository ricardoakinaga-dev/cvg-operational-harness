# Phase 2 AAA-21 — Discovery

## Problem

The Phase 0/1 harness has a neutral public composition root and a governed
single-pass runtime, but the current repository does not yet expose a neutral
durable HTTP-to-worker execution spine. Existing durable inbound/outbox code is
Secretary-specific and is not accepted as proof of the canonical harness path.

## Desired controlled outcome

Provide a local, synthetic-only execution spine that accepts a canonical
execution request, persists one tenant-scoped identity, queues work without
inline agent execution, lets a worker claim it under a lease, invokes the
public `createOperationalHarness` factory, and records a truthful durable
outcome. PostgreSQL is the authority when configured; the in-memory adapter is
for deterministic tests and controlled development only.

## Constraints and unknowns

- No real provider, channel, clinical/financial data, RAG source, production
  deployment, or unrestricted side effect is introduced.
- Runtime V1 remains single-pass. Future checkpoints and waiting-user states
  must remain representable but are not implemented as a multi-step engine.
- PostgreSQL availability is currently environment-blocked and must not be
  represented as a passing durability proof.
- The existing Secretary outbox/runtime remains a legacy compatibility lane;
  this task must not silently promote it to the neutral canonical path.

## Evidence needed

Focused contract tests, public HTTP route tests, worker/factory wiring tests,
idempotency and tenant tests, stale-lease/recovery tests, crash/uncertain
effect tests, and PostgreSQL integration tests when the environment permits.
