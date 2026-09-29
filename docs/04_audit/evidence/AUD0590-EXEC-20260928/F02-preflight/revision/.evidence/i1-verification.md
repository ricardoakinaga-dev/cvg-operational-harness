# F02 Gauntlet I1 — isolated synthetic T3 correction

- Base commit: `239442f877ba415919b1a36c1cb09f3219ef9b9e`.
- New commit: `b73fc47cf520605fb4f800285872d007beee76cc` on `codex/aud0590-f02-20260928`.
- SPEC 0158 SHA-256: `4d4ac269a0843a668e8db21d34f4d8dd7604a5d4d262dc222169756016650380` (unchanged).
- `assertWebhookReplaySchema` now compares required PostgreSQL catalog booleans explicitly, so missing values fail closed. Unit cases delete each required boolean field and assert rejection.
- Real PG mutation matrix moved into `postgres-persistence-mode.test.ts`, which the unchanged `test:postgres` script selects. The separate PG file was deleted; each mutation has one matrix execution in the full suite.
- Every matrix case uses actual migrations in its own disposable schema and boots through `buildServerFromEnv` as a non-superuser serving role with `POSTGRES_RLS_ENFORCEMENT=true`. Trigger/rule/FK reservation negatives use a separate connection authenticated as that same runtime role. The fixture verifies `current_user` and `current_schema`, demonstrates baseline reserve+commit before those mutations, and observes trigger `reserve=false`, rewrite-rule `INSERT RETURNING` failure, and cross-schema FK failure during expired-row cleanup before asserting boot rejection.
- Focused serving-role matrix: 26/26 PASS; 45 unrelated tests filtered by `-t` (`i1-focused-runtime-role.log`). Catalog unit suite: 48/48 PASS (`i1-unit.log`).
- Official `npm run test:postgres`: 35 files / 284 tests PASS, zero skips (`i1-test-postgres.log`).
- Full `npm test` with PostgreSQL and Phase4A enabled: 326 files / 2,467 tests PASS, zero skips (`i1-full-test.log`). Node 22.23.2 and PostgreSQL 16.15.
- Typecheck, full lint, Prettier check, frozen-source hashes, and diff check PASS; logs and source hash snapshot retained here.
- Before teardown: zero `cvg_f02_%` schemas, zero `cvg_f02_%` roles, zero active test sessions. Own container `cvg-aud0590-f02-i1-pg` removed; TCP 55592 unbound. Temporary node_modules symlink removed.
- No root integration, independent I2 verdict, E2E, certification, push, deploy, real data or release authorization. Production remains NO_GO.
