# PROD-20260913 — M1 fresh independent review (round 3)

Critic: fresh context, did not build/review prior rounds. Adversarial verification on the actual bytes.
Date: 2026-09-13. Repo: `/home/ricardo/cvg-agent-secretary-v2`, branch `main`, HEAD `512bc11`, dirty tree preserved (no commit/reset/clean).
Contract read directly: `docs/02_spec/prod20260913_m1_reaudit_contract.md` (plus `prod20260913_m1_corrections_contract.md` for prior scope).

## 0. Verdict

**PASS** — no P0/P1 and no material P2 found against the contract. Two P3 observations and explicit limits below.
All eight corrections RA-M1-01..08 were reproduced on real artifacts: every focused/full suite passed, every adversarial probe passed, and neutralizing the fixes made the discriminating tests fail.

## 1. Candidate fingerprint (before / after)

Source list: `docs/04_audit/evidence/PROD-20260913/reaudit-round2/manifest.json` → `sourceRevalidation.files` (648 paths, each with an expected sha256).
Method: `sha256` of every listed file, per-file compare against the frozen manifest hashes, plus an aggregate hash over `path+sha256` in sorted order (`fingerprint.py`, stored in this folder).

|                   | count listed | count hashed | missing | mismatched vs manifest | aggregate sha256                                                   |
| ----------------- | ------------ | ------------ | ------- | ---------------------- | ------------------------------------------------------------------ |
| BEFORE (all runs) | 648          | 648          | 0       | 0                      | `b0c675233a0bdf68e9b6aa8f3b07c225634bcbc223c25c6d9c5e9318710a90fe` |
| AFTER all runs    | 648          | 648          | 0       | 0                      | `b0c675233a0bdf68e9b6aa8f3b07c225634bcbc223c25c6d9c5e9318710a90fe` |

**No byte changed.** `fingerprint-before.json`, `fingerprint-final.json`, `fingerprint.py` stored here. The working tree also matches the frozen candidate manifest exactly before and after (0 mismatches), i.e. this candidate's product bytes are the ones the round produced.
Disclosure: `npm run build:web` was executed; it only writes `apps/web/dist/*` (gitignored, not in the manifest). No source/test/config file was written by me. All DB work happened on schemas created and dropped by the probes/tests in disposable databases.

## 2. Environment

- Node: `v22.23.2` (`export PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH`), npm `10.9.8`; vitest `4.1.11`; pg `8.20`.
- PostgreSQL: `16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)` at `127.0.0.1:55481`, user `cvg_prod`, trust auth; binaries under `/home/ricardo/.local/share/cvg-his-v4-runtime/.../postgresql/16/bin` with `LD_LIBRARY_PATH=.../usr/lib/x86_64-linux-gnu`.
- Disposable databases created by me: `critic3_main`, `critic3_http`, `critic3_preflight` (plus random schemas per test/probe). Port 5432 never touched. No real data, credential or external effect used.

## 3. Gates executed (commands, exit codes, key output)

| Gate                               | Command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Exit | Key output                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------- |
| Typecheck                          | `npm run typecheck`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 0    | no errors (`typecheck.log`)                                            |
| ESLint (changed source+test files) | `npx eslint <18 files>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 0    | clean (`eslint.log`)                                                   |
| Focused vitest                     | `TEST_DATABASE_URL=…critic3_main npx vitest run --testTimeout=60000 --no-file-parallelism apps/api/src/__tests__/readiness.test.ts apps/web/src/features/journeys/journeys.test.tsx apps/web/src/__tests__/journeys-identity-race.test.tsx packages/persistence/src/__tests__/journey-task-atomicity.test.ts packages/persistence/src/__tests__/journeys-postgres.test.ts apps/api/src/__tests__/journeys-api-postgres.test.ts packages/persistence/src/__tests__/journeys.test.ts packages/persistence/src/__tests__/tenant-isolation.test.ts` | 0    | 8 files, 83 tests passed                                               |
| Worker focused                     | `… npx vitest run … apps/worker/src/__tests__/postgres-role-preflight.test.ts postgres-controlled.test.ts controlled-worker.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                            | 0    | 3 files, 19 tests passed                                               |
| PostgreSQL battery                 | `TEST_DATABASE_URL=…critic3_main npm run test:postgres`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 0    | 19 files, 163 tests passed                                             |
| Full suite                         | `TEST_DATABASE_URL=…critic3_main npm test`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 0    | **242 files, 1733 tests passed, 0 skipped**, 254.6 s (`full-test.log`) |
| Web package regression             | `… npx vitest run --no-file-parallelism apps/web`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 0    | 22 files, 70 tests passed                                              |
| Extra API/persistence              | `… journey-routes-coverage.test.ts postgres-persistence-mode.test.ts journeys.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 0    | 3 files, 31 tests passed                                               |
| Worker startup smoke               | `npm run test:worker:startup`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 0    | `worker.startup_smoke_passed`, `worker.controlled_smoke_verified`      |
| Web build                          | `npm run build:web`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 0    | built in 350 ms                                                        |
| Round-2 readiness probe            | `NODE_ENV=test npx tsx docs/04_audit/evidence/PROD-20260913/reaudit-round2/m1-readiness-probe.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                               | 0    | `/ready` 503, elapsed 921 ms, destroyed 1 (it only writes stdout)      |

## 4. Per-RA verification

### RA-M1-01 (AAA-22) — readiness must fail when the timeout destroys the connection: **PASS**

Implementation at `apps/api/src/server.ts:4316-4379` (`createReadinessDatabaseProbe`) and `apps/api/src/readiness.ts:79-125`.

Reproduced on the AAA-22 RED case (probe `m1-readiness-probe.ts`, above): `release(error)` destroying the client at 900 ms rejects the pending query; `/ready` = **503** at 921 ms, client destroyed exactly once, `/live` = **200**; detail sanitized (`database probe failed`), no connection string leaked.

My probes (`probe-a-readiness.ts`, `probe-a2-timers.ts`; logs here):

1. timeout destroys a pending query → 503 (918 ms), `destroyed=1`, `releasedClean=0`, `/live` 200.
2. late query success after the deadline is ignored → 503, no double destroy, never becomes 200.
3. blocked `pool.connect()` (6 sequential probes) → `connect()` called **once**, follow-ups 503 in 7 ms total, late client destroyed once, `query` never called (no admission leak).
4. two concurrent probes admit one acquisition (`connected=1`).
5. timers cleared: patched `setTimeout`/`clearTimeout` count returns to 0 after the request; secret-laden failure body does not contain `postgres://`/`secret_pw`.

Contract mapping: connection/admission/late-query failure never becomes success; `/ready` 503 and `/live` 200; deadline includes `pool.connect` wait; no accumulation while pending; late client destroyed once; timeout never returns a busy connection to the pool; redacted errors; timers cleared. All observed.

### RA-M1-02/03 (PROD-03) — journey UI generation/session invalidation and form clearing: **PASS**

Implementation: `apps/web/src/features/journeys/index.tsx:49-70` (effect deps `[identityKey, selectedSessionId]`, aborts old controller, generation++, clears every form/draft state including `patientName` → `'Bolt'`, `busy`, `message`), `index.tsx:82-100` (`run` captures generation+signal; catch/finally guard generation), `apps/web/src/api/client.ts:476-484,546-710` (signal forwarded to `fetch` for all 8 journey operations).

Evidence:

- Repo tests: `journeys-identity-race.test.tsx` (13 tests) — stale tenant A success/error discarded, current-identity result visible, session A stale success/error discarded for `session_B` and `null`, obsolete request signal aborted, busy preserved for the in-flight current operation, six transitions (tenant/actor/role/logout/session/session-cleared) clear typed data and drafts and reset `patientName` to `Bolt`; `journeys.test.tsx` + `journeys-api-postgres.test.ts` confirm the authorized current search still works.
- Neutralization in a throwaway copy under `/tmp/opencode/critic3/ui-neutralized` (repo copy never edited; restored afterwards): baseline copy 13/13 pass; removing `selectedSessionId` from the effect deps → **6 failures** (the 4 session invalidation cases + 2 session-clear form cases); removing the 9 generation checks (`if (generation !== generationRef.current) return` → `if (false) return`) → **6 failures** (the 2 delayed previous-tenant cases + the 4 session invalidation cases). Logs `ui-baseline.log`, `ui-neutralized-deps.log`, `ui-neutralized-generation.log`.
- `npm test` web files all pass (no authorization change; client diff is purely additive `signal` plumbing, inspected via `git diff`).

### RA-M1-04/05/08 (PROD-02/06) — atomic tasks/audit, trusted actor/correlation, concurrent replay, verified reset: **PASS**

Implementation: `packages/persistence/src/postgres.ts:2854-2975` (`createTask` with `ON CONFLICT (session_id, source, idempotency_key) DO NOTHING … RETURNING id`; on zero rows it re-selects the winner — no query on an aborted transaction — then `onCreated`); `journeys-postgres.ts:379-414` (task + `journey_task_created` audit inside one `withTenantTransaction`); `journeys.ts:508-544` (memory parity: snapshot/restore on audit failure, dedupe by id); `tenant-scoped-postgres.ts:157-216` (`withTenantTransaction`: BEGIN → tenant context → operation → verified cleanup → COMMIT; error path ROLLBACK → cleanup → `release(cleanupFailure)`; cleanup absent/dirty → `release(error)` destroys the client); `apps/api/src/server.ts:1055-1083` + `3570-3590` (body spread first, then trusted `tenantId` and `auditContext` built from the resolved identity and request correlation override anything in the body).

Probes (`probe-c-atomicity.ts`, `probe-e-http-spoof.ts`):

1. Real trigger rejecting `audit_events`: repository call rejects with the original `synthetic audit failure` (SQLSTATE `P0001`), `tasks=0`, `audit_events=0`; immediately after, the pool connection shows `cvg.tenant_id = NULL`, `pg_backend_pid()` identical (same backend reused cleanly after ROLLBACK), no pool `remove` event.
2. Retry/replay with the same key: same task id, exactly 1 task and 1 event; event actor/correlation are the passed trusted context.
3. Concurrent identical replay (barrier on `INSERT INTO tasks`, two pool clients): both calls fulfilled with the **same** task id, 1 row for the key, 1 audit event, `25P02` absent.
4. Memory parity: audit failure restores `tasks=0/audit=0`; retry returns same id with 1 task + 1 event.
5. Over HTTP with `requireAuthenticatedMutations:true`, body spoofing `actorId/actorType/correlationId/tenantId/auditContext`: recorded audit is `Operator / operator.trusted.critic3 / corr_<response meta>`; spoofed correlation ignored; task stored under the header tenant; `journey_task_created` event exists with `conversationId`/`sessionId` payload. Same result for the owner-draft route.
6. Over HTTP with the real audit trigger: task route 500 `internal_error`, 0 task rows, no audit row added; after dropping the trigger the retry returns 200 with 1 task/1 event, trusted identity again.
7. Cleanup verification absent → client destroyed (`release(Error)`), covered by `journey-task-atomicity.test.ts` unit matrix plus my probe-d fake-client case.

### RA-M1-06/07 (PROD-05) — worker preflight rejects permissive policies and missing privileges: **PASS**

Implementation: `apps/worker/src/postgres-role-preflight.ts:54-255` — role flags/memberships/db ownership/schema CREATE; per-table RLS+FORCE+non-ownership; exactly one expected `${table}_tenant_isolation` policy per `WORKER_CRITICAL_TABLES` with `PERMISSIVE`/`{public}`/`ALL` and canonical `USING`/`WITH CHECK` (`normalizePolicyExpression`); `has_table_privilege` requires SELECT/INSERT/UPDATE and forbids DELETE/TRUNCATE/TRIGGER/REFERENCES on all 11 tables; verified context cleanup destroys the connection on failure; `main.ts:122-124,154-156` runs it before `drain`/`start`.

Probe (`probe-d-preflight.ts`, real roles and schema in `critic3_preflight`):

| Case                                                       | Result                                                                                                                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| minimal valid role (grants select/insert/update, no extra) | accepted                                                                                                                                                                     |
| extra permissive `USING (true)` policy on `outbox_events`  | **pre-fix cross-tenant read demonstrated**: with tenant A context the role read tenant B's event; preflight then **rejected** (`tenant isolation policies are not verified`) |
| same pool after rejection                                  | `current_setting('cvg.tenant_id', true)` = NULL                                                                                                                              |
| single policy with wrong expression (`USING (true)`)       | rejected                                                                                                                                                                     |
| `REVOKE INSERT ON outbox_effects`                          | rejected (`table privileges must be minimal`)                                                                                                                                |
| `GRANT DELETE ON tasks`                                    | rejected                                                                                                                                                                     |
| `NO FORCE ROW LEVEL SECURITY` on `sessions`                | rejected                                                                                                                                                                     |
| role owns `outbox_effects`                                 | rejected                                                                                                                                                                     |
| all mutations reverted (grants re-applied)                 | minimal role passes again                                                                                                                                                    |
| cleanup verification returns no row                        | rejects and destroys client (`release(Error)`)                                                                                                                               |

No skip, no threshold change: policy expression comparison is strict equality after normalization; a second policy (even RESTRICTIVE) fails `tablePolicies.length !== 1`.

## 5. Test/evidence integrity (no weakening)

- Round delta inspected byte-for-byte via `docs/04_audit/evidence/PROD-20260913/reaudit-round2/product-delta.patch` (1241 lines) plus `git diff` for tracked paths. All test changes in the delta are **additive** except one justified mock adaptation: `postgres-migration-smoke.test.ts` changed the fake `INSERT INTO tasks` from `throw {code:'23505'}` to `return result([])`, matching the new `ON CONFLICT DO NOTHING` contract (the old unique-violation recovery path no longer exists by design in this round).
- `grep` for `.only`, `.skip`, `it.todo`, `xit`, `xdescribe` in the affected tests: only conditional `describe.skip`/`skipIf` gated on missing `TEST_DATABASE_URL` (pre-existing pattern). With `TEST_DATABASE_URL` set, the full suite reported **1733 passed / 0 skipped**.
- Coverage thresholds unchanged (`vitest.config.mts:30-35`, 80/80/80/80); `vitest.config.mts` is not in the round delta and its bytes match the manifest.
- No `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `@ts-nocheck` in the changed files; no new external URL, channel, credential or real effect in the changed files (the only `secret` hits are the pre-existing webhook signing-secret production checks in `server.ts`).

## 6. Adversarial probes (all under /tmp/opencode/critic3, copies stored here)

| Probe                              | Purpose                                                                                                               | Result                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `probe-a-readiness.ts`             | timeout vs destroy, late success, blocked admission, concurrent probes                                                | all fail-closed 503; 1 admission; late client destroyed once; `/live` 200    |
| `probe-a2-timers.ts`               | timer leak + secret redaction                                                                                         | live timers before/after = 0/0; body has no `postgres://`/`secret_pw`        |
| UI neutralization (throwaway copy) | remove session dep / generation guards                                                                                | 6 failures each; baseline 13/13                                              |
| `probe-c-atomicity.ts`             | real trigger, retry, concurrent replay, no 25P02, rollback context reset, memory parity                               | all pass (see §4)                                                            |
| `probe-d-preflight.ts`             | extra permissive policy, wrong expression, missing/forbidden privileges, FORCE/ownership, valid role, cleanup destroy | all pass (see §4)                                                            |
| `probe-e-http-spoof.ts`            | spoofed body identity/tenant over HTTP; HTTP task atomicity                                                           | trusted actor/correlation/tenant recorded; 500/failure leaves 0/0; retry 1/1 |

Probe notes for future reviewers:

- `m1-readiness-probe.ts` and my readiness scripts need a ref'd keep-alive (`setInterval`) — all readiness timers are `unref()`ed, so without one Node exits 0 with no output.
- Changing table ownership (`ALTER TABLE … OWNER TO`) silently drops the role's explicit grants in PostgreSQL 16; my first preflight run mis-attributed this to the product. A fresh role per test (as the suite does) avoids it.

## 7. Findings

**P0/P1/P2: none.**

**P3 (observations, no acceptance violation):**

1. The preflight covers the declared `WORKER_CRITICAL_TABLES` (11 tables). The default controlled handler additionally reads platform tables (`createPostgresControlledHandlers` → `platform.resolvePublished`, `apps/worker/src/postgres-controlled.ts:263`), which the preflight does not privilege-check. Consequence is fail-closed (runtime permission error after claim), not cross-tenant leakage: `platform_*` tables have RLS+FORCE (`packages/persistence/migrations/0001_tenant_isolation.sql:867+`), and both the corrections and reaudit contracts scope the check to the consumed/critical set.
2. `withTenantContext` keeps the pre-round cleanup style (set empty + release, no post-clean verification query; `packages/persistence/src/tenant-scoped-postgres.ts:84-147`). The verified-reset requirement is implemented in `withTenantTransaction` (lines 171-188) and in the worker preflight; the PROD-02 contract explicitly kept `withTenantContext` unchanged, so this is out of the RA-M1-04/05/08 scope but worth tracking if other consumers ever carry tenant context.

## 8. NOT_VERIFIED limits

- UI verified in **jsdom** (vitest + Testing Library) with controlled promises and neutralization; no real browser/Playwright run this round (the round-1 Chromium `ui/race.cjs` probe was not re-executed).
- Readiness tested with synthetic pools (hanging, late-resolving, destroying); no sustained real-`pg.Pool` exhaustion/load test against `/ready`.
- No physical durability/crash-recovery or failover testing (out of scope); disposable local cluster 16.15 only, trust auth.
- No Docker/container execution.
- Fingerprint scope is the manifest's 648 `sourceRevalidation.files`; other repository files (docs, evidence) are not hashed, so this verdict speaks for those 648 product bytes.
- End-to-end HTTP journey flows over a real network listener were exercised via `app.inject` (fastify injection), not sockets; PostgreSQL paths were exercised with real connections.

## 9. Verdict

**PASS.** RA-M1-01, RA-M1-02/03, RA-M1-04/05/08 and RA-M1-06/07 all satisfy the contract on the current bytes: every correction is demonstrably present, test-discriminating (neutralization fails the tests), and reproduced with independent real-PostgreSQL/SQL probes; the candidate fingerprint is identical before and after (`b0c675…0a90fe`, 648/648 files), the full suite passes with zero skips, and no test was weakened, no skip added, no threshold lowered, and no real external effect or credential was introduced.
