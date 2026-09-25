# PRD — M07 package dependency governance

## Record

- Document ID: `PRD-M07-001`
- Version: `0.1`
- Status: `PRD_APPROVED_FOR_SPEC_DOCUMENTATION`
- Owner: CVG package-maintainer role; named individual owner not assigned.
- Discovery origin: [0017 — M07 package dependency Discovery](../00_discovery/0017_m07_package_dependencies.md), approved for documentary PRD in [0090](../00_discovery/0090_discovery_validation.md).
- Updated at: `2026-09-23T12:27:40Z` (human PRD gate recorded)
- Human gate: “Approve for SPEC”; authorizes documentary SPEC preparation only. The conditional review verdict and its I1/integrated-verification limitations remain.
- Task: [M07 in the 50-improvement backlog](../03_build/0341_50_improvements_backlog.md)

## Product overview

M07 gives package maintainers, Harness consumers, and reviewers a reliable way to tell which workspace dependencies each package uses, which package entry points consumers may rely on, and which dependency directions the neutral Harness boundary permits. Today the repository contains a mixed brownfield graph, test-only cross-package edges, aliases that can bypass published exports, and packages whose public status is not yet classified. A static import or missing project reference is evidence to classify; by itself it is not proof of a build failure or an architectural violation.

This phase defines the outcomes and review rules for package dependency governance. It does not choose implementation structure, build tooling, or a refactoring sequence. Those belong in SPEC after this PRD is validated.

## Goals and non-goals

| ID | Goal | Observable outcome/metric | Origin |
| --- | --- | --- | --- |
| `M07-G1` | Give maintainers a complete, reviewable dependency picture for the workspace. | Every current app/package owner appears in a report with production and test dependencies classified separately. | 0017 Discovery; 0341 M07 |
| `M07-G2` | Make direct workspace dependencies explicit and supportable. | Every in-scope direct production dependency is declared in the owning package under a category consistent with its use; test/build-only dependencies are not misreported as production dependencies. | 0017; 0342 M07 acceptance |
| `M07-G3` | Let consumers rely on an explicit public package surface. | The set of public packages is named and each selected public entry point is consumable through its declared public export contract. | 0017; 0341 M07 |
| `M07-G4` | Preserve the neutral Harness boundary while recording brownfield exceptions honestly. | No unapproved dependency direction crosses the approved neutral target boundary; each accepted legacy exception has a scope, owner role, reason, and review or exit trigger. | 0017 architecture comparison; 0342 M07 |

Non-goals:

- Redesigning the full application/workspace graph or declaring all legacy packages extracted.
- Making every workspace package public or adding exports to every package.
- Treating every missing TypeScript project reference as a defect without an approved build contract.
- Refactoring application, persistence, provider, channel, or product runtime code in this PRD.
- Proving a build, test, runtime, release, or production property before the applicable SPEC and local BUILD gate.
- Changing package behavior, HTTP/API contracts, data, permissions, or externally visible runtime behavior.

## Actors and permissions

| Actor | Need | Can do | Resource/conditions | Must not do |
| --- | --- | --- | --- | --- |
| Package maintainer | Understand and correct dependency declarations for an owned package. | Review a package's observed imports, declared dependencies, export status, and accepted exceptions. | Only within an assigned package and an approved M07 slice. | Declare another package public, accept a cross-boundary exception, or change code without the applicable gate. |
| Harness consumer | Know which package entry point is supported. | Consume a package explicitly classified as public through its documented public contract. | Public status and compatibility scope must be recorded. | Depend on private source paths or assume a package is public from its name or current alias. |
| Architecture/review authority | Decide neutral target boundaries and time-bounded legacy exceptions. | Approve the package classifications, allowed directions, and exception records in the applicable review. | Decision must name scope, reason, authority, and review/exit trigger. | Treat a historical gate or a static observation as approval for M07. |
| Independent reviewer | Determine whether M07 outcomes are evidenced for the exact candidate. | Inspect source-linked inventory and authorized build evidence. | Candidate fingerprint and scope must be clear. | Claim an unrun build or test passed, or infer production readiness. |

### Cross-cutting safety and authority limits

M07 is limited to local, synthetic package-governance work. It does not authorize unrestricted production release, real data, or external integrations. It cannot confirm, cancel, or reschedule a real appointment automatically; perform clinical, financial, or definitive-record actions; or answer RAG requests without an approved institutional source. Any sensitive action requires explicit human approval or handoff. G21-5 and G21-6 remain closed, and production remains `NO_GO`.

## Workflow and states

1. A maintainer reviews the current workspace inventory and classifies each direct dependency as production, test, build-only, or unresolved.
2. The responsible authority identifies which packages are public and which dependency directions apply to the neutral Harness target; unresolved classifications stay visibly unresolved.
3. A separately approved M07 implementation slice updates only the selected package boundary and records any accepted legacy exception.
4. Reviewers compare the resulting package declarations and public-consumer outcomes with the approved scope and candidate-specific evidence.

| State | Meaning | Allowed next state/trigger | Forbidden transition |
| --- | --- | --- | --- |
| `OBSERVED` | A source or manifest relationship was found in a named worktree. | `CLASSIFIED` after its production/test/build role is reviewed. | `PASS` or `VIOLATION` without a contract and applicable evidence. |
| `CLASSIFIED` | The relationship's role and owner are explicit. | `DECIDED` after public status and target-boundary rules are approved. | Implementation based only on a guessed public status or graph rule. |
| `DECIDED` | The relevant product/architecture rule and any exception are approved. | `IMPLEMENTED` within a task-specific SPEC and BUILD gate. | Claiming a gate for a different task or candidate. |
| `IMPLEMENTED` | An approved slice changed the selected package boundary. | `VERIFIED` after the required checks run against the same candidate. | `DONE` based on documentation or a static inventory alone. |
| `VERIFIED` | Required current checks support the criteria for the exact slice. | `DONE` after the applicable audit and handoff. | Reuse after candidate drift without revalidation. |

These are product/review states for M07 evidence. They do not replace the repository's CVG lifecycle or create permission to execute a state transition.

## Use cases

### UC-M07-01 — Review a package's direct dependencies

- Actor: Package maintainer.
- Goal: Determine whether the package's direct workspace dependencies match its production, test, and build use.
- Preconditions: The package owner and current worktree candidate are identified.
- Trigger: A dependency audit or an approved package-boundary change is proposed.
- Main flow: Inspect source relationships; classify each as production/test/build-only/unresolved; compare each direct production dependency with the owning manifest; record applicable project-reference expectations.
- Alternate flow: If static syntax, aliasing, or dynamic loading prevents confident classification, mark the relationship `UNRESOLVED` and assign it for SPEC rather than guessing.
- Error/recovery: A stale or incomplete inventory is marked stale and refreshed from the exact candidate before it supports a gate.
- Postconditions: The maintainer can identify each observed relationship, its classification, and any missing decision without claiming an unrun build result.
- Related rules/requirements: `M07-BR1`, `M07-BR2`, `M07-FR1`, `M07-FR2`, `M07-FR3`.

### UC-M07-02 — Consume a supported package entry point

- Actor: Harness consumer.
- Goal: Import a package through an explicitly supported public entry point.
- Preconditions: The package has been classified as public and its compatibility scope is recorded.
- Trigger: A consumer adopts or upgrades the package.
- Main flow: Find the package's public contract; use the named entry point; verify the documented consumer outcome in the approved package slice.
- Alternate flow: If public status or export resolution is unknown, stop and request classification; do not use a private source alias as proof of public compatibility.
- Error/recovery: If the public entry point cannot be resolved in the supported consumer context, record the package, candidate, and failure for a bounded compatibility correction.
- Postconditions: The consumer uses a supported public boundary, or receives an explicit unresolved/unsupported result.
- Related rules/requirements: `M07-BR3`, `M07-BR4`, `M07-FR4`, `M07-FR7`.

### UC-M07-03 — Review a legacy exception

- Actor: Architecture/review authority and package maintainer.
- Goal: Keep an intentional brownfield dependency visible without treating it as part of the neutral Harness target.
- Preconditions: The relationship, owner role, business reason, and affected boundary are known.
- Trigger: A legacy edge cannot be changed in the selected M07 slice.
- Main flow: Record the edge and scope; name the accountable owner role; state why it remains; set a review or exit trigger; obtain the task-specific approval.
- Alternate flow: If no accountable owner or acceptable trigger exists, leave the edge unresolved and prevent it from being counted as an approved exception.
- Error/recovery: An expired or superseded exception returns to `UNRESOLVED` until reviewed; its historical record remains available.
- Postconditions: Reviewers can distinguish an approved exception from an unreviewed observation.
- Related rules/requirements: `M07-BR4`, `M07-BR5`, `M07-FR5`, `M07-FR6`.

## Scope and priority

| Item/ID | In this phase | Priority | Cut/defer rule |
| --- | --- | --- | --- |
| Workspace owner inventory | Yes: all current `apps/*` and `packages/*` owners in the approved candidate. | Must | If an owner cannot be inspected, report the coverage gap; do not silently omit it. |
| Production/test/build classification | Yes: direct relationships supported by the selected evidence method. | Must | Ambiguous dynamic or indirect relationships remain unresolved for SPEC. |
| Public package set and consumer outcome | Yes: classify an explicit set before judging public exports. | Must | Do not add every package to the public set by default. |
| Neutral target direction | Yes: apply only the approved neutral Harness boundary. | Must | Do not claim the whole brownfield graph is extracted or governed by the neutral target. |
| TypeScript project-reference expectations | Yes: identify and report the relationships; define which are required under the approved build contract. | Must | A missing reference is not a failure until the applicable build contract says it is required. |
| Legacy exceptions | Yes: record accepted exceptions and their review/exit trigger. | Should | Unapproved edges remain unresolved; broad cleanup is deferred. |
| Package refactors and manifest/code edits | No in PRD. | Deferred | Require an approved SPEC and M07 local BUILD gate. |
| External integrations, real data, production, release | No. | Excluded | Requires separate authority and gates; this PRD grants none. |

## Business rules

### M07-BR1 — Classify production and non-production relationships separately

- Rule: When an import or package relationship is observed, it must be classified as production, test, build-only, or unresolved before it contributes to a production dependency result. A test-only edge must not be reported as a runtime dependency or production cycle.
- Origin: 0017 M07 Discovery and 0342 P1-S1.
- Exceptions/authority: Unresolved relationships remain visible; classification policy is finalized in SPEC.
- Valid/invalid examples: A test file importing another workspace package is recorded as a test edge; reporting it as a production dependency is invalid.
- Test criterion: A reviewer can trace each counted relationship to its owner and production/test classification.

### M07-BR2 — Require explicit direct production dependencies

- Rule: When an in-scope package directly depends on another workspace package in production, the owning manifest must declare that direct dependency in the category approved for its role. Transitive availability does not satisfy this requirement. Test/build-only use must use the category approved for that use.
- Origin: 0017 M07 outcome and 0342 M07 PRD task.
- Exceptions/authority: Dependency-category mapping and treatment of type-only/optional dependencies are open for SPEC; no relationship is exempt by inference.
- Valid/invalid examples: A direct production import with no corresponding declaration is nonconformant after classification; a transitive dependency alone does not count as a direct declaration.
- Test criterion: The approved candidate's dependency report and manifest agree for every classified direct relationship.

### M07-BR3 — Classify public packages explicitly

- Rule: A package is judged against public-export requirements only after the public package set and its supported entry points are explicitly approved. Absence of an `exports` field is not by itself proof of a defect when public status is unknown.
- Origin: 0017 discovery risks and 0341 M07.
- Exceptions/authority: Public status is an architecture/product decision recorded in the applicable review.
- Valid/invalid examples: An unclassified package is `UNKNOWN`, not public or private by guess; a classified public package that cannot be consumed through its approved entry point is nonconformant.
- Test criterion: The public set, entry point, compatibility scope, and consumer outcome are all named in current evidence.

### M07-BR4 — Apply direction rules only to the approved neutral target

- Rule: For the neutral target described in 0017, dependency direction is consumer-to-dependency: `harness` → `harness-orchestrator` → `harness-contracts`. Those neutral packages must not depend on product/API, persistence, provider, or channel implementation, and the approved neutral target graph must be acyclic. The rule does not declare every brownfield application edge invalid.
- Origin: 0017 state-versus-target analysis and 0342 Discovery/PRD task.
- Exceptions/authority: Any exception requires explicit scope, accountable owner role, reason, and review/exit trigger approved for the task.
- Valid/invalid examples: A test-only edge is not a production-cycle violation; a production edge from the neutral target into a prohibited product/provider/channel layer is a violation unless a current approved exception applies.
- Test criterion: The report identifies the target boundary and all observed crossing edges, with each result classified as allowed, prohibited, approved exception, or unresolved.

### M07-BR5 — Do not convert static observations into execution claims

- Rule: A static import, missing project reference, manifest mismatch, or export observation must not be described as a failed build, runtime behavior, or compatibility break unless that behavior has been exercised under the applicable approved gate.
- Origin: 0017 evidence limitations; M07-D3.
- Exceptions/authority: None; evidence labels may distinguish observed, verified, failed, unresolved, and stale.
- Valid/invalid examples: “27 production edges lack a project reference in the observed configuration” is valid; “27 package builds fail” is invalid without build evidence.
- Test criterion: Every result states its evidence type, candidate, and whether the relevant check was actually run.

### M07-BR6 — Keep legacy exceptions reviewable

- Rule: An exception is active only while its scope, accountable owner role, reason, approval, and review/exit trigger are current. Missing or expired fields make the relationship unresolved, not approved.
- Origin: 0017 expected outcome and 0342 M07 PRD task.
- Exceptions/authority: A new exception requires its own approval; historical acceptance does not transfer to a new candidate.
- Valid/invalid examples: An edge with an owner role and a future review trigger may be proposed for approval; an ownerless exception or one copied from a stale candidate is invalid.
- Test criterion: Every accepted exception resolves to a current, task-scoped approval and a review/exit condition.

## Functional and non-functional requirements

### M07-FR1 — Produce a complete workspace inventory

- Behavior: A maintainer can inspect one current M07 inventory containing every workspace owner in scope and its relevant manifest, export, project-reference, and build-contract status.
- Origin/dependencies: 0017 scope; 0342 M07 Discovery and acceptance.
- Failure behavior: Missing or unreadable owners are reported as coverage gaps; a partial list cannot be presented as complete.

### M07-FR2 — Report classified direct dependencies

- Behavior: For each owner, the inventory reports direct production, test, build-only, and unresolved workspace dependencies separately, with source-linked evidence.
- Origin/dependencies: `M07-BR1`, `M07-BR2`.
- Failure behavior: Ambiguous imports remain unresolved and do not silently count as conformant.

### M07-FR3 — Compare dependency use with declarations

- Behavior: For each classified direct dependency, maintainers can see whether the owning manifest declares it in the approved category.
- Origin/dependencies: `M07-BR2`.
- Failure behavior: Missing or misclassified declarations are reported with owner and relationship; no product code is changed automatically.

### M07-FR4 — Record the public package contract

- Behavior: Reviewers can identify the explicitly public packages, supported entry points, compatibility expectations, and unresolved export decisions.
- Origin/dependencies: `M07-BR3`; 0017 exports observations.
- Failure behavior: Unknown public status is reported as `UNKNOWN`; the system must not mass-promote packages or infer support from a source alias.

### M07-FR5 — Evaluate approved dependency directions

- Behavior: Reviewers can compare observed production edges with the approved neutral target boundary and distinguish allowed edges, prohibited edges, approved exceptions, and unresolved edges; the approved neutral target contains no cycle.
- Origin/dependencies: `M07-BR4`; 0017 architecture target.
- Failure behavior: A relationship outside the approved target boundary is not labeled an M07 violation solely because it is brownfield.

### M07-FR6 — Preserve exception ownership and freshness

- Behavior: Each accepted legacy exception exposes its scope, owner role, reason, approval, and review/exit trigger to maintainers and reviewers.
- Origin/dependencies: `M07-BR6`.
- Failure behavior: Missing, expired, or candidate-stale approval returns the relationship to unresolved status.

### M07-FR7 — Demonstrate public consumer compatibility

- Behavior: For each package classified public, an authorized consumer can use the supported public entry point and obtain the documented package capability without relying on private source paths.
- Origin/dependencies: `M07-G3`; 0341 M07 ready criterion.
- Failure behavior: Failure to resolve the supported entry point is recorded for that package and candidate; other packages are not declared broken by association.

### M07-FR8 — Report evidence freshness and limits

- Behavior: Every report identifies the candidate/worktree scope, evidence method, checks actually executed, known blind spots, and stale conditions.
- Origin/dependencies: 0017 dirty-worktree limitation; original task's candidate preservation requirement.
- Failure behavior: Evidence from a changed candidate is marked stale and cannot satisfy current acceptance without revalidation.

### M07-NFR1 — Complete scope coverage

- Context/workload: Every current workspace owner under `apps/*` and `packages/*` for the candidate in the approved M07 slice.
- Measure and target: `owners_with_complete_inventory / current_workspace_owners`; target `100%` or an explicit, review-blocking coverage gap.
- Environment/method: Candidate-specific local static inventory, followed by only the checks approved in the M07 SPEC/BUILD gate.
- Consequence of failure: No complete M07 conformance claim.

### M07-NFR2 — Reproducible evidence

- Context/workload: Repeated inventory of the same candidate and same classification rules.
- Measure and target: Same normalized owner/dependency classifications and exception status; target exact agreement or an explained, reviewable difference.
- Environment/method: The evidence method and candidate identity will be selected in SPEC and recorded with the result.
- Consequence of failure: Results remain unresolved or stale; no pass is claimed.

### M07-NFR3 — Traceable classifications

- Context/workload: Every dependency, export, and project-reference result presented for review.
- Measure and target: `results_with_owner_and_source_evidence / all_results`; target `100%`.
- Environment/method: Source-linked report and candidate-specific evidence reviewed by an independent reviewer.
- Consequence of failure: Untraceable results cannot satisfy acceptance.

### M07-NFR4 — Safe, local scope

- Context/workload: M07 discovery, PRD, SPEC, and any later separately approved local slice.
- Measure and target: Zero real data, external integration, production action, or sensitive effect; target zero.
- Environment/method: Inspect commands, changed files, candidate, and execution evidence at each gate.
- Consequence of failure: Stop the task, preserve evidence, and route for human review; no production claim.

## Acceptance criteria

- `M07-AC1`: Given an identified candidate, when maintainers review the M07 inventory, then every current `apps/*` and `packages/*` owner is represented or an explicit coverage gap blocks acceptance.
- `M07-AC2`: Given each classified direct workspace dependency, when reviewers compare source use and manifest declarations, then every direct production dependency is declared in the approved category and test/build-only relationships remain separately classified.
- `M07-AC3`: Given the candidate public-package set, when a consumer uses each package's supported public entry point, then the package resolves through its declared public contract; no package outside the approved set is assumed public.
- `M07-AC4`: Given the approved neutral target boundary, when the dependency graph is reviewed, then the target follows `harness` → `harness-orchestrator` → `harness-contracts`, contains no cycle, and has zero unapproved prohibited production edges; every exception has current approval and complete ownership/review metadata.
- `M07-AC5`: Given a project-reference result, when reviewers compare it with the approved TypeScript build contract, then every required reference is present and each absent optional reference is reported without being called a build failure.
- `M07-AC6`: Given a compatibility slice, when the approved consumer check is executed against the same candidate, then existing supported public entry points remain usable and any intentional breaking change is explicitly approved and versioned before implementation.
- `M07-AC7`: Given any M07 result, when an auditor reads its evidence, then the candidate, commands/checks actually executed, file-change scope, result status, limitations, and freshness are clear; an unrun build/test is never represented as a pass.
- `M07-AC8`: Given this PRD alone, no code, build, test, service, database, external integration, real data, unrestricted production activity, or sensitive action is authorized. Sensitive actions require explicit human approval or handoff; real appointments are never confirmed, cancelled, or rescheduled automatically; clinical, financial, and definitive-record actions remain prohibited; and RAG requires an approved institutional source. A separate validated SPEC, human review, and M07 local BUILD gate are required before implementation.
- `M07-AC9`: Given an approved M07 SPEC and local BUILD gate, when a selected package slice is completed, then its isolated build, applicable typecheck/lint, dependency-direction regression, and public-consumer compatibility evidence are recorded against the same candidate; prior baseline failures remain visible and do not become M07 passes.

## Errors and edge cases

| Condition | User-visible behavior | State/side effects | Recovery |
| --- | --- | --- | --- |
| Import is dynamic, non-literal, or not statically resolvable | Show `UNRESOLVED` with the owner and source location. | No classification or code change is made automatically. | Decide the evidence method in SPEC or retain a documented exception. |
| Relationship appears only in tests | Show it in the test dependency view, not as a production edge. | No runtime dependency conclusion. | Reclassify only if an approved source/context rule shows production use. |
| Package public status is unknown | Show `UNKNOWN`; do not score its exports as public-contract failure or success. | No mass export or source alias promotion. | Obtain an explicit public-package decision. |
| Project reference is absent but the build contract is unknown | Report the observed configuration and mark requiredness unresolved. | No build-failure claim. | Define project-reference requirements in SPEC and run only the authorized check. |
| Candidate changes after inventory | Mark affected evidence stale. | Prior results remain historical. | Re-inventory the exact candidate before the relevant gate. |
| Existing legacy edge has no current exception approval | Show `UNRESOLVED`; do not treat it as accepted. | No new dependency or behavior is authorized. | Obtain task-scoped review or include it in an approved change slice. |

## Metrics and analytics

| ID | Type | Definition/formula | Baseline | Target/window | Source/owner | Guardrail |
| --- | --- | --- | --- | --- | --- | --- |
| `M07-MET1` | Coverage | Workspace owners with complete inventory / current owners in scope. | Discovery observed 25 owners (3 apps, 22 packages); this is not a fresh promotion snapshot. | 100% for the exact candidate before M07 acceptance. | Inventory; package-maintainer role. | Missing owners block a completeness claim. |
| `M07-MET2` | Dependency conformance | Classified direct production edges with a declaration in the approved category / all classified direct production edges. | Discovery observed no unmatched bare internal `@cvg/*` package pair; declaration-category correctness was not a build proof. | 100% for the exact M07 slice. | Manifest/import inventory; package-maintainer role. | Do not count unresolved edges as passing. |
| `M07-MET3` | Public compatibility | Approved public packages resolving through their approved public entry point / total approved public packages. | Public package set and baseline are not yet classified. | 100% for the approved set and consumer context. | Authorized consumer evidence; package-maintainer role. | Do not treat unclassified packages as failures or passes. |
| `M07-MET4` | Target boundary | Unapproved prohibited production edges inside the approved neutral target. | Discovery found no import cycle in the observed production graph; prohibited-edge count was not the same measurement. | 0 for the approved target boundary, or explicitly accepted current exceptions. | Candidate-specific graph review; architecture authority. | No claim about the full brownfield graph. |
| `M07-MET5` | Project-reference conformance | Required production dependency edges with the reference mandated by the approved build contract / all such required edges. | Discovery observed 27 edges without a matching project reference across 13 projects; this was not proven to be a build failure. | 100% of edges the approved contract says require a reference. | Candidate-specific project-reference evidence; package-maintainer role. | The required edge set must be defined before calculating compliance. |
| `M07-MET6` | Exception completeness | Active exceptions with owner role, reason, scope, approval, and review/exit trigger / all active exceptions. | Current approved exception inventory is unknown. | 100%; otherwise the edge is unresolved. | Exception register; architecture authority. | Expired or stale exceptions do not count as active approval. |

No adoption or production SLO is defined for this internal package-governance task. Latency, CI cost, and developer-time baselines remain unknown and may be measured in SPEC only if they affect a product decision.

## Dependencies, risks, and open questions

| ID | Item | Evidence/confidence | Impact | Owner | Gate/trigger |
| --- | --- | --- | --- | --- | --- |
| `M07-R1` | The worktree is dirty and the Discovery is candidate-specific. | Confirmed by 0017; current inventory predates any later source changes. | Any source drift can stale counts and acceptance evidence. | M07 task owner | Refresh against exact candidate before implementation and promotion. |
| `M07-R2` | The public package set is not named. | Unknown in 0017; exports vary across 22 packages. | Public compatibility requirements could be over- or under-scoped. | Architecture authority | Decide the set before public-export acceptance is measured. |
| `M07-R3` | Project-reference requiredness is not established by the static count. | 27 absent references were observed; no isolated build was executed. | Blindly adding references or calling them failures may change build behavior unnecessarily. | Package-maintainer role | Define requiredness and evidence in SPEC. |
| `M07-R4` | Static source analysis can miss dynamic, generated, or non-literal dependencies. | Discovery reports bounded scan limitations. | A clean inventory may not prove all runtime loading paths. | M07 task owner | State tool coverage and residual blind spots with evidence. |
| `M07-R5` | Legacy architecture documents conflict. | 0017 identifies divergence between 0103 and 0116 and the newer neutral target. | A broad refactor could follow the wrong graph. | Architecture authority | Use the documented neutral target only after resolving applicable rules in SPEC. |
| `M07-R6` | The final Discovery review retains a D4 evidence limitation. | M07 final record is `CONDITIONAL_PASS`; the original reviewer packet lacked the round command/file-change log. | Historical Discovery process provenance is incomplete; this does not prove a safety breach. | M07 task owner | Preserve the limitation in any current gate and recapture provenance for later candidate work. |
| `M07-OQ1` | Which exact package set is public and which entry points are supported? | Open; no list in 0017. | Blocks public-export acceptance for unclassified packages. | Architecture authority | Decide before the affected SPEC slice. |
| `M07-OQ2` | Which direct imports require TypeScript project references under the selected build contract? | Open; the static report cannot decide requiredness. | Blocks reference-conformance calculation. | Package-maintainer/architecture roles | Decide in SPEC before BUILD checks. |
| `M07-OQ3` | Which target-boundary exceptions are acceptable, and who owns their review? | Open for each affected edge. | Unowned or expired edges cannot pass. | Architecture authority | Resolve per exception before implementation. |
| `M07-OQ4` | How should type-only, optional, generated, and dynamically loaded dependencies be classified? | Open technical/product boundary. | Can change direct-dependency measurements. | M07 SPEC owner | Define before freezing the inventory procedure. |

## Traceability and exit

| Discovery/problem | UC/workflow | BR/FR/NFR/AC | Metric |
| --- | --- | --- | --- |
| 0017: workspace contains production and test edges that must not be conflated. | UC-M07-01 | BR1, BR2; FR1–FR3; NFR1, NFR3; AC1–AC2 | MET1–MET2 |
| 0017: public exports are not uniform and public status is not classified. | UC-M07-02 | BR3, FR4, FR7; NFR3; AC3, AC6 | MET3 |
| 0017: neutral target differs from the brownfield graph. | UC-M07-01, UC-M07-03 | BR4, BR5; FR5, FR8; AC4–AC5, AC7 | MET4–MET5 |
| 0017: legacy edges need owned, current exceptions. | UC-M07-03 | BR6; FR6; AC4, AC7 | MET6 |
| 0017: results belong to a dirty candidate and need current evidence. | All use cases | BR5; FR8; NFR2–NFR4; AC7–AC8 | MET1–MET6 |

- Next gate: task-specific human validation of SPEC-M07-001.
- Next action: complete the documentary M07 SPEC and its independent review; do not begin BUILD by inference.
- Gate limits: this PRD approval authorizes SPEC preparation only. It does not approve BUILD, code changes, tests, services, databases, external integrations, real data, production, or sensitive actions. G21-5/G21-6 remain closed; production remains `NO_GO`.
