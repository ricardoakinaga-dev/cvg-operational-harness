# C1I correction preview

This proposed patch changes exactly three paths:

- `config/workspace-dependency-policy.json`: bind the candidate to `docs/04_audit/evidence/AUD-20260924/M07-S1-C1I/candidate-baseline.json` SHA-256 `ea28a36f156bda03fa6da930443feea21a873fd451775d86f43150bc15c8d67d` and use the C1I npm version evidence path.
- `scripts/workspace-dependency-audit.mjs`: allow only the exact C1I baseline path/hash and C1I output directory while retaining the existing traversal and symlink checks.
- `tests/workspace-dependency-audit.test.js`: assert the exact baseline and npm bindings, accept C1I output names, and reject unapproved C1I-like names.

The source R1 baseline remains unchanged. The new baseline copy changes only the two input tuples listed in `baseline-refresh-report.json`, retains the 973-input set, and recomputes the inherited JSON.stringify fingerprint basis. The C1I candidate is still required to contain exactly 977 inputs and four approved additions.

No patch has been applied and no product tests or candidate commands have run.
