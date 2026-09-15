# ADR-013 — Effect journal guarantee

- Status: Accepted for synthetic effects; provider reconciliation pending.
- Decision: reserve an operation key, mark started, then confirm/fail/mark
  uncertain. Confirmed results replay without invoking the tool twice.
- Rationale: a crash between effect start and confirmation is ambiguous.
- Consequence: `UNCERTAIN` blocks silent retry and requires explicit
  reconciliation; no exactly-once promise is made.
