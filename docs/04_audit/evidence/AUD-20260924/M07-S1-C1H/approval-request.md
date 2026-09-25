# Human decision request — M07-S1-R1-C1H

**State:** `WAITING_HUMAN_APPROVAL`  
**M07-S1:** `FAIL / OPEN`  
**Production:** `NO_GO`

## Decision requested

C1G was approved but stopped at `typescript-version-preflight` with exit 1. The frozen recorder selected the parent workspace directory, so Node could not resolve the TypeScript package installed in the repository. No C1G source patch, candidate, archive move, or later check ran. The captured result is preserved at [C1G final-gate-result.md](../M07-S1-C1G/final-gate-result.md).

Please approve or request corrections to this exact C1H packet. To authorize the new attempt, answer **“Approve M07-S1-R1-C1H”** in response to a question that identifies the full SHA-256 of this `approval-request.md`. The approval is limited to the exact bytes and scope below. No C1G command may be rerun.

## Exact scope proposed

- Product code/config/test edits, after approval, are limited to `config/workspace-dependency-policy.json`, `scripts/workspace-dependency-audit.mjs`, and `tests/workspace-dependency-audit.test.js`, exactly as shown in `correction-preview.patch`.
- The conversation fixture `packages/conversation/src/__tests__/postgres-store.unit.test.ts` is snapshot-only and must remain byte-identical.
- The packet-local recorder is corrected by one line: `REPO = HERE.parents[5]` → `REPO = HERE.parents[4]`. The C1H `command-plan.json` changes the run/task/evidence path identifiers to a fresh `M07-S1-C1H` directory. These are explicitly included executable gate inputs.
- New C1H execution evidence is confined to `docs/04_audit/evidence/AUD-20260924/M07-S1-C1H/`. If the exact C1F Gauntlet state, absent archive target, and free writer lock checks pass, the finished C1F `.gauntlet/` may be moved only to `.gauntlet-archive/m07-s1-c1f-20260924-finished-fail/`, then a fresh C1H Gauntlet state may be initialized at `.gauntlet/`.
- The frozen command plan contains 33 individually named steps and one final verifier, all invoked through the packet-local `capture_command.py`. Commands use Node `v22.23.2`, resolve TypeScript `6.0.3` from the repository root, use offline npm, and remove the listed PostgreSQL variables.
- The ten critical quality criteria, including coverage thresholds 90/85/90/90, candidate integrity, I1, Final Critic, and safety boundaries, are in `quality-bar.json`. Any failed precondition or command stops dependent execution. No rerun follows a failure without a new gate.

Approval does not accept M07-S1, authorize M07-S2/S3/S4 or M05 execution, open G21-5/G21-6, permit real data or external activity, or release production. Missing/failed criteria keep M07-S1 `FAIL / OPEN`.

## Hash-bound packet inputs

These hashes bind the frozen C1H packet. `command-records.json` and `decision-record.md` start in the listed state and may change only as authorized execution/decision records. The SHA-256 of this request file is calculated after packet assembly and must be presented with the human decision.

| File | SHA-256 | Bytes | Role |
| --- | --- | ---: | --- |
| `capture_command.py` | `ab011b81a9dc1fa17db29ade1f5fc8b1e52079d3515df13ac567b77a8aab3df8` | 9336 | Recorder with corrected repository-root calculation; not run. |
| `command-plan.json` | `8dd0ee6e817280eeb4884ba234ebdb0f733c5ef387f44a813838f44e3126d76a` | 19964 | 33 exact argv steps plus final command-ledger verifier. |
| `command-records.json` | `59520150c60b36c1c04069d880787174ba1bfdb23eaa7692fef3e655400a3e38` | 106 | Initial NOT_STARTED command ledger; mutable only during approved execution. |
| `packet-validation.json` | `85bb65903aa4c6ebf6d8eef514771a9529f715a27b92f5832911d3a0338ed524` | 1292 | Static packet validation only; no command-plan step executed. |
| `correction-gate-proposal.md` | `fd59fde35637bdbd1ee4e249d47f7623bf5ec854c038cce889a354c40d340800` | 9612 | Scope, preconditions, command matrix, review requirements, and stop rules. |
| `correction-preview.md` | `dee5376e98f85f9399dc7526be4fb123fa97260798830e90f329cf6664fc28b0` | 1186 | Human-readable summary of the exact proposed patch and helper change. |
| `correction-preview.patch` | `c18bbedd080ee13b46b8afb6fa599c6c39b79d203f1b0e1dc6602b226048ad89` | 5323 | Exact proposed edits to policy, scanner, and scanner test. |
| `decision-record.md` | `85052bd87da187735b9879d5814e30a299bf864ed70b51010a2424f743f9c414` | 1151 | Initial WAITING_HUMAN_APPROVAL decision record; mutable only to register decision. |
| `gauntlet-budget.json` | `e7b3a6d34299cea526f70914c1222722a7e140d18d2b9c81dcf35d91967908c4` | 203 | Bounded retries/reviewer policy. |
| `gauntlet-capabilities.json` | `125d936be78adeb8f1ca3f2cd3f46fc7fe373946038a117f7a47e76750cd6a86` | 461 | Sequential independent review requirement and known reviewer limits. |
| `gauntlet-goal.txt` | `19052e8e2b0b908959333ec5785c1efb7c488d3943a41bf956a5e34db368139f` | 442 | Exact C1H outcome and safety boundaries. |
| `historical-evidence-manifest.json` | `dacab6213bb74a3aa5b77b4a42b3a44697a33ab37e4e7fec8c1014f6b6604925` | 25844 | Read-only inventory of 110 C1E/C1F evidence files. |
| `historical-evidence.sha256` | `df7e4a8c0c9d70a4682c2038ebca4169b2db0a222b782f6da94fecfe735e10ff` | 15815 | Preservation hashes for the historical C1E/C1F files. |
| `quality-bar.json` | `dd92f97848c4271b111c1d915369a25f91fabd9a7fad68f6097e4e52d8d9cebb` | 14557 | Ten critical criteria and thresholds. |
| `source-baseline.json` | `43904ad041bd901ce30b16f84b62e33ba4409d79f4baaab2ca9fe46b651edaad` | 1159 | Five exact source hashes for fail-closed preflight. |

## Current limitations

- C1G ended at preflight and is preserved. Its approval does not transfer to C1H.
- A fresh-context C1H packet critique was requested and the service refused it with `agent thread limit reached`; no reviewer or report was created. This is not I1 or Final Critic for a C1H candidate.
- C1H still requires a fresh I1 review and a separate Final Critic on the same frozen candidate. If either is unavailable, record `UNAVAILABLE` and keep M07-S1 `FAIL / OPEN`.
- M07-S2/S3/S4 and M05 remain blocked; G21-5/G21-6 remain closed; production stays `NO_GO`.

Any change to this request or a frozen packet input requires a new hash-bound decision.
