# Conversation state model — AAA-4A

## Identities

The public contracts keep these values separate: `tenantId`,
`conversationId`, `sessionId`, `turnId`, `messageId`, `correlationId` and
`executionId`. A conversation scope also pins `profileId` and
`profileVersion`. The store rejects a turn, approval resume or replay whose
scope does not match the persisted session.

## Durable records

| Record           | Purpose                                                                         | Authority                                |
| ---------------- | ------------------------------------------------------------------------------- | ---------------------------------------- |
| Session snapshot | Status, version and bounded working memory                                      | Conversation store                       |
| Inbound message  | Original bounded request for idempotent acceptance                              | Conversation store                       |
| Turn             | Interpretation, plan kind, response, execution identity and execution status    | Conversation store                       |
| Execution claim  | Owner turn, operation key, proposal hash, execution id, approval/effect outcome | Store link to existing Harness execution |
| Delivery row     | Response payload hash, attempts, lease and status                               | Delivery adapter                         |
| Handoff packet   | Bounded continuation facts and references                                       | Handoff sink plus session memory         |

Transcript text is not the structured working-memory authority. Working memory
contains active entities, bounded goals, goal stack, one pending question,
bounded options, proposal/approval references, source references, invalidated
ids and optional handoff metadata. It has explicit limits: 32 entities, 8
goals, stack depth 3, 8 options, 32 source references, 16 invalidated
proposals, 32 KB serialized state, canonical depth 8 and 512 canonical nodes.

## State transitions

| Event                | State action                                                    | Safety condition                                                                                |
| -------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| New message          | Accept once and increment through CAS on commit                 | Same message/idempotency key replays the accepted turn                                          |
| Missing field        | Set one bounded pending question                                | Question is bound to goal and question id                                                       |
| Proposal             | Persist `DRAFT` proposal and wait                               | No Harness call occurs                                                                          |
| Natural confirmation | Invoke existing Harness only to obtain approval-required result | Natural assent cannot authorize an effect                                                       |
| Authenticated resume | Claim and authorize the exact proposal operation                | Tenant, profile, approval, hash, active proposal, lease and state bindings match at both fences |
| Correction           | Mark old fact corrected/stale and invalidate affected proposal  | Old approval and operation key cannot resume                                                    |
| Side question        | Push a bounded goal and answer/defer                            | Primary goal is preserved and later resumed                                                     |
| Effect result        | Record terminal outcome and evidence                            | Success requires effect-backed result                                                           |
| Handoff/stop         | Persist bounded handoff or cancellation                         | No action continues past the boundary                                                           |

Terminal execution records are replayable. A response failure updates delivery
state and does not reopen or repeat a confirmed effect. PostgreSQL uses
tenant-scoped tables, row locks for claim/acceptance, state-version CAS,
expiring lease tokens and delivery idempotency. Identical operation keys are
coalesced so concurrent turns share one governed reservation; the durable
owner turn and execution id fence finalization. Goal completion does not by
itself close a conversation, so a later distinct goal may be accepted while
the session is `ACTIVE`; `COMPLETED` and `CANCELLED` reject new turns after
replay checks. The controlled disposable database proof exercises reload, RLS,
contention, stale recovery and fencing. The effect authorization fence is a
second short transaction that orders a live correction against the external
Harness call; a correction committed first fails closed before the call. A
delivery sink must deduplicate `deliveryKey` because a process crash after
external send and before the durable mark is an at-least-once window;
production HA and external effect exactly-once remain outside scope.
