**CI_FRESH_REVIEW_R5 — REJECT**

Valid independent scoped functional review. Frozen inventory SHA-256 matched `ccb17b4a4a5a7426f58bdd8a66c314a8ce5d0fe9b3387f67b7638130b60a8d85`. Findings below were reproduced using actual helper APIs and newly emitted local artifacts. Source remained unchanged.

**R5-F1 (P1) — runScope emits an inventory snapshot its verifier rejects**

Actual inventory-only retained-scope runner emitted runnerStatus=PASS, gateStatus=PASS and keys schemaVersion/kind/inventory/mapping/coveragePaths/transitionOnly. snapshotSchema rejects hiso:snapshot_types:inventory because declarations is required and absent. Runner explicitly skips validateReport for inventory.

A legitimate manifest from the runner cannot pass required snapshot verification for this gate.

Locations: `scripts/hiso-ci.mjs:345`, `scripts/hiso-snapshot-types.mjs:32`, `scripts/hiso-reports.mjs:45`. Evidence: [emitter-check.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `emitter-check.json`), [retained-inventory-run/artifacts/gate-outputs/inventory/inventory.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `retained-inventory-run/artifacts/gate-outputs/inventory/inventory.json`).

Scope: Synthetic driver restricts contract gate array in memory to inventory; discovery alone replays this review's fresh collection, no candidate helper/test bytes edited. Not a full scoped CI run.

**R5-F2 (P1) — Legacy importer retains native unit order while verifier requires canonical sorted order**

Static synthetic complete legacy seal namespace imported unit suites in z,a order. Import exits 0 with PASS; actual emitted unit snapshot checked by verifySnapshots throws hiso:unit_execution_inventory_snapshot. A native report has no requirement to arrive sorted by the verifier's JSON comparator.

Import can reject valid native report ordering downstream; identity-equivalent rows should be normalized consistently.

Locations: `scripts/hiso-import-legacy.mjs:145`, `scripts/hiso-reports.mjs:184`, `scripts/hiso-reports.mjs:253`. Evidence: [import-checks.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `import-checks.json`), [import-fixture/unsorted-native-unit/manifest.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `import-fixture/unsorted-native-unit/manifest.json`), [import-fixture/unsorted-native-unit/gate-outputs/unit/certification/unit-test-report.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `import-fixture/unsorted-native-unit/gate-outputs/unit/certification/unit-test-report.json`).

Scope: Other gate payloads are deliberately synthetic seal fixtures; no assertion that their full CI schema or trust passes.

**R5-F3 (P1) — Broad generated-tree exclusions hide effective executable inputs**

Benign static entry imports certification/helper.mjs and certification/logs/active/helper.mjs. Node22 prints 1, then 2 after only the exported constant changes; digest(sourceFiles) remains identical and module is absent from input inventory. Nested packages/synthetic/src/dist/helper.mjs and packages/synthetic/src/.gauntlet/dist/helper.mjs reproduce the same result. Root .gauntlet and its nested dist/node_modules are correctly tracked as positive controls.

Candidate/source-after identity does not seal all effective inputs; certification exclusion is a subtree policy rather than a finite list of generated outputs.

Locations: `scripts/hiso-contract.mjs:77`, `scripts/hiso-contract.mjs:92`. Evidence: [own-checks.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `own-checks.json`), [own-fixtures/hidden](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `own-fixtures/hidden`).

Scope: Pure constant-export modules; no evaluator, VM, worker fixture, provider or offensive payload. This proves input omission, not a real remote trust bypass.

**R5-F4 (P1) — Non-unit required snapshots do not enforce suite/case membership**

verifySnapshots for postgres and chaos accepts a passing one-suite/one-case report when manifest.testInventory names a and b files. Direct testReport also accepts missing known suites and duplicate file suites when counters are coherently adjusted. Only unit performs comparison to executedTestInventory/requiredTestIds.

A PASS status, zero skips and consistent counts cannot prove the required gate suite executed; derive and bind gate-specific case inventories.

Locations: `scripts/hiso-reports.mjs:85`, `scripts/hiso-reports.mjs:244`. Evidence: [own-checks.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `own-checks.json`), [own-fixtures/postgres/gate-outputs/postgres/report.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `own-fixtures/postgres/gate-outputs/postgres/report.json`), [own-fixtures/chaos/gate-outputs/chaos/report.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `own-fixtures/chaos/gate-outputs/chaos/report.json`).

Scope: No PostgreSQL, chaos infrastructure or services executed; these are the real snapshot-reader APIs over benign local JSON.

**R5-F5 (P1) — Snapshot schemas accept contradictory critical coverage and eval outcomes**

verifySnapshots accepts coverage-critical PASS with four total=covered=0,pct=100 metrics and groups:[{}]; also accepts total=10,covered=0,pct=100. The actual buildCoverageReport oracle returns FAIL for both corresponding summaries. Evals PASS with score below threshold and failures:[{reason:synthetic-failure}] is accepted.

Verifier trusts asserted verdict/pass/pct without reconstructing producer semantics and required group identities.

Locations: `scripts/hiso-snapshot-types.mjs:19`, `scripts/hiso-snapshot-types.mjs:37`, `scripts/hiso-snapshot-types.mjs:91`, `scripts/hiso-reports.mjs:284`. Evidence: [snapshot-followups.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `snapshot-followups.json`), [own-fixtures/accepted-critical-zero.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `own-fixtures/accepted-critical-zero.json`), [own-fixtures/accepted-critical-percent.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `own-fixtures/accepted-critical-percent.json`), [own-fixtures/accepted-evals.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `own-fixtures/accepted-evals.json`).

Scope: Main aggregateCoverage zero-denominator and weighted percentage controls do reject invalid denominators; defect is in these additional gate snapshots, not a claim that global coverage passed.

**R5-F6 (P2) — Importer uses shallow envelope/type checks that diverge from preflight schema**

Importer exits 0/PASS for incomplete expected shape rejected by expectedShape as hiso:type:expected:sha, and for synthetic postgres version string "160001". Explicit expected schemaVersion=999 fails, but failure catch still copies legacy inputs.

Importer can emit success artifacts that downstream preflight rejects; validate complete shapes and numeric types before normal import emission.

Locations: `scripts/hiso-import-legacy.mjs:25`, `scripts/hiso-import-legacy.mjs:228`, `scripts/hiso-validation.mjs:127`, `scripts/hiso-reports.mjs:301`. Evidence: [import-checks.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `import-checks.json`), [import-fixture/string-pg-version/manifest.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `import-fixture/string-pg-version/manifest.json`).

Scope: Downstream numeric check fails closed; this is emitter/validator inconsistency, not successful remote acceptance.

**Verification and limits**

The original focused regressions passed: 199 HISO CI tests, 12 variant tests, 3 security tests; 214/214 passed. Original baseline hashes (371 tests), 40 approved new test paths and 281 coverage source paths validated. The fresh collection produced 4,359 cases across 404 files, including 195 declared skips, and executed zero tests.

Own probes recorded 88 observations: 68 matched expectations and 20 did not. These are observations, not an all-green test claim. Separate follow-ups reproduced the actual emitter mismatch, four importer cases, nine before-effect rejections and three contradictory-snapshot cases. All 26 independent TypeScript syntax fixtures matched isolated emit, including global-script and ambiguous-syntax fallback. Same-size/same-mtime replacement with frozen inputs was re-read correctly.

The main weighted coverage validator rejected all global zero denominators, executable-file zero counts, fractional counts and total inconsistencies. Type-only/per-file legitimate zeros remained accepted. Malformed expected namespaces caused zero synthetic fetch calls; invalid snapshot types/versions/counters/contracts caused zero follow-up effects.

All seven exact authority-listed historical machine inputs were read; their hashes and parse metadata are in [historical-fixtures.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `historical-fixtures.json`). The historical JSON/XML/log E2E triple independently bound the same 12 cases/execution; malformed counter rejected. No historical narrative report or builder verdict was consumed.

Public TypeScript dependency closures built successfully in a physical copy with no `products` tree. Original loader/declarations/runtime smoke passed with `sourceFree=true`, `declarations=true`, `clinicalCalls=0`, `unknownCalls=0`, `normalizer=true`, `budgetDenied=true`, `remoteCiPass=false`. Inspect [public-smoke.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `public-smoke.json`), [public-closure/resolution.jsonl](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `public-closure/resolution.jsonl`), [typescript-emit-parity.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `typescript-emit-parity.json`), [neutral-artifacts.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `neutral-artifacts.json`).

- Frozen packet lacks docs/doc-link-policy.json, required by prepareVariant doc-policy projection. Both candidate neutral transforms and direct inventory-only consumer driver stop with ENOENT. This is a packet completeness limitation, not attributed to unseen Root. No substitute policy was fabricated.
- Product physical absence and exact lock projection were inspected in partially prepared candidate copies: no products directory/product lock entries, 354 retained third-party records identical. Public build/smoke in this physical copy passed, but neutral transform completion is not claimed.
- Strict probes observed unknown fields accepted (native test report and load), untyped inventory mapping/declaration records accepted, optional suite counters omitted, inflated additive suite counters accepted. Native flattened reports can omit describe topology; these observations are not independently promoted to suite-counter defects.
- The first own emitter probe ran before the fresh runner artifact existed and recorded ENOENT. It is superseded by emitter-check.json, which consumes the actual freshly emitted retained-scope artifact and reproduces the schema mismatch.
- No remote CI, PG, Docker, external provider/network, certify, broad execution gates/global coverage, deployment, push, descendants/subagents or production acceptance. Full collection reports zero tests executed.

**Protected integrity**

Full before/after comparison: **zero differences** across 21,349 Source entries: 19,331 regular files, 48 symlinks and 1,970 directories. Compared content/size/mode/device/inode/link count/symlink target and file/directory mtimes, including all vendor/node_modules and dist trees. Frozen inventory mismatch and extra-entry counts are zero. Read atimes are excluded. Output has zero shared Source inodes and zero escaping symlinks. All 414 test/spec files copied to runtime retain original bytes. Evidence: [integrity-before.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `integrity-before.json`), [integrity-after.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `integrity-after.json`), [integrity-result.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `integrity-result.json`), [protected-result.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `protected-result.json`).

**Exact execution commands and results**

Every Node command ran with an empty inherited environment plus the following private settings, never in Source:

```sh
env -i PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin HOME=/home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/home TMPDIR=/home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/tmp XDG_CACHE_HOME=/home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/cache npm_config_cache=/home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/cache <command>
```

- `authority-first-tool`: cwd `/home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5`; exit 0. Read only.

  ```sh
  cat /home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/authority.json /home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/freeze.json
  ```

- `constitution-second-tool`: cwd `/home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5`; exit 0. Read only.

  ```sh
  cat /home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/source/docs/07_agents/AGENTS.md
  ```

- `full-integrity-before`: cwd `/home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5`; exit 0. Read only.

  ```sh
  python3 /home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/integrity.py before
  ```

- `focused-vitest`: cwd `/home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/runtime`; exit 0. 214/214 passed; 3 files.

  ```sh
  env -i <private settings above> /home/ricardo/.nvm/versions/node/v22.23.2/bin/node node_modules/vitest/vitest.mjs run tests/hiso-ci-scopes.test.js tests/hiso-variant.test.js tests/hiso-security.test.js --no-file-parallelism --maxWorkers=2 --reporter=json --outputFile=/home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/focused-vitest.json
  ```

- `inventory-only`: cwd `/home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/runtime`; exit 1. Fresh real collection: 4359 cases, 404 files, 195 declared skips, 0 executed tests; neutral prepareVariant failed because packet lacks docs/doc-link-policy.json.

  ```sh
  env -i <private settings above> /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/inventory-only.mjs
  ```

- `own-checks`: cwd `/home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/runtime`; exit 0. 88 recorded probes; 68 expected outcomes and 20 unexpected outcomes. Includes packet limitations; process exit 0 is not an acceptance verdict.

  ```sh
  env -i <private settings above> /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/own-checks.mjs
  ```

- `import-checks`: cwd `/home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/runtime`; exit 0. Four synthetic importer checks; reproduced native inventory ordering mismatch, incomplete expected shape acceptance, string PG version acceptance; explicit schema 999 rejected.

  ```sh
  env -i <private settings above> /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/import-checks.mjs
  ```

- `emitter-check`: cwd `/home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/runtime`; exit 0. Actual runScope inventory-only retained driver emits PASS snapshot rejected by snapshotSchema. Replays freshly collected local inventory only.

  ```sh
  env -i <private settings above> /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/emitter-check.mjs
  ```

- `pre-effect-checks`: cwd `/home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/runtime`; exit 0. 9 malformed namespace/snapshot checks; zero fetch/follow-up effects.

  ```sh
  env -i <private settings above> /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/pre-effect-checks.mjs
  ```

- `snapshot-followups`: cwd `/home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/runtime`; exit 0. 3 malformed sealed-snapshot reader probes accepted; coverage producer independently returns FAIL.

  ```sh
  env -i <private settings above> /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/snapshot-followups.mjs
  ```

- `public-build-in-physical-product-free-copy`: cwd `/home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/harness-neutral`; exit 0. Built model-gateway and harness dependency closures with paths:{}.

  ```sh
  env -i <private settings above> /home/ricardo/.nvm/versions/node/v22.23.2/bin/node scripts/hiso-public-build.mjs
  ```

- `public-smoke-loader-and-declarations`: cwd `/home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/harness-neutral`; exit 0. PASS; sourceFree/declarations true; clinicalCalls=unknownCalls=0; remoteCiPass=false.

  ```sh
  env -i <private settings above> /home/ricardo/.nvm/versions/node/v22.23.2/bin/node scripts/hiso-public-smoke.mjs /home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/public-closure /home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/public-smoke.json
  ```

- `full-integrity-after`: cwd `/home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5`; exit 0. 0 differences, 0 frozen inventory mismatches, 0 extra non-directory entries.

  ```sh
  python3 /home/ricardo/.cache/cvg-harness-green-20261004/ci-review-r5/output/integrity.py after
  ```

Command arrays, exact private environment, logs, findings and adjudication are also in [commands.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `commands.json`) and [report.json](ci-review-r5-reject-raw-evidence.tar.gz) (arquivo interno `report.json`). State: `READY_FOR_NEXT_STEP`; last completed action: independent scoped review with preserved Source. Next action: owner remediation and a fresh isolated review after supplying the missing packet input.

Cópia de leitura: links internos apontam ao arquivo de evidências; originais byte a byte e hashes individuais estão no manifesto.
