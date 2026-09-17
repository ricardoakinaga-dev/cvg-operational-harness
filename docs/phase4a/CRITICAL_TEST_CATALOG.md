# Phase 4A critical test catalog — AAA-4A

## Current execution index — 2026-09-17

The catalog has moved from planned to controlled execution. The focused
command is `npm run test:phase4a`; the controlled run reports 12 passing files
and 73 passing tests against disposable PostgreSQL. It includes 20-way
distinct-goal turn contention, 20-way durable delivery contention, forced RLS,
stale lease recovery and old-worker fencing. Raw test, candidate and critic
bindings are recorded under `evidence/`.

All tests are controlled, synthetic and local. They must be executable against
the public package ports and must not require real providers, channels,
credentials, patient/customer data or sensitive actions.

| Test ID | Risk covered              | Required assertion                                                                                                         | Planned gate             |
| ------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| CT-001  | Identity confusion        | Conversation, session, turn, message and execution ids remain distinct and tenant-bound                                    | Unit / contract          |
| CT-002  | State explosion           | Message, entity, goal, transcript page, stack and checkpoint limits fail closed                                            | Unit / property          |
| CT-003  | Invalid interpretation    | Malformed, cyclic, sparse, oversized or non-finite model output yields clarification/handoff and zero Harness calls        | Unit / adversarial       |
| CT-004  | Stale facts               | Correction marks affected entities stale/corrected and rebuilds the pending proposal                                       | Golden / unit            |
| CT-005  | Unsafe reference          | Ordinal/pronominal references resolve only against eligible bounded state; ambiguity asks a question                       | Golden / mutation        |
| CT-006  | Lost primary goal         | Side question preserves the primary goal and resumes it without duplicating execution                                      | Golden / state           |
| CT-007  | Goal-stack abuse          | Goal switching is bounded; terminal conversations create a new goal rather than resuming old execution                     | Unit / recovery          |
| CT-008  | False success             | Composer refuses success for failed, rejected, uncertain, waiting-approval or delivery-pending results                     | Grounding                |
| CT-009  | Natural-language approval | “Yes”, “ok” and sentiment never grant approval without authenticated proposal binding                                      | Security / approval      |
| CT-010  | Authority bypass          | DialogueManager has no capability implementation, policy, approval, journal or SQL access and cannot execute               | Architecture             |
| CT-011  | Runtime duplication       | Every action maps once to the existing Harness Runtime and preserves policy/approval/effect evidence                       | Integration              |
| CT-012  | Delivery replay           | Response delivery retries reuse `responseId`/delivery key and never invoke a capability twice                              | PostgreSQL / chaos       |
| CT-013  | Crash ambiguity           | Restart/replay consults durable turn/effect state and preserves one outcome                                                | PostgreSQL / chaos       |
| CT-014  | Tenant IDOR               | Cross-tenant reads/writes, spoofed payload tenants and profile mismatch are rejected under memory and RLS paths            | PostgreSQL / security    |
| CT-015  | Concurrent duplicate      | At least 20 concurrent identical goals produce deterministic state and no duplicate governed effect                        | Concurrency / load       |
| CT-016  | Untrusted content         | Prompt injection, malicious Skill/Tool/Knowledge text, hidden capability and fake source claims cannot change authority    | Adversarial              |
| CT-017  | Consumer leakage          | Service Desk and Knowledge Assistant use the same public contracts without product semantics in generic core               | Conformance              |
| CT-018  | Model budget              | Typed purposes, bounded calls, prompt versions and token budgets are enforced; rules-first paths avoid unnecessary calls   | Performance / gateway    |
| CT-019  | Grounded knowledge        | Only approved versioned knowledge evidence supports factual claims; absent evidence yields bounded refusal                 | Knowledge                |
| CT-020  | Message idempotency       | Repeated delivery of one message returns the stable response and does not create a second turn/effect                      | PostgreSQL / integration |
| CT-021  | Pre-claim stale proposal  | A correction committed before an execution claim fences the old proposal and produces a safe response with zero new effect | Race / integration       |
| CT-022  | Post-claim effect race    | A correction committed after claim but before the second effect-authorization fence prevents the Harness call              | Race / integration       |

## Golden corpus minimum

The executable corpus includes 15 independently authored conversations and 15
multi-turn trajectories,
including clarification, availability, ordinal reference, correction, side
question, governed create, knowledge, modify, cancel, handoff, uncertainty,
crash/recovery, duplicate delivery, concurrency and a second profile. Every
golden must have paraphrase/mutation variants; tests may not detect one exact
sentence as a shortcut.

## Adversarial minimum

The corpus must include injection in user text, tool output and knowledge
evidence; false approval; fake success; hidden capability; tenant
manipulation; repeated action; ambiguous cancellation; huge input; malformed
JSON; malicious Skill/Tool/Knowledge payload; and provider/output mismatch.
Each case records the expected safe state and the assertion that no forbidden
effect occurred.
