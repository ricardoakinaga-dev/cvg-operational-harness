# REM21-015 — BUILD / AUDIT

Data: 2026-09-22  
Finding: `A21-F17`  
Runtime: Node `22.23.2` / npm `10.9.8`  
Scope: local, synthetic, disposable; production remains `NO_GO`.

## BUILD

The controlled BUILD implemented the four frozen seams from `SPEC.md`:

- `S15-API`: the trusted operator-session `onRequest` hook moved to
  `apps/api/src/operator-session-hook.ts`; `server.ts` remains the owner of
  identity resolver composition and request maps.
- `S15-PG`: migration lifecycle and legacy catalogs moved to
  `packages/persistence/src/postgres-migrations.ts`; `postgres.ts` preserves
  the existing public exports.
- `S15-HARNESS`: normalization, decision signatures and cycle detection moved
  to `packages/harness/src/loop-detection.ts`; runtime budgets, checkpoints and
  dispatch remain in `iterative-runtime.ts`.
- `S15-WEB`: the tenant-scoped Trace Viewer list moved to
  `apps/web/src/features/platform/TraceViewer.tsx`; the parent retains
  filtering, effects, mutations and selected state.

The pre-BUILD RED probe recorded exit `1` for each absent target module. No SQL,
route payload, migration checksum/order, loop rule, authority field or external
integration was changed. The direct web test covers the new empty state,
redacted `traceText` rendering and selection callback.

## AUDIT FRESCO

- run: `run-rem21-015-final-1`;
- candidate: `5fb42a3bbf5ab2be4ce51966773868a1c25c66eb6eef4e72fd7a6095d60f2da1`;
- candidate reconciliation: 1,376 recorded files, 1,376 current files, zero
  drift;
- ownership map: `ownership-map.json`, with 598 total hotspot lines removed;
- focused tests: API `13/13`, persistence `23 pass / 3 governed skip`, harness
  `47/47`, web `11/11`;
- full regression: 299 files passed, 20 governed skips; 2,101 tests passed,
  146 governed skips, zero failures;
- static gates: typecheck, lint, format, docs links and diff check all PASS;
- candidate-bound gate log hashes: `ci-bar-summary.json`;
- full verification record: `verification-summary.json`.

The candidate-bound selected gates used the same run and candidate. The full
CI-bar finalization was intentionally not claimed because this task authorizes
only the controlled local slice; the existing historical skips remain governed
and visible.

## DECISÃO

`REM21-015 = VERIFIED_LOCAL / FINAL_CERT_DEFERRED`.

The four ownership extractions meet the frozen metrics and preserve the tested
contracts in the local synthetic environment. This does not establish a
production release: G21-5/G21-6, external identity/providers/channels, durable
production validation, freeze, I1 and human signoff remain open. No real data,
clinical, financial, record, appointment or other sensitive action was
executed. The next singular task is Discovery → PRD → SPEC for `REM21-017`.
