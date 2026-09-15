# 0016 — Discovery: CVG Operational Harness Phase 0/1

Status: `DISCOVERY_VALIDATED_CONTROLLED`  
Task: `REF-20260913-PHASE-0-1`  
Source: user-provided master prompt in the attached pasted-text file, read in full before this record.

## Problem

The copied repository contains a useful governed execution engine, but its reusable mechanisms remain embedded in a Secretary-shaped monorepo. The public composition is split, the current runtime is single-pass, and package imports do not yet prove that a neutral harness can serve more than one product.

The existing harness audit makes the problem observable: canonical composition and product decoupling are the immediate gaps; the audit decision is `GO_WITH_PREREQUISITES`, not permission to move code without a candidate freeze, contracts and public-path proof.

## Desired outcome

Create a reversible Phase 0/1 foundation named CVG Operational Harness with neutral contracts, an explicit orchestrator seam, a canonical dependency-injection factory, a minimal governed single-pass runtime for a synthetic agent, and executable dependency-direction checks. Preserve the existing Secretary product/runtime as a compatibility consumer while the later `AAA-21` composition task remains separate.

## Users and value

- Harness maintainers need stable contracts and package ownership.
- Future product teams need to depend on the harness without importing Secretary rules.
- Operators need existing policies, approvals, audit, idempotency, outbox, tenant isolation, model gateway and observability behavior preserved.
- Reviewers need a proof path that distinguishes the new neutral foundation from legacy product residue.

## In scope

- Baseline freeze and brownfield provenance.
- Root identity reset to `cvg-operational-harness` without mass symbol renaming.
- Package classification and dependency-direction documentation.
- New dependency-free `@cvg/harness-contracts` package.
- New `@cvg/harness-orchestrator` contract/compatibility implementation.
- New `@cvg/harness` canonical factory and governed single-pass runtime for controlled synthetic use.
- Architecture tests for neutral-core imports and governance/tool boundaries.
- Basic demo agent and Secretary compatibility documentation/example boundary.
- Architecture docs, ADRs, public API, runtime-v1 and current-vs-target records.

## Out of scope and safety boundaries

- No full iterative agent loop, LLM planner, multi-agent runtime, autonomous subagents, complete MCP ecosystem, agentic RAG, vector memory, distributed execution, Kubernetes or microservices.
- No real data, credentials, external provider/channel calls, production deployment, clinical/financial/medical-record action or automatic appointment confirmation/cancellation/rescheduling.
- No destructive relocation of existing Secretary sources; the legacy product remains in place until a later task proves the public composition and rollback.
- No claim that the existing `AAA-21` HTTP→SQL→worker→kernel path is solved by this foundation slice.

## Evidence and unresolved questions

- Current candidate and baseline are recorded in `docs/refoundation/BASELINE_FREEZE.md` and `BASELINE.json`.
- Existing audit and readiness evidence are in `docs/harness-audit/`.
- The two runtime paths, manifests and Secretary couplings need explicit boundary tests; the new neutral packages must not inherit these couplings.
- The complete legacy cutover, cross-version migration and durable end-to-end audit chain remain future work.

## Discovery gate

The problem, target, constraints, users, evidence and non-goals are sufficiently bounded for a controlled PRD/SPEC. The gate authorizes documentation and a reversible local foundation build only; it does not authorize external effects or production.

