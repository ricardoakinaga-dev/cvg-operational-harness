# Phase 4A evidence index — AAA-4A

This directory contains candidate-bound evidence for the controlled Phase 4A
build. The scope is synthetic and local. Production, unrestricted autonomy,
real data, real channels, credentials and real clinical, financial or
appointment actions remain `NO_GO`.

## Run order

1. `npm run test:phase4a` runs the conversation, adversarial, consumer,
   public Harness and disposable PostgreSQL tests when
   `TEST_DATABASE_URL` and `PHASE4A_DISPOSABLE_PG=1` are set.
2. `npm run verify:phase4a` executes structural assertions and the focused
   behavioral suite.
3. `npm run evidence:phase4a:golden` writes `GOLDEN_RESULTS.json` with 15
   scenarios, 45 language variants and 15 multi-turn trajectories.
4. `npm run evidence:phase4a:performance` writes
   `PERFORMANCE_RESULTS.json` and this run's local baseline.
5. `npm run certify:phase4a` binds the current source files, quality bar,
   checks and critic state to `CANDIDATE.json`, `RESULT.json` and the other
   JSON artifacts.
6. `npm run sentinel:phase4a` must be the final command after all candidate
   source changes. It verifies that the candidate digest and artifact hashes
   are unchanged at capture.

## Artifact map

| Artifact                             | Evidence role                                                           |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `CANDIDATE.json`                     | Current implementation file list, candidate digest and prompt binding.  |
| `QUALITY_BAR.json`                   | Frozen 17-criterion AAA-4A quality bar used by certification.           |
| `ACCEPTANCE_STATUS.json`             | Per-criterion controlled status, checks, environment and critic state.  |
| `EVIDENCE_GRAPH.json`                | Criterion to implementation and executable proof references.            |
| `PHASE4A_REQUIREMENTS_MANIFEST.json` | Candidate-bound quality-bar traceability.                               |
| `RESULT.json`                        | Decision, axis scores, checks, PostgreSQL status and limitations.       |
| `EVIDENCE_MANIFEST.json`             | Hash manifest for generated JSON and critic artifacts.                  |
| `GOLDEN_RESULTS.json`                | Machine-readable 15-scenario, 45-variant and 15-trajectory result set.  |
| `PERFORMANCE_RESULTS.json`           | Machine-readable local concurrency and delivery observations.           |
| `PERFORMANCE_BASELINE.md`            | Human-readable interpretation of the measured observations.             |
| `LEGACY_VALIDATION_20260917.json`    | Root, Phase 2/3, eval, chaos, audit and formatting verification record. |
| `critics/`                           | Fresh read-only architecture, adversarial and final review reports.     |
| `SENTINEL.json`                      | Clean-after-capture candidate and artifact integrity check.             |

## Proof coverage

The public tests cover bounded state, rules-first interpretation, typed model
fallback, corrections, references, side questions, approved knowledge,
handoff, Harness policy/capability/effect-journal routing, approval binding,
grounded responses, delivery replay, malformed and malicious content,
20-way in-memory contention, independent consumers, and 20-way PostgreSQL
turn/delivery contention. The PostgreSQL fixture also checks persisted rows,
forced RLS through a non-superuser role, stale execution lease recovery and
tenant/profile scope.

The effect journal adapter is read-only. Its operation key is the shared
immutable binding between the conversation proposal and the existing Harness
effect record; the two layers intentionally keep different proposal-hash
schemas. An expired conversation claim is recovered from a confirmed journal
record when available and becomes `UNCERTAIN` without a blind retry when it is
not. No production exactly-once or high-availability claim is made.

The final certification verdict is generated from the current artifacts and
must not be inferred from this index alone.
