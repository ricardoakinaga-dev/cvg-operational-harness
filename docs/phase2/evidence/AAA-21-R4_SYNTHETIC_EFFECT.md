# AAA-21-R4 synthetic-effect vertical proof

## Result

`PASS_CONTROLLED` and `PASS_DISPOSABLE_PG` for the guarded, no-I/O fixture.
Production remains `NO_GO`; no real data, provider, channel, RAG source, or
external effect was used.

The default operational worker remains effect-free. With both
`CVG_WORKER_CONTROLLED_MODE=true` and `CVG_WORKER_SYNTHETIC_EFFECT=true`, it
exposes only `synthetic.phase2-effect@v1`. The fixture is rejected in
production and without the controlled-mode guard.

## Vertical path

The R4 memory test submits a persisted `RuntimeInput.requestedTool` through
the API, leaves the execution queued, processes it with the public
`createOperationalHarness` worker path, and reads the result through the GET
endpoint. The synthetic tool returns `{ fixture: "phase2", applied: true }`.
The effect journal reaches `CONFIRMED`. Repeating the same idempotent POST
returns `created: false`; a subsequent worker poll is idle and the fixture
executor is not called a second time. A worker with the default empty registry
fails the same requested tool with `insufficient_evidence` and has no journal.

Evidence: `apps/worker/src/__tests__/operational-harness-synthetic-effect.test.ts`
(`2 tests`, pass).

## PostgreSQL proof

The guarded integration test used an isolated disposable PostgreSQL 15
container, a unique schema, synthetic tenants/payloads, and a non-superuser,
non-`BYPASSRLS` worker role with only `SELECT`, `INSERT`, and `UPDATE` on the
five operational critical tables. The API accepted the request, the worker
claimed attempt `1`, and the final raw rows were:

- execution: `SUCCEEDED`, attempt `1`;
- queue: `processed`, attempts `1`;
- events: `RECEIVED → QUEUED → CLAIMED → RUNNING → SUCCEEDED`;
- effect journal: exactly `1` row, `CONFIRMED`;
- synthetic executor observer: exactly `1` call;
- duplicate POST: `created: false`;
- other-tenant journal lookup: `null`.

Evidence: `apps/worker/src/__tests__/operational-harness-synthetic-effect-postgres.integration.test.ts`
(`1 test`, pass).

## Verification envelope

- `npm run demo:phase2`: pass; `SUCCEEDED`, attempt `1`, journal
  `CONFIRMED`, `externalEffects: false`.
- `TEST_DATABASE_URL=<synthetic disposable PostgreSQL URL> npm run
verify:phase2`: pass; static/build/focused/demo gates and PostgreSQL catalog.
- Full regression: `250 files / 1,727 passed / 110 skipped / 1,837 total`.
- PostgreSQL catalog: `24 files / 190 tests / 0 skips`.

This proof establishes the controlled public composition and journal boundary.
It does not certify external-provider exactly-once semantics, production
deployment, rollback timing, or unrestricted operation.
