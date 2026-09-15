# Executive Summary

The controlled Phase 0/1 refoundation establishes a neutral CVG Operational
Harness seam beside the inherited Secretary product. It adds dependency-free
contracts, a descriptor-safe orchestrator boundary, a governed single-pass
Runtime V1, a canonical factory, a synthetic basic-agent proof, dependency
direction checks, provenance, classification, architecture documentation, and
ADRs.

Verdict: **`CONDITIONAL_PASS` for the controlled local Phase 0/1 slice**.
The new slice is focused-green and no new full-suite failure appeared, but the
brownfield repository remains non-green in the same sandbox-blocked areas as
the freeze. A final post-fix critic attempt was not reviewable, so this is not a
full independent PASS. Production remains `NO-GO`; AAA-21 remains separate.

## Baseline

The pre-build freeze is bound to base commit
`512bc11e80fbf7c7b8baf6263aacc811ff829309`, a dirty candidate with 175 status
entries. Before refoundation source changes:

- `npm test`: 249 files, 235 passed, 5 failed, 9 skipped; 1,668 passed,
  12 failed, 105 skipped; 8 errors.
- `npm run test:evals`: 1 file, 8 tests passed.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS; 163 modules transformed.

The current controlled candidate binding is recorded in
[`BASELINE.json`](BASELINE.json) and [`BASELINE_FREEZE.md`](BASELINE_FREEZE.md),
including the stable implementation-scope fingerprint
`aedf52160ad78fcf9a38248804be2c78dc3eb4123dfa7eb6a2cde3d490124761`.

## What Was Changed

- Renamed root identity and description to `cvg-operational-harness`.
- Added `@cvg/harness-contracts`, `@cvg/harness-orchestrator`, and
  `@cvg/harness` with workspace links, aliases, project references, build
  exports, and an isolated `build:harness` command.
- Added `createOperationalHarness` as the single public composition root.
- Added `SinglePassGovernedRuntime`, `SinglePassOrchestrator`, and
  `NoopOrchestrator`.
- Added a synthetic `examples/basic-agent` with mock model, echo tool, policy,
  approval, audit, telemetry, and response/tool proofs.
- Added architecture/dependency-direction tests and contract tests.
- Added brownfield origin, package classification, architecture docs, ADR-001
  through ADR-008, Secretary compatibility boundary, and evidence records.

## What Was Preserved

The existing Secretary implementation, current runtime paths, API, worker,
persistence, outbox, tenant handling, policy/approval implementations,
model-provider code, audit/observability implementations, channel adapters,
and production-assurance worktree changes were not moved, deleted, or rewritten
by this slice. Existing idempotency, approval, effect-journal, tenant,
correlation, controlled-effect, and no-automatic-uncertain-replay invariants
remain brownfield responsibilities.

`AAA-21`—the canonical HTTP → SQL → worker → runtime composition lane—remains
separate and incomplete. No real data, credentials, external provider/channel,
database, production deployment, clinical action, financial action,
consultation action, or definitive record write was used.

## What Was Removed From Core

Nothing was destructively removed from the brownfield repository. Instead, the
new neutral core is clean by construction:

- contracts have no framework, database, provider, or Secretary dependency;
- the orchestrator receives `ToolDescriptor` metadata, never executable tools;
- the public factory has no arbitrary runtime override;
- policy/approval/tool execution is owned by the governed runtime; and
- the legacy Secretary surface is documented as product residue rather than
  relabeled as harness core.

## New Boundaries

The implemented direction is:

```text
Product -> Agent Profile -> Skills/requirements -> Harness Contracts
  -> Runtime/Orchestrator -> injected capabilities/adapters -> external systems
```

The new package dependency graph is:

```text
@cvg/harness-contracts <- @cvg/harness-orchestrator <- @cvg/harness
```

Products and channel/database/provider implementations remain outside this
graph and are injected through ports.

## Contracts

The contracts package exposes branded IDs, `AgentProfile`, `RuntimeInput`,
`RuntimeResult`, `OrchestratorInput`, `OrchestratorDecision`, `ToolDescriptor`,
`ToolDefinition`, `ToolInvocation`, `ToolResult`, `SkillDefinition`, policy,
approval, model, context/state, budget, stop-reason, audit, telemetry,
knowledge, memory, channel, and runtime ports. It also names
`ConversationState`, `ExecutionState`, `WorkingMemory`, and a retrieval-only
`LongTermMemory` vocabulary without implementing long-term memory.

Required stop reasons are present, including `COMPLETED`, `NEEDS_USER_INPUT`,
`APPROVAL_REQUIRED`, `HUMAN_TAKEOVER`, `POLICY_DENIED`,
`INSUFFICIENT_EVIDENCE`, `MAX_STEPS`, `MAX_COST`, `MAX_DURATION`,
`TOOL_FAILURE`, `MODEL_FAILURE`, `STATE_CONFLICT`, `CANCELLED`, and
`UNSAFE_REQUEST`; bounded call/token reasons are additive.

## Runtime V1

`SinglePassGovernedRuntime` makes one orchestrator decision and returns a typed
result with `steps: 1`. It does not implement a loop, planner, autonomous
retry, multi-agent execution, self-modification, or full MCP runtime.

The runtime validates boundary identity/budget presence, enforces model/tool/
duration/cost/token budgets, and places deadlines around orchestrator, model,
policy, approval, tool, and audit awaits. Tool execution receives an abort
signal where supported. An audit failure downgrades the result to
`INSUFFICIENT_EVIDENCE`.

## Orchestrator Readiness

`Orchestrator.decideNextStep(input)` is explicit and deterministic in the
compatibility implementations. Supported action vocabulary includes
`RESPOND`, `CALL_TOOL`, `RETRIEVE`, `ASK_USER`, `REQUEST_APPROVAL`, `HANDOFF`,
`VERIFY`, and `STOP`.

The orchestrator chooses; it cannot invoke an executable tool, authorize an
effect, access persistence, call credentials, or call an LLM planner. Retrieval
and verification have contract vocabulary only in this phase.

## Tool System

`ToolDefinition` contains generic ID/version/schema/risk/side-effect/idempotency/
approval metadata plus an execute port. `ToolRegistry` provides discovery and
resolution, not authorization. The runtime resolves the definition, evaluates
policy, requests approval when policy/tool requires it, and executes only after
the decision is approved. Unsupported policy/approval outcomes and approved
decisions without an approval ID fail closed.

## Skill Readiness

`SkillRequirement` and `SkillDefinition` exist with required tools, required
knowledge, description, version, and risk level. No skill runtime, dynamic
planner, or autonomous skill composition is implemented.

## Model Gateway

Model calls cross `ModelGateway.complete(ModelRequest)`. The new runtime does
not import a provider SDK and maps provider/model/usage/cost failures to the
neutral result and stop-reason boundary. Provider routing remains an injected
implementation concern.

## Governance

The effect order is **policy → approval when required → tool execution → audit
and telemetry**. Denial, pending approval, handoff, malformed governance,
tool failure, timeout, and audit failure are explicit non-success outcomes.
The runtime cannot be replaced through the public factory with an ungoverned
implementation.

## Dependency Direction

`tests/architecture/dependency-direction.test.ts` checks that contracts,
orchestrator, and harness do not import Secretary, product, framework,
database, or provider tokens. It also checks package manifest direction and
the canonical factory. The inherited packages remain classified as mixed or
product-specific in [`PACKAGE_CLASSIFICATION.md`](PACKAGE_CLASSIFICATION.md);
the test does not pretend they have already migrated.

## Demo Agent

`examples/basic-agent` boots through the public factory using synthetic values.
It proves a deterministic Hello response through a mock model gateway and an
explicit echo request through policy, registry, audit, and telemetry. It has no
network, database, real tenant, Secretary, clinical, financial, or scheduling
effect.

## Tests

Focused and command evidence:

- Focused contracts/demo/architecture tests: **3 files, 13 passed**.
- `npm run test:evals`: **PASS**, 8 tests.
- `npm run typecheck`: **PASS**.
- `npm run lint`: **PASS**.
- `npm run build`: **PASS**, 163 modules transformed.
- `npm run build:harness`: **PASS**, isolated contracts → orchestrator →
  harness build.
- Workspace links and built public exports: **PASS** (`npm ls` and Node import).
- `npm test`: **exit 1**, 252 files (238 passed, 5 failed, 9 skipped), 1,681
  passed, 12 failed, 105 skipped, 8 errors.

The full-suite failures are the same five areas in the freeze: worker
controlled/startup/continuous entrypoints, API identity wiring, and eight
loopback HTTP-provider cases. Sandbox `listen EPERM` and the current Node 24
versus Node 22 target are recorded in
[`evidence/REGRESSION_COMMANDS.md`](evidence/REGRESSION_COMMANDS.md). This is a
conditional repository result, not a claim that the whole brownfield suite is
green.

## Risks

- The legacy package graph remains mixed and has no integrated HTTP → SQL →
  worker proof in this task.
- Durable cross-process audit/telemetry and effect-journal ownership are not
  wired into the new factory.
- The repository is dirty and contains unrelated production-assurance changes;
  the stable candidate fingerprint is scope-bound rather than a release
  artifact.
- The final post-fix critic attempt did not complete a reviewable inspection;
  the earlier fresh critic findings were fixed and locally retested, but the
  final independent verdict is therefore not a full PASS.

## Remaining Debt

- Complete AAA-21 with a separately gated canonical HTTP → SQL → worker →
  runtime path and durable trace/audit evidence.
- Add a second synthetic product consumer and consumer-facing export snapshot.
- Migrate selected neutral slices from `shared`, `agent-runtime`, policy,
  model, observability, channel, and persistence only after ownership gates.
- Add durable memory/knowledge adapters only with approved source and data
  handling rules.
- Re-run the full suite under a permitted Node 22/network-loopback environment
  and resolve the five baseline failure areas.
- Commission a fresh post-fix critic with enough execution time for a complete
  independent read before upgrading this conditional result.

## Scores

| Dimension              | Score (0–10) | Rationale                                                                               |
| ---------------------- | -----------: | --------------------------------------------------------------------------------------- |
| Core Contracts         |            8 | Broad neutral vocabulary, branded IDs, ports, and no forbidden dependencies.            |
| Runtime Boundary       |            8 | Governed single-pass seam with budgets/deadlines; brownfield runtime remains mixed.     |
| Orchestrator Readiness |            6 | Explicit safe decision port and deterministic adapters; no planner/loop by design.      |
| Tool Architecture      |            8 | Generic definitions, descriptor-only orchestration, registry, policy/approval ordering. |
| Skill Readiness        |            5 | Minimal contract exists; no skill runtime is intentionally implemented.                 |
| Model Boundary         |            8 | Mandatory gateway and provider-independent runtime boundary.                            |
| Governance             |            8 | Fail-closed policy/approval/tool sequencing and malformed-outcome handling.             |
| Audit                  |            7 | Separate sink and audit-failure downgrade; durable integration remains debt.            |
| Observability          |            7 | Separate telemetry port and evidence in demo; cross-process continuity remains open.    |
| State Separation       |            6 | State/memory vocabulary and ports exist; no long-term implementation.                   |
| Knowledge Boundary     |            6 | Explicit provider contract only; approved institutional source integration deferred.    |
| Product Decoupling     |            7 | New core is clean and legacy is classified; old packages are not yet migrated.          |
| Test Coverage          |            7 | 13 focused proofs plus unchanged full-suite delta; global baseline is not green.        |
| Extraction Progress    |            5 | Contract-first boundary is real, but physical extraction is intentionally deferred.     |
| Runtime V2 Readiness   |            4 | Decision vocabulary and budgets prepare a future loop; V2 cognition is not built.       |

**Phase 0/1 score: 7.0/10 — controlled `CONDITIONAL_PASS`.**

## Phase 2 Recommendation

Proceed only with a new gate for **durable composition and consumer proof**:
first complete AAA-21’s canonical HTTP → SQL → worker → runtime path using the
new public factory, preserve the existing governed invariants, add durable
audit/telemetry and idempotency assertions, and obtain a fresh independent
critic under Node 22 with permitted loopback/database fixtures. Only after that
should the project consider a bounded Runtime V2 loop. The governing sequence
remains: **DECOUPLE → CONTRACT → COMPOSE → VERIFY → THEN EVOLVE COGNITION**.
