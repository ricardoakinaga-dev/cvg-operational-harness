# wave-review environment and command ledger

- Date: 2026-09-13 (America/Sao_Paulo)
- Repo: /home/ricardo/cvg-agent-secretary-v2, branch main, HEAD 512bc11
- Tree: dirty, preserved; critic wrote only under docs/04_audit/evidence/PROD-20260913/reaudit-round3/wave-review/ and /tmp/opencode
- Node: v22.23.2 (/home/ricardo/.nvm/versions/node/v22.23.2/bin), npm 10.9.8
- PostgreSQL: 16.15 at 127.0.0.1:55481 user cvg_prod (trust); critic DBs:
  critic_wave3, critic_wave3_copy; port 5432 never touched
- Round-2 byte reference still on disk: /tmp/cvg-m1-round2-ixwtdmce/candidate
  (hashes match reaudit-round2/manifest.json for the lane baselines)
- Fingerprint set: 544 product/config/test files; before == after
  aggregate sha256 a5480a6c9cad5061467553ac3497b529b1696084ffae4c8a6a89451b85e9f8e3

## Commands and exits

| Command                                                                                                                          | Exit | Result                                    |
| -------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------- |
| `npm run typecheck`                                                                                                              | 0    | no errors                                 |
| `npx eslint <11 changed source/test files>`                                                                                      | 0    | clean                                     |
| `npx prettier --check <11 changed files>`                                                                                        | 0    | all formatted                             |
| focused vitest with TEST_DATABASE_URL (3 worker lane + 4 identity + journeys-api-postgres + readiness + postgres-role-preflight) | 0    | 10 files / 93 tests, 0 failed, 0 skipped  |
| `TEST_DATABASE_URL=... npm run test:postgres`                                                                                    | 0    | 19 files / 163 tests, 0 failed, 0 skipped |
| `npm run test:worker:startup`                                                                                                    | 0    | smoke 1 + controlled smoke 1              |
| `npx vitest run apps/worker` (extra, full worker suite)                                                                          | 0    | 15 files / 91 tests, 0 skipped            |

## Adversarial probes (all under /tmp/opencode/critic-wave3)

| Probe                    | Result                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| probe-identity.ts        | spoofed Admin / cross-tenant 403; headers alone 401; expired/wrong-aud/forged/replay 401; double-resolve admin route 500 vs simulation control 400 |
| probe-factory-double.ts  | env-keyring factory resolver + trusted mode -> admin route 500                                                                                     |
| probe-startup.sh         | production entrypoint exits 1 for no keyring / explicit simulation / invalid keyring; valid keyring passes resolver gate and fails later on DB     |
| probe-rotation.ts        | previous-in-window accepted; after-window, revoked previous/current, unknown/missing kid rejected; valid kid accepted                              |
| probe-regression.ts      | PROD-06 spoofed body ignored; AAA-22 /ready 503, /live 200, sanitized, pool balanced 5/5/5                                                         |
| repo-copy neutralization | preflight removed -> entrypoint test fails (exit 1, "did not exit within the timeout"); restored byte-identical, test green again                  |
