# Proposed gate M07-S1-R1-C1J — repair C1I constant binding and replay

**State:** `PROPOSED / WAITING_HUMAN_APPROVAL`<br>
**Current M07-S1:** `FAIL / OPEN`<br>
**Production:** `NO_GO`

## Why this gate exists

C1I was approved and stopped at candidate freeze with exit 64: `C1H_NPM_VERSION_FILE is not defined`. The C1I patch introduced `C1I_NPM_VERSION_FILE` but left the old C1H symbol in `validateExecutionCandidate`. C1I has no candidate and its downstream checks did not run. C1J is a separate replay with a fresh evidence directory and its own decision.

## Proposed product patch

After approval, only these three paths may change, exactly as shown by `correction-preview.patch`: `config/workspace-dependency-policy.json`, `scripts/workspace-dependency-audit.mjs`, and `tests/workspace-dependency-audit.test.js`. The scanner will bind C1J baseline/npm paths, compare to `C1J_NPM_VERSION_FILE`, and allow the fresh C1J evidence output while retaining C1I path compatibility. The conversation fixture is snapshot-only and must remain byte-identical.

The proposed C1J baseline is a byte-identical copy of the C1I reconciled baseline: 973 inputs, with the same two R1 tuple changes for `docs/02_spec/0190_spec_validation.md` and `docs/07_agents/AGENTS.md`, fingerprint `6744024cd8bcdf45be4149c30438f0582ea1f44b884471570bde88f8eaa577c9`. The expected candidate remains 977 inputs with four approved R1 additions.

## Preconditions and execution

The frozen plan has 36 separately captured steps plus the final command-record verifier. It requires Node `v22.23.2`, TypeScript `6.0.3`, npm `10.9.8`, offline npm, and removal of the listed PostgreSQL variables. It verifies the C1I Gauntlet as `FINISHED / STOP / FAIL`, checks a free lock and absent archive target, moves C1I only to `.gauntlet-archive/m07-s1-c1i-20260924-finished-fail/`, verifies all eight bound files, and initializes a fresh C1J state.

Unexpected exits stop dependent steps. A failed candidate freeze does not permit retries. The ten-criterion bar keeps statements/branches/functions/lines at 90/85/90/90; I1 and Final Critic remain separate required reviewers. Missing or failed evidence keeps M07-S1 `FAIL / OPEN`.

## Limits

This gate does not accept M07-S1, authorize S2/S3/S4 or M05, open G21-5/G21-6, permit real data, database/service/network activity, sensitive action, or production. No C1J code or command starts before this packet is approved.
