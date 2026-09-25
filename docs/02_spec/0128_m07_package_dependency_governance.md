# SPEC — M07 package dependency governance

## Record and readiness

- Document ID: SPEC-M07-001
- Version: 0.1
- Status: SPEC_APPROVED_FOR_M07_S1_GATE_PREPARATION; human approval recorded at 2026-09-23T20:46:09Z. Approval covers the SPEC and its four recommendations only for preparation of the separate local BUILD gate and candidate baseline; no implementation or check execution is authorized.
- Task: M07, P1-S1
- PRD origin: [0028 — M07 package dependency governance](../01_prd/0028_m07_package_dependencies.md), version 0.1
- PRD gate: human approval “Approve for SPEC”, recorded 2026-09-23T12:27:40Z; scope is documentary SPEC preparation only
- Updated at: 2026-09-23T20:55:25Z
- Owner: package-maintainer role; named individual owner remains unassigned
- Scope: static local workspace dependency inventory and controlled package-boundary corrections after a separate M07 BUILD gate
- Readiness caveat: PRD review was lead-only I0 (`CONDITIONAL_PASS`), with independent I1 unavailable and integrated verification `NOT_RUN`. SPEC review was lead-only I0 (D1–D9 `PASS_LEAD_ONLY`); independent I1 review was unavailable and integrated verification was `NOT_RUN`, so its verdict remains `CONDITIONAL_PASS`. The M07 Discovery D4 provenance limitation also remains. Human approval records the technical design and four recommendations but does not erase these review limits or authorize code, builds, tests, or runtime work.

## Outcome and architecture drivers

M07 will make direct workspace-package relationships reviewable and enforce only explicitly approved package rules. The design distinguishes source observations from execution results, keeps the whole brownfield graph visible without treating it as the neutral Harness boundary, and binds each conformance result to the candidate and policy that produced it.

Drivers are PRD requirements M07-FR1–FR8, M07-NFR1–NFR4, M07-AC1–AC9, and M07-MET1–MET6. The highest-risk decisions are public-package classification, project-reference requiredness, source-role classification, and candidate freshness. Each remains explicit in the policy and gate evidence.

No runtime service, API, database, queue, migration, production configuration, or application behavior is introduced. The designed deliverable is a local read-only inventory/checker, an explicit policy record, focused regression fixtures, and candidate-bound evidence produced only after a separate BUILD gate.

## Current and target architecture

### Current — observed, candidate-specific

- Root npm workspace patterns cover apps/* and packages/*. M07 Discovery observed 25 owners: 3 apps and 22 packages. This count is historical evidence, not a refreshed complete inventory for the current dirty worktree.
- TypeScript path aliases map package names to source entry points. A passing source typecheck does not by itself prove that a consumer resolves a package through declared exports.
- The neutral Harness target is documented as consumer-to-dependency: @cvg/harness → @cvg/harness-orchestrator → @cvg/harness-contracts. The physical workspace directory for the contracts package is packages/contracts.
- The harness package manifest currently declares contracts and orchestrator; the existing architecture test checks the three neutral packages and a narrow source-token denylist. It does not inventory every workspace edge or prove export resolution.
- Discovery observed 27 production import edges without a matching TypeScript project reference across 13 projects. No isolated package build was run; those observations are not build failures.
- The current worktree contains prior changes, including an untracked AUD19-011 external-dependency manifest test at tests/workspace-dependency-manifest.test.js. That test is outside M07’s internal workspace-edge scanner scope and must be preserved. No test was run for this SPEC.

### Target — proposed until approved

Use a policy-driven, deterministic, read-only checker over in-repository workspace owners. It emits a machine-readable report and a concise review view. The checker classifies internal production, test, build-only, and unresolved edges; compares those edges with each owner’s manifest; evaluates only approved boundary rules; and labels public-export and project-reference results according to explicit decisions.

The first enforceable boundary is the three-package neutral Harness subgraph. The checker reports other workspace relationships but does not impose the neutral rule on product, API, persistence, provider, channel, or legacy packages.

No automatic manifest edits, package promotion, exception approval, source rewriting, dependency installation, network access, or publication is part of the checker.

## Modules and dependencies

| Component | Responsibility | Inputs and outputs | Owned state | Dependencies | Public contract |
| --- | --- | --- | --- | --- | --- |
| Workspace discovery | Expand root workspace patterns and enumerate owners with manifests. | Repository root and manifests → sorted owner inventory and coverage errors. | None. | Node filesystem APIs. | Internal checker module. |
| Source classifier | Resolve in-workspace package imports and classify production, test, build-only, or unresolved edges with source locations. | Owner files, tsconfig aliases, package names, build scripts, and project references → normalized edge records. | None. | TypeScript compiler parser already pinned by the root workspace; no source execution. | Internal checker module. |
| Boundary policy | Hold target packages, public-status decisions, build-reference rules, classifier rules, and exception records. | Versioned policy JSON → validated policy model. | Policy file is reviewed source-control data. | Existing JSON validation capability where available; otherwise a small structural validator. No new service. | Proposed file: config/workspace-dependency-policy.json. |
| Conformance evaluator | Compare observed edges with manifests and approved rules; calculate metrics without counting unresolved items as passing. | Inventory, edge set, policy → findings and metric numerators/denominators. | None. | Discovery, classifier, policy. | Internal checker module. |
| CLI and report renderer | Run the evaluator without side effects and write a deterministic JSON report; optionally render Markdown. | CLI options → stdout or an explicitly selected evidence path. | Evidence file only when an output path is supplied. | Node runtime. | Proposed command: node scripts/workspace-dependency-audit.mjs. |
| Regression fixtures | Prove classifier and policy behavior with small synthetic workspaces. | Temporary fixtures → expected findings and exit status. | Temporary directory removed after each case. | Existing test runner, only after BUILD authorization. | Proposed test surface: tests/workspace-dependency-audit.test.js. |

The existing AUD19-011 test remains a separate check for external package imports. BUILD planning must inspect its interaction with root test discovery and avoid duplicating, deleting, or weakening its contract.

## Policy and data model

The proposed policy file is the single machine-readable authority for M07 rules. Its schema contains:

| Record | Required fields and semantics |
| --- | --- |
| Schema header | Schema version, policy version, owner role, and exact workspace patterns covered. |
| Owner build profile | Workspace name/path, invoking manifest/script or root command, exact configured targets, TypeScript config path when applicable, build mode, and project-reference status: REQUIRED, OPTIONAL, NOT_APPLICABLE, or UNDECIDED. Script/target drift from the reviewed profile makes the profile stale. |
| Source-role rules | Ordered file patterns for production, test, and build-only sources. Files matching no role remain UNRESOLVED; there is no production-by-default fallback. |
| Neutral target | Explicit package identities and permitted consumer-to-dependency edges. Human-approved M07-S1 candidate set: @cvg/harness, @cvg/harness-orchestrator, and @cvg/harness-contracts; every other workspace package remains UNKNOWN until separately classified. |
| Public package classification | Per-package PUBLIC, PRIVATE, or UNKNOWN status, supported root/subpath entry points, compatibility scope, and responsible decision reference. UNKNOWN is the initial value until the architecture authority records a decision. |
| Dependency-category rules | Rules for dependencies, devDependencies, peerDependencies, and optionalDependencies, including evidence required for peer or optional exceptions. |
| Exceptions | Exact source owner and target, production/test role, candidate or policy scope, reason, accountable owner role, approving decision reference, and either reviewBy or an exit trigger. A passed reviewBy date or any missing/stale field makes the edge UNRESOLVED. |
| Fingerprint inputs | Policy version/hash, checker source hashes, Node and TypeScript parser versions, and sorted repository-relative paths with SHA-256 contents for all in-scope manifests, source-role files, tsconfigs, build-script inputs, package-manager lock/config inputs, and policy inputs. |

Public classification is an internal workspace support promise, not npm publication status. A package marked PRIVATE or UNKNOWN is not eligible for an external-consumer compatibility pass. No status is inferred from a package name, current TypeScript alias, exports field, or private manifest flag.

## Source inventory and edge classification

1. Enumerate direct children matching root workspace patterns and require a readable package.json with a unique package name. The initial resolver supports the current one-level apps/* and packages/* patterns; unsupported glob syntax is invalid policy (exit 64), not a partial match. Report every owner and each missing, duplicate, or unreadable manifest.
2. Scan configured source-role globs under each owner. Initial defaults classify files under src/** as production, then override paths in any __tests__ segment, files named *.test.* or *.spec.*, and configured tests/** roots as test-only. Build/config files outside source roots require explicit build-only rules. Exclude dependency trees and generated build output by explicit policy. Record excluded roots and counts. Do not follow symlinks; report a source or import that requires following one as UNRESOLVED.
3. Parse .ts, .tsx, .mts, .cts, .js, .jsx, .mjs, and .cjs files without evaluating source. Use the TypeScript AST to record static imports/re-exports, value versus type-only form, literal dynamic imports, and literal require calls. Resolve tsconfig extends and paths within the repository with cycle and escape checks. Unsupported source extensions containing code, parse failures, unsupported alias forms, and non-literal loaders are UNRESOLVED with file and line.
4. Resolve imports to workspace packages by package identity, configured alias, or resolved cross-workspace relative path. A relative import that reaches another owner is still a direct internal edge. A path escape, ambiguous alias, or inaccessible target is UNRESOLVED.
5. Classify file role using ordered policy rules. Imports from a test-only file are test edges; tool/config files are build-only only when explicitly matched. Mixed or unknown roles remain UNRESOLVED.
6. Deduplicate by owner, target, role, and import form while retaining all source locations. Never merge test and production edges into one production result.
7. Treat dynamic, generated, non-literal, and unsupported forms as visible uncertainty; do not infer absence of a dependency from an incomplete scan.

### Build-only relationships

Build-only edges are a separate relation type, not production imports. Derive them from TypeScript project references and from explicitly named root/workspace build scripts whose target paths can be parsed. The report records the script/config source and target owner. A command string that invokes an unrecognized wrapper or cannot be mapped to an owner remains UNRESOLVED; the checker does not execute it. Root commands such as build:harness are inventoried as build contracts, with their listed projects kept distinct from source-import edges.

## Manifest conformance rules

- A direct production workspace edge must appear in the owner’s dependencies, unless a current policy decision explicitly approves peerDependencies or optionalDependencies for that exact relationship.
- A test-only or build-only workspace edge belongs in devDependencies. A production edge cannot be excused by a transitive dependency or root-level hoisting.
- A type-only production import is reported separately. It may use devDependencies only when the approved public declaration contract proves the type does not escape emitted public declarations. Until then the edge remains UNRESOLVED or is declared in a runtime-consumer-safe category.
- peerDependencies require an explicit host-provided contract and compatible local development declaration. optionalDependencies require an explicit optional-runtime decision and guarded fallback. Neither category is inferred by the checker.
- An edge declared in multiple conflicting categories is a finding. The checker never edits package.json.
- External npm imports are outside the internal-edge report and remain covered by existing repository checks, including AUD19-011.

## Dependency direction and exceptions

The M07-enforced subgraph is limited to the approved neutral target. The proposed direction is:

| Consumer | Permitted direct workspace dependencies |
| --- | --- |
| @cvg/harness-contracts | None |
| @cvg/harness-orchestrator | @cvg/harness-contracts |
| @cvg/harness | @cvg/harness-orchestrator and @cvg/harness-contracts |

The checker rejects a production edge from these packages to product, API, persistence, model/provider, channel, or other implementation packages unless a current exception is approved. It detects cycles in the approved neutral production subgraph. Test-only edges are reported separately and do not create production-cycle findings.

No exception is active by default. A candidate-bound exception identifies the exact edge, scope, reason, accountable owner role, approval record, and review/exit trigger. Any change to source, target, role, policy, or candidate fingerprint makes the exception stale. An exception outside the neutral target is reported but does not widen the enforced target without a separate architecture decision.

## Public package and export compatibility contract

The human-approved narrow candidate set for M07-S1 is @cvg/harness, @cvg/harness-orchestrator, and @cvg/harness-contracts; every other package remains UNKNOWN until separately classified. This decision permits the checker to encode the approved candidate set, but it does not certify export compatibility or authorize a consumer build. M07-AC3/M07-AC6 still require their later, separately gated evidence.

For each package classified PUBLIC:

- The policy names supported package-root or subpath entry points and compatibility expectations.
- The package manifest exposes only approved entry points. Private source paths and TypeScript path aliases do not count as consumer compatibility.
- After an authorized isolated build, a disposable synthetic consumer outside the workspace source-alias context resolves approved JavaScript and TypeScript entry points through package metadata and built artifacts.
- The consumer fixture uses only local workspace artifacts, performs no publication or network access, and is removed after the check.
- Removing or changing a supported entry point is a breaking compatibility change and requires explicit approval and version treatment before implementation.

For PRIVATE or UNKNOWN packages, the report records status and observed exports but does not mark missing exports as public-contract failures or successes. No mass exports change is allowed.

## TypeScript project-reference contract

The report separates observed import edges from reference requiredness. Each owner build profile records its supported build command/configuration and an explicit project-reference status. For REQUIRED profiles, policy names which direct compile-time workspace targets must be referenced. For OPTIONAL, NOT_APPLICABLE, and UNDECIDED profiles, absent references remain informational or unresolved and are not reported as build failures.

The human-approved rule is to require references only for owner projects explicitly named in an approved TypeScript build-graph profile; do not convert Discovery’s 27 absent-reference observations into blanket changes. No owner profile is approved by this decision, so owners remain informational or UNDECIDED until a later profile decision. The existing root build:harness command remains a candidate contract, not approval that every workspace owner requires project references. A later authorized build must execute the selected isolated build to establish actual build behavior.

## CLI and report contract

Proposed invocation: node scripts/workspace-dependency-audit.mjs with --policy <path>, --profile inventory|neutral-target|full-acceptance, --format json|markdown, and optional --output <path>. Defaults are the reviewed policy path, inventory profile, JSON format, and stdout. The command never changes source files or manifests.

The candidate fingerprint is SHA-256 over UTF-8 JSON with lexicographically ordered object keys and sorted path/hash tuples containing checker source files, policy version/hash, Node and TypeScript parser versions, every in-scope manifest and source-role file, tsconfigs and their extends chain, root/workspace build-script inputs, the package-manager lock/config inputs, and policy files. Paths use forward slashes relative to the repository root. Untracked in-scope files are included. Generated report output and timestamps are excluded from the candidate fingerprint. A changed input therefore makes prior evidence stale.

The normalized report is deterministic for identical candidate bytes and policy. Run timestamp and exact command are metadata and are excluded only from the normalized comparison digest. The report contains:

- schema, tool/source hash, Node and TypeScript versions, policy, candidate fingerprint, timestamp, workspace root, and actual command/options;
- complete owner inventory and coverage gaps;
- scanned/excluded files by owner and source-role rule;
- normalized edges with source locations, import form, classification, manifest category, and status;
- public-package decisions and export observations;
- neutral-target edges, cycles, violations, exceptions, and unresolved relationships;
- project-reference observations and policy requiredness;
- metric numerator/denominator and explicit UNKNOWN/UNRESOLVED counts;
- executed checks, unexecuted checks, scan limitations, and stale conditions.

Findings have one of PASS, VIOLATION, UNRESOLVED, or STALE. Unresolved and stale items never count in a passing denominator. The inventory profile requires every owner and configured source file to be enumerated and readable; unresolved edge classifications may remain in its report and never count as conformant. The neutral-target profile additionally requires approved target policy and complete edge classification for that target. The full-acceptance profile requires every decision and evidence item needed for M07-AC1–AC9. Exit 0 means the selected profile is complete and has no blocking findings; 1 means at least one proven policy violation; 2 means the profile is incomplete, ambiguous, or stale; and 64 means invalid CLI or policy input. If both a violation and incomplete evidence exist, the report preserves both and returns 1.

The report omits source contents, secrets, environment values, and runtime payloads. When an output path is supplied, the checker accepts only a repository-local M07 evidence directory and rejects path traversal or symlink escape.

## Security, privacy, and operational limits

- The checker reads repository files and validated JSON only; it does not import or execute workspace packages, invoke shells, install dependencies, access the network, start services, or access a database.
- Parsing is bounded to configured owner roots and file extensions. Symlinks outside the repository, unrecognized file roles, parser errors, and non-literal dynamic loads produce visible unresolved results.
- Reports contain repository-relative paths and dependency names only. They contain no user, patient, appointment, credential, or production data.
- M07 remains local and synthetic. It grants no runtime authority, real-data access, external integration, appointment action, clinical/financial/record action, or RAG answer without an approved institutional source.
- G21-5 and G21-6 remain closed; production remains NO_GO. Sensitive actions continue to require explicit human approval or handoff.

## Failure-first behavior

| Failure | Detection and result | Containment and recovery | Future verification |
| --- | --- | --- | --- |
| Workspace owner or manifest is missing, unreadable, or duplicated | Coverage error; report is incomplete and exits 2. | Do not emit a complete-scope claim; repair inventory only in an approved slice. | Synthetic fixtures for missing and duplicate owners. |
| Source cannot be parsed or its role is unknown | UNRESOLVED file/edge; strict acceptance is blocked. | Preserve location and parser reason; add a reviewed role rule or retain uncertainty. | Fixtures for parser and unclassified-path cases. |
| Import cannot be resolved or is non-literal | UNRESOLVED; never assume no edge. | Do not rewrite source; inspect with a separately approved method. | Fixtures for dynamic import, require, alias, and path escape. |
| Manifest does not declare a direct production edge | VIOLATION if classification/category is proven; otherwise UNRESOLVED. | Correct only that owner/edge in an approved BUILD slice. | Positive and negative manifest-category fixtures. |
| Neutral-target prohibited edge or cycle appears | VIOLATION with complete path. | Stop that slice; do not broaden the target or auto-delete an edge. | Forbidden-edge and cycle fixtures. |
| Public package status or entry point is undecided | UNKNOWN; public compatibility metric is blocked, not passed. | Obtain explicit architecture authority decision before public-contract implementation. | Policy-schema fixture rejects inferred status. |
| Required project-reference policy is undecided | UNDECIDED; no build-failure claim and no conformance pass. | Define owner build contract at human SPEC gate. | Required/optional/unknown reference fixtures. |
| Exception is incomplete, expired, or candidate-stale | UNRESOLVED; exception is not active. | Obtain a new task-scoped approval or plan an authorized edge correction. | Stale, expiry, owner, and approval-reference fixtures. |
| Candidate changes after report generation | Fingerprint mismatch marks report STALE. | Re-run against the new exact candidate and retain old evidence as historical. | Change-one-input fingerprint fixture. |
| Report output escapes evidence root | CLI input error; no write occurs. | Require an explicit safe evidence path. | Path traversal and symlink escape fixtures. |

## Testing architecture and verification plan

No tests, builds, typechecks, lint, services, databases, installations, or integrations were executed for this SPEC. The following checks are proposed for a separately authorized M07 BUILD gate:

1. Unit fixtures for workspace expansion, package-name resolution, source-role rules, internal path aliases, relative cross-workspace imports, type-only imports, test-only edges, duplicate declarations, and deterministic ordering.
2. Negative fixtures for missing/unreadable manifests, duplicate package names, cycles, prohibited neutral imports, missing direct declarations, unknown public status, required/optional project references, incomplete exceptions, stale fingerprints, parser errors, dynamic non-literal imports, unrecognized build scripts, path traversal, and symlink use.
3. A report-generation fixture proving that the same bytes and policy produce the same normalized report apart from documented run metadata.
4. Candidate-specific static report over all workspace owners with unresolved categories visible. It must not claim build success.
5. For the approved neutral target, isolated bottom-up builds of contracts, orchestrator, then harness, followed by relevant typecheck/lint and existing dependency-direction regression.
6. For each human-approved PUBLIC package, compile/run a disposable consumer through declared exports without source aliases. No consumer fixture is created for UNKNOWN or PRIVATE packages.
7. Before/after dependency graph, manifest, export, reference, and candidate-change reports. Existing baseline failures remain separately identified; they are not M07 passes.

Required result labels are PASS, FAIL, UNRESOLVED, NOT_RUN, or STALE. Every executed check records exact command, tool version, candidate fingerprint, exit status, and artifact path. No check may be described as executed unless a future authorized run actually executes it.

## Build slices, rollout, and recovery

Implementation remains gated and is not authorized by this SPEC preparation approval.

| Proposed slice | Boundary and dependency | Exit evidence |
| --- | --- | --- |
| M07-S1: inventory vertical slice | Policy schema, workspace enumeration, internal edge classifier, deterministic report, and fixture tests. It must represent all owners or block with explicit coverage gaps. | Candidate-bound full inventory; unresolved edges visible; no manifest mutation. |
| M07-S2: neutral target enforcement | Approved neutral package set, dependency-direction and cycle checks, and manifest-category comparison for those packages. | Zero unapproved prohibited production edges or current approved exceptions; isolated target builds when authorized. |
| M07-S3: public compatibility | Only after the public-package decision; add disposable consumers for each approved public entry point. | Every approved consumer resolves through declared exports for the same candidate. |
| M07-S4: bounded manifest/reference corrections | Topological batches, provider before consumer; one owner/edge class per reviewable batch. References change only for profiles whose policy is REQUIRED. | Before/after reports, isolated builds, and authorized regressions for each batch. |

The first local BUILD request must name the exact candidate, selected slice, files, synthetic-only command set, reviewer, rollback boundary, and allowed tests. Expansion from S1 to later slices requires updated evidence and an applicable gate. Do not edit or regenerate the historical certification candidate manifest as part of M07.

There is no data migration, service deployment, or runtime cutover. Rollback consists of reverting only M07-owned policy/checker/test changes and the specifically approved package-metadata batch, then regenerating a candidate-specific report. Preserve pre-existing worktree edits and historical evidence. If a package metadata change breaks an approved consumer/build contract, stop downstream slices and restore the last reviewable M07 batch; do not mass-rewrite manifests.

## ADR policy

The proposed scanner, report format, and local-only execution model do not require a separate ADR if approved as written here. Any human decision that changes the neutral target, declares a broader public package set, or accepts a durable cross-boundary exception must be recorded in the applicable architecture decision record before the affected BUILD slice.

## Human decisions recorded at SPEC validation

| Decision | Decision owner | Proposed default for review | Effect if not approved |
| --- | --- | --- | --- |
| Public workspace package set and supported entry points | Architecture authority | APPROVED for M07-S1 candidate policy: @cvg/harness, @cvg/harness-orchestrator, and @cvg/harness-contracts only; every other package remains UNKNOWN. | AC3, AC6, and MET3 still require separately gated export compatibility evidence. |
| Project-reference requiredness | Package-maintainer and architecture authority | APPROVED rule: require references only for explicitly named owners in an approved TypeScript build-graph profile; all other owners remain informational or UNDECIDED. No profile is approved here. | AC5 and MET5 cannot pass for undecided owners; no blanket reference changes. |
| Source-role and dependency-category rules | M07 task owner; architecture authority for public, peer, optional, or boundary decisions | APPROVED rule: use explicit source-role rules and keep production, test, build-only, type-only, and unresolved distinct; unknown roles fail closed. Runtime imports use dependencies except an approved peer/optional contract; test/build-only uses devDependencies; escaping public types cannot be dev-only without emitted-declaration proof. | Affected edges stay UNRESOLVED and cannot count as conformant. |
| Neutral-target exception policy | Architecture authority; accountable package owner role for each edge | APPROVED rule: no exception is active by default; every exception needs the exact edge, owner role, reason, approval reference, candidate scope, and review/exit trigger. | Unapproved target edges remain UNRESOLVED or VIOLATION according to evidence. |

Human decision: “eu aprovo a Spec e as propostas”. The four recommendations above are approved for the M07-S1 policy and gate preparation scope. Evidence: [human decision record](../04_audit/evidence/AUD-20260923/M07-SPEC/human-decision-20260923.md) and [P1-S1 decision ledger](../04_audit/evidence/AUD-20260923/P1-S1/human-decisions-20260923.md). The approval does not authorize implementation or execution.

## Requirement traceability

| Requirement | Design sections | Planned evidence |
| --- | --- | --- |
| M07-FR1, M07-NFR1, M07-AC1, M07-MET1 | Workspace discovery; report contract | Owner inventory and explicit coverage errors. |
| M07-FR2, M07-FR3, M07-AC2, M07-MET2 | Source inventory; manifest rules | Classified direct edges matched to manifest categories. |
| M07-FR4, M07-FR7, M07-AC3, M07-AC6, M07-MET3 | Public package and export contract | Approved-set consumer fixtures through declared exports. |
| M07-FR5, M07-AC4, M07-MET4 | Dependency direction and exceptions | Neutral-target graph, cycle report, and current exception evidence. |
| M07-AC5, M07-MET5 | Project-reference contract | Owner-profile reference report and only authorized isolated builds. |
| M07-FR6, M07-AC4, M07-MET6 | Policy model; exception behavior | Candidate-scoped exception completeness and freshness. |
| M07-FR8, M07-NFR2, M07-NFR3, M07-AC7 | Report contract; fingerprint and failure behavior | Deterministic report with candidate, policy, command, limits, and stale status. |
| M07-NFR4, M07-AC8 | Security and limits | Read-only local tool boundary and explicit closed production/sensitive-action gates. |
| M07-AC9 | Testing and build slices | Same-candidate report, builds, regression, and consumer evidence after local BUILD approval. |

## Gate and handoff

Current gate: SPEC-M07-001 and its four recommendations are approved for preparation of the separate M07-S1 local BUILD gate and candidate baseline only. Lead review is complete; the agent service rejected a fresh I1 critic because its thread limit was reached, so the verdict remains CONDITIONAL_PASS and integrated verification remains NOT_RUN. The next human decision is approval or correction of the concrete M07-S1 BUILD gate.

No code, test, build, typecheck, lint, process, service, database, external integration, real data, sensitive action, or production activity is authorized by the current decision. A later BUILD requires an approved M07 SPEC, recorded human review, and a separate local M07 BUILD gate. M05 remains the next task after M07 and retains its previously approved route A and legacy pair; L09 remains downstream of M05.

- Next gate: separate human approval of the bounded M07-S1 local BUILD request.
- Next action: review and decide the concrete M07-S1 local BUILD request and candidate baseline. Do not begin implementation or run checks until that specific gate is approved.
