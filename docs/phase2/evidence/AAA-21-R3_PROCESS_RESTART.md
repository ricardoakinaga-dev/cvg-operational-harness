# AAA-21-R3 process-restart evidence

The controlled R3 proof launched `apps/worker/src/main.ts` twice as real child
processes through `node_modules/.bin/tsx`, using one synthetic tenant, one
isolated PostgreSQL schema, a least-privilege operational role, and no external
provider or tool.

The first child claimed the execution with a 100 ms lease and was terminated
at `PHASE2_FAULT_POINT=AFTER_CLAIM`. The observed child result was exit code
`137` (the `SIGKILL` outcome surfaced by the tsx child boundary), with no
`RUNNING` or terminal event. A distinct second child was started in the same
claim/recovery window with bounded idle polling; it recovered the stale lease
and completed the execution through the public neutral worker path.

Observed durable sequence:

```text
RECEIVED → QUEUED → CLAIMED(worker-a, attempt 1)
→ RECOVERED → CLAIMED(worker-b, attempt 2)
→ RUNNING → SUCCEEDED
```

The final execution was `SUCCEEDED`, attempt `2`, with no lease owner; the
paired queue was `processed` with two claim attempts, one terminal success
event was present, and the operational effect journal contained `0` rows
because the deterministic harness has an empty tool registry. This proves
durable claim/recovery and competing-worker authority for the controlled empty
tool boundary; it does not certify any external provider's exactly-once
semantics.

Command and machine-readable raw evidence are recorded in
`AAA-21-R3_PROCESS_RESTART.json`. The focused test passed `1/1`; the complete
PostgreSQL catalog including this test passed `23 files / 189 tests / 0 skips`.
