# ADR-010 — Queue/outbox mechanism

- Status: Accepted for controlled Phase 2; live transaction proof pending.
- Decision: pair an execution row with one tenant-scoped outbox row and claim
  work through the execution adapter.
- Rationale: acceptance must return after durable handoff, not after inline
  agent execution.
- Consequence: a real PostgreSQL transaction/fault test is required before a
  durability or production claim.
