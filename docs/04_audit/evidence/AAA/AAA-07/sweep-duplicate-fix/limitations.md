# P1-2 remediation — limitations and residual risks

## Legacy approvals without a persisted operationKey

The fix persists `operationKey` whenever the governed runtime reserves an
approval. Approvals reserved before this change (or reserved by direct engine
callers that omit the field) have no persisted key. For those:

- The tenant-wide TTL sweep is fail-closed: an absent record under the
  recomputed candidate key produces `unknown`, the engine marks `UNCERTAIN`,
  and the approval is **never** released to `APPROVED` by inference. A record
  that proves no effect (RESERVED/ABANDONED/EFFECT_FAILED, matching
  `proposalHash`) still allows a release.
- Multi-generation corner: a pre-fix approval whose older generation left a
  no-effect record under the derived candidate key while a newer generation
  used a caller key and left `EFFECT_STARTED` cannot be distinguished by the
  sweep, because the approval carries no key and the journal has no
  "list by proposalHash" API. The sweep would release on the derived-key proof
  while the caller-key record is `EFFECT_STARTED`. This state is only reachable
  from reservations created before this fix; reservations made by the fixed
  runtime always persist the key of the active generation. Fully closing it
  requires the journal list API (out of scope, previously recorded in
  `sweep-callsite/limitations.md`) or the per-generation key now persisted.
- Two in-turn recovery fallbacks are not hardened by this task and remain
  fail-open for a _legacy_ approval whose caller changes the idempotency key:
  `#recoverExpiredReservation` (expired reservation with an absent journal may
  release) and `#recoverActiveReservation` (active reservation with an absent
  journal may re-arm under the recomputed key). Both only run **after** the
  start-of-turn approval sweep has declined to act, which happens when the
  reservation is still active or was not swept; for any approval reserved by
  the fixed runtime the persisted key is always resolved first, so these paths
  are unreachable with a changed key. Closing them for direct-engine legacy
  records would require an identity proof the approval does not carry.

## No key rotation on re-reservation

A reservation that already has a persisted `operationKey` rejects a later
reserve with a different key (`proposal_mismatch`, no mutation). A genuinely new
operation identity requires a new approval (contract E-4). Silent key
rotation is intentionally forbidden because it would reopen the duplicate
window.

## operationKey validation is additive, not format-locked

`ApprovalReserveSchema` validates the field as a trimmed, non-empty string of at
most 200 characters. It deliberately does not enforce the runtime's
`op:<sha256>` shape so existing external callers can persist their own stable
operation identity without a breaking change. The governed runtime always
passes the canonical `op:<64 hex>` value.

## CONFIRMED journal with an expired approval

If the journal reached `CONFIRMED` (effect happened) but the approval expired
before `approval.confirm`, the sweep produces `unknown` and marks the approval
`UNCERTAIN` rather than auto-completing the confirmation. This is the
pre-existing, contract-acceptable behavior (`UNCERTAIN -> EXECUTED` requires
explicit reconciliation); this task did not add an automatic confirm path.

## Persistence and worker scope

- No persistence, channel, shared or tracking package was touched; the approval
  engine is in-memory in this scope and no SQL approval store exists to migrate.
- `sweepExpiredApprovals` is still only called at governed turn start; the
  periodic worker wiring remains AAA-19's scope. Multi-tenant iteration,
  scheduling and backoff remain the caller's responsibility.
- Multi-process approval consistency is bounded by the approval store
  implementation; this fix changes only the identity of the journal lookup.

## Evidence and baseline

- The assignment's stated full-suite baseline (1544 passed / 57 skipped) was not
  reproducible in the current dirty working tree; the measured pre-change
  baseline is 1563 passed / 57 skipped (final 1577 minus the 14 tests added
  here). Concurrent AAA lanes account for the difference. Every run has zero
  failures and no skip was added.
- The RED log covers the six scenarios that existed before the final
  absent-key variant was added; the variant exercises the same pre-fix code
  path as the persisted changed-key scenario.
- Synthetic data, controlled fakes only. No commit, push, deploy or npm
  install was performed. `docs/99_runtime_state.md`,
  `docs/20_master_execution_log.md` and `docs/30_backlog_master.md` were not
  updated because this task's evidence scope excludes them; the coordinator
  persists state/log/backlog from `manifest.json`.
- Independent review is still required
  (`IMPLEMENTED_PENDING_INDEPENDENT_REVIEW`); no gate, DONE, certification,
  production or Triplo AAA status is claimed.

## Timestamp errata from the previous package

The previous P2-1 package
(`docs/04_audit/evidence/AAA/AAA-07/sweep-callsite/manifest.json`) recorded
`observedAt` as `2026-09-13T00:41:00+00:00`, a numeric-offset form rather than
the UTC ISO `Z` form. This package uses only UTC ISO timestamps with an explicit
`Z` suffix, captured from the system clock (`date -u`).
