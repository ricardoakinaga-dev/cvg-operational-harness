# Phase 4A PRD — Conversational Intelligence Layer

- Product task: `CVG-PHASE4A-CONVERSATIONAL-INTELLIGENCE` / `AAA-4A`
- Product status: planning; controlled synthetic scope only.
- Release status: `NO_GO` for production, real data, real channels, and real
  effects.

## Problem

The current governed Harness can execute structured runtime decisions, but it
does not provide a generic conversational layer that can interpret natural
language, maintain bounded multi-turn state, resolve corrections/references,
compose grounded responses, or hand off explicitly while preserving the
Harness authority boundary.

## Intended consumers

1. **Synthetic Service Desk Agent** — a neutral demonstration consumer that
   can answer information questions, collect fields, show synthetic
   availability, and propose governed synthetic reservations.
2. **Synthetic Knowledge Assistant** — a second independent profile proving
   that the package is not coupled to service-desk vocabulary or workflows.

Neither consumer uses hospital, veterinary, Secretary, Rick, CVG production,
patient, financial, or real scheduling data.

## User outcomes

- A user can express a goal naturally and receive a clarification only when a
  required field or choice is genuinely unresolved.
- “The second one”, “actually Friday”, and similar references/corrections bind
  to the current turn state, invalidate stale proposals, and never silently
  reuse an old approval or effect.
- A side question is answered or safely deferred without destroying the
  pending primary goal.
- A governed action shows a proposal before execution, uses the existing
  policy/approval/journal path, and reports success only from an effect-backed
  result.
- A knowledge answer cites approved evidence or says that evidence is not
  available; model inference is not presented as fact.
- Failures, uncertainty, interruption, crash/restart and handoff are explicit
  user-visible states.

## Functional requirements

| ID        | Requirement                                                   | Acceptance signal                                                |
| --------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| PRD-4A-01 | Formal conversation/session/turn/message/execution identities | Public types and state transition tests.                         |
| PRD-4A-02 | Bounded generic conversation state and working memory         | Size/depth limits, checkpoint round-trip, no long-term memory.   |
| PRD-4A-03 | Rules-first interpretation with optional typed model fallback | Deterministic fixture and malformed model-output tests.          |
| PRD-4A-04 | Entity resolution, references, corrections and ambiguity      | Golden conversations 2–5, 11 and mutation/paraphrase variants.   |
| PRD-4A-05 | Goal/side-question stack with bounded depth                   | Golden 5 and 15; interruption tests.                             |
| PRD-4A-06 | DialogueManager cannot execute, authorize or mutate effects   | Dependency and capability-bypass tests.                          |
| PRD-4A-07 | Response composition/verifier with source-of-truth rules      | False-success, unsupported-claim and repair tests.               |
| PRD-4A-08 | Existing Harness integration for all actions                  | Public `OperationalHarness` spy and journal evidence.            |
| PRD-4A-09 | Proposal-bound approval and correction invalidation           | Approval lifecycle tests, no natural-language approval shortcut. |
| PRD-4A-10 | Durable persistence and delivery idempotency                  | PostgreSQL/memory parity, crash and response retry proofs.       |
| PRD-4A-11 | Tenant isolation and profile/version pinning                  | RLS/IDOR and incompatible resume tests.                          |
| PRD-4A-12 | Synthetic Service Desk and independent Knowledge Assistant    | Demo and conformance consumer tests.                             |

## Non-functional requirements

- Fail closed on malformed/untrusted input, unknown capability/version,
  missing evidence, invalid state transition, authorization mismatch, and
  persistence conflict.
- Bounded message length, entity count, state size, transcript page size,
  model calls, response size, clarification depth, and goal-stack depth.
- Stable response ids and operation keys; no duplicate action after response
  failure or process restart.
- No chain-of-thought persistence or exposure.
- Metrics use fixed low-cardinality labels and exclude message text and IDs.
- Conversation remains optional: removing it must not break the Harness.

## Out of scope

Streaming, voice, multimodal input, multi-agent collaboration, arbitrary code
execution, dynamic Skill/Plugin/MCP loading, real providers/channels, real
RAG, real appointments, clinical or financial action, patient data,
production deployment, and unrestricted autonomy.

## Product gate

This PRD is a Phase 4A planning artifact. It does not override the current
blocked Phase 4 handoff or grant production authorization. The implementation
gate is recorded in `TASK.md` and must be superseded by current discovery,
PRD, SPEC, human review, and `PHASE_4_HANDOFF=VERIFIED` evidence.
