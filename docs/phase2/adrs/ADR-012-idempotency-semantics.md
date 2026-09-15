# ADR-012 — Idempotency semantics

- Status: Accepted.
- Decision: idempotency is tenant-scoped and binds a key to a canonical request
  hash. Same hash returns the existing execution; different hash conflicts.
- Rationale: retries must not create a second semantic execution.
- Consequence: key reuse for a different operation requires a new key; this is
  not external exactly-once execution.
