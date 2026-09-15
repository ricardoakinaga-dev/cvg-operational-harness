# Phase 3 Final Report — Runtime V2 + Hybrid Orchestrator (AAA-31)

# Executive Summary

Phase 3 turned the durable single-pass harness into an iterative governed
agent loop without rewriting the Phase 2 execution spine. The runtime now
loads a bounded cognitive checkpoint, assembles context for each step,
consults a hybrid orchestrator (deterministic rules first, bounded model
decision support second), validates every probabilistic decision, enforces
policy/approval/budgets/loop detection, executes tools through the Phase 2
effect journal, records structured observations, evaluates completion and
sufficiency, and persists a checkpoint after every significant step.

All Phase 3 gates executed against the current candidate:
`npm test` 256 files / 1,785 passed / 111 skipped; `test:postgres` 26 files /
196 tests / 0 skips on a disposable PostgreSQL 15; E2E 6/6; evals 10/10;
typecheck, lint and builds pass; `demo:phase3` completes a 5-step loop with
zero external effects. Phase 2 was revalidated first
(`PHASE2_HANDOFF=VERIFIED`). Production remains `NO_GO`; the phase is
certified at C5 as a controlled synthetic hybrid loop.

## Phase 2 Handoff

`docs/phase3/PHASE_2_HANDOFF.md` — VERIFIED. The stale R4 evidence was
replaced by re-executed Phase 2 gates on the current candidate: focused
5/31, `verify:phase2` PASS, PostgreSQL 24/190/0, regression 250/1,727/110,
E2E 6/6, evals 8, worker startup PASS. No Phase 2 behaviour source changed
after the R4 fingerprint; drift is attributed to publication ledgers and
generated output. The Phase 2 verdict remains CONDITIONAL_PASS (R4 critic
non-report) and was not upgraded.

## Candidate Identity

- HEAD `512bc11e80fbf7c7b8baf6263aacc811ff829309`, worktree dirty
  (brownfield preserved).
- Phase 3 functional digest
  `ba6a6274fa9f06b47b7d48357bfceb33e299760f29b45f8ad874b22c05088853`
  (799 implementation/test/script files) per
  `scripts/phase3-candidate-digest.mjs`; captured in
  `CANDIDATE_IDENTITY.json` and `evidence/PHASE3_FINAL_SENTINEL.json`.
  Documentation is excluded from the hashed scope so the identity artifact
  cannot invalidate its own digest; the freeze gate is the reproduction
  command in the sentinel.
- Migration digest recorded in `CANDIDATE_IDENTITY.json`.

## Architecture Before

Single-pass governed runtime: one orchestrator decision per execution; tool
execution with policy/approval/effect journal; durable execution
identity/queue/worker/lease; no loop, no steps, no checkpoints, no context
engine, no completion evaluation.

## Architecture After

Runtime registry (`single_pass` | `iterative`) inside the public composition
root; iterative runtime with step ledger, bounded cognitive state and
checkpoints; hybrid orchestrator with structured decisions; context engine;
completion/sufficiency evaluation; durable `WAITING_USER` resume and
trajectory export. See `RUNTIME_V2_ARCHITECTURE.md`.

## Runtime V1

Unchanged and still selectable; proven through the same factory
(`P3-COMPAT-001`) and the full Phase 2 regression. `RUNTIME_V1_COMPATIBILITY.md`.

## Runtime V2

`IterativeGovernedRuntime` — loop lifecycle
`LOAD → BUILD_CONTEXT → DECIDE → VALIDATE → GOVERN → ACT → OBSERVE →
CHECKPOINT → EVALUATE`. Multi-step execution with 2 tools, replan,
verification and response was proven end-to-end through HTTP, queue, worker,
journal and PostgreSQL.

## Execution vs Step

Execution = durable task; Step = one cognitive iteration with canonical
identity, type, status, attempt, side-effect flag and observation refs.
Sequential ordering is enforced by both step stores. `STEP_MODEL.md`.

## Hybrid Orchestrator

Deterministic rules first; bounded model decision support; typed
`LoopDecision`; validation and sanitization before any effect. The model
never authorizes and never controls the loop. `HYBRID_ORCHESTRATOR.md`.

## Context Engine

Prioritized, trust-tagged, provenance-carrying items with a token budget and
mandatory governance retention. `CONTEXT_ENGINE.md`.

## Observation Model

Structured observations with source, trust and provenance; tool output,
knowledge, user input and model proposals are untrusted data. Evidence
references and effect references enable grounding and correlation.

## Completion Evaluator

`DETERMINISTIC`, `EVIDENCE_BASED`, `HYBRID`; completion requires RESPOND and
grounded evidence where configured. `EVALUATION_MODEL.md`.

## Semantic Retry

A failed/incomplete result produces an evaluation-driven REPLAN or new
SEARCH, never a blind repeat and never a re-executed effect. Technical retry
stays at the execution level (`FAILED_RETRYABLE`).

## Replanning

REPLAN is a distinct, counted and budgeted step with a structured reason
code; proven by the operational and knowledge scenarios.

## Verification

Explicit `VERIFY` supports `tool-result`, `evidence-coverage` and
`response-claims`; implicit response verification uses the claim extractor.
One bounded revision is allowed within `maxVerificationCalls`.

## Knowledge Loop

Synthetic provider + category sufficiency: first query partial, second query
complete, answer grounded in item evidence ids.

## Tool Loop

Multiple tools in one execution with policy before each effect and the
journal fencing duplicates; operation keys are deterministic per step.

## Pause / Resume

`WAITING_USER` and `WAITING_APPROVAL` are durable pauses; the process ends,
the execution is re-queued by an authenticated route, and the loop resumes
with the pending decision and restored budget.

## Checkpointing

Bounded structured checkpoints with versions and digest, written before and
after side-effecting steps. No chain-of-thought, no unbounded history.
`CHECKPOINTING.md`.

## Crash Recovery

Crash between steps resumes at the next step; crash after a decision reuses
the persisted decision; crash after an effect is fenced by the journal.
Proven in memory and on disposable PostgreSQL with a fresh pool.

## Budget Enforcement

Runtime-owned budgets persisted across restarts; steps, model calls, tool
calls, knowledge calls, replans, verification calls, tokens, cost and active
duration all stop deterministically.

## Loop Detection

Decision signatures stop repeated identical decisions at the configured
threshold (default 2); a non-idempotent tool stops before a second identical
invocation and alternating A/B/C cycles are detected on closure
(`LOOP_DETECTED`).

## Governance

Policy authorizes; approval human-gates; the runtime enforces. No model
decision can bypass either. Mid-loop denial and mid-loop approval are proven.

## Audit

Per-step audit actions (`runtime_v2.started`, `orchestrator.decided`,
`step.started/completed`, `observation.recorded`, `evaluation.completed`,
`runtime.replanned/paused/completed/stopped`) with the execution timeline
reconstructible from the step ledger and trajectory export.

## Telemetry

`harness.iterative` with bounded attributes (outcome, model/tool/knowledge/
replan/verification counts); no execution id labels (no high cardinality).

## Security

Threat model extended for cognitive risks; controls and evidence in
`SECURITY_REVIEW.md`.

## Performance

In-memory baseline in `PERFORMANCE_BASELINE.md` and
`evidence/PERFORMANCE_BASELINE.json`: V2 simple 0.25 ms average,
5-step loop 1.21 ms average, checkpoint/step writes measured per iteration.

## Tests

`CRITICAL_TEST_CATALOG.md`; 1,785 passing tests; 196 PostgreSQL tests;
10/10 loop evals.

## Independent Critic

Six fresh-context independent critic windows were run. Round 1 (code
inspection) and rounds 2–5 (execution-capable) each rejected and produced
repairs (grounding, loop containment, policy fail-closed, crash-window
accounting, evidence integrity, wrong-kind resume). Round 6 returned
**APPROVE** on the frozen digest. The complete ledger is
`evidence/INDEPENDENT_CRITIC.md`.

## Certification

C0 contracts, C1 single-process loop, C2 durable multi-step, C3
process/checkpoint restart, C4 adversarial/budget/policy, C5 certified
synthetic hybrid loop. Achieved: **C5 (controlled, synthetic, disposable
PostgreSQL)** with independent critic `APPROVE`; status `CONDITIONAL_PASS`
because the V2 mid-loop SIGKILL proof on PostgreSQL is equivalence-proven
(durable checkpoint rows + fresh-pool resume + in-memory crash tests) rather
than an actual mid-loop process kill, and the production-level items below
remain open.

## Scorecard

See `scorecard.md`.

## Production Status

`NO_GO`. No real data, provider, channel, RAG, sensitive action, deploy or
external effect. V2 is opt-in via `runtimeProfile` and defaults off.

## Remaining Debt

- R4 Phase 2 fresh-critic non-report (historical limitation; unchanged).
- External-provider exactly-once not proven (deterministic tools only).
- No soak/load/concurrency beyond the Phase 2 proofs; no Docker image.
- Local Node 24 vs repository target Node 22.
- Global Prettier brownfield drift (Phase 3 selection passes).
- Upgrade/downgrade of a paused execution across runtime versions is manual.
- Parallel tool calls, DAGs, subagents, MCP, long-term memory and the full
  skill runtime are intentionally out of scope.

## Recommended Next Phase

PHASE 4 — Skill Runtime + Capability Composition (skill manifest/registry/
loader, tool/knowledge/policy requirements, versioning, skill evals, profile
composition), or PHASE 4A — Conversational Intelligence Layer if product
priority demands it, only after Runtime V2 stability.
