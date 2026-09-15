# CVG Operational Harness — Phase 2 AAA-21 pre-flight (historical baseline)

> This snapshot was captured before AAA-21-R2 obtained a disposable
> PostgreSQL authority. It remains the pre-implementation baseline; current
> verification is recorded in `FINAL_RETEST.md` and
> `evidence/AAA-21-R2_REPAIR.md`.

## Capture

- Captured: 2026-09-13T20:01:08-03:00, before Phase 2 implementation.
- Base commit and current HEAD at capture: 512bc11e80fbf7c7b8baf6263aacc811ff829309.
- Worktree: dirty before this Phase, with unrelated brownfield, audit, production-planning, and Phase 0/1 changes preserved.
- Exact status snapshot: [PRE_FLIGHT_STATUS.txt](PRE_FLIGHT_STATUS.txt).
- Tracked worktree diff: 6998cebb06a50f781254a73c1d27c12165d1b2fccd8db1dca135973ed989e3ef.
- Staged/index diff: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
- Raw tracked diff capture: /tmp/cvg-phase2-preflight-tracked.diff (684275 bytes, SHA-256 equal to the tracked worktree diff above).
- No reset, checkout, clean, push, deployment, or external action was performed.

## Existing state that is not overwritten

The repository already contained .gauntlet/ state for a different historical
root (/home/ricardo/cvg-agent-secretary-v2) and a different HEAD
(0674f0a60f64e6e4029496435bba5ac36800ca9d). That run is stale for this
candidate and remains untouched. AAA-21 evidence is kept under docs/phase2/
with a separate candidate identity.

## Scope and safety

This execution is limited to the copied CVG Operational Harness. All providers,
channels, tenants, tools, model responses, and effects used for certification
must be synthetic or local test fixtures. The Secretary product copy, real
clinical/financial data, real channels, production deployment, and unrestricted
side effects are out of scope and remain NO-GO.

## Baseline commands captured before implementation

- npm run typecheck: PASS, exit 0.
- npm run lint: PASS, exit 0.
- npm run build: PASS, exit 0.
- npm run test:evals: PASS, 1 file / 8 tests.
- npm test: FAIL, baseline envelope recorded in BASELINE.md.
- PostgreSQL: ENVIRONMENT_BLOCKED. Docker client exists, but the Docker server
  socket denied access; no local PostgreSQL process or TEST_DATABASE_URL was
  available. This is not converted to PASS.

## Entry gate

The build may proceed only against the frozen Phase 2 bar in
QUALITY_BAR.md, with the pre-existing failures classified in
BASELINE_DEBT_REGISTER.md. The first implementation slice must be a neutral
execution envelope and durable-state contract, followed by a real public
HTTP-to-worker proof where the environment permits.
