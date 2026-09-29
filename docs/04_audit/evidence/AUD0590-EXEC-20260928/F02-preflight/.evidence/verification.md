# F02 / A59-02 — synthetic T3 local verification

- Base: `3aa5330b7e195524ea51da90f56ffe23bf1004a4`.
- SPEC 0158 SHA-256: `4d4ac269a0843a668e8db21d34f4d8dd7604a5d4d262dc222169756016650380`.
- Isolated branch/commit: `codex/aud0590-f02-20260928` / `239442f877ba415919b1a36c1cb09f3219ef9b9e`.
- Node 22.23.2; PostgreSQL 16.15 disposable container `cvg-aud0590-f02-pg` bound to 127.0.0.1:55592. Synthetic records only.
- Actual migrations run in disposable schemas. `catalog-baseline.json` records six column type OIDs/nullability/defaults, five constraints with exact PG16 deparsed definitions, and two indexes. The schema used for measurement was dropped.
- Focused final: 3 files / 98 tests PASS (`focused-final-r3.log`); includes the real PG catalog negative matrix, catalog unit matrix and public RLS boot rejection.
- Complete final `npm test` with `PHASE4A_DISPOSABLE_PG=1`: 327 files / 2,446 tests PASS, zero skips (`full-test-stable.log`).
- Official `npm run test:postgres`: 35 files / 258 tests PASS, zero skips (`postgres-gate.log`).
- `npm run typecheck`, `npm run lint`, Prettier check and staged diff check PASS. `typecheck-final-r3.log`, `lint-full-final-r3.log` and `format-final.log` retained.
- The prior full run `full-test-final.log` was executed while source changed and had one expected failure in the newly added unexpected-column unit test; `full-test-stable.log` is the authoritative clean run.
- Before container removal, PG inventory returned zero F02 schemas and zero active sessions. Own container removed and TCP 55592 unbound. The temporary `node_modules` symlink was removed.
- No root integration, independent fresh-context critique, E2E, certification, push, deploy or release claim. Root coordination/ledgers remain for the integration owner; production remains NO_GO.
