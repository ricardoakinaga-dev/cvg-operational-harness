# REM21-017 — SPEC

Data: 2026-09-22  
Status: `SPEC_APPROVED_CONTROLLED_BUILD`  
Contract: `rem21-017-v1`  
Runtime: Node `22.23.2`  
Scope: local, synthetic, disposable; no production or external service.

## Frozen file plan

### S17-LINKS — parser and full scan

Edit `scripts/check-doc-links.mjs` only. Add a small `parseTarget` seam that:

- removes a Markdown fragment after preserving the source target;
- recognizes a terminal positive decimal `:line` suffix and strips it only for
  filesystem resolution;
- classifies `/absolute/path:line` as `nonPortableAbsolute` without treating
  it as an internal broken link;
- preserves the current exit contract and JSON keys.

Change `package.json` `docs:check-links` to invoke `README.md docs`. Load the
versioned `docs/doc-link-policy.json`; a known hash-bound historical absolute
is reported as `policy=historical-preserved`, while an unclassified absolute
fails the gate. No link outside the checkout may be silently treated as
portable.

### S17-PORTABLE — historical references

Fix only the two relative targets in
`docs/04_audit/evidence/PROD-20260913/PROD-04/report.md`. Keep the eleven
absolute repository links in the hash-bound critic artifact and the one
external skill link in the historical 0562 report unchanged; register their
exact suffixes and reasons in `docs/doc-link-policy.json`. A new absolute link
must fail until explicitly reviewed and catalogued.

### S17-HYGIENE — empty evidence contract

Add `scripts/check-evidence-hygiene.mjs` with an optional evidence root and a
central manifest at `docs/04_audit/evidence/empty-artifact-status.json`.
The checker walks evidence files, requires every zero-byte file to have exactly
one manifest record, requires fields `status`, `command`, `exitCode`,
`timestamp`, `environment`, `reason`, and parses every non-empty `.json`.
Allowed statuses are `capture_missing`, `capture_failed` and `expected_empty`;
unknown historical metadata uses `null`, never a guessed success.

Add `docs/04_audit/evidence/AAA/AAA-07/rework-fencing-c6/probe-after.json.status.json`
with `status=capture_failed`, `exitCode=1`, `event=null`, and references to the
preserved stderr/exit artifacts. Do not alter the zero-byte JSON.

Wire `evidence:check-hygiene` into `docs:check-links` after the full link scan,
and add a Node test that exercises both checks in temporary fixtures. The
central manifest is the status sidecar for legacy empties, so no empty artifact
is silently interpreted as PASS.

### S17-INDEX — derived operational index

Add `docs/99_operational_index.md`. It contains only links to the three master
sources, the active backlog/task evidence, the historical evidence root and the
generation/interpretation rule. It must not copy mutable status values. The
file is a navigation aid, not a source of truth.

## Compatibility constraints

- keep `broken` and `nonPortableAbsolute` output fields and exit semantics;
- no changes to historical raw bytes except the two explicitly broken Markdown
  links; hash-bound absolute references remain byte-for-byte intact;
- no generated status may claim a successful command when metadata is absent;
- no tests are skipped, weakened or reclassified;
- no production, network, real data or sensitive action.

## Verification matrix

| gate | command | expected |
| --- | --- | --- |
| RED/GREEN checker fixtures | `npm test -- tests/docs-check-links.test.js` | pass, negative cases assert non-zero |
| full docs scan | `npm run docs:check-links` | pass; `broken=[]`, hygiene pass |
| direct hygiene | `npm run evidence:check-hygiene` | pass; all empties catalogued, JSON valid |
| static | `npm run typecheck && npm run lint && npm run format:check && git diff --check` | pass |
| docs | `npm run docs:check-links` | no broken internal links |

## Rollback

The code seam, package command, test, index and evidence catalog are
independently revertible. Historical empty files remain untouched; reverting
the task removes only their metadata/catalog and restores the known RED. Do not
reset or clean the user worktree.

## Acceptance

The SPEC is satisfied only when the complete scan is green, the known relative
links are fixed, absolute machine references are either explicitly
`historical-preserved` or fail the gate, every empty evidence file has explicit
status metadata, all non-empty JSON parses, and the derived index points to the
authoritative ledgers.
