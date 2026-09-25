# AUD20-002 — Evidence Manifest

- program: `AUD-20260920-REAUDIT`
- run: `aud20-20260920-w1`
- task: `AUD20-002`
- status: `VERIFIED_LOCAL`
- bar: `QAUD20-v1`
- source: `docs/02_spec/aaa_quality_contract.md` §9.1; `A20-F02`
- implementation status: global/critical coverage and selected mutation guard
  verified locally
- environment: Node `v22.23.2`, synthetic local repository, no external services

## Expected artifacts

- `SPEC.md`
- `coverage-summary.json`
- `critical-coverage.json`
- `critical-coverage.log`
- `mutation-guard.json`
- `mutation-guard.log`
- `red-threshold.log`
- `focused-tests.log`
- `typecheck.log`
- `lint.log`
- `format-check.log`
- `diff-check.log`
- `verification-summary.json`
- `sha256sums.txt`

## Integrity

Artifact hashes are recorded in `sha256sums.txt` after the final focused
verification. A missing, stale or manually edited report is not evidence of
PASS.
