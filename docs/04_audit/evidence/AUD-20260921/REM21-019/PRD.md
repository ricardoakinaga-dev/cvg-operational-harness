# REM21-019 — PRD

Date: 2026-09-22  
Task: freeze and re-audit the complete local candidate  
Decision boundary: local controlled candidate only; production remains `NO_GO`

## Problem

The remediation tasks have local evidence, but each task was run on a different
candidate/run and the authoritative A21 inventory still needs a fresh closure
projection. A release-shaped conclusion is unsafe until the complete bar,
candidate identity, raw artifacts, findings and verifier all agree.

## Desired outcome

Produce one immutable local evidence dossier for one candidate and one run that
records:

1. all executable local gates and their raw outputs;
2. global/critical coverage, mutation, eval, skip, PostgreSQL, chaos, load,
   restore/rollback, browser/E2E, image, SBOM, licenses and security results;
3. source, runtime, image and artifact digests with candidate/run binding;
4. a re-derived status for all 26 A21 findings, distinguishing local closure,
   unresolved internal work and external/production constraints;
5. offline verifier and negative self-test evidence; and
6. an independent fresh-context I1 attempt and an immutable sentinel result.

## Acceptance criteria

| ID | Criterion | Required evidence |
| --- | --- | --- |
| REM21-019-AC1 | Discovery, PRD and SPEC are recorded before BUILD | This dossier and ledger transition |
| REM21-019-AC2 | All required local gates run on Node 22 and same candidate/run | CI-bar state, gate logs and final manifest |
| REM21-019-AC3 | Coverage meets >=90% statements/lines/functions and >=85% branches; critical coverage and mutation guard pass their current contracts | coverage and critical/mutation artifacts |
| REM21-019-AC4 | Integrated eval meets its sealed threshold; skips are known, catalogued and not hidden/expired/required | eval report and skip inventory |
| REM21-019-AC5 | Disposable PostgreSQL and browser suites execute rather than silently skip | PostgreSQL, proof, E2E and browser-proof artifacts |
| REM21-019-AC6 | Runtime image is non-root, smoke-tested, SBOM/license/security checked and tied to the same candidate/run | image manifest, image gate, SBOM/license/security logs |
| REM21-019-AC7 | Findings are re-derived from the authoritative source and any local closure is backed by source/candidate/run/evidence hashes | closure registry, computed findings and verifier output |
| REM21-019-AC8 | Offline verifier rejects stale, tampered and mixed-candidate evidence | `certification:verify`, self-test and negative-validation artifact |
| REM21-019-AC9 | No valid fresh I1 result is invented; any missing I1 or human signoff caps the verdict and keeps production `NO_GO` | I1 attempt report, sentinel and decision record |

## Non-goals and safety constraints

- No external gate is opened. G21-5/G21-6 remain closed.
- No production worker, provider, channel, IdP, secret manager or real data is
  contacted.
- No appointment is confirmed, cancelled or rescheduled; no clinical,
  financial or definitive-record action is executed.
- A local pass is not a production qualification. Local PostgreSQL and image
  evidence are disposable and explicitly limited.
- A dirty worktree is acceptable only when every candidate byte is captured in
  the manifest; it is not represented as a clean checkout.
- A critic may read the frozen dossier but may not edit the candidate or write
  `.gauntlet/` state. Any candidate mutation invalidates the freeze.

## Decision policy

The result may be `CONDITIONAL_GO` for the controlled local candidate only if
all local gates and the candidate-bound verifier pass, with external gates and
human signoff clearly pending. It cannot be `GO`; production remains `NO_GO`.
Any local gate failure, open internal P0/P1-high finding, stale/tampered
closure, candidate drift or missing required evidence yields `NO_GO`.

`I1_PENDING` is a separate final-certification blocker even when all local
mechanical gates pass. The final report must distinguish mechanical result,
I1 result, external result and production decision.

## PRD gate

`PRD_COMPLETE`. BUILD remains controlled by the SPEC and by the explicit
closure registry contract below.
