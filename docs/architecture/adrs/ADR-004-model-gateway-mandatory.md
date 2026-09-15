# ADR-004: Model Gateway is mandatory

- Status: accepted for Phase 0/1
- Decision: model calls cross `ModelGateway.complete`; neutral runtime code has
  no provider SDK or provider-specific client.
- Consequence: providers remain replaceable and model failures are typed runtime
  outcomes.
