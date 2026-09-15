# ADR-018 — Policy re-evaluation on resume

- Status: Accepted and implemented for the controlled neutral approval lane;
  live PostgreSQL/restart evidence remains a separate gate.
- Decision: on resume, the worker re-runs policy before the tool stage. The
  durable approval adapter then checks tenant, execution reference, agent and
  policy versions, action/resource, operation key, and canonical payload hash.
  The approval lifecycle reserves and marks the approval `EXECUTING` before
  the effect, then records `EXECUTED`, `FAILED`, or `UNCERTAIN` evidence.
- Rationale: authorization, policy, agent version, and request context may
  change while work is paused; an old approval must not silently authorize a
  different request.
- Consequence: a mismatch fails closed without invoking the tool. The API
  additionally checks the execution, approval, agent, and correlation binding
  before changing approval state. Resource-state revalidation outside this
  neutral synthetic lane and live D3–D5 proof remain unproven.
