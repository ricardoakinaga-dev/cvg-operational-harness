# ADR-011 — Worker claim and lease semantics

- Status: Accepted for controlled Phase 2.
- Decision: claim increments attempt, records worker and expiry, and every
  active heartbeat/transition checks the lease owner.
- Rationale: concurrent workers must not silently share ownership; stale work
  must be recoverable.
- Consequence: a stale worker can receive `lease_lost`; it cannot finalize the
  execution after recovery.
