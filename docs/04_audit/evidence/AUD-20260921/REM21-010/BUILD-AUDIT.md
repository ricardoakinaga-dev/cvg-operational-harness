# REM21-010 — BUILD/AUDIT

## Scope and decision

`REM21-010` (`A21-F07`) is `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`. The proof
ran only with Node `v22.23.2`, PostgreSQL `16-alpine`, two explicitly managed
containers and synthetic tenant-scoped fixtures. No production, provider,
channel, IdP, secret or real data was used; production remains `NO_GO`.

The previous in-memory load/restore scripts remain historical contract checks.
The new PostgreSQL proof is a separate blocking `postgres-proof` gate in
`rem21-010-v1`; it does not turn local timings into production RPO/RTO.

## BUILD

The runner starts a source and target PostgreSQL instance, applies migrations
`0000`–`0025`, executes a fixed API-repository → PostgreSQL → two controlled
worker workload, and populates the durable outbox, outbox attempt/effect
journals, runtime effect journal and channel effect journal. It captures a
custom `pg_dump` before `0026`, rolls the source forward, restores the post-
roll-forward dump into a new target, and reruns the migration checksum guard.

For rollback, the pre-`0026` dump is restored into a disposable rollback
database, `0026_rate_limit_key_hardening` is applied, the pre-migration dump is
restored again, and `0026` is reapplied. This is an explicit restore-based
rollback strategy; no generic down-migration is claimed.

## AUDIT result

Final run: `run-rem21-010-final-3`, candidate
`7e3a7feb86e8f2cd2f1f3a611e2d25b1a5211f98643d42bd6c4db62844f39edb`.

- 32 deterministic events were enqueued and processed by two workers with zero
  duplicates.
- 45 source/target tables matched by row count and normalized checksum.
- RLS/policies, synthetic roles/grants, outbox and all three journal surfaces
  matched.
- The application read the restored event for its tenant; the other tenant saw
  no row.
- Deliberately corrupting `outbox_events` changed the digest and was detected;
  a clean restore recovered the source state.
- Migration recovery verified `0025 → 0026`, restore to `0025`, and repeat
  roll-forward to `0026`.
- The same candidate/run executed the blocking gate twice; both reports were
  `PASS`.

Report hash (run 2):
`9cb7cc2c1cf278ed82641953500a9b9d91e33df7cb460ac0eb0f7f137131efd9`.
Gate log hash (run 2):
`6ef2af6bd14f8c038d18b05d63acfe0caf17bab2b6d00545d3db04b42e3de9b1`.
Negative binding/production-scope checks are in `negative-binding.json` and
all three cases were rejected.

## Regression commands

| Command | Result |
|---|---|
| `npm run test:postgres:proof` | PASS; 8-event standalone proof |
| `node scripts/ci-bar.mjs gate postgres-proof` | PASS twice on final run/candidate |
| focused REM21-010 + CI contract tests | 8 passed |
| `npm test` | 295 files passed, 20 skipped; 2,085 passed, 146 skipped |
| `npm run format:check` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run ci:bar:contract` | PASS |
| `git diff --check` | PASS |

## Limitations

RPO/RTO remains explicitly `RPO_RTO_NOT_MEASURED_IN_PRODUCTION`. The proof is
local evidence only; the full bar/freeze, SBOM/licensing, independent I1 and
human signoff remain outside this task. No production readiness or external
certification is inferred.
