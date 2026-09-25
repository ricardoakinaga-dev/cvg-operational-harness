# AUD20-003 - Evidence Manifest

- program: `AUD-20260920-REAUDIT`
- task: `AUD20-003`
- finding: `A20-F03`
- status: `VERIFIED_LOCAL / PASS_LOCAL`
- bar: `QAUD20-v1`
- candidate: `49bd7d1d9f7e8a7469710718103c121c36bf916c468e2cc96c0b6d40be2092f9`
- run: `run-49bd7d1d9f7e-muabjtti`
- environment: Node `v22.23.2`, synthetic disposable PostgreSQL 16 at
  `127.0.0.1:55432`; no external services or real data

## Implementation

- `scripts/skip-catalog.json`
- `scripts/lib/skip-governance.mjs`
- `scripts/skip-inventory.mjs`
- `tests/skip-governance.test.js`
- `scripts/lib/certification-rules.mjs`
- `scripts/phase10-certify.mjs`
- `scripts/phase10-verify.mjs`
- `.prettierignore`

## Evidence

- `verification-summary.json` records the acceptance results.
- `sha256sums.txt` binds the summary to the candidate manifest, Phase 10
  result, raw test reports, coverage reports and gate logs in `certification/`.
- The raw artifacts remain in their canonical certification paths and carry the
  same run ID in the Phase 10 evidence matrix.

## Integrity rule

The current candidate is dirty by design because this repository carries the
controlled AUD19/AUD20 worktree. A later source change requires a new
candidate/run and invalidates this evidence; no historical AUD19 artifact was
rebound or overwritten.
