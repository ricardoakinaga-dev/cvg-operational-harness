# Independent revalidation — PROD-20260913 M1 correction batch (F1–F6)

- Verifier: fresh independent verifier agent (did not write the code under review, separate from the author of `REVIEW.md`).
- Date/observation window: 2026-09-13, ~11:20–11:45 local (UTC-3), repo `/home/ricardo/cvg-agent-secretary-v2`, branch `main`, HEAD `512bc11`, working tree dirty (same base as the previous review).
- Inputs: `REVIEW.md` (previous verdict REWORK) and `RESPONSE.md` (builder).
- Method: every command below was executed against the actual working tree. Only writes allowed/unused by the verifier: this file and throwaway probes under `/tmp/opencode` (`reval-r3-hashes.mjs`, `reval-r3-sums.txt`, `reval-c1b.ts`, logs). No product/source/test/config file was modified (`git status --short` count unchanged at 150 before/after all runs). PostgreSQL 16 at `127.0.0.1:55481` (`cvg_prod`, trust); port 5432 untouched.

## Overall verdict: **REVALIDATED_PASS**

F1–F6 are all resolved; R1–R7 all pass. One new non-blocking bookkeeping finding (N1, P3) was found and is documented below. No P0/P1/P2 findings.

| Item    | Previous finding                                   | Revalidation result                                                                                                                 |
| ------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| R1 / F1 | typecheck exit 2 on fake pool                      | **PASS** — `npm run typecheck` EXIT=0 on the attested bytes; fake pool cast present and file is inside tsconfig include             |
| R2 / F2 | prettier failed on `aaa_decision_brief.md`         | **PASS** — all 16 listed files clean                                                                                                |
| R3 / F3 | 3 stale hashes in PROD-01 manifest                 | **PASS** — 64/64 hash-map entries match; `sha256sum -c` 64 SUCESSO; inline `baselineDrift` was/now also verified                    |
| R4 / F5 | post-COMMIT cleanup error after committed mutation | **PASS** — reset+verification now before COMMIT; cleanup/verification failure ⇒ ROLLBACK, no COMMIT; real-pool wire order confirmed |
| R5      | —                                                  | **PASS** — 4 files / 50 tests, 0 skipped                                                                                            |
| R6      | —                                                  | **PASS** — 18 files / 151 tests, 0 skipped                                                                                          |
| R7 / F6 | contract drift (preflight/lazy reads)              | **PASS** — contract now matches the implementation                                                                                  |

---

## R1 — `npm run typecheck` (F1)

Command and result:

```
$ npm run typecheck
> cvg-agent-secretary-v2@1.0.0 typecheck
> tsc -p tsconfig.typecheck.json --noEmit
EXIT=0
```

Fake-pool inspection (`apps/worker/src/__tests__/postgres-role-preflight.test.ts:336-338`):

```ts
const pool = {
  connect: async () => client
} as unknown as Parameters<typeof assertPostgresWorkerPreflight>[0]
```

- This is the only fake pool in the file (`grep "connect: async"` → line 337 only) and it carries the explicit cast named in `RESPONSE.md` F1.
- The file is genuinely typechecked: `tsconfig.typecheck.json` includes `apps/**/*.ts`, and there is no exclude for tests. The PASS is not an artifact of the file being skipped.
- The test file's bytes are the attested ones: sha256 `9dd91ae46e84…` equals PROD-05 `sourceSha256` and the spot check with `sha256sum`.

The previous P1 blocker is resolved.

## R2 — prettier on the 16 batch files (F2)

Command and result:

```
$ npx prettier --check apps/worker/src/postgres-role-preflight.ts apps/worker/src/main.ts \
    apps/worker/src/__tests__/postgres-role-preflight.test.ts \
    apps/web/src/features/journeys/index.tsx apps/web/src/api/client.ts \
    apps/web/src/__tests__/journeys-identity-race.test.tsx \
    apps/api/src/readiness.ts apps/api/src/server.ts \
    apps/api/src/__tests__/readiness.test.ts apps/api/src/__tests__/journeys-api-postgres.test.ts \
    packages/persistence/src/journeys.ts packages/persistence/src/journeys-postgres.ts \
    packages/persistence/src/tenant-scoped-postgres.ts \
    packages/persistence/src/__tests__/journeys-postgres.test.ts \
    docs/02_spec/prod20260913_m1_corrections_contract.md docs/01_prd/aaa_decision_brief.md
Checking formatting...
All matched files use Prettier code style!
EXIT=0
```

Both markdown files in the list (including the previously failing `aaa_decision_brief.md`) are clean.

## R3 — manifest hash integrity (F3)

Independent extractor written by this verifier (`/tmp/opencode/reval-r3-hashes.mjs`), not the previous verifier's script. It checks the four hash-map groups in all six manifests:

- `inputs` (PROD-01; 26 entries, now including `REVIEW.md`/`RESPONSE.md`)
- `sourceSha256` and `evidenceSha256` (PROD-01/02/03/05/06/AAA-22)
- `contractSha256` (bare hash resolved to `docs/02_spec/prod20260913_m1_corrections_contract.md`)

```
==== SUMMARY ====
{ "total": 64, "matches": 64, "bad": [], "badCount": 0 }
```

Literal `sha256sum` confirmation (all 64 path/hash pairs extracted to `/tmp/opencode/reval-r3-sums.txt`):

```
$ sha256sum -c /tmp/opencode/reval-r3-sums.txt
... 64 x "SUCESSO"
EXIT=0
```

Additionally, PROD-01's inline `baselineDrift` was verified:

- all 6 `now` hashes equal the current `docs/03_build/0300…`, `0301…`, `0302…`, `docs/20_master_execution_log.md`, `docs/30_backlog_master.md`, `docs/99_runtime_state.md`;
- all 6 `was` hashes equal the baseline `docs/04_audit/evidence/AUD-20260913-DOCS/manifest.json` `files[]` entries.

The three previously stale hashes (`aaa_program_backlog.json`, `production_delta_backlog.json`, `readiness-probe.ts`) are now the values on disk and match. The hash sweep was re-run after all test executions and remained 64/64, so no test run mutated attested bytes.

## R4 — `withTenantTransaction` cleanup placement (F5)

Code (`packages/persistence/src/tenant-scoped-postgres.ts:157-210`) now does, on the success path:

```
BEGIN (171) → set_config('cvg.tenant_id', tenant) (172) → operation (176)
→ set_config('cvg.tenant_id', '') (177) → verify current_setting empty, throw if leaked (181-187)
→ COMMIT (188) → release() (189) → return
```

Error path: `ROLLBACK` (193) → clear again (199) → `release(cleanupError)` destroys the connection when cleanup failed (203-206) → rethrow the original error. A connection with dirty context is never returned to the pool.

Previous verifier's probe `/tmp/opencode/verify-c1b.ts`, re-run unchanged (EXIT=0):

```
"sql": ["BEGIN","set_config:tenant_…","INSERT journey_owner_drafts (synthetic)",
        "set_config:","ROLLBACK","set_config:"],
"thrown": "transient cleanup failure",
"releaseCount": 1, "releaseErrors": [null],
"observation": "CALLER_SEES_ERROR_AFTER_COMMIT"
```

The `observation` label is a stale heuristic of the old probe (it keys only on `value === undefined`); its own SQL log shows the decisive fact: **no `COMMIT` executed**. The `INSERT` was rolled back.

My own probe `/tmp/opencode/reval-c1b.ts` (fresh, tracks COMMIT explicitly; EXIT=0):

| Scenario                                                | Result                                                                                                                                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. fake pool, success                                   | order `BEGIN → set_config(tenant) → INSERT → set_config() → verify(current_setting) → COMMIT`; value returned; one clean release; `cleanupBeforeCommit: true`                                                    |
| B. fake pool, first clear fails                         | thrown `clear attempt 1 failed`; order `… → set_config() → ROLLBACK → set_config()`; `commitExecuted: false`; `errorSurfacedWithCommittedMutation: false`                                                        |
| C. fake pool, `current_setting` still leaks after clear | thrown `PostgreSQL tenant context cleanup was not verified`; `commitExecuted: false`; ROLLBACK                                                                                                                   |
| D. real pool (`cvg_prod_test`)                          | wire order `BEGIN → set_config(tenant) → SELECT 1 AS ok → set_config() → verify(current_setting) → COMMIT`; fresh connection `current_setting('cvg.tenant_id', true)` = NULL                                     |
| E. real pool + injected clear failure                   | thrown `injected clear failure`; order `BEGIN → set_config(tenant) → CREATE TEMP TABLE → INSERT → set_config() → ROLLBACK → set_config()`; `commitExecuted: false`; mutation rolled back; fresh connection clean |

**Conclusion:** a committed mutation can no longer return a cleanup error. The fixed ordering is on the attested bytes (`tenant-scoped-postgres.ts` sha256 `055bca02…` = PROD-02 `sourceSha256`).

Residual limit: a `COMMIT` whose response is lost (connection drop after the server commits) remains an in-doubt transaction and can still surface an error to the caller — inherent to PostgreSQL, bounded by the idempotency key, and unchanged by this fix. Not exercised.

## R5 — focused Postgres test set

```
$ TEST_DATABASE_URL=postgres://cvg_prod@127.0.0.1:55481/cvg_prod_test \
  npx vitest run --testTimeout=60000 --no-file-parallelism \
  packages/persistence/src/__tests__/journeys-postgres.test.ts \
  apps/api/src/__tests__/journeys-api-postgres.test.ts \
  apps/worker/src/__tests__/postgres-role-preflight.test.ts \
  apps/api/src/__tests__/readiness.test.ts

 Test Files  4 passed (4)
      Tests  50 passed (50)
   Duration  6.58s
EXIT=0
```

Matches the expectation of 4 files / 50 tests. Per-file inventory corroborated by the hashed logs: preflight 10/10 (`PROD-05/tests.log`), readiness 8/8 (`AAA-22/tests.log`), journey/API 32/32 (`PROD-02/tests.log`).

## R6 — `npm run test:postgres`

```
$ TEST_DATABASE_URL=postgres://cvg_prod@127.0.0.1:55481/cvg_prod_test npm run test:postgres

 Test Files  18 passed (18)
      Tests  151 passed (151)
   Duration  26.80s
EXIT=0
```

0 skips: the log contains no `skip`/`todo`/`pending` lines and the summary reports only passed. Matches the expectation of 18 files / 151 tests and the hashed `PROD-05/test-postgres.log` (same 18/151).

## R7 — contract text (F6)

`docs/02_spec/prod20260913_m1_corrections_contract.md` (sha256 `7cff313d…`, equals every manifest's `contractSha256` and the actual file):

- line 88 (PROD-05): “executa as consultas com contexto de tenant explícito na mesma conexão (`set_config`), verifica que `current_setting('cvg.tenant_id', true)` está vazio antes de devolver a conexão e destrói a conexão (`release(error)`) quando a limpeza falha ou não é verificada.” — matches `apps/worker/src/postgres-role-preflight.ts:65` (set), `:190-193` (verify empty), `:200-209` (destroy on failure/failed verification). The old “por `withTenantContext`” wording is gone.
- lines 20/24/25 (PROD-02): lazy-expiry reads run inside `withTenantTransaction`, with “limpeza do contexto verificada → COMMIT” and ROLLBACK/destroy on cleanup failure — matches `packages/persistence/src/journeys-postgres.ts` (all reads with lazy expiry use `withTenantTransaction`, e.g. `:218-219`, `:236-246`, `:259-260`, `:279-289`, `:302`, `:364-365`, `:401`; rationale comment at `:177-180`).

The contract now describes the implemented mechanism, not a different one.

---

## New findings

| ID  | Severity                           | Finding                                                                                                                                             |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | **P3** (bookkeeping, non-blocking) | The `npm test` gate claim in five manifests does not match the attested full-suite log or a fresh rerun. Manifests say `PASS: Test Files 234 passed | 7 skipped (241); Tests 1625 passed | 81 skipped (1706)`; the attested `PROD-01/npm-test-final.log:114-115`says`Tests 1625 passed | 83 skipped (1708)`, and two fresh `npm test`runs (one background 226.9s, one foreground 258.4s, EXIT=0) produced`1625 passed | 83 skipped (1708)`. The builder's manifest writer hardcodes the stale figure at `docs/04_audit/evidence/PROD-20260913/PROD-01/write-m1-manifests.mjs:41`. |

- Locations: `PROD-02/manifest.json:60`, `PROD-03/manifest.json:57`, `PROD-05/manifest.json:42`, `PROD-06/manifest.json:42`, `AAA-22/manifest.json:50`.
- Repro:
  ```
  grep -n "81 skipped" docs/04_audit/evidence/PROD-20260913/{PROD-02,PROD-03,PROD-05,PROD-06,AAA-22}/manifest.json
  sed -n '114,115p' docs/04_audit/evidence/PROD-20260913/PROD-01/npm-test-final.log
  npm test   # EXIT=0, "Tests 1625 passed | 83 skipped (1708)"
  ```
- Impact: none on product/source bytes — the gate outcome (PASS, 234 files, 1625 tests, 0 failures) is correct and reproduced; only the skipped/total counts are stale by 2 (same class as the fixed F4). Recommend correcting the gate text (or recording the exact run id it refers to) when the manifests are next regenerated.

No weakened assertions, unconditional skips, lowered thresholds, real credentials or external effects were found in the F1–F6 delta.

## Additional gates re-run (resolves prior NOT_VERIFIED items)

| Command                                                        | Result                                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `npm test` (`vitest run --no-file-parallelism --maxWorkers=2`) | EXIT=0; `Test Files 234 passed                                              | 7 skipped (241)`; `Tests 1625 passed | 83 skipped (1708)`; 258.4s. Reproduced twice with identical counts. Resolves previous review NOT_VERIFIED #1. |
| `npx eslint <14 source batch files>`                           | EXIT=0 (clean).                                                             |
| `npm run test:worker:startup`                                  | EXIT=0; `worker.startup_smoke_passed` + `worker.controlled_smoke_verified`. |

## NOT_VERIFIED limits

1. `npm run build:web` (PROD-03 gate) was not re-executed; TypeScript coverage of the web files is proven by `npm run typecheck`, but the Vite production build itself is not independently re-run.
2. F7 (non-M1 hunks in `apps/api/src/server.ts` / `package.json`) remains unattributable from this dirty working tree; unchanged by this revalidation and still for the integrator to confirm.
3. The in-doubt `COMMIT` case (server committed, response lost) is intrinsically ambiguous and was not exercised; bounded by the idempotency key as before.
4. The PROD-03 Chromium UI probe and the PROD-01/02 atomicity probes were not re-executed this round; their evidence files hash-match the manifests (R3), and their functional behavior was independently reproduced by the previous review on these same attested bytes.
5. All hash checks are valid for the working tree as observed at 2026-09-13 ~11:45 local; any later edit invalidates them (sweep re-run after tests remained 64/64).

## Command summary

| #   | Command                                           | Exit        | Key result                                                                    |
| --- | ------------------------------------------------- | ----------- | ----------------------------------------------------------------------------- | ---------------------------- | ---------- |
| 1   | `npm run typecheck`                               | 0           | clean; F1 fixed                                                               |
| 2   | `npx prettier --check <16 batch files>`           | 0           | all clean; F2 fixed                                                           |
| 3   | `node /tmp/opencode/reval-r3-hashes.mjs`          | 0           | 64/64 MATCH, 0 bad; F3 fixed                                                  |
| 4   | `sha256sum -c /tmp/opencode/reval-r3-sums.txt`    | 0           | 64/64 SUCESSO                                                                 |
| 5   | `npx tsx /tmp/opencode/verify-c1b.ts` (old probe) | 0           | SQL order shows no COMMIT before ROLLBACK                                     |
| 6   | `npx tsx /tmp/opencode/reval-c1b.ts` (new probe)  | 0           | A–E: cleanup+verify before COMMIT; no error with committed mutation; F5 fixed |
| 7   | `TEST_DATABASE_URL=… npx vitest run <4 files>`    | 0           | 4 files / 50 tests                                                            |
| 8   | `TEST_DATABASE_URL=… npm run test:postgres`       | 0           | 18 files / 151 tests, 0 skips                                                 |
| 9   | `npm test` (background)                           | 0 (summary) | 234                                                                           | 7 skipped files; 1625 passed | 83 skipped |
| 10  | `npm test` (foreground)                           | 0           | same counts; 258.4s                                                           |
| 11  | `npx eslint <14 source files>`                    | 0           | clean                                                                         |
| 12  | `npm run test:worker:startup`                     | 0           | startup + controlled smoke verified                                           |

**Final verdict: REVALIDATED_PASS** — F1–F6 resolved, R1–R7 pass; N1 (P3, manifest `npm test` skipped-count bookkeeping) recommended for correction at the next manifest regeneration, with no product impact.
