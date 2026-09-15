# P1-2R remediation — limitations and residual risks

## Live legacy reservation is denied but not immediately marked UNCERTAIN

For a keyless (legacy) approval whose reservation lease is still active, the
recovery path denies `operation_uncertain` **without mutating the approval**:
the active reservation stays `RESERVED`/`EXECUTING` and keeps fencing
concurrent retries. This is deliberate — a live lease may still be owned by an
in-flight attempt, and forcing `UNCERTAIN` would break its `confirm()`. Once the
reservation TTL expires, the start-of-turn sweep marks the approval `UNCERTAIN`
(the existing legacy rule: absence under the derived candidate key is
`unknown`), after which explicit reconciliation is possible. The denial itself
already requires reconciliation.

## CONFIRMED replay is preserved for keyless approvals

If the journal under the resolved candidate key holds a `CONFIRMED` record for
the same proposal, a keyless approval still replays it. Replay is neither a
re-arm nor an effect execution, so it cannot duplicate the effect. However, for
a keyless record the resolved key may be the caller's current key rather than
the original caller key; the replay returns the confirmed result of that
journal identity. With the fixed runtime every new reservation persists its
key, so this shape only survives from pre-fix reservations.

## Multi-generation legacy corner (inherited, not closed here)

The tenant-wide sweep cannot distinguish a pre-fix approval whose older
generation left a no-effect record under the derived key from a newer
generation that left `EFFECT_STARTED` under a caller key, because the journal
has no list-by-`proposalHash` API. This package does **not** weaken or change
the sweep; the in-turn recovery paths are now stricter than the sweep (keyless
records never release/re-arm). Fully closing the sweep corner still requires
the journal list API or the per-generation key recorded upstream. Recorded in
`docs/04_audit/evidence/AAA/AAA-07/sweep-duplicate-fix/limitations.md`.

## Denial taxonomy

Recovery uncertainty uses the existing stable code `operation_uncertain`
(approval phase). The alternative `reconciliation_required` was not used
because it is not present in the runtime denial taxonomy; `operation_uncertain`
is the code already asserted by the P1-2 suites and the contract's "doubt =>
UNCERTAIN" rule.

A persisted key whose journal record is live `EFFECT_STARTED` or `RESERVED`
keeps the existing `operation_in_progress` fence (denied, tool 0, approval left
`EXECUTING`), exactly as the round-2 reviewer's P1-2 table recorded as PASS. An
expired `EFFECT_STARTED` lease resolves to `operation_uncertain` (marked
`UNCERTAIN`). Neither path re-executes.

## No migration of existing keyless approval records

The fix fails closed on keyless records; it does not backfill an
`operationKey` onto them. The approval engine is in-memory in this scope and no
SQL approval store exists to migrate. A durable approval store migration, if
ever needed, is out of scope.

## Evidence boundaries

- The RED log (`red-focused.log`) was captured before the fix with the same
  test semantics; the final file differs by a Prettier line-wrap of one
  assertion (formatting only) and by one extra test added afterwards
  (persisted journal bound to a foreign proposal). That extra test was already
  denied pre-fix through `journal.reserve` (`idempotency_key_reuse`) and is now
  denied `operation_uncertain` by the explicit ambiguity guard, so it is not
  part of the required RED set.
- The focused and full GREEN runs were executed after that formatting edit, so
  they bind to the hashes in `changed-hashes.txt`.
- Host is Node `v24.20.0` (target is Node 22); no target-Node re-run was
  performed in this package.
- The reviewer's frozen probe scripts were re-run unmodified. Before the sweep
  probe run, the probe's own stale scratch directory
  `/tmp/opencode/p1-review2-20260913T053543Z/p12-crash` was removed so the real
  crash child started from an empty journal; the probe does not clean it
  itself. No repository evidence file was modified.
- Full-suite baseline: 1577 passed / 57 skipped (round-2 review) -> 1585
  passed / 57 skipped here; the +8 are the new P1-2R tests and no skip was
  added.

## Status

`IMPLEMENTED_PENDING_INDEPENDENT_REVIEW`. No gate, DONE, certification,
production or Triplo AAA status is claimed. Production remains `NO-GO`.
Synthetic data only; no commit, push, deploy or `npm install`; tracking files
(`docs/99_runtime_state.md`, `docs/20_master_execution_log.md`,
`docs/30_backlog_master.md`, `docs/03_build/tracking/**`) were intentionally not
modified — the coordinator persists state from `manifest.json`.
