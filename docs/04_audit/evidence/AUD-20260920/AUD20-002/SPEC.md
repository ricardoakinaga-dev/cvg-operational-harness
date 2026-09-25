# AUD20-002 — SPEC

## Contract

- program: `AUD-20260920-REAUDIT`;
- run: `aud20-20260920-w1`;
- task: `AUD20-002`;
- gate: `G20-1` authorized; `G20-2` remains closed until `AUD20-004` and its
  negative controls are complete;
- source: `docs/02_spec/aaa_quality_contract.md` §9.1 and finding `A20-F02`;
- scope: local synthetic repository only; no PostgreSQL service, provider,
  browser, credential, pilot or production action.

## Problem

The Vitest gate accepts `80/80/80/80`, while the frozen contract requires
statements, lines and functions `>=90%`, branches `>=85%`, and branches in
critical modules `>=95%`. The current evidence is `87.46/87.99/89.55/81.86`
and has no auditable critical-module aggregation or selected mutation guard.

## Required behavior

1. The configured global unit-coverage thresholds are normative and fail the
   command when any global floor is missed.
2. The critical-module denominator is declared in a versioned manifest and is
   aggregated from raw coverage data, not from a hand-written percentage.
3. Critical branch coverage is checked at `>=95%` for kernel, approval, policy,
   journal, channel and the deterministic RLS inventory/preflight surface;
   PostgreSQL-only execution remains a separate gate and is never represented
   as executed by this task.
4. A selected mutation guard declares each mutation, applies it only to a
   disposable copy, runs the mapped focused test, and fails if a selected
   mutation survives.
5. Lowering a global or critical threshold, deleting a critical source from
   the manifest, or reporting a forged metric fails verification.
6. Existing historical certification and unrelated worktree changes remain
   untouched.

## Planned files

- `vitest.config.mts`: raise the global floors without adding exclusions;
- `scripts/critical-coverage.mjs`: derive critical metrics from raw coverage;
- `scripts/mutation-guard.mjs`: run the selected disposable mutation matrix;
- `scripts/phase10-certify.mjs` and `scripts/lib/certification-rules.mjs`:
  collect and verify the new evidence;
- `scripts/phase10-verify.mjs`: negative controls for reduced thresholds,
  missing critical entries, forged metrics and surviving mutations;
- `package.json`: expose deterministic local commands;
- `docs/04_audit/evidence/AUD-20260920/AUD20-002/`: task evidence.

## Acceptance

- `npm run test:coverage` enforces the four global floors;
- the critical report contains all declared groups, raw file counts, weighted
  branch totals and `>=95%` for every group;
- the selected mutation matrix is complete and all mutations are killed;
- reduced-threshold, manifest-tamper and surviving-mutant controls fail;
- focused tests, typecheck, lint, format and `git diff --check` pass;
- raw logs, reports, hashes, limitations and the next gap are recorded.

## Non-goals

- no attempt to claim the full G20-2 gate before `AUD20-003` and `AUD20-004`;
- no real PostgreSQL execution or external integration;
- no threshold reduction or denominator manipulation to obtain PASS.
