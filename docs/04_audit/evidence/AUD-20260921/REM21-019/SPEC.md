# REM21-019 — SPEC

Date: 2026-09-22  
Status: `SPEC_APPROVED_CONTROLLED_BUILD`

## Implementation contract

1. Extend the existing findings governance with a candidate/run-bound closure
   registry at `docs/04_audit/evidence/AUD-20260921/REM21-019/finding-closure.json`.
2. The registry must include the authoritative source path and SHA-256, the
   current candidate ID, current run ID, a complete one-to-one set of
   `A21-F01`…`A21-F26`, a status (`CLOSED_LOCAL`, `EXTERNAL_BLOCKED` or
   `OPEN_INTERNAL`), owner/task, rationale and at least one local evidence
   reference for every non-open entry.
3. Every evidence reference must be a relative repository path, exist at
   evaluation time, and match its recorded SHA-256 and size. The registry must
   fail closed on omissions, duplicates, unknown IDs, source/candidate/run
   mismatch, unsupported statuses, missing evidence or changed bytes.
4. `computeCurrentFindings` must preserve all 26 entries in `allFindings`,
   calculate closure scores from the registry, and expose only unresolved
   internal P0/P1 entries to the mechanical blocker projection. External and
   production constraints remain explicit metadata and cannot become GO.
5. `verifyComputedFindings` must re-read and validate the registry, source and
   evidence hashes and reject a stale registry. Existing negative tests for
   manual P0 removal, score tampering, freshness and candidate/run mismatch
   must continue to pass.
6. Add focused tests for a valid mixed local/external/open registry and for
   every rejection class. No test may use real credentials or external data.

## Execution protocol

The controlled run uses the existing `scripts/ci-bar.mjs` contract:

1. Use Node `v22.23.2`/npm `10.9.8` and initialize one explicit run ID.
2. Start one disposable PostgreSQL 16 container on loopback only; export
   `TEST_DATABASE_URL` and a required PostgreSQL flag for the run.
3. Run all gates in the declared order, including the runtime image and proof
   gates. Capture logs under an external artifact directory and preserve the
   repository certification outputs for the dossier.
4. After the candidate is initialized and before certification, write the
   closure registry with the exact candidate/run/source identities and current
   evidence hashes. Do not alter candidate-scoped files after that point.
5. Run `certify`, `certification:verify`, verifier self-test and `diff`/artifact
   finalization. If any gate fails, diagnose and repair only before a new
   freeze; never edit a report to pass.
6. Run a fresh read-only I1 critic against the frozen manifest. If no valid
   report returns within bounded attempts, record `I1_NOT_RUN` and cap the
   result; do not call that a PASS.
7. Record a sentinel over the candidate manifest, code/test/config hashes,
   image manifest and closure registry. Any changed candidate byte requires a
   new run.

## Expected blockers

- External provider/channel/identity and human signoff are deliberately not
  validated; production remains `NO_GO`.
- A21-F05/F06 and residual production portions of other findings remain
  externally constrained even if their local controls pass.
- A21-F20 requires an independent fresh I1 review. A bounded critic failure is
  evidence of missing acceptance, not evidence of cleanliness.
- Browser availability is evaluated from the declared local Playwright setup;
  missing browser binaries must fail/limit the gate rather than be hidden.

## SPEC gate

`SPEC_APPROVED_CONTROLLED_BUILD`. No external or production authority is
required for this local build. The next action is BUILD/AUDIT execution.
