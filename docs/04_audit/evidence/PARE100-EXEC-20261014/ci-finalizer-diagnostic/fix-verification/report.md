# Independent focused verification of finalizer buffer fix

Verdict: PASS for this bounded maxBuffer fix and five existing finalizer tests only.

Exact diff inspected against HEAD ca565391ac52033d6f59b06237a45beb986e1c12. Current scripts/ci-bar.mjs SHA-256: 891d617aba519512f1d53ae7ce2db3b5871ef974e73ef0a08865acdb8236d828. Reconstructed HEAD with exactly the two maxBuffer option additions equals the candidate byte for byte. No other edit in this file; Git arguments, filters, processing, hash logic, output and failure semantics are unchanged. Test remains identical to HEAD. Relevant source/test/contract/config hashes stayed stable during verification. Evidence: exact.diff, inspection.json, source-after.json.

## Existing focused tests

Node v22.23.2, no NODE_OPTIONS preload or mocks. Command from the worktree:

`PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH TMPDIR=/tmp/cvg-pare100-exec-20261014-6az3hlay/ci-finalizer-diagnostic/fix-verification/tmp npm test -- tests/ci-bar-e2e-finalizer.test.js --no-cache`

Exit 0, 1 test file passed, all 5 tests passed, stderr 0 bytes. This executes existing synthetic fixtures and their real finalizer child processes, including snapshot/hash tampering, execution-ID binding, scope and stale-gate rejection. Cache disabled to keep writes in the existing result directory. No test source changes. Exact argv/environment/time and raw stdout/stderr: test.json, test.stdout.log, test.stderr.log. One focused invocation, no retry needed.

## Inventory completeness and byte preservation

Command:

`/home/ricardo/.nvm/versions/node/v22.23.2/bin/node /tmp/cvg-pare100-exec-20261014-6az3hlay/ci-finalizer-diagnostic/fix-verification/inventory-probe.mjs`

Exit 0. For each exact production Git argv, the probe captures stdout with maxBuffer=16MiB and compares it directly with file-backed Git stdout captured immediately before and after. The reference uses a file descriptor rather than an in-memory pipe, avoiding the maxBuffer boundary. Both bracketing references are stable and byte-identical to the 16MiB capture, including trailing NUL.

- `git ls-files -z`: 868,676 bytes, 10,490 paths; SHA-256 f2ccc8c92b40c615e1ef759681b1059dcde875d4e8abc7dc67c945000788d569. Default capture also succeeds with the same hash.
- `git ls-files -co --exclude-standard -z`: 1,077,936 bytes, 12,617 paths; SHA-256 84629f0fddd4069f437ad763c005cd5d7c90985f0904fc3255837f3a7be7263c. Default capture still throws ENOBUFS, while 16MiB returns all bytes with no truncation.

Evidence: inventory-probe.json, inventory-probe.mjs, and six raw *.paths.z files. Current combined listing differs from the earlier diagnostic because the worktree gained files; equality is proven against current, stable, bracketing references, not incorrectly asserted against the old inventory. The tracked inventory still matches the prior diagnostic hash.

No source/ledger edits, DB/network/provider/install/lock/cert operations or descendants. Own temporary fixture directory cleaned; no fixture leaks before cleanup. This verdict grants no broader security, QA, release or full-parity acceptance. 16MiB remains a finite bound; this verification proves complete capture for the current inventory.
