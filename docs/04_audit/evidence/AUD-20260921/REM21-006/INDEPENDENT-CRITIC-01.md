# REM21-006 — Independent Critic 01

- reviewer: fresh-context critic `Singer`
- verdict at review time: `FAIL`
- final-certification/I1 claim: `none`
- disposition: `SUPERSEDED_BY_BUILD_FIXES_AND_POST_CRITIC_EXECUTION`

## Findings at the review snapshot

1. **P0 — shutdown/readiness race:** an awaited homolog health check could
   return after `SIGTERM` and still restore readiness or reach consumption;
   analogous startup ordering was not uniform in the operational and
   continuous entrypoints.
2. **P1 — lifecycle cleanup/events:** PostgreSQL controlled used an early
   `process.exit`, controlled-memory had no signal controller, and the
   controlled-ready event was emitted after the drain rather than before it.
3. **P1 — memory preflight scope:** the no-pool operational path had no
   explicit profile contract and could be mistaken for a durable preflight.
4. **P1 — proof gaps:** the homolog order assertion used the sweep marker
   instead of a direct consumption marker; event compatibility and the
   PostgreSQL gates were not fully demonstrated at that snapshot.

## Disposition

The report is retained as a negative independent review, not as a current
verdict. The BUILD round subsequently added shutdown checks after awaits,
idempotent cleanup shared by signal/finally paths, a pre-consumption
`worker.homolog_process_next` marker, explicit memory-profile validation,
controlled-mode startup gating and additional process/readiness tests. The
PostgreSQL synthetic gates were then executed separately; their final result
is recorded in `BUILD-AUDIT.md`. No I1, candidate freeze or production
qualification is inferred from this report.
