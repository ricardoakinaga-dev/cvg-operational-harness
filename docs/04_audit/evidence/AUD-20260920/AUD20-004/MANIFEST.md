# AUD20-004 - Evidence Manifest

- program: `AUD-20260920-REAUDIT`
- task: `AUD20-004`
- finding: `A20-F13`
- status: `VERIFIED_LOCAL / PASS_LOCAL`
- bar: `QAUD20-v1`
- candidate: `6b34fefb169823b3be9ef7febb7e6d05c41e0d564d644a1d93451de340f3e38d`
- run: `run-6b34fefb1698-muad6372`
- environment: Node `v22.23.2`, synthetic disposable PostgreSQL 16 at
  `127.0.0.1:55432`; no external services or real data

## Implementation

- `scripts/phase4a-gate-identity.mjs`
- `tests/phase4a-gate-identity.test.ts`

## Evidence

- `verification-summary.json` records the exact-cardinality contract and all
  focused/integrated results.
- `sha256sums.txt` binds the summary to the candidate manifest, Phase 10
  result, raw reports, coverage reports and gate logs in `certification/`.
- The frozen Phase 4A anchor remains historical and unchanged:
  `6185c586e3820665faa5b735ec27f7395d01fa15c1e9199263023bb52dbba73e`.

## Integrity rule

The candidate is dirty by design because this repository carries controlled
AUD19/AUD20 work. Any later source change requires a new candidate/run; the
historical Phase 4A anchor is never rebound.
