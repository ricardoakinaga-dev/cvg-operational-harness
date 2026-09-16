# Phase 4A consumer change surface — AAA-4A

The two consumers are intentionally synthetic and independent. They prove
generality without importing legacy product vocabulary into the generic
conversation package.

## Synthetic Service Desk

| Surface       | Allowed controlled behavior                                                               | Forbidden behavior                                             |
| ------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Information   | Answer bounded facts supplied by the fixture                                              | Invent institutional policy or cite absent evidence            |
| Collection    | Collect synthetic name, preference, date and choice fields                                | Persist unbounded personal data or infer sensitive facts       |
| Availability  | Show synthetic slots from a fixture capability                                            | Claim real availability or contact a real scheduler            |
| Reservation   | Propose/create/modify/cancel a synthetic reservation through Harness approval/effect path | Confirm, cancel or reschedule a real appointment automatically |
| Clarification | Ask minimal questions and resolve bounded references/corrections                          | Guess an ambiguous resource or silently discard a correction   |
| Handoff       | Emit an explicit bounded packet with pending goal and evidence references                 | Hide uncertainty or continue after an authority boundary       |

## Synthetic Knowledge Assistant

| Surface          | Allowed controlled behavior                                      | Forbidden behavior                                        |
| ---------------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| Knowledge answer | Cite approved versioned synthetic evidence                       | Treat model inference or user text as institutional truth |
| Evidence gap     | State that evidence is unavailable or request clarification      | Fill a gap with a plausible citation or fabricated source |
| Follow-up        | Preserve the bounded question context and answer a side question | Cross-session long-term memory or hidden profile state    |
| Handoff          | Return source ids, version, question and uncertainty             | Claim domain authority beyond the approved source         |

## Shared public conformance

Both profiles must use the same `ConversationService` and public contracts,
with only descriptors, capability fixtures, persona/style metadata and approved
source declarations changing. Neither profile may gain direct access to a
capability implementation, policy, approval engine, SQL client or provider.

The consumer fixtures must remain synthetic and deterministic. A future
product adapter is a separate phase and cannot be introduced by changing the
generic package's branches or semantics.
