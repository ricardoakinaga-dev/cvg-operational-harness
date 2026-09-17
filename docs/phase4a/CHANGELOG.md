# Phase 4A changelog — AAA-4A

## 2026-09-17 — controlled build

- Preserved the exact 16-part user prompt and per-part hashes.
- Registered a fresh controlled Gauntlet run and verified the Phase 4 entry
  handoff before implementation.
- Added the optional generic conversation package with bounded state,
  interpretation, planning, composition, handoff, stores and delivery.
- Added additive PostgreSQL migration `0020_conversation_intelligence.sql`.
- Added synthetic Service Desk and Knowledge Assistant consumers.
- Added 15 golden cases with paraphrase/mutation variants, 15 multi-turn
  trajectories, adversarial tests, public Harness integration and a
  disposable PostgreSQL test covering RLS, contention, recovery and fencing.
- Added repeatable demo/verification scripts and candidate-bound evidence
  generation.
- Kept production and real effects `NO_GO`.

Historical Phase 4 and pre-existing repository changes remain preserved in
their original locations.
