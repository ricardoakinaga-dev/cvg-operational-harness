# Conversation quality report — AAA-4A

## Current controlled measurement — 2026-09-17

The controlled Phase 4A command completed with 12 passing files and 73 passed
tests against disposable PostgreSQL. The structural verifier completed 16
assertions. The synthetic demo completed both consumers: one approval-bound
Service Desk effect with one duplicate replay, and one approved-source
Knowledge Assistant answer with the decoy source excluded. The two profiles
share the public service and Harness bridge while owning their locale, action
labels and response copy at the profile boundary.

The executed suite covers state bounds, model-gateway metadata and malformed
output, correction and proposal invalidation, references, side questions,
handoff persistence/replay, delivery contention, Harness policy/capability/
journal integration, the 15-case golden corpus, 15 multi-turn trajectories,
the Service Desk journey and adversarial cases. The PostgreSQL integration
exercised 20-way turn contention, 20-way durable response delivery
contention, tenant RLS, persisted state reload, stale lease recovery and old-
worker fencing. The claim boundary also proves state-version and active-
proposal fencing when a correction races both claim acquisition and the
post-claim effect-authorization fence, three-way merge
keeps the latest durable pending fields on conflict, and the Harness bridge
pins the trusted runtime agent identity/version. Executed turns persist their
execution identity on the turn record. Runtime package dependencies are
limited to `@cvg/harness-contracts` and `zod`; the executable Harness is
retained as a development/test fixture dependency. Proposal and confirmation
language uses stable Portuguese labels instead of exposing internal action
verbs such as `CREATE` or `MODIFY`.

This is a controlled evidence report, not a production readiness statement.
The current candidate, axis scores and three fresh critic reports are bound in
`evidence/`; the final sentinel is the last integrity capture for this source
snapshot.
