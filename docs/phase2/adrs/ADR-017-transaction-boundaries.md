# ADR-017 — Transaction boundaries

- Status: Accepted for schema/adapter design; live proof pending.
- Decision: submission, execution identity, and queue row are handled in one
  logical database transaction; claim and transitions use row locks/compare
  checks under tenant context.
- Rationale: no accepted execution may be detached from its handoff authority.
- Consequence: migration, lock, rollback, and crash probes must run against a
  disposable PostgreSQL authority.
