# PR301 webhook replay fix — verification record

- Date: 2026-09-28.
- Scope: synthetic BUILD for SPEC 0160/0161 in `/tmp/cvg-pr301-webhook-replay-20260928`.
- Runtime: Node `v22.23.2`; PostgreSQL `16.15`, disposable database `cvg_pr301_fix`, local port `55499`.
- No production database, provider, credential, or real event was used.

## Runs

| Check | Result | Evidence |
| --- | --- | --- |
| Initial focused PostgreSQL suite before subprocess test | PASS, 14/14 | `focused-postgres-final.log` (superseded by the later 15-test run) |
| First separate-process test attempt | FAIL, timed out at 60s | `two-process-postgres.log`; parent awaited the second response before releasing the first process, creating a test-harness deadlock. No child worker remained afterward. |
| Separate-process lease/fencing test after harness fix | PASS, 1 passed; 6 filtered by test-name selection | Vitest run on `webhook-event-inbox.test.ts`, filter `fences webhook lease takeover across separate Fastify processes`; duration 33.72s. |
| Final focused PostgreSQL suite | PASS, 15/15 across 2 files, 0 skipped | Vitest run on `webhook-event-inbox.test.ts` and `tenant-schema-inventory-postgres.test.ts`; duration 100.36s. Output was observed in the execution session at 14:33:34 local time. |
| Complete PostgreSQL suite | PASS, 36 files / 273 tests, 0 skipped | `postgres-suite.log`; `npm run test:postgres`; PostgreSQL-required gates enabled. Duration 160.20s. |
| Complete test suite with PostgreSQL | PASS, 341 files / 2,594 tests, 0 skipped | `full-suite.log`; `npm test -- --testTimeout=60000` with `TEST_DATABASE_URL` at the disposable loopback database and `WEBHOOK_PG_REQUIRED=1 AUD19_PG_REQUIRED=1 PHASE4A_PG_REQUIRED=1 PHASE4A_DISPOSABLE_PG=1`. Duration 437.88s. |
| Production-mode web build | PASS | `npm run build` with synthetic trusted identity and HTTPS origins `https://console.cvg.example` / `https://api.cvg.example`; artifact checker accepted 10 files, digest `d972d26245690a3bece1970db670888b40813c44df4f67cdf8c4e5fec53e5b7f`. Vite warned that `node:dns/promises` was externalized from the shared SSRF module; inspection of the generated web bundle found no DNS/SSRF module strings. |
| TypeScript typecheck | PASS | `npm run typecheck`, Node 22. |
| ESLint | PASS | `npm run lint`, whole repository, Node 22. |
| Node version preflight | PASS | `node scripts/node-version-preflight.mjs`, Node `v22.23.2`. |
| Repository formatting | PASS | `npm run format:check`; all matched files formatted. |
| Documentation links and evidence hygiene | PASS (pre-ledger refresh; rerun pending) | `npm run docs:check-links`; 0 broken links, 603 JSON artifacts parsed, 0 hygiene errors. |
| Candidate whitespace check | PASS | `git diff --check`. |

The separate-process test starts two independent Node processes, each with its own Fastify server and PostgreSQL pool. The first pauses after acquiring the lease. Once it expires, the test waits for the second process to acquire the lease, resumes the first, and checks that fencing rejects the first commit. The successful path produced exactly one message, outbox event, and audit row, with one committed inbox row and no pending row; a replay returned the stored receipt.

## Current candidate hashes

| File | SHA-256 |
| --- | --- |
| `apps/api/src/webhook-event-inbox.ts` | `8198fd4f1f0b7d9daccd050578a5b966c91594ea142af2f79186db0306476e04` |
| `apps/api/src/tenant-preflight.ts` | `1997e6fea10f25c9606dc7d6466393326f91c00642a0dababdc4b76ca9c27e02` |
| `apps/api/src/__tests__/webhook-event-inbox.test.ts` | `9a9b9eb470979f42fd0848a7b66339c2cb8ff54e7b6dd31ae2c2cad178d829b8` |
| `apps/api/src/__tests__/tenant-schema-inventory-postgres.test.ts` | `1f62791db7c4a42508a0dbbdec2762d066b4e08804e5c876a8aa5692a480035d` |
| `apps/api/src/__tests__/fixtures/webhook-inbox-process-worker.ts` | `68fc8d8830b3bf2534115eb5ffb1ac9a61d19d344a28082396617a5d9e96a351` |

## Independent review and release status

Code review I2 returned `REVISE` with three P1 gaps: durable clock high-water across restart/failover; internal recovery of encrypted pending events after the HTTP signature expires; and resolution of an ambiguous final COMMIT without returning a generic error. The latter two need a separate registered implementation claim and integration; `apps/api/src/server.ts` remains claimed by PR-L04. See `I2-independent-review.md`.

The [recovery boundary decision](recovery-boundary-decision.md) records the connected path, current ownership constraint, proposed shared processing seam, and verification needed for B3/`UNKNOWN_COMMIT`. No implementation was started because the active PR-L04 claim owns `apps/api/src/server.ts`; a detached worker would duplicate the transaction path and would not close the P1.

SPEC 0162 remains a draft. I5 returned `REVISE` (2 P1 / 3 P2); I6 returned `REVISE` (4 P1 / 2 P2) on hash `215f5146eec6ecac8b07c9561f34487e1a33da5e030965c83af6b9ab4d6bc4a3`. The documented response is bound to current candidate SHA-256 `ee949d17daa04241131bae402bd49f5c28e61f4dcda38a5e81b772d2d497bc8e`; final format/link checks and fresh-context I7 are pending. No human approval or BUILD authorization exists for migration 0028.

All checks above use synthetic data and a disposable PostgreSQL 16.15 database. The suite/build results do not close the independent P1s, verify CI provenance/staging, or establish production readiness. Production remains `NO_GO`.

## Raw log hashes

| Log | SHA-256 |
| --- | --- |
| `full-suite.log` | `9450a82b8c51c9ec2ce7118fce726834d26dc84548c11cbfe5d7db11675761f2` |
| `postgres-suite.log` | `2420fa806e29efb43b1a686d51f11e5882ab730e2598d5b66dbbf9ace3229fea` |
| `web-build.log` | `e72d0e72766a017d30055318a7c773c74f832b71cea4f7604cdff49128732a6b` |

`web-build.log` records the successful production-mode build and artifact digest. The Vite externalization warning is retained; the generated browser bundle was separately scanned and contained no DNS/SSRF module reference. Final format, link, and evidence-hygiene checks passed after the packet refresh: zero broken links, 603 JSON artifacts parsed, and zero hygiene errors.

## Local commit and cleanup

- The five claimed source/test files were committed locally on isolated branch `codex/pr301-webhook-replay-20260928` as `aad04d9ace6ed5b6d9c9902f4ddcad67b87a4abc` (`fix(api): harden webhook replay inbox fencing`). The worktree was clean after commit. No push or root integration was performed.
- The disposable PostgreSQL container `cvg-pr301-replay-fix-pg-20260928` was stopped and removed after all database checks. Verification found no container and no listener on `127.0.0.1:55499`.
- Independent code review I2 remains `REVISE` with three P1 gaps described above. The commit is a locally verified partial fix and does not establish production readiness.
