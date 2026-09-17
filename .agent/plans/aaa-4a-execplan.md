# AAA-4A Conversation Intelligence ExecPlan

## Objective

Implement the supplied Phase 4A prompt as a bounded, synthetic-only
conversation intelligence layer that is consumable through the existing
Operational Harness. The result must preserve the Runtime V2, Hybrid
Orchestrator, Policy, Approval, Capability, Effect Journal, Durable Spine and
Context Engine authorities, and must finish with candidate-bound evidence and
an honest Phase 4A certification verdict.

## Entry state

- Task: `CVG-PHASE4A-CONVERSATIONAL-INTELLIGENCE`.
- Entry gate: `PHASE4A_ENTRY_GATE=VERIFIED`.
- Phase 4 handoff: verified by the current handoff, critic approval, chain and
  sentinel under `docs/phase4/` and `docs/phase4a/`.
- Prompt source: `docs/phase4a/PROMPT_COPY_2026-09-17.md`, 16 byte-verified
  parts, concatenated SHA-256 `9b2132299bf8c1bb8fc8a3416bcb98e830a4dc8965a721007813c84b02836601`.
- Quality bar: frozen machine manifest `docs/phase4a/QUALITY_BAR.json`.
- Gauntlet: fresh run `AAA-4A-20260917`; the previous finished run is
  archived and preserved.

## Frozen boundary

The new layer may interpret, track bounded dialogue state, resolve references,
compose grounded responses and create typed proposals. It may call the public
Harness adapter. It cannot authorize, approve, execute, invent facts, bypass
policy, write directly to capabilities, create a second runtime/orchestrator/
policy/approval/memory/channel/spine, use real providers or data, or release
production behavior. Model output is untrusted and typed validation is
mandatory.

The target dependency direction is:

`Product -> Conversation -> Harness public API -> Runtime V2 -> Orchestrator -> Context -> Policy/Approval -> Capability -> Effect Journal -> Durable Spine`.

Generic conversation contracts must not import a product-shaped conversation
repository or depend on a specific consumer.

## Milestones

- M0: freeze contracts, state machine, identities, authority/source matrix and
  traceability.
- M1: implement rules-first interpretation, bounded dialogue manager,
  corrections, ambiguous references, side-question suspension/resume and
  response grounding.
- M2: add the public Harness adapter and two synthetic consumers: Service Desk
  and Knowledge Assistant.
- M3: add PostgreSQL-backed tenant-scoped persistence, CAS/idempotency,
  crash recovery and delivery/outbox behavior.
- M4: run the critical corpus, adversarial/security checks, chaos, load,
  restore, packaging and fresh critic review; rebind all evidence to the final
  candidate.

## Concrete Steps

<!-- active_action_id: AAA4A-ACT-007 -->

1. [completed] AAA4A-ACT-001 — reconcile scout reports against the brownfield reuse map,
   freeze the smallest public contract and record the decision in the plan.
2. [completed] AAA4A-ACT-002 — implement the conversation contracts and in-memory state
   machine with meaningful unit tests.
3. [completed] AAA4A-ACT-003 — implement the rules-first interpreter, dialogue manager,
   typed model gateway boundary and grounded response verifier.
4. [completed] AAA4A-ACT-004 — expose the layer through the existing Harness composition
   root and add synthetic consumers without bypassing canonical effect paths.
5. [completed] AAA4A-ACT-005 — add the additive PostgreSQL migration, tenant-scoped store,
   CAS/idempotency, delivery and recovery checks.
6. [completed] AAA4A-ACT-006 — execute the golden/mutated/adversarial corpus and required
   repository checks; capture exact evidence.
7. [completed] AAA4A-ACT-007 — obtain a fresh-context read-only critic verdict, reconcile
   candidate manifest, sentinel and final report, then stop at Phase 4A.

## Validation bar

Required checks are the repository's format/typecheck/lint/build/unit gates,
PostgreSQL integration and E2E behavior, eval corpus, adversarial security,
chaos/recovery, load/idempotency, restore, SBOM/license checks, Phase 2/3/4
verification and Phase 4A evidence integrity. A required check that is not
executed remains `NOT_RUN` or `BLOCKED` and prevents a PASS claim. PostgreSQL
durability requires a real disposable PostgreSQL service; an in-memory mock is
not sufficient for certification.

## Safe execution and recovery

Keep all source changes additive and inside the declared write sets. Do not
rewrite or delete historical evidence. Do not open a transaction across model,
tool, user or approval waits. If a check fails, preserve the artifact and
repair the smallest owning seam before rerunning dependent checks. If the
candidate changes after evidence capture, invalidate the affected evidence and
rebind it before reporting. Production remains `NO_GO` regardless of the
controlled certification result.

## Progress record

- 2026-09-17: entry gate verified, current prompt copied and byte-checked,
  quality bar frozen, fresh Gauntlet initialized, scout reports requested.
- 2026-09-17: implementation, focused/full regressions, disposable PostgreSQL,
  candidate evidence and three fresh critic approvals completed. Final
  candidate: `aaa4a-df2c0b1a1b7e0e9a`.
- Active action: `AAA4A-ACT-007` complete; the final sentinel was captured and
  matched the candidate, so the run is closed.
