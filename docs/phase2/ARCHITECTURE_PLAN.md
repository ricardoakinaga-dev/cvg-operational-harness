# AAA-21 architecture plan and decisions

## Delivered slice

1. Freeze candidate and baseline.
2. Register Discovery, PRD, SPEC, task, and quality bar.
3. Implement neutral execution identity/state machine and process-local proof.
4. Implement synthetic effect journal and uncertain-outcome behavior.
5. Wire API submission/status routes without inline execution.
6. Wire controlled worker to the public harness factory.
7. Add PostgreSQL adapter and additive migration.
8. Prove process restart/reclaim and fault-injected competing workers against
   disposable PostgreSQL.
9. Add the guarded R4 synthetic-effect vertical fixture, journal replay proof,
   and bounded demo/verification commands.
10. Run focused and regression checks; record blockers without masking them.

## Remaining deferred gates

- live PostgreSQL approval/execution resolver and process-restart pause/resume
  proof (the controlled authenticated resolver is implemented);
- SQL-backed audit/telemetry sink integration;
- supported Node 22 and unrestricted loopback verification;
- rollback and migration lock-timing rehearsal;
- external-provider exactly-once semantics;
- final fresh critic and final evidence sentinel for the R4 candidate.

These are explicit follow-up tasks, not silent assumptions. Production remains
blocked until the required gates are executed on a separately approved
candidate.
