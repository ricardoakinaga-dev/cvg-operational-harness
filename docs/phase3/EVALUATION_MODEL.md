# Evaluation Model

## Layers

| Concept                | Question answered                         | Authority                              |
| ---------------------- | ----------------------------------------- | -------------------------------------- |
| `CompletionEvaluator`  | Is the execution complete/failed/paused?  | Completion outcome (runtime enforces). |
| `SufficiencyEvaluator` | Is the evidence coverage enough?          | Domain-aware coverage signal.          |
| Claim validation       | Are response claims grounded in evidence? | Grounding signal (runtime enforces).   |
| Policy                 | Is the action authorized?                 | Authorization.                         |

Evaluators never execute tools and never authorize.

## Completion strategies

- `DETERMINISTIC`: RESPOND/STOP with content; fails on a failed effect,
  unsupported `ACTION_CONFIRMED`, or interrupted response verification.
- `EVIDENCE_BASED`: requires the latest `SUFFICIENCY` evaluation to be
  `SUFFICIENT` before accepting completion.
- `HYBRID`: deterministic checks first; a bounded semantic judge (model call
  reported with usage) may refine a deterministic COMPLETE. On judge failure
  the strategy falls back to the deterministic result and marks
  `EVALUATOR_UNAVAILABLE`.

## Sufficiency

`SUFFICIENT | PARTIAL | INSUFFICIENT | CONFLICTING`, with reason code, covered
categories, missing categories and conflicting sources. The runtime records the
result as a `SUFFICIENCY` observation after each knowledge step; completion
consumes it. There is no universal magic score; the profile/scenario supplies
the criteria (synthetic category evaluator in Phase 3).

## Grounding

- `Claim { text, evidenceRefs[] }` is the structured grounding primitive.
- An optional `claimExtractor` turns a response into claims; every referenced
  evidence id must exist in recorded observations (knowledge item ids, tool
  effect refs).
- Unsupported claims make the RESPOND step fail; the loop allows a revision
  within `maxVerificationCalls`, then stops `VERIFICATION_FAILED`.
- A false-success response (`ACTION_CONFIRMED`) is refused deterministically
  unless the claimed effect is observed: the exact named tool must have
  succeeded, or (unnamed) a side-effecting tool must have succeeded. A prior
  successful read never satisfies an action claim.
- Generic semantic fact-checking is out of scope: response grounding is only
  enforced where a claim extractor is configured (knowledge profiles).

## Bounded self-evaluation

Evaluator model calls count as verification calls and are visible in
`CompletionEvaluation.usage`; the runtime enforces the verification budget and
the shared model/token/cost budgets. There is no unbounded
generate→critic→regenerate loop.
