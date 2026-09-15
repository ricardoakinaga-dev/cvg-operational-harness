# P2-1 remediation — limitations and residual risks

## Residual risk: caller idempotency key is not persisted on the approval

The governed runtime keys effects by `operationKey`. When the caller presents an
`idempotencyKey`, `operationKey = SHA-256(tenantId, callerIdempotencyKey)`;
otherwise it is derived from tenant/capability/action/resource/proposalHash
(AAA-03 section 2). `ApprovalRecord` does not store the caller key (AAA-10
wiring limitation: approval-engine was out of scope), so the tenant-wide sweep
can only recompute the derived key.

Consequence:

- Journal record found under the derived key: evidence is precise.
- Journal record absent under the derived key: the sweep treats it as
  `no_effect` and releases the reservation to `APPROVED` (contract section 4
  "sem EFFECT_STARTED volta a APPROVED"; same rule already used by
  `#recoverExpiredReservation` for the absent case). For an orphan created with
  a caller idempotency key, the real journal record may live under a different
  key, so this release is an inference, not proof.
- Journal lookup failure or proposalHash mismatch: no evidence is produced, the
  engine keeps an honest `UNCERTAIN`; nothing is released.

Why the residual window is bounded: a retry that presents the same caller key
still hits the durable journal before the tool (`in_progress`/`uncertain`/
replay), so the duplicate effect requires the caller to change the
idempotency key between attempts, which contract E-4 already classifies as a
new operation. Closing the window completely requires persisting the caller key
or a journal "list by proposalHash" API — both outside this bounded task and
recorded here for review/backlog.

## Engine TTL parameter

`ApprovalEngine.releaseExpired` accepts `ttlMs` but derives expiry exclusively
from `record.reservationExpiresAt` (set at reserve time with the same
`reservationTtlMs`). The runtime passes the existing `reservationTtlMs`
(default 60s); no new TTL option was introduced and the engine was not edited.

## Periodic worker sweep

`sweepExpiredApprovals` is exported but deliberately not wired into
`apps/worker` (AAA-19 owns that). It is per-tenant; multi-tenant iteration,
scheduling and backoff are the caller's responsibility. No worker, queue or
PostgreSQL proof is claimed here.

## Evidence scope

- Focused tests use synthetic in-memory journals/stores and a deterministic
  model; no real data, user, provider, channel or clinical/financial action.
- The RED log covers the four core behavioral tests; the journal-lookup-failure
  and exported-helper tests were added immediately after the first GREEN run and
  are covered by `green-focused-verbose.log`.
- `runtime.ts` and other `packages/agent-runtime` files already carried
  pre-existing uncommitted changes from earlier lanes; this task added only the
  sweep/evidence hunks and the new test cases and did not revert anything.
- `docs/99_runtime_state.md`, `docs/20_master_execution_log.md` and
  `docs/30_backlog_master.md` were not updated because this task explicitly
  restricts writes to `packages/agent-runtime/` and this evidence directory;
  coordinator/AAA-19 must persist state/log/backlog from this manifest.
- Independent review is still required (`IMPLEMENTED_PENDING_INDEPENDENT_REVIEW`);
  no gate, DONE, commit, push or deploy is claimed.
