# P1-2R adversarial scenario — keyless legacy recovery must fail closed

## Finding closed by this package

`docs/04_audit/evidence/AAA/P1-independent-review-round2/REVIEW.md` §8 (P1-2R,
`review.json` findings[0]): an approval record persisted **without** an
`operationKey` (pre-P1-2 migration state, or a direct engine caller that omits
the field) that is retried with a changed/absent caller idempotency key while
its reservation lease is still ACTIVE was re-armed by
`#recoverActiveReservation` and the tool re-executed. The original
`EFFECT_STARTED` journal record under the caller key was silently orphaned and
a new record under the derived key was created and confirmed. The same
asymmetry existed in `#recoverExpiredReservation` for the TTL window.

Reviewer repro (pre-fix): `probes/p12-legacy-active-repro.ts` and
`probes/p12-sweep-operation-key.ts` (scenario `legacy-crash+active-lease+changed-key-B`)
-> `executed`, tool 1, journal A `EFFECT_STARTED` orphaned, journal B
`CONFIRMED`. Contract `docs/02_spec/aaa_execution_contract.md:118`: only proof
of absence returns to `APPROVED`; doubt -> `UNCERTAIN`.

## Attack re-executed in this package

1. A governed execution turn reserves the approval with caller key A, reaches
   `journal.markEffectStarted`, performs a synthetic effect and the process
   dies (real child crash, `exit 99`) before `confirmEffect`.
2. The persisted approval is migrated by deleting `operationKey` (the exact
   pre-fix shape). Journal A is left `EFFECT_STARTED`.
3. The retry presents a **changed** caller key B (or no key at all) while the
   reservation lease is still active.
4. Pre-fix: the recovery recomputed key B, found no journal record under B,
   released the approval to `APPROVED`, created journal B and re-executed the
   tool -> duplicate effect.
5. Post-fix: recovery resolves the durable identity first. With no persisted
   key there is no identity proof, so it denies `operation_uncertain` and the
   journal is not touched; with a persisted key it denies unless the lookup
   under that key proves no effect.

## Fail-closed chain implemented

`packages/agent-runtime/src/runtime.ts`:

- `#recoverExpiredReservation`:
  - journal lookup failure -> `operation_uncertain` (expired reservations are
    also marked `UNCERTAIN`); absence is never inferred as no-effect.
  - `UNCERTAIN`/expired `EFFECT_STARTED` -> mark `UNCERTAIN`, deny.
  - live `EFFECT_STARTED` -> fall through; the reserve path fences it without
    re-arming.
  - expired reservation + absent/`ABANDONED` record: release is allowed only
    with a persisted key and (for absent) an approval that never reached
    `EXECUTING`; a keyless approval or an `EXECUTING` approval without a record
    denies `operation_uncertain`.
- `#recoverActiveReservation`:
  - reads the journal under the resolved key before any reserve/re-arm.
  - keyless record: `CONFIRMED` replays (no new effect); every other state
    denies `operation_uncertain` without a journal mutation.
  - persisted key: `EFFECT_STARTED`/`RESERVED` -> `operation_in_progress`;
    `UNCERTAIN` -> mark `UNCERTAIN` + deny; absent + `EXECUTING` -> deny
    `operation_uncertain`; `CONFIRMED` -> reserve replays; absent + never
    `EXECUTING` or `ABANDONED`/`EFFECT_FAILED` -> re-arm allowed and the
    persisted key is reused for journal and outbox.
- `#denyRecoveryUncertain` centralizes the denial (`operation_uncertain`) and
  only marks the approval `UNCERTAIN` when the reservation can no longer make
  progress.

The TTL sweep (`approvalSweepEvidence`, `collectApprovalSweepEvidence`) is
unchanged; its behavior is asserted by the existing suites plus the reviewer's
own probes re-run in this package.

## Scenario matrix (post-fix)

| #   | Approval key  | Journal under resolved key                  | Lease   | Retry  | Outcome                                            | Tool | Journal                               |
| --- | ------------- | ------------------------------------------- | ------- | ------ | -------------------------------------------------- | ---- | ------------------------------------- |
| 1   | none (legacy) | absent (effect under caller key A)          | active  | key B  | denied `operation_uncertain`                       | 0    | A unchanged, B absent                 |
| 2   | none (legacy) | absent (effect under caller key A)          | active  | absent | denied `operation_uncertain`                       | 0    | A unchanged, B absent                 |
| 3   | A persisted   | `EFFECT_STARTED`                            | active  | key B  | denied `operation_in_progress`                     | 0    | A `EFFECT_STARTED`                    |
| 4   | A persisted   | absent, status `RESERVED` (never EXECUTING) | active  | key B  | executed exactly once                              | 1    | A `CONFIRMED`, B absent, outbox key A |
| 5   | none (legacy) | absent (effect under caller key A)          | expired | key B  | denied `operation_uncertain`; approval `UNCERTAIN` | 0    | A `UNCERTAIN` (swept), B absent       |
| 6   | A persisted   | absent, status `EXECUTING`                  | active  | key B  | denied `operation_uncertain`                       | 0    | A absent                              |
| 7   | none (legacy) | lookup failure                              | any     | key B  | denied `operation_uncertain`                       | 0    | untouched                             |

Rows 1, 2, 5, 6 are the regression matrix in
`packages/agent-runtime/src/__tests__/runtime-legacy-rearm.test.ts`; rows 3, 4
are the positive controls; row 7 covers the lookup-failure rule.

## Independent probes re-run (reviewer artifacts, frozen)

- `docs/04_audit/evidence/AAA/P1-independent-review-round2/probes/p12-legacy-active-repro.ts`
  -> exit 0; `legacy` and `legacy-absent-key` denied `operation_uncertain`,
  tool 0, journal A `EFFECT_STARTED` unchanged, `effectsLogGrew: false`.
- `.../probes/p12-sweep-operation-key.ts` -> exit 0; 9/9 scenarios
  `invariantHeld`, real crash child status 99, `effects.log` unchanged
  (7 -> 7 bytes), summary `failed: 0, falsified: false`.

## Non-goals preserved

- The TTL sweep semantics and the persisted-key positive paths are unchanged.
- No approval-engine, persistence, channel or tracking file was modified.
- Replay of an existing `CONFIRMED` record is preserved (it cannot duplicate
  an effect); it is not a re-arm.
- The multi-generation legacy corner documented in
  `docs/04_audit/evidence/AAA/AAA-07/sweep-duplicate-fix/limitations.md`
  remains out of scope for the tenant-wide sweep (no journal list-by-proposal
  API).
