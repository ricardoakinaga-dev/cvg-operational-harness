# ADR-016 — Audit failure policy

- Status: Conditional; controlled event evidence exists, sink policy pending.
- Decision: causal execution events are appended with state transitions; the
  result is not reported as complete before the transition is persisted.
- Rationale: audit must not narrate a success that the execution authority did
  not commit.
- Consequence: the SQL audit/telemetry bridge and its failure policy must be
  specified before production certification.
