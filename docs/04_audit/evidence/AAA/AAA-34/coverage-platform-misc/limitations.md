# Limitations — AAA-34 / coverage-platform-misc

1. **Focused denominator, not global.** Every package number was produced with a
   focused run (`--coverage.include='<pkg>/**/*.ts'`). It matches the
   `vitest.config.mts` source surface for the scoped packages except that the
   worker runs exclude `**/main.ts`, exactly as the global config does for
   process bootstraps. Web, API and persistence denominators were not touched.

2. **Unreachable/defensive branches remain uncovered.**
   - `packages/shared/src/ids.ts` lines 11–14: optional-chaining arms that only
     guard exotic `crypto` shapes; both failure and fallback paths are covered.
   - `packages/shared/src/lifecycle.ts` line 62: timer callback cannot observe
     `settled === true` before the first fire; late-settlement paths (`71`, `77`)
     and timeout are covered.
   - `packages/shared/src/ssrf.ts` line 160: `missing_host` cannot occur for a
     parsed `URL`; defensive only.
   - `packages/shared/src/audit-governance.ts` line 370 (`senderref` re-check) is
     dead after line 357; line 398 terminal `return false` is defensive.
   - `packages/shared/src/canonical.ts` line 112 `default` switch arm is
     unreachable through `typeof`.
   - `packages/platform/src/tool-invocation-boundary.ts` lines 122 and 184:
     >240-char handler error and key-total-chars overflow are shadowed by earlier
     defensive returns.
   - `packages/platform/src/plugin-gateway.ts` lines 768/775/781 are guarded by
     `normalizeRegisteredPlugin` manifest validation and cannot be reached
     through the public registry.
   - `apps/worker/src/controlled-worker.ts` lines 104–106: the dispatch default
     is unreachable through `processOutboxEvent`, which rejects unknown event
     types before invoking the effect.
   - `apps/worker/src/postgres-controlled.ts` line 160: defensive
     `versionId` re-check after all resolution branches assign it; line 188
     `onToolAudit` callback is never invoked by the deterministic preset.
   - `packages/platform/src/retention-ledger.ts` line 204 is a defensive guard
     for a sanitizer result that is always an object.
   - `packages/workflows` was already above both bars and was intentionally not
     modified; `persistent-journey-workflow.ts` line 82 remains the only
     uncovered statement.

3. **Mocked seam.** `secretary-preset-hardening.test.ts` uses `vi.mock` with
   `vi.hoisted` to make `runCriticalSafetyPreflight` report `passed: false`. The
   real preflight always passes for the compiled preset, so the fail-closed
   branch (`secretary-preset.ts:104`) is only deterministically reachable at the
   seam. The real preflight keeps its own focused test coverage.

4. **PostgreSQL.** Only the disposable fixture
   `postgres://ricardo@127.0.0.1:55432/cvg_aaa16_test` was used. Port 5432 was
   never contacted and `DATABASE_URL` was never set. The worker integration test
   remains conditionally skipped in `npm test` (57 skips, unchanged from
   baseline); it was executed separately with `TEST_DATABASE_URL` (2 passed,
   0 skipped). This does not prove production durability, fsync, RPO/RTO or RLS
   beyond the disposable cluster.

5. **Global gates are red outside this lane.** `npm run typecheck` reports 6
   errors and `npm run lint` reports 1 error, all in concurrent lanes' untracked
   files under `apps/api/src/__tests__/` and
   `packages/agent-runtime/src/__tests__/`; none of the 12 files added here is
   implicated (scoped `npx eslint` exit 0, and the errors disappear from the
   file list once those files are excluded). Per lane rules, other packages were
   not edited.

6. **No production bugs found.** No RED test required a product fix; no product
   file in the scoped packages was modified (`git status` shows only the 12 new
   untracked test files).

7. **Not performed here.** No commit, push, deploy, npm install, real data,
   external egress, provider/channel/RAG integration, coverage-threshold change,
   `vitest.config.mts`/`package.json` edit, or shared tracking (runtime state,
   execution log, backlog) edit.
