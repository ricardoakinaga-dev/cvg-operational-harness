# ADR-009 — Durable execution authority

- Status: Accepted for controlled Phase 2; PostgreSQL certification pending.
- Decision: the neutral execution record is the authority for identity, state,
  result, failure, attempt, and lease metadata.
- Rationale: API and worker must share one semantic execution identity; the
  Secretary inbound/outbox lane is not silently promoted.
- Consequence: the in-memory adapter is test-only/local; PostgreSQL is the
  intended authority when configured.
