# ADR-002: Runtime is separated from orchestrator

- Status: accepted for Phase 0/1
- Decision: `Orchestrator.decideNextStep` returns a decision; the runtime owns
  budgets, governance, execution, and result mapping. The orchestrator receives
  non-executable tool descriptors, never executable tool definitions.
- Consequence: orchestration can evolve independently and cannot bypass policy
  or invoke a tool directly; the public factory has no ungoverned runtime
  replacement path.
