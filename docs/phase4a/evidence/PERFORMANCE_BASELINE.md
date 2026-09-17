# Phase 4A performance baseline — AAA-4A

Generated 2026-09-17T12:00:29.028Z in synthetic-local-only.

- 20 concurrent in-memory turns completed in 98.626 ms; governed Harness calls: 1; grounded responses: 20/20.
- 20 concurrent delivery attempts completed in 2.626 ms; sink sends: 1; delivered or pending receipts: 20/20.
- PostgreSQL raw 20-way turn and delivery timings: MEASURED. See PERFORMANCE_RESULTS.json for the disposable schema measurement; RLS and stale-lease recovery remain covered by the focused integration test.

These are local synthetic observations, not an SLO, capacity target or production performance claim. Production remains NO_GO.
