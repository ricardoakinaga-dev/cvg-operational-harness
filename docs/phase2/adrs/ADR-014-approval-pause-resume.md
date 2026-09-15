# ADR-014 — Approval pause/resume

- Status: Accepted for the controlled neutral lane; live PostgreSQL and
  process-restart certification remain pending.
- Decision: a pending approval creates a durable approval record bound to
  tenant, execution identity, operation key, agent/policy versions, action,
  resource, payload hash, and correlation. The execution persists
  `WAITING_APPROVAL` with the same approval identifier. Only the authenticated
  `/v1/executions/:executionId/approvals/:approvalId/decision` boundary may
  resolve it; approval resolution performs a compare-and-set state change to
  `QUEUED` or `FAILED_TERMINAL`.
- Rationale: approval is a durable control boundary, not an in-memory flag or
  a direct worker requeue. The worker can terminate after the pause and a new
  worker reloads the approval and immutable execution identity.
- Consequence: the controlled path now proves no effect before approval,
  tenant/role checks, duplicate decision safety, binding revalidation, and
  approval reservation/confirmation. It does not claim live PostgreSQL RLS,
  multi-process restart, or production readiness until D3–D5 evidence exists.
