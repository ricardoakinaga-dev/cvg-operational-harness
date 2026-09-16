# P1-2 adversarial scenario — duplicate effect after crash + TTL with a caller key

## Attack (confirmed by the independent reviewer)

1. The caller presents `idempotencyKey = A`. The governed execution turn reserves
   the approval and creates the durable journal intent under
   `operationKey = sha256({tenantId, callerIdempotencyKey: A})`.
2. The process crashes **after `journal.markEffectStarted`** (the tool may have
   executed) and before confirmation.
3. The approval reservation lease expires by TTL.
4. Pre-fix, the TTL sweep recomputed the operation key **without** the caller key
   (it was not persisted on the approval), found no journal record under the
   derived key, inferred `no_effect` and released the approval to `APPROVED`.
5. A retry with the same approval and a **changed/absent** caller key B derived a
   new `operationKey`, created a second journal intent and executed the tool
   again -> duplicate effect, with the original `EFFECT_STARTED` record silently
   orphaned.

Pre-fix RED evidence (test 1, `red-focused.log`): the retry outcome was
`executed` (tool re-run) where the contract requires `denied` /
`operation_uncertain`.

## Post-fix fail-closed chain

1. The runtime computes the operation key before `approvals.reserve` and the
   engine persists it on the approval (`operationKey`), exposing it on the record
   and on `ApprovalReservation`. The same value is used for
   `journal.reserve` / `markEffectStarted` / `confirmEffect` and for the outbox
   `idempotencyKey`.
2. The TTL sweep resolves the journal key from `approval.operationKey` (the
   persisted key wins) instead of recomputing it.
3. `EFFECT_STARTED`, `UNCERTAIN`, `CONFIRMED`, an unverifiable binding, or a
   lookup failure produce `unknown` evidence; the engine transitions the
   approval to `UNCERTAIN`, never to `APPROVED`.
4. A retry that presents key B (or no key) resolves `record.operationKey = A`,
   sees `UNCERTAIN` and denies with `operation_uncertain`; the tool and outbox
   are never called. Even before the TTL drain the same resolution makes the
   journal `reserve(A)` return `in_progress`, so concurrent changed-key retries
   are fenced with `operation_in_progress`.
5. Legacy approvals with no persisted key and no positive journal proof produce
   `unknown`; absence under a recomputed candidate key is never treated as proof
   of absence.

## Case matrix (all exercised by the new suites)

| Persisted key? | Journal under resolved key              | Approval state at expiry   | Evidence    | Outcome                                          |
| -------------- | --------------------------------------- | -------------------------- | ----------- | ------------------------------------------------ |
| yes (A)        | absent                                  | RESERVED (never EXECUTING) | `no_effect` | release to APPROVED; persisted key retained      |
| yes (A)        | absent                                  | EXECUTING                  | `unknown`   | UNCERTAIN, no release                            |
| yes (A)        | RESERVED / ABANDONED / EFFECT_FAILED    | any                        | `no_effect` | release to APPROVED (retry allowed, effect <= 1) |
| yes (A)        | EFFECT_STARTED / UNCERTAIN / CONFIRMED  | any                        | `unknown`   | UNCERTAIN, no release                            |
| yes (A)        | record with mismatched proposalHash     | any                        | `unknown`   | UNCERTAIN, no release                            |
| yes (A)        | lookup throws                           | any                        | no evidence | UNCERTAIN, no release                            |
| no (legacy)    | absent under derived candidate          | any                        | `unknown`   | UNCERTAIN, no release (never APPROVED)           |
| no (legacy)    | no-effect proof under derived candidate | any                        | `no_effect` | release to APPROVED                              |
| no (legacy)    | EFFECT_STARTED / UNCERTAIN / CONFIRMED  | any                        | `unknown`   | UNCERTAIN, no release                            |

## Adversarial checks performed

- Retry with changed key B after crash + TTL under persisted key A: denied
  `operation_uncertain`, journal A left `UNCERTAIN`, tool/outbox count 0
  (`runtime-sweep-operation-key.test.ts`, test 2).
- Retry with **absent** key after the same crash: denied `operation_uncertain`,
  tool/outbox count 0 (test 3).
- Legacy approval with no persisted key and an empty journal: sweep counters
  `{released: 0, uncertain: 1}` (test 6).
- Positive controls: persisted key + absent journal + never EXECUTING releases
  with the key retained (test 4); persisted key with a no-effect proof releases
  and a retry with a different caller key executes exactly once under the
  persisted key, with the outbox `idempotencyKey` equal to it (test 7).
- Engine-level: a later generation cannot rebind the approval to a different
  key (`proposal_mismatch`, no mutation); `unknown` evidence never releases;
  the key survives CAS transitions (confirm/release/uncertain) and generations
  (`approval-operation-key.test.ts`).
