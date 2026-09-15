# 0027 — PRD: CVG Operational Harness Phase 0/1

Status: `PRD_VALIDATED_CONTROLLED`  
Task: `REF-20260913-PHASE-0-1`  
Discovery: [0016_harness_refoundation.md](../00_discovery/0016_harness_refoundation.md)

## Product statement

CVG Operational Harness is a governed runtime foundation for reusable operational AI agents across the CVG ecosystem.

Phase 0/1 does not deliver a smart autonomous agent. It delivers the seams that let products depend on the harness while keeping governance and effects inside the harness boundary.

## Product requirements

| ID | Requirement | Acceptance |
| --- | --- | --- |
| REF-PRD-01 | Identity | Root package and README identify `cvg-operational-harness`; brownfield origin remains explicit. |
| REF-PRD-02 | Neutral contracts | A public contracts package exposes the required IDs, profile, input/result, orchestrator, tool, skill, policy, approval, model, context/state, stop, budget and audit types with no framework/provider/product dependency. |
| REF-PRD-03 | Canonical composition | A consumer can construct one harness factory by supplying ports; composition wires runtime, orchestrator, model, policy, approval, tools, audit and telemetry without domain logic. |
| REF-PRD-04 | Runtime V1 | A deterministic single-pass governed runtime remains available; it stops at explicit reasons and routes tools through policy/approval before execution. |
| REF-PRD-05 | Future orchestration seam | The orchestrator contract and compatibility implementation are explicit; no LLM planner or iterative loop is introduced. |
| REF-PRD-06 | Product independence | New neutral-core packages have executable import checks preventing Secretary, channel, framework, persistence and concrete-provider dependencies. |
| REF-PRD-07 | Capability distinction | Tools execute; Skills describe reusable operating knowledge; Knowledge and Memory/State have separate contracts. |
| REF-PRD-08 | Governance preservation | The public foundation keeps policy, approval, audit and telemetry as required ports; a tool cannot authorize itself or bypass the runtime boundary. |
| REF-PRD-09 | Demo proof | A synthetic basic agent boots, responds, invokes an echo tool through the governed boundary, and emits audit/observability evidence. |
| REF-PRD-10 | Compatibility | Existing Secretary runtime sources are not mass-renamed or deleted; baseline failures are not hidden and current checks are rerun after the slice. |

## Experience and operational rules

The foundation is library-first. Products supply an `AgentProfile`, skills and domain adapters. The harness owns execution budgets, stop reasons, policy/approval sequencing, audit and telemetry ports. Incomplete or unavailable capabilities fail closed or return an explicit stop reason.

## Non-goals

The Phase 0/1 package is not a production release, a clinical system, a channel integration, an LLM agent loop, a knowledge answer engine or a replacement for the current Secretary application.

## Product gate

The WHAT is defined sufficiently for technical design. The product decision is controlled/local only; real-world autonomy, data, integration, retention and release decisions remain human gates.

