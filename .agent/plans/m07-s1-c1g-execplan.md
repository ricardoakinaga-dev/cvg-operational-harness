# M07-S1 C1J execution record; C1G–C1I history — ExecPlan

<!-- engineering-framework: active_action_id=AUD47-C1J-CLOSE -->

> AUD47: the user approved the M07-S1 C1J gate specifying three allowlisted product paths and frozen local commands. The decision is recorded against request SHA-256 `f4351b91f8b0b4401d25bf3200a2355fe8148685936507bfe448b59c3d8c27e2`. C1J executed as `m07-s1-c1j-20260924-1` and produced candidate fingerprint `e884796fd90192409230b0991524168186a9f65c824156a943102dcfacc98e1b`; local checks passed, but required I1 and Final Critic creation was refused by `agent thread limit reached`. M07-S1 remains `FAIL / OPEN`.

## Current C1J result — FAIL / OPEN; execution attempt complete

- `A24-03-C1J-PACKET` and `A24-03-C1J-GATE` are complete; the user decision is in `docs/04_audit/evidence/AUD-20260924/M07-S1-C1J/decision-record.json`. Approval was limited to the three product paths and frozen local command plan; it did not accept S1 or authorize downstream M07/M05 work.
- The 36 frozen command steps plus final verifier completed with expected outcomes. The evidence ledger contains 37 entries and reports `INTEGRITY_PASS`, with zero stream-hash problems.
- Focused tests passed 25/25; the full suite passed 2,137 tests with 146 skipped and zero failures. Typecheck and lint passed; coverage was 90.86% statements, 85.87% branches, 92.91% functions, and 91.80% lines. Inventory recorded the expected 11 findings under `PASS_WITH_FINDINGS`.
- Fresh-context I1 and separate Final Critic could not be created because the collaboration service reported `agent thread limit reached`. No reviewer or report exists; C1J-08/09 remain unavailable. The final gate result is `FAIL / OPEN`, and this C1J attempt must not be replayed under the same gate.
- Next action: prepare a separate documentary packet for the unavailable reviews or a later gated run, with its own decision. M07-S2/S3/S4 and M05 remain blocked; production remains `NO_GO`.

## Historical C1G/C1H plan context

The C1G/C1H detail below is preserved as history. It does not authorize a C1I rerun or C1J execution. M07-S1 closes only if all critical criteria, I1, and a separate Final Critic accept the same candidate.

## Purpose / Big Picture

Prepare and execute the gated M07-S1 candidate replay after C1F ended `FAIL / OPEN`. C1G was approved but stopped at TypeScript preflight because its recorder launched from the parent workspace. No C1G source change or candidate resulted. C1H now has a fresh hash-bound packet with the corrected recorder root and awaits its own approval. M07-S1 closes only if all critical criteria, I1, and a separate Final Critic accept the same candidate.

## Historical C1G/C1H progress

- [x] (`2026-09-24T06:52:02Z`) Recorded C1F/C1E immutable evidence hashes and the exact five-source baseline; created C1G patch, command plan, quality bar and provenance recorder without applying code or running checks.
- [x] (`2026-09-24T07:04:00Z`) Finish current CVG ledger/navigation updates and publish the hash-bound C1G decision request; packet static structure, hashes, and five source baselines match.
- [x] (`2026-09-24T07:04:00Z`) Request a fresh-context read-only packet critic; service refused with `agent thread limit reached`, no reviewer/report.
- [x] (`2026-09-24T07:21:26Z`) Reconcile current 50-item/A24/A29 pointers in 0339/0341/0343/0344/0347 to C1G, preserving older C1/C1E/C1F history; record AUD35 and verify 11 documentation roots (`DOC_LINKS_OK`, zero broken/unallowlisted links). This independent A29-10 follow-up did not execute product checks.
- [x] (`2026-09-24T07:21:26Z`) Re-request a fresh-context read-only critic for the AUD35 document reconciliation; service refused with `agent thread limit reached`, no reviewer/report.
- [x] (`2026-09-24T07:27:34Z`) Record the user's approval for the exact C1G scope in its decision record and 0344, bound to request SHA-256 `5700d97d2931dc08c622cdee470c5d869a9980f1a4c1bdb40b64afb7d3e6645f`.
- [x] (`2026-09-24T07:28:48Z`) Start C1G through its recorder; Node preflight passed and TypeScript preflight failed because `HERE.parents[5]` selected the parent workspace. Stop the dependent sequence; no code, archive, Gauntlet initialization, or candidate.
- [x] (`2026-09-24T07:36:37Z`) Prepare C1H with `HERE.parents[4]`, new evidence directory, static packet validation, and a fresh approval request. Independent packet critique refused with `agent thread limit reached`.
- [ ] Obtain human decision on C1H approval request SHA-256 `d2e03fb29f0e95efdb418fa47e984ee2bcac4e77fbd244bb9f2b162caead046f`.
- [ ] If approved, register it before any command or source edit; execute only the C1H command plan. Stop on the first failure, then request I1 and Final Critic only for a frozen candidate.
- [ ] (blocked by M07-S1 acceptance) Continue M07-S2/S3/S4, then the approved M05 sequence and the rest of the 50-item portfolio under their own task gates.

## Surprises & Discoveries

- Observation: C1F's local matrix passed, but C1F-05 lacks per-command provenance for snapshot/copy/checksum setup; I1 spawn returned `agent thread limit reached`, and no Final Critic report exists.
  Evidence: `docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/final-gate-result.md` and `i1-attempt-01.md`.
  Impact: C1F cannot be retroactively repaired. C1G is a new candidate run with a fresh evidence directory and command capture from preflight.
- Observation: the attached full-portfolio prompt names the already-approved and attempted C1 gate (`9d865f7d…`); the repository's current gate is the distinct C1G request (`5700d97d…`), which remains unapproved.
  Evidence: `docs/04_audit/evidence/AUD-20260924/A29-10-doc-freshness-audit.md` and the C1G decision record.
  Impact: the old C1 decision does not authorize C1G; no C1G source edit or command begins before a hash-bound decision.
- Observation: the worktree has many pre-existing modifications unrelated to this task.
  Evidence: initial `git status --short` inspection.
  Impact: preserve the worktree; limit edits to the listed documentation, gate packet, and—only after a distinct approval—the exact three C1G code paths.
- Observation: C1G's recorder set `REPO = HERE.parents[5]`, which resolves to the parent of this repository at the C1G evidence depth. Node ran from that parent and could not resolve the local TypeScript package.
  Evidence: C1G `typescript-version-preflight.stderr.log`, `command-records.json`, and `capture_command.py:19`.
  Impact: C1G is stopped and its command plan cannot be retried. C1H fixes the root index, uses a new evidence directory and requires a separate approval.

## Decision Log

- Decision: prepare a distinct C1G candidate run and keep the current generic phrase “aprovo este gate” unbound to C1G.
  Context: C1F already has its own approval and completed execution; the C1G packet and hashes were created after the latest phrase and were not its described scope.
  Alternatives: treat C1F approval as reusable or assume a later gate approval.
  Reason: each new source/path/command scope requires its own exact CVG gate and human decision.
  Consequences at that time: C1G remained `WAITING_HUMAN_APPROVAL`. The user later approved that packet; its replay stopped at the second preflight.
  Date/Author: 2026-09-24, Codex.
- Decision: record the user's answer “Aprovo exatamente este gate” to the explicit M07-S1 question scoped to the three paths and listed commands as approval of the current C1G packet.
  Context: the packet was the unique current gate matching the closed scope in the question; its request SHA and companion hashes were verified before decision registration.
  Reason: the user directly approved that exact bounded gate; the approval was recorded before any C1G command.
  Consequences: C1G preflight could begin. The second step failed, so no later C1G action is allowed without a new gate.
  Date/Author: 2026-09-24, Codex.
- Decision: record fresh-context gate-packet critique as unavailable after a thread-limit refusal.
  Context: an independent packet-only review was requested before asking the user.
  Alternatives: count the lead's self-review as independent or silently proceed as if a review existed.
  Reason: no reviewer was created and no report returned; neither would be an honest I1 record.
  Consequences: disclose the limitation in the request and preserve candidate I1 plus Final Critic as mandatory separate reviews.
  Date/Author: 2026-09-24, Codex.
- Decision: C1G allows only policy, scanner, and scanner-test changes; the current conversation fixture is snapshot-only.
  Context: C1F already corrected the fixture; the new issue is candidate output/npm binding plus incomplete C1F setup provenance.
  Alternatives: edit the fixture again or attempt to rewrite C1F history.
  Reason: the exact patch need only bind C1G and preserve security tests; a new replay creates new, truthful provenance.
  Consequences: candidate still includes the four approved R1 additions, while only three files are mutable.
  Date/Author: 2026-09-24, Codex.

## Outcomes & Retrospective

C1G stopped at preflight; no candidate or quality-bar adjudication exists. The root path error is documented in `M07-S1-C1G/final-gate-result.md`. C1H preparation is complete and awaits a distinct decision. Never upgrade `FAIL / OPEN` without candidate-bound evidence and independent reviews.

## Context and Orientation

Repository root: `/home/ricardo/Área de trabalho/cvg-operational-harness`. Follow `docs/07_agents/AGENTS.md` and keep the CVG pipeline `DISCOVERY → PRD → SPEC → BUILD → AUDIT`. The current M07 task is `A24-03-C1H`; C1G is a preserved stopped attempt. The M07-S1 dependency blocks S2/S3/S4 and M05. The original 50 improvements remain the base portfolio in `docs/03_build/0340_50_improvements_roadmap.md` and `0341_50_improvements_backlog.md`; A24/A29 are tracked deltas, not additional numbered improvements.

Authoritative current run result: `docs/04_audit/evidence/AUD-20260924/M07-S1-C1G/final-gate-result.md`. Proposed next gate and exact command plan: `docs/04_audit/evidence/AUD-20260924/M07-S1-C1H/`; approval request SHA-256 `d2e03fb29f0e95efdb418fa47e984ee2bcac4e77fbd244bb9f2b162caead046f`. Current state/backlog/log sources are `docs/99_runtime_state.md`, `docs/30_backlog_master.md`, and `docs/20_master_execution_log.md`.

## Scope and Constraints

- In scope: documentary C1G result; A24-03-C1H registration and hash-bound gate; after a separate C1H approval only, three policy/scanner/test edits, the one-line packet-local recorder-root correction, and the C1H local verification matrix.
- Out of scope: conversation fixture edits; dependency manifests/lockfile; product/runtime code; CI; `.nvmrc`; Vitest config; production, external access, database, service, real data, sensitive action; M07-S2/S3/S4 and M05 handoff.
- Applicable instructions: `AGENTS.md`, `docs/07_agents/AGENTS.md`, `docs/99_runtime_state.md`, `docs/20_master_execution_log.md`, `docs/30_backlog_master.md`, engineering-framework ExecPlan engine, Gauntlet quality loop, and orchestrate/recovery instructions.
- Requirements/decisions: M07 Discovery, PRD 0028, SPEC 0128 and prior M07-S1/R1/C1E/C1F records; preserve thresholds 90/85/90/90 and keep production `NO_GO`.
- Tier/risk/blast radius: T4 / high coordination and assurance burden; narrow static scanner/config/test surface plus local suite and candidate evidence. Broad dirty worktree and shared Gauntlet root require exact paths, snapshots, historical hashes, and fail-closed preconditions.
- Authorization constraints: C1G approval was recorded for its exact packet and its second preflight failed. Do not rerun or continue C1G. C1H is not approved. No C1H source edit, candidate freeze, inventory, test, typecheck, lint, coverage, or Gauntlet mutation before its exact decision is recorded.

## Architecture and Interfaces

The scanner owns candidate fingerprinting, approved-addition checking, output-path validation, and inventory semantics. C1H proposes changes only to the policy/npm path, scanner C1H path constant/allowlist, and scanner tests, with the conversation fixture snapshot-only. The candidate baseline remains R1; expected candidate size is 977 inputs with four additions. C1F and C1E remain historical inputs. The C1H helper runs explicit argv arrays with `shell=False`, resolves `HERE.parents[4]` to the repository root, uses offline npm, and removes PostgreSQL variables; every stream and side effect is captured under a new C1H evidence directory. Gauntlet state is isolated by archiving the finished C1F root only after preconditions pass.

## Milestones

### Milestone 1 — Prepare a hash-bound gate packet

- Outcome: gate proposal, patch, ten-criterion quality bar, 33 named command steps plus one final verifier, recorder, source hashes, historical evidence hashes, and approval request are internally consistent and reviewable.
- Scope/dependencies: documentation/evidence only; no source edits or execution checks.
- Demonstration: inspect the packet and its hash list; parse packet data structurally without running product commands.
- Acceptance/evidence: C1G packet hashes and approval were recorded; its second preflight is preserved as a failure. The new C1H approval request binds all packet hashes; A24-03-C1H and current ledgers point to the same pending decision.

### Milestone 2 — C1G local candidate replay (stopped)

- Outcome: none; C1G stopped on its second preflight with no source edit, candidate, or Gauntlet mutation.
- Evidence: `M07-S1-C1G/final-gate-result.md` and its raw command records.

### Milestone 3 — C1H local candidate replay (pending approval)

- Outcome: a new C1H candidate and candidate-bound evidence across inventory, tests, coverage and post-check.
- Scope/dependencies: exact human approval of C1H, decision registered before execution, corrected helper root, all preconditions pass, then only three listed product files and C1H evidence/Gauntlet paths.
- Demonstration: run each named step through the C1H `capture_command.py`; inspect command records and candidate fingerprints.
- Acceptance/evidence: ten C1H criteria pass with no drift and thresholds met; C1F/C1E/C1G evidence remains preserved.

### Milestone 4 — Independent closure decision (conditional)

- Outcome: independent I1 and separate Final Critic reviews of the final C1H candidate.
- Scope/dependencies: same frozen candidate and evidence; reviewer service available.
- Demonstration: preserve both fresh-context reports and bind each to candidate hash.
- Acceptance/evidence: both reviews accept; all ten critical criteria pass. Otherwise retain `FAIL / OPEN`.

## Plan of Work

The C1G result and C1H packet are complete. Reconcile 0344, 0346–0348, the 50-item roadmap/backlog summaries, README/index, execution log and runtime state. The C1H packet-only fresh-context critique was refused; disclose that limitation. Stop at `WAITING_HUMAN_APPROVAL`. After approval, register the response, use a fresh shell with Node 22.23.2, verify state/archive/lock/source hashes, archive C1F only after exact preconditions, initialize C1H, capture snapshots and apply the patch, then run only the exact C1H plan. Obtain I1 and Final Critic separately. Update evidence, backlog, log, and runtime state in that order; keep dependent stages blocked on any failure or missing review.

## Concrete Steps

From `/home/ricardo/Área de trabalho/cvg-operational-harness`:

1. [AUD36-C1G-RESULT] Preserve the approved C1G preflight failure and document why no dependent command ran.
2. [AUD36-C1H-GATE] Review the static C1H packet, which binds corrected helper root, exact patch, command plan, quality bar, baseline and preservation hashes.
3. Request approval tied to C1H request SHA-256 `d2e03fb29f0e95efdb418fa47e984ee2bcac4e77fbd244bb9f2b162caead046f`. Do not execute C1H commands while the decision is pending.
4. (Conditional) Record approval in C1H `decision-record.md` and 0344; execute exact steps individually through C1H `capture_command.py`.
5. (Conditional) Obtain the two distinct independent reviews and persist actual criterion results before finalizing Gauntlet and ledgers.

## Validation and Acceptance

| Criterion            | Required | Procedure/environment                                                             | Expected observation                                                                                   | Evidence destination                                  |
| -------------------- | -------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| C1G preflight        | Yes      | Captured Node and TypeScript preflight                                            | Node passed; TypeScript failed because the helper cwd was outside the repo; dependent sequence stopped | C1G `command-records.json`, raw streams, final result |
| C1H packet integrity | Yes      | Static JSON/Python syntax and dependency graph review; SHA-256 inventory          | One exact, closed C1H packet; no C1H execution outputs                                                 | C1H `approval-request.md`, packet hashes              |
| C1H-01–04            | Yes      | After approval, snapshots, patch tests, 977-input freeze and inventory on Node 22 | Exact scope; matching report/candidate; 11 visible findings; zero gaps/unresolved                      | C1H logs, manifest, report, quality results           |
| C1H-05–07            | Yes      | Per-command capture, local matrix, historical hash check and candidate post-check | Full provenance; zero drift; thresholds 90/85/90/90                                                    | C1H command records, logs, coverage, integrity files  |
| C1H-08/09            | Yes      | Fresh-context I1 and separate Final Critic on same candidate                      | Both reports accepted and candidate-bound                                                              | C1H review packets and final result                   |
| Safety               | Yes      | Inspect environment, changed paths and Gauntlet state                             | No real data, database/service/network, sensitive action or production; G21 gates closed               | C1H final result and runtime state                    |

## Risks and Human Decisions

| Risk/decision                       | Evidence/confidence                                                           | Controls                                                                            | Residual/authority                     | Trigger                          |
| ----------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------- |
| C1H source/check scope approval     | C1G decision does not transfer to C1H                                         | Present exact C1H request hash; register decision before code                       | Human decision required                | Exact packet hash is presented   |
| Reviewer capacity                   | C1F I1 and C1G/C1H packet-review refusals                                     | Request I1 and Final Critic separately; record unavailable faithfully               | Missing reviewer blocks S1 closure     | Candidate is frozen              |
| Shared dirty worktree/Gauntlet root | Many pre-existing worktree changes; current `.gauntlet` contains finished C1F | Source hashes, snapshots, target absence and free-lock checks; exact archive target | Any mismatch stops C1H                 | Immediately before archive/apply |
| Local command side effects          | npm scripts may create coverage/evidence output                               | Offline npm, PostgreSQL env removal, exact argv allowlist, isolated C1H output      | All local checks remain non-production | Every command step               |

## Idempotence and Recovery

The C1H packet preparation is repeatable only before approval if the same source hashes remain; changed bytes require recalculating every bound hash. C1H execution refuses duplicate step IDs and existing logs. Any failed precondition stops before dependent mutations. Preserve all failure output; do not rerun failed commands without a new gate. Roll back only the three editable paths from C1H snapshots after verifying recorded hashes. Never restore or alter the immutable conversation fixture. Never overwrite C1E/C1F/C1G evidence. If the C1F archive target exists, the current `.gauntlet` is not the expected finished run, or the writer lock is held, stop and request a new plan.

## Artifacts and Evidence

- `docs/04_audit/evidence/AUD-20260924/M07-S1-C1G/final-gate-result.md`: authoritative C1G preflight stop and preserved output.
- `docs/04_audit/evidence/AUD-20260924/M07-S1-C1H/approval-request.md`: current human decision request; SHA-256 `d2e03fb29f0e95efdb418fa47e984ee2bcac4e77fbd244bb9f2b162caead046f`.
- `docs/04_audit/evidence/AUD-20260924/M07-S1-C1H/correction-gate-proposal.md`: proposed scope and authority.
- `docs/04_audit/evidence/AUD-20260924/M07-S1-C1H/correction-preview.patch`: exact three-file preview; not applied.
- `docs/04_audit/evidence/AUD-20260924/M07-S1-C1H/command-plan.json`: exact local argv and ordering.
- `docs/04_audit/evidence/AUD-20260924/M07-S1-C1H/capture_command.py`: corrected recorder; not run.
- `docs/04_audit/evidence/AUD-20260924/M07-S1-C1H/quality-bar.json`: ten critical criteria.
- `docs/04_audit/evidence/AUD-20260924/M07-S1-C1H/source-baseline.json`: five source hashes.
- `docs/04_audit/evidence/AUD-20260924/M07-S1-C1H/historical-evidence.sha256`: 110 C1E/C1F historical file hashes.
- `docs/04_audit/evidence/AUD-20260924/M07-S1-C1H/packet-validation.json`: static packet inspection; no command-plan step ran.

Plan revision note, 2026-09-24: AUD34 began as C1G packet preparation. AUD36 records its approved preflight stop and prepares C1H; no C1H source code or product command is authorized until its separate decision.
