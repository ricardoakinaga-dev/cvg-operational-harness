# P1 Independent Review — AAA-07..AAA-17

- Program: `AAA-20260912`. Reviewer role: **independent reviewer, fresh context** (no participation in building these tasks).
- Independence level: **I1 — same model family, fresh context, no builder rationale inherited.** All claims were re-executed from the workspace sources; builder logs were treated as claims.
- Scope: controlled local scope, synthetic fixtures only; disposable PostgreSQL at `127.0.0.1:55432` (`cvg_aaa16_test`). Port `5432` was never touched. Docker daemon unavailable (declared environment limitation, not a product failure).
- Write scope honored: only `/tmp/opencode/p1-review-1789268901/` and `docs/04_audit/evidence/AAA/P1-independent-review/`. No commit, push or deploy. One incidental write outside the scope (`certification/license-report.json`, caused by the mutating `licenses:check` gate) was restored byte-for-byte to the builder-recorded hash; full disclosure in §5 (Reviewer write incident, finding P2-6).
- Reviewed contracts: `docs/02_spec/aaa_execution_contract.md` (sha256 `9df1a05f…`), `docs/02_spec/aaa_data_api_contract.md` (`cebeddab…`), `docs/02_spec/aaa_quality_contract.md` (`aec32401…`), and `docs/03_build/tracking/aaa_program_backlog.json` (`d27329d2…`) acceptance fields.

## 1. Tree binding and drift warning

| Field                      | Value                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| workspace                  | `/home/ricardo/cvg-agent-secretary-v2`                                                    |
| HEAD                       | `512bc11e80fbf7c7b8baf6263aacc811ff829309`                                                |
| dirty entries              | 86 (concurrent AAA lanes were active during the review)                                   |
| current `candidateId`      | `bb1fd6e8906b5a8b01dd6042f794a0d618ab07e3f3c7548d94256432e2287d50` (822 files)            |
| hash capture time          | `2026-09-13T03:24:07.232Z`                                                                |
| AAA-13 rehearsal candidate | `159dd98e9fe5acbd4cfa70879b5349c95b2c419f565eb183ffbd0e95c1dc1a34` (821 files, different) |

Every verdict below binds to the sha256 set in §7 (full machine-readable map in `review.json` and `commands/artifact-hashes.json`). **If any judged byte changes, these verdicts expire** (`CANDIDATE_DRIFT`, AAA-04 §4). The AAA-13 rehearsal qualifies only `159dd98e`; the current tree is already a different candidate (see P2-2).

## 2. Required executable checks

| #   | Command                                                                                            | Exit  | Observed result                                                                                                                             | Log                                            |
| --- | -------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | `npm test`                                                                                         | **0** | Test Files 196 passed \| 4 skipped (200); Tests 1154 passed \| 57 skipped (1211); 235.64s                                                   | `commands/npm-test.log`                        |
| 2   | `npm run typecheck`                                                                                | **0** | `tsc -p tsconfig.typecheck.json --noEmit` clean                                                                                             | `commands/typecheck.log`                       |
| 3   | `npm run lint`                                                                                     | **0** | `eslint .` clean                                                                                                                            | `commands/lint.log`                            |
| 4   | `TEST_DATABASE_URL=postgres://ricardo@127.0.0.1:55432/cvg_aaa16_test npm run test:postgres`        | **0** | Test Files 14 passed (14); Tests 123 passed (123); **0 skipped**                                                                            | `commands/test-postgres.log`                   |
| 5   | `npx prettier --check packages apps tests scripts docs/02_spec docs/03_build/tracking docs/01_prd` | **1** | FAIL: `docs/03_build/tracking/aaa_execution_ledger.json` and `docs/03_build/tracking/aaa_program_backlog.json`; all other scoped files pass | `commands/prettier.log`                        |
| 6   | `npm run format:check` (context)                                                                   | **1** | 42 files: 40 under `docs/04_audit/evidence/` (excluded by AAA-04 §4) + the 2 tracking JSONs above                                           | `commands/format-check-full.log`               |
| 7   | `npm run licenses:check`                                                                           | **0** | `{"total":372,"internal":21,"denied":0,"unclassified":0,"invalidExceptions":0}`                                                             | `commands/licenses-check.log`                  |
| 8   | `npm run audit:security`                                                                           | **0** | `found 0 vulnerabilities`                                                                                                                   | `commands/audit-security.log`                  |
| 9   | Node 22.23.2 `tsc -p tsconfig.typecheck.json --noEmit`                                             | **0** | target-Node typecheck clean on current tree                                                                                                 | `commands/typecheck-node22.log`                |
| 10  | `npx vitest run apps/api --no-file-parallelism --maxWorkers=2`                                     | **0** | 45 files passed; 207 passed \| 8 skipped (215)                                                                                              | `commands/focused-api-tests.log`               |
| 11  | PostgreSQL verbose: effect-journal + channel-effect-journal + journeys                             | **0** | 3 files / **39 passed (39), zero skipped**                                                                                                  | `commands/test-postgres-journal-verbose.log`   |
| 12  | PostgreSQL verbose: tenant-isolation + migration-smoke + outbox-durability                         | **0** | 3 files / **28 passed (28), zero skipped**; non-BYPASSRLS isolation, checksum-drift fail-closed, connection reset                           | `commands/test-postgres-isolation-verbose.log` |
| 13  | `git diff --check`                                                                                 | **0** | no whitespace errors                                                                                                                        | `commands/git-diff-check.log`                  |
| 14  | focused coverage `approval-engine` (reports to /tmp)                                               | **0** | statements 100% (351/351), branches **99.7%**, functions 100%, lines 100%; 98 tests                                                         | `commands/coverage-approval-engine.log`        |
| 15  | focused coverage `channel-gateway` (reports to /tmp)                                               | **0** | statements 98.41%, branches **96.23%**, functions 96.15%, lines 99.61%; 112 tests                                                           | `commands/coverage-channel-gateway.log`        |
| 16  | focused coverage `agent-runtime` (reports to /tmp)                                                 | **0** | statements 77.24%, branches **71.45%**, functions 93.26%, lines 78.24%; 98 tests                                                            | `commands/coverage-agent-runtime.log`          |

Migrations 0012/0013/0014 inspection: all additive (`CREATE TABLE IF NOT EXISTS`, `NOT VALID` constraints), `ENABLE/FORCE ROW LEVEL SECURITY` with tenant policies, `REVOKE ALL … FROM PUBLIC`, no `DROP TABLE/COLUMN`, `TRUNCATE`, `DELETE` or column-type rewrites. Checksums are computed and enforced by `packages/persistence/src/postgres.ts:536-595` (missing/mismatched checksum throws; drift test passes in `commands/test-postgres-isolation-verbose.log`). `defaultPostgresMigrations` includes 0012/0013/0014 (`postgres.ts:104-120`).

## 3. Falsification probes (all executed by the reviewer)

All sources are in `probes/` (run with `npx tsx` against workspace sources); exit codes in `probes/final-exitcodes.txt`; **all 10 probes exit 0 and no claim was falsified.**

| Probe       | Code path                            | Claim under test                                                                         | Raw result                                                                                                                                                                                                                                                        | Falsified? |
| ----------- | ------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| F01         | `probes/f01-payload-binding.ts`      | Approval payload A vs caller/model B (T-01/T-02)                                         | no-journal: `durability_required`, tool 0; with journal: tool payload `{"text":"APPROVED_PAYLOAD"}`, model not re-called (providerCalls 1); caller B → `payload_mismatch`, tool 0                                                                                 | **No**     |
| F02         | `probes/f02-preeffect-failure.ts`    | Pre-effect tool failure (T-04), retry E-1, model failure T-03                            | 1st: `denied/adapter_precheck_failed`, approval `APPROVED`, journal `EFFECT_FAILED`, outbox 0; retry: `executed`, journal `CONFIRMED`, tool 2× total; model failure: `denied/provider_unavailable`, 0 approvals, 0 tools                                          | **No**     |
| F03         | `probes/f03-durable-replay.ts`       | Same operationKey, crash + replay (T-06/T-07/T-08/T-15)                                  | turn 1 `executed/outbox_pending`, tool 1; new runtime+`FileEffectJournal` over same path: `executed/idempotent_replay`, tool still 1; concurrent reserve `[in_progress,reserved]`; reuse with different proposal `idempotency_key_reuse`                          | **No**     |
| F04         | `probes/f04-channel-concurrency.ts`  | Two concurrent channel sends, restart replay, conflict, hash_version, actor (F04/AAA-12) | providerSends **1**, fulfilled 2; replay `ext_1`; conflict `idempotency_key_reuse`; legacy version `hash_algorithm_mismatch`; actorless/terminal reconciliation `reconciliation_required`                                                                         | **No**     |
| F05         | `probes/f05-limits.ts`               | maxSteps=1, deadline, cancel (T-09/T-10/T-11)                                            | `steps_budget_exceeded`, `loop_deadline_exceeded`, `turn_cancelled`; every case: tool 0, outbox 0, **pendingSpans 0**                                                                                                                                             | **No**     |
| T-19        | `probes/t19-real-effect.ts`          | Declared/undeclared real effect fail-closed                                              | declared-unauthorized, undeclared high-risk and medium declared-unauthorized all `real_effect_not_authorized`, tool 0; declared+authorized reaches `approval_required`                                                                                            | **No**     |
| AAA-07      | `probes/aaa07-approval-lifecycle.ts` | reserve/CAS/TTL sweep/fencing/terminal immutability                                      | wrong token `reservation_mismatch`; stale token in new generation `reservation_mismatch`; token reuse `reservation_reused`; terminal `invalid_state`/`already_executed`; sweep `{released:1}` / `{uncertain:1}`; cross-tenant `not_found`; `self_approval_denied` | **No**     |
| AAA-08      | `probes/aaa08-policy-matrix.ts`      | Draft × real matrix, F15, T-12/T-13                                                      | real modify `resource_type_not_allowed`; draft modify ALLOW; confirm/reschedule `capability_not_granted`; missing context `insufficient_context`; smuggling `action_capability_mismatch`; runtime F15 `policy_denied`, tool 0                                     | **No**     |
| AAA-12-hash | `probes/aaa12-hash-binding.ts`       | C2-F01 canonicalization                                                                  | permutation-invariant `bc03314f…` == `sha256(canonicalizeJson(...))`; changed projection `82041d4b…`                                                                                                                                                              | **No**     |
| AAA-13      | `probes/aaa13-consistency.ts`        | Rehearsal consistency                                                                    | certify.exit 0, verify.exit 0, 16/16 PASS, 16/16 headers bound, 64/64 SHA256SUMS, **recomputed candidateId == 159dd98e** over 821 files                                                                                                                           | **No**     |

Probe revision history (transparency): initial probe runs exposed harness defects, not product defects — F01/F03 lacked the mandatory effect journal / failing outbox configuration, F04's `outbound()` helper ignored overrides, and the AAA-07 probe expected `reservation_mismatch` where `invalid_state` is the correct fail-closed answer after a release. After fixing the probes, all claims held; the fail-closed `durability_required` behavior observed in the first F01 run was then kept as F01 scenario 0. Raw first-run logs remain in `/tmp/opencode/p1-review-1789268901/probes/`.

## 4. Per-task verdicts

Legend: **VERIFIED** = acceptance criteria executed and passed by the reviewer; **APPROVE_WITH_CONDITIONS** = task deliverable verified but a condition must be closed before candidate qualification; **REWORK**/**BLOCKED** = not used.

### AAA-07 — Approval lifecycle + critical coverage — **APPROVE_WITH_CONDITIONS**

- Acceptance: "Falha de modelo/tool/outbox não produz sucesso fictício; replay não duplica consumo; expiração e troca de tenant rejeitadas" → **PASS** (`probes/f02`, `probes/f03`, `probes/aaa07`).
- Reserve/CAS/TTL sweep/fencing/terminal immutability all hold; sweep never produces effect (engine-level).
- Critical coverage context (independent): approval-engine statements/lines/functions 100%, branches 99.7% (`commands/coverage-approval-engine.log`). AAA-04 v2 §9.1 is a P4/AAA-34 qualification item, not a P1 gate.
- Condition C-1 (P2-1): `ApprovalEngine.releaseExpired` has no production call site and there is no periodic worker sweep, although `aaa_execution_contract.md:119` requires it.

### AAA-08 — Policy draft × real denial — **VERIFIED**

- Acceptance: all profile/role/sensitive-action combinations have explicit decisions; missing context denies; real `appointment.modify` never obtains silent ALLOW → **PASS** (10/10 matrix cases + runtime F15, tool 0).
- `appointment.confirm`/`appointment.reschedule` denied by absence of grant (`packages/policy-engine/src/grants.ts:57-100`).

### AAA-09 — Payload binding (F01/F02, T-01/T-02/T-16/T-19) — **VERIFIED**

- Acceptance: F01 rejects a different payload before the tool; F02 keeps honest state; version/policy change invalidates old authorization; undeclared/unauthorized real effectScope fails closed → **PASS**.
- T-16 static check: `runtime.ts` contains no `verifyAndConsume` (grep) and probes execute the reserve/confirm path.
- The execution turn uses `record.proposalPayload` exclusively (`packages/agent-runtime/src/runtime.ts:1198`) and denies caller divergence at `runtime.ts:939-945`.

### AAA-10 — Durable effect journal + SQL adapters/migrations 0012/0013 — **VERIFIED**

- Acceptance: same key in retry/concurrency yields at most one confirmed effect; crash after effect before ack recoverable without invented success → **PASS** (`probes/f03`).
- PostgreSQL journal cases (runtime + channel) run without skips: 39/39 (`commands/test-postgres-journal-verbose.log`); migrations additive/checksummed/RLS.
- `idempotency_key_reuse`, `operation_in_progress`, `operation_uncertain`, replay are all exercised.

### AAA-11 — Budgets/deadline/cancel (F05) — **VERIFIED**

- Acceptance: `maxSteps=1` blocks extra stages; deadline ends the turn honestly; no tool after budget; spans closed → **PASS** (`probes/f05`, 3 scenarios, pendingSpans 0).

### AAA-12 — Channel concurrency + hash_version + actor alignment + SQL adapter — **VERIFIED**

- Acceptance: `Promise.all` reproduction produces one send; two instances/restart preserve the result; key reuse with different payload is rejected → **PASS** (`probes/f04`, provider sends ≤1).
- hash_version fail-closed and actor alignment verified independently; shared canonicalization now delegates to `@cvg/shared` (`packages/channel-gateway/src/effect-journal.ts:291-293`, `310-320`), fixing C2-F01 (`probes/aaa12-hash-binding`).
- SQL adapter + 0012 exercised in PostgreSQL without skips; focused channel coverage 98.41/96.23/96.15/99.61 (context).

### AAA-13 — Certification producer→verifier binding — **APPROVE_WITH_CONDITIONS**

- Acceptance: source/lockfile change invalidates the certificate; adulterated logs and mandatory skips are rejected; clean and dirty candidates are identified → **PARTIAL**.
- Independently verified for the recorded round: producer exit 0, verifier exit 0, 16/16 gates PASS, all gate-log headers bound to `runId`/`candidateId`/`exitCode=0`, 64/64 SHA256SUMS, and the candidate digest **recomputed byte-for-byte to `159dd98e`** on the preserved 821-file snapshot.
- Condition C-2 (P2-2): the current tree is candidate `bb1fd6e8` (822 files); the rehearsal does not qualify it — a new rehearsal is required (AAA-04 §4).
- Condition C-3: N1–N9 self-test was not re-executed because it writes `certification/negative-validation.json` (`scripts/phase10-verify.mjs:1207`; `package.json:36`), outside the reviewer write scope.

### AAA-14 — Supply chain (image blocked declared) — **APPROVE_WITH_CONDITIONS**

- Acceptance audit/licenses → **PASS**: `npm audit --audit-level=high` 0 vulnerabilities; licenses 372 total / 21 internal / 0 denied / 0 unclassified.
- Target Node: Node 22.23.2 typecheck on the current tree **PASS** (independent).
- Condition C-4: Docker image build/smoke `NOT_RUN` (daemon unavailable, declared); isolated `npm ci --ignore-scripts` and full target-Node suite were not re-executed by this review. `Dockerfile` is statically sound (multi-stage `node:22-bookworm-slim`, `USER cvg`, `HEALTHCHECK`, unprivileged web stage).
- See P2-6: the license gate mutates `certification/license-report.json`; the reviewer's accidental write was restored byte-for-byte (disclosure in §5).

### AAA-15 — Format gate (candidate scope) — **APPROVE_WITH_CONDITIONS**

- `apps/api/src/server.ts` is prettier-clean; focused API tests pass (207 passed | 8 skipped); `git diff --check` clean; typecheck/lint green.
- Condition C-5 (P2-3): the required candidate-scope prettier command **fails** on two coordinator-owned files (`docs/03_build/tracking/aaa_program_backlog.json`, `aaa_execution_ledger.json`). The 40 additional full-tree failures are under `docs/04_audit/evidence/` and are excluded by AAA-04 §4.

### AAA-16 — PostgreSQL gate (0 skips with fixture) — **VERIFIED**

- Acceptance: `npm run test:postgres` runs all required cases without skip; context loss and role bypass fail closed; two-connection and rollback evidence → **PASS**.
- 14 files / 123 tests, 0 skipped; verbose tenant-isolation shows non-BYPASSRLS isolation, pool context reset, checksum-drift fail-closed, migration baseline guards.

### AAA-17 — Journeys PostgreSQL (supporting context; formal review may be P2) — **VERIFIED**

- Acceptance: parity with memory, restart, expiration, cross-tenant, idempotency; no real confirmed state; migration/rollback tested → **PASS**.
- 39/39 journal+journey PostgreSQL tests, including in-memory/postgres parity, `0014` applied additively over a `0013` database, RLS, and draft-only `confirmation_blocked` (schema check `0014_journeys.sql`).

## 5. Findings

**P0: none. P1: none.**

### P2-1 — Approval TTL sweep has no production call site; no periodic worker sweep

`ApprovalEngine.releaseExpired` (`packages/approval-engine/src/engine.ts:889`) is correct and tested, but no non-test source calls it. The runtime only sweeps the effect journal at turn start (`packages/agent-runtime/src/runtime.ts:425`). `docs/02_spec/aaa_execution_contract.md:119` requires `releaseExpired` at the start of each turn **and** a periodic worker sweep (AAA03-R3-F03). Impact: no false success/duplicate effect, but recovery of orphaned approval reservations is lazy (next retry of the same approval via `#recoverExpiredReservation`, `runtime.ts:1794`). Related to AAA-07 Condition C-1.

### P2-2 — AAA-13 rehearsal binds candidate `159dd98e`; current tree is `bb1fd6e8`

The rehearsal under `docs/04_audit/evidence/AAA/AAA-13/integration-rehearsal/rehearsal-20260913T023539Z/` is internally consistent for `159dd98e` (verified). The working tree has since drifted (821 → 822 files; e.g. `packages/persistence/src/__tests__/channel-effect-journal-postgres.test.ts` current `48fc3cfa…` vs snapshot `386c8957…`). Per `aaa_quality_contract.md:93`, drift invalidates qualification (`CANDIDATE_DRIFT`).

### P2-3 — Candidate-scope prettier gate red on two tracking JSONs

Required command exit 1: `docs/03_build/tracking/aaa_execution_ledger.json` and `aaa_program_backlog.json` (untracked, coordinator-owned). Diffs: `commands/ledger-format.diff`, `commands/backlog-format.diff`. Full `npm run format:check`: 42 files (40 evidence-excluded + these 2). Related to AAA-15 Condition C-5.

### P2-4 — agent-runtime focused coverage below AAA-04 v2 §9.1 floors (context only)

Independent measurement: statements 77.24% (706/914), branches 71.45% (458/641), functions 93.26%, lines 78.24%. The v2 floors (90/85/90/90; ≥95% critical branches, `aaa_quality_contract.md:179`) are a **P4/AAA-34 qualification item, not a P1 gate**. approval-engine (100/99.7/100/100) and channel-gateway (98.41/96.23/96.15/99.61) exceed the critical floor. AAA-13 rehearsal context numbers: statements 87.88, branches 83.48, functions 93.14, lines 88.87.

### P2-5 — expectedEvidence path mismatch for AAA-09/10/11/17

`aaa_program_backlog.json` declares `docs/04_audit/evidence/AAA/<task>/manifest.json`, but those manifests live in subdirectories (`AAA-09/builder/`, `AAA-10/ports/` + `wiring/`, `AAA-11/builder/`, `AAA-17/builder/`). No task-root `manifest.json` exists for these four tasks; automated evidence traversal may miss them.

### P2-6 — `npm run licenses:check` mutates a tracked certification artifact

`scripts/check-licenses.mjs:166-169` unconditionally writes `certification/license-report.json` with a fresh `generatedAt`. The file is candidate-excluded (`scripts/lib/certification-rules.mjs:181-193`), so the candidateId is stable, but re-running the gate invalidates the artifact hash recorded by the builder at `docs/04_audit/evidence/AAA/AAA-14/changed-hashes.txt:6` (`55787d37…`). A verification command that changes tracked bytes contaminates hash bindings; a dry-run/read-only mode (or writing to an excluded path) is recommended.

### Reviewer write incident (disclosed)

Running `npm run licenses:check` (behavior above) rewrote `certification/license-report.json` with `generatedAt: 2026-09-13T03:21:58.389Z`, changing only that timestamp. Because the reviewer write scope excluded product/evidence files, the file was restored **byte-for-byte**: the only variable is `generatedAt`, reconstructed from the builder-recorded hash within the builder run window. Current sha256 is `55787d37f7d42d1e0348c2d0df9db269838c7175a31f5bdec70473bb17f0dda9`, identical to the recorded value (`commands/license-report-restored.sha256`, reconstruction script `commands/restore-license-report.mjs`). Net content change versus pre-review: **none**; candidate impact: none (excluded file; git status entry count unchanged at 86).

## 6. Items that could NOT be verified (and why)

1. **AAA-13 N1–N9 negative self-test** — the command writes/overwrites `certification/negative-validation.json` (`scripts/phase10-verify.mjs:1207`; `package.json:36` also runs `prettier --write`), outside the reviewer write scope. Only builder logs were inspected.
2. **Docker image build/smoke (AAA-14)** — Docker daemon unavailable (declared environment limitation). Static Dockerfile inspection only.
3. **Isolated `npm ci --ignore-scripts` on Node 22** — not re-executed (network + writes outside allowed scope); target-Node 22.23.2 typecheck on the current tree was executed instead and passed.
4. **Full `npm test` on target Node 22** — host runs Node 24.20.0; only the focused Node 22 typecheck was executed.
5. **AAA-13 producer/verifier end-to-end re-run on a fresh snapshot of the current tree** — would write certification outputs/snapshots outside the allowed write scope; the preserved `159dd98e` snapshot was re-hashed and the recorded gates/headers/SUMS verified instead.
6. **Playwright e2e (`npm run test:e2e`)** — not part of the required checks for this review; not executed.
7. **Mutation testing / critical-branch floors** — P4/AAA-34 qualification item; not re-measured.

## 7. Artifact hashes judged by this review

### 7.1 Product files (sha256)

| File                                                              | sha256                                                             | size   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ | ------ |
| `packages/agent-runtime/src/runtime.ts`                           | `ea1c8ccde446686f68b541e780f52138fab2201d684b0821af57acbf57e34f10` | 70387  |
| `packages/agent-runtime/src/contracts.ts`                         | `49220c11e5cff2fac7936513ca1dfa2333f944e6d06a480dc09f035f8a16baba` | 4724   |
| `packages/agent-runtime/src/proposal.ts`                          | `2f7456250b454232f0966360ef56dc34cc78c312743f590765bf8d28ef230272` | 7105   |
| `packages/agent-runtime/src/effect-journal.ts`                    | `ecdcab69a263e8950dab5d8d6f4bc6a6ee791d5a003d2a5393559df87137c0a1` | 24820  |
| `packages/agent-runtime/src/index.ts`                             | `37575ddaea0133eb5549dd0c278abf531f3bea232133c2cd441f20f151fea689` | 126    |
| `packages/approval-engine/src/engine.ts`                          | `74b566bb0dcdbcdd6256c57c2005e3a4a8401dde80a917067633aae9e14fd537` | 37425  |
| `packages/approval-engine/src/contracts.ts`                       | `fe043ae298de59675db285d7177fb4441213b98219e9e56c6d9931cf33194f99` | 5799   |
| `packages/policy-engine/src/engine.ts`                            | `70fdc4f16de73df51a814c07dadd127c10830cdf489ab36a8a67bf3b66525d05` | 12054  |
| `packages/policy-engine/src/capabilities.ts`                      | `8bd71d6980b503394e8c66237d1174d87241ce97e15493e17b70685326bfb00c` | 8206   |
| `packages/policy-engine/src/grants.ts`                            | `bba4c243372303208afe9418c828af7b586c9fbc431a2db709d31e037584662c` | 4993   |
| `packages/channel-gateway/src/gateway.ts`                         | `f638c5aacbda48bca01deddeb85cb56c52e330d51ac40c8a7110d03186fd5ec6` | 13192  |
| `packages/channel-gateway/src/effect-journal.ts`                  | `3ac12260f328c9fc726b04e1b5998dff07789691fd69b8669cae2998e995db4b` | 17901  |
| `packages/channel-gateway/src/effect-journal-file.ts`             | `678f10269657dfc3b45da760e90a715e85c0f04666f9e4782027ee142b1247ff` | 13693  |
| `packages/channel-gateway/src/idempotency.ts`                     | `53cd6354220771e2a32b7496512e3a64a44b6dd18c74f64159e3d1271104e4ce` | 1948   |
| `packages/channel-gateway/src/contracts.ts`                       | `ab3f62b01d981e3dacfab8e210f730a6ae1acb63900e0c34223b9274b35bb0a6` | 3157   |
| `packages/persistence/src/effect-journal-postgres.ts`             | `52fff73760970384250684f85819132072cf66eb1fa51355a252dd70879146e1` | 12005  |
| `packages/persistence/src/channel-effect-journal-postgres.ts`     | `5317684178a77d5b5895c5904792d2d6713be8acc1647ba5965a64171963f211` | 19770  |
| `packages/persistence/src/postgres.ts`                            | `7c3f3b11b43f182ec778911651e5c480ef6d3fc659ec2d0ce3e35f982766f25f` | 120944 |
| `packages/persistence/src/journeys-postgres.ts`                   | `577254ee15b55d6e53b5617bef6b207b291599793be6366334d1e1765d68d7a2` | 34735  |
| `packages/persistence/src/journeys.ts`                            | `15790fa25c381638fe57699ecf4f7548f6f1a9cd85edaf3ad052cdd5df4a9b80` | 27482  |
| `packages/persistence/src/index.ts`                               | `d2306864c64309a1ed4e2d7111eec93ef01f39303a157214b3ad3786b118f858` | 879    |
| `packages/persistence/migrations/0012_channel_effect_journal.sql` | `57747d07381caa30168b8166999c493af1b689d9a0efa8971136d5c752f5453b` | 3466   |
| `packages/persistence/migrations/0013_runtime_effect_journal.sql` | `8a321d897e7d097515b0a9050ff527b612d6a60884bada2f277f2bd10666e24c` | 3372   |
| `packages/persistence/migrations/0014_journeys.sql`               | `99759a1759a99a0d56a9fc80fb559cc6f114459568091516b379190c9285af6c` | 5740   |
| `scripts/phase10-certify.mjs`                                     | `46b024c8f9f7abe4e942ed13d7515adcfef7c183f1920b2b497e4b3b259c9b7c` | 13471  |
| `scripts/phase10-verify.mjs`                                      | `24825421098aab3210544bc7f972e07e06596f5ae956e2e1d0f2ab355a0d1e9c` | 41284  |
| `scripts/lib/certification-rules.mjs`                             | `1d1edc9dfba6e47c64dc20e34f006844773410e1d691c43b13b0c92d5dde9b8f` | 39860  |
| `package.json`                                                    | `1b093cef18a49adcda5b543a3ef7077e65f7bee6b0fc21076841ef932e5432f2` | 3922   |
| `package-lock.json`                                               | `a5ccf03bff3081ddc6b1d05b5cdbbc94fe0d5330512b5c9df8c45d99d611a414` | 185584 |
| `Dockerfile`                                                      | `5b637f8ae72f44c64038b7838e15da4333f85a2ec06cef595818c34a9f61d33a` | 1668   |
| `apps/api/src/server.ts`                                          | `3695e1214f145dbfa216a0737faa2ece6d70131efc9385d1c78fb6f2e24e03c3` | 170776 |

### 7.2 Contracts and evidence manifests used (sha256)

| File                                                              | sha256                                                             | size   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ | ------ |
| `docs/02_spec/aaa_execution_contract.md`                          | `9df1a05fdf36293d02e006917f191f0c96e8c1109e4a10d1e9fc49f5d9ef3ff7` | 38559  |
| `docs/02_spec/aaa_data_api_contract.md`                           | `cebeddab53061997718fd59475019ead3a71a061942946b25018fd9580087cd1` | 38519  |
| `docs/02_spec/aaa_quality_contract.md`                            | `aec324018513c43a3e949663e41769f2d59180c6812d7430bd5980fb4a357097` | 31985  |
| `docs/03_build/tracking/aaa_program_backlog.json`                 | `d27329d2ad88d1bfb9f9848fa06cf68f53cb7284a888885fe561b550b2a31bc3` | 138608 |
| `docs/04_audit/evidence/AAA/AAA-07/manifest.json`                 | `57cbd75a273aab0ea5abdea75e05a8662bb009881ae6aeabdd13e2e46bd66a1f` | 6424   |
| `docs/04_audit/evidence/AAA/AAA-08/manifest.json`                 | `07afb95ebb54c435c13697dd15770c46456e71f7fb41e1e471f3ba1384826645` | 6871   |
| `docs/04_audit/evidence/AAA/AAA-09/builder/manifest.json`         | `171773e2db7731045a218590f6dc696950344f7dcafd517d8047e8e934ddc815` | 10305  |
| `docs/04_audit/evidence/AAA/AAA-10/ports/manifest.json`           | `6262c1908cc9050b795ac0dc4112d9f0dd4a011575aad04d1e54de139307de77` | 3560   |
| `docs/04_audit/evidence/AAA/AAA-10/wiring/manifest.json`          | `21a5eb321a388b6c34e7aecf8a34ef204f47e23d9220affcc47fadcb083898a1` | 7641   |
| `docs/04_audit/evidence/AAA/AAA-11/builder/manifest.json`         | `a8f81f770a60736a3906ad6b58f65651b869997bfbc0fc7560d000482d149c33` | 9704   |
| `docs/04_audit/evidence/AAA/AAA-12/manifest.json`                 | `a89cddce607377e7c99718d60a945038cd9ebb05c848fa2d11ca06cc37feba12` | 9454   |
| `docs/04_audit/evidence/AAA/AAA-13/manifest.json`                 | `c65921529886546830602e3e5bc73b5023c357e190511347ff96f1e7e366d04c` | 7351   |
| `.../rehearsal-20260913T023539Z/manifest.json`                    | `e35755bf53f49ff77c95937bd87b6841fb6951186a11461d07169aab08f0d217` | 35939  |
| `.../rehearsal-20260913T023539Z/gate-matrix.json`                 | `816854a5c21e44a4440251b683bdfb39a1d6ce938f564bb2efeffe519ccac0bb` | 21521  |
| `docs/04_audit/evidence/AAA/AAA-14/manifest.json`                 | `ea4545bbfea18234cf4c28a0a5a6f514bfe3addc2ac9fdc3bee1a14d32509e06` | 7344   |
| `docs/04_audit/evidence/AAA/AAA-15/manifest.json`                 | `ba2b6477af8651cd7522ac3e8ad7ef162bd2ed97eb9cb66e9d75f7ed44b9dd76` | 3873   |
| `docs/04_audit/evidence/AAA/AAA-16/manifest.json`                 | `c30c753bafdd74b7d2dce70683c29d661e5c55e2201b2edd42c5023cd03a8b07` | 8019   |
| `docs/04_audit/evidence/AAA/AAA-17/builder/manifest.json`         | `658ebd4c0d147d539ca7ae491ca2f8b3cc4d94df98d0d791331a823a0ee1ed8d` | 7478   |
| `docs/04_audit/evidence/AAA/coordinator-batch-review/review.json` | `d3f005171e728f7d7219c26adbe9ceb8797f46b79dffaafd008e40b2a982795f` | 2620   |

## 8. Reviewer declaration

I did not build AAA-07..AAA-17. Builder evidence was treated as claims and re-executed or re-derived where possible. I did not edit product files or existing evidence; no commit, push or deploy was performed. The machine-readable version of this review, including all commands, probe results, findings and hashes, is in `review.json`. This review does not grant G_QUALITY, any Gate, production, State of Art or Triplo AAA status; it only records controlled-scope verification of P1 deliverables.
