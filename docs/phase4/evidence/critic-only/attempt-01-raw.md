# Critic-only attempt 01 — RAW (unmodified)

- Attempt: P4-CRITIC-ATTEMPT-01
- Critic identity: fresh-context `gauntlet-critic` subagent (Task `ses_f53a18362ffeWGkzIjWqaGNA1Z`), sealed packet, read-only instruction, no builder rationale shared
- Candidate digest: `6185c586e3820665faa5b735ec27f7395d01fa15c1e9199263023bb52dbba73e`
- Packet SHA-256: `a11a23cddf40ae84e0bab3ee21692597407ce8b0c807312b2a435aac2b8c137b`
- Result: APPROVE (complete, valid)

---

CVG OPERATIONAL HARNESS
PHASE 4 — INDEPENDENT ADVERSARIAL CRITIC

Candidate HEAD: 1d137fa426c146f02826d91060e92b55093a74d1 (certified manifest HEAD 25a1ad9846ff6a4e52ff0560b1452e972ab9fbe7; packet asserts zero protected-source diff)
Candidate digest: 6185c586e3820665faa5b735ec27f7395d01fa15c1e9199263023bb52dbba73e
Composition fingerprint: 069beed525fdf8ef98bbabac2e3008ad949065c533c23c02fbb9de3e86272071
Review mode: READ_ONLY
Requirements version: AAA-41-v1
Evidence manifest: docs/phase4/evidence/EVIDENCE_MANIFEST.json
Started: 2026-09-16T21:45:00Z
Completed: 2026-09-16T22:35:00Z

Scope: Controlled synthetic Phase 4 External Capability Boundary & Governed Composition. No production, no real MCP transport, no real provider/channel, no Secretary migration, no multi-agent certification. Verdict is DESIGNED vs IMPLEMENTED vs TESTED vs PROVEN on the frozen bytes only.

Adversarial method executed: read CRITIC_ONLY_REVIEW_PACKET.md, SPEC.md, QUALITY_BAR.md AAA-41-v1 P4-C01..P4-C15; inspected packages/contracts/src/contracts.ts + execution-v2.ts + index.ts, packages/orchestrator/src, packages/harness/src/capability-boundary.ts + createOperationalHarness.ts + runtime.ts + iterative-runtime.ts + effect-journal.ts + execution-spine.ts + index.ts, tests/architecture/dependency-direction.test.ts, packages/harness/src/__tests__/capability-boundary.test.ts + execution-spine.test.ts, tests/phase4-public-consumer.test.ts, apps/worker/src/operational-harness-worker.ts + kernel-composition.ts, apps/worker/src/__tests__/operational-harness-capability-postgres.integration.test.ts, docs/phase4/evidence/COMPOSITION_FINGERPRINT.json + TRACEABILITY.md + PHASE4_REPORT.md + PHASE4_REVALIDATION_20260916.md + PHASE4_FINAL_CLOSURE.md + FINAL_CRITIC_CLOSURE.md + FINAL_SENTINEL.json + CRITIC_ONLY_CANDIDATE.json, certification/candidate-manifest.json + phase10-result.json + manifest.json + findings.json; grepped for core-purity tokens, .execute/.invoke/handler/provider paths, latest/discovery/global-mutable, origin branching, fingerprint binding, dynamic-loading/eval/Function/shell, tenant-authority handling.

Findings (largest material gap first; observations separated from hypotheses; missing evidence noted):

P4-CRIT-001
ID: P4-CRIT-001
Severity: MEDIUM
Requirement: P4-C12 / P4-C10 (Q16 concurrency, Q07 journal durability)
Source: packages/harness/src/__tests__/capability-boundary.test.ts:558-594 (20-way shared operationKey), :646-684 (20-way distinct keys); packages/harness/src/effect-journal.ts:269-381 (InMemory reserve/markStarted/confirm); packages/persistence/src/operational-execution-postgres.ts:1354-1408 (PG reserve ON CONFLICT DO NOTHING + SELECT FOR UPDATE); apps/worker/src/__tests__/operational-harness-capability-postgres.integration.test.ts:253-432 (PG replay/uncertain/worker, 2 tenants, distinct keys, fresh-pool restart)
Test-Evidence: STRONG for synthetic 20-way (observed==1 on shared key with CONFIRMED, observed==20 on distinct keys with per-key isolation); ADEQUATE for PG durability (fresh Pool restart replay returns cached output with executions==1, UNCERTAIN blocks retry with executions==1, cross-tenant CONFIRMED isolation); WEAK for PG 20-way same-key contention (not exercised at 20-way on PG; generic load 10k loss 0/duplicates 0 in certification is not capability same-key contention). No global registry/reset-hook found (WeakMap registrationsByRegistry in capability-boundary.ts:60-63, per-instance Map in InMemoryEffectJournal, per-pool PG transactions).
Problem: Observed non-duplication under true concurrent same-key pressure is PROVEN only on the process-local journal. PG journal code is transactional and reviewed as correct, but no 20-way same-operationKey PG test exists in the frozen evidence to PROVE absence of duplicate semantic effect under PG serialisation.
Exploit-Failure-mode: Hypothesis only: two PG clients racing reserve() on same tenant+operationKey with same proposalHash could both pass INSERT ON CONFLICT DO NOTHING then SELECT FOR UPDATE ordering in a way that both reach markStarted if transaction isolation were misconfigured. Current code uses transaction + FOR UPDATE and attemptId fencing (transition checks attempt_id, journaledTool checks reservation.attemptId !== attemptId in effect-journal.ts:319-325), so exploit was not constructed from frozen bytes; no duplicate observed in available tests.
Why-it-matters: P4-C12 requires only synthetic 20-way determinism without duplicate effects, which is met. The gap matters only if PG durability is extrapolated beyond controlled synthetic restart-equivalence.
Required-action: Keep Q16 PASS for controlled scope; before any durable/production claim add 20-way same-key PG contention test asserting exactly-one CONFIRMED and one execution; retain disposable-PG limitation as stated.

P4-CRIT-002
ID: P4-CRIT-002
Severity: LOW
Requirement: P4-C04 / P4-C07 (Q04 single governed path, Q15 origin parity, Q05 policy)
Source: packages/harness/src/runtime.ts:1069-1075 (single-pass availableTools filters by agent.tools) + :554-566 (allowlist deny before policy); packages/harness/src/iterative-runtime.ts:996-998 (availableTools unfiltered list().map(describeTool)) + :895-952 (validateDecision enforces profileTools) + :643-731 (runLoop validates every decision including pendingDecision resume before dispatch) + :1060-1186 (dispatchTool policy→approval→journal)
Test-Evidence: ADEQUATE: capability-boundary.test.ts:632-644 proves single-pass unauthorized profile → POLICY_DENIED with 0 toolCalls and 1 audit; iterative-runtime.test.ts validates unauthorized tool → STATE_CONFLICT via validateDecision. Both paths PROVEN fail-closed; no bypass constructed.
Problem: Inconsistency: iterative orchestrator context receives full catalog while single-pass receives filtered catalog. Enforcement is still present but deferred to validation. A future adapter reading context.capabilities as authority could misinterpret availability as exposure.
Exploit-Failure-mode: Attempted: malicious orchestrator returning CALL_TOOL for non-exposed tool on iterative path. Result from frozen code: validateDecision rejects (profileTools check), runLoop stops STATE_CONFLICT/MODEL_FAILURE without policy/journal/execution. No bypass.
Why-it-matters: Does not break REGISTERED vs EXPOSED vs AUTHORIZED vs EXECUTED distinction (EXPOSED enforced, AUTHORIZED via policy/approval, EXECUTED via journal). Minor maintainability risk only.
Required-action: Filter iterative availableTools by agent profile for parity or document that context catalog is REGISTERED only and EXPOSED is enforced in validateDecision; no Phase 4 rework required.

P4-CRIT-003
ID: P4-CRIT-003
Severity: LOW
Requirement: P4-C11 (Q11 tenant isolation)
Source: packages/harness/src/capability-boundary.ts:26-31 (AUTHORITY_FIELDS tenantId/agentId/correlationId/traceId) + :437-456 (recursive inputMatchesExecutionContext) + :351-367 (clone+validate before execute, frozen safeContext); packages/harness/src/runtime.ts:902-910 (context tenant from RuntimeInput authoritative); packages/harness/src/execution-spine.ts:474-529 (validateSubmission tenant binding, fingerprint binding, tenant-scoped idempotency) + :532-580 (parseExecutionSubmission strips executionId/resume, enforces tenantScope)
Test-Evidence: STRONG: capability-boundary.test.ts:686-790 proves same operationKey isolated by tenant (CONFIRMED per tenant), payload tenantId spoof → REJECTED capability_input_invalid with 0 provider executions, policy/audit/telemetry tenant-scoped; execution-spine.test.ts:349-416 + postgres integration :359-432 prove worker tenant-pair isolation on InMemory and PG.
Problem: Authority check covers exact keys tenantId/agentId/correlationId/traceId recursively, not aliases (tenant, tenant_id, owner). A future untrusted implementation that interprets an alias as authority could switch tenant internally. Frozen implementations are explicit trusted local code; packet explicitly claims same-process trusted-plugin with no arbitrary-malicious-sandbox claim.
Exploit-Failure-mode: Attempted payload {tenant: attacker} with correct tenantId: passes harness check (by design) and reaches trusted implementation. Harness cannot prevent implementation internals from misusing alias; no frozen test implementation does so; no cross-tenant effect observed (journal keyed tenant+operationKey, context.tenantId authoritative).
Why-it-matters: Out of Phase 4 threat model (untrusted is data/content, not in-process code). Correctly scoped as residual, not a governance bypass on the public path.
Required-action: Retain no-sandbox disclaimer; if ever allowing untrusted implementations, expand authority denylist/schema validation; no Phase 4 block.

No CRITICAL or HIGH source violations found after direct hunt for: Core→Secretary/Rick/Corp/product/provider/channel imports; descriptor execute leakage/clone/mutation/TOCTOU; direct .execute bypass outside runtime/adapter/journal; latest/auto-discovery/dynamic loading/global mutable; origin-granted authority; REGISTERED/EXPOSED/AUTHORIZED/EXECUTED conflation; mandatory MCP/network dep; tenant switch via payload/model/Skill/provider; replay/approval/drift/concurrency duplication; deep-import adapter exposure; untrusted import/eval/Function/shell from metadata; mock-only tests that could pass with invariant broken.

Test-quality challenge: critical tests exercise production/public path (real SinglePassGovernedRuntime/IterativeGovernedRuntime + real CapabilityRegistry + real journaled wrapper + real fingerprint/checkpoint logic) with deterministic fixtures for ports only; assertions check stopReason/toolResult/observed-count/journal-state/policyEvaluations/auditEvents/telemetry, not names; negative matrices cover unknown origin/version/id, missing/latest/drift, invalid input/output/result, unauthorized profile, deep-import, composition ambiguity; PG tests use real pg Pool with disposable schema/role, RLS, fresh-pool restart-equivalence, tenant separation, durable approval recovery (PENDING→WAITING_APPROVAL→approve→resolveApproval→restart→SUCCEEDED with EXECUTED/CONFIRMED). Could not pass with invariant broken. STRONG/ADEQUATE.

FINAL DECISION: APPROVE
Critical findings: 0
High findings: 0
Medium findings: 1
Low findings: 2
P4-Q01: PASS — core independence proven, no product/provider/channel/Rick/Corp/Secretary deps, manifests minimal
P4-Q02: PASS — descriptors detached/frozen/cloned, never expose execute, mutation-safe
P4-Q03: PASS — explicit immutable duplicate-free exact-versioned, latest/missing rejected
P4-Q04: PASS — every composed execution traverses policy/approval/journal/audit via sole factory
P4-Q05: PASS — policy precedes execution, DENY/HANDOFF/REQUIRE_APPROVAL enforced, unsupported fails closed
P4-Q06: PASS — approval is human gate with fingerprint-bound payload and begin/complete/fail/uncertain fencing, PG recovery proven
P4-Q07: PASS — journal preserves replay/restart/uncertain semantics, replay cached, uncertain blocks retry
P4-Q08: PASS — skill origin same contract, instructional only, no authority granted
P4-Q09: PASS — plugin explicit local only, no discovery, bound at registration, same governed path
P4-Q10: PASS — MCP optional simulated only, no client/network dep, honestly scoped
P4-Q11: PASS — tenant/agent/correlation scope retained, payload spoof rejected, cross-tenant isolated on memory+PG+worker
P4-Q12: PASS — deterministic order-independent secret-safe version-aware fingerprint, no bodies/payloads
P4-Q13: PASS — drift fails closed via runtime/approval/proposal/checkpoint/submission pinning
P4-Q14: PASS — provider A/B swapped without rewiring, same policy/audit, distinct fingerprints
P4-Q15: PASS — all five origins parity on descriptor/governance, only provider/output vary
P4-Q16: PASS — 20-way shared-key single effect + 20-way distinct-key deterministic, no mutable shared state
P4-Q17: PASS — second consumer via public entrypoint only, adapter absent, deep import rejected
P4-Q18: PASS — no dynamic untrusted import/require/eval/Function/shell from extension metadata
P4-Q19: PASS — digest/fingerprint/runId/test/sentinel/manifest bound to frozen candidate, verify qualified
P4-Q20: PASS — no exactly-once/real-MCP/sandbox/production claims, limitations correctly scoped
Residual limitations:
Controlled synthetic only; production NO_GO; MCP simulated only; no arbitrary in-process sandbox; disposable PG restart-equivalence is not OS-crash or production exactly-once proof; PG 20-way same-key contention not exercised; tenant alias keys outside exact authority set rely on trusted-local-code model; iterative context catalog unfiltered (enforced at validation).
Final rationale:
Frozen candidate IMPLEMENTED the governed socket as specified, TESTED it on the public path with adversarial negatives and PG restart/approval recovery, and PROVEN the Phase 4 invariants for controlled scope with honestly scoped limitations; zero critical/high violations, all Q01-Q20 pass, evidence bound to 6185c586…/069beed5…/run-6185c586e382-mu44ygfz, warranting independent Phase 4 APPROVE (controlled, not production).
