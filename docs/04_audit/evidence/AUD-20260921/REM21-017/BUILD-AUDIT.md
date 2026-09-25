# REM21-017 — BUILD / AUDIT

Data: 2026-09-22  
Findings: `A21-F19`, `A21-F22`, `A21-F23`, `A21-F26`  
Runtime: Node `22.23.2` / npm `10.9.8`  
Scope: local, synthetic, disposable; production remains `NO_GO`.

## BUILD

The controlled BUILD implemented the frozen plan:

- `scripts/check-doc-links.mjs` now recognizes `#fragment` and terminal
  `:line` metadata, scans the complete `README.md` + `docs` scope, and fails
  only for broken internals or unallowlisted absolute references;
- `docs/doc-link-policy.json` explicitly classifies the twelve historical
  absolute references. The eleven references in `critic-security.md` remain
  hash-bound and unchanged; the external skill citation in the pre-existing
  0562 report also remains unchanged;
- the two genuinely broken `PROD-04/report.md` links now resolve portably;
- `scripts/check-evidence-hygiene.mjs` and
  `docs/04_audit/evidence/empty-artifact-status.json` require status metadata
  for all 66 zero-byte evidence files and parse all non-empty JSONs;
- the zero-byte historical `probe-after.json` was not edited. Its adjacent
  sidecar records `capture_failed`, `exitCode=1`, `event=null`, and the
  preserved stderr/exit artifacts;
- `docs/99_operational_index.md` provides navigation to the authoritative
  ledgers without copying mutable status.

The pre-BUILD RED probe recorded 43 broken targets, 12 absolute references,
66 empty artifacts, 37 empty logs and a JSON parse failure. The independent
review identified that `critic-security.md` is manifest/sentinel-bound; its
bytes were restored before final certification. The first candidate-bound run
was therefore explicitly superseded, and all selected gates were rerun on the
stable final-2 candidate.

## AUDIT FRESCO

- run: `run-rem21-017-final-2`;
- candidate: `9efe1a104d4f77546c5d8f4c15f8bec0f4a4c5bb48844eb759e477f42e9d2bd6`;
- candidate reconciliation: 1,380 recorded files, 1,380 current files, zero
  drift;
- docs scan: `broken=0`, `unallowlistedNonPortableAbsolute=0`, twelve
  explicitly classified historical non-portable references;
- evidence hygiene: 66/66 empty artifacts catalogued and 382 non-empty JSONs
  parsed;
- fixtures: 1 file, 4 tests passed, including positive `:line`/fragment and
  negative missing/absolute cases;
- full regression: 300 files passed, 20 governed skips; 2,105 tests passed,
  146 governed skips, zero failures;
- static gates: typecheck, lint, format, docs/hygiene and diff all PASS;
- candidate-bound log hashes and superseded-run record: `ci-bar-summary.json`;
- full verification record: `verification-summary.json`.

The selected-gate run does not claim full CI-bar finalization, freeze, external
validation or production readiness. Historical absolute references remain
visible in the checker output and are blocked if a future one is not added to
the explicit policy after review.

## DECISÃO

`REM21-017 = VERIFIED_LOCAL / FINAL_CERT_DEFERRED`.

The documentation checker, evidence hygiene contract, historical link repair
and derived index meet the local acceptance criteria without fabricating old
events or rewriting bound evidence. No real data, external service, clinical,
financial, record, appointment or other sensitive action was executed.
Production remains `NO_GO`; G21-5/G21-6, I1, signoff and REM21-019 remain
open. The next singular task is Discovery → PRD → SPEC for `REM21-018`.
