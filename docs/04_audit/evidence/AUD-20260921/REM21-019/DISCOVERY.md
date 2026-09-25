# REM21-019 — DISCOVERY

Date: 2026-09-22  
Scope: local, synthetic, disposable (`G21-1`)  
Production: `NO_GO`

## Objective and authority

This task executes the candidate-wide bar defined in
`docs/03_build/0338_codex_full_remediation_prompt.md` after `REM21-001`–`018`.
The backlog entry is `REM21-019` in
`docs/03_build/0337_comprehensive_remediation_backlog.md`. The current A21
source is `docs/04_audit/0566_comprehensive_repository_audit_2026-09-21.md`.

No real provider, channel, IdP, credential, patient record, production
database, clinical action, financial action or appointment action is in scope.
The existing `.gauntlet/` AUD20 state is preserved.

## Current candidate and execution surface

- Toolchain available: Node `v22.23.2`, npm `10.9.8`; the repository engine is
  `>=22 <23`.
- Docker is available locally (`29.1.3`); Firefox is installed. `psql`,
  `pg_dump`, `pg_restore` and a system Chromium binary are not available.
- No `TEST_DATABASE_URL` is present at discovery time. A disposable local
  PostgreSQL 16 container is therefore required before the PostgreSQL bar.
- The repository is intentionally dirty from the remediation chain. The
  candidate contract includes tracked and untracked product/config files, but
  excludes audit evidence, certification outputs, `.gauntlet/` state and the
  operational ledgers (`docs/20_master_execution_log.md`,
  `docs/30_backlog_master.md`, `docs/99_runtime_state.md` and the remediation
  backlog). The dirty state must be recorded, not hidden.
- `scripts/ci-bar.mjs` is the broader executable bar: runtime/install,
  readiness, format, typecheck, lint, build, unit, coverage, critical
  coverage, mutation, skip governance, worker startup, PostgreSQL,
  PostgreSQL proof, observability proof, phase 2/3/4A, chaos, evals, load,
  restore, docs, E2E, browser proof, image, SBOM, licenses, security,
  certification, offline verification, diff and artifact binding.
- `scripts/phase10-certify.mjs` independently records the Phase 10 candidate,
  run, raw gate logs and derived findings. Its required local gate list does
  not itself include the runtime-image and the REM21 proof gates, so the
  `ci-bar` run is the controlling execution wrapper for this task.

## Finding re-audit discovery

The existing `scripts/lib/finding-governance.mjs` correctly parses all 26 A21
IDs and binds the materialized snapshot to source hash, candidate and run, but
currently creates every finding with `status: OPEN`. That is safe for detecting
stale/manual reports, but it cannot represent the local closure evidence from
`REM21-001`–`018`; a full run would therefore report the old 11 P0 and 1 P1
blockers even when the corresponding controlled proof exists.

The REM21-002 SPEC already names the required shape: an optional closure
registry must be bound to the same source hash, candidate and run and must
validate referenced evidence hashes. REM21-019 must complete that missing
reaudit contract before the freeze. The registry must preserve unresolved
external/production limitations instead of converting them into a release
claim.

The provisional re-audit classification is:

- local closure candidates: `A21-F01`–`F04`, `F07`–`F11`, `F12`–`F19`,
  `F21`–`F26`, each only to the extent proved by the corresponding REM21
  evidence;
- external/production constrained: `A21-F05`, `A21-F06` and the production
  portions of `F07`, `F12` and `F16`; these remain outside any production GO;
- independent-review blocker: `A21-F20` remains open until a valid fresh I1
  review exists. It is P2, but it still prevents final certification under
  the task bar.

This classification is a discovery hypothesis, not yet a closure decision.
The PRD/SPEC below require exact evidence references and fail-closed rejection
of missing, stale, mismatched or tampered closure data.

## Design boundary

No visual surface changes are required. The design-director review therefore
records the boundary only: this is a backend/control-plane/evidence task, with
no UI, responsive, asset or interaction redesign authority.

## Discovery gate

`DISCOVERY_COMPLETE` is satisfied for local planning. BUILD is not authorized
until the PRD and SPEC are recorded, the runtime/backlog ledgers point to this
task, and the closure/quality bar is approved in the next artifact.
