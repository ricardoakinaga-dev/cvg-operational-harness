# P2-B Rebind — F01–F05/F15/T-19 re-run on the successor tree

- Program: `AAA-20260912`. Reviewer: independent reviewer, fresh context (same reviewer as `P1-independent-review-round2`). No builder rationale inherited.
- Condition under test: **P2 entry condition P2-B** (round-3 adjudication) — re-run the F01–F05/F15/T-19 probe set on the successor bytes after tracking publication, focused on `packages/agent-runtime/src`, `packages/approval-engine/src`, `packages/channel-gateway/src`, `packages/policy-engine/src`.
- Frozen reference: candidate `328d6a384658e75dc241db08d59072cbc4c8c4c430bc7d48063653443f092f67` (856 files, round-5 rehearsal `rehearsal-20260913T062303Z`, snapshot `/tmp/opencode/aaa13-rehearsal-20260913T062303Z/repo`).
- Write scope honored: only `/tmp/opencode/p2b-rebind-20260913T071238Z/` and `docs/04_audit/evidence/AAA/P1-independent-review-round2/rebind/`. No product edits; no commit/push/deploy. Parent `manifest.sha256` intentionally not regenerated (outside this rebind write scope); `rebind/manifest.sha256` covers this package.
- Environment: HEAD `512bc11e80fbf7c7b8baf6263aacc811ff829309`, branch `main`, Node `v24.20.0` (target Node 22 — declared limitation), npm `11.19.0`, PostgreSQL disposable `127.0.0.1:55432/cvg_aaa16_test`.

## 1. Product-source delta vs candidate `328d6a38…`

**Focused packages: EQUAL (no delta).** The four P2-B packages are byte-identical to the frozen candidate at every capture point of this rebind.

| Package (src) | Files | candidate manifest sha256 | current manifest sha256 | Delta |
| ------------- | ----- | ------------------------- | ----------------------- | ----- |
| `packages/agent-runtime/src` | 17 | `6d1f68b16bf5c073c758c9fc55a8e91c96a955c42297f04bf57c8a85dc45c978` | same | **EQUAL** |
| `packages/approval-engine/src` | 12 | `27fa0ff9e8e9eddfaf2e16bc1364305ff9f9763209680e5cc020acd79d8d639f` | same | **EQUAL** |
| `packages/channel-gateway/src` | 22 | `6ede1f9dd7df8019bd5e43a03defe876c31107a1d9b3901abc0b244c0d4e0b9d` | same | **EQUAL** |
| `packages/policy-engine/src` | 10 | `4beab82afeafec9e5cd3218b349a23d173c1b7f76ffe1ccf3651eecf47bfa114` | same | **EQUAL** |

Per-file maps: `commands/drift/packages_*.candidate.sha256` vs `.current.sha256`; consolidated equality: `commands/focused-package-equality.txt`.

**However, the premise "the only deltas vs `328d6a38` are tracking/docs (no product source delta)" is NOT satisfied at the tree level.** The working tree is a successor with concurrent product changes and was actively moving during the rebind:

| Capture | Time (UTC) | candidateId | files | product sources |
| ------- | ---------- | ----------- | ----- | --------------- |
| first recompute | 07:12:5x | `363de074c49b912ee13758966c2f89664beb66e3ac8c951af1f16b046e3886be` | 857 | 488 (2 changed + 1 added) |
| window start | 07:19:31 | `fe271f7ee74ba14a81996403e2dbb764ec99ecf0669ab6ff7f970b65af8dacc8` | 858 | 488 |
| window end | 07:26:15 | `c8e9f3555892ae8b15c14c8f2ef5ce7fc1e27c3d8afcbec1b1cc5cafba1aecde` | 864 | 494 |

Product deltas observed vs `328d6a38` (all outside the four focused packages):

- CHANGED `apps/api/src/server.ts` `3695e121…` -> `b0805443…`; CHANGED `apps/api/src/__tests__/journey-routes-coverage.test.ts` `4011da3e…` -> `78487f59…`; ADDED `apps/api/src/__tests__/journeys-api-postgres.test.ts` `1625c74f…`.
- ADDED/CHANGED `apps/worker/src/**` while the worker lane was mid-flight (`continuous-worker.ts`, `postgres-controlled.ts`, `main.ts`, `sweeps.ts`, `controlled-worker.ts`, `jobs/process-outbox-event.ts`, `worker.ts`, plus new `__tests__` files) — final observed `workerdelta` diff in `commands/product-sources-delta.txt` is only a partial snapshot because the lane kept writing after it.
- Non-product changes: `docs/03_build/tracking/aaa_execution_ledger.json`, `aaa_program_backlog.json`, `docs/99_runtime_state.md` (tracking/docs).

Full detail: `commands/product-sources-delta.txt`, `commands/product-manifest-start.sha256` (488 entries at 07:19:31), `commands/product-manifest-end.sha256` (494 entries at 07:26:15; `PRODUCT_MANIFEST_MOVED`), `commands/candidate-recompute-{start,end}.log`, `commands/drift/differing.txt`.

**Result:** product-source delta **equal for the four focused P2-B packages (answer: YES)**; **not equal tree-wide (answer: NO, product deltas exist and the tree is not frozen)**. The tree kept moving after the window: the final check at `2026-09-13T07:27:00Z` read candidate `4e15bad42786d03feac08701d794882ab938985d9bde0db574aee08a16dee734` (864 files, 133 dirty entries), confirming the successor was not frozen during this rebind.

## 2. Probe matrix (F01–F05/F15/T-19) on the current sources

Probe bytes are identical to the round-2 reviewer artifacts (integrity: `commands/probe-source-integrity.txt`); run with `npx tsx` against the current workspace sources. All 7 exit 0 and report `falsified: false`. Raw logs in `raw/`.

| Probe | Claim | Raw result (current tree) | Falsified? |
| ----- | ----- | ------------------------- | ---------- |
| F01 `f01-payload-binding.ts` | tool receives only the approved payload; divergent caller payload denied | no-journal `denied/durability_required` tool 0; execution payload `{"text":"APPROVED_PAYLOAD"}` providerCalls 1; caller B `denied/payload_mismatch` tool 0 | **No** |
| F02 `f02-preeffect-failure.ts` | no false EXECUTED; honest state on pre-effect failure; model failure zero approvals | `denied/adapter_precheck_failed`, approval `APPROVED`, journal `EFFECT_FAILED`, outbox 0; retry `executed`/`CONFIRMED`; model failure `denied/provider_unavailable`, 0 approvals, tool 0 | **No** |
| F03 `f03-durable-replay.ts` | at-most-one effect under crash/concurrency | turn 1 `executed/outbox_pending` tool 1; replay `idempotent_replay` tool 1; concurrent reserve `[in_progress,reserved]`; reuse `idempotency_key_reuse` | **No** |
| F04 `f04-channel-concurrency.ts` | channel single send + hash_version/actor | `providerSends 1`, fulfilled 2; replay `ext_1`; conflict `idempotency_key_reuse`; version `hash_algorithm_mismatch`; actor `reconciliation_required` | **No** |
| F05 `f05-limits.ts` | budget/deadline/cancel, zero pending spans | `steps_budget_exceeded` / `loop_deadline_exceeded` / `turn_cancelled`; tool 0, outbox 0, **pendingSpans 0** each | **No** |
| F15 `aaa08-policy-matrix.ts` (runtime block) | F15 runtime deny, tool 0 | `f15Runtime: denied/policy_denied`, tool 0; draft x real matrix holds | **No** |
| T-19 `t19-real-effect.ts` | `real_effect_not_authorized`, zero calls | three unauthorized cases `denied/real_effect_not_authorized` tool 0; authorized -> `approval_required` | **No** |

Probe exit codes: `raw/probe-exits.txt` (all `exit=0`). This confirms the P2-B focused behaviors on the successor bytes for the four packages (which are unchanged from `328d6a38…`).

## 3. Gate results

| # | Command | Exit | Counts / result | Log |
| - | ------- | ---- | --------------- | --- |
| 1 | `npm test` (window run, 07:19:35–07:23:06) | **0** | Test Files **231 passed \| 5 skipped (236)**; Tests **1588 passed \| 65 skipped (1653)** | `commands/npm-test-final.log` |
| 2 | `npm run typecheck` (07:25:52 retry) | **0** | clean — first run at 07:21 exited **2** while the `apps/worker` lane was mid-edit (`TS2724`, `TS2339`, `TS2552`, …); the lane fixed types and the retry passed | `commands/typecheck-retry.log` / `commands/typecheck-final.log` |
| 3 | `npm run lint` (07:25:5x, last check) | **1** | `apps/worker/src/continuous-worker.ts:174 'timer' is never reassigned. Use 'const' instead` (1 error; in-flight worker lane, outside the four focused packages) | `commands/lint-retry.log` |
| 4 | `TEST_DATABASE_URL=postgres://ricardo@127.0.0.1:55432/cvg_aaa16_test npm run test:postgres` (07:23:25) | **0** | Test Files **14 passed (14)**; Tests **123 passed (123)**; **0 skipped** | `commands/test-postgres-final.log` |
| 5 | `npx vitest run apps/api/src/__tests__/journeys-api-postgres.test.ts` with DB (context) | **0** | 1 file / **8 passed (8)** | `commands/new-journeys-api-test.log` |

Notes: without `TEST_DATABASE_URL`, `npm test` skips 5 files / 65 tests (the 5th skipped file is the new `journeys-api-postgres.test.ts`; it passes 8/8 with the DB). The added `apps/api` and `apps/worker` files are concurrent-lane work and are not part of the four focused P2-B packages. Because the tree changed after each run (`c8e9f355…` at 07:26 > the bytes at run time), these gate results bind to the bytes present when each command executed; they are **not** a green certification of the latest tree.

## 4. New findings

### P2-B-1 — successor is not a tracking/docs-only tree; repo-wide gate set is red at capture time (P2, process/binding)

- The premise "only tracking/docs deltas" is refuted: product sources under `apps/api/**` and `apps/worker/**` differ from `328d6a38…` and were actively changing during the rebind (candidate timeline `363de074` -> `fe271f7e` -> `c8e9f355`, 857 -> 864 files).
- `npm run lint` exits **1** on the latest observed tree (`apps/worker/src/continuous-worker.ts:174`), so the successor is not gate-green; `typecheck` was transiently red and is green again. This is concurrent-lane work outside the four focused packages.
- Disposition: the **P2-B focused condition holds** (four packages byte-identical to `328d6a38…`; F01–F05/F15/T-19 all pass on the current sources). A repo-wide P2 entry/qualification on the successor requires the `apps/worker`/`apps/api` lanes to stop writing, a frozen successor id, and a full green gate re-run. Do not treat the interim `npm test`/`typecheck` results above as tree-wide qualification.

### P2-B-2 — new PostgreSQL journeys API test is not in the `test:postgres` gate list (P3, observation)

`apps/api/src/__tests__/journeys-api-postgres.test.ts` (concurrent lane) skips its 8 tests under plain `npm test` and is not part of `package.json` `test:postgres`; invoked explicitly with `TEST_DATABASE_URL` it passes 8/8. If it is intended as part of the PostgreSQL gate, add it to the script; otherwise the skip is environmental and disclosed.

No new finding exists inside `packages/agent-runtime/src`, `packages/approval-engine/src`, `packages/channel-gateway/src` or `packages/policy-engine/src`.

## 5. Binding statement

This rebind is bound to the following hashes and to no others:

1. **Focused package manifests** (candidate == current), sha256 of the sorted `sha256  path` lists: `packages/agent-runtime/src` `6d1f68b1…`, `packages/approval-engine/src` `27fa0ff9…`, `packages/channel-gateway/src` `6ede1f9d…`, `packages/policy-engine/src` `4beab82a…` (= the `328d6a38…` bytes; full per-file maps in `commands/drift/`).
2. **Probe sources**: `commands/probe-source-hashes.sha256` (harness-budget probes copied byte-identical from `P1-independent-review-round2/probes/round1-style/`; raw outputs `raw/*.log`, exits `raw/probe-exits.txt`).
3. **Tree snapshots (observational, not frozen)**:
   - window start `2026-09-13T07:19:31Z`, candidate `fe271f7e…`, product manifest `commands/product-manifest-start.sha256` (488 entries);
   - window end `2026-09-13T07:26:15Z`, candidate `c8e9f355…`, product manifest `commands/product-manifest-end.sha256` (494 entries; moved during the window).
4. **Gates** bind to the bytes present at each command's execution timestamp (see §3 logs); they are not a frozen-tree certification.

No product/contract/tracking file was edited by this rebind; no commit/push/deploy. No G_QUALITY, Gate, production, State of Art or Triplo AAA status is granted.
