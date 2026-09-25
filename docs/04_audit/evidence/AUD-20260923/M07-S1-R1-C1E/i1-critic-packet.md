# Sealed I1 review packet — M07-S1-R1-C1E

## Role and objective

Fresh independent critic. Inspect the exact C1E artifact and evidence against the frozen criteria in `quality-bar.json`. Return APPROVE, REJECT, BLOCKED, or INVALID. Do not edit repository files, run tests/builds, access a database/network/service, or spawn descendants.

## Authoritative criteria and rules

- Frozen bar: `quality-bar.json`, version `M07-S1-R1-C1E-v1`.
- Human-approved gate: `output-path-correction-gate.md`, SHA-256 `75b6307384074660bde873ca4aa95bfedfb52c1f58d2448ad227e96e87ad34cc`.
- Approved preview: `output-path-correction-preview.md`, SHA-256 `3c4b80ad07a1bf59cce8279b40e916140c908b5d7f7a518caf1d0362e57100ec`.
- Repository instructions: `AGENTS.md` and `docs/07_agents/AGENTS.md`.
- Scope is local and synthetic. G21-5/G21-6 remain closed; production remains `NO_GO`; no real data or sensitive actions are authorized.

## Artifact to inspect

- Exact candidate fingerprint: `58dce96bb29255f77bc99c4f883f8205e4272c2a94cb26d34f10b395ab042501`.
- Candidate manifest: `execution-candidate-manifest.json`.
- Dependency report: `workspace-dependency-report.json`.
- Structured command records and raw stdout/stderr: `command-records.json` and the referenced `*.log` files.
- Current C1E code paths: `config/workspace-dependency-policy.json`, `scripts/workspace-dependency-audit.mjs`, `tests/workspace-dependency-audit.test.js`.
- Pre-change snapshots: `rollback-baseline/` and `rollback-baseline.sha256`.
- The already-approved C1 fixture remains a candidate input and is not owned by this C1E review.

## Review procedure

Read the actual files and evidence. Compare the diff to the exact approved preview; verify candidate/report binding, the four delta paths, inventory semantic fields, raw command exits/durations/skips, coverage evidence, post-check, and whether any claim exceeds observed results. Read-only hash and JSON consistency checks are allowed. Do not rerun a deterministic test or coverage command; the recorded result is the evidence under review.

## Excluded context

Do not read `.gauntlet/` or archived Gauntlet histories, earlier critic reports, builder narratives, suspected causes, or desired verdicts. The repository's historical records may be consulted only if required to resolve a direct fact in the approved gate.

## Return contract

Return:

- Decision, critic ID, independence mechanism/limitations, and `fork_turns=none`.
- Mutation sentinel: the full-repository fingerprint before and after; clean must be true.
- Largest material gap first, with evidence, severity, confidence, affected criteria, and reproduction.
- Each criterion ID and PASS/FAIL/NOT_RUN/BLOCKED/INVALID/STALE with observed result.
- Missing evidence and any secondary material gaps.
