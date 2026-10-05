# OPS_RAW_RECEIPT_FRESH_REVIEW_R8 — ACCEPT

Acceptance is limited to synthetic operational product raw receipt proof, append/replay, flags, TTL/pruning, causal effect binding and official process restart under approved SPEC0179 and the short operations task. It grants no integrated, pilot or production release.

The first read contained only packet authority/freeze; the second read was the packet constitution. No root repository, skills, ledgers, prior critic conclusions, Builder reports or other caches were review inputs. Source remained read-only. All execution used physical output/runtime with distinct inodes and zero symlinks, output HOME/TMPDIR/cache, a clean explicit environment, and absolute Node22 at `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node`.

## Results

| Check                                                          | Result                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Original full product regressions, unchanged                   | 570/570 PASS                                                                 |
| Own exported compiled API proofs                               | 316/316 PASS (306 matrix + 10 TTL/pruning/binding/cap/decoder cases)         |
| Official compiled main-process checks                          | 14 PASS; one loopback simulator send; zero model/Whisper calls               |
| Public compilation without source aliases                      | PASS; 59 frozen source copies, 245 emitted files, 129 consumed bundle inputs |
| Product lint                                                   | PASS                                                                         |
| Original saturation tests, unchanged 15 s budget               | PASS in full suite and isolated passive byte capture                         |
| Complete source/dependency/dist/link/inode/directory integrity | PASS                                                                         |
| Resource cleanup                                               | PASS                                                                         |

The first full regression run was 559/570 because my runtime copy omitted package-lock.json: 11 packet-hash tests failed ENOENT. This was a review setup error. I physically copied the unchanged frozen lockfile and reran the complete unchanged suite: 570/570. Both initial and corrected JSON reports remain available. No candidate code, test assertion or timeout was changed.

## Findings and discriminating proofs

No scoped defect reproduced. Raw schema is strict and all six fields must independently equal the projection. Each field contradiction, malformed/noJSON input, primitives, array, null, missing simulation, unknown schema property, prototype property and invalid Unicode document was tested through direct commit and independent Journal append/replay. Modern eligibility, missing legacy eligibility, explicit null denial, and incoming commitVerified false/true/absent were covered. Exact invalid documents remained recorded, while commitVerified and outbox delivery stayed denied.

Completion is recorded once, including unverifiable documents, and cannot be replayed with a new transition. Historical raw verification and completion uniqueness survive pruning. The own proof covers delayed completion before/after pruning, the inclusive 24 h boundary (TTL−1/TTL/TTL+1), duplicate no-op, reopen without callback, and uncertain A refusing cross-binding to later B. Every matrix case checks prefix retention, exact stored raw, and zero byte delta on reopen and rejected duplicate completion. The cap proof admits 1000 unmatched receipts, allows the known match as item 1001, denies overflow without a sequence/byte change, retains matched receipts, and exposes three projected receipts after TTL while historical documents remain in the journal.

Direct compiled append/replay preserves valid formatted raw JSON. The official endpoint accepts formatted JSON but stores canonical(payload): persisted raw proves the simulator callback, rather than preserving the original HTTP whitespace. HTTP malformed/noJSON/invalid UTF-8, unknown/prototype properties, incoming commitVerified, each invalid contract field and bad authentication return 400/401 with zero journal delta. Restart retains the positive proof, duplicate is accepted=false with zero durable delta, and no second send occurs. A legacy contradictory raw with claimed commitVerified=true starts successfully but remains unverified and cannot deliver the outbox; its journal is unchanged.

Exact positive persisted raw:

```json
{
  "accountRef": "process-A",
  "deliveryStatus": "delivery_confirmed",
  "provider": "waha",
  "providerMessageId": "process-id-1",
  "recipient": "5511900000001",
  "simulation": true
}
```

SHA-256: `6ed2099c35dce7a61af76184d1e4e9d36a8cc97e681e76212bd18d223ae25cde`.

Exact contradictory legacy persisted raw (projected providerMessageId is process-id-1):

```json
{
  "accountRef": "process-A",
  "deliveryStatus": "delivery_confirmed",
  "provider": "waha",
  "providerMessageId": "contradiction",
  "recipient": "5511900000001",
  "simulation": true
}
```

SHA-256: `f779907a7d714fbabefff9167ff74165675a2dfc1f5961892c5497223d77a835`; deliveryCommitted=false, outbox delivery absent, callback 400, original journal SHA-256 `fbe221f081f12b521efc8595af66c89e5df240fd8e0a76ba162b814ce3f98895` unchanged. [Full process proof](ops-review-r8-accept-raw-evidence.tar.gz) (arquivo interno `process-results.json`) and [own matrix](ops-review-r8-accept-raw-evidence.tar.gz) (arquivo interno `own-results.json`) retain all exact cases. Each matrix journal directory has raw-proof.json with raw, UTF16 units, UTF8 base64, checksum, prefix/final sizes and hashes.

## Original saturated receipt evidence

No flaky saturation failure was observed. Full corrected suite durations: 3.688 s, 8.421 s. Isolated original durations with passive capture: 3.714 s, 8.480 s. The original 15000 ms test timeout and assertions stayed intact.

A separate passive observer held O_RDONLY|O_NOFOLLOW descriptors across original test cleanup and then copied exact final bytes to new output files. It checked that the first observed durable prefix remained intact. Original R6 bytes contain 1002 unique receipt receptions and 1002 unique completions after the fresh post-TTL receipt; R3 contains 1001/1001. All raw matches its projected six fields and checksum. Captures and initial prefixes are retained in [original-saturation](ops-review-r8-accept-raw-evidence.tar.gz) (arquivo interno `original-saturation/`) with sizes and hashes in [saturation-capture.json](ops-review-r8-accept-raw-evidence.tar.gz) (arquivo interno `saturation-capture.json`). There was no skipping, replacement, mocked fsync, test editing or budget widening.

## Integrity, provenance and execution

Authorized inventory: `e56b311cc7fdf5cb4feeae4f364b5635a2d4cd0fff4b8eed52fb67a2849f4da0`. Full before/after matches cover 19333 regular files, 48 symlinks and 1970 directories, including vendor dependencies and every frozen dist. Compared SHA-256, size, dev/ino, nlink, mode, mtimeNs, ctimeNs and link targets; directory metadata matches exactly. Read atime was intentionally excluded. [Integrity result](ops-review-r8-accept-raw-evidence.tar.gz) (arquivo interno `integrity-result.json`), [before](ops-review-r8-accept-raw-evidence.tar.gz) (arquivo interno `integrity-before.json`), [after](ops-review-r8-accept-raw-evidence.tar.gz) (arquivo interno `integrity-after.json`).

[Compile manifest](ops-review-r8-accept-raw-evidence.tar.gz) (arquivo interno `compile-manifest.json`) binds the actual consumed paths/import graph and bytes, own public source copies/emitted outputs, official bundle hash, all 101 frozen SDK dist entries and their physical materialized copies. Original regressions retain the original Vitest source aliases; compiled correctness is established separately through own direct modules and official bundled process. All 73 original test/fixture files match the frozen hashes. Runtime has 18893 physical files, no symlink, no source inode sharing and no hardlink.

Commands and exit results are enumerated in [report.json](ops-review-r8-accept-raw-evidence.tar.gz) (arquivo interno `report.json`). Each runtime command uses env -i, output HOME/TMPDIR/XDG_CACHE_HOME, and the absolute approved node binary. Principal commands, from output/runtime:

```text
node products/shift-assistant/scripts/build-vertical-public.mjs
node node_modules/vitest/vitest.mjs run products/shift-assistant/src/__tests__ --no-file-parallelism --maxWorkers=2 --reporter=json --outputFile=../regressions-final.json
timeout 180 node ../own-proof.mjs
timeout 60 node ../process-proof.mjs
node node_modules/eslint/bin/eslint.js products/shift-assistant/src
node ../saturation-capture.mjs
```

Owned official child processes exited 0; the loopback listener closed; passive capture descriptors closed; no matching review process survives. Output tmp/home/cache were emptied. Durable evidence, physical runtime, compile artifacts, scripts and logs are intentionally retained. [Cleanup details](ops-review-r8-accept-raw-evidence.tar.gz) (arquivo interno `cleanup.json`).

Broad FullMain, PG/Docker, security/CI/coverage, provider qualification, D2, production and release are outside this acceptance. No root commit, push, deploy, provider or ledger write was performed. Return this scoped packet to the coordinating owner for separate integrated gates.

Cópia de leitura: links internos apontam ao arquivo de evidências; originais byte a byte e hashes individuais estão no manifesto.
