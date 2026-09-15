# AAA-34 — apps/api coverage hardening evidence

- Date (UTC): `2026-09-13`
- Workspace HEAD at measurement: `512bc11e80fbf7c7b8baf6263aacc811ff829309` (dirty tree; concurrent AAA lanes active)
- Scope: `apps/api` tests only (no production-code changes; no bug found).
- Baseline source: `docs/04_audit/evidence/AAA/P1-independent-review/REVIEW.md` §5 P2-4 context measurements for apps/api.
- Quality bar: `docs/02_spec/aaa_quality_contract.md` §9.1 — statements/lines/functions ≥90%, branches ≥85% (global averages).

## 1. Result — apps/api (coverage denominator `apps/api/src/**`)

| Metric     | Before  | After   | Floor | Status |
| ---------- | ------- | ------- | ----- | ------ |
| Statements | 81.59%  | **93.65%** | ≥90% | PASS |
| Branches   | 77.20%  | **87.82%** | ≥85% | PASS |
| Functions  | 84.84%  | **91.24%** | ≥90% | PASS |
| Lines      | 82.53%  | **94.59%** | ≥90% | PASS |

Raw counts (after): statements `2051/2190`, branches `1233/1404`, functions `271/297`, lines `1977/2090`.
Raw counts (before): statements `1787/2190`, branches `1084/1404`, functions `252/297`, lines `1725/2090`.

## 2. Result — `apps/api/src/server.ts`

| Metric     | Before  | After   |
| ---------- | ------- | ------- |
| Statements | 77.12% (1163/1508) | **92.30% (1392/1508)** |
| Branches   | 69.74% (581/833)   | **82.95% (691/833)**   |
| Functions  | 75.28% (131/174)   | **85.05% (148/174)**   |
| Lines      | 77.61% (1144/1474) | **92.74% (1367/1474)** |

## 3. Commands and exit codes

| # | Command | Exit | Log |
| - | ------- | ---- | --- |
| 1 | `npx vitest run apps/api --coverage.enabled --coverage.include='apps/api/src/**' --coverage.reportsDirectory=/tmp/opencode/cvg-api-cov-before --no-file-parallelism --maxWorkers=2` | **1** (branch 77.2% < configured 80% threshold; measurement valid) | `commands/before-coverage.log`, `commands/before-coverage-summary.json` |
| 2 | `npx vitest run apps/api --no-file-parallelism --maxWorkers=2` | **0** (52 files, 254 passed / 8 skipped) | `commands/focused-api-tests.log` |
| 3 | `npx vitest run apps/api --coverage.enabled --coverage.include='apps/api/src/**' --coverage.reportsDirectory=/tmp/opencode/cvg-api-cov-after --coverage.reporter=json --coverage.reporter=json-summary --coverage.reporter=text --no-file-parallelism --maxWorkers=2` | **0** (all floors met) | `commands/after-coverage.log`, `commands/after-coverage-summary.json` |
| 4 | `npm run typecheck` | **0** | `commands/typecheck.log` |
| 5 | `npm run lint` | **0** | `commands/lint.log` |
| 6 | `npm test` | **0** (225 files, 1544 passed / 57 skipped / 0 failed) | `commands/npm-test.log` |

Note on exit 1 for command 1: the before run deliberately kept the repository-configured 80% threshold (`vitest.config.mts`), which branches at 77.20% does not satisfy. This confirms the measured baseline and is not a test failure. The after run exits 0 under the same configuration.

## 4. What was added

Seven new test files under `apps/api/src/__tests__/` exercising the public HTTP path via `buildServer()` / `buildServerFromEnv()` + `app.inject()` (no fixed ports, synthetic data only):

1. `journey-routes-coverage.test.ts` — full owner/patient/slot/appointment/journey-task lifecycle, authenticated-mutation mode, tenant mismatch, PostgreSQL-mode fail-closed journey routes (no journey repository).
2. `platform-admin-routes-coverage.test.ts` — knowledge sources, release candidates, plugin catalog, test-lab suite clone/runs/evaluate/compare, version-operation error envelopes, capability-approval misuse (wrong issuer, actor mismatch, archived version, unconsumed tool) and failing preflight report.
3. `server-boundary-envelope.test.ts` — `/live`, `/ready` (200 and production 503), disabled metrics 404, 414/400/413/415/404 envelopes, audit-evidence pagination/filter errors, task transition/validation errors, approval authority, takeover not found, capability expiry windows, production tenant requirement, injection composition.
4. `inbound-runtime-edges.test.ts` — unresolved agent mapping, historical high/medication safety markers, injected `completeInboundRuntime` completed/paused, invalid channel, denied verifier, verification lease commit/release.
5. `http-security-edge-branches.test.ts` — origin hash rejection, IPv6/IPv4-mapped proxy canonicalization, unspecified v4-mapped address rejection, untrusted forwarded HTTPS, lowercase preflight method.
6. `build-server-from-env-boundary.test.ts` — NODE_ENV/persistence-mode validation, production bootstrap fail-closed ordering, schema/tenant/agent identifiers, signing-secret requirement, preset-seeding failure, injected resolvers.
7. `small-module-boundaries.test.ts` — rate-limit clock/key validation, request-metrics option/status/latency boundaries, correlation envelope parsing + hook omission, request-target and request-error classification, replay-store fail-closed verification and replay entry validation.

Behavioral assertions only: every test asserts status codes, envelopes, state transitions or headers. No assertion-free line touchers, no `.only`, no skips, no fixed ports, no mocks that bypass the boundary under test. Direct unit tests target exported boundary functions (`http-security`, `rate-limit`, `request-metrics`, `response-correlation`, `http-target-boundary`, `http-request-boundary`, `webhook-security`) using their public APIs.

## 5. Full-suite counts

- Before (from P1 review context, 2026-09-13): `npm test` → 196 files / 1154 passed, 57 skipped (1211 tests).
- Task-provided baseline: 1160 passed / 57 skipped.
- After: `225 passed | 4 skipped (229)` test files; `1544 passed | 57 skipped (1601)` tests; zero failures.
- Skips added by this lane: **0** (57 before and after). The added apps/api files run 254 passed / 8 skipped, where the 8 skips pre-exist (`postgres-persistence-mode`, `webhook-security` PostgreSQL-gated `itWithPostgres`); this lane added no `skip`/`todo`.
- The pass-count increase beyond this lane's +47 tests reflects concurrent AAA lanes active in the same working tree; no failure was observed.
