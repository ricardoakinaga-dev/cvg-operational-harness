# ADR-007: Channel adapters stay outside core

- Status: accepted for Phase 0/1
- Decision: channel-specific inbound/outbound adapters live outside neutral
  harness packages; contracts only carry normalized message shapes.
- Consequence: HTTP, chat, worker, and future channels do not leak framework or
  provider assumptions into the runtime.
