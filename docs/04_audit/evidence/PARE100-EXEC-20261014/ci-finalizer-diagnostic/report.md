# CI finalizer diagnostic — PARE100-EXEC-20261014

Root cause confirmed: preexisting synchronous Git-output buffer limit, exposed by the worktree's growing untracked evidence inventory. Not an SDK runtime/source regression.

`tests/ci-bar-e2e-finalizer.test.js:83-93` spawns the finalizer and parses stdout after requiring status 1. All five first fixture calls receive status 1, zero stdout bytes and stderr `spawnSync git ENOBUFS` (see `child-*.json` and `child-*.stderr.log`). Status 1 here means an exception, whereas the fixture expects a serialized FAIL manifest.

`candidateFiles()` in `scripts/ci-bar.mjs:166-182` calls `execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root })`. It has no explicit maxBuffer. This second Git invocation throws ENOBUFS before `isExcluded()` filters audit evidence and before `runArtifacts()` writes JSON. The outer catch only writes the error message to stderr. The original test then throws Unexpected end of JSON input. The internal error captures identify this exact Git argv, not an E2E report parse or SDK failure.

Raw Git listing at the measurement checkpoint: 1,073,144 bytes / 12,561 paths, above the 1,048,576-byte Node default. Tracked/HEAD inventory: 868,676 bytes / 10,490 paths. Untracked inventory: 204,468 bytes / 2,071 paths; PARE100-EXEC evidence contributes 197,984 path bytes / 1,939 files. Thus the newly accumulated runtime inputs cross the old limit; the source/test fault is latent. Counts can grow while the Lead writes concurrently. Candidate exclusion happens after capture, so exclusion of evidence from candidate hashing cannot prevent this failure.

All eight baseline hashes are in source-baseline.json; source-after.json confirms their stability over this diagnostic. The finalizer/test/contract/provenance/report-binding modules match HEAD ca565391ac52033d6f59b06237a45beb986e1c12; additional-imports.json covers the other direct contract imports. package.json may have Lead changes, but was not changed by this sidecar. No historical clean-tree execution is claimed: evidence distinguishes source equality and measured input growth from a newly changed implementation.

Smallest legitimate fix proposal for the Lead: set an explicit adequately sized maxBuffer on both Git execFileSync calls in candidateFiles() (for example 16 * 1024 * 1024), preserving the exact args, path list, isExcluded() rules, bytes and candidate hash computation. Adding it only to the second call fixes this observed failure; setting it on both prevents the same issue as tracked paths grow. A streaming enumeration is more robust long term but larger in scope. Do not remove evidence, narrow the candidate inventory, alter policy, suppress ENOBUFS, or fabricate JSON. An optional test-harness improvement should surface stderr/error before parsing, but that alone does not fix enumeration.

The isolated Git probe proves the size-limited operation fails at the default and succeeds at 16 MiB with byte-identical output to a separately captured Git listing. This is a diagnostic proof of mechanism, not a green test result for an unimplemented finalizer patch. Lead must implement under its claim and rerun the five existing tests.

## Commands and exits

Working directory for both existing-test invocations:
`/tmp/cvg-pare100-exec-20261014-6az3hlay/worktree`

1. `PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH TMPDIR=/tmp/cvg-pare100-exec-20261014-6az3hlay/ci-finalizer-diagnostic/tmp npm test -- tests/ci-bar-e2e-finalizer.test.js` — exit 1, 5/5 failed; initial.json, initial.stdout.log, initial.stderr.log. Node 22.23.2, no inherited NODE_OPTIONS.
2. Same command with `NODE_OPTIONS=--require=/tmp/cvg-pare100-exec-20261014-6az3hlay/ci-finalizer-diagnostic/capture.cjs` — exit 1, 5/5 failed; retry1.json and logs. Executed by `python3 /tmp/cvg-pare100-exec-20261014-6az3hlay/ci-finalizer-diagnostic/retry1.py` (wrapper exit 0). The external observation-only preload returns the original results and rethrows errors unchanged; it writes child stderr/stdout and Git error metadata outside the repo. The five finalizer children each exit 1, stdout 0 bytes, stderr 23 bytes. No capacity failure.
3. `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node /tmp/cvg-pare100-exec-20261014-6az3hlay/ci-finalizer-diagnostic/git-buffer-probe.mjs` — exit 0 for the probe; default invocation throws ENOBUFS, explicit 16 MiB invocation succeeds, 1,073,144 bytes, SHA-256 fb2e649a861736368c632137347420b0761df077d664fb492fd30d1cde9c26e7. See git-buffer-probe.json.
4. `git ls-files -z`, `git ls-files -co --exclude-standard -z`, `git ls-files --others --exclude-standard -z`, `git ls-tree -r --name-only -z HEAD` — all exit 0 when captured without Node's synchronous buffer limit; exact argv, counts and SHA-256 in git-input-measurement.json, raw NUL-delimited inventories in *.paths.z.

Two existing-test runs total (initial + one retry); third allowed run unnecessary. No source, test, checker, policy, root, ledger or lock edit; no commit/push. Own scratch removed after both tests' finally cleanup. No DB/network/providers/install/cert or descendants. See claim.json and cleanup.json. Diagnostic outcome: ROOT_CAUSE_CONFIRMED; source fix NOT_APPLIED; post-fix test PASS NOT_CLAIMED.
