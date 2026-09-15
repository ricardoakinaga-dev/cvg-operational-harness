# Independent verification — PROD-20260913 M1 correction batch

- Verifier: independent verifier agent (fresh context, did not write the code under review).
- Date/observation window: 2026-09-13, ~11:04–11:12 local (UTC-3), repo `/home/ricardo/cvg-agent-secretary-v2`, branch `main`, HEAD `512bc11`.
- Method: every command below was executed against the actual working tree; only writes allowed to `docs/04_audit/evidence/PROD-20260913/independent-review/` (this file) and `/tmp/opencode` (throwaway probes). No product/source/test/config file was modified. Postgres always on `127.0.0.1:55481` (`cvg_prod`, trust); port 5432 untouched.
- Scratch databases created by the verifier: `verifier_c1` (schema `verifier_c1_atomicity`, `verifier_c1_falsify_*`), `verifier_c3` (roles/schemas/databases disposable), `verifier_c4` (schema `verifier_c4_api_*`). All synthetic.

## Overall verdict: **REWORK**

All five functional claims (C1–C5) are CONFIRMED by independent reproduction and falsification attempts. C6 and C7 are not clean:

- **F1 (P1)** — `npm run typecheck` fails (exit 2) on the frozen tree; five evidence manifests claim `typecheck PASS`.
- **C7** — 3 of 58 manifest hashes do not match the current files.
- **F2 (P3)** — `prettier --check` fails on one batch file.
- **F3–F7 (P3)** — evidence bookkeeping and minor contract/code observations (details below).

No P0 was found. No weakened assertions, added unconditional skips, lowered thresholds, real credentials or external effects were found in the batch.

---

## Findings

| ID | Severity | Finding | Evidence / repro |
|----|----------|---------|------------------|
| F1 | **P1** | `npm run typecheck` fails: `apps/worker/src/__tests__/postgres-role-preflight.test.ts(340,37): error TS2345` — the fake pool `{ connect: async () => client }` is not assignable to `PostgresPoolLike` (client.query returns bare `{rows}` without `QueryResult` fields). `npm run build` = `npm run typecheck && npm run build:web`, so the build gate is blocked. | `npm run typecheck` → EXIT=2, exactly 1 `error TS` line (full log `/tmp/opencode/typecheck-full.log`). The file’s sha256 matches PROD-05 `sourceSha256` (`25fb75fe…`), so this exact byte content is the attested one; the manifests’ `typecheck PASS exitCode 0` claims are false for the attested bytes. |
| F2 | P3 | `npx prettier --check` on the batch files fails only on `docs/01_prd/aaa_decision_brief.md` (markdown comparison-table column alignment). | `npx prettier --check …` → `[warn] docs/01_prd/aaa_decision_brief.md`, EXIT=1; diff shows only table padding changes in section 2.2. |
| F3 | P3 | Manifest hash drift: 3 of 58 hashes listed in the six manifests do not match the files. | `node /tmp/opencode/verify-c7.mjs` → 55 MATCH / 3 MISMATCH. See hash section. |
| F4 | P3 | PROD-05 manifest is internally inconsistent: `positiveVerified.verdict` says “PASS: 8/8 (…)”, while its own `gates` row and the actual run are 10 tests. | `docs/04_audit/evidence/PROD-20260913/PROD-05/manifest.json`; actual run 10/10. |
| F5 | P3 | `withTenantTransaction` edge: if the post-`COMMIT` context cleanup fails once and then succeeds on the retry, the caller still receives the cleanup error although the mutation committed (ambiguous outcome). Bounded by idempotency (retry returns the stored draft). | `/tmp/opencode/verify-c1b.ts`: returns no value, throws `transient cleanup failure`; SQL order `BEGIN, set_config(tenant), INSERT, COMMIT, set_config('') [fail], ROLLBACK, set_config('')`; release clean, exactly once. |
| F6 | P3 | Contract-vs-implementation drift (PROD-05): the frozen contract says the preflight runs its queries “por `withTenantContext`”; `postgres-role-preflight.ts` hand-rolls set/clear of `cvg.tenant_id` (and does not restore `search_path`). Behaviour was independently verified correct (no leak, destroy-on-failure), but the documented mechanism does not match. Similarly PROD-02’s contract text says “leituras puras mantêm `withTenantContext`” while all journey reads now use `withTenantTransaction` — justified because those reads execute lazy-expiration UPDATEs. | `docs/02_spec/prod20260913_m1_corrections_contract.md` §PROD-05 “Implementação (HOW)”; `apps/worker/src/postgres-role-preflight.ts:66-215`. |
| F7 | P3 / attribution NOT_VERIFIED | `apps/api/src/server.ts` contains changes outside the M1 scope vs HEAD: `runInitialPostgresMigration` conditional removed (always `runPostgresMigrations` now), inbound-tenant-resolver semantics changed, development-only agent runtime wiring added. `package.json` also carries non-M1 changes (tsx moved to dependencies, vitest/coverage bump, `engines`, certification scripts). The repo is fully dirty vs HEAD and the batch base state is not identifiable from git alone, so attribution to this batch is unverified; the integrator should confirm. No test/credential/weak-assertion risk was found in these hunks. | `git diff -- apps/api/src/server.ts package.json`; current server.ts ~5276–5280, ~5376–5393, ~5113–5145. |

---

## Claim-by-claim verification

### C1 (PROD-02/D13-01) — journey draft INSERT + audit INSERT in one short transaction

**Verdict: CONFIRMED** (with P3 edge observation F5).

Reproduction on a verifier-owned scratch database (not the builder’s `prod01_probe`):

```
createdb -h 127.0.0.1 -p 55481 -U cvg_prod verifier_c1          # exit 0
PROD_PROBE_SCHEMA=verifier_c1_atomicity \
TEST_DATABASE_URL=postgres://cvg_prod@127.0.0.1:55481/verifier_c1 \
npx tsx docs/04_audit/evidence/PROD-20260913/PROD-01/sql-atomicity-probe.ts
```

Output (EXIT=0):

```json
{
  "probe": "sql-atomicity",
  "schema": "verifier_c1_atomicity",
  "firstError": "synthetic audit failure",
  "draftsAfterFailedMutation": 0,
  "auditAfterFailedMutation": 0,
  "replayStatus": "draft",
  "auditRowsAfterReplay": 1,
  "verdict": "PASS_ATOMIC"
}
```

Falsification of `withTenantTransaction` (`packages/persistence/src/tenant-scoped-postgres.ts:157`) with a release-accounting fake pool plus a real pool (`/tmp/opencode/verify-c1.ts`, EXIT=0):

- Success path returns `42`; SQL order `BEGIN → set_config(tenant) → op → COMMIT → set_config('')`; `release()` called exactly once with no error.
- Operation error: original error rethrown (`thrownSame: true`); `ROLLBACK` + clear; released once clean.
- Cleanup failure: released exactly once **with** the error (pool destroys); cleanup error rethrown.
- ROLLBACK failure: original operation error rethrown; released with the rollback error. No double release in any path (`releaseCount: 1` everywhere).
- Real pool (max 1, schema migrated): a failed call (`Phone is invalid`) leaves `current_setting('cvg.tenant_id', true)` empty; a subsequent successful call returns a normal `draft` and also leaves the setting empty. No dirty-context reuse.

Persistence tests (same command used for C4, EXIT=0): `2 files / 32 tests` including the memory/postgres journey contract parity; cases `rolls back the whole journey mutation when the audit insert fails`, `serializes concurrent creates with the same idempotency key`, `clears the tenant context of the borrowed connection after a transaction` passed.

Falsification attempt outcome: **no double release, no swallowed error, no dirty-context reuse found**. The only edge found is F5 (post-commit cleanup failure → caller sees an error after commit), which is bounded by the idempotency key on retry.

### C2 (PROD-03/D13-02) — stale tenant results/errors discarded

**Verdict: CONFIRMED.**

```
npx vitest run --no-file-parallelism apps/web/src/__tests__/journeys-identity-race.test.tsx
```

→ EXIT=0, `Test Files 1 passed (1)`, `Tests 3 passed (3)` (stale success discarded, stale error discarded, current-identity response kept).

Code inspection: `apps/web/src/features/journeys/index.tsx` uses `generationRef` + per-identity `AbortController` (guard at every `setState`: `if (generation !== generationRef.current) return`, abort errors ignored, `busy` reset only for the current generation); `apps/web/src/api/client.ts` forwards the `AbortSignal` to `fetch` for the journey operations. Backend authorization untouched.

External Chromium probe (optional extra) against the real vite dev server:

```
CVG_API_PORT=4397 npx vite --config vite.config.mts apps/web --host 127.0.0.1 --port 4398 &
PROD03_OUTPUT=/tmp/opencode/verify-race.png node docs/04_audit/evidence/PROD-20260913/PROD-03/ui-race-probe.cjs
```

→ EXIT=0, screenshot written (325,261 bytes):

```json
{ "probe": "ui-tenant-race", "tenant": "tenant_B", "staleTenantCandidateVisible": false, "verdict": "PASS_STALE_DISCARDED" }
```

Server killed afterwards; port 4398 confirmed closed. (`ui-race-probe.red.json` preserved by the builder shows the probe correctly fails when the protections are neutralized.)

### C3 (PROD-05/D13-06) — worker preflight rejects unsafe roles and accepts a minimal one

**Verdict: CONFIRMED** (with P3 contract-drift F6 and manifest inconsistency F4).

```
TEST_DATABASE_URL=postgres://cvg_prod@127.0.0.1:55481/cvg_prod_test \
npx vitest run --testTimeout=60000 --no-file-parallelism \
apps/worker/src/__tests__/postgres-role-preflight.test.ts
```

→ EXIT=0, `Test Files 1 passed (1)`, `Tests 10 passed (10)` in 2.19s. Matrix covered: superuser, BYPASSRLS, role membership, table-owner, DDL (`CREATE` on schema), missing schema, broad outbox privileges, minimal role that then drains a real event (`processed >= 1`, stored status `processed`), context cleanup on same pool after rejection, and destroy-on-cleanup-failure (fake client).

`apps/worker/src/main.ts` inspection: `await assertPostgresWorkerPreflight(...)` runs at line 122 before `runtime.worker.drain(...)` (line 125) in the controlled worker, and at line 154 before `runtime.worker.start()` (line 190) in the continuous worker. Preflight is awaited in both paths; a preflight failure aborts before any claim.

Independent cleanup falsification with a **real pool** (`/tmp/opencode/verify-c3.ts`, EXIT=0):

- Valid role + injected cleanup-query failure: preflight rejects with `injected cleanup failure`; `pool.totalCount` drops to **0** (connection destroyed), not returned dirty.
- Rejected preflight (DDL) + injected cleanup failure: rejects with the sanitized `must not create schema objects`; `totalCount` **0**.
- Rejected preflight with working cleanup: rejects with the sanitized message; connection reused (`totalCount 1`) with `current_setting('cvg.tenant_id', true)` empty.

Matrix gap closed independently — the `db-owner` branch is not exercised by the batch tests, so the verifier created a `NOSUPERUSER NOCREATEDB …` role that owns a disposable database (`/tmp/opencode/verify-c3b.ts`, EXIT=0):

```
{ "probe": "c3-db-owner", "verdict": "DB_OWNER_REJECTED_CONFIRMED",
  "thrown": "PostgreSQL worker role must not own the database" }
```

### C4 (PROD-06/D13-06) — audit records operator actor + request correlation; body cannot override

**Verdict: CONFIRMED.**

```
TEST_DATABASE_URL=postgres://cvg_prod@127.0.0.1:55481/cvg_prod_test \
npx vitest run --testTimeout=60000 --no-file-parallelism \
packages/persistence/src/__tests__/journeys-postgres.test.ts \
apps/api/src/__tests__/journeys-api-postgres.test.ts
```

→ EXIT=0, `Test Files 2 passed (2)`, `Tests 32 passed (32)`, 0 skipped. Includes the parity test “records journey audit with the supplied actor and correlation”, the HTTP test “records the authenticated actor and request correlation on journey audit” (body-injected `actorId/actorType/correlationId/auditContext` ignored), and “keeps the HTTP journey mutation and audit atomic and replayable” (audit trigger failure → nothing persisted; retry → 1 draft + 1 audit).

Code inspection:
- `apps/api/src/server.ts:848-852` (and the patient/appointment/task routes): `{ ...request.body, tenantId, auditContext: journeyAuditContext(identity, correlationId) }` — server-owned fields are spread **after** the body, so body fields cannot win.
- `journeyAuditContext` (`apps/api/src/server.ts:3570`): authenticated identity → `{ actorType: 'Operator', actorId: identity.operatorId, correlationId }`; no identity → explicit `System`/`system.journey-repository`.
- `normalizeJourneyAuditContext` (`packages/persistence/src/journeys.ts:792`) validates `actorType` and `CorrelationIdSchema` and is used by the Postgres adapter (`journeys-postgres.ts:appendJourneyAuditScoped`).

Independent throwaway probe (`/tmp/opencode/verify-c4.ts`, imports `buildServer` with `requireAuthenticatedMutations: true` against a real disposable pool/schema; EXIT=0):

```json
{
  "probe": "c4-body-override-falsification",
  "verdict": "OVERRIDE_BLOCKED_CONFIRMED",
  "httpStatus": 200,
  "draft": { "tenant_id": "tenant_00000000-0000-4000-8000-0000000004c1" },
  "audit": { "actor_type": "Operator", "actor_id": "operator.header.verifier",
             "correlation_id": "corr_19f4f79b-…", "journey": "owner_draft_created" },
  "bodyTenantDraftCount": 0,
  "checks": { "status200": true, "draftTenantIsHeader": true, "bodyTenantUntouched": true,
              "actorIsHeaderOperator": true, "correlationIsRequestMeta": true,
              "auditJourneyIsOwnerDraft": true }
}
```

Honest note: the first execution of this probe (without `NODE_ENV=test`) returned HTTP 401, because `resolveOperatorIdentity` requires a trusted resolver outside test mode (`apps/api/src/server.ts:3790-3802`). Rerun with `NODE_ENV=test` (as vitest does) produced the result above. This is expected fail-closed behavior, not a defect.

### C5 (D13-04/AAA-22) — /ready performs a real bounded DB probe, /live stays 200, probes do not accumulate

**Verdict: CONFIRMED.**

```
NODE_ENV=test npx tsx docs/04_audit/evidence/PROD-20260913/PROD-01/readiness-probe.ts
```

→ EXIT=0:

```json
{ "probe": "readiness", "queries": 1,
  "results": [
    { "url": "/ready", "status": 503, "body.data.checks": [ { "name": "database", "status": "failed", "detail": "database probe failed" } ] },
    { "url": "/live",  "status": 200 } ],
  "verdict": "PASS_PROBED" }
```

```
npx vitest run --no-file-parallelism apps/api/src/__tests__/readiness.test.ts
```

→ EXIT=0, `Test Files 1 passed (1)`, `Tests 8 passed (8)`.

Code inspection: `apps/api/src/server.ts:275` builds the database probe from `persistence` (memory → none); `createReadinessDatabaseProbe` (line 4316) returns the connection on success and destroys it on failure/timeout (`release(error)`), with a guarded single release; `evaluateReadinessWithProbes` (`apps/api/src/readiness.ts`) bounds each probe (default 1s, DB 900ms) and sanitizes failure details. The test `returns every pooled probe connection and destroys failed ones` asserts `connected == released == destroyed == 3` over 3 consecutive failed /ready calls.

### C6 (integrity/regression) — **REWORK**

| Command | Result |
|---|---|
| `npm run typecheck` | **FAIL, EXIT=2** — exactly 1 error: `apps/worker/src/__tests__/postgres-role-preflight.test.ts(340,37): error TS2345` (F1). Blocks `npm run build`. |
| `TEST_DATABASE_URL=… npm run test:postgres` | **PASS, EXIT=0** — `Test Files 18 passed (18)`, `Tests 151 passed (151)`, 0 skipped; duration 35.42s. Matches the claimed inventory (18/151). |
| `npx prettier --check <17 batch files>` | **FAIL, EXIT=1** — only `docs/01_prd/aaa_decision_brief.md` (F2). |
| `npx eslint <17 batch files>` (extra check against manifest gate claims) | PASS, EXIT=0. |
| `git diff --stat` (tracked batch files) | 9 files changed, 861 insertions(+), 147 deletions(-); the remaining batch files are untracked new files. |

Diff inspection (scope requested):
- No weakened/removed assertions in the tracked diffs (`readiness.test.ts` only adds 5 tests; `tenant-scoped-postgres.ts` only adds `withTenantTransaction`; `journeys.ts` adds audit-context support while preserving actor-type restriction; web files add abort/generation plumbing).
- No unconditional `skip`/`todo`/`.only`: only the standard env-conditional `describeWithPostgres = testDatabaseUrl ? describe : describe.skip` in the three Postgres test files, and the runs with `TEST_DATABASE_URL` set report 0 skipped.
- No lowered thresholds; no real credentials (only local synthetic role passwords such as `synthetic-role-password`, `randomBytes(18)` at runtime, and `postgres://cvg_prod@127.0.0.1:55481/...` local URLs); no external effects (tests use disposable databases; the UI probe intercepts `**/v1/**` in Chromium).
- Caveat: `apps/api/src/server.ts` and `package.json` contain non-M1 changes vs HEAD whose attribution could not be established from this dirty working tree (F7, NOT_VERIFIED).
- The manifests’ `npm test` gate claim (`234 passed | 7 skipped (241); 1625 passed | 81 skipped (1706)`) was **not re-run** (out of scope for this review) — NOT_VERIFIED.

### C7 (evidence integrity) — **REWORK** (3 hash mismatches)

`node /tmp/opencode/verify-c7.mjs` — checks every hash in every hash map of the six manifests (`inputs`, `sourceSha256`, `evidenceSha256`, `contractSha256`):

```
{ "total": 58, "matches": 55, "bad": [
  { "dir": "PROD-01", "group": "inputs", "file": "docs/03_build/tracking/aaa_program_backlog.json",
    "expected": "4cc7277a…", "actual": "b67a70c1…", "status": "MISMATCH" },
  { "dir": "PROD-01", "group": "inputs", "file": "docs/03_build/tracking/production_delta_backlog.json",
    "expected": "204bf818…", "actual": "7a137b5a…", "status": "MISMATCH" },
  { "dir": "PROD-01", "group": "inputs", "file": "docs/04_audit/evidence/PROD-20260913/PROD-01/readiness-probe.ts",
    "expected": "e710f186…", "actual": "2f191ae0…", "status": "MISMATCH" } ] }
```

Assessment:
- The three mismatches are in **PROD-01’s `inputs` map only**. Two are tracking JSONs that continued to evolve during the session; the third is the readiness probe itself, which AAA-22’s manifest documents as revised (“verdict now requires queries>=1…”), so its PROD-01 input hash is stale.
- All `sourceSha256` hashes of the M1 source/test files and all `evidenceSha256`/`contractSha256` entries in the six manifests **match**, including the batch files that F1 concerns. This is what makes F1 an evidence-gate contradiction rather than a stale-file artifact.
- No mismatch indicates tampering with product bytes; this is bookkeeping drift (P3).

---

## Integrity summary (what is and is not attested)

- Source of the batch is byte-stable and matches the manifests: `packages/persistence/src/tenant-scoped-postgres.ts`, `journeys.ts`, `journeys-postgres.ts`, `journeys-postgres.test.ts`, `apps/api/src/server.ts`, `readiness.ts`, `readiness.test.ts`, `journeys-api-postgres.test.ts`, `apps/worker/src/postgres-role-preflight.ts`, `main.ts`, `postgres-role-preflight.test.ts`, `apps/web/*` journey files, `package.json` — all `sourceSha256` MATCH.
- Gate claims in the manifests that the verifier could reproduce: `journey/API postgres tests 32`, `preflight 10`, `readiness 8`, `test:postgres 18/151`, `eslint` — PASS. `typecheck` — **FAIL (F1)**. `npm test` full suite — NOT_VERIFIED (not re-run). Chromium UI probe — PASS (re-executed).
- The manifests’ `typecheck PASS exitCode 0` rows (PROD-02, PROD-03, PROD-05, PROD-06, AAA-22) do not hold for the attested bytes: the test file that fails typecheck was last modified at 11:02:41 local, the manifests were written at 11:03:31 local, and its sha256 still matches what the manifests recorded. Either the gate was run before the final edit or it was recorded without execution; in both cases the frozen evidence is inaccurate.

## NOT_VERIFIED limits

1. Full `npm test` (234 files / 1625 tests claimed) was not re-run — only the paths required by C1–C6 plus eslint/prettier/typecheck. The manifests’ full-suite gate claim remains unverified.
2. `npm run test:worker:startup` and `npm run build:web` gates claimed by PROD-03/PROD-05 manifests were not re-run (UI build is implied by typecheck for the web part; not independently executed).
3. Attribution of non-M1 hunks in `apps/api/src/server.ts`/`package.json` (F7) is impossible from this working tree; the integrator must confirm they belong to other accepted work.
4. The builder’s own probe artifacts (`sql-atomicity-probe.after.json`, `ui-race-probe.json`, logs) were hash-verified but not re-generated in place; independent reruns used the verifier’s own DBs/schemas/screenshots.
5. `npm run format:check` repo-wide was not used as a criterion (known preexisting failures); only the 17 batch files were checked.

## Commands run (summary)

| # | Command | Exit | Key result |
|---|---------|------|-----------|
| 1 | `createdb … verifier_c1` | 0 | scratch DB |
| 2 | `PROD_PROBE_SCHEMA=verifier_c1_atomicity TEST_DATABASE_URL=…verifier_c1 npx tsx …/sql-atomicity-probe.ts` | 0 | PASS_ATOMIC |
| 3 | `npx tsx /tmp/opencode/verify-c1.ts` | 0 | FALSIFICATION_FAILED_CONFIRMED_SAFE |
| 4 | `npx tsx /tmp/opencode/verify-c1b.ts` | 0 | F5: CALLER_SEES_ERROR_AFTER_COMMIT |
| 5 | `npx vitest run …journeys-identity-race.test.tsx` | 0 | 3/3 |
| 6 | vite 4398 + `node …/ui-race-probe.cjs` | 0 | PASS_STALE_DISCARDED |
| 7 | `TEST_DATABASE_URL=…cvg_prod_test npx vitest …postgres-role-preflight.test.ts` | 0 | 10/10 |
| 8 | `npx tsx /tmp/opencode/verify-c3.ts` | 0 | CLEANUP_DESTROYS_AND_NO_LEAK_CONFIRMED |
| 9 | `npx tsx /tmp/opencode/verify-c3b.ts` | 0 | DB_OWNER_REJECTED_CONFIRMED |
| 10 | `TEST_DATABASE_URL=… npx vitest …journeys-postgres.test.ts …journeys-api-postgres.test.ts` | 0 | 2 files / 32 tests |
| 11 | `NODE_ENV=test TEST_DATABASE_URL=…verifier_c4 npx tsx /tmp/opencode/verify-c4.ts` | 0 | OVERRIDE_BLOCKED_CONFIRMED |
| 12 | `NODE_ENV=test npx tsx …/readiness-probe.ts` | 0 | PASS_PROBED |
| 13 | `npx vitest run …readiness.test.ts` | 0 | 8/8 |
| 14 | `npm run typecheck` | **2** | **1 error (F1)** |
| 15 | `TEST_DATABASE_URL=… npm run test:postgres` | 0 | 18 files / 151 tests, 0 skipped |
| 16 | `npx prettier --check <batch files>` | **1** | **warn aaa_decision_brief.md (F2)** |
| 17 | `npx eslint <batch files>` | 0 | clean |
| 18 | `node /tmp/opencode/verify-c7.mjs` | 0 | 55 MATCH / 3 MISMATCH (F3) |
