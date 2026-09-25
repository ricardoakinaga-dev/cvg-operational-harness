# Proposed gate M07-S1-R1-C1I — refreshed-baseline candidate replay

**State:** `PROPOSED / WAITING_HUMAN_APPROVAL`
**Current M07-S1:** `FAIL / OPEN`
**Production:** `NO_GO`

## Purpose

C1H was approved and stopped at candidate freeze with exit 64 because the preserved R1 baseline expected older bytes for exactly two inputs: `docs/02_spec/0190_spec_validation.md` and `docs/07_agents/AGENTS.md`. C1I proposes a new candidate baseline copied from R1, updates only those two hash/size tuples to the current bytes, and recomputes the baseline fingerprint using the inherited `JSON.stringify(fingerprint_basis)` property order. The original R1 baseline remains byte-identical.

The proposed C1I baseline has 973 inputs. Static packet checks confirm the two changed tuples are the only input differences, their current hashes and sizes match the worktree, and the recomputed fingerprint is recorded in `baseline-refresh-report.json`. This is a proposal until the exact packet is approved.

## Proposed product scope

After approval, only these paths may be edited, exactly as shown in `correction-preview.patch`:

- `config/workspace-dependency-policy.json`
- `scripts/workspace-dependency-audit.mjs`
- `tests/workspace-dependency-audit.test.js`

The conversation fixture `packages/conversation/src/__tests__/postgres-store.unit.test.ts` is snapshot-only and must remain byte-identical. The expected candidate additions remain exactly the four approved R1 paths: policy, scanner, scanner test, and conversation fixture. The C1I patch binds only the exact C1I baseline path/hash, npm evidence path, and output path while retaining current traversal and symlink checks. No C1H rerun is proposed.

## Exact preconditions and outputs

Before snapshots or patch application, the command plan requires: the C1H Gauntlet state is `FINISHED / STOP / FAIL`; its writer lock is free; the C1I archive target is absent; the C1I task and hash-bound human decision are recorded; the output directory contains no execution outputs; the frozen source hashes match; the R1 baseline is unchanged; and the refreshed baseline passes its 973-input/two-tuple/fingerprint/live-hash checks. Any failed precondition stops dependent commands.

If preconditions pass, the exact C1H Gauntlet directory may be moved intact only to `.gauntlet-archive/m07-s1-c1h-20260924-finished-fail/`, then a new C1I `.gauntlet/` is initialized. Product outputs and command evidence stay in `docs/04_audit/evidence/AUD-20260924/M07-S1-C1I/`. No other archive move is authorized.

## Verification matrix

The frozen plan uses Node `v22.23.2`, local TypeScript `6.0.3`, npm `10.9.8`, offline npm, and removes all listed PostgreSQL environment variables. Every setup and verification command runs separately through the C1I command recorder, which records argv, UTC timestamps, duration, exit, stdout/stderr paths, byte counts, hashes, and declared side effects. The 36 named steps include a hash-bound packet-integrity preflight, baseline refresh validation, preflights, C1H state/archive checks, snapshots, exact patch application, candidate freeze/verification, inventory, focused and full tests, typecheck, lint, coverage, post-check, log sanitization, and historical evidence integrity; a final verifier checks and records its own evidence.

The frozen bar retains ten critical criteria, including 90% statements, 85% branches, 90% functions and 90% lines, candidate-bound inventory, separate I1 and Final Critic reviews, and safety boundaries. Any unexpected exit halts dependent work. No automatic retry is allowed. Missing or failed criteria keep M07-S1 `FAIL / OPEN`.

## Approval and limits

This packet authorizes no action until the user approves the exact `approval-request.md` bytes by SHA-256. If approved, the scope is limited to the three product paths, exact local command plan, C1H archive target, C1I Gauntlet state, and C1I evidence directory. Approval would not accept M07-S1, authorize S2/S3/S4 or M05, open G21-5/G21-6, permit real data or external actions, or release production.
