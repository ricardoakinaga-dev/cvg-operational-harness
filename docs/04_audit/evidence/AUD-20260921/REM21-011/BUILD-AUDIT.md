# REM21-011 — BUILD/AUDIT

## Scope and decision

`REM21-011` (`A21-F12`) is `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`. The proof
used Node `22.23.2`, only fixed synthetic fixtures, an in-memory collector and
an intentionally failing sink. No provider, channel, IdP, secret, real data or
production environment was used; production remains `NO_GO`.

## BUILD

`packages/observability/src/operational.ts` now provides a bounded
`CompositeObservationExporter`, `CompositeTelemetry`, synthetic collector,
JSON-lines sink, operational SLO evaluator and pure alert evaluator. All
observations are sanitized before fan-out; metric labels not in the existing
allowlist are dropped. Sink exceptions are captured as degraded health and do
not propagate into API, worker, safety or readiness.

The API accepts composed telemetry and emits safe request metrics and runtime
logs. The API entrypoint wires a JSON-lines exporter. Worker JSON telemetry now
uses the same composite contract while preserving the existing worker event
shape. The runbook documents local thresholds, fault injection and the limits
of process-local retention.

## AUDIT result

Final gate run: `run-local-376327-mucafskq`; candidate
`2f4741c4947d356a81c9c238e6c3f67bf43bd3802377cb9ac9536133742544d8`.

- The dedicated `observability-proof` gate passed twice on the same
  run/candidate, Node `22.23.2`.
- The collector received three synthetic observations; no secret, email or
  CPF fixture leaked.
- Unapproved metric labels: `0`; bounded buffer retained `2` and evicted `1`.
- The failing exporter was called `3` times, never escaped an exception, and
  produced `observability_exporter_degraded`.
- Healthy SLO samples passed; injected latency, fail-open, duplicate and
  incomplete-timeline samples produced deterministic critical alerts.
- Readiness stayed `ready=true` before and after exporter failure; the exporter
  was not a readiness dependency.
- Wrong run, wrong candidate and production-scope mutations were rejected by
  the negative contract tests.

Report hash:
`8a991fb9f0da6ece9202370c1b566ab079b3ad1688dad4fe096a1584ca11414e`.
Gate log hashes: run 1
`3db1acddbc5c862d2c389a47d9010a4826d563e4cecbcbc790c2b3cb4149b688`; run 2
`4abb70187c863c13107436d65e5f074c4e671d1e28589ce5081c48e59667dbdb`.

## Regression commands

| Command | Result |
|---|---|
| dedicated proof gate | PASS twice; same run/candidate |
| focused REM21-011, API, worker and CI tests | 22 passed |
| `npm test` | 297 files passed, 20 skipped; 2,092 passed, 146 skipped |
| `npm run build` | PASS |
| `npm run build:runtime` | PASS; compiled runtime has no TypeScript source |
| `npm run format:check` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run ci:bar:contract` | PASS |
| `npm run docs:check-links` | PASS; `broken: []` |
| `git diff --check` | PASS |

## Limitations

The collector and buffer are process-local. External retention, dashboards,
paging, exporter availability, production SLO measurement and cross-restart
durability remain unproven. The full bar/freeze, I1, external gates and human
signoff remain outside this task. No production readiness or certification GO
is inferred.
