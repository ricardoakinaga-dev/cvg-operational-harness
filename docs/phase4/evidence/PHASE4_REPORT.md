# Phase 4 Controlled Report — AAA-41

## Current status

The implementation and focused adversarial evidence are complete for the
controlled synthetic slice. The repaired source and evidence bundle are frozen
for final certification. Two fresh read-only critic attempts were bounded and
ended without a report; the mutation sentinel matched before/after. This is
recorded as a limitation, not as approval, and caps the controlled verdict at
`CONDITIONAL_PASS`. Production is `NO_GO`.

## Delivered

- Neutral capability descriptors and implementation ports remain separate.
- Registration is explicit, immutable, duplicate-free, and exact-versioned.
- One internal adapter composes capabilities through the existing governed
  Runtime; no second policy, approval, or effect authority was introduced.
- Bounded input/output/result handling fails closed for malformed, cyclic,
  oversized, non-finite, accessor, sparse, unsupported-prototype, and invalid
  values without confirming an effect.
- Origin parity, provider replacement, deterministic fingerprinting, tenant
  isolation with payload-authority rejection, 20-way concurrency, replay,
  composition mismatch, uncertain outcomes, durable worker composition,
  durable approval recovery, public conformance, and candidate-scope controls
  are covered.

## Verification metrics for the repaired tree

- Focused harness/public-consumer suite: 4 files / 41 tests passed.
- Capability PostgreSQL integration suite: 1 file / 4 tests passed against a
  disposable local PostgreSQL fixture.
- `npm run typecheck`, `npm run lint`, `npm run build`, and the verifier
  self-test passed.
- The final full unit, PostgreSQL, and certification metrics are bound only by
  the final candidate artifacts below; earlier certification runs are
  superseded after the repaired source change.

## Mechanical certification status

- The complete certification command ran against the disposable local
  PostgreSQL fixture.
- Unit: 258 files / 1,811 passed / 115 skipped.
- Coverage: 90.86% statements, 85.27% branches, 91.61% functions, 91.47%
  lines.
- PostgreSQL: 27 files / 200 passed / 0 skipped.
- E2E: 6 files passed. Evals: 56 scenarios, task success 94.6428%, unsafe,
  policy-violation, and hallucination rates 0. Chaos: 14 passed / 2 not
  executed by declared policy.
- Load: 10,000 processed, loss 0, duplicates 0. Restore digest, outbox, and
  tenant isolation passed; production RPO/RTO remains not validated.
- SBOM and licenses passed. The required `format` gate failed on 440
  repository-wide brownfield files; all other required gates passed.
- The generated candidate manifest, phase result, certification manifest, and
  raw-log hashes are the final authority; `npm run certification:verify`
  therefore returns nonzero only for the required `format:FAIL` condition.

## Final audit disposition

- Round-one critic findings were repaired and recorded in
  `CRITIC_ROUND_1.md`.
- Fresh critic attempt 1 and attempt 2 returned no report within their bounded
  windows; `FINAL_CRITIC.md` records both outcomes and does not claim approval.
- `FINAL_SENTINEL.json` records equal pre/post fingerprints and
  `mutationDetected: false` for the read-only critic window.
- The final candidate digest, raw gate results, mechanical decision, and
  verification coherence are authoritative only in the generated files linked
  by `EVIDENCE_MANIFEST.json`.

The final certification artifacts generated after this critic/sentinel freeze
are the authority for the current candidate ID, raw-log hashes, mechanical
decision, and any format or environment failures.

## Limits and release decision

This is not a production approval. There are no real providers, channels,
MCP servers, network calls, credentials, patient data, clinical/financial
actions, scheduling changes, definitive records, deployment actions, or
unreviewed side effects. MCP remains a simulated optional origin. The boundary
does not claim to sandbox arbitrary malicious in-process code. Controlled
PostgreSQL restart-equivalent behavior does not qualify production
exactly-once behavior.

The final controlled verdict is `CONDITIONAL_PASS` for the controlled
functional slice, capped by the unavailable fresh critic report and the
documented internal-source/public-surface limitation. It must preserve any
mechanical `NO_GO` caused by a required gate (including repository-wide format
drift), and production remains `NO_GO`.
