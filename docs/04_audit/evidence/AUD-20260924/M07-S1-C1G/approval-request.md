# Human decision request — M07-S1-R1-C1G

**State:** `WAITING_HUMAN_APPROVAL`  
**M07-S1:** `FAIL / OPEN`  
**Production:** `NO_GO`

## Decision requested

Please approve or request corrections to the exact packet listed below. To authorize C1G, answer **“Approve M07-S1-R1-C1G”**. A general approval phrase without this gate ID and packet reference is not recorded as authorization.

The latest phrase “aprovo este gate” arrived before these C1G packet bytes were prepared and contains no C1G hash reference. The earlier C1F approval remains limited to the completed C1F run. C1G has not been approved or executed.

## Exact scope authorized by this proposal

- Editable code/config/test paths after approval: `config/workspace-dependency-policy.json`, `scripts/workspace-dependency-audit.mjs`, and `tests/workspace-dependency-audit.test.js` only.
- `packages/conversation/src/__tests__/postgres-store.unit.test.ts` is snapshot-only and must remain byte-identical.
- Evidence output: `docs/04_audit/evidence/AUD-20260924/M07-S1-C1G/` only.
- Gauntlet state: archive the finished C1F `.gauntlet/` directory, only after the exact state, absent archive target, and free writer-lock preconditions pass, to `.gauntlet-archive/m07-s1-c1f-20260924-finished-fail/`; then initialize C1G at `.gauntlet/`.
- Commands: the 33 individually named steps and one final verifier in `command-plan.json`. All execute individually through `capture_command.py`. npm is offline and the listed PostgreSQL environment variables are removed.
- Candidate expectation: 977 inputs and the four approved R1 additions; fingerprint is unknown until the authorized freeze.
- Quality bar: ten critical criteria in `quality-bar.json`; statements ≥90%, branches ≥85%, functions ≥90%, lines ≥90%; separate I1 and Final Critic required.

Approval does not accept M07-S1, authorize S2/S3/S4 or M05 execution, open G21-5/G21-6, permit real data or external activity, or release production. Missing or failed criteria keep M07-S1 `FAIL / OPEN`.

## Hash-bound packet

SHA-256 values below identify the exact review bytes. The two mutable records are frozen here at their initial state and may change only as authorized output: the decision record after the human response, and the command ledger during a separately approved C1G run.

| File | SHA-256 | Bytes | Role |
| --- | --- | ---: | --- |
| `capture_command.py` (frozen input) | `f8874d5a804a8075925a184450f5cb1e6602ef9104b299dff3533aa529dd3975` | 9336 | Allowlisted per-command provenance recorder; not run. |
| `command-plan.json` (frozen input) | `cbabcb2840d0b827990d83d6cc3390cf3d9b7e2444e8c78b134cd02d1499b2cf` | 19964 | 33 named argv steps plus final integrity verifier. |
| `command-records.json` (mutable execution record) | `48d5b8b5ad9e584bb61066fd9ca30957aa476acaca1cca964f188b2b5e3b9d77` | 106 | Initial NOT_STARTED command ledger; changes only during an approved C1G execution. |
| `correction-gate-proposal.md` (frozen input) | `e8c5752dd9d5555a5a06885b457fba0ff429cdf41432263499f28585e22f7428` | 8354 | Scope, preconditions, command matrix, review requirements and stop rules. |
| `correction-preview.md` (frozen input) | `c954d576c7a7103ab2a1a278e692170f8d6adf8c36328aaab0d7b0c7c75ed3e0` | 767 | Human-readable summary of the exact patch. |
| `correction-preview.patch` (frozen input) | `0fe21c2b958e376c734908411143e4e8cae5b80ab4384f05725ed54021f96690` | 5323 | Exact proposed edits to policy, scanner and scanner test. |
| `decision-record.md` (mutable decision record) | `d6549098297f4f36315ad470c01acf7b8182cb23c866bce97cb76dc691e726a4` | 992 | Initial WAITING_HUMAN_APPROVAL state and packet-review attempt; updated only to record the user decision. |
| `gauntlet-budget.json` (frozen input) | `e7b3a6d34299cea526f70914c1222722a7e140d18d2b9c81dcf35d91967908c4` | 203 | Bounded retry and reviewer concurrency policy. |
| `gauntlet-capabilities.json` (frozen input) | `e29756bc57320415ceed4e16bb3934b5d3b66dd86ff9ffe9ab601e971c6c547c` | 461 | Sequential fresh-context review requirement and observed reviewer unavailability. |
| `gauntlet-goal.txt` (frozen input) | `a444cff8a586d5762ebb9a933d15e02f1765fbea593c639e064ad63325aca32d` | 442 | Exact C1G outcome and safety boundaries. |
| `historical-evidence-manifest.json` (frozen preservation baseline) | `dacab6213bb74a3aa5b77b4a42b3a44697a33ab37e4e7fec8c1014f6b6604925` | 25844 | Read-only inventory of 110 regular files across C1E/C1F; no symlinks found. |
| `historical-evidence.sha256` (frozen preservation baseline) | `df7e4a8c0c9d70a4682c2038ebca4169b2db0a222b782f6da94fecfe735e10ff` | 15815 | SHA-256 checks for the historical C1E/C1F files. |
| `quality-bar.json` (frozen quality bar) | `7ab86e4d0ea1f73bbc8ca88c114af4cce3b4beabccd7e5cc04195a3223e57520` | 14208 | Ten frozen critical C1G criteria; thresholds remain 90/85/90/90. |
| `source-baseline.json` (frozen source baseline) | `b319c3d1b7c469b266bfec00a2a7a1c566ae1c259b019731f0d012e4cf6e54e2` | 1159 | Five exact source/baseline hashes for fail-closed preflight. |

## Current blockers

- C1F ended `FAIL / OPEN`: C1F-05 provenance is partial and C1F I1 was unavailable after `agent thread limit reached`.
- A fresh-context, read-only critique of this C1G packet was attempted; the service refused the spawn with `agent thread limit reached`. No packet review report exists.
- No separate Final Critic report exists for C1F.
- C1G still requires a fresh I1 and a separate Final Critic on the same final candidate. If either is unavailable, record `UNAVAILABLE` and keep M07-S1 open.
- M07-S2/S3/S4 and M05 remain blocked; G21-5/G21-6 remain closed.

The approval request file itself is identified by the SHA-256 presented with this request. Any change to this request or a frozen packet file requires a new hash-bound decision.
