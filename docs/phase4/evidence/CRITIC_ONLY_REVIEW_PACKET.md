# Critic-Only Review Packet — Phase 4 AAA-41 (neutral, read-only)

This is the candidate and frozen acceptance surface. Attempt to falsify it.
You are strictly READ-ONLY: do not modify, stage, commit, or write any file.

## Candidate

- Candidate digest: `6185c586e3820665faa5b735ec27f7395d01fa15c1e9199263023bb52dbba73e`
- Composition fingerprint: `069beed525fdf8ef98bbabac2e3008ad949065c533c23c02fbb9de3e86272071`
- Certification run: `run-6185c586e382-mu44ygfz`
- Requirements version: `AAA-41-v1` (`docs/phase4/QUALITY_BAR.md`)
- Mechanical certification: `certification:verify` PASS; phase10 decision
  `CONDITIONAL_GO` / `AAA_CONTROLLED` (independent critic still required)
- Evidence manifest: `docs/phase4/evidence/EVIDENCE_MANIFEST.json`
- Candidate identity: `docs/phase4/evidence/CRITIC_ONLY_CANDIDATE.json`
- Current HEAD at packet freeze: `1d137fa426c146f02826d91060e92b55093a74d1`
  (protected-source diff vs certified manifest HEAD is zero; see candidate file)

## Historical context (careful, non-biasing)

Previous critic attempts in this sequence ended without valid reports
(TIMEOUT / NO_REPORT_WITHIN_BOUNDED_WINDOW). That fact neither implies approval
is expected nor implies rejection is expected. Decide solely on this candidate
and the frozen requirements below.

## Scope

Controlled synthetic Phase 4: External Capability Boundary & Governed
Composition. This is not production certification.

## Non-goals (do not reject for their absence)

Phase 4A conversation layer, Secretary migration, Rick, multi-agent, real MCP
network transport, real provider/channel, real deployment, production RPO/RTO.

## Trust / MCP / durability limits claimed by this candidate

- Harness Core = trusted; explicit local plugin implementation = trusted local
  code; skill content = lower-trust instructional data; model/user/tool/
  knowledge content = untrusted data; MCP remote transport = future/unproven
  (simulated adapter only).
- Simulated/architectural MCP origin only; no real-MCP certification claimed.
- Controlled synthetic/PostgreSQL durability evidence only; no universal
  external exactly-once guarantee claimed.
- Same-process trusted-plugin architecture; no arbitrary malicious in-process
  code sandbox claimed.

## Frozen acceptance surface

- `docs/phase4/SPEC.md`, `docs/phase4/QUALITY_BAR.md` (P4-C01…P4-C15)
- Critic questions P4-Q01…P4-Q20 (see mission)
- Attack surface A–T (see mission)

## Recommended source entry points (you may expand anywhere relevant)

- Capability contracts: `packages/harness-contracts/src/*`
- Capability registry: `packages/harness/src/capability-*`
- Harness public composition: `packages/harness/src/*factory*`,
  `packages/harness/src/*harness*`
- Runtime adapter: capability → ToolRegistry adapter in harness package
- Worker durable path: `apps/worker/src/kernel-composition.ts`,
  `apps/worker/src/operational-harness-worker.ts`
- Policy integration: `packages/policy-engine/src/*`, `packages/policy/src/*`
- Approval integration: approval authority + durable paths
- Effect Journal integration: journal ports/adapters
- Tenant/context propagation: execution context, tenant isolation tests
- Composition fingerprint implementation: registry `compositionFingerprint()`
- Public consumer: `tests/phase4-public-consumer.test.ts`
- Critical negative/adversarial tests:
  `packages/harness/src/__tests__/capability-boundary.test.ts`,
  `packages/harness/src/__tests__/execution-spine.test.ts`,
  `tests/architecture/dependency-direction.test.ts`
- PostgreSQL evidence: `apps/worker/src/__tests__/*postgres*`
- Certification artifacts: `certification/phase10-result.json`,
  `certification/manifest.json`, `certification/candidate-manifest.json`
- Phase 4 evidence: `docs/phase4/evidence/PHASE4_REPORT.md`,
  `EVIDENCE_MANIFEST.json`, `COMPOSITION_FINGERPRINT.json`,
  `TRACEABILITY.md`, `CRITIC_ROUND_1.md`

## Required output

Begin with:

```text
CVG OPERATIONAL HARNESS
PHASE 4 — INDEPENDENT ADVERSARIAL CRITIC

Candidate HEAD:
Candidate digest:
Composition fingerprint:
Review mode: READ_ONLY
Requirements version:
Evidence manifest:
Started:
Completed:
```

End with:

```text
FINAL DECISION: APPROVE | REJECT

Critical findings:
High findings:
Medium findings:
Low findings:

P4-Q01:
...
P4-Q20:

Residual limitations:

Final rationale:
```

- Return exactly one of APPROVE / REJECT with the P4-Q01…P4-Q20 verdicts.
- Finding IDs: P4-CRIT-001, … Severity: CRITICAL / HIGH / MEDIUM / LOW / INFO.
- Reference representative real source/test surfaces for every critical
  conclusion (core purity, contracts, registry, runtime composition,
  policy/approval path, effect journal, tenant isolation, composition
  fingerprint, provider swap, concurrency, public consumer, negative safety).
- Classify evidence strength where useful: STRONG / ADEQUATE / WEAK / MISSING.
- Preserve residual limitations honestly.
