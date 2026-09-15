# AAA-03 adversarial review — agent-3 (quality front)

- Verdict: `APPROVE` (scope: contract revision sha256 `db75899f…` only). Approval covers the contract text and its adjudicated open questions; it does not approve any implementation, freeze, or downstream BUILD.
- Reviewer: `agent-3`; did not author AAA-03; no builder evidence overwritten.
- Observed artifact: `docs/02_spec/aaa_execution_contract.md`, sha256 `db75899f6b730fa04b642da8cdc6d65e747a7c7e62e22673bf038a52163d66f8`.
- Evidence from this review: `review-agent-3/review.json`, `review-agent-3/hash-consistency.txt`, `review-agent-3/static-cross-checks.txt`.

## Artifact identity

During the review window the artifact identity was momentarily inconsistent across registries (manifest `9d759223…` vs actual `db75899f…`; master log `c55f017b…`; backlog `b8da48a6…`). On recheck at `2026-09-12T20:39:26Z`, actual bytes, `contract-hash.txt`, `manifest.json`, `aaa_execution_ledger.json`, master log and backlog all agree on `db75899f…`. The transient divergence is recorded in `hash-consistency.txt` as evidence of why the AAA-04/AAA-13 candidate-binding rules are required. Freeze must pin `db75899f…`; any later byte change reopens this review and its dependents.

## Open-question adjudication

| Q   | Decision               | Rationale                                                                                                                                                                                                                                                    |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | CONFIRM                | Budgeted stages = model/tool/outbox; `policy`, approval and journal are mandatory controls and never consume budget. The contract must state explicitly that request and execution turns each carry their own limits.                                        |
| Q2  | CONFIRM WITH CONDITION | Keep `appointment.cancel` as `require_approval` in the controlled scope, provided a test proves that canceling a real `appointment` resource cannot reach a real adapter before AAA-21 and that the controlled path is explicit. Otherwise switch to `DENY`. |
| Q3  | CONFIRM                | Keep capability names, narrow semantics, update any eval/chaos fixture that assumed real modify.                                                                                                                                                             |
| Q4  | CONFIRM WITH CONDITION | Legacy `verifyAndConsume` stays for legacy consumers only. Current code still calls it from `packages/agent-runtime/src/runtime.ts:204`; a mandatory regression must fail if any governed path consumes before confirmed effect.                             |
| Q5  | CONFIRM WITH CONDITION | 60s reservation TTL is acceptable as a provisional default if parameterized and clock-injectable; PostgreSQL proof (AAA-16) must exercise `releaseExpired` under clock skew and a slow tool.                                                                 |

## Adversarial walkthrough

- T-01/T-02: stored canonical proposal is the only execution payload; divergence denies before the tool. Sound for F01.
- T-03/T-04: no path to `EXECUTED` without `executionRef`; model failure leaves no consumed approval. Sound for F02.
- T-05–T-08: crash matrix explicit per boundary with effect counts; atomic reserve with unique `(tenant, operation_key)` is sufficient locally. Sound, subject to the channel-key mapping condition below.
- T-09–T-11: budget checked before each budgeted stage; deadline/cancel/late-response defined; spans close on every path. Sound for F05.
- T-12/T-13: draft×real split plus no grant for confirm/reschedule matches F15 and the current `grants.ts`/`capabilities.ts` state (`appointment.confirm`/`reschedule` do not exist and must stay denied).
- T-14/T-15: confirmation recovery and `idempotency_key_reuse` denial explicit. Sound.
- Weak point: `RESERVED` recovery depends on a periodic `releaseExpired` sweep; the owner task must schedule it and test the stuck-reservation case.

## Binding conditions to attach at freeze

1. Q4 mandatory regression (`verifyAndConsume` cannot be used by any governed path); test lives with AAA-07/AAA-09.
2. Cross-front key mapping: freeze `channel.idempotencyKey := operationKey` (or equivalent documented mapping) so a runtime retry cannot create a new channel identity; test with AAA-10/AAA-12. This is an integration risk found during this review, not visible in either contract alone.
3. Q5 parameterization and clock injection; AAA-16 owns the PostgreSQL proof.
4. Explicit per-turn budget semantics (request vs execution turn).

## Limitations

- Static review of prose; no runnable schema exists yet.
- The contract bytes may change after this review; `APPROVE` does not survive byte changes.
- Technical opinion only; it is not human signoff and does not freeze or authorize BUILD.
