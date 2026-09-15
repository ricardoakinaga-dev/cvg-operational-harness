# ADR-015 — Retry classification

- Status: Accepted for controlled Phase 2.
- Decision: technical failures may be `FAILED_RETRYABLE`; semantic/policy,
  cancelled, and unknown-effect outcomes are terminal or paused as classified.
- Rationale: retrying all failures can duplicate effects or violate policy.
- Consequence: retry timing and maximum attempts require operational policy
  before a real worker is enabled.
